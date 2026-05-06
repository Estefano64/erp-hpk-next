import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";

const RowSchema = z.object({
  ruc: z.string().trim().min(1, "RUC requerido"),
  razon_social: z.string().trim().min(1, "Razón social requerida"),
  nombre_comercial: z.string().trim().optional().nullable(),
  contacto: z.string().trim().optional().nullable(),
  telefono: z.string().trim().optional().nullable(),
  email: z.string().trim().email("email inválido").optional().nullable().or(z.literal("")),
  direccion: z.string().trim().optional().nullable(),
});
const BodySchema = z.object({ rows: z.array(z.unknown()).min(1).max(2000) });

// POST /api/proveedores/bulk
// Upsert por RUC: si existe, actualiza; si no, crea.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Body inválido" }, { status: 400 });
    }
    const usuario = (await getAuditUser(req)) ?? "import";

    let created = 0, updated = 0;
    const errors: { row: number; error: string }[] = [];

    for (let i = 0; i < parsed.data.rows.length; i++) {
      const rowParsed = RowSchema.safeParse(parsed.data.rows[i]);
      if (!rowParsed.success) {
        errors.push({ row: i + 2, error: rowParsed.error.issues.map((iss) => iss.message).join("; ") });
        continue;
      }
      const r = rowParsed.data;
      try {
        const existing = await prisma.proveedor.findUnique({ where: { ruc: r.ruc } });
        if (existing) {
          await prisma.proveedor.update({
            where: { ruc: r.ruc },
            data: {
              razon_social: r.razon_social,
              nombre_comercial: r.nombre_comercial || null,
              contacto: r.contacto || null,
              telefono: r.telefono || null,
              email: r.email || null,
              direccion: r.direccion || null,
              usuario_actualiza: usuario,
            },
          });
          updated++;
        } else {
          await prisma.proveedor.create({
            data: {
              ruc: r.ruc,
              razon_social: r.razon_social,
              nombre_comercial: r.nombre_comercial || null,
              contacto: r.contacto || null,
              telefono: r.telefono || null,
              email: r.email || null,
              direccion: r.direccion || null,
              usuario_crea: usuario,
              usuario_actualiza: usuario,
            },
          });
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
    console.error("POST /api/proveedores/bulk error:", error);
    return NextResponse.json({ error: "Error al importar" }, { status: 500 });
  }
}
