"use client";

// Cierra la sesión automáticamente tras N minutos sin actividad (mouse, teclado,
// scroll, touch). Se monta una sola vez en el layout del dashboard.
//
// Implementación:
//   - Listeners pasivos en window para eventos de actividad.
//   - Un timeout único que se resetea con cada evento; al expirar llama signOut.
//   - Throttle interno para no resetear el timer en cada pixel del mouse.
//   - Se desactiva si no hay sesión (no tiene sentido medir idle de un guest).

import { useEffect, useRef } from "react";
import { signOut, useSession } from "next-auth/react";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;  // 30 minutos
const THROTTLE_MS = 5_000;                // resetea el timer como máximo cada 5s

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "click",
];

export default function IdleLogout() {
  const { status } = useSession();
  const lastResetRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;

    const armTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        // callbackUrl con ?expired=1 para que la pantalla de login muestre el aviso.
        void signOut({ callbackUrl: "/login?expired=1" });
      }, IDLE_TIMEOUT_MS);
    };

    const onActivity = () => {
      const now = Date.now();
      if (now - lastResetRef.current < THROTTLE_MS) return;
      lastResetRef.current = now;
      armTimer();
    };

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
