import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { prisma } from "@/lib/prisma";
import { calcularFinEstimado, normalizarAInicioHabil } from "@/lib/planification-hours";

dayjs.extend(isoWeek);

type Ctx = { params: Promise<{ id: string }> };

const UpdateSchema = z.object({
  estado: z.enum(["abierto", "programado", "realizado", "correctivo", "cancelado"]).optional(),
  tecnico: z.string().trim().optional().nullable(),
  maquina: z.string().trim().optional().nullable(),
  fecha_inicio: z.string().optional().nullable(),
  fecha_fin: z.string().optional().nullable(),
  fecha_inicio_real: z.string().optional().nullable(),
  fecha_fin_real: z.string().optional().nullable(),
  horas_estimadas: z.coerce.number().min(0).optional().nullable(),
  horas_reales: z.coerce.number().min(0).optional().nullable(),
  observaciones: z.string().trim().optional().nullable(),
  semana_plan: z.string().trim().optional().nullable(),
  qty_personal: z.coerce.number().int().min(1).optional(),
  horas_extras: z.boolean().optional(),
  horas_extras_qty: z.coerce.number().min(0).optional().nullable(),
  orden: z.coerce.number().int().min(0).optional(),
  // Versioning para concurrencia optimista
  version: z.coerce.number().int().min(1).optional(),
  // Si true, ignora el check de estado=realizado (uso interno: revertir)
  forzarEdicion: z.boolean().optional(),
});

