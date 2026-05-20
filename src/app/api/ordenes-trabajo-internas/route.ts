import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";

// Genera el siguiente código OT-INT-0001 (numeración global, sin año).
// Decidido con el usuario en Fase D2.
async function generarNumeroOTInterna(): Promise<string> {
  const prefix = "OT-INT-";

  const last = await prisma.ordenTrabajoInterna.findFirst({
    where: { ot: { startsWith: prefix } },
    orderBy: { id: "desc" },
    select: { ot: true },
  });

  const lastNum = last?.ot ? parseInt(last.ot.replace(prefix, ""), 10) : 0;
  return `${prefix}${String(lastNum + 1).padStart(4, "0")}`;
}

// GET — lista con filtros y paginación.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit = Math.min(10000, Math.max(1, Number(searchParams.get("limit") ?? 20)));
    const search = searchParams.get("search")?.trim() ?? "";
    const tipo = searchParams.get("tipo") ?? "";
    const otStatus = searchParams.get("ot_status") ?? "";
    const equipo = searchParams.get("equipo") ?? "";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (search) {
      where.OR = [
        { ot: { contains: search, mode: "insensitive" } },
        { equipo_codigo: { contains: search, mode: "insensitive" } },
        { descripcion: { contains: search, mode: "insensitive" } },
      ];
    }
    if (tipo) where.tipo_ot_interna_codigo = tipo;
    if (otStatus) where.ot_status_codigo = otStatus;
    if (equipo) where.equipo_codigo = equipo;

    const [data, total] = await Promise.all([
      prisma.ordenTrabajoInterna.findMany({
        where,
        include: {
          planta: true,
          equipo: { select: { codigo: true, descripcion: true } },
          tipo_ot_interna: true,
          prioridad_atencion: true,
          estrategia: { select: { estrategia_id: true, codigo: true, descripcion: true } },
          user_status: true,
          ot_status: true,
          recursos_status: true,
        },
        orderBy: { id: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.ordenTrabajoInterna.count({ where }),
    ]);

    return NextResponse.json({ data, total, page });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

// POST — crea una OT interna con número auto-generado.
// Campos mínimos requeridos (decisión del usuario en Fase D2):
//   tipo_ot_interna_codigo, equipo_codigo, descripcion.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.tipo_ot_interna_codigo) {
      return NextResponse.json({ error: "tipo_ot_interna_codigo es requerido" }, { status: 400 });
    }
    if (!body.equipo_codigo) {
      return NextResponse.json({ error: "equipo_codigo es requerido" }, { status: 400 });
    }
    if (!body.descripcion || typeof body.descripcion !== "string" || !body.descripcion.trim()) {
      return NextResponse.json({ error: "descripcion es requerida" }, { status: 400 });
    }

    const ot = await generarNumeroOTInterna();
    const usuarioCrea = (await getAuditUser(req)) ?? "sistema";

    const created = await prisma.ordenTrabajoInterna.create({
      data: {
        ot,
        planta_codigo: body.planta_codigo || null,
        equipo_codigo: body.equipo_codigo,
        tipo_ot_interna_codigo: body.tipo_ot_interna_codigo,
        descripcion: body.descripcion.trim(),
        prioridad_atencion_codigo: body.prioridad_atencion_codigo || null,
        usuario_crea: usuarioCrea,
        fecha_inicio_plan: body.fecha_inicio_plan ? new Date(body.fecha_inicio_plan) : null,
        fecha_fin_plan: body.fecha_fin_plan ? new Date(body.fecha_fin_plan) : null,
        semana_revision: body.semana_revision || null,
        estrategia_id: body.estrategia_id ? Number(body.estrategia_id) : null,
        task_list: body.task_list || null,
        user_status_codigo: body.user_status_codigo || null,
        ot_status_codigo: body.ot_status_codigo || "Abierta",
        recursos_status_codigo: body.recursos_status_codigo || null,
      },
      include: {
        equipo: { select: { codigo: true, descripcion: true } },
        tipo_ot_interna: true,
        ot_status: true,
      },
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}
