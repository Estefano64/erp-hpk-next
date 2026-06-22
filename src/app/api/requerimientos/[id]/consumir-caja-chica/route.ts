import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recalcularRecursosStatusDesdeRep } from "@/lib/recursos-ot";

type Params = { params: Promise<{ id: string }> };

const Schema = z.object({
  // Monto unitario (opcional): si viene, actualiza precio_unitario del req.
  // Útil para reflejar el costo real pagado por caja chica vs el estimado.
  monto_unitario: z.coerce.number().min(0).optional().nullable(),
  moneda: z.string().trim().max(10).optional().nullable(),
  proveedor: z.string().trim().max(200).optional().nullable(),
  comprobante: z.string().trim().max(100).optional().nullable(),
  usuario: z.string().trim().optional().nullable(),
  observacion: z.string().trim().max(500).optional().nullable(),
});

// POST /api/requerimientos/[id]/consumir-caja-chica
//
// Cierra el requerimiento porque se compró el ítem con caja chica (efectivo
// del fondo fijo). NO crea OC, NO toca stock catálogo, NO genera movimiento
// de inventario. Simplemente marca el req como ENTREGADO inmediatamente y
// deja la trazabilidad en observaciones + historial.
//
// Funciona para items con material (MAC) o sin material (CAD/libre): la
// caja chica suele usarse para cargos directos puntuales que no pasan por
// el catálogo formal.
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const usuario = parsed.data.usuario || "Logistica";

    const result = await prisma.$transaction(async (tx) => {
      const rep = await tx.oTRepuesto.findUnique({ where: { id: Number(id) } });
      if (!rep) throw Object.assign(new Error("Requerimiento no encontrado"), { code: "NOT_FOUND" });
      if (rep.status_oc_codigo === "ENTREGADO") {
        throw Object.assign(new Error("Este requerimiento ya está entregado."), { code: "YA_ENTREGADO" });
      }
      if (rep.status_oc_codigo === "ANULADO" || rep.status_requerimiento_codigo === "ANULADO") {
        throw Object.assign(new Error("No se puede consumir un requerimiento anulado."), { code: "ANULADO" });
      }
      if (rep.po_id != null) {
        throw Object.assign(
          new Error("Este requerimiento ya está vinculado a una OC. Anulá la OC primero si querés pagarlo con caja chica."),
          { code: "TIENE_OC" },
        );
      }

      // Detalle del comprobante / proveedor para la trazabilidad.
      const partes: string[] = [];
      if (parsed.data.proveedor) partes.push(`prov.: ${parsed.data.proveedor}`);
      if (parsed.data.comprobante) partes.push(`comp.: ${parsed.data.comprobante}`);
      const monto = parsed.data.monto_unitario;
      const moneda = parsed.data.moneda || rep.moneda || "PEN";
      if (monto != null) {
        const cant = Number(rep.cantidad ?? 0);
        partes.push(`${moneda} ${monto.toFixed(2)}/u × ${cant} = ${moneda} ${(monto * cant).toFixed(2)}`);
      }
      if (parsed.data.observacion) partes.push(parsed.data.observacion);
      const obsPrev = rep.observaciones ? `${rep.observaciones}\n` : "";
      const fechaStr = new Date().toLocaleDateString("es-PE");
      const obsNueva = `${obsPrev}Pagado con CAJA CHICA el ${fechaStr} (${usuario})${partes.length ? " — " + partes.join(" · ") : ""}`;

      const updateData: Prisma.OTRepuestoUncheckedUpdateInput = {
        // Cierre inmediato: caja chica = pagado + recibido + entregado al técnico
        // en un solo paso (decisión del user). No pasa por despacho.
        status_oc_codigo: "ENTREGADO",
        status_requerimiento_codigo: "APROBADO",
        cantidad_recibida: rep.cantidad,
        fecha_entrega_real: new Date(),
        fecha_salida_almacen: new Date(),
        observaciones: obsNueva,
      };
      if (monto != null) {
        updateData.precio_unitario = new Prisma.Decimal(monto);
        updateData.moneda = moneda;
      }
      const updated = await tx.oTRepuesto.update({ where: { id: rep.id }, data: updateData });

      await tx.oTHistorial.create({
        data: {
          ot_id: rep.ot_id,
          orden_trabajo_interna_id: rep.orden_trabajo_interna_id,
          tipo_operacion: "CONSUMO_CAJA_CHICA",
          descripcion: `Caja chica — REQ ${rep.nro_req ?? rep.id} item ${rep.item_req ?? "-"}: ${rep.descripcion ?? rep.material_codigo ?? "—"}${monto != null ? ` (${moneda} ${monto.toFixed(2)}/u)` : ""}${parsed.data.proveedor ? ` · prov. ${parsed.data.proveedor}` : ""}`,
          usuario,
          datos_adicionales: JSON.stringify({
            requerimiento_id: rep.id,
            monto_unitario: monto ?? null,
            moneda,
            proveedor: parsed.data.proveedor ?? null,
            comprobante: parsed.data.comprobante ?? null,
            cantidad: Number(rep.cantidad),
          }),
        },
      });

      // Auto-update del estado de recursos de la OT (el user pidió que
      // refleje el avance de logística sin intervención manual).
      await recalcularRecursosStatusDesdeRep(tx, rep);
      return updated;
    });

    return NextResponse.json({ data: result, message: "Requerimiento cerrado con caja chica" });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === "NOT_FOUND") return NextResponse.json({ error: err.message }, { status: 404 });
    if (err.code === "YA_ENTREGADO" || err.code === "ANULADO" || err.code === "TIENE_OC") {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("POST /api/requerimientos/[id]/consumir-caja-chica error:", e);
    return NextResponse.json({ error: "Error al procesar caja chica" }, { status: 500 });
  }
}
