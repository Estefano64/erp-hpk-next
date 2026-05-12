import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser, isAdmin } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

// POST /api/compras/[id]/aceptar
// Acepta una OC en estado PEND_OC y la pasa a PROCESO.
// Registra el usuario que acepta en `usuario_aprueba` y deja traza
// en OTHistorial de cada OT vinculada.
export async function POST(req: NextRequest, { params }: Params) {
  try {
    if (!(await isAdmin(req))) {
      return NextResponse.json({ error: "Solo administradores pueden aceptar OC." }, { status: 403 });
    }
    const usuario = (await getAuditUser(req)) ?? "sistema";
    const { id } = await params;
    const compraId = Number(id);
    if (!Number.isFinite(compraId)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const compra = await tx.compra.findUnique({
        where: { id: compraId },
        select: { id: true, numero_po: true, status_oc_codigo: true },
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

      const actualizada = await tx.compra.update({
        where: { id: compraId },
        data: { status_oc_codigo: "PROCESO", usuario_aprueba: usuario },
      });

      // Promueve items que aún estuviesen en PEND_OC (defensivo: crear-oc ya los pone en PROCESO).
      await tx.oTRepuesto.updateMany({
        where: { po_id: compraId, status_oc_codigo: "PEND_OC" },
        data: { status_oc_codigo: "PROCESO" },
      });

      // Historial por cada OT vinculada
      const otsAfectadas = await tx.oTRepuesto.findMany({
        where: { po_id: compraId },
        select: { ot_id: true },
        distinct: ["ot_id"],
      });
      for (const { ot_id } of otsAfectadas) {
        await tx.oTHistorial.create({
          data: {
            ot_id,
            tipo_operacion: "Otro",
            descripcion: `OC ${compra.numero_po} aceptada por ${usuario}`,
            usuario,
            datos_adicionales: JSON.stringify({ po_id: compraId, numero_po: compra.numero_po, accion: "ACEPTAR_OC" }),
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
