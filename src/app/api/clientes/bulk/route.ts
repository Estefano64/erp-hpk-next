import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";

const RowSchema = z.object({
  codigo: z.string().trim().min(1, "Código requerido"),
  razon_social: z.string().trim().min(1, "Razón social requerida"),
  nombre_comercial: z.string().trim().optional().nullable(),
  ruc: z.string().trim().optional().nullable(),
  direccion: z.string().trim().optional().nullable(),
  telefono: z.string().trim().optional().nullable(),
  email: z.string().trim().email("email inválido").optional().nullable().or(z.literal("")),
  contacto_principal: z.string().trim().optional().nullable(),
});
const BodySchema = z.object({ rows: z.array(z.unknown()).min(1).max(2000) });

// POST /api/clientes/bulk
// Upsert por código.
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
        const existing = await prisma.cliente.findUnique({ where: { codigo: r.codigo } });
        const data = {
          razon_social: r.razon_social,
          nombre_comercial: r.nombre_comercial || null,
          ruc: r.ruc || null,
          direccion: r.direccion || null,
          telefono: r.telefono || null,
          email: r.email || null,
          contacto_principal: r.contacto_principal || null,
        };
        if (existing) {
          await prisma.cliente.update({
            where: { codigo: r.codigo },
            data: { ...data, usuario_actualiza: usuario },
          });
          updated++;
        } else {
          await prisma.cliente.create({
            data: { codigo: r.codigo, ...data, usuario_crea: usuario, usuario_actualiza: usuario },
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
    console.error("POST /api/clientes/bulk error:", error);
    return NextResponse.json({ error: "Error al importar" }, { status: 500 });
  }
}
