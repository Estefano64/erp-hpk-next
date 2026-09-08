"use client";

// Hook para ocultar botones de mutación según la MISMA matriz que aplica el
// middleware (REGLAS_ESCRITURA_API de acceso-rutas.ts). Se le pasa una ruta
// de API representativa de la acción (con ids ficticios, ej.
// "/api/requerimientos/0/consumir-de-almacen") y el método.
//
// La protección real sigue siendo el servidor: esto es solo UX, para que un
// rol de solo-lectura no llene un formulario entero y reciba el 403 al final.
// Al usar la misma matriz es imposible que botón y servidor se desincronicen.

import { useState } from "react";
import { useSession } from "next-auth/react";
import { puedeEscribirApi } from "@/lib/acceso-rutas";

export function useEscrituraApi(rutaApi: string, method: string = "POST"): boolean {
  const { data: session } = useSession();
  const roles = ((session?.user as { roles?: string[] } | undefined)?.roles) ?? [];
  // Memoria anti-parpadeo (2026-09-08): los refetch periódicos de next-auth
  // pueden dejar la sesión momentáneamente vacía (undefined→real→undefined,
  // mismo fenómeno documentado en usePersistedState de tables.tsx). Sin
  // memoria, los tabs/botones gateados por rol desaparecían "por ratos" con
  // red lenta y volvían solos. Si esta pestaña ya conoció roles, un vacío
  // transitorio no los borra — el logout real navega fuera vía middleware,
  // y la autoridad sigue siendo el servidor en cada request.
  const [ultimosRolesKey, setUltimosRolesKey] = useState("");
  const rolesKey = roles.join(",");
  if (roles.length > 0 && rolesKey !== ultimosRolesKey) {
    // Patrón "derive state during render" (doc de React) — sin useEffect.
    setUltimosRolesKey(rolesKey);
  }
  const efectivos = roles.length > 0
    ? roles
    : ultimosRolesKey.split(",").filter(Boolean);
  return puedeEscribirApi(efectivos, rutaApi, method);
}
