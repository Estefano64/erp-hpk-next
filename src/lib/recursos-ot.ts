// Auto-update del campo `recursos_status_codigo` de una OT externa o interna,
// basado en el estado consolidado de sus OTRepuestos. Decisión del user:
// "el estado de recursos debe actualizarse automáticamente con la información
// de logística de acuerdo a como vayan los requerimientos".
//
// State machine (de "menos avanzado" a "más avanzado"):
//   - "En revision procesos"   → 0 reqs activos O algún req sin aprobar (BORRADOR/SIN_APROBACION)
//   - "Recursos solicitados"   → reqs APROBADOS pero ninguno con OC ni consumido
//   - "En espera de recursos"  → al menos 1 con OC creada pero sin recibir
//   - "Recursos en recepción"  → algunos ENTREGADOS y otros aún pendientes
//   - "Recursos completos"     → TODOS los reqs activos están ENTREGADO
//
// No mueve el status hacia atrás de forma destructiva — si la OT ya está
// "Recursos completos" y aparece un nuevo req, el recalc lo refleja
// correctamente (cae a recepción/solicitados según corresponda).

import type { PrismaClient, Prisma } from "@prisma/client";

type TxClient = PrismaClient | Prisma.TransactionClient;

interface RepLite {
  status_requerimiento_codigo: string | null;
  status_oc_codigo: string | null;
  po_id: number | null;
  solo_para_oc: boolean | null;
}

function calcularStatus(reps: RepLite[]): string {
  // Items "solo PDF de OC" no representan trabajo del técnico — ignorar.
  const activos = reps.filter((r) => r.solo_para_oc !== true);
  // Excluir anulados/desaprobados — son items muertos.
  const vivos = activos.filter((r) => {
    const sr = r.status_requerimiento_codigo;
    return sr !== "ANULADO" && sr !== "DESAPROBADO" && r.status_oc_codigo !== "ANULADO";
  });
  if (vivos.length === 0) return "En revision procesos";

  const haySinAprobar = vivos.some(
    (r) => r.status_requerimiento_codigo === "BORRADOR"
      || r.status_requerimiento_codigo === "SIN_APROBACION"
      || r.status_requerimiento_codigo == null,
  );
  if (haySinAprobar) return "En revision procesos";

  const todosEntregados = vivos.every((r) => r.status_oc_codigo === "ENTREGADO");
  if (todosEntregados) return "Recursos completos";

  const algunEntregado = vivos.some((r) => r.status_oc_codigo === "ENTREGADO");
  if (algunEntregado) return "Recursos en recepción";

  const algunConOC = vivos.some(
    (r) => r.po_id != null
      || r.status_oc_codigo === "PROCESO"
      || r.status_oc_codigo === "INCOMPLETO"
      || r.status_oc_codigo === "COMPLETO"
      || r.status_oc_codigo === "CONSUMIDO_ALMACEN"
      || r.status_oc_codigo === "CONSUMIDO_OC_ABIERTA",
  );
  if (algunConOC) return "En espera de recursos";

  return "Recursos solicitados";
}

/**
 * Recalcula `recursos_status_codigo` de una OT externa según el estado
 * actual de sus OTRepuestos. Falla silenciosa si la OT no existe.
 */
export async function recalcularRecursosStatusOT(
  tx: TxClient,
  otId: number,
): Promise<void> {
  if (!Number.isFinite(otId) || otId <= 0) return;
  const reps = await tx.oTRepuesto.findMany({
    where: { ot_id: otId },
    select: {
      status_requerimiento_codigo: true,
      status_oc_codigo: true,
      po_id: true,
      solo_para_oc: true,
    },
  });
  const nuevoStatus = calcularStatus(reps);
  await tx.ordenTrabajo.updateMany({
    where: { id: otId, recursos_status_codigo: { not: nuevoStatus } },
    data: { recursos_status_codigo: nuevoStatus },
  });
}

/**
 * Mismo recálculo pero para OT interna. Las internas usan
 * `orden_trabajo_interna_id` en OTRepuesto.
 */
export async function recalcularRecursosStatusOTInterna(
  tx: TxClient,
  otInternaId: number,
): Promise<void> {
  if (!Number.isFinite(otInternaId) || otInternaId <= 0) return;
  const reps = await tx.oTRepuesto.findMany({
    where: { orden_trabajo_interna_id: otInternaId },
    select: {
      status_requerimiento_codigo: true,
      status_oc_codigo: true,
      po_id: true,
      solo_para_oc: true,
    },
  });
  const nuevoStatus = calcularStatus(reps);
  await tx.ordenTrabajoInterna.updateMany({
    where: { id: otInternaId, recursos_status_codigo: { not: nuevoStatus } },
    data: { recursos_status_codigo: nuevoStatus },
  });
}

/**
 * Llama al recálculo correcto según qué id viene seteado en el req.
 * Útil para los endpoints que reciben un OTRepuesto y no saben si es
 * externa o interna.
 */
export async function recalcularRecursosStatusDesdeRep(
  tx: TxClient,
  rep: { ot_id: number | null; orden_trabajo_interna_id: number | null },
): Promise<void> {
  if (rep.ot_id != null) await recalcularRecursosStatusOT(tx, rep.ot_id);
  else if (rep.orden_trabajo_interna_id != null) {
    await recalcularRecursosStatusOTInterna(tx, rep.orden_trabajo_interna_id);
  }
}
