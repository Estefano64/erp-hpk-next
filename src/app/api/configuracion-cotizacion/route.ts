import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuditUser, isAdmin } from "@/lib/audit";

const UpdateSchema = z.object({
  tarifa_hora_usd: z.coerce.number().min(0),
  tarifa_hora_sol: z.coerce.number().min(0),
  moneda_default_codigo: z.string().trim().min(1).max(10),
  igv_porcentaje: z.coerce.number().min(0).max(100),
});

export async function GET() {
  const conf = await prisma.configuracionCotizacion.findFirst({ where: { id: 1 } });
  if (!conf) {
    const created = await prisma.configuracionCotizacion.create({
      data: { id: 1, tarifa_hora_usd: 25, tarifa_hora_sol: 100, moneda_default_codigo: "USD", igv_porcentaje: 18 },
    });
    return NextResponse.json({ data: created });
  }
  return NextResponse.json({ data: conf });
}

export async function PUT(req: NextRequest) {
  try {
    if (!(await isAdmin(req))) {
      return NextResponse.json({ error: "Solo administradores pueden editar la configuración" }, { status: 403 });
    }
    const body = await req.json();
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const usuario = (await getAuditUser(req)) ?? "sistema";
    const updated = await prisma.configuracionCotizacion.upsert({
      where: { id: 1 },
      update: { ...parsed.data, updated_by: usuario },
      create: { id: 1, ...parsed.data, updated_by: usuario },
    });
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PUT /api/configuracion-cotizacion error:", error);
    return NextResponse.json({ error: "Error al guardar" }, { status: 500 });
  }
}
