import { Prisma } from "@prisma/client";

const RECURSOS_SOLICITADOS = "Recursos solicitados";

/**
 * Si la OT tiene al menos 1 requerimiento y NINGUNO sigue en BORRADOR,
 * promueve recursos_status_codigo a "Recursos solicitados" (siempre que no
 * haya avanzado más allá ya). Devuelve true si cambió.
 *
 * Estados que NO sobreescribimos (ya están más adelante en el flujo):
 *   "En cotización", "En aprobación", "En espera de recursos", "Recursos completos"
 */
const ESTADOS_AVANZADOS = new Set([
  "En cotización",
  "En aprobación",
  "En espera de recursos",
  // Nuevo estado intermedio — material físicamente disponible pero pendiente
  // de entrega formal al técnico. Tampoco debemos regresarlo a "solicitados".
  "Recursos en almacén",
  "Recursos en recepción",
  "Recursos completos",
]);

export async function maybePromoveOTaRecursosSolicitados(
  tx: Prisma.TransactionClient,
  otId: number,
  usuario: string,
): Promise<boolean> {
  const [total, borradores, ot] = await Promise.all([
    tx.oTRepuesto.count({ where: { ot_id: otId } }),
    tx.oTRepuesto.count({ where: { ot_id: otId, status_requerimiento_codigo: "BORRADOR" } }),
    tx.ordenTrabajo.findUnique({
      where: { id: otId },
      select: { recursos_status_codigo: true },
    }),
  ]);
  if (total === 0 || borradores > 0) return false;
  if (!ot) return false;
  if (ot.recursos_status_codigo && ESTADOS_AVANZADOS.has(ot.recursos_status_codigo)) return false;
  if (ot.recursos_status_codigo === RECURSOS_SOLICITADOS) return false;

  await tx.ordenTrabajo.update({
    where: { id: otId },
    data: { recursos_status_codigo: RECURSOS_SOLICITADOS, usuario_actualiza: usuario },
  });
  await tx.oTHistorial.create({
    data: {
      ot_id: otId,
      tipo_operacion: "Cambio Estado",
      descripcion: `Recursos: "${ot.recursos_status_codigo ?? "—"}" → "${RECURSOS_SOLICITADOS}" (todos los requerimientos enviados a aprobación)`,
      usuario,
    },
  });
  return true;
}
