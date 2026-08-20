"use client";
import { useEffect, useState } from "react";

// Nombre del usuario logueado (vía /api/me) — para firmar acciones con la
// persona real en vez de un genérico ("Almacenero"). Devuelve null mientras
// carga o si no hay sesión; el caller decide el fallback.
export function useMiNombre(): string | null {
  const [nombre, setNombre] = useState<string | null>(null);
  useEffect(() => {
    let activo = true;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (activo) setNombre(d?.user?.name ?? null); })
      .catch(() => { /* ignore */ });
    return () => { activo = false; };
  }, []);
  return nombre;
}
