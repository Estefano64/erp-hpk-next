import { Prisma } from "@prisma/client";

/**
 * Genera el próximo `nro_req` global con formato REQ-{YY}-{NNNN}.
 * Ejemplos: REQ-26-0001, REQ-26-0002.
 *
 * Debe llamarse dentro de una transacción para evitar race conditions
 * (dos clientes pidiendo número al mismo tiempo).
 */
export async function nextNroReq(tx: Prisma.TransactionClient): Promise<string> {
  const yy = new Date().getFullYear().toString().slice(-2);
  const prefix = `REQ-${yy}-`;
  const ultimo = await tx.oTRepuesto.findFirst({
    where: { nro_req: { startsWith: prefix } },
    orderBy: { nro_req: "desc" },
    select: { nro_req: true },
  });
  let seq = 1;
  if (ultimo?.nro_req) {
    const part = ultimo.nro_req.substring(prefix.length);
    const n = parseInt(part, 10);
    if (Number.isFinite(n)) seq = n + 1;
  }
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
