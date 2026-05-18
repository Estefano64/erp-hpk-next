import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// GET — listar materiales no catalogados + KPIs de balance.
export async function GET(_req: NextRequest) {
  try {
    const materiales = await prisma.materialNoCatalogado.findMany({
      where: { activo: true },
      orderBy: { codigo: "asc" },
      include: {
        ubicacion: { select: { codigo: true, nombre: true } },
        _count: { select: { movimientos: true } },
      },
    });

    type M = typeof materiales[number];
    const data = materiales.map((m: M) => ({
      id: m.id,
      codigo: m.codigo,
      descripcion: m.descripcion,
      unidad_medida: m.unidad_medida,
      stock_actual: Number(m.stock_actual),
      ubicacion_codigo: m.ubicacion_codigo,
      ubicacion_nombre: m.ubicacion ? `${m.ubicacion.codigo} — ${m.ubicacion.nombre}` : null,
      observaciones: m.observaciones,
      movimientos_count: m._count.movimientos,
    }));

    const agg = await prisma.movimientoNoCatalogado.groupBy({
      by: ["tipo_movimiento"],
      _sum: { cantidad: true },
    });
    let totalEntradas = 0, totalSalidas = 0, totalAjustes = 0;
    for (const g of agg) {
      const q = Number(g._sum.cantidad ?? 0);
      if (g.tipo_movimiento === "ENTRADA") totalEntradas = q;
      else if (g.tipo_movimiento === "SALIDA") totalSalidas = q;
      else if (g.tipo_movimiento === "AJUSTE") totalAjustes = q;
    }

    return NextResponse.json({
      data,
      kpis: {
        total: data.length,
        sinStock: data.filter((d) => d.stock_actual <= 0).length,
        totalEntradas,
        totalSalidas,
        totalAjustes,
        balance: totalEntradas - totalSalidas + totalAjustes,
      },
    });
  } catch (error) {
    console.error("GET /api/no-catalogados error:", error);
    return NextResponse.json({ error: "Error al listar" }, { status: 500 });
  }
}

const CreateSchema = z.object({
  codigo: z.string().trim().min(1).max(50),
  descripcion: z.string().trim().min(1).max(300),
  unidad_medida: z.string().trim().max(20).optional().nullable(),
  ubicacion_codigo: z.string().trim().max(10).optional().nullable(),
  observaciones: z.string().trim().optional().nullable(),
  stock_inicial: z.coerce.number().min(0).optional().nullable(),
  usuario: z.string().trim().optional().nullable(),
});

// POST — crear material no catalogado (con stock inicial opcional → genera AJUSTE).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;
    const stockIni = d.stock_inicial ?? 0;

    const created = await prisma.$transaction(async (tx) => {
      const dup = await tx.materialNoCatalogado.findUnique({ where: { codigo: d.codigo } });
      if (dup) throw Object.assign(new Error("Ya existe un material con ese código"), { code: "DUP" });

      const mat = await tx.materialNoCatalogado.create({
        data: {
          codigo: d.codigo,
          descripcion: d.descripcion,
          unidad_medida: d.unidad_medida || "UNIDAD",
          ubicacion_codigo: d.ubicacion_codigo || null,
          observaciones: d.observaciones || null,
          stock_actual: stockIni,
        },
      });
      if (stockIni > 0) {
        await tx.movimientoNoCatalogado.create({
          data: {
            material_no_cat_id: mat.id,
            tipo_movimiento: "AJUSTE",
            cantidad: stockIni,
            motivo: "Stock inicial",
            usuario: d.usuario || "sistema",
          },
        });
      }
      return mat;
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err?.code === "DUP") return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("POST /api/no-catalogados error:", error);
    return NextResponse.json({ error: "Error al crear" }, { status: 500 });
  }
}
