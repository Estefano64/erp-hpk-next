import { Prisma } from "@prisma/client";

/**
 * Genera el próximo `nro_req` global con formato REQ-{YY}-{NNNN}.
 * Ejemplos: REQ-26-0001, REQ-26-0002.
 *
 * Debe llamarse dentro de una transacción. Usa pg_advisory_xact_lock para
 * serializar dos requests concurrentes que pidan número en simultáneo —
 * el segundo espera al COMMIT/ROLLBACK del primero antes de leer max+1.
 */
export async function nextNroReq(tx: Prisma.TransactionClient): Promise<string> {
  const yy = new Date().getFullYear().toString().slice(-2);
  const prefix = `REQ-${yy}-`;

  // Lock por año para serializar la generación. hashtext devuelve int4;
  // el lock se libera automáticamente al cerrar la transacción.
  await tx.$executeRawUnsafe(
    `SELECT pg_advisory_xact_lock(hashtext($1))`,
    `nro_req:${yy}`,
  );

  // Buscar el max numérico real (no string-sort, para que no rompa pasando 9999).
  // Tomamos los últimos N candidatos por nro_req desc y elegimos el max numérico.
  const candidatos = await tx.oTRepuesto.findMany({
    where: { nro_req: { startsWith: prefix } },
    orderBy: { nro_req: "desc" },
    select: { nro_req: true },
    take: 50,
  });
  let max = 0;
  for (const c of candidatos) {
    const n = parseInt((c.nro_req ?? "").substring(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  const seq = max + 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

/**
 * Próximo `item_req` dentro de una OT (1, 2, 3, ...).
 */
export async function nextItemReq(tx: Prisma.TransactionClient, otId: number): Promise<number> {
  const max = await tx.oTRepuesto.aggregate({
    where: { ot_id: otId },
    _max: { item_req: true },
  });
  return (max._max.item_req ?? 0) + 1;
}

/** Estado inicial de cualquier requerimiento recién creado. */
export const STATUS_REQ_INICIAL = "BORRADOR";

/** Estados que NO permiten editar campos clave (cantidad, material). */
export const ESTADOS_REQ_LOCKED_EDIT = new Set(["APROBADO", "ANULADO", "DESAPROBADO"]);

/** Estados que NO permiten borrar (físicamente). */
export const ESTADOS_REQ_LOCKED_DELETE = new Set(["APROBADO", "ANULADO"]);

/**
 * Estados desde los cuales un usuario común (no admin) puede editar/eliminar.
 * Después de "Enviar a aprobación", solo el admin puede tocar.
 */
export const ESTADOS_REQ_USER_EDITABLES = new Set(["BORRADOR"]);
