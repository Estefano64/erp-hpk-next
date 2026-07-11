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
  // ── RRHH: admin gestiona; planner/produccion solo VEN los trabajadores
  //    (la parte de cuentas/roles es admin-only y la página la oculta para
  //    los demás — sin esto se veía "a medias" con las cuentas vacías).
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

// Costos de OT (pestaña Costos + endpoints /costos + columnas ?costos=1):
// SOLO los admin — y dentro de ellos, no quien tenga el modificador
// `sin_costos` (caso Diego Muñoz: admin que no ve costos).
export function puedeVerCostosOT(roles: string[] | null | undefined): boolean {
  const r = roles ?? [];
  return r.includes("admin") && !r.includes("sin_costos");
}

// Roles "de área" (referencia para seeds/UI; el gating usa las listas de arriba).
export const ROLES_AREA = AREAS;

// ────────────────────────────────────────────────────────────────────────────
// Fase 2: gating de ESCRITURA en /api/* (POST/PUT/PATCH/DELETE), aplicado por
// el middleware. Los GET nunca se bloquean acá.
//
// Reglas:
//   - DEFAULT PERMITIDO: endpoint sin regla = no se bloquea (locks, r2, me,
//     tickets, etc.). Igual que la matriz de páginas.
//   - `roles: null` = EXENTO explícitamente: el gating central no aplica y
//     manda el chequeo propio del endpoint. Se usa para (a) el flujo de
//     APROBACIONES (pedido del usuario: no tocar por ahora) y (b) las subrutas
//     del TÉCNICO (iniciar/pausar/finalizar/adjuntos), que ya validan
//     asignación adentro.
//   - Matching por prefijo + sufijo opcional; gana la regla más específica
//     (mayor largo de prefijo+sufijo). "admin" siempre pasa.
//   - Esto NO reemplaza los chequeos in-route existentes (requireAdmin de
//     usuarios/catálogos, asignación del técnico, etc.): es una capa previa.
const AREA_OT = ["admin", "planner", "produccion", "logistica"] as const;
const TODAS_AREAS = ["admin", "planner", "produccion", "logistica", "mantenimiento", "contabilidad"] as const;
const EVALUACION = ["admin", "planner", "produccion", "evaluador", "aprobador_evaluacion", "tecnico"] as const;
const COMPRA = ["admin", "logistica"] as const;

type ReglaApi = { prefijo: string; sufijo?: string; roles: readonly string[] | null };

