// Catálogo FIJO de motivos de pausa de una sesión de trabajo del técnico.
// Nació del análisis de 106 comentarios reales (2026-06-10): ~40% eran apoyos
// a otras OTs (montacarga ~15 veces), ~20% esperas de recursos, ~10% almuerzo/
// olvidos. Categorizarlos convierte el texto libre en data agregable
// ("esta semana se perdieron X horas por montacargas").
//
// Compartido por: el panel del técnico (selector al pausar), la API /pausar
// (validación + persistencia en planificacion_ot_sesion.motivo_pausa) y los
// historiales (tag con color).

export interface MotivoPausa {
  codigo: string;
  label: string;
  /** Color de Tag de antd. */
  color: string;
}

export const MOTIVOS_PAUSA: MotivoPausa[] = [
  { codigo: "APOYO_OTRA_OT", label: "Apoyo a otra OT/tarea", color: "blue" },
  { codigo: "MONTACARGA", label: "Montacargas (espera o apoyo)", color: "geekblue" },
  { codigo: "FALTA_MATERIAL", label: "Falta material/repuesto", color: "volcano" },
  { codigo: "MAQUINA_OCUPADA", label: "Máquina/prensa ocupada", color: "orange" },
  { codigo: "EMERGENCIA", label: "Emergencia / cambio de prioridad", color: "red" },
  { codigo: "ALMUERZO", label: "Almuerzo", color: "default" },
  { codigo: "FIN_JORNADA", label: "Fin de jornada", color: "default" },
  { codigo: "OTRO", label: "Otro", color: "default" },
];

// Motivo automático cuando el técnico pausa para arrancar OTRA tarea desde el
// flujo "pausar e iniciar" (no pasa por el modal de motivos).
export const MOTIVO_CAMBIO_TAREA: MotivoPausa = {
  codigo: "CAMBIO_TAREA", label: "Cambio a otra tarea", color: "purple",
};

const TODOS = [...MOTIVOS_PAUSA, MOTIVO_CAMBIO_TAREA];

export function esMotivoPausaValido(codigo: unknown): codigo is string {
  return typeof codigo === "string" && TODOS.some((m) => m.codigo === codigo);
}

export function motivoPausa(codigo: string | null | undefined): MotivoPausa | null {
  if (!codigo) return null;
  return TODOS.find((m) => m.codigo === codigo) ?? null;
}
