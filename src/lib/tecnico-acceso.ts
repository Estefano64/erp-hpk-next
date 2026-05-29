// Regla de acceso para el rol "técnico" (operario de taller).
//
// Un técnico restringido = tiene el rol "tecnico" pero NO "admin". Para ese
// usuario el ERP se reduce a su panel, sus tareas y los tickets; el resto de
// apartados ni se muestran en el menú ni se pueden abrir por URL.
//
// Esta lógica es compartida por:
//   - el middleware (bloqueo de rutas server-side), y
//   - el layout del dashboard (oculta items del menú + redirige).
// Mantenerla acá evita que las dos copias se desincronicen.

// Rutas de página que un técnico restringido puede visitar. Cualquier subruta
// (p. ej. /tickets/123) también se permite por prefijo.
export const RUTAS_TECNICO = ["/dashboard", "/mis-tareas", "/tickets"] as const;

export function esTecnicoRestringido(roles: string[] | null | undefined): boolean {
  const r = roles ?? [];
  return r.includes("tecnico") && !r.includes("admin");
}

export function rutaPermitidaTecnico(pathname: string): boolean {
  return RUTAS_TECNICO.some((base) => pathname === base || pathname.startsWith(base + "/"));
}