export const REGLAS_ESCRITURA_API: ReglaApi[] = [
  // ── RRHH: trabajadores solo admin (usuarios ya tiene requireAdmin propio)
  { prefijo: "/api/trabajadores", roles: ["admin"] },
  // ── OTs externas: crean/editan las áreas de OT (incluye sus reqs/adjuntos)
  { prefijo: "/api/ordenes-trabajo", roles: AREA_OT },
  //    …pero el llenado de la hoja de evaluación es del flujo de evaluación
  { prefijo: "/api/ordenes-trabajo", sufijo: "/evaluacion/finalizar", roles: EVALUACION },
  { prefijo: "/api/ordenes-trabajo", sufijo: "/evaluacion/foto", roles: EVALUACION },
  { prefijo: "/api/ordenes-trabajo", sufijo: "/evaluacion/foto/upload-url", roles: EVALUACION },
  // ── OTs internas: las editan todas las áreas; la aprobación queda exenta
  { prefijo: "/api/ordenes-trabajo-internas", roles: TODAS_AREAS },
  { prefijo: "/api/ordenes-trabajo-internas", sufijo: "/aprobacion", roles: null },
  // ── Hojas de evaluación
  { prefijo: "/api/evaluaciones", roles: EVALUACION },
  // ── Planificación / programación: planner y produccion editan…
  { prefijo: "/api/planificacion", roles: ["admin", "planner", "produccion"] },
  //    …y las subrutas del TÉCNICO quedan exentas (validan asignación adentro)
  { prefijo: "/api/planificacion", sufijo: "/iniciar", roles: null },
  { prefijo: "/api/planificacion", sufijo: "/pausar", roles: null },
  { prefijo: "/api/planificacion", sufijo: "/finalizar", roles: null },
  { prefijo: "/api/planificacion", sufijo: "/adjuntos", roles: null },
  { prefijo: "/api/planificacion", sufijo: "/adjuntos/upload-url", roles: null },
  // ── Requerimientos globales: solicitan/editan las áreas de OT…
  { prefijo: "/api/requerimientos", roles: AREA_OT },
  //    …las operaciones de almacén/cotización son de logística…
  { prefijo: "/api/requerimientos", sufijo: "/consumir-de-almacen", roles: COMPRA },
  { prefijo: "/api/requerimientos", sufijo: "/consumir-caja-chica", roles: COMPRA },
  { prefijo: "/api/requerimientos", sufijo: "/precio", roles: COMPRA },
  { prefijo: "/api/requerimientos", sufijo: "/dividir", roles: COMPRA },
  { prefijo: "/api/requerimientos", sufijo: "/vincular-material", roles: COMPRA },
  //    …y el flujo de APROBACIONES queda exento (no tocar por ahora)
  { prefijo: "/api/requerimientos", sufijo: "/aprobar", roles: null },
  { prefijo: "/api/requerimientos", sufijo: "/desaprobar", roles: null },
  { prefijo: "/api/requerimientos", sufijo: "/anular", roles: null },
  { prefijo: "/api/requerimientos/aprobar-lote", roles: null },
  { prefijo: "/api/requerimientos/desaprobar-lote", roles: null },
  { prefijo: "/api/requerimientos", sufijo: "/enviar-a-aprobacion", roles: null },
  // ── Compras / OCs: escribe logística; guías/facturas también contabilidad;
  //    aceptar/anular (aprobación de OC) exentos
  { prefijo: "/api/compras", roles: COMPRA },
  { prefijo: "/api/compras", sufijo: "/guia", roles: ["admin", "logistica", "contabilidad"] },
  { prefijo: "/api/compras", sufijo: "/guia/upload-url", roles: ["admin", "logistica", "contabilidad"] },
  { prefijo: "/api/compras", sufijo: "/adjuntos", roles: ["admin", "logistica", "contabilidad"] },
  { prefijo: "/api/compras", sufijo: "/aceptar", roles: null },
  { prefijo: "/api/compras", sufijo: "/anular", roles: null },
  // ── Almacén. Movimientos incluye a mantenimiento porque la entrega de
  //    suministros (que mantenimiento SÍ gestiona según la matriz) registra
  //    una SALIDA por este mismo endpoint.
  { prefijo: "/api/movimientos", roles: ["admin", "logistica", "mantenimiento"] },
  { prefijo: "/api/despachos", roles: COMPRA },
  { prefijo: "/api/no-catalogados", roles: COMPRA },
  // ── Herramientas y suministros (materiales incluye mantenimiento porque
  //    /suministros edita materiales de esa categoría)
  { prefijo: "/api/herramientas", roles: ["admin", "logistica", "mantenimiento"] },
  { prefijo: "/api/prestamos-herramientas", roles: ["admin", "logistica", "mantenimiento"] },
  { prefijo: "/api/materiales", roles: ["admin", "logistica", "mantenimiento"] },
  // ── Maestros de logística
  { prefijo: "/api/clientes", roles: COMPRA },
  { prefijo: "/api/proveedores", roles: COMPRA },
  // ── Contratos: solo logística y producción
  { prefijo: "/api/contratos", roles: ["admin", "produccion", "logistica"] },
  // ── Códigos estratégicos y sus catálogos: todas las áreas
  { prefijo: "/api/codigos-reparacion", roles: TODAS_AREAS },
  { prefijo: "/api/operaciones-cod-rep", roles: TODAS_AREAS },
  { prefijo: "/api/operaciones-reparacion", roles: TODAS_AREAS },
  { prefijo: "/api/servicios-reparacion", roles: TODAS_AREAS },
  // ── Mantenimiento
  { prefijo: "/api/equipos", roles: ["admin", "mantenimiento"] },
  { prefijo: "/api/vehiculos", roles: ["admin", "mantenimiento"] },
  { prefijo: "/api/mantenimiento", roles: ["admin", "mantenimiento"] },
  // ── Facturación de OT
  { prefijo: "/api/facturacion", roles: ["admin", "logistica", "contabilidad"] },
];

const METODOS_ESCRITURA = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// ¿El usuario puede ejecutar esta ESCRITURA de API? (los GET no pasan por acá)
export function puedeEscribirApi(
  roles: string[] | null | undefined,
  pathname: string,
  method: string,
): boolean {
  if (!METODOS_ESCRITURA.has(method.toUpperCase())) return true;
  const r = roles ?? [];
  if (r.includes("admin")) return true;
  let regla: ReglaApi | null = null;
  let especificidad = -1;
  for (const it of REGLAS_ESCRITURA_API) {
    const matchPrefijo = pathname === it.prefijo || pathname.startsWith(it.prefijo + "/");
    if (!matchPrefijo) continue;
    if (it.sufijo && !pathname.endsWith(it.sufijo)) continue;
    const esp = it.prefijo.length + (it.sufijo?.length ?? 0);
    if (esp > especificidad) { regla = it; especificidad = esp; }
  }
  if (!regla) return true;          // sin regla = default permitido
  if (regla.roles === null) return true; // exento: manda el chequeo in-route
  return regla.roles.some((rol) => r.includes(rol));
}
