import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/requerimientos/[id]/aprobar
// Aprueba UN item de requerimiento. La vía principal hoy es /aprobar-lote
// (que aprueba todos los items de un nro_req juntos); este endpoint queda
// para callers legacy que aprueban item por item.
//
// Body opcional: { precio_estimado?: number, moneda?: string }
//   Si se proveen, se setean en precio_unitario/moneda del item ANTES de
//   aprobarlo (todo en la misma transacción). Útil para que el aprobador
//   registre el costo estimado al momento de aprobar.
//
// Permiso: cualquier usuario autenticado (decisión del usuario, 2026-05-27).
export async function POST(req: NextRequest, ctx: Ctx) {
  const token = await getToken({ req });
  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const { id } = await ctx.params;
    const usuario = (await getAuditUser(req)) ?? "sistema";

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

    const current = await prisma.oTRepuesto.findUnique({
      where: { id: Number(id) },
      select: {
        status_requerimiento_codigo: true,
        ot_id: true,
        orden_trabajo_interna_id: true,
        nro_req: true,
      },
    });
    if (!current) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (current.status_requerimiento_codigo !== "SIN_APROBACION") {
      return NextResponse.json({
        error: `Solo se puede aprobar desde SIN_APROBACION. Estado actual: ${current.status_requerimiento_codigo}`,
      }, { status: 409 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const r = await tx.oTRepuesto.update({
        where: { id: Number(id) },
        data: {
          status_requerimiento_codigo: "APROBADO",
          usuario_aprueba: usuario,
          fecha_aprobacion: new Date(),
          status_cotizacion_codigo: "PEND_COT", // arranca el flujo de cotización
          // Solo actualiza precio/moneda si vinieron en el body.
          ...(precioEstimado != null ? { precio_unitario: precioEstimado } : {}),
          ...(monedaEstimado ? { moneda: monedaEstimado } : {}),
          comentario_aprobacion: comentario || null,
          descripcion_aprobacion: descripcion || null,
          detalle_aprobacion: detalle || null,
        },
      });
      // Historial polimórfico (OT externa o interna).
      const baseDesc = precioEstimado != null
        ? `Requerimiento ${current.nro_req ?? id} aprobado (precio estimado: ${monedaEstimado ?? "USD"} ${precioEstimado.toFixed(2)})`
        : `Requerimiento ${current.nro_req ?? id} aprobado`;
      const piezas = [
        descripcion ? `Desc: ${descripcion}` : null,
        detalle ? `Detalle: ${detalle}` : null,
        comentario || null,
      ].filter(Boolean);
      await tx.oTHistorial.create({
        data: {
          ot_id: current.ot_id,
          orden_trabajo_interna_id: current.orden_trabajo_interna_id,
          tipo_operacion: "Otro",
          descripcion: piezas.length > 0 ? `${baseDesc} — ${piezas.join(" · ")}` : baseDesc,
          usuario,
        },
      });
      return r;
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("POST aprobar error:", error);
    return NextResponse.json({ error: "Error al aprobar" }, { status: 500 });
  }
}
