import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { recalcularRecursosStatusDesdeRep } from "@/lib/recursos-ot";
import { montoEnUSD } from "@/lib/aprobacion-montos";
import { firmarNiveles, errorNivelNoAutorizado } from "@/lib/liberacion";

import { parseInt4Safe } from "@/lib/ot-formato";
type Ctx = { params: Promise<{ id: string }> };

// POST /api/requerimientos/[id]/aprobar
// Liberación multi-nivel (esquema A/B/C, 2026-08-11): el item se clasifica
// por monto (≤ US$5,000 → nivel A; más → A+B secuencial). Cada llamada firma
// el/los niveles que le correspondan al usuario; el item pasa a APROBADO
// recién cuando TODOS los niveles requeridos están firmados — mientras tanto
// sigue en SIN_APROBACION con firmas parciales en `liberacion_codigo`.
//
// Body opcional: { precio_estimado?: number, moneda?: string }
//   Si se proveen, se setean en precio_unitario/moneda del item en la misma
//   transacción (y la clasificación usa ese monto).
export async function POST(req: NextRequest, ctx: Ctx) {
  const token = await getToken({ req });
  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const { id } = await ctx.params;
    const usuario = (await getAuditUser(req)) ?? "sistema";
    const roles = (token.roles as string[] | undefined) ?? [];

    // Body con precio estimado + 3 campos de aprobación (todos opcionales):
    //   comentario   ≤500  → nota breve (la que ya existía)
    //   descripcion  ≤300  → resumen corto (etiqueta en listados)
    //   detalle      texto → motivo/contexto largo
    let precioEstimado: number | null = null;
    let monedaEstimado: string | null = null;
    let comentario = "";
    let descripcion = "";
    let detalle = "";
    try {
      const body = (await req.json()) as {
        precio_estimado?: unknown; moneda?: unknown;
        comentario?: unknown; descripcion?: unknown; detalle?: unknown;
      };
      if (typeof body?.precio_estimado === "number" && Number.isFinite(body.precio_estimado) && body.precio_estimado >= 0) {
        precioEstimado = body.precio_estimado;
      }
      if (typeof body?.moneda === "string" && body.moneda.trim().length > 0) {
        monedaEstimado = body.moneda.trim().slice(0, 10);
      }
      if (typeof body?.comentario === "string") comentario = body.comentario.trim().slice(0, 500);
      if (typeof body?.descripcion === "string") descripcion = body.descripcion.trim().slice(0, 300);
      if (typeof body?.detalle === "string") detalle = body.detalle.trim();
    } catch {
      // Body inválido / vacío: seguimos con valores por defecto.
    }

    const itemId = parseInt4Safe(id) ?? 0;
    const current = await prisma.oTRepuesto.findUnique({
      where: { id: itemId },
      select: {
        status_requerimiento_codigo: true,
        ot_id: true,
        orden_trabajo_interna_id: true,
        nro_req: true,
        cantidad: true,
        precio_unitario: true,
        moneda: true,
      },
    });
    if (!current) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (current.status_requerimiento_codigo !== "SIN_APROBACION") {
      return NextResponse.json({
        error: `Solo se puede aprobar desde SIN_APROBACION. Estado actual: ${current.status_requerimiento_codigo}`,
      }, { status: 409 });
    }
    // Clasificación por monto (Werteschema). Si el body trae precio estimado,
    // se usa ese (es el que quedará registrado en el item).
    const precioTope = precioEstimado ?? Number(current.precio_unitario ?? 0);
    const monedaTope = monedaEstimado ?? current.moneda;
    const montoUSD = montoEnUSD((Number.isFinite(precioTope) ? precioTope : 0) * Number(current.cantidad ?? 0), monedaTope);

    const resultado = await prisma.$transaction(async (tx) => {
      const firma = await firmarNiveles(tx, {
        tipo: "REQ",
        otRepuestoId: itemId,
        montoUSD,
        roles,
        usuario,
        comentario: comentario || null,
      });
      if (firma.firmadosAhora.length === 0 && !firma.estado.liberado) {
        throw Object.assign(new Error(errorNivelNoAutorizado("REQ", firma.estado, montoUSD)), { status: 403 });
      }

      const liberado = firma.estado.liberado;
      const r = await tx.oTRepuesto.update({
        where: { id: itemId },
        data: {
          // Precio/moneda se persisten en cada firma para que los niveles
          // siguientes clasifiquen con el mismo monto que ve este aprobador.
          ...(precioEstimado != null ? { precio_unitario: precioEstimado } : {}),
          ...(monedaEstimado ? { moneda: monedaEstimado } : {}),
          ...(liberado
            ? {
                status_requerimiento_codigo: "APROBADO",
                usuario_aprueba: usuario, // último firmante = quien libera
                fecha_aprobacion: new Date(),
                status_cotizacion_codigo: "PEND_COT", // arranca el flujo de cotización
                comentario_aprobacion: comentario || null,
                descripcion_aprobacion: descripcion || null,
                detalle_aprobacion: detalle || null,
              }
            : {}),
        },
      });

      // Historial polimórfico (OT externa o interna).
      const ref = `Requerimiento ${current.nro_req ?? id}`;
      const piezas = [
        descripcion ? `Desc: ${descripcion}` : null,
        detalle ? `Detalle: ${detalle}` : null,
        comentario || null,
      ].filter(Boolean);
      const baseDesc = liberado
        ? (precioEstimado != null
            ? `${ref} aprobado — liberación ${firma.estado.requeridos.join("→") || "auto"} completa (precio estimado: ${monedaEstimado ?? "USD"} ${precioEstimado.toFixed(2)})`
            : `${ref} aprobado — liberación ${firma.estado.requeridos.join("→") || "auto"} completa`)
        : `${ref}: código(s) de liberación ${firma.firmadosAhora.join(", ")} firmado(s) — pendiente(s): ${firma.estado.pendientes.join(", ")}`;
      await tx.oTHistorial.create({
        data: {
          ot_id: current.ot_id,
          orden_trabajo_interna_id: current.orden_trabajo_interna_id,
          tipo_operacion: "Otro",
          descripcion: piezas.length > 0 ? `${baseDesc} — ${piezas.join(" · ")}` : baseDesc,
          usuario,
        },
      });
      // La etapa de recursos solo se mueve con la liberación completa.
      if (liberado) {
        await recalcularRecursosStatusDesdeRep(tx, {
          ot_id: current.ot_id,
          orden_trabajo_interna_id: current.orden_trabajo_interna_id,
        });
      }
      return { r, firma };
    });

    const { estado } = resultado.firma;
    return NextResponse.json({
      data: resultado.r,
      liberacion: {
        liberado: estado.liberado,
        requeridos: estado.requeridos,
        firmados: estado.firmados,
        pendientes: estado.pendientes,
        firmados_ahora: resultado.firma.firmadosAhora,
      },
      message: estado.liberado
        ? "Requerimiento aprobado (liberación completa)."
        : `Nivel ${resultado.firma.firmadosAhora.join(", ")} liberado — pendiente: ${estado.pendientes.join(", ")}.`,
    });
  } catch (error) {
    const err = error as { status?: number; message?: string };
    if (err?.status) {
      return NextResponse.json({ error: err.message ?? "Error" }, { status: err.status });
    }
    console.error("POST aprobar error:", error);
    return NextResponse.json({ error: "Error al aprobar" }, { status: 500 });
  }
}
