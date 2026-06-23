import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/permisos";

import { parseInt4Safe } from "@/lib/ot-formato";
async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!hasRole(session, "admin")) return null;
  return session;
}

const ROLES = [
  "admin", "viewer", "tecnico", "evaluador",
  "aprobador_evaluacion", "aprobador_requerimiento",
  "planner", "supervisor", "logistica", "mantenimiento", "contabilidad",
] as const;

const UpdateSchema = z.object({
  codigoEmpleado: z.string().trim().min(1).max(20).optional(),
  email: z.string().trim().email().optional().nullable(),
  dni: z.string().trim().optional().nullable(),
  nombre: z.string().trim().min(1).max(100).optional(),
  // Multi-rol: array de roles válidos sin duplicados.
  roles: z.array(z.enum(ROLES)).optional(),
  activo: z.boolean().optional(),
  // Si viene password (no vacío), se rehashea. Si viene null/"" o no viene, no se toca.
  password: z.string().min(6).max(100).optional().nullable(),
  // trabajadorId: null para desvincular, número para vincular. Undefined = no tocar.
  trabajadorId: z.number().int().positive().optional().nullable(),
});

// GET /api/usuarios/:id — detalle de una cuenta.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const { id } = await ctx.params;
  try {
    const u = await prisma.usuario.findUnique({
      where: { id: (parseInt4Safe(id) ?? 0) },
      select: {
        id: true, codigoEmpleado: true, email: true, dni: true,
        nombre: true, roles: true, activo: true, trabajadorId: true,
        createdAt: true, updatedAt: true,
        trabajador: { select: { trabajador_id: true, nombre: true, area: true, puesto: true } },
      },
    });
    if (!u) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ data: u });
  } catch (error) {
    console.error("GET /api/usuarios/[id] error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

// PUT /api/usuarios/:id — actualiza cuenta. Cambios habituales: roles, activo,
// password (reset por admin), vincular/desvincular trabajador.
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const { id } = await ctx.params;
  try {
    const body = await req.json();
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;

    if (d.trabajadorId) {
      const dup = await prisma.usuario.findFirst({
        where: { trabajadorId: d.trabajadorId, NOT: { id: (parseInt4Safe(id) ?? 0) } },
      });
      if (dup) {
        return NextResponse.json({ error: `Ese trabajador ya está vinculado a ${dup.codigoEmpleado}` }, { status: 409 });
      }
    }

    const data: Record<string, unknown> = {};
    if (d.codigoEmpleado !== undefined) data.codigoEmpleado = d.codigoEmpleado;
    if (d.email !== undefined) data.email = d.email;
    if (d.dni !== undefined) data.dni = d.dni;
    if (d.nombre !== undefined) data.nombre = d.nombre;
    if (d.roles !== undefined) {
      const rolesUnicos = [...new Set(d.roles)];
      data.roles = rolesUnicos.length > 0 ? rolesUnicos : ["viewer"];
    }
    if (d.activo !== undefined) data.activo = d.activo;
    if (d.trabajadorId !== undefined) data.trabajadorId = d.trabajadorId;
    if (d.password) data.password = await bcrypt.hash(d.password, 10);

    const updated = await prisma.usuario.update({
      where: { id: (parseInt4Safe(id) ?? 0) },
      data,
      select: {
        id: true, codigoEmpleado: true, email: true, dni: true,
        nombre: true, roles: true, activo: true, trabajadorId: true,
      },
    });
    return NextResponse.json({ data: updated });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error";
    if (msg.includes("P2002")) {
      return NextResponse.json({ error: "Conflicto: código, email o DNI ya está en uso" }, { status: 409 });
    }
    if (msg.includes("P2025")) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }
    console.error("PUT /api/usuarios/[id] error:", error);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

// DELETE /api/usuarios/:id — soft-delete (marca activo=false). No borramos
// físicamente porque la cuenta pudo haber creado registros (usuario_crea en OT).
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const { id } = await ctx.params;
  try {
    await prisma.usuario.update({
      where: { id: (parseInt4Safe(id) ?? 0) },
      data: { activo: false },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error";
    if (msg.includes("P2025")) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }
    console.error("DELETE /api/usuarios/[id] error:", error);
    return NextResponse.json({ error: "Error al desactivar" }, { status: 500 });
  }
}
