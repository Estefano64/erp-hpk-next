import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

const Schema = z.object({
  tipo_movimiento: z.enum(["ENTRADA", "SALIDA", "AJUSTE"]),
  cantidad: z.coerce.number().positive(),
  motivo: z.string().trim().max(300).optional().nullable(),
  documento_referencia: z.string().trim().max(100).optional().nullable(),
  usuario: z.string().trim().optional().nullable(),
});

// POST — registra un movimiento y ajusta el stock del material no catalogado.
//   ENTRADA → suma · SALIDA → resta (valida stock) · AJUSTE → fija/suma diferencia.
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const matId = Number(id);
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const mat = await tx.materialNoCatalogado.findUnique({ where: { id: matId } });
      if (!mat) throw Object.assign(new Error("Material no encontrado"), { code: "NOT_FOUND" });

      const actual = new Prisma.Decimal(mat.stock_actual);
      const cant = new Prisma.Decimal(d.cantidad);
      let nuevoStock = actual;
      if (d.tipo_movimiento === "ENTRADA") nuevoStock = actual.plus(cant);
      else if (d.tipo_movimiento === "SALIDA") {
        if (actual.lt(cant)) {
          throw Object.assign(new Error(`Stock insuficiente (${actual} < ${cant})`), { code: "STOCK" });
        }
        nuevoStock = actual.minus(cant);
      } else {
        // AJUSTE: la cantidad fija el nuevo stock absoluto.
        nuevoStock = cant;
      }

      await tx.movimientoNoCatalogado.create({
        data: {
          material_no_cat_id: matId,
          tipo_movimiento: d.tipo_movimiento,
          cantidad: cant,
          motivo: d.motivo || null,
          documento_referencia: d.documento_referencia || null,
          usuario: d.usuario || "sistema",
        },
      });
      await tx.materialNoCatalogado.update({
        where: { id: matId },
        data: { stock_actual: nuevoStock },
      });
      return { stock_actual: Number(nuevoStock) };
    });

    return NextResponse.json({ data: result });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err?.code === "NOT_FOUND") return NextResponse.json({ error: err.message }, { status: 404 });
    if (err?.code === "STOCK") return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("POST /api/no-catalogados/[id]/movimiento error:", error);
    return NextResponse.json({ error: "Error al registrar movimiento" }, { status: 500 });
  }
}

// GET — historial de movimientos del material.
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const movimientos = await prisma.movimientoNoCatalogado.findMany({
      where: { material_no_cat_id: Number(id) },
      orderBy: { fecha_movimiento: "desc" },
    });
    return NextResponse.json({ data: movimientos });
  } catch (error) {
    console.error("GET /api/no-catalogados/[id]/movimiento error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
