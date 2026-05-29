import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/permisos";

// Solo cuentas con rol "admin" pueden listar / crear / editar usuarios.
async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!hasRole(session, "admin")) return null;
  return session;
}

// GET /api/usuarios — lista cuentas. ?trabajadorId=N para filtrar por trabajador
// (lo usa la UI de trabajadores para saber si una persona ya tiene cuenta).
export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  try {
    const { searchParams } = req.nextUrl;
    const trabajadorIdRaw = searchParams.get("trabajadorId");
    const search = searchParams.get("search")?.trim();
    const where: Record<string, unknown> = {};
    if (trabajadorIdRaw) where.trabajadorId = Number(trabajadorIdRaw);
    if (search) {
      where.OR = [
        { nombre: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { codigoEmpleado: { contains: search, mode: "insensitive" } },
      ];
    }
    const data = await prisma.usuario.findMany({
      where,
      orderBy: { nombre: "asc" },
      select: {
        id: true,
        codigoEmpleado: true,
        email: true,
        dni: true,
        nombre: true,
        roles: true,
        activo: true,
        trabajadorId: true,
        createdAt: true,
        updatedAt: true,
        trabajador: { select: { trabajador_id: true, nombre: true, area: true, puesto: true } },
      },
    });
    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/usuarios error:", error);
    return NextResponse.json({ error: "Error obteniendo usuarios" }, { status: 500 });
  }
}

// Roles válidos del sistema. Los marcados como "placeholder" no afectan acceso
// todavía — el admin puede asignarlos pero la sidebar/permisos asociados se
// implementan en una fase posterior.
const ROLES = [
  "admin",                  // todo
  "viewer",                 // solo lectura
  "tecnico",                // operario + panel personal
  "evaluador",              // aparece en "Evaluado por"
  "aprobador_evaluacion",   // aparece en "Supervisor" + aprueba hojas
  "aprobador_requerimiento",// aprueba requerimientos
  "planner",                // placeholder
  "supervisor",             // placeholder
  "logistica",              // placeholder
  "mantenimiento",          // placeholder
  "contabilidad",           // placeholder
] as const;

const CreateSchema = z.object({
  codigoEmpleado: z.string().trim().min(1).max(20),
  email: z.string().trim().email().optional().nullable(),
  dni: z.string().trim().optional().nullable(),
  nombre: z.string().trim().min(1).max(100),
  // Multi-rol: array de códigos válidos, sin duplicados, no vacío
  // (mínimo "viewer" si el admin no asignó otra cosa).
  roles: z.array(z.enum(ROLES)).default(["viewer"]),
  password: z.string().min(6).max(100),
  activo: z.boolean().optional(),
  trabajadorId: z.number().int().positive().optional().nullable(),
});

// POST /api/usuarios — crea cuenta. Si trabajadorId viene, valida que ese
// trabajador no tenga ya una cuenta (campo @unique en la BD).
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;

    if (d.trabajadorId) {
      const dup = await prisma.usuario.findUnique({ where: { trabajadorId: d.trabajadorId } });
      if (dup) {
        return NextResponse.json({ error: `Este trabajador ya tiene una cuenta (${dup.codigoEmpleado})` }, { status: 409 });
      }
    }

    // De-dup el array de roles (por las dudas) y aseguramos que tenga al menos uno.
    const rolesUnicos = [...new Set(d.roles)];
    if (rolesUnicos.length === 0) rolesUnicos.push("viewer");

    const hashed = await bcrypt.hash(d.password, 10);
    const created = await prisma.usuario.create({
      data: {
        codigoEmpleado: d.codigoEmpleado,
        email: d.email ?? null,
        dni: d.dni ?? null,
        nombre: d.nombre,
        roles: rolesUnicos,
        activo: d.activo ?? true,
        password: hashed,
        trabajadorId: d.trabajadorId ?? null,
      },
      select: {
        id: true, codigoEmpleado: true, email: true, dni: true,
        nombre: true, roles: true, activo: true, trabajadorId: true,
      },
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error";
    // Prisma P2002 = unique constraint (email/codigoEmpleado/dni duplicados).
    if (msg.includes("P2002")) {
      return NextResponse.json({ error: "Ya existe un usuario con ese código, email o DNI" }, { status: 409 });
    }
    console.error("POST /api/usuarios error:", error);
    return NextResponse.json({ error: "Error al crear usuario" }, { status: 500 });
  }
}
