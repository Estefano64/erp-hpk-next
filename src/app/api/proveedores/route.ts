import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";

const CreateSchema = z.object({
  ruc: z.string().trim().min(1),
  razon_social: z.string().trim().min(1),
  nombre_comercial: z.string().trim().optional().nullable(),
  contacto: z.string().trim().optional().nullable(),
  telefono: z.string().trim().optional().nullable(),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  direccion: z.string().trim().optional().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit = Math.min(10000, Math.max(1, Number(searchParams.get("limit") ?? 20)));
    const search = searchParams.get("search")?.trim() ?? "";
    const soloActivos = searchParams.get("activos") !== "false";

    const where: Record<string, unknown> = {};
    if (soloActivos) where.activo = true;
    if (search) {
      where.OR = [
        { ruc: { contains: search, mode: "insensitive" } },
        { razon_social: { contains: search, mode: "insensitive" } },
        { nombre_comercial: { contains: search, mode: "insensitive" } },
        { contacto: { contains: search, mode: "insensitive" } },
      ];
    }

    const [records, total] = await Promise.all([
      prisma.proveedor.findMany({
        where,
        orderBy: { id: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.proveedor.count({ where }),
    ]);

    // Alias razonSocial (camelCase) para compatibilidad con páginas estilo POs2
    const data = records.map((p) => ({ ...p, razonSocial: p.razon_social }));

    return NextResponse.json({ data, total, page });
  } catch (error) {
    console.error("GET /api/proveedores error:", error);
    return NextResponse.json({ error: "Error al obtener datos" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const usuario = await getAuditUser(req);
    const created = await prisma.proveedor.create({
      data: {
        ruc: parsed.data.ruc,
        razon_social: parsed.data.razon_social,
        nombre_comercial: parsed.data.nombre_comercial || null,
        contacto: parsed.data.contacto || null,
        telefono: parsed.data.telefono || null,
        email: parsed.data.email || null,
        direccion: parsed.data.direccion || null,
        usuario_crea: usuario,
        usuario_actualiza: usuario,
      },
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "RUC ya existe" }, { status: 409 });
    }
    console.error("POST /api/proveedores error:", error);
    return NextResponse.json({ error: "Error al crear" }, { status: 500 });
  }
}
