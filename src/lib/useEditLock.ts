"use client";

// Hook de lock pesimista de edición. Patrón de uso:
//
//   const lock = useEditLock("ot-externa", otId);
//   ...
//   if (!lock.canEdit && lock.lockedBy) {
//     <Alert type="warning" title={`Editando: ${lock.lockedBy}`} />
//   }
//   <Button disabled={!lock.canEdit} onClick={async () => {
//     const ok = await lock.acquire();
//     if (ok) setEditing(true);
//   }} />
//   // al guardar/cancelar:
//   await lock.release();
//
// Lifecycle:
//   - GET /api/locks?... al montar y cada 15s en modo "viewer" (no-owner).
//   - acquire() llama POST /api/locks/acquire. Si OK, arranca heartbeat cada 30s.
//   - heartbeat refresca last_heartbeat. Si server responde 409 (lock perdido),
//     limpiamos estado y volvemos a viewer.
//   - release() llama POST /api/locks/release y para el heartbeat.
//   - unmount + beforeunload → release best-effort vía sendBeacon.

import { useCallback, useEffect, useRef, useState } from "react";

type ResourceType =
  | "ot-externa"
  | "ot-interna"
  | "planificacion"
  | "programacion-semanal";

interface LockStatus {
  locked: boolean;
  locked_by?: string;
  acquired_at?: string;
  last_heartbeat?: string;
  ttl_seconds?: number;
}

interface UseEditLock {
  /** Quién tiene el lock ahora (puede ser yo). null si nadie. */
  lockedBy: string | null;
  /** ¿Soy yo el owner? */
  isOwner: boolean;
  /** ¿Puedo entrar a editar? (libre o yo soy el owner) */
  canEdit: boolean;
  /** Estado del primer fetch (UI de loading inicial). */
  loading: boolean;
  /** Intenta tomar el lock. Devuelve true si quedó como owner. */
  acquire: () => Promise<boolean>;
  /** Libera el lock si soy owner. No-op si no lo soy. */
  release: () => Promise<void>;
  /** Re-fetch del estado actual del lock. */
  refresh: () => Promise<void>;
}

const HEARTBEAT_INTERVAL_MS = 30_000;
const VIEWER_POLL_MS = 15_000;

export function useEditLock(
  resource: ResourceType,
  id: number | null | undefined,
  currentUser: string | null | undefined,
): UseEditLock {
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const viewerTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const isOwnerRef = useRef(false);

  const isOwner = lockedBy != null && currentUser != null && lockedBy === currentUser;
  // canEdit es "true" cuando no hay nadie editando, o cuando soy yo.
  const canEdit = lockedBy == null || isOwner;

  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimer.current) {
      clearInterval(heartbeatTimer.current);
      heartbeatTimer.current = null;
    }
  }, []);
  const stopViewerPoll = useCallback(() => {
    if (viewerTimer.current) {
      clearInterval(viewerTimer.current);
      viewerTimer.current = null;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (id == null) return;
    try {
      const res = await fetch(`/api/locks?resource=${resource}&id=${id}`);
      if (res.ok) {
        const j: LockStatus = await res.json();
        setLockedBy(j.locked ? (j.locked_by ?? null) : null);
        // Si dejé de ser owner (otro tomó, o stale → vacío), parar heartbeat.
        const stillOwner = j.locked && j.locked_by === currentUser;
        if (!stillOwner) {
          isOwnerRef.current = false;
          stopHeartbeat();
        }
      }
    } finally {
      setLoading(false);
    }
  }, [resource, id, currentUser, stopHeartbeat]);

  const startHeartbeat = useCallback(() => {
    stopHeartbeat();
    heartbeatTimer.current = setInterval(async () => {
      try {
        const res = await fetch("/api/locks/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resource, id }),
        });
        if (res.status === 409) {
          // Perdí el lock — alguien lo tomó tras stale o algún edge.
          isOwnerRef.current = false;
          stopHeartbeat();
          await refresh();
        }
      } catch {
        // red caída, intentamos en el próximo tick
      }
    }, HEARTBEAT_INTERVAL_MS);
  }, [resource, id, stopHeartbeat, refresh]);

  const acquire = useCallback(async () => {
    if (id == null) return false;
    try {
      const res = await fetch("/api/locks/acquire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource, id }),
      });
      if (res.ok) {
        setLockedBy(currentUser ?? null);
        isOwnerRef.current = true;
        stopViewerPoll();
        startHeartbeat();
        return true;
      }
      // 409 → alguien más lo tiene
      const j: LockStatus = await res.json().catch(() => ({ locked: true }));
      setLockedBy(j.locked_by ?? null);
      return false;
    } catch {
      return false;
    }
  }, [resource, id, currentUser, stopViewerPoll, startHeartbeat]);

  const release = useCallback(async () => {
    if (id == null) return;
    stopHeartbeat();
    isOwnerRef.current = false;
    try {
      await fetch("/api/locks/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource, id }),
      });
    } catch {
      // si falla, el TTL se encarga
    }
    setLockedBy(null);
    // Si quedaba alguien editando, el polling lo descubrirá; arrancamos por las dudas.
    await refresh();
  }, [resource, id, stopHeartbeat, refresh]);

  // Fetch inicial + arranca poll de viewer.
  useEffect(() => {
    setLoading(true);
    refresh();
    stopViewerPoll();
    viewerTimer.current = setInterval(() => {
      // Solo polling cuando NO soy owner — si lo soy, el heartbeat también
      // refresca la vista local (somos la fuente de verdad).
      if (!isOwnerRef.current) refresh();
    }, VIEWER_POLL_MS);
    return () => {
      stopViewerPoll();
    };
  }, [refresh, stopViewerPoll]);

  // Best-effort release al desmontar o cerrar la pestaña.
  useEffect(() => {
    const handleUnload = () => {
      if (!isOwnerRef.current || id == null) return;
      try {
        const blob = new Blob([JSON.stringify({ resource, id })], { type: "application/json" });
        navigator.sendBeacon("/api/locks/release", blob);
      } catch {
        // ignore
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      // unmount: si era owner, liberar.
      if (isOwnerRef.current && id != null) {
        try {
          const blob = new Blob([JSON.stringify({ resource, id })], { type: "application/json" });
          navigator.sendBeacon("/api/locks/release", blob);
        } catch {
          // ignore
        }
      }
      stopHeartbeat();
    };
  }, [resource, id, stopHeartbeat]);

  return {
    lockedBy,
    isOwner,
    canEdit,
    loading,
    acquire,
    release,
    refresh,
  };
}
