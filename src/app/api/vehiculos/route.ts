// GET  /api/vehiculos        — lista todos los vehículos (activos + inactivos)
// POST /api/vehiculos        — crear vehículo nuevo
//
// Inventario de unidades de transporte HP&K. Trackea SOAT, póliza y
// revisión técnica con sus vencimientos para alertar antes de que caduquen.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

const Schema = z.object({
  tipo: z.string().trim().min(1).max(30),
  marca: z.string().trim().min(1).max(50),
  modelo: z.string().trim().min(1).max(100),
  serie: z.string().trim().min(1).max(50),
  placa: z.string().trim().min(1).max(20),
  anio: z.coerce.number().int().min(1900).max(2100).nullable().optional(),
  revision_tecnica_vencimiento: z.string().nullable().optional(),
  empresa_soat: z.string().trim().max(100).nullable().optional(),
  soat_vencimiento: z.string().nullable().optional(),
  empresa_poliza: z.string().trim().max(100).nullable().optional(),
  poliza_vencimiento: z.string().nullable().optional(),
  monto_poliza: z.coerce.number().nullable().optional(),
  almacen: z.string().trim().max(100).nullable().optional(),
  observaciones: z.string().trim().nullable().optional(),
  activo: z.boolean().optional(),
  usuario_crea: z.string().trim().max(100).optional(),
});

function parseDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET() {
  try {
    const data = await prisma.vehiculo.findMany({
      orderBy: [{ item: "asc" }, { id: "asc" }],
    });
    return NextResponse.json({ data });
  } catch (e) {
    console.error("GET /api/vehiculos error:", e);
    return NextResponse.json({ error: "Error al listar vehículos" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validación", detail: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const d = parsed.data;
    // item = max(item) + 1 — empuja al final del listado por defecto.
    const last = await prisma.vehiculo.findFirst({ orderBy: { item: "desc" }, select: { item: true } });
    const nextItem = (last?.item ?? 0) + 1;

    const v = await prisma.vehiculo.create({
      data: {
        item: nextItem,
        tipo: d.tipo,
        marca: d.marca,
        modelo: d.modelo,
        serie: d.serie,
        placa: d.placa,
        anio: d.anio ?? null,
        revision_tecnica_vencimiento: parseDate(d.revision_tecnica_vencimiento),
        empresa_soat: d.empresa_soat ?? null,
        soat_vencimiento: parseDate(d.soat_vencimiento),
        empresa_poliza: d.empresa_poliza ?? null,
        poliza_vencimiento: parseDate(d.poliza_vencimiento),
        monto_poliza: d.monto_poliza != null ? new Prisma.Decimal(d.monto_poliza) : null,
        almacen: d.almacen ?? null,
        observaciones: d.observaciones ?? null,
        activo: d.activo ?? true,
        usuario_crea: d.usuario_crea ?? null,
      },
    });
    return NextResponse.json({ data: v });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const target = (e.meta?.target as string[] | undefined)?.join(", ") ?? "campo";
      return NextResponse.json(
        { error: `Ya existe un vehículo con ese ${target} (debe ser único)` },
        { status: 409 },
      );
    }
    console.error("POST /api/vehiculos error:", e);
    return NextResponse.json({ error: "Error al crear vehículo" }, { status: 500 });
  }
}
