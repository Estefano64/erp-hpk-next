import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const RowSchema = z.object({
  codigo: z.string().trim().min(1),
  descripcion: z.string().trim().min(1),
  planta_codigo: z.string().trim().min(1),
  area_codigo: z.string().trim().min(1),
  categoria_codigo: z.string().trim().min(1),
  clasificacion_codigo: z.string().trim().min(1),
  unidad_medida_codigo: z.string().trim().min(1),
  precio: z.coerce.number().min(0).optional().nullable(),
  moneda_codigo: z.string().trim().optional().nullable(),
  fabricante_codigo: z.string().trim().optional().nullable(),
  np: z.string().trim().optional().nullable(),
  modelo: z.string().trim().optional().nullable(),
  punto_reposicion: z.coerce.number().min(0).optional().nullable(),
  stock_maximo: z.coerce.number().min(0).optional().nullable(),
  plazo_entrega: z.coerce.number().int().min(0).optional().nullable(),
  ubicacion: z.string().trim().optional().nullable(),
});
const BodySchema = z.object({ rows: z.array(z.unknown()).min(1).max(5000) });

// POST /api/materiales/bulk
// Upsert por código. Valida FKs (planta, area, categoria, clasificacion, UM, fabricante, moneda).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Body inválido" }, { status: 400 });
    }

    // Pre-cargar códigos válidos de FKs para validar sin un query por fila.
    const [plantas, areas, categorias, clasificaciones, ums, fabricantes, monedas] = await Promise.all([
      prisma.planta.findMany({ select: { codigo: true } }),
      prisma.area.findMany({ select: { codigo: true } }),
      prisma.categoria.findMany({ select: { codigo: true } }),
      prisma.clasificacion.findMany({ select: { codigo: true } }),
      prisma.unidadMedida.findMany({ select: { codigo: true } }),
      prisma.fabricante.findMany({ select: { codigo: true } }),
      prisma.moneda.findMany({ select: { codigo: true } }),
    ]);
    const setOf = (arr: { codigo: string }[]) => new Set(arr.map((x) => x.codigo));
    const valid = {
      planta: setOf(plantas), area: setOf(areas), categoria: setOf(categorias),
      clasificacion: setOf(clasificaciones), um: setOf(ums),
      fabricante: setOf(fabricantes), moneda: setOf(monedas),
    };

    let created = 0, updated = 0;
    const errors: { row: number; error: string }[] = [];

    for (let i = 0; i < parsed.data.rows.length; i++) {
      const rowParsed = RowSchema.safeParse(parsed.data.rows[i]);
      if (!rowParsed.success) {
        errors.push({ row: i + 2, error: rowParsed.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`).join("; ") });
        continue;
      }
      const r = rowParsed.data;
      // Validar FKs
      const fkErrors: string[] = [];
      if (!valid.planta.has(r.planta_codigo)) fkErrors.push(`planta_codigo "${r.planta_codigo}" no existe`);
      if (!valid.area.has(r.area_codigo)) fkErrors.push(`area_codigo "${r.area_codigo}" no existe`);
      if (!valid.categoria.has(r.categoria_codigo)) fkErrors.push(`categoria_codigo "${r.categoria_codigo}" no existe`);
      if (!valid.clasificacion.has(r.clasificacion_codigo)) fkErrors.push(`clasificacion_codigo "${r.clasificacion_codigo}" no existe`);
      if (!valid.um.has(r.unidad_medida_codigo)) fkErrors.push(`unidad_medida_codigo "${r.unidad_medida_codigo}" no existe`);
      if (r.fabricante_codigo && !valid.fabricante.has(r.fabricante_codigo)) fkErrors.push(`fabricante_codigo "${r.fabricante_codigo}" no existe`);
      if (r.moneda_codigo && !valid.moneda.has(r.moneda_codigo)) fkErrors.push(`moneda_codigo "${r.moneda_codigo}" no existe`);
      if (fkErrors.length > 0) {
        errors.push({ row: i + 2, error: fkErrors.join("; ") });
        continue;
      }

      try {
        const existing = await prisma.material.findUnique({ where: { codigo: r.codigo } });
        const data = {
          descripcion: r.descripcion,
          planta_codigo: r.planta_codigo,
          area_codigo: r.area_codigo,
          categoria_codigo: r.categoria_codigo,
          clasificacion_codigo: r.clasificacion_codigo,
          unidad_medida_codigo: r.unidad_medida_codigo,
          precio: r.precio ?? null,
          moneda_codigo: r.moneda_codigo || null,
          fabricante_codigo: r.fabricante_codigo || null,
          np: r.np || null,
          modelo: r.modelo || null,
          punto_reposicion: r.punto_reposicion ?? null,
          stock_maximo: r.stock_maximo ?? null,
          plazo_entrega: r.plazo_entrega ?? null,
          ubicacion: r.ubicacion || null,
        };
        if (existing) {
          await prisma.material.update({ where: { codigo: r.codigo }, data });
          updated++;
        } else {
          await prisma.material.create({ data: { codigo: r.codigo, ...data } });
          created++;
        }
      } catch (e) {
        errors.push({ row: i + 2, error: e instanceof Error ? e.message : "Error desconocido" });
      }
    }

    return NextResponse.json({
      data: { ok: created + updated, created, updated, errors },
    });
  } catch (error) {
    console.error("POST /api/materiales/bulk error:", error);
    return NextResponse.json({ error: "Error al importar" }, { status: 500 });
  }
}
