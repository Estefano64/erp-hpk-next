import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { nextNroReqExterna, nextItemReq } from "@/lib/requerimientos";
import { parseDateOnly } from "@/lib/dates";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/ordenes-trabajo/[id]/requerimientos
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const otId = Number(id);
    if (!Number.isFinite(otId) || otId <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }
    const data = await prisma.oTRepuesto.findMany({
      where: {
        ot_id: otId,
        // Excluir items "libres" agregados desde el editor de OC — esos
        // solo viven en el PDF/editor de la OC, no como req de la OT.
        OR: [{ solo_para_oc: false }, { solo_para_oc: null }],
      },
      include: {
        material: { select: { codigo: true, descripcion: true, fabricante_codigo: true, unidad_medida_codigo: true, precio: true, moneda_codigo: true } },
        status_requerimiento: { select: { codigo: true, nombre: true } },
        status_cotizacion: { select: { codigo: true, nombre: true } },
        status_oc: { select: { codigo: true, nombre: true } },
        proveedor: { select: { id: true, razon_social: true } },
        compra: { select: { id: true, numero_po: true, fecha_entrega_esperada: true } },
        adjuntos: { select: { id: true, nombre_archivo: true, r2_key: true, tamano: true } },
      },
      orderBy: { item_req: "asc" },
    });
    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/ordenes-trabajo/[id]/requerimientos error:", error);
    return NextResponse.json({ error: "Error al obtener requerimientos" }, { status: 500 });
  }
}

// POST — crear adicional manual desde la OT (cualquier autenticado)
const CreateSchema = z.object({
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
  // Si se especifica, el item se agrega a ese nro_req (debe pertenecer a la misma OT).
  // Si no, se genera un nro_req nuevo.
  nro_req: z.string().trim().optional().nullable(),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const otId = Number(id);
    if (!Number.isFinite(otId) || otId <= 0) {
      return NextResponse.json({ error: "ID de OT inválido" }, { status: 400 });
    }
    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;
    const usuario = (await getAuditUser(req)) ?? "sistema";

    // Si es MAC y viene material_codigo, resolver material_id
    let material_id: number | null = null;
    if (d.tipo_codigo === "MAC") {
      if (!d.material_codigo) {
        return NextResponse.json({ error: "Tipo MAC requiere material_codigo." }, { status: 400 });
      }
      const mat = await prisma.material.findUnique({ where: { codigo: d.material_codigo } });
      if (!mat) {
        return NextResponse.json({ error: `Material "${d.material_codigo}" no existe.` }, { status: 400 });
      }
      material_id = mat.material_id;
    }

    const created = await prisma.$transaction(async (tx) => {
      const otExists = await tx.ordenTrabajo.findUnique({ where: { id: otId }, select: { id: true } });
      if (!otExists) throw new Error("NOT_FOUND_OT");

      // Si vino nro_req: validar que existe en esta OT y agregar item ahí.
      // Si no: generar uno nuevo.
      let nroReq: string;
      if (d.nro_req) {
        const existing = await tx.oTRepuesto.findFirst({
          where: { ot_id: otId, nro_req: d.nro_req },
          select: { id: true, status_requerimiento_codigo: true },
        });
        if (!existing) throw new Error("INVALID_NRO_REQ");
        // Solo permite agregar a requerimientos en BORRADOR o SIN_APROBACION
        if (existing.status_requerimiento_codigo && !["BORRADOR", "SIN_APROBACION"].includes(existing.status_requerimiento_codigo)) {
          throw new Error("LOCKED_NRO_REQ");
        }
        nroReq = d.nro_req;
      } else {
        nroReq = await nextNroReqExterna(tx, otId);
      }
      const itemReq = await nextItemReq(tx, otId, nroReq);

      const row = await tx.oTRepuesto.create({
        data: {
          ot_id: otId,
          material_id,
          material_codigo: d.material_codigo ?? null,
          tipo_codigo: d.tipo_codigo,
          cantidad: d.cantidad,
          descripcion: d.descripcion,
          texto: d.texto ?? null,
          fabricante_codigo: d.fabricante_codigo ?? null,
          unidad_medida: d.unidad_medida ?? "UNIDAD",
          fecha_requerida: parseDateOnly(d.fecha_requerida),
          precio_unitario: d.precio_unitario ?? null,
          moneda: d.moneda ?? "USD",
          observaciones: d.observaciones ?? null,
          es_adicional: true,
          nro_req: nroReq,
          item_req: itemReq,
          status_requerimiento_codigo: "BORRADOR",
          usuario_solicita: usuario,
        },
        include: {
          material: { select: { codigo: true, descripcion: true } },
          status_requerimiento: { select: { codigo: true, nombre: true } },
        },
      });
      // Historial: agregar item al requerimiento (existente o nuevo)
      await tx.oTHistorial.create({
        data: {
          ot_id: otId,
          tipo_operacion: "REQUERIMIENTO",
          descripcion: d.nro_req
            ? `Item agregado a ${nroReq} (item ${itemReq}: ${d.descripcion}).`
            : `Requerimiento ${nroReq} creado con 1 item (${d.descripcion}).`,
          usuario,
        },
      });
      return row;
    });

    return NextResponse.json({ data: created }, { status: 201 });
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
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return NextResponse.json({ error: "Referencia inválida (material/proveedor)." }, { status: 400 });
    }
    console.error("POST /api/ordenes-trabajo/[id]/requerimientos error:", error);
    return NextResponse.json({ error: "Error al crear requerimiento" }, { status: 500 });
  }
}
