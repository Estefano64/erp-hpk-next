// Auto-update del campo `recursos_status_codigo` de una OT externa o interna,
// basado en el estado consolidado de sus OTRepuestos.
//
// Regla de negocio (definida con el equipo, 2026-06): la OT avanza al ritmo del
// requerimiento MENOS avanzado (todos deben avanzar para pasar de etapa). Ej:
// si aprobás uno pero mandás un 2° req, vuelve a "Recursos solicitados" hasta
// que estén todos aprobados. El cambio es SIEMPRE automático (pisa lo manual).
//
// Flujo (de menos a más avanzado):
//   0 "En revision procesos"  → sin reqs enviados (todos en BORRADOR o no hay)
//   1 "Recursos solicitados"  → hay reqs enviados (SIN_APROBACION) sin aprobar
//   2 "En cotización"         → todos los reqs aprobados, aún sin OC
//   3 "En aprobación"         → hay OC emitida pendiente de aprobar (PEND_OC)
//   4 "En espera de recursos" → OC aprobada / material llegó parcial
//   5 "Recursos completos"    → todo el material llegó (listo para recoger)
//   6 "Recursos entregados"   → material consumido/salido del almacén (final)
//
// Estados eliminados del flujo: "Recursos en recepción", "Recursos incompletos"
// y "Recursos en almacén" — todos se absorben en "Recursos completos" / "En
// espera de recursos" según corresponda.
//
// Cada cambio de estado genera un OTHistorial ("Cambio Estado") para trazabilidad
// (infra aportada por el equipo). Sirve para OTs externas e internas.

import type { PrismaClient, Prisma } from "@prisma/client";

type TxClient = PrismaClient | Prisma.TransactionClient;

interface RepLite {
  status_requerimiento_codigo: string | null;
  status_oc_codigo: string | null;
  po_id: number | null;
  solo_para_oc: boolean | null;
  // Estado de la OC vinculada (para distinguir "En aprobación de PO" cuando la
  // Compra está en PEND_OC) — puede ser null si el req no tiene OC.
  compra: { status_oc_codigo: string | null } | null;
}

// Estados del flujo indexados por etapa (0..6). Son los `codigo` del catálogo
// RecursosStatus (el nombre visible difiere en algunos: "En cotización" →
// "En cotización de RQ", "En aprobación" → "En aprobación de PO").
const FLUJO = [
  "En revision procesos",   // 0
  "Recursos solicitados",   // 1
  "En cotización",          // 2
  "En aprobación",          // 3
  "En espera de recursos",  // 4
  "Recursos completos",     // 5
  "Recursos entregados",    // 6
] as const;

const CONSUMIDOS = new Set(["CONSUMIDO_ALMACEN", "CONSUMIDO_OC_ABIERTA"]);

// Etapa (0..6) alcanzada por un requerimiento vivo.
function etapaRep(r: RepLite): number {
  const sr = r.status_requerimiento_codigo;
  if (sr == null || sr === "BORRADOR") return 0;          // no enviado
  if (sr === "SIN_APROBACION") return 1;                  // enviado, pendiente de aprobar
  // Aprobado en adelante → depende de OC / recepción / consumo.
  const oc = r.status_oc_codigo;
  if (oc && CONSUMIDOS.has(oc)) return 6;                 // consumido/salido de almacén
  if (oc === "COMPLETO" || oc === "ENTREGADO") return 5;  // recibido completo
  const compraOc = r.compra?.status_oc_codigo ?? null;
  const tieneOC = r.po_id != null || compraOc != null;
  if (tieneOC) {
    if (compraOc === "PEND_OC" || oc === "PEND_OC") return 3;  // OC pendiente de aprobar
    return 4;                                                   // OC en proceso, esperando material
  }
  if (oc === "PEND_OC") return 3;
  return 2;                                                // aprobado, sin OC → cotización
}

