"use client";

// Cierra la sesión automáticamente tras N minutos sin actividad (mouse, teclado,
// scroll, touch). Se monta una sola vez en el layout del dashboard.
//
// Implementación:
//   - Listeners pasivos en window para eventos de actividad.
//   - Un timeout único que se resetea con cada evento; al expirar llama signOut.
//   - Throttle interno para no resetear el timer en cada pixel del mouse.
//   - Se desactiva si no hay sesión (no tiene sentido medir idle de un guest).
//   - Actividad COMPARTIDA entre pestañas (2026-11-26): la sesión es una sola
//     cookie para todo el navegador, así que una pestaña olvidada que llegaba a
//     30 min hacía signOut y tumbaba también la pestaña donde el usuario estaba
//     trabajando (sus requests salían sin sesión → 403 "Tu rol no tiene
//     permiso"). Ahora cada actividad se anota en localStorage; al vencer, el
//     timer mira la última actividad de CUALQUIER pestaña y, si fue reciente,
//     se rearma por el tiempo que falta en vez de cerrar la sesión.

import { useEffect, useRef } from "react";
import { signOut, useSession } from "next-auth/react";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;  // 30 minutos
const THROTTLE_MS = 5_000;                // resetea el timer como máximo cada 5s
const STORAGE_KEY = "hpk:ultima-actividad";

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "click",
];

function leerUltimaActividad(): number {
  try {
    const v = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0; // localStorage bloqueado (modo privado estricto): solo cuenta esta pestaña
  }
}

function anotarActividad(ts: number) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(ts));
  } catch {
    /* noop */
  }
}

export default function IdleLogout() {
  const { status } = useSession();
  const lastResetRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;

    const armTimer = (ms: number = IDLE_TIMEOUT_MS) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        // Antes de cerrar: ¿hubo actividad en otra pestaña?
        const ultima = Math.max(leerUltimaActividad(), lastResetRef.current);
        const restante = ultima + IDLE_TIMEOUT_MS - Date.now();
        if (restante > 1_000) {
          armTimer(restante);
          return;
        }
        // callbackUrl con ?expired=1 para que la pantalla de login muestre el aviso.
        void signOut({ callbackUrl: "/login?expired=1" });
      }, ms);
    };

    const onActivity = () => {
      const now = Date.now();
      if (now - lastResetRef.current < THROTTLE_MS) return;
      lastResetRef.current = now;
      anotarActividad(now);
      armTimer();
    };

    // Al montar (login o pestaña nueva) cuenta como actividad.
    const ahora = Date.now();
    lastResetRef.current = ahora;
    anotarActividad(ahora);
    armTimer();
    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, onActivity, { passive: true });
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, onActivity);
      }
    };
  }, [status]);

  return null;
}
