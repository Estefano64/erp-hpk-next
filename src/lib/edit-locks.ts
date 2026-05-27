// Lock pesimista de edición — utilidades del servidor.
//
// Cómo funciona:
//   - Una sola fila por (resource_type, resource_id) en la tabla edit_lock.
//   - acquire(): si no existe la fila O el heartbeat es más viejo que el TTL,
//     la creamos/sobreescribimos para este usuario. Si existe y está fresca y
//     es de OTRO usuario, devolvemos { ok: false }.
//   - heartbeat(): refresca last_heartbeat. Solo el owner puede.
//   - release(): borra la fila. Solo el owner puede.
//
// TTL = 180s. Si el front no manda heartbeat por 3 min se considera muerto
// y otro usuario puede tomar el lock.
import { prisma } from "./prisma";

export const LOCK_TTL_SECONDS = 180;

const VALID_RESOURCE_TYPES = new Set([
  "ot-externa",
  "ot-interna",
  "planificacion",
  "programacion-semanal",
]);

export type ResourceType =
  | "ot-externa"
  | "ot-interna"
  | "planificacion"
  | "programacion-semanal";

export function isValidResourceType(v: unknown): v is ResourceType {
  return typeof v === "string" && VALID_RESOURCE_TYPES.has(v);
}

export interface LockState {
  usuario: string;
  acquired_at: Date;
  last_heartbeat: Date;
  is_stale: boolean;
}

// Lee el estado del lock. Devuelve null si no hay ningún lock.
// is_stale=true significa que el heartbeat es más viejo que el TTL —
// el caller puede tratarlo como "libre".
export async function readLock(
  resource_type: ResourceType,
  resource_id: number,
): Promise<LockState | null> {
  const row = await prisma.editLock.findUnique({
    where: { resource_type_resource_id: { resource_type, resource_id } },
  });
  if (!row) return null;
  const ageMs = Date.now() - row.last_heartbeat.getTime();
  return {
    usuario: row.usuario,
    acquired_at: row.acquired_at,
    last_heartbeat: row.last_heartbeat,
    is_stale: ageMs > LOCK_TTL_SECONDS * 1000,
  };
}

export interface AcquireResult {
  ok: boolean;
  // Si !ok: quién lo tiene y desde cuándo.
  locked_by?: string;
  acquired_at?: Date;
  last_heartbeat?: Date;
}

// Intenta adquirir el lock. Si lo tiene OTRO usuario con heartbeat fresco,
// devuelve { ok: false, locked_by }. Si está libre o stale, crea/sobreescribe.
// Si el mismo usuario ya lo tenía, refresca el heartbeat (idempotente).
export async function acquireLock(
  resource_type: ResourceType,
  resource_id: number,
  usuario: string,
): Promise<AcquireResult> {
  const existing = await readLock(resource_type, resource_id);
  if (existing && !existing.is_stale && existing.usuario !== usuario) {
    return {
      ok: false,
      locked_by: existing.usuario,
      acquired_at: existing.acquired_at,
      last_heartbeat: existing.last_heartbeat,
    };
  }
  // Libre, stale o nuestro → upsert.
  const now = new Date();
  await prisma.editLock.upsert({
    where: { resource_type_resource_id: { resource_type, resource_id } },
    create: {
      resource_type,
      resource_id,
      usuario,
      acquired_at: now,
      last_heartbeat: now,
    },
    update: {
      // Si era stale o nuestro, lo tomamos como un re-acquire fresco.
      usuario,
      acquired_at: existing && existing.usuario === usuario ? existing.acquired_at : now,
      last_heartbeat: now,
    },
  });
  return { ok: true };
}

// Refresca el heartbeat. Solo lo hace si el caller es el owner; si no, devuelve false
// para que el front se entere que perdió el lock (TTL venció y otro lo tomó).
export async function heartbeatLock(
  resource_type: ResourceType,
  resource_id: number,
  usuario: string,
): Promise<boolean> {
  const result = await prisma.editLock.updateMany({
    where: { resource_type, resource_id, usuario },
    data: { last_heartbeat: new Date() },
  });
  return result.count > 0;
}

// Libera el lock si soy el owner. Idempotente: si ya no existe, no falla.
export async function releaseLock(
  resource_type: ResourceType,
  resource_id: number,
  usuario: string,
): Promise<void> {
  await prisma.editLock.deleteMany({
    where: { resource_type, resource_id, usuario },
  });
}