function calcularStatus(reps: RepLite[]): string {
  const vivos = reps.filter((r) => {
    // Items "solo PDF de OC" no representan trabajo del técnico — ignorar.
    if (r.solo_para_oc === true) return false;
    // Excluir anulados/desaprobados — items muertos.
    const sr = r.status_requerimiento_codigo;
    return sr !== "ANULADO" && sr !== "DESAPROBADO" && r.status_oc_codigo !== "ANULADO";
  });
  // Solo los reqs ENVIADOS (fuera de BORRADOR) mueven el estado. Si no hay
  // ninguno enviado (solo borradores, o sin reqs) → "En revisión procesos".
  // Un borrador nuevo NO arrastra la OT hacia atrás: el pull-back ocurre al
  // ENVIAR un req (que queda SIN_APROBACION), no al crearlo.
  const enviados = vivos.filter(
    (r) => r.status_requerimiento_codigo != null && r.status_requerimiento_codigo !== "BORRADOR",
  );
  if (enviados.length === 0) return FLUJO[0];
  // La OT queda en la etapa del req enviado MENOS avanzado (bottleneck).
  const etapaMin = Math.min(...enviados.map(etapaRep));
  return FLUJO[etapaMin];
}

const SELECT_REP_LITE = {
  status_requerimiento_codigo: true,
  status_oc_codigo: true,
  po_id: true,
  solo_para_oc: true,
  compra: { select: { status_oc_codigo: true } },
} as const;

// Aplica el cambio de estado y, si efectivamente cambió, deja rastro en el
// historial de la OT ("Cambio Estado"). Infra aportada por el equipo.
async function aplicarCambioEstado(
  tx: TxClient,
  target: {
    entidad: "externa" | "interna";
    id: number;
    prevStatus: string | null;
    nuevoStatus: string;
  },
): Promise<void> {
  if (target.prevStatus === target.nuevoStatus) return;
  const descripcion = `Recursos: "${target.prevStatus ?? "—"}" → "${target.nuevoStatus}" (auto-recalculo)`;
  if (target.entidad === "externa") {
    await tx.ordenTrabajo.update({
      where: { id: target.id },
      data: { recursos_status_codigo: target.nuevoStatus },
    });
    await tx.oTHistorial.create({
      data: { ot_id: target.id, tipo_operacion: "Cambio Estado", descripcion, usuario: "sistema" },
    });
  } else {
    await tx.ordenTrabajoInterna.update({
      where: { id: target.id },
      data: { recursos_status_codigo: target.nuevoStatus },
    });
    await tx.oTHistorial.create({
      data: { orden_trabajo_interna_id: target.id, tipo_operacion: "Cambio Estado", descripcion, usuario: "sistema" },
    });
  }
}

/**
 * Recalcula `recursos_status_codigo` de una OT externa según el estado
 * actual de sus OTRepuestos. Si cambia, registra el cambio en OTHistorial.
 * Falla silenciosa si la OT no existe.
 */
export async function recalcularRecursosStatusOT(
  tx: TxClient,
  otId: number,
): Promise<void> {
  if (!Number.isFinite(otId) || otId <= 0) return;
  const [ot, reps] = await Promise.all([
    tx.ordenTrabajo.findUnique({ where: { id: otId }, select: { recursos_status_codigo: true } }),
    tx.oTRepuesto.findMany({ where: { ot_id: otId }, select: SELECT_REP_LITE }),
  ]);
  if (!ot) return;
  const nuevoStatus = calcularStatus(reps);
  await aplicarCambioEstado(tx, {
    entidad: "externa",
    id: otId,
    prevStatus: ot.recursos_status_codigo,
    nuevoStatus,
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
  const [ot, reps] = await Promise.all([
    tx.ordenTrabajoInterna.findUnique({ where: { id: otInternaId }, select: { recursos_status_codigo: true } }),
    tx.oTRepuesto.findMany({ where: { orden_trabajo_interna_id: otInternaId }, select: SELECT_REP_LITE }),
  ]);
  if (!ot) return;
  const nuevoStatus = calcularStatus(reps);
  await aplicarCambioEstado(tx, {
    entidad: "interna",
    id: otInternaId,
    prevStatus: ot.recursos_status_codigo,
    nuevoStatus,
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
