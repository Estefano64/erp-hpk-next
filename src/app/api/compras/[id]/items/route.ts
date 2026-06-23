import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseDateOnly } from "@/lib/dates";

import { parseInt4Safe } from "@/lib/ot-formato";
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
  // `otros` puede ser negativo: el editor de OC permite elegir si suma o
  // resta del total (toggle +/− al lado del input). Se persiste signed.
  otros: z.coerce.number().optional(),
  numero_req: z.string().trim().max(50).nullable().optional(),
  tipo_pago: z.string().trim().max(30).nullable().optional(),
  dias_credito: z.coerce.number().int().min(0).max(365).nullable().optional(),
  // Flag: cuando false, no se calcula IGV (impuesto=0). Para OCs exoneradas.
  aplica_igv: z.boolean().optional(),
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
    const compraId = parseInt4Safe(id) ?? 0;
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const { items, deleteIds, descuento, otros, numero_req, tipo_pago, dias_credito, aplica_igv } = parsed.data;

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
      //
      // Decisión de arquitectura (pedido del user): los edits en la OC NO
      // deben pisar los campos del req original. En su lugar se persisten
      // en columnas paralelas oc_descripcion / oc_cantidad / oc_precio_unitario
      // / oc_unidad_medida. El PDF y la vista de la OC los muestran con
      // fallback al valor original. Esto permite ajustar descripción y
      // precio para el proveedor sin alterar el req que sigue siendo la
      // fuente de verdad del pedido del técnico.
      //
      // Campos que SÍ siguen modificándose en el req: material_id,
      // material_codigo, fabricante_codigo, moneda y fecha_entrega_esperada
      // — son "metadatos" del item que naturalmente cambian al armar la OC.
      // El orden visual del editor es la fuente de verdad para la OC y el
      // PDF. Asignamos `oc_orden_item` = índice+1 a CADA item del payload
      // (tanto updates como creates) para que el orden persista y los
      // endpoints lo respeten en orderBy.
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const ordenItem = i + 1;
        const fecha = parseDateOnly(it.fecha_entrega_esperada);
        if (it.id && itemsIds.has(it.id)) {
          // Update existente — solo override (no toca cantidad/precio/desc/UM del req).
          await tx.oTRepuesto.update({
            where: { id: it.id },
            data: {
              material_id: it.material_id ?? null,
              material_codigo: it.material_codigo ?? null,
              moneda: it.moneda ?? compra.moneda_codigo ?? "USD",
              fabricante_codigo: it.fabricante_codigo ?? null,
              fecha_entrega_esperada: fecha,
              // Override columnas — solo escribimos si llegó valor del cliente.
              oc_descripcion: it.descripcion ?? null,
              oc_cantidad: new Prisma.Decimal(it.cantidad),
              oc_precio_unitario: new Prisma.Decimal(it.precio_unitario),
              oc_unidad_medida: it.unidad_medida ?? "UNIDAD",
              oc_orden_item: ordenItem,
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
          // Items "libres" agregados desde el editor de OC. Solo viven en
          // el PDF y editor de OC — NO aparecen en /requerimientos, /detalle,
          // /despachos, aprobaciones ni tabs de OT. El flag solo_para_oc=true
          // hace que todas las vistas de req los filtren fuera.
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
              solo_para_oc: true,
              usuario_solicita: compra.usuario_solicita ?? "Logistica",
              // Override = original para items nuevos (no tienen req previo).
              oc_descripcion: it.descripcion ?? null,
              oc_cantidad: new Prisma.Decimal(it.cantidad),
              oc_precio_unitario: new Prisma.Decimal(it.precio_unitario),
              oc_unidad_medida: it.unidad_medida ?? "UNIDAD",
              oc_orden_item: ordenItem,
            },
          });
        }
      }

      // 3) Recalcular totales de la compra
      //    total = subtotal − descuento + impuesto + otros
      // Usamos los OVERRIDES de OC con fallback al valor del req — así el
      // total de la OC refleja lo que el user ve en el editor, no lo del req.
      const itemsActuales = await tx.oTRepuesto.findMany({
        where: { po_id: compraId },
        select: { cantidad: true, precio_unitario: true, oc_cantidad: true, oc_precio_unitario: true },
      });
      let subtotal = new Prisma.Decimal(0);
      for (const r of itemsActuales) {
        const cantUsada = r.oc_cantidad ?? r.cantidad ?? 0;
        const precioUsado = r.oc_precio_unitario ?? r.precio_unitario ?? 0;
        const linea = new Prisma.Decimal(precioUsado).mul(new Prisma.Decimal(cantUsada));
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
      // Si la OC está marcada como exonerada (aplica_igv=false, ya sea por el
      // payload o por el valor persistido), el IGV se fuerza a 0.
      const aplicaIgvEfectivo = aplica_igv !== undefined ? aplica_igv : compra.aplica_igv;
      const baseImponible = subtotal.minus(descuentoDec);
      const impuesto = aplicaIgvEfectivo && baseImponible.gt(0)
        ? baseImponible.mul(IGV_PCT)
        : new Prisma.Decimal(0);
      const total = baseImponible.plus(impuesto).plus(otrosDec);
      await tx.compra.update({
        where: { id: compraId },
        data: {
          subtotal,
          descuento: descuentoDec,
          impuesto,
          otros: otrosDec,
          total,
          ...(aplica_igv !== undefined ? { aplica_igv } : {}),
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
