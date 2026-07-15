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

/** Zona física para material metálico en bruto (barras, tubos, planchas). */
export const CODIGO_ZONA_TALLER = "TALLER";

/**
 * Clasificaciones de material que se almacenan en el TALLER, no con el resto
 * de repuestos del almacén. Se excluyen del "aplicar zona a todos los items
 * de la OT" para que los repuestos regulares no queden asignados al taller.
 */
export const CLASIFICACIONES_TALLER = new Set(["BARR", "TUBO", "ACER"]);

export function esClasificacionTaller(clasificacion?: string | null): boolean {
  return !!clasificacion && CLASIFICACIONES_TALLER.has(clasificacion);
}

/**
 * Devuelve la ubicación más reciente registrada en otros reqs de la misma OT.
 * Si no hay ningún req previo con ubicación, devuelve null.
 *
 * Regla del TALLER: los items metálicos (barras/tubos/acero) NO se
 * co-locan con el resto — cuando el req nuevo es metálico solo mira otros
 * metálicos, y cuando NO es metálico ignora los que están en la zona TALLER.
 */
export async function sugerirUbicacionPorOT(
  tx: Prisma.TransactionClient | PrismaClient,
  args: {
    otId?: number | null;
    otInternaId?: number | null;
    excluirRepuestoId?: number;
    // clasificación del req para el que se está sugiriendo (BARR/TUBO/ACER…).
    // Si se omite, se aplica la regla histórica (última zona sin filtros).
    clasificacionCodigo?: string | null;
  },
): Promise<UbicacionSugerida | null> {
  if (!args.otId && !args.otInternaId) return null;

  const nuevoEsTaller = esClasificacionTaller(args.clasificacionCodigo);
  // Buscamos el id de la zona TALLER una sola vez — si no existe (setup viejo),
  // el filtro queda desactivado y se cae al comportamiento histórico.
  const zonaTaller = await tx.almacenZona.findUnique({
    where: { codigo: CODIGO_ZONA_TALLER },
    select: { id: true },
  });

  const where: Prisma.OTRepuestoWhereInput = {
    almacen_zona_id: { not: null },
    ...(args.excluirRepuestoId ? { NOT: { id: args.excluirRepuestoId } } : {}),
  };
  if (args.otId) where.ot_id = args.otId;
  else if (args.otInternaId) where.orden_trabajo_interna_id = args.otInternaId;
  if (zonaTaller && args.clasificacionCodigo !== undefined) {
    if (nuevoEsTaller) {
      // Metálico: solo sugerir la zona TALLER (si algún otro metálico ya está
      // ahí, tomamos su posición). Evita sugerir REP/SUM/etc.
      where.almacen_zona_id = zonaTaller.id;
    } else {
      // No-metálico: nunca sugerir TALLER — descartarla explícitamente.
      where.almacen_zona_id = { not: zonaTaller.id };
    }
  }

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
