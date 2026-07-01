// Auto-update del campo `recursos_status_codigo` de una OT externa o interna,
// basado en el estado consolidado de sus OTRepuestos. Decisión del user:
// "el estado de recursos debe actualizarse automáticamente con la información
// de logística de acuerdo a como vayan los requerimientos".
//
// State machine (de "menos avanzado" a "más avanzado"):
//   - "En revision procesos"   → 0 reqs activos O algún req sin aprobar (BORRADOR/SIN_APROBACION)
//   - "Recursos solicitados"   → reqs APROBADOS pero ninguno con OC ni consumido
//   - "En espera de recursos"  → al menos 1 con OC creada pero material aún NO en almacén
//   - "Recursos en recepción"  → algunos ENTREGADOS al técnico y otros aún pendientes
//   - "Recursos en almacén"    → TODOS disponibles físicamente (OC recibida en almacén,
//                                consumido de almacén / OC abierta, o caja chica) pero
//                                NO todos despachados al técnico
//   - "Recursos completos"     → TODOS los reqs activos ENTREGADO al técnico
//
// Cada cambio de estado genera un OTHistorial ("Cambio Estado") para trazabilidad.
// Sirve tanto para OTs externas como internas.

import type { PrismaClient, Prisma } from "@prisma/client";

type TxClient = PrismaClient | Prisma.TransactionClient;

interface RepLite {
  status_requerimiento_codigo: string | null;
  status_oc_codigo: string | null;
  po_id: number | null;
  solo_para_oc: boolean | null;
  cantidad: Prisma.Decimal | number | string | null;
  cantidad_recibida: Prisma.Decimal | number | string | null;
  material_id: number | null;
  compra: { status_oc_codigo: string | null } | null;
}

// Un rep está "físicamente disponible en almacén" (listo para despachar al
// técnico o ya despachado):
//   - ENTREGADO: ya se lo entregaron al técnico (o caja chica lo marcó así).
//   - CONSUMIDO_ALMACEN / CONSUMIDO_OC_ABIERTA: ya se reservó del stock.
//   - Item FREE (sin material) con cantidad_recibida == cantidad y OC recibida:
//     ingreso-po incrementó cantidad_recibida al arribar la OC.
//   - Item MAC con OC en estado ENTREGADO/COMPLETO/INCOMPLETO: la OC llegó al
//     almacén (parcial o completa). Estimación conservadora — para saber si
//     TODO lo que este req necesita llegó exactamente, habría que mirar el
//     CompraDetalle específico; aceptamos el proxy simple.
function estaEnAlmacen(rep: RepLite): boolean {
  const s = rep.status_oc_codigo;
  if (s === "ENTREGADO") return true;
  if (s === "CONSUMIDO_ALMACEN" || s === "CONSUMIDO_OC_ABIERTA") return true;
  const cant = Number(rep.cantidad ?? 0);
  const rec = Number(rep.cantidad_recibida ?? 0);
  if (rep.material_id == null && rep.po_id != null && cant > 0 && rec >= cant - 0.0001) {
    return true; // FREE con OC recibida
  }
  if (rep.material_id != null && rep.po_id != null) {
    const cs = rep.compra?.status_oc_codigo;
    if (cs === "ENTREGADO" || cs === "COMPLETO" || cs === "INCOMPLETO") return true;
  }
  return false;
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

  // Antes de "En espera de recursos", chequeamos si TODOS tienen material
  // disponible físicamente (aunque no formalmente despachado). Ese es el
  // nuevo estado "Recursos en almacén" — cierra la brecha entre "llegó la
  // OC" y "el técnico recibió el material formalmente".
  const todosEnAlmacen = vivos.every(estaEnAlmacen);
  if (todosEnAlmacen) return "Recursos en almacén";

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

const SELECT_REP_LITE = {
  status_requerimiento_codigo: true,
  status_oc_codigo: true,
  po_id: true,
  solo_para_oc: true,
  cantidad: true,
  cantidad_recibida: true,
  material_id: true,
  compra: { select: { status_oc_codigo: true } },
} as const;

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
  if (target.entidad === "externa") {
    await tx.ordenTrabajo.update({
      where: { id: target.id },
      data: { recursos_status_codigo: target.nuevoStatus },
    });
    await tx.oTHistorial.create({
      data: {
        ot_id: target.id,
        tipo_operacion: "Cambio Estado",
        descripcion: `Recursos: "${target.prevStatus ?? "—"}" → "${target.nuevoStatus}" (auto-recalculo)`,
        usuario: "sistema",
      },
    });
  } else {
    await tx.ordenTrabajoInterna.update({
      where: { id: target.id },
      data: { recursos_status_codigo: target.nuevoStatus },
    });
    await tx.oTHistorial.create({
      data: {
        orden_trabajo_interna_id: target.id,
        tipo_operacion: "Cambio Estado",
        descripcion: `Recursos: "${target.prevStatus ?? "—"}" → "${target.nuevoStatus}" (auto-recalculo)`,
        usuario: "sistema",
      },
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
    tx.ordenTrabajo.findUnique({
      where: { id: otId },
      select: { recursos_status_codigo: true },
    }),
    tx.oTRepuesto.findMany({
      where: { ot_id: otId },
      select: SELECT_REP_LITE,
    }),
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
    tx.ordenTrabajoInterna.findUnique({
      where: { id: otInternaId },
      select: { recursos_status_codigo: true },
    }),
    tx.oTRepuesto.findMany({
      where: { orden_trabajo_interna_id: otInternaId },
      select: SELECT_REP_LITE,
    }),
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
