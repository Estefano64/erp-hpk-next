"use client";

// Hook para ocultar botones de mutación según la MISMA matriz que aplica el
// middleware (REGLAS_ESCRITURA_API de acceso-rutas.ts). Se le pasa una ruta
// de API representativa de la acción (con ids ficticios, ej.
// "/api/requerimientos/0/consumir-de-almacen") y el método.
//
// La protección real sigue siendo el servidor: esto es solo UX, para que un
// rol de solo-lectura no llene un formulario entero y reciba el 403 al final.
// Al usar la misma matriz es imposible que botón y servidor se desincronicen.

import { useSession } from "next-auth/react";
import { puedeEscribirApi } from "@/lib/acceso-rutas";

export function useEscrituraApi(rutaApi: string, method: string = "POST"): boolean {
  const { data: session } = useSession();
  const roles = ((session?.user as { roles?: string[] } | undefined)?.roles) ?? [];
  return puedeEscribirApi(roles, rutaApi, method);
}
