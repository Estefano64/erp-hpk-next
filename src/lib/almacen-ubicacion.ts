// Helper: sugiere una ubicación (zona + posición) para un req nuevo en base
// a otros reqs de la MISMA OT que ya están ubicados.
//
// Regla: tomar la ubicación MÁS RECIENTE de la OT (por updatedAt). Si la OT
// tuvo varios reqs ubicados en zonas/posiciones distintas, asumimos que el
// operario fue moviendo todo a la posición nueva. La UI igual permite
// cambiarla manualmente al recibir/consumir.

import type { Prisma, PrismaClient } from "@prisma/client";

export interface UbicacionSugerida {
  zona_id: number;
  posicion_id: number | null;
}

/**
 * Devuelve la ubicación más reciente registrada en otros reqs de la misma OT.
 * Si no hay ningún req previo con ubicación, devuelve null.
 */
export async function sugerirUbicacionPorOT(
  tx: Prisma.TransactionClient | PrismaClient,
  args: { otId?: number | null; otInternaId?: number | null; excluirRepuestoId?: number },
): Promise<UbicacionSugerida | null> {
  if (!args.otId && !args.otInternaId) return null;

  const where: Prisma.OTRepuestoWhereInput = {
    almacen_zona_id: { not: null },
    ...(args.excluirRepuestoId ? { NOT: { id: args.excluirRepuestoId } } : {}),
  };
  if (args.otId) where.ot_id = args.otId;
  else if (args.otInternaId) where.orden_trabajo_interna_id = args.otInternaId;

  const ult = await tx.oTRepuesto.findFirst({
    where,
    orderBy: { updatedAt: "desc" },
    select: { almacen_zona_id: true, almacen_posicion_id: true },
  });
  if (!ult || ult.almacen_zona_id == null) return null;
  return {
    zona_id: ult.almacen_zona_id,
    posicion_id: ult.almacen_posicion_id,
  };
}
