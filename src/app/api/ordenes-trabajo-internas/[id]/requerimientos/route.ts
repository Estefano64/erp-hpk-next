// Requerimientos de una OT Interna.
//   GET — lista los items (OTRepuesto) vinculados a la OT interna.
//   POST — crea un item nuevo (asociado a un nro_req existente o uno nuevo).
//
// Mismo flujo que /api/ordenes-trabajo/[id]/requerimientos pero filtrando por
// orden_trabajo_interna_id en vez de ot_id.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { nextNroReqInterna, nextItemReqInterna } from "@/lib/requerimientos";
import { parseDateOnly } from "@/lib/dates";

type Ctx = { params: Promise<{ id: string }> };

// GET — lista de requerimientos de la OT interna
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const otInternaId = Number(id);
    if (!Number.isFinite(otInternaId) || otInternaId <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }
    const data = await prisma.oTRepuesto.findMany({
      where: {
        orden_trabajo_interna_id: otInternaId,
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
    console.error("GET /api/ordenes-trabajo-internas/[id]/requerimientos error:", error);
    return NextResponse.json({ error: "Error al obtener requerimientos" }, { status: 500 });
  }
}

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
  // Si se especifica, el item se agrega a ese nro_req (debe pertenecer a la misma OT interna).
  // Si no, se genera un nro_req nuevo.
  nro_req: z.string().trim().optional().nullable(),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const otInternaId = Number(id);
    if (!Number.isFinite(otInternaId) || otInternaId <= 0) {
      return NextResponse.json({ error: "ID de OT interna inválido" }, { status: 400 });
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
      const otExists = await tx.ordenTrabajoInterna.findUnique({
        where: { id: otInternaId },
        select: { id: true },
      });
      if (!otExists) throw new Error("NOT_FOUND_OT");

      let nroReq: string;
      if (d.nro_req) {
        const existing = await tx.oTRepuesto.findFirst({
          where: { orden_trabajo_interna_id: otInternaId, nro_req: d.nro_req },
          select: { id: true, status_requerimiento_codigo: true },
        });
        if (!existing) throw new Error("INVALID_NRO_REQ");
        if (existing.status_requerimiento_codigo && !["BORRADOR", "SIN_APROBACION"].includes(existing.status_requerimiento_codigo)) {
          throw new Error("LOCKED_NRO_REQ");
        }
        nroReq = d.nro_req;
      } else {
        nroReq = await nextNroReqInterna(tx, otInternaId);
      }
      const itemReq = await nextItemReqInterna(tx, otInternaId, nroReq);

      const row = await tx.oTRepuesto.create({
        data: {
          orden_trabajo_interna_id: otInternaId,
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
      await tx.oTHistorial.create({
        data: {
          orden_trabajo_interna_id: otInternaId,
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
      return NextResponse.json({ error: "OT interna no encontrada" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "INVALID_NRO_REQ") {
      return NextResponse.json({ error: "Ese nro_req no existe en esta OT interna." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "LOCKED_NRO_REQ") {
      return NextResponse.json({ error: "No se pueden agregar items a un requerimiento aprobado o anulado." }, { status: 400 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return NextResponse.json({ error: "Referencia inválida (material/proveedor)." }, { status: 400 });
    }
    console.error("POST /api/ordenes-trabajo-internas/[id]/requerimientos error:", error);
    return NextResponse.json({ error: "Error al crear requerimiento" }, { status: 500 });
  }
}
