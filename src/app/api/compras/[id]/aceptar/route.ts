import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { recalcularRecursosStatusOT, recalcularRecursosStatusOTInterna } from "@/lib/recursos-ot";
import { montoEnUSD, nivelesRequeridosOC, tieneAlgunNivel, fmtUSD } from "@/lib/aprobacion-montos";
import { firmarNiveles, errorNivelNoAutorizado } from "@/lib/liberacion";
import { hoyEnLima } from "@/lib/dates";

import { parseInt4Safe } from "@/lib/ot-formato";
type Params = { params: Promise<{ id: string }> };

// POST /api/compras/[id]/aceptar
// Liberación multi-nivel (esquema A/B/C, 2026-08-11): la OC se clasifica por
// su total en USD (Werteschema) y cada llamada firma el/los códigos de
// liberación que le correspondan al usuario, en orden secuencial:
//   < $1,000            autoliberación (elaborador o cualquier nivel)
//   $1,000 – 2,500      A (Supervisor de Compras)
//   $2,500 – 5,000      A → B (Gerente de Compras)
//   > $5,000            A → B → C (Director Financiero)
// La OC pasa a PROCESO recién cuando todos los niveles requeridos firmaron;
// mientras tanto sigue en PEND_OC con firmas parciales en `liberacion_codigo`.
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const token = await getToken({ req });
    if (!token) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const usuario = (await getAuditUser(req)) ?? "sistema";
    const { id } = await params;
    const compraId = parseInt4Safe(id) ?? 0;
    if (compraId == null) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }
    // Campos opcionales al aceptar una OC:
    //   - descripcion: resumen corto (≤300, etiqueta en listados)
    //   - detalle:     texto largo (motivo, instrucciones, contexto)
    //   - comentario:  nota breve (≤500, la que ya existía)
    // Si vienen valores se persisten en la fila + se incluyen en el historial.
    const body = await req.json().catch(() => ({}));
    const comentario = typeof body?.comentario === "string" ? body.comentario.trim() : "";
    const descripcion = typeof body?.descripcion === "string" ? body.descripcion.trim().slice(0, 300) : "";
    const detalle = typeof body?.detalle === "string" ? body.detalle.trim() : "";

    const result = await prisma.$transaction(async (tx) => {
      const compra = await tx.compra.findUnique({
        where: { id: compraId },
        select: {
          id: true,
          numero_po: true,
          status_oc_codigo: true,
          total: true,
          moneda_codigo: true,
          usuario_solicita: true,
          // Una OC puede tener items en CompraDetalle (creación manual) o en
          // OTRepuesto vía po_id (creación desde requerimientos aprobados).
          // Cualquiera de las dos cuenta como "tiene items".
          _count: { select: { detalles: true, ot_repuestos: true } },
        },
      });
      if (!compra) {
        throw Object.assign(new Error("Compra no encontrada"), { status: 404 });
      }
      if (compra.status_oc_codigo !== "PEND_OC") {
        throw Object.assign(
          new Error(`Solo se pueden aceptar OC en estado Pendiente (actual: ${compra.status_oc_codigo ?? "—"}).`),
          { status: 400 },
        );
      }
      // Una OC sin detalles ni reqs vinculados no se puede recibir.
      if (compra._count.detalles === 0 && compra._count.ot_repuestos === 0) {
        throw Object.assign(
          new Error("La OC no tiene items. Agregá al menos uno antes de aceptarla."),
          { status: 400 },
        );
      }

      // Clasificación por monto (Werteschema) + firma de niveles.
      const montoUSD = montoEnUSD(Number(compra.total ?? 0), compra.moneda_codigo);
      const roles = (token.roles as string[] | undefined) ?? [];
      const requeridos = nivelesRequeridosOC(montoUSD);
      let liberacion = null as Awaited<ReturnType<typeof firmarNiveles>> | null;
      if (requeridos.length === 0) {
        // Autoliberación < $1,000: el elaborador o quien tenga algún nivel.
        const esElaborador = compra.usuario_solicita === usuario;
        if (!esElaborador && !tieneAlgunNivel("OC", roles)) {
          throw Object.assign(
            new Error(`Una OC de hasta ${fmtUSD(1000)} la aprueba quien la elaboró o un aprobador designado.`),
            { status: 403 },
          );
        }
      } else {
        liberacion = await firmarNiveles(tx, {
          tipo: "OC",
          compraId,
          montoUSD,
          roles,
          usuario,
          comentario: comentario || null,
        });
        if (liberacion.firmadosAhora.length === 0 && !liberacion.estado.liberado) {
          throw Object.assign(new Error(errorNivelNoAutorizado("OC", liberacion.estado, montoUSD)), { status: 403 });
        }
      }
      const liberado = liberacion == null || liberacion.estado.liberado;

      // Firma parcial: la OC sigue PEND_OC — solo dejamos traza y salimos.
      if (!liberado) {
        const otsParciales = await tx.oTRepuesto.findMany({
          where: { po_id: compraId, ot_id: { not: null } },
          select: { ot_id: true },
          distinct: ["ot_id"],
        });
        const otsInternasParciales = await tx.oTRepuesto.findMany({
          where: { po_id: compraId, orden_trabajo_interna_id: { not: null } },
          select: { orden_trabajo_interna_id: true },
          distinct: ["orden_trabajo_interna_id"],
        });
        const descParcial =
          `OC ${compra.numero_po}: código(s) de liberación ${liberacion!.firmadosAhora.join(", ")} firmado(s) por ${usuario}` +
          ` — pendiente(s): ${liberacion!.estado.pendientes.join(", ")}`;
        const datosParcial = JSON.stringify({
          po_id: compraId,
          numero_po: compra.numero_po,
          accion: "LIBERAR_NIVEL_OC",
          niveles_firmados: liberacion!.firmadosAhora,
          pendientes: liberacion!.estado.pendientes,
          comentario: comentario || null,
        });
        for (const { ot_id } of otsParciales) {
          if (ot_id == null) continue;
          await tx.oTHistorial.create({
            data: { ot_id, tipo_operacion: "Otro", descripcion: descParcial, usuario, datos_adicionales: datosParcial },
          });
        }
        for (const { orden_trabajo_interna_id } of otsInternasParciales) {
          if (orden_trabajo_interna_id == null) continue;
          await tx.oTHistorial.create({
            data: { orden_trabajo_interna_id, tipo_operacion: "Otro", descripcion: descParcial, usuario, datos_adicionales: datosParcial },
          });
        }
        return { compra: null, liberacion };
      }

      const actualizada = await tx.compra.update({
        where: { id: compraId },
        data: {
          status_oc_codigo: "PROCESO",
          usuario_aprueba: usuario,
          // Fecha oficial de aprobacion de la OC. El PDF la usa como
          // "Fecha Emision" (antes usaba fecha_solicitud, que era la
          // fecha de creacion del draft y podia ser muy anterior).
          fecha_aprobacion: hoyEnLima(),
          // Persistimos los 3 campos también en la fila de la OC (no solo en
          // OTHistorial) — la UI los muestra en /requerimientos/detalle sin
          // tener que parsear el JSON del historial.
          comentario_aprobacion: comentario || null,
          descripcion_aprobacion: descripcion || null,
          detalle_aprobacion: detalle || null,
        },
      });

      // Promueve items que aún estuviesen en PEND_OC (defensivo: crear-oc ya los pone en PROCESO).
      await tx.oTRepuesto.updateMany({
        where: { po_id: compraId, status_oc_codigo: "PEND_OC" },
        data: { status_oc_codigo: "PROCESO" },
      });

      // Historial por cada OT vinculada. La OC puede haber agrupado items de
      // OT externas + OT internas; ambas dimensiones se loggean por separado.
      const otsExternasAfectadas = await tx.oTRepuesto.findMany({
        where: { po_id: compraId, ot_id: { not: null } },
        select: { ot_id: true },
        distinct: ["ot_id"],
      });
      const otsInternasAfectadas = await tx.oTRepuesto.findMany({
        where: { po_id: compraId, orden_trabajo_interna_id: { not: null } },
        select: { orden_trabajo_interna_id: true },
        distinct: ["orden_trabajo_interna_id"],
      });
      const piezasHist = [
        descripcion ? `Desc: ${descripcion}` : null,
        detalle ? `Detalle: ${detalle}` : null,
        comentario || null,
      ].filter(Boolean);
      const descripcionHist = piezasHist.length > 0
        ? `OC ${compra.numero_po} aceptada por ${usuario} — ${piezasHist.join(" · ")}`
        : `OC ${compra.numero_po} aceptada por ${usuario}`;
      const datosAdicionalesHist = JSON.stringify({
        po_id: compraId,
        numero_po: compra.numero_po,
        accion: "ACEPTAR_OC",
        comentario: comentario || null,
        descripcion: descripcion || null,
        detalle: detalle || null,
      });
      for (const { ot_id } of otsExternasAfectadas) {
        if (ot_id == null) continue;
        await tx.oTHistorial.create({
          data: {
            ot_id,
            tipo_operacion: "Otro",
            descripcion: descripcionHist,
            usuario,
            datos_adicionales: datosAdicionalesHist,
          },
        });
      }
      for (const { orden_trabajo_interna_id } of otsInternasAfectadas) {
        if (orden_trabajo_interna_id == null) continue;
        await tx.oTHistorial.create({
          data: {
            orden_trabajo_interna_id,
            tipo_operacion: "Otro",
            descripcion: descripcionHist,
            usuario,
            datos_adicionales: datosAdicionalesHist,
          },
        });
      }

      // Aceptar la OC (PEND_OC → PROCESO) mueve la etapa de recursos.
      for (const { ot_id } of otsExternasAfectadas) {
        if (ot_id != null) await recalcularRecursosStatusOT(tx, ot_id);
      }
      for (const { orden_trabajo_interna_id } of otsInternasAfectadas) {
        if (orden_trabajo_interna_id != null) await recalcularRecursosStatusOTInterna(tx, orden_trabajo_interna_id);
      }

      return { compra: actualizada, liberacion };
    });

    const est = result.liberacion?.estado ?? null;
    const liberadoFinal = result.compra != null;
    return NextResponse.json({
      data: result.compra,
      liberacion: est
        ? {
            liberado: est.liberado,
            requeridos: est.requeridos,
            firmados: est.firmados,
            pendientes: est.pendientes,
            firmados_ahora: result.liberacion!.firmadosAhora,
          }
        : { liberado: true, requeridos: [], firmados: [], pendientes: [], firmados_ahora: [] },
      message: liberadoFinal
        ? "OC aceptada"
        : `Nivel ${result.liberacion!.firmadosAhora.join(", ")} liberado — pendiente: ${est!.pendientes.join(", ")}.`,
    });
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err?.status) {
      return NextResponse.json({ error: err.message ?? "Error" }, { status: err.status });
    }
    console.error("POST /api/compras/[id]/aceptar error:", error);
    return NextResponse.json({ error: "Error al aceptar OC" }, { status: 500 });
  }
}
