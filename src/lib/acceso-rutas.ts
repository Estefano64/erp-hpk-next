// Matriz de visibilidad de rutas por rol — fase 1 del rediseño de roles
// (acordado con el usuario 2026-07-08).
//
// Regla: DEFAULT PERMITIDO. Solo se listan acá las rutas con acceso
// restringido; cualquier ruta que no matchee ningún prefijo es visible para
// todo usuario logueado. Esto evita dejar a alguien afuera de un flujo por
// olvidarnos de listar una ruta.
//
// La comparte:
//   - el middleware (bloqueo server-side: URL directa → redirect /dashboard), y
//   - el layout del dashboard (oculta los items del menú).
//
// Notas de diseño:
//   - "admin" pasa siempre (bypass), igual está en todas las listas por claridad.
//   - El rol "tecnico" restringido se maneja aparte (tecnico-acceso.ts) y corre
//     ANTES que esto: un técnico sin admin nunca llega a estas rutas.
//   - Aprobaciones queda sin restricción a pedido del usuario ("por el momento
//     no toquemos") — cuando se implemente el tope de montos se agrega acá.
//   - "evaluador"/"aprobador_evaluacion" entran a /evaluaciones porque el flujo
//     de hojas de evaluación los necesita.
//   - Edición vs. solo-ver NO se resuelve acá: eso va por endpoint (fases
//     siguientes). Esta matriz es visibilidad de páginas.

const AREAS = ["admin", "planner", "produccion", "logistica", "mantenimiento", "contabilidad"] as const;

export const RUTAS_RESTRINGIDAS: { prefijo: string; roles: readonly string[] }[] = [
  // ── Configuración: catálogos de códigos y config de cotización — solo admin
  { prefijo: "/catalogos", roles: ["admin"] },
  { prefijo: "/configuracion-cotizacion", roles: ["admin"] },
  { prefijo: "/configuracion", roles: ["admin"] },
  // ── RRHH (incluye gestión de cuentas de usuario)
  { prefijo: "/rrhh", roles: ["admin", "planner", "produccion"] },
  // ── Planificación / Programación semanal / Dashboard planificación
  { prefijo: "/operaciones", roles: ["admin", "planner", "produccion", "viewer"] },
  // ── Hojas de evaluación (el flujo evaluador/aprobador la necesita)
  { prefijo: "/evaluaciones", roles: ["admin", "planner", "produccion", "viewer", "evaluador", "aprobador_evaluacion"] },
  // ── Contratos: mantenimiento no
  { prefijo: "/contratos", roles: ["admin", "planner", "produccion", "logistica", "contabilidad", "viewer"] },
  // ── Módulo Mantenimiento (equipos, vehículos, task lists)
  { prefijo: "/mantenimiento", roles: ["admin", "planner", "produccion", "mantenimiento", "viewer"] },
  // ── Herramientas y suministros: contabilidad no
  { prefijo: "/herramientas", roles: ["admin", "planner", "produccion", "logistica", "mantenimiento", "viewer"] },
  { prefijo: "/suministros", roles: ["admin", "planner", "produccion", "logistica", "mantenimiento", "viewer"] },
  // ── Despacho a mina y facturación: mantenimiento no
  //    (/despachos/mina es más específico que /despachos, que queda abierto)
  { prefijo: "/despachos/mina", roles: ["admin", "planner", "produccion", "logistica", "contabilidad", "viewer"] },
  { prefijo: "/facturacion", roles: ["admin", "planner", "produccion", "logistica", "contabilidad", "viewer"] },
];

// ¿El usuario puede VER esta ruta de página? Matchea por prefijo; si varios
// prefijos aplican gana el más específico (el más largo).
export function puedeVerRuta(roles: string[] | null | undefined, pathname: string): boolean {
  const r = roles ?? [];
  if (r.includes("admin")) return true;
  let regla: { prefijo: string; roles: readonly string[] } | null = null;
  for (const it of RUTAS_RESTRINGIDAS) {
    if (pathname === it.prefijo || pathname.startsWith(it.prefijo + "/")) {
      if (!regla || it.prefijo.length > regla.prefijo.length) regla = it;
    }
  }
  if (!regla) return true;
  return regla.roles.some((rol) => r.includes(rol));
}

// Modificador restrictivo: oculta la pestaña "Costos" de las OTs (externas e
// internas). Pensado para cuentas admin que no deben ver costos (Diego Muñoz).
export function puedeVerCostosOT(roles: string[] | null | undefined): boolean {
  return !(roles ?? []).includes("sin_costos");
}

// Roles "de área" (referencia para seeds/UI; el gating usa las listas de arriba).
export const ROLES_AREA = AREAS;
