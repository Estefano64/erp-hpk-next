// Adjuntos (fotos/documentos) de una tarea de planificación (PlanificacionOT).
// Los sube el técnico al pausar/finalizar; los ve el técnico y el planner.
// Patrón presigned R2: el archivo ya está en R2 (vía upload-url); acá se registra.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteObject } from "@/lib/r2-helpers";
import { R2Keys, otCodigoFor } from "@/lib/r2";
import { splitRecursos } from "@/lib/recursos";

type Ctx = { params: Promise<{ id: string }> };

// Carga la tarea + valida que el usuario sea el técnico asignado o admin.
async function loadPlanConAcceso(planId: number, userId: number) {
  const me = await prisma.usuario.findUnique({
    where: { id: userId },
    select: { roles: true, trabajador: { select: { nombre: true } } },
  });
  const plan = await prisma.planificacionOT.findUnique({
    where: { id: planId },
    select: { id: true, tecnico: true, orden_trabajo: { select: { id: true, ot: true } } },
  });
  if (!plan) return { plan: null, puedeEscribir: false, usuario: me?.trabajador?.nombre ?? null };
  const esAdmin = me?.roles.includes("admin") ?? false;
  const miNombre = me?.trabajador?.nombre ?? "";
  const puedeEscribir = esAdmin || (!!miNombre && splitRecursos(plan.tecnico).includes(miNombre));
  return { plan, puedeEscribir, usuario: miNombre || null };
}

// GET — lista adjuntos de la tarea (cualquier usuario autenticado: técnico + planner).
export async function GET(req: NextRequest, ctx: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await ctx.params;
  const planId = Number(id);
  if (!Number.isFinite(planId) || planId <= 0) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  const data = await prisma.planificacionOTAdjunto.findMany({
    where: { planificacion_ot_id: planId },
    orderBy: { fecha_subida: "desc" },
  });
  return NextResponse.json({ data });
}

// POST — registra un adjunto ya subido a R2. Body: { key, nombre_archivo, tipo_mime, tamano }
export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await ctx.params;
  const planId = Number(id);
  if (!Number.isFinite(planId) || planId <= 0) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const userId = Number((session.user as { id?: string }).id);
  const { plan, puedeEscribir, usuario } = await loadPlanConAcceso(planId, userId);
  if (!plan) return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
  if (!puedeEscribir) return NextResponse.json({ error: "Esta tarea no está asignada a vos" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const { key, nombre_archivo, tipo_mime, tamano } = body as {
    key?: unknown; nombre_archivo?: unknown; tipo_mime?: unknown; tamano?: unknown;
  };

  const expectedPrefix = (plan.orden_trabajo
    ? R2Keys.planificacionAdjunto(otCodigoFor(plan.orden_trabajo), planId)
    : R2Keys.planificacionSueltaAdjunto(planId)) + "/";
  if (typeof key !== "string" || !key.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: "key fuera del namespace de la tarea" }, { status: 400 });
  }
  if (typeof nombre_archivo !== "string" || nombre_archivo.length === 0) {
    return NextResponse.json({ error: "nombre_archivo requerido" }, { status: 400 });
  }
  if (typeof tipo_mime !== "string" || tipo_mime.length === 0) {
    return NextResponse.json({ error: "tipo_mime requerido" }, { status: 400 });
  }
  if (typeof tamano !== "number" || !Number.isFinite(tamano) || tamano <= 0) {
    return NextResponse.json({ error: "tamano inválido" }, { status: 400 });
  }

  const created = await prisma.planificacionOTAdjunto.create({
    data: { planificacion_ot_id: planId, nombre_archivo, r2_key: key, tipo_mime, tamano, usuario_sube: usuario },
  });
  return NextResponse.json({ data: created }, { status: 201 });
}

// DELETE — quita un adjunto. Body: { adjunto_id }. Solo técnico asignado o admin.
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await ctx.params;
  const planId = Number(id);
  const body = await req.json().catch(() => ({}));
  const adjuntoId = Number(body.adjunto_id);
  if (!Number.isFinite(adjuntoId)) {
    return NextResponse.json({ error: "adjunto_id requerido" }, { status: 400 });
  }

  const userId = Number((session.user as { id?: string }).id);
  const { plan, puedeEscribir } = await loadPlanConAcceso(planId, userId);
  if (!plan) return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
  if (!puedeEscribir) return NextResponse.json({ error: "Esta tarea no está asignada a vos" }, { status: 403 });

  const adj = await prisma.planificacionOTAdjunto.findUnique({ where: { id: adjuntoId } });
  if (!adj || adj.planificacion_ot_id !== planId) {
    return NextResponse.json({ error: "Adjunto no encontrado" }, { status: 404 });
  }
  try {
    await deleteObject(adj.r2_key);
  } catch (error) {
    console.error("DELETE adjunto planificacion: fallo R2", error);
    return NextResponse.json({ error: "No se pudo eliminar el archivo de R2" }, { status: 500 });
  }
  await prisma.planificacionOTAdjunto.delete({ where: { id: adjuntoId } });
  return NextResponse.json({ success: true });
}
