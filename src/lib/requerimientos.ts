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

// ── Helper compartido para resolver descripción al copiar template ─────────
// Usado por POST /api/ordenes-trabajo (creación con cod_rep) y por
// POST /api/ordenes-trabajo/[id]/requerimientos/aplicar-template.
// Antes vivía duplicado en aplicar-template; quedaba el bug de que la creación
// de OT no lo aplicaba y los SER terminaban con la descripción genérica del
// cod_rep en vez del `texto` específico ("SVC Cromado", "SVC NDT", etc.).

export interface TareaParaDescripcion {
  tipo_codigo: string;
  material_codigo: string | null;
  servicio_codigo: string | null;
  texto: string | null;
  descripcion: string;
}

export interface MaterialLookup {
  codigo: string;
  descripcion: string;
  unidad_medida_codigo?: string | null;
  fabricante_codigo?: string | null;
  material_id?: number;
}

export interface ServicioLookup {
  codigo: string;
  nombre: string;
  descripcion: string | null;
}

/**
 * Decide qué texto guardar en `ot_repuestos.descripcion` al copiar una Tarea
 * template. Prioridad:
 *   1. MAC con material_codigo: descripción del Material (más específico).
 *   2. SER con servicio_codigo: descripción/nombre del ServicioReparacion.
 *   3. SER sin servicio_codigo pero con texto: el `texto` de la Tarea
 *      (típicamente "SVC Cromado", "SVC NDT", etc.).
 *   4. Fallback: `texto` si hay, o si no la `descripcion` genérica del cod_rep.
 */
export function pickDescripcionFromTarea(
  t: TareaParaDescripcion,
  matByCodigo: Map<string, MaterialLookup>,
  svcByCodigo: Map<string, ServicioLookup>,
): string {
  if (t.tipo_codigo === "MAC" && t.material_codigo) {
    const m = matByCodigo.get(t.material_codigo);
    if (m?.descripcion) return m.descripcion;
  }
  if (t.tipo_codigo === "SER") {
    if (t.servicio_codigo) {
      const s = svcByCodigo.get(t.servicio_codigo);
      if (s) return s.descripcion ?? s.nombre;
    }
    if (t.texto) return t.texto;
  }
  return t.texto || t.descripcion;
}