function toDate(s: string | null | undefined): Date | null {
  if (s === null) return null;
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function semanaCodigoFromDate(d: Date): string {
  const dj = dayjs(d);
  return `${dj.isoWeekYear()}W${String(dj.isoWeek()).padStart(2, "0")}`;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const item = await prisma.planificacionOT.findUnique({
    where: { id: Number(id) },
    include: {
      operacion_cod_rep: true,
      capturas: { orderBy: { id: "asc" } },
      orden_trabajo: { select: { id: true, ot: true } },
    },
  });
  if (!item) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ data: item });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const planId = Number(id);
    const body = await req.json();
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const input = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.planificacionOT.findUnique({ where: { id: planId } });
      if (!current) throw Object.assign(new Error("No encontrado"), { code: "NOT_FOUND" });

      // ── 1) Versioning (optimistic concurrency) ──
      if (input.version != null && input.version !== current.version) {
        throw Object.assign(
          new Error(`Conflicto: la tarea fue modificada por otro usuario (versión actual: ${current.version}, enviada: ${input.version})`),
          { code: "CONFLICT", currentVersion: current.version },
        );
      }

      // ── 2) Bloquear edición si estado = realizado ──
      const isRealizado = current.estado === "realizado";
      const intentaEditar = Object.keys(input).some((k) => k !== "version" && k !== "forzarEdicion" && input[k as keyof typeof input] !== undefined);
      const soloRevertirEstado = Object.keys(input).filter((k) => k !== "version" && k !== "forzarEdicion").length === 1
        && input.estado !== undefined && input.estado !== "realizado";
      if (isRealizado && intentaEditar && !input.forzarEdicion && !soloRevertirEstado) {
        throw Object.assign(
          new Error("Tarea en estado 'realizado' no puede editarse. Cambiá el estado primero o usá forzarEdicion=true."),
          { code: "REALIZADO_LOCKED" },
        );
      }

      // ── 3) Construir patch base ──
      const data: Record<string, unknown> = {};
      const dateFields = new Set(["fecha_inicio", "fecha_fin", "fecha_inicio_real", "fecha_fin_real"]);
      for (const k of Object.keys(input) as Array<keyof typeof input>) {
        if (k === "version" || k === "forzarEdicion") continue;
        const v = input[k];
        if (v === undefined) continue;
        if (dateFields.has(k as string)) data[k] = toDate(v as string | null);
        else data[k] = v;
      }

      // ── 4) Auto-sync fecha_inicio ↔ semana_plan ──
      const fechaInicioCambia = "fecha_inicio" in data;
      const semanaCambia = "semana_plan" in data;

      if (fechaInicioCambia && data.fecha_inicio) {
        // Cambia fecha_inicio: recalcular semana_plan automáticamente
        data.semana_plan = semanaCodigoFromDate(data.fecha_inicio as Date);
      } else if (semanaCambia && !fechaInicioCambia) {
        // Cambia solo semana_plan (sin tocar fecha): la fecha vieja queda inconsistente, borrarla
        const nuevaSemana = data.semana_plan as string | null;
        const semanaActualDeFecha = current.fecha_inicio ? semanaCodigoFromDate(current.fecha_inicio) : null;
        if (nuevaSemana && nuevaSemana !== semanaActualDeFecha) {
          data.fecha_inicio = null;
        }
      }

      // ── 5) Normalizar fecha_inicio a jornada hábil (si no es HE) ──
      const finalHE = (input.horas_extras !== undefined ? input.horas_extras : current.horas_extras) ?? false;
      if (data.fecha_inicio && !finalHE) {
        const normalizada = normalizarAInicioHabil(data.fecha_inicio as Date);
        data.fecha_inicio = normalizada;
        data.semana_plan = semanaCodigoFromDate(normalizada);
      }

      // ── 6) Validaciones HE coherente ──
      const finalHEQty = input.horas_extras_qty !== undefined
        ? Number(input.horas_extras_qty ?? 0)
        : Number(current.horas_extras_qty ?? 0);
      if (finalHE && finalHEQty <= 0) {
        throw Object.assign(
          new Error("Si HE está marcado, Qty HE debe ser > 0."),
          { code: "HE_INVALID" },
        );
      }
      // Si HE=false → fecha_fin se recalcula automáticamente (ignora lo que mandó el cliente, salvo que sea null)
      const finalDur = input.horas_estimadas !== undefined ? Number(input.horas_estimadas ?? 0) : Number(current.horas_estimadas ?? 0);
      const finalQty = input.qty_personal !== undefined ? Number(input.qty_personal ?? 1) : Number(current.qty_personal ?? 1);
      const finalIni = data.fecha_inicio !== undefined ? (data.fecha_inicio as Date | null) : current.fecha_inicio;
      if (!finalHE && finalIni && finalDur > 0) {
        const fin = calcularFinEstimado(finalIni, finalDur * Math.max(1, finalQty));
        data.fecha_fin = fin;
      }

      // ── 7) Auto-transiciones de estado ──
      const estadoActual = current.estado ?? "abierto";
      const estadoEnviado = input.estado;
      let estadoFinal = estadoEnviado ?? estadoActual;

      // 7a) Setear fecha_fin_real → estado = realizado
      const seteaFinReal = "fecha_fin_real" in data && data.fecha_fin_real != null;
      if (seteaFinReal && !estadoEnviado) {
        estadoFinal = "realizado";
      }

      // 7b) abierto → programado cuando se asigna fecha_inicio + recurso
      const finalRecurso = input.tecnico !== undefined || input.maquina !== undefined
        ? ((data.tecnico as string | null) ?? current.tecnico) || ((data.maquina as string | null) ?? current.maquina)
        : current.tecnico || current.maquina;
      if (estadoActual === "abierto" && finalIni && finalRecurso && !estadoEnviado) {
        estadoFinal = "programado";
      }

      if (estadoFinal !== estadoActual) {
        data.estado = estadoFinal;
      }

      // ── 8) Incrementar version ──
      data.version = current.version + 1;

      const updated = await tx.planificacionOT.update({
        where: { id: planId },
        data,
        include: { capturas: true, operacion_cod_rep: true },
      });
      return updated;
    });

    return NextResponse.json({ data: result });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string; currentVersion?: number };
    if (err?.code === "NOT_FOUND") return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (err?.code === "CONFLICT") {
      return NextResponse.json({ error: err.message, currentVersion: err.currentVersion }, { status: 409 });
    }
    if (err?.code === "REALIZADO_LOCKED") return NextResponse.json({ error: err.message }, { status: 423 });
    if (err?.code === "HE_INVALID") return NextResponse.json({ error: err.message }, { status: 400 });
    if ((err as { code?: string })?.code === "P2025") return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    console.error("PUT /api/planificacion/[id] error:", error);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    await prisma.planificacionOT.delete({ where: { id: Number(id) } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err?.code === "P2025") return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    console.error("DELETE /api/planificacion/[id] error:", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
