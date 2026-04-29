"use client";

import { useEffect, useRef } from "react";

/**
 * Hook que ejecuta `onSync` cuando:
 *  1) La pestaña recobra foco (visibilitychange)
 *  2) Recibe un mensaje de otra pestaña por BroadcastChannel
 *
 * Devuelve `notify()` para que el caller dispare la notificación tras un save exitoso.
 *
 * Uso:
 *   const notifySync = useTabSync("planificacion", () => fetchData());
 *   // después de un PUT OK:
 *   notifySync();
 */
export function useTabSync(channelName: string, onSync: () => void): () => void {
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(`tab-sync-${channelName}`);
    channelRef.current = ch;
    ch.onmessage = () => onSyncRef.current();

    function onVisibility() {
      if (document.visibilityState === "visible") onSyncRef.current();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      ch.close();
      channelRef.current = null;
    };
  }, [channelName]);

  function notify() {
    if (channelRef.current) {
      try { channelRef.current.postMessage({ ts: Date.now() }); } catch { /* noop */ }
    }
  }

  return notify;
}
