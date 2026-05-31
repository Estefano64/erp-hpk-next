import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { nextNroReqExterna, nextItemReq } from "@/lib/requerimientos";
import { parseDateOnly } from "@/lib/dates";

type Ctx = { params: Promise<{ id: string }> };

const ItemSchema = z.object({
  tipo_codigo: z.enum(["MAC", "CAD", "SER"]),
  material_codigo: z.string().trim().optional().nullable(),
  cantidad: z.coerce.number().min(0.01),
  descripcion: z.string().trim().min(1).max(500),
  texto: z.string().trim().optional().nullable(),
  fabricante_codigo: z.string().trim().optional().nullable(),
  unidad_medida: z.string().trim().optional().nullable(),
  precio_unitario: z.coerce.number().min(0).optional().nullable(),
  moneda: z.string().trim().optional().nullable(),
  fecha_requerida: z.string().optional().nullable(),
  observaciones: z.string().trim().optional().nullable(),
});

const BulkSchema = z.object({
  items: z.array(ItemSchema).min(1).max(100),
  // Si se especifica, los items se agregan a ese nro_req existente (debe estar en BORRADOR o SIN_APROBACION).
  // Si no, se genera un nro_req nuevo.
  nro_req: z.string().trim().optional().nullable(),
});

// POST /api/ordenes-trabajo/[id]/requerimientos/bulk
// Crea un requerimiento (un nro_req) con N items.
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const otId = Number(id);
    if (!Number.isFinite(otId) || otId <= 0) {
      return NextResponse.json({ error: "ID de OT inválido" }, { status: 400 });
    }
    const body = await req.json();
    const parsed = BulkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const usuario = (await getAuditUser(req)) ?? "sistema";

    // Resolver material_id para los MAC con material_codigo
    const codigosMAC = [...new Set(
      parsed.data.items
        .filter((i) => i.tipo_codigo === "MAC" && i.material_codigo)
        .map((i) => i.material_codigo!),
    )];
    const materiales = codigosMAC.length > 0
      ? await prisma.material.findMany({
          where: { codigo: { in: codigosMAC } },
          select: { material_id: true, codigo: true },
        })
      : [];
    const matMap = new Map(materiales.map((m) => [m.codigo, m.material_id]));

    // Validar que los MAC con material_codigo existan
    for (const it of parsed.data.items) {
      if (it.tipo_codigo === "MAC") {
        if (!it.material_codigo) {
          return NextResponse.json({ error: "Tipo MAC requiere material_codigo." }, { status: 400 });
        }
        if (!matMap.has(it.material_codigo)) {
          return NextResponse.json({ error: `Material "${it.material_codigo}" no existe.` }, { status: 400 });
        }
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const otExists = await tx.ordenTrabajo.findUnique({ where: { id: otId }, select: { id: true } });
      if (!otExists) throw new Error("NOT_FOUND_OT");

      let nroReq: string;
      if (parsed.data.nro_req) {
        const existing = await tx.oTRepuesto.findFirst({
          where: { ot_id: otId, nro_req: parsed.data.nro_req },
          select: { status_requerimiento_codigo: true },
        });
        if (!existing) throw new Error("INVALID_NRO_REQ");
        if (existing.status_requerimiento_codigo &&
            !["BORRADOR", "SIN_APROBACION"].includes(existing.status_requerimiento_codigo)) {
          throw new Error("LOCKED_NRO_REQ");
        }
        nroReq = parsed.data.nro_req;
      } else {
        nroReq = await nextNroReqExterna(tx, otId);
      }
      let itemReqStart = await nextItemReq(tx, otId, nroReq);

      const created = [];
      for (const it of parsed.data.items) {
        const material_id = it.tipo_codigo === "MAC" && it.material_codigo
          ? matMap.get(it.material_codigo) ?? null
          : null;
        const row = await tx.oTRepuesto.create({
          data: {
            ot_id: otId,
            material_id,
            material_codigo: it.material_codigo ?? null,
            tipo_codigo: it.tipo_codigo,
            cantidad: it.cantidad,
            descripcion: it.descripcion,
            texto: it.texto ?? null,
            fabricante_codigo: it.fabricante_codigo ?? null,
            unidad_medida: it.unidad_medida ?? "UNIDAD",
            fecha_requerida: parseDateOnly(it.fecha_requerida),
            precio_unitario: it.precio_unitario ?? null,
            moneda: it.moneda ?? "USD",
            observaciones: it.observaciones ?? null,
            es_adicional: true,
            nro_req: nroReq,
            item_req: itemReqStart++,
            status_requerimiento_codigo: "BORRADOR",
            usuario_solicita: usuario,
          },
        });
        created.push(row);
      }

      // Historial
      await tx.oTHistorial.create({
        data: {
          ot_id: otId,
          tipo_operacion: "REQUERIMIENTO",
          descripcion: parsed.data.nro_req
            ? `Agregados ${created.length} item(s) al requerimiento ${nroReq}.`
            : `Requerimiento ${nroReq} creado con ${created.length} item(s).`,
          usuario,
        },
      });

      return {
        nro_req: nroReq,
        creados: created.length,
        items: created.map((c) => ({ id: c.id, item_req: c.item_req })),
      };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND_OT") {
      return NextResponse.json({ error: "OT no encontrada" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "INVALID_NRO_REQ") {
      return NextResponse.json({ error: "Ese nro_req no existe en esta OT." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "LOCKED_NRO_REQ") {
      return NextResponse.json({ error: "No se pueden agregar items a un requerimiento aprobado o anulado." }, { status: 400 });
    }
    console.error("POST /requerimientos/bulk error:", error);
    return NextResponse.json({ error: "Error al crear requerimiento" }, { status: 500 });
  }
}
