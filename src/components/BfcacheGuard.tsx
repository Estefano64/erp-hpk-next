"use client";

// Revalida la sesión cuando el navegador restaura la página desde el bfcache
// (back-forward cache). Problema que resuelve: tras cerrar sesión, apretar
// "atrás" muestra una captura congelada de la última pantalla protegida sin
// re-pedirla al servidor (por eso el middleware no actúa). Next 16 no permite
// forzar `no-store` en el documento, así que lo atajamos en el cliente.
//
// Cómo funciona: el evento `pageshow` se dispara también al volver por bfcache,
// con `event.persisted === true`. En ese caso consultamos /api/me; si ya no hay
// sesión (401), redirigimos a /login. Si sigue válida, no hacemos nada.

import { useEffect } from "react";

export default function BfcacheGuard() {
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return; // navegación normal, no restauración de bfcache
      fetch("/api/me", { cache: "no-store" })
        .then((r) => {
          if (!r.ok) window.location.replace("/login");
        })
        .catch(() => { /* sin red: no forzamos nada */ });
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  return null;
}
