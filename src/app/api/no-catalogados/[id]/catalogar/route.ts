import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

const Schema = z.object({
  planta_codigo: z.string().trim().min(1),
  area_codigo: z.string().trim().min(1),
  categoria_codigo: z.string().trim().min(1),
  clasificacion_codigo: z.string().trim().min(1),
  unidad_medida_codigo: z.string().trim().min(1),
  precio: z.coerce.number().min(0).optional().nullable(),
  moneda_codigo: z.string().trim().optional().nullable(),
  np: z.string().trim().optional().nullable(),
  punto_reposicion: z.coerce.number().min(0).optional().nullable(),
  stock_maximo: z.coerce.number().min(0).optional().nullable(),
  usuario: z.string().trim().optional().nullable(),
});

// POST — "Cataloga" un material no catalogado: crea el Material real del catálogo,
// transfiere el stock como ENTRADA y desactiva el registro no catalogado.
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const matNoCatId = Number(id);
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;
    const usuario = d.usuario || "Logistica";

    const result = await prisma.$transaction(async (tx) => {
      const noCat = await tx.materialNoCatalogado.findUnique({ where: { id: matNoCatId } });
      if (!noCat) throw Object.assign(new Error("Material no catalogado no encontrado"), { code: "NOT_FOUND" });
      if (!noCat.activo) throw Object.assign(new Error("Este material ya fue catalogado o está inactivo"), { code: "INACTIVO" });

      // Código numérico auto-incremental (misma convención que /api/materiales).
      const last = await tx.material.findFirst({ orderBy: { material_id: "desc" }, select: { codigo: true } });
      const lastNum = last?.codigo ? parseInt(last.codigo, 10) : 0;
      const codigo = String(lastNum + 1).padStart(6, "0");

      const stockTransferir = new Prisma.Decimal(noCat.stock_actual);

      const material = await tx.material.create({
        data: {
          codigo,
          descripcion: noCat.descripcion,
          planta_codigo: d.planta_codigo,
          area_codigo: d.area_codigo,
          categoria_codigo: d.categoria_codigo,
          clasificacion_codigo: d.clasificacion_codigo,
          unidad_medida_codigo: d.unidad_medida_codigo,
          precio: d.precio ?? null,
          moneda_codigo: d.moneda_codigo || null,
          np: d.np || null,
          punto_reposicion: d.punto_reposicion ?? null,
          stock_maximo: d.stock_maximo ?? null,
          ubicacion: noCat.ubicacion_codigo || null,
          stock_actual: stockTransferir,
        },
      });

      // Registrar la transferencia de stock como ENTRADA en el catálogo real.
      if (stockTransferir.gt(0)) {
        await tx.movimientoInventario.create({
          data: {
            material_id: material.material_id,
            tipo_movimiento: "ENTRADA",
            cantidad: stockTransferir,
            documento_referencia: `CATALOGAR-NC${noCat.id}`,
            observacion: `Catalogación: stock transferido desde "${noCat.codigo}" (${noCat.descripcion})`,
            usuario,
          },
        });
        // Y como SALIDA en el no catalogado para dejarlo en 0 con traza.
        await tx.movimientoNoCatalogado.create({
          data: {
            material_no_cat_id: noCat.id,
            tipo_movimiento: "SALIDA",
            cantidad: stockTransferir,
            motivo: `Catalogado → Material ${codigo}`,
            documento_referencia: `MAT-${codigo}`,
            usuario,
          },
        });
      }

      // Desactivar el no catalogado (ya vive como Material del catálogo).
      await tx.materialNoCatalogado.update({
        where: { id: noCat.id },
        data: {
          activo: false,
          stock_actual: 0,
          observaciones: `${noCat.observaciones ? noCat.observaciones + " · " : ""}Catalogado como Material ${codigo} el ${new Date().toLocaleDateString("es-PE")}`,
        },
      });

      return { material_id: material.material_id, codigo };
    });

    return NextResponse.json({
      data: result,
      message: `Material catalogado correctamente como ${result.codigo}`,
    }, { status: 201 });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err?.code === "NOT_FOUND") return NextResponse.json({ error: err.message }, { status: 404 });
    if (err?.code === "INACTIVO") return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("POST /api/no-catalogados/[id]/catalogar error:", error);
    return NextResponse.json({ error: "Error al catalogar el material" }, { status: 500 });
  }
}
