import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";

import { parseInt4Safe } from "@/lib/ot-formato";
type Params = { params: Promise<{ id: string }> };

// POST /api/compras/[id]/aceptar
// Acepta una OC en estado PEND_OC y la pasa a PROCESO.
// Registra el usuario que acepta en `usuario_aprueba` y deja traza
// en OTHistorial de cada OT vinculada.
//
// Permiso: cualquier usuario autenticado (decisión del usuario, 2026-05-27).
// El nombre del aprobador queda registrado en `usuario_aprueba` y en OTHistorial.
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

      const actualizada = await tx.compra.update({
        where: { id: compraId },
        data: {
          status_oc_codigo: "PROCESO",
          usuario_aprueba: usuario,
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

      return actualizada;
    });

    return NextResponse.json({ data: result, message: "OC aceptada" });
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err?.status) {
      return NextResponse.json({ error: err.message ?? "Error" }, { status: err.status });
    }
    console.error("POST /api/compras/[id]/aceptar error:", error);
    return NextResponse.json({ error: "Error al aceptar OC" }, { status: 500 });
  }
}
