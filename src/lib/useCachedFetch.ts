"use client";

import { useEffect, useState } from "react";

// Cache global a nivel de módulo: una promesa por URL.
// Evita refetchar los mismos catálogos cuando se navega entre OTs / pestañas / páginas.
const cache = new Map<string, Promise<unknown>>();

export function cachedFetch<T = unknown>(url: string): Promise<T> {
  if (!cache.has(url)) {
    cache.set(
      url,
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    );
  }
  return cache.get(url) as Promise<T>;
}

/** Invalida el cache de una URL específica (útil tras crear/editar un catálogo). */
export function invalidateCache(url: string) {
  cache.delete(url);
}

/** Invalida toda URL que matchee el prefijo. Útil para invalidar /api/catalogos?* a la vez. */
export function invalidateCachePrefix(prefix: string) {
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}

/** Hook: lee desde cache o dispara fetch. Devuelve el JSON decodificado o null mientras carga. */
export function useCachedFetch<T = unknown>(url: string | null): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    if (!url) { setData(null); return; }
    let alive = true;
    cachedFetch<T>(url).then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, [url]);
  return data;
}
