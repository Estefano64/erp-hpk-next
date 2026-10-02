/**
 * Tareas de planificación generadas desde la hoja de evaluación.
 *
 * Decisión HP&K 2026-10-02: el catálogo de tareas de una OT es el de la hoja de
 * evaluación (recomendaciones estándar / no estándar por componente), ya no la
 * plantilla por CodRep. Cada recomendación marcada por el técnico se convierte
 * en una fila de `planificacion_ot` con `operacion_codigo = HOJA-EVAL`.
 *
 * Se genera automáticamente al APROBAR la evaluación y también a demanda desde
 * la pestaña Tareas de la OT (POST /api/ordenes-trabajo/[id]/planificacion/desde-evaluacion).
 * Es idempotente: una tarea ya existente para el mismo componente y texto no se
 * vuelve a crear. No borra tareas (si el técnico desmarca una recomendación
 * después de generar, la tarea queda y el planner decide).
 */
import type { Prisma } from "@prisma/client";
import { CATALOGOS_EVALUACION, recomKeyBase } from "@/lib/evaluacion-catalogos";

export const OPERACION_HOJA_EVAL = "HOJA-EVAL";

/** Componente del catálogo de la hoja → código de componente en planificación. */
const COMPONENTE_PLAN: Record<string, string> = {
  cilindro: "CILINDRO",
  vastago: "VASTAGO",
  tapa: "TAPA",
  embolo: "EMBOLO",
  cuerpo_intermedio: "CUERPO INTERMEDIO",
  tapa_posterior: "TAPA POSTERIOR",
  tapa_roscada: "TAPA ROSCADA",
  acumulador: "ACUMULADOR",
  spindle: "SPINDLE",
  hub: "HUB",
  conjunto_freno: "CONJUNTO DE FRENO",
  caja_freno: "CAJA DE FRENO",
  general: "GENERAL",
  sprocket: "FRENO",
  housing: "FRENO",
  piston_servicio: "FRENO",
  piston_parqueo: "FRENO",
};

export interface TareaDesdeEvaluacion {
  componente: string; // código para planificacion_ot.componente
  componente_nombre: string; // nombre del grupo en la hoja (Cilindro, Tapa Roscada…)
  tipo_reparacion: "Estandar" | "NoEstandar";
  descripcion: string;
  key: string; // key completa en datos_formulario (trazabilidad)
}

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Etiqueta del sub-bloque de la hoja (solo etapas del telescópico lo necesitan). */
function etiquetaPrefijo(prefix: string): string {
  const m = prefix.match(/_etapa(\d+)$/);
  return m ? `Etapa ${m[1]}` : "";
}

/** Recomendaciones marcadas en una hoja, ya convertidas a tareas (sin persistir). */
export function tareasDesdeEvaluacion(modelo: string, datos: Record<string, unknown>): TareaDesdeEvaluacion[] {
  const cat = CATALOGOS_EVALUACION[modelo];
  if (!cat) return [];
  // Prefijos presentes en la hoja: todo lo que antecede a "_recom_" (t1, t4_etapa2, t4_tapa_sec…)
  const prefijos = new Set<string>();
  for (const k of Object.keys(datos)) {
    const i = k.indexOf("_recom_");
    if (i > 0) prefijos.add(k.slice(0, i));
  }
  const out: TareaDesdeEvaluacion[] = [];
  const vistos = new Set<string>();
  for (const prefix of prefijos) {
    const etapa = etiquetaPrefijo(prefix);
    for (const [compKey, grupo] of Object.entries(cat.recomendaciones)) {
      for (const [bucket, items] of [["est", grupo.estandar], ["no", grupo.noEstandar]] as const) {
        for (const it of items) {
          const base = recomKeyBase(datos, `${prefix}_recom_${compKey}_${bucket}`, it.key);
          if (!datos[base]) continue;
          const id = `${prefix}|${compKey}|${it.key}`;
          if (vistos.has(id)) continue;
          vistos.add(id);
          let texto = it.texto.trim();
          if (it.subOpciones) {
            const sub = datos[`${base}_sub`];
            if (sub) texto = /\bde$/i.test(texto) ? `${texto} ${String(sub)}` : `${texto} (${String(sub)})`;
          }
          if (it.cantidad) {
            const cant = datos[`${base}_cant`];
            if (cant != null && cant !== "") texto += ` x${String(cant)}`;
          }
          if (etapa) texto = `${etapa} · ${texto}`;
          out.push({
            componente: COMPONENTE_PLAN[compKey] ?? compKey.toUpperCase(),
            componente_nombre: grupo.nombre,
            tipo_reparacion: bucket === "est" ? "Estandar" : "NoEstandar",
            descripcion: texto.slice(0, 200),
            key: base,
          });
        }
      }
    }
  }
  return out;
}

export interface ResultadoGeneracion {
  ot_id: number;
  evaluacion_id: number;
  estado_evaluacion: string;
  marcadas: number;
  creadas: number;
  existentes: number;
}

/**
 * Persiste en `planificacion_ot` las recomendaciones marcadas de una evaluación.
 * Idempotente por (ot, componente, descripción). Usar dentro de una transacción.
 */
export async function generarTareasDesdeEvaluacion(
  tx: Prisma.TransactionClient,
  evaluacionId: number,
  usuario: string,
): Promise<ResultadoGeneracion> {
  const ev = await tx.evaluacionTecnica.findUnique({
    where: { id: evaluacionId },
    select: { id: true, ot_id: true, modelo_evaluacion: true, estado: true, datos_formulario: true },
  });
  if (!ev) throw Object.assign(new Error("Evaluación no encontrada"), { code: "NOT_FOUND" });
  const datos = (ev.datos_formulario ?? {}) as Record<string, unknown>;
  const tareas = tareasDesdeEvaluacion(ev.modelo_evaluacion, datos);

  const existentes = await tx.planificacionOT.findMany({
    where: { ot_id: ev.ot_id },
    select: { componente: true, descripcion: true, orden: true },
  });
  const ya = new Set(existentes.map((e) => `${normalizar(e.componente)}|${normalizar(e.descripcion)}`));
  let orden = existentes.reduce((m, e) => Math.max(m, e.orden), 0);

  const nuevas = tareas.filter((t) => !ya.has(`${normalizar(t.componente)}|${normalizar(t.descripcion)}`));
  if (nuevas.length > 0) {
    await tx.planificacionOT.createMany({
      data: nuevas.map((t) => ({
        ot_id: ev.ot_id,
        componente: t.componente,
        operacion_codigo: OPERACION_HOJA_EVAL,
        descripcion: t.descripcion,
        tipo_reparacion: t.tipo_reparacion,
        orden: ++orden,
        estado: "abierto",
      })),
    });
    await tx.oTHistorial.create({
      data: {
        ot_id: ev.ot_id,
        tipo_operacion: "TAREAS_GENERADAS",
        descripcion: `Tareas generadas desde la hoja de evaluación (${ev.estado}): ${nuevas.length} nueva(s)${tareas.length - nuevas.length > 0 ? `, ${tareas.length - nuevas.length} ya existía(n)` : ""}.`,
        usuario,
      },
    });
  }
  return {
    ot_id: ev.ot_id,
    evaluacion_id: ev.id,
    estado_evaluacion: ev.estado,
    marcadas: tareas.length,
    creadas: nuevas.length,
    existentes: tareas.length - nuevas.length,
  };
}
