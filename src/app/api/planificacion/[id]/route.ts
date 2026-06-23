import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { prisma } from "@/lib/prisma";
import { calcularFinEstimado, normalizarAInicioHabil } from "@/lib/planification-hours";
import { splitRecursos } from "@/lib/recursos";
import { cascadeEmergencia, cascadeReprogramar } from "@/lib/emergencia-cascade";

import { parseInt4Safe } from "@/lib/ot-formato";
dayjs.extend(isoWeek);

type Ctx = { params: Promise<{ id: string }> };

const UpdateSchema = z.object({
  // Asignar/limpiar la OT de una tarea (null = tarea sin OT). Desde Planificación.
  ot_id: z.coerce.number().int().positive().nullable().optional(),
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
  comentario: z.string().trim().optional().nullable(),
  semana_plan: z.string().trim().optional().nullable(),
  // Volver una tarea a borrador (publicado=false). Publicar/reabrir en lote se hace
  // por /publicar; acá se permite limpiar el flag al re-ubicar una tarea del pool
  // que lo arrastraba sin agenda (ver persistMove en Programación Semanal).
  publicado: z.boolean().optional(),
  // Cambiar la Parte/Tarea de una tarea existente (desde el detalle de OT). Son
  // campos "virtuales": se resuelven a las columnas componente/operacion_codigo/
  // descripcion antes del update (no se mandan tal cual a Prisma).
  componente_codigo: z.string().trim().optional(),
  operacion_reparacion_codigo: z.string().trim().optional().nullable(),
  trabajo: z.string().trim().optional(),
  tipo_reparacion: z.string().trim().optional().nullable(),
  qty_personal: z.coerce.number().int().min(1).optional(),
  horas_extras: z.boolean().optional(),
  horas_extras_qty: z.coerce.number().min(0).optional().nullable(),
  trabajo_externo: z.boolean().optional(),
  orden: z.coerce.number().int().min(0).optional(),
  // Prioridad de la tarea = correctiva (emergencia) o no. Marcar como correctiva
  // con cascada se hace por /emergencia; acá se permite VOLVER a normal (false).
  es_correctivo: z.boolean().optional(),
  // Si true, ignora el check de estado=realizado (uso interno: revertir)
  forzarEdicion: z.boolean().optional(),
  // Si true, salta el anti-solape de servidor (el multi-move ya valida el grupo
  // entero en el cliente; sus PUTs paralelos verían posiciones viejas si no).
  omitirAntisolape: z.boolean().optional(),
  // Si true: "empujar al soltar". En vez de bloquear por choque de OPERARIO,
  // ubica la tarea y empuja a las siguientes del operario (no toca terminadas /
  // en proceso). El choque de MÁQUINA sí sigue bloqueando (recurso compartido).
  empujar: z.boolean().optional(),
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
    where: { id: (parseInt4Safe(id) ?? 0) },
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
    const planId = parseInt4Safe(id) ?? 0;
    const body = await req.json();
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const input = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.planificacionOT.findUnique({ where: { id: planId } });
      if (!current) throw Object.assign(new Error("No encontrado"), { code: "NOT_FOUND" });

      // Nota: la concurrencia optimista por `version` se quitó — ahora la
      // exclusividad la maneja el lock pesimista (useEditLock) en planificación
      // y programación semanal.

      // ── Bloquear edición si estado = realizado ──
      const isRealizado = current.estado === "realizado";
      const intentaEditar = Object.keys(input).some((k) => k !== "forzarEdicion" && input[k as keyof typeof input] !== undefined);
      const camposReales = Object.keys(input).filter((k) => !["forzarEdicion", "omitirAntisolape", "empujar"].includes(k));
      const soloRevertirEstado = camposReales.length === 1
        && input.estado !== undefined && input.estado !== "realizado";
      // El planner puede REGULARIZAR la ejecución real de una tarea ya terminada
      // (técnico que marcó tarde, olvidó iniciar/pausar, o trabajó sin sistema):
      // inicio real, fin real y/o horas reales — solo esos campos, nada del plan.
      const CAMPOS_EJECUCION = ["fecha_inicio_real", "fecha_fin_real", "horas_reales"];
      const soloEjecucionReal = camposReales.length >= 1
        && camposReales.every((k) => CAMPOS_EJECUCION.includes(k));
      // Dejar un comentario es una nota informativa: se permite aunque la tarea ya
      // esté realizada (no toca la planificación ni la ejecución).
      const soloComentario = camposReales.length === 1 && input.comentario !== undefined;
      if (isRealizado && intentaEditar && !input.forzarEdicion && !soloRevertirEstado && !soloEjecucionReal && !soloComentario) {
        throw Object.assign(
          new Error("Tarea en estado 'realizado' no puede editarse. Cambiá el estado primero o usá forzarEdicion=true."),
          { code: "REALIZADO_LOCKED" },
        );
      }

      // ── Construir patch base ──
      const data: Record<string, unknown> = {};
      const dateFields = new Set(["fecha_inicio", "fecha_fin", "fecha_inicio_real", "fecha_fin_real"]);
      // Flags de control + campos virtuales: NO son columnas de la BD, no deben ir
      // al update de Prisma. Los virtuales (componente_codigo/operacion_reparacion_
      // codigo/trabajo) se resuelven aparte a componente/operacion_codigo/descripcion.
      const flagsControl = new Set([
        "forzarEdicion", "omitirAntisolape", "empujar",
        "componente_codigo", "operacion_reparacion_codigo", "trabajo",
      ]);
      for (const k of Object.keys(input) as Array<keyof typeof input>) {
        if (flagsControl.has(k as string)) continue;
        const v = input[k];
        if (v === undefined) continue;
        if (dateFields.has(k as string)) data[k] = toDate(v as string | null);
        else data[k] = v;
      }

      // ── Cambio de Parte/Tarea (resolver campos virtuales → columnas) ──
      if (input.componente_codigo !== undefined) {
        data.componente = input.componente_codigo || "General";
      }
      const cambiaTarea = input.operacion_reparacion_codigo !== undefined || input.trabajo !== undefined;
      if (cambiaTarea) {
        if (input.operacion_reparacion_codigo) {
          const op = await tx.operacionReparacion.findUnique({
            where: { codigo: input.operacion_reparacion_codigo },
            select: { codigo: true, nombre: true },
          });
          if (!op) {
            throw Object.assign(
              new Error(`Operación ${input.operacion_reparacion_codigo} no existe`),
              { code: "OP_NOT_FOUND" },
            );
          }
          data.operacion_codigo = op.codigo;
          data.descripcion = input.trabajo?.trim() || op.nombre;
        } else if (input.trabajo?.trim()) {
          // Texto libre (operación no estándar sin código de catálogo).
          const txt = input.trabajo.trim();
          data.operacion_codigo = txt.slice(0, 20);
          data.descripcion = txt;
        }
        // Al reemplazar la operación, la tarea deja de corresponder al item del
        // template: soltamos el link para no dejar referencia inconsistente.
        data.operacion_cod_rep_id = null;
      }

      // ── Tarea ya iniciada por el técnico: no se reprograma ──
      // Si está en proceso o pausada (tiene ejecución real), bloqueamos cambios de
      // fecha/semana desde cualquier vía (planner). El técnico maneja su avance por
      // los endpoints iniciar/pausar/finalizar. `forzarEdicion` lo permite (revertir).
      const iniciada = current.estado === "en_proceso" || current.estado === "pausado";
      const reprograma = "fecha_inicio" in data || "fecha_fin" in data || "semana_plan" in data;
      // Tarea ya iniciada: se permite AJUSTAR LA DURACIÓN estimada (recalcula el
      // fin), pero NO moverla — cambiar su inicio/semana se bloquea, porque su
      // arranque ya es ejecución real. `forzarEdicion` lo permite (revertir).
      const mueveInicio = "fecha_inicio" in data || "semana_plan" in data;
      if (iniciada && mueveInicio && !input.forzarEdicion) {
        throw Object.assign(
          new Error("La tarea ya fue iniciada por el técnico; no se puede mover (sí ajustar la duración)."),
          { code: "INICIADA_LOCKED" },
        );
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
          // También el fin: para tareas HE el recálculo de abajo no corre (el fin
          // es manual) y quedaba una fecha_fin colgada sin inicio.
          data.fecha_fin = null;
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
      if (!finalHE) {
        if (finalIni && finalDur > 0) {
          data.fecha_fin = calcularFinEstimado(finalIni, finalDur * Math.max(1, finalQty));
        } else {
          // Sin fecha de inicio o sin duración no hay Fin Estimado posible.
          data.fecha_fin = null;
        }
      }

      // ── Anti-solape (defensa de servidor) ──
      // Una tarea NORMAL no puede quedar encima de otra del mismo recurso. Cubre
      // cualquier vía (Gantt, Planificación, OT) y casos que el chequeo cliente no
      // detecta (multi-personal). Solo al reprogramar (cambia fecha/semana); las
      // emergencias quedan exentas (se ubican encima a propósito y empujan al resto).
      const finalFin = data.fecha_fin !== undefined ? (data.fecha_fin as Date | null) : current.fecha_fin;
      const finalTec = (data.tecnico !== undefined ? data.tecnico : current.tecnico) as string | null;
      const finalMaq = (data.maquina !== undefined ? data.maquina : current.maquina) as string | null;
      if (reprograma && finalIni && finalFin && !current.es_correctivo && !input.forzarEdicion && !input.omitirAntisolape) {
        const misTec = splitRecursos(finalTec);
        const misMaq = splitRecursos(finalMaq);
        if (misTec.length || misMaq.length) {
          const otras = await tx.planificacionOT.findMany({
            where: {
              id: { not: planId },
              es_correctivo: false,
              estado: { not: "cancelado" },
              fecha_inicio: { lt: finalFin },
              fecha_fin: { gt: finalIni },
            },
            select: { tecnico: true, maquina: true, descripcion: true, orden_trabajo: { select: { ot: true } } },
          });
          // Distinguimos si el choque es por OPERARIO o por MÁQUINA (la máquina de
          // soldar es un recurso compartido: dos operarios no pueden usarla a la
          // vez). Reportamos el recurso exacto + con quién para que se entienda.
          let choque: typeof otras[number] | null = null;
          let tipo: "máquina" | "operario" | null = null;
          let recursoComun = "";
          for (const o of otras) {
            const comparteOperario = misTec.some((t) => splitRecursos(o.tecnico).includes(t));
            if (input.empujar) {
              // Con "empujar": las tareas del MISMO operario se reacomodan en la
              // cascada, así que no bloquean (ni por operario ni por su máquina —
              // que dejará de solapar al moverse). Solo frena un choque de máquina
              // con OTRO operario, cuyas tareas no podemos mover.
              if (comparteOperario) continue;
              const maqComun = misMaq.find((m) => splitRecursos(o.maquina).includes(m));
              if (maqComun) { choque = o; tipo = "máquina"; recursoComun = maqComun; break; }
              continue;
            }
            // Sin "empujar": bloquea por máquina o por operario (recurso compartido).
            const maqComun = misMaq.find((m) => splitRecursos(o.maquina).includes(m));
            if (maqComun) { choque = o; tipo = "máquina"; recursoComun = maqComun; break; }
            const tecComun = misTec.find((t) => splitRecursos(o.tecnico).includes(t));
            if (tecComun) { choque = o; tipo = "operario"; recursoComun = tecComun; break; }
          }
          if (choque) {
            const detalleOT = `OT ${choque.orden_trabajo?.ot ?? "?"} — ${choque.descripcion ?? ""}`;
            const quien = tipo === "máquina"
              ? `la máquina ${recursoComun} ya está ocupada por ${choque.tecnico ?? "otro operario"}`
              : `el operario ${recursoComun} ya tiene otra tarea`;
            throw Object.assign(
              new Error(`No se puede ubicar acá: ${quien} en ese horario (${detalleOT}).`),
              { code: "OVERLAP" },
            );
          }
        }
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

      // 7c) programado → abierto cuando la tarea pierde su fecha (vuelve al pool).
      // Es la inversa de 7b: sin esto, el pool mostraba tareas "programadas" sin
      // agenda (estado colgado al cambiar de semana / sacar de la semana / quitar HE).
      // Se chequea estadoFinal (no estadoActual) para no pisar 7a (fin real → realizado).
      if (estadoFinal === "programado" && !finalIni && !estadoEnviado) {
        estadoFinal = "abierto";
      }

      if (estadoFinal !== estadoActual) {
        data.estado = estadoFinal;
      }

      // Una tarea sin agenda no es un plan congelado: si pierde su fecha, vuelve a
      // borrador. Evita el flag `publicado` colgado en el pool (no editable y sin
      // carril donde reabrirla).
      if (!finalIni && current.publicado && input.publicado === undefined) {
        data.publicado = false;
      }

      const updated = await tx.planificacionOT.update({
        where: { id: planId },
        data,
        include: { capturas: true, operacion_cod_rep: true },
      });

      // Si es una EMERGENCIA y cambió de fecha o de técnico, reacomodar el día del
      // (nuevo) operario — desde CUALQUIER vía (Gantt, Planificación, OT), no solo
      // el botón 🚨. Así la reprogramación no "deja de funcionar" al reasignarla.
      const tecnicoCambia = "tecnico" in data || "maquina" in data;
      let push: { empujadas: number[]; alPool: number[] } | null = null;
      if (updated.es_correctivo && (reprograma || tecnicoCambia)) {
        await cascadeEmergencia(tx, planId);
      } else if (input.empujar && reprograma) {
        // "Empujar al soltar": ubicada la tarea, empujamos a las siguientes del
        // operario (sin marcar correctiva, sin tocar terminadas/en proceso).
        push = await cascadeReprogramar(tx, planId, { marcarCorrectivo: false, cruzarDias: true });
      }

      // Al cancelar (o finalizar) una tarea, cerrar cualquier sesión abierta para
      // que no quede el cronómetro "Trabajando ahora" colgado en el dashboard.
      if (estadoFinal === "cancelado" || estadoFinal === "realizado") {
        await tx.planificacionOTSesion.updateMany({
          where: { planificacion_ot_id: planId, fin: null },
          data: { fin: new Date(), cierre: estadoFinal === "cancelado" ? "cancelado" : "finalizado" },
        });
      }
      return { updated, push };
    });

    return NextResponse.json({ data: result.updated, push: result.push });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err?.code === "NOT_FOUND") return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (err?.code === "REALIZADO_LOCKED") return NextResponse.json({ error: err.message }, { status: 423 });
    if (err?.code === "INICIADA_LOCKED") return NextResponse.json({ error: err.message }, { status: 423 });
    if (err?.code === "OVERLAP") return NextResponse.json({ error: err.message }, { status: 409 });
    if (err?.code === "HE_INVALID") return NextResponse.json({ error: err.message }, { status: 400 });
    if (err?.code === "OP_NOT_FOUND") return NextResponse.json({ error: err.message }, { status: 400 });
    if ((err as { code?: string })?.code === "P2025") return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    console.error("PUT /api/planificacion/[id] error:", error);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    await prisma.planificacionOT.delete({ where: { id: (parseInt4Safe(id) ?? 0) } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err?.code === "P2025") return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    console.error("DELETE /api/planificacion/[id] error:", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
