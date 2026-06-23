import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";

import { parseInt4Safe } from "@/lib/ot-formato";
type Params = { params: Promise<{ id: string }> };

// POST /api/compras/[id]/anular
// Anula (rechaza) una OC. Permitido desde:
//   - PEND_OC (sin aceptar todavía) → caso típico desde /aprobaciones
//   - PROCESO (aceptada pero aún sin recibir) → caso excepcional
// NO se permite anular si la OC ya está en ENTREGADO, COMPLETO o INCOMPLETO
// (porque ya hay movimientos de inventario que habría que revertir).
//
// Body: { motivo?: string }
// Side effects:
//   - status_oc_codigo de la Compra → "ANULADO"
//   - status_oc_codigo de los OTRepuestos vinculados (po_id = this.id) → "ANULADO"
//   - Entrada en OTHistorial por cada OT afectada (externa + interna).
const ESTADOS_ANULABLES = new Set(["PEND_OC", "PROCESO"]);

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
    const body = await req.json().catch(() => ({}));
    const motivo = typeof body?.motivo === "string" ? body.motivo.trim() : "";
    const descripcionAprob = typeof body?.descripcion === "string" ? body.descripcion.trim().slice(0, 300) : "";
    const detalleAprob = typeof body?.detalle === "string" ? body.detalle.trim() : "";

    const result = await prisma.$transaction(async (tx) => {
      const compra = await tx.compra.findUnique({
        where: { id: compraId },
        select: { id: true, numero_po: true, status_oc_codigo: true },
      });
      if (!compra) {
        throw Object.assign(new Error("Compra no encontrada"), { status: 404 });
      }
      if (!compra.status_oc_codigo || !ESTADOS_ANULABLES.has(compra.status_oc_codigo)) {
        throw Object.assign(
          new Error(`No se puede anular una OC en estado ${compra.status_oc_codigo ?? "—"}. Solo se permite desde PEND_OC o PROCESO.`),
          { status: 400 },
        );
      }

      // Anular la OC + sus items vinculados. Persistimos también descripción
      // + detalle de aprobación (los 3 campos del modal de rechazo).
      const actualizada = await tx.compra.update({
        where: { id: compraId },
        data: {
          status_oc_codigo: "ANULADO",
          usuario_aprueba: usuario,
          comentario_aprobacion: motivo || null,
          descripcion_aprobacion: descripcionAprob || null,
          detalle_aprobacion: detalleAprob || null,
        },
      });
      await tx.oTRepuesto.updateMany({
        where: { po_id: compraId },
        data: { status_oc_codigo: "ANULADO" },
      });

      // Historial por cada OT afectada (externas + internas).
      const otsExternas = await tx.oTRepuesto.findMany({
        where: { po_id: compraId, ot_id: { not: null } },
        select: { ot_id: true },
        distinct: ["ot_id"],
      });
      const otsInternas = await tx.oTRepuesto.findMany({
        where: { po_id: compraId, orden_trabajo_interna_id: { not: null } },
        select: { orden_trabajo_interna_id: true },
        distinct: ["orden_trabajo_interna_id"],
      });
      const piezas = [
        descripcionAprob ? `Desc: ${descripcionAprob}` : null,
        detalleAprob ? `Detalle: ${detalleAprob}` : null,
        motivo || null,
      ].filter(Boolean);
      const descripcion = piezas.length > 0
        ? `OC ${compra.numero_po} ANULADA por ${usuario} — ${piezas.join(" · ")}`
        : `OC ${compra.numero_po} ANULADA por ${usuario}`;
      const datosAdicionales = JSON.stringify({
        po_id: compraId,
        numero_po: compra.numero_po,
        accion: "ANULAR_OC",
        motivo: motivo || null,
        descripcion: descripcionAprob || null,
        detalle: detalleAprob || null,
      });
      for (const { ot_id } of otsExternas) {
        if (ot_id == null) continue;
        await tx.oTHistorial.create({
          data: { ot_id, tipo_operacion: "Otro", descripcion, usuario, datos_adicionales: datosAdicionales },
        });
      }
      for (const { orden_trabajo_interna_id } of otsInternas) {
        if (orden_trabajo_interna_id == null) continue;
        await tx.oTHistorial.create({
          data: { orden_trabajo_interna_id, tipo_operacion: "Otro", descripcion, usuario, datos_adicionales: datosAdicionales },
        });
      }

      return actualizada;
    });

    return NextResponse.json({ data: result, message: "OC anulada" });
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err?.status) {
      return NextResponse.json({ error: err.message ?? "Error" }, { status: err.status });
    }
    console.error("POST /api/compras/[id]/anular error:", error);
    return NextResponse.json({ error: "Error al anular OC" }, { status: 500 });
  }
}
