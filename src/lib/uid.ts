/**
 * Genera un ID local para drafts client-side (filas nuevas de un form, items
 * temporales que aún no fueron guardados a la BD, etc.).
 *
 * NO usar para nada que necesite ser criptográficamente seguro — los IDs
 * de BD se generan server-side (autoincrement o uuid de Postgres).
 *
 * Por qué no `crypto.randomUUID()` directo: el Web Crypto API solo está
 * disponible en *secure contexts* — HTTPS o localhost. Acceder al dev
 * server desde otro dispositivo en la misma LAN (ej. celular contra
 * `192.168.1.x:3000` por HTTP) NO es secure context y `crypto.randomUUID`
 * es `undefined` → TypeError. Este helper hace fallback a un timestamp +
 * random, lo suficientemente único para drafts en una sesión.
 */
export function localUid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
