// PATCH  /api/vehiculos/[id]  — actualizar vehículo
// DELETE /api/vehiculos/[id]  — soft delete (activo = false)
//
// Mismo patron que el resto del sistema: el DELETE no borra físicamente,
// marca activo=false. El listado luego filtra por activo si hace falta.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

const PatchSchema = z.object({
  item: z.coerce.number().int().optional(),
  tipo: z.string().trim().min(1).max(30).optional(),
  marca: z.string().trim().min(1).max(50).optional(),
  modelo: z.string().trim().min(1).max(100).optional(),
  serie: z.string().trim().min(1).max(50).optional(),
  placa: z.string().trim().min(1).max(20).optional(),
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
  usuario_actualiza: z.string().trim().max(100).optional(),
});

function parseDate(v: string | null | undefined): Date | null {
  if (v === undefined) return undefined as unknown as Date;
  if (v === null || v === "") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await ctx.params;
    const id = Number(idStr);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }
    const body = await req.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validación", detail: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const d = parsed.data;
    // Solo sobreescribimos campos presentes en el body — el resto queda
    // como está. Los string-fechas vacíos limpian (null).
    const data: Prisma.VehiculoUpdateInput = {};
    if (d.item !== undefined) data.item = d.item;
    if (d.tipo !== undefined) data.tipo = d.tipo;
    if (d.marca !== undefined) data.marca = d.marca;
    if (d.modelo !== undefined) data.modelo = d.modelo;
    if (d.serie !== undefined) data.serie = d.serie;
    if (d.placa !== undefined) data.placa = d.placa;
    if (d.anio !== undefined) data.anio = d.anio;
    if (d.revision_tecnica_vencimiento !== undefined) data.revision_tecnica_vencimiento = parseDate(d.revision_tecnica_vencimiento);
    if (d.empresa_soat !== undefined) data.empresa_soat = d.empresa_soat;
    if (d.soat_vencimiento !== undefined) data.soat_vencimiento = parseDate(d.soat_vencimiento);
    if (d.empresa_poliza !== undefined) data.empresa_poliza = d.empresa_poliza;
    if (d.poliza_vencimiento !== undefined) data.poliza_vencimiento = parseDate(d.poliza_vencimiento);
    if (d.monto_poliza !== undefined) data.monto_poliza = d.monto_poliza != null ? new Prisma.Decimal(d.monto_poliza) : null;
    if (d.almacen !== undefined) data.almacen = d.almacen;
    if (d.observaciones !== undefined) data.observaciones = d.observaciones;
    if (d.activo !== undefined) data.activo = d.activo;
    if (d.usuario_actualiza !== undefined) data.usuario_actualiza = d.usuario_actualiza;

    const v = await prisma.vehiculo.update({ where: { id }, data });
    return NextResponse.json({ data: v });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") {
        return NextResponse.json({ error: "Vehículo no encontrado" }, { status: 404 });
      }
      if (e.code === "P2002") {
        const target = (e.meta?.target as string[] | undefined)?.join(", ") ?? "campo";
        return NextResponse.json(
          { error: `Ya existe un vehículo con ese ${target} (debe ser único)` },
          { status: 409 },
        );
      }
    }
    console.error("PATCH /api/vehiculos/[id] error:", e);
    return NextResponse.json({ error: "Error al actualizar vehículo" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await ctx.params;
    const id = Number(idStr);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }
    // Soft delete — preservamos el registro histórico.
    const v = await prisma.vehiculo.update({
      where: { id },
      data: { activo: false },
    });
    return NextResponse.json({ data: v });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Vehículo no encontrado" }, { status: 404 });
    }
    console.error("DELETE /api/vehiculos/[id] error:", e);
    return NextResponse.json({ error: "Error al eliminar vehículo" }, { status: 500 });
  }
}
