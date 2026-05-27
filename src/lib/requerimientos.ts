import { Prisma } from "@prisma/client";

// ─── Generación de nro_req ─────────────────────────────────────────────────
// El nro_req identifica a un requerimiento (grupo de items). Formato:
//   {códigoOT}-{N}  ej. "390626-1", "390626-2", ...
//
// El correlativo N es por OT (no global). Items dentro del mismo nro_req
// comparten ese código y se diferencian por `item_req` (1, 2, 3...).
//
// Se usa pg_advisory_xact_lock dentro de la transacción para serializar dos
// requests concurrentes que pidan número en simultáneo — el segundo espera al
// COMMIT/ROLLBACK del primero antes de leer max+1.

async function lockNroReq(tx: Prisma.TransactionClient, otCodigo: string): Promise<void> {
  await tx.$executeRawUnsafe(
    `SELECT pg_advisory_xact_lock(hashtext($1))`,
    `nro_req:${otCodigo}`,
  );
}

function nextCorrelativo(candidatos: { nro_req: string | null }[], prefix: string): number {
  let max = 0;
  for (const c of candidatos) {
    const n = parseInt((c.nro_req ?? "").substring(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

/**
 * Próximo nro_req para una OT externa. Devuelve "{códigoOT}-{N}".
 * Si la OT no tiene `ot` (código legible), usa "OT-{id}" como fallback.
 */
export async function nextNroReqExterna(
  tx: Prisma.TransactionClient,
  otId: number,
): Promise<string> {
  const ot = await tx.ordenTrabajo.findUnique({
    where: { id: otId },
    select: { id: true, ot: true },
  });
  if (!ot) throw new Error(`OT ${otId} no existe`);
  const otCodigo = (ot.ot ?? "").trim() || `OT-${ot.id}`;
  const prefix = `${otCodigo}-`;

  await lockNroReq(tx, otCodigo);

  const candidatos = await tx.oTRepuesto.findMany({
    where: { ot_id: otId, nro_req: { startsWith: prefix } },
    select: { nro_req: true },
  });
  const seq = nextCorrelativo(candidatos, prefix);
  return `${prefix}${seq}`;
}

/**
 * Próximo nro_req para una OT interna. Mismo patrón que la externa.
 */
export async function nextNroReqInterna(
  tx: Prisma.TransactionClient,
  otInternaId: number,
): Promise<string> {
  const ot = await tx.ordenTrabajoInterna.findUnique({
    where: { id: otInternaId },
    select: { id: true, ot: true },
  });
  if (!ot) throw new Error(`OT interna ${otInternaId} no existe`);
  const otCodigo = (ot.ot ?? "").trim() || `OTI-${ot.id}`;
  const prefix = `${otCodigo}-`;

  await lockNroReq(tx, otCodigo);

  const candidatos = await tx.oTRepuesto.findMany({
    where: { orden_trabajo_interna_id: otInternaId, nro_req: { startsWith: prefix } },
    select: { nro_req: true },
  });
  const seq = nextCorrelativo(candidatos, prefix);
  return `${prefix}${seq}`;
}

/**
 * Próximo `item_req` dentro de una OT externa (1, 2, 3, ...).
 */
export async function nextItemReq(tx: Prisma.TransactionClient, otId: number): Promise<number> {
  const max = await tx.oTRepuesto.aggregate({
    where: { ot_id: otId },
    _max: { item_req: true },
  });
  return (max._max.item_req ?? 0) + 1;
}

/**
 * Próximo `item_req` dentro de una OT interna (1, 2, 3, ...).
 * Variante de nextItemReq que filtra por orden_trabajo_interna_id.
 */
export async function nextItemReqInterna(
  tx: Prisma.TransactionClient,
  otInternaId: number,
): Promise<number> {
  const max = await tx.oTRepuesto.aggregate({
    where: { orden_trabajo_interna_id: otInternaId },
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

/**
 * Cantidad a usar al copiar una Tarea (template) a OTRepuesto. Los servicios
 * (SER) en los templates suelen venir con `requerimiento = 0` porque la
 * cantidad no aplica al template; en el requerimiento real debe ser ≥ 1 para
 * que el item tenga sentido. Para MAC/CAD respetamos el valor del template.
 */
export function pickCantidadFromTarea(t: { tipo_codigo: string | null; requerimiento: number | unknown }): number {
  const req = Number(t.requerimiento ?? 0);
  if (t.tipo_codigo === "SER" && (!Number.isFinite(req) || req <= 0)) return 1;
  return Number.isFinite(req) ? req : 0;
}
