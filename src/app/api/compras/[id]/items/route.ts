import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseDateOnly } from "@/lib/dates";

const IGV_PCT = new Prisma.Decimal("0.18");

const ItemSchema = z.object({
  id: z.coerce.number().int().positive().optional().nullable(),
  material_id: z.coerce.number().int().positive().optional().nullable(),
  material_codigo: z.string().trim().max(50).optional().nullable(),
  descripcion: z.string().trim().max(500).optional().nullable(),
  texto: z.string().trim().max(500).optional().nullable(),
  unidad_medida: z.string().trim().max(20).optional().nullable(),
  cantidad: z.coerce.number().min(0),
  precio_unitario: z.coerce.number().min(0).default(0),
  moneda: z.string().trim().max(10).optional().nullable(),
  fabricante_codigo: z.string().trim().max(50).optional().nullable(),
  fecha_entrega_esperada: z.string().optional().nullable(),
});

const Schema = z.object({
  items: z.array(ItemSchema),
  deleteIds: z.array(z.coerce.number().int().positive()).default([]),
  // Header-level (opcionales): si vienen, se persisten en la Compra.
  descuento: z.coerce.number().min(0).optional(),
  otros: z.coerce.number().min(0).optional(),
  numero_req: z.string().trim().max(50).nullable().optional(),
  tipo_pago: z.string().trim().max(30).nullable().optional(),
  dias_credito: z.coerce.number().int().min(0).max(365).nullable().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/compras/[id]/items
 * Edición tipo "Excel" de items de una OC: actualiza, agrega y elimina ot_repuestos
 * vinculados a esta compra. Recalcula totales de la compra al final.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const compraId = Number(id);
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const { items, deleteIds, descuento, otros, numero_req, tipo_pago, dias_credito } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const compra = await tx.compra.findUnique({
        where: { id: compraId },
        include: { ot_repuestos: { select: { id: true, ot_id: true } } },
      });
      if (!compra) throw Object.assign(new Error("Compra no encontrada"), { code: "NOT_FOUND" });
      if (compra.status_oc_codigo === "ANULADO") {
        throw Object.assign(new Error("No se puede editar una OC anulada"), { code: "ANULADO" });
      }

      // ot_id por defecto para items NUEVOS sin id (toma el primero de los existentes,
      // o el de la compra). Si no hay, error: necesitamos al menos un ot_id.
      const otIdDefault = compra.ot_repuestos[0]?.ot_id ?? compra.ot_id ?? null;
      const itemsIds = new Set(compra.ot_repuestos.map((r) => r.id));

      // 1) Eliminar
      const aEliminar = deleteIds.filter((dId) => itemsIds.has(dId));
      if (aEliminar.length > 0) {
        await tx.oTRepuesto.deleteMany({ where: { id: { in: aEliminar }, po_id: compraId } });
      }

      // 2) Update / create
      for (const it of items) {
        const fecha = parseDateOnly(it.fecha_entrega_esperada);
        if (it.id && itemsIds.has(it.id)) {
          // Update existente
          await tx.oTRepuesto.update({
            where: { id: it.id },
            data: {
              material_id: it.material_id ?? null,
              material_codigo: it.material_codigo ?? null,
              descripcion: it.descripcion ?? null,
              texto: it.texto ?? null,
              unidad_medida: it.unidad_medida ?? "UNIDAD",
              cantidad: new Prisma.Decimal(it.cantidad),
              precio_unitario: new Prisma.Decimal(it.precio_unitario),
              moneda: it.moneda ?? compra.moneda_codigo ?? "USD",
              fabricante_codigo: it.fabricante_codigo ?? null,
              fecha_entrega_esperada: fecha,
            },
          });
        } else {
          // Crear nuevo (necesita ot_id)
          if (!otIdDefault) {
            throw Object.assign(
              new Error("Para agregar items libres, la OC necesita al menos un item existente o estar vinculada a una OT."),
              { code: "SIN_OT" },
            );
          }
          await tx.oTRepuesto.create({
            data: {
              ot_id: otIdDefault,
              po_id: compraId,
              nro_oc: compra.numero_po,
              fecha_oc: new Date(),
              status_oc_codigo: compra.status_oc_codigo ?? "PEND_OC",
              status_requerimiento_codigo: "APROBADO",
              material_id: it.material_id ?? null,
              material_codigo: it.material_codigo ?? null,
              descripcion: it.descripcion ?? null,
              texto: it.texto ?? null,
              unidad_medida: it.unidad_medida ?? "UNIDAD",
              cantidad: new Prisma.Decimal(it.cantidad),
              precio_unitario: new Prisma.Decimal(it.precio_unitario),
              moneda: it.moneda ?? compra.moneda_codigo ?? "USD",
              fabricante_codigo: it.fabricante_codigo ?? null,
              fecha_entrega_esperada: fecha,
              fecha_solicitud: new Date(),
              tipo_codigo: "MAC",
              es_adicional: true,
              usuario_solicita: compra.usuario_solicita ?? "Logistica",
            },
          });
        }
      }

      // 3) Recalcular totales de la compra
      //    total = subtotal − descuento + impuesto + otros
      const itemsActuales = await tx.oTRepuesto.findMany({
        where: { po_id: compraId },
        select: { cantidad: true, precio_unitario: true },
      });
      let subtotal = new Prisma.Decimal(0);
      for (const r of itemsActuales) {
        const linea = new Prisma.Decimal(r.precio_unitario ?? 0).mul(new Prisma.Decimal(r.cantidad ?? 0));
        subtotal = subtotal.plus(linea);
      }
      // Si vinieron en el payload los persistimos; si no, usamos los actuales de la compra.
      const descuentoDec = descuento !== undefined
        ? new Prisma.Decimal(descuento)
        : new Prisma.Decimal(compra.descuento);
      const otrosDec = otros !== undefined
        ? new Prisma.Decimal(otros)
        : new Prisma.Decimal(compra.otros);
      // IGV se recalcula sobre la base afectada por el descuento (práctica estándar).
      const baseImponible = subtotal.minus(descuentoDec);
      const impuesto = baseImponible.gt(0) ? baseImponible.mul(IGV_PCT) : new Prisma.Decimal(0);
      const total = baseImponible.plus(impuesto).plus(otrosDec);
      await tx.compra.update({
        where: { id: compraId },
        data: {
          subtotal,
          descuento: descuentoDec,
          impuesto,
          otros: otrosDec,
          total,
          ...(numero_req !== undefined ? { numero_req: numero_req || null } : {}),
          ...(tipo_pago !== undefined ? { tipo_pago: tipo_pago || null } : {}),
          ...(dias_credito !== undefined
            ? { dias_credito: tipo_pago === "CONTADO" ? 0 : (dias_credito ?? null) }
            : {}),
        },
      });

      return { count: itemsActuales.length, subtotal, descuento: descuentoDec, impuesto, otros: otrosDec, total };
    });

    return NextResponse.json({ data: result });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err?.code === "NOT_FOUND") return NextResponse.json({ error: err.message }, { status: 404 });
    if (err?.code === "ANULADO") return NextResponse.json({ error: err.message }, { status: 400 });
    if (err?.code === "SIN_OT") return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("PATCH /api/compras/[id]/items error:", error);
    return NextResponse.json({ error: "Error al editar items" }, { status: 500 });
  }
}
