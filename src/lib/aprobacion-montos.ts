// Estrategia de liberación multi-nivel (esquema A/B/C, 2026-08-11).
//
// Cada documento se CLASIFICA por su monto en USD (Werteschema) y eso decide
// qué códigos de liberación necesita. La liberación es SECUENCIAL: B no puede
// firmar hasta que A firmó; C al final. El documento queda liberado (APROBADO
// para reqs / PROCESO para OCs) recién cuando TODOS los niveles requeridos
// tienen firma; mientras tanto conserva su estado previo.
//
//   Órdenes de compra ($, sobre el total con IGV):
//     0 – 1,000      autoliberación: el elaborador (o quien tenga un nivel)
//     1,000 – 2,500  nivel A  (Jefe de Logística — aprobador_oc_2500)
//     2,500 – 5,000  niveles A + B  (B = Jefe de Operaciones — aprobador_oc_5000)
//     > 5,000        niveles A + B + C  (C = Gerencia — Carlos, Pio)
//
//   Requerimientos (por item, cantidad × precio):
//     hasta 5,000 (o sin precio)  nivel A  (Jefe de Operaciones — aprobador_requerimiento)
//     > 5,000                     niveles A + B  (B = Gerencia)
//
// Notas de diseño:
//   - Cada nivel lo firma SOLO quien tiene el rol de ese nivel — un nivel
//     superior NO sustituye a uno inferior (gerencia no firma por Miriam).
//     Esa segregación es el punto del esquema multi-firma.
//   - `gerencia` sigue sin derivarse de `admin` (Diego Muñoz es admin y su
//     techo es el nivel B). Admin tampoco firma niveles que no tenga.
//   - Montos en USD. Soles se convierten con factor fijo 3.5.
//   - Las FIRMAS viven en la tabla `liberacion_codigo`; los niveles
//     requeridos se calculan al vuelo con estas funciones (si el monto
//     cambia, la clasificación se recalcula sola). Motor server-side en
//     src/lib/liberacion.ts. Este archivo es puro y client-safe (la página
//     /aprobaciones lo usa para pintar el semáforo A/B/C).

const FACTOR_PEN = 3.5;

export function montoEnUSD(monto: number, moneda?: string | null): number {
  const m = (moneda ?? "USD").toUpperCase().trim();
  if (m === "PEN" || m === "SOL" || m === "SOLES" || m === "S/" || m === "S/.") {
    return monto / FACTOR_PEN;
  }
  return monto;
}

export type NivelLiberacion = "A" | "B" | "C";
export type TipoDocLiberacion = "OC" | "REQ";

export interface NivelDef {
  nivel: NivelLiberacion;
  nombre: string;
  roles: string[];
}

export const NIVELES_OC: NivelDef[] = [
  { nivel: "A", nombre: "Jefe de Logística", roles: ["aprobador_oc_2500"] },
  { nivel: "B", nombre: "Jefe de Operaciones", roles: ["aprobador_oc_5000"] },
  { nivel: "C", nombre: "Gerencia", roles: ["gerencia"] },
];

export const NIVELES_REQ: NivelDef[] = [
  { nivel: "A", nombre: "Jefe de Operaciones", roles: ["aprobador_requerimiento"] },
  { nivel: "B", nombre: "Gerencia", roles: ["gerencia"] },
];

export function nivelesDe(tipo: TipoDocLiberacion): NivelDef[] {
  return tipo === "OC" ? NIVELES_OC : NIVELES_REQ;
}

// Clasificación (Werteschema): qué niveles requiere una OC de este monto.
// [] = autoliberación (< $1,000): la acepta el elaborador o cualquier nivel.
export function nivelesRequeridosOC(montoUSD: number): NivelLiberacion[] {
  if (montoUSD < 1000) return [];
  if (montoUSD <= 2500) return ["A"];
  if (montoUSD <= 5000) return ["A", "B"];
  return ["A", "B", "C"];
}

// Qué niveles requiere un requerimiento de este monto (sin precio ⇒ solo A).
export function nivelesRequeridosReq(montoUSD: number): NivelLiberacion[] {
  return montoUSD <= 5000 ? ["A"] : ["A", "B"];
}

export function nivelesRequeridos(tipo: TipoDocLiberacion, montoUSD: number): NivelLiberacion[] {
  return tipo === "OC" ? nivelesRequeridosOC(montoUSD) : nivelesRequeridosReq(montoUSD);
}

// ¿Este usuario tiene el rol del nivel indicado?
export function puedeFirmarNivel(
  tipo: TipoDocLiberacion,
  nivel: NivelLiberacion,
  roles: string[] | null | undefined,
): boolean {
  const r = roles ?? [];
  const def = nivelesDe(tipo).find((d) => d.nivel === nivel);
  return def != null && def.roles.some((rol) => r.includes(rol));
}

// ¿Tiene el usuario ALGÚN nivel de este documento? (para la autoliberación
// de OCs < $1,000: "el elaborador o cualquier nivel").
export function tieneAlgunNivel(tipo: TipoDocLiberacion, roles: string[] | null | undefined): boolean {
  const r = roles ?? [];
  return nivelesDe(tipo).some((d) => d.roles.some((rol) => r.includes(rol)));
}

export interface EstadoLiberacion {
  requeridos: NivelLiberacion[];
  firmados: NivelLiberacion[];
  pendientes: NivelLiberacion[];
  // Primer nivel pendiente en orden (la estrategia es secuencial) o null.
  siguiente: NivelLiberacion | null;
  liberado: boolean;
}

// Estado de liberación de un documento: requeridos según monto vs firmados.
export function estadoLiberacion(
  tipo: TipoDocLiberacion,
  montoUSD: number,
  firmados: string[],
): EstadoLiberacion {
  const requeridos = nivelesRequeridos(tipo, montoUSD);
  const setFirmados = new Set(firmados);
  const pendientes = requeridos.filter((n) => !setFirmados.has(n));
  return {
    requeridos,
    firmados: requeridos.filter((n) => setFirmados.has(n)),
    pendientes,
    siguiente: pendientes[0] ?? null,
    liberado: pendientes.length === 0,
  };
}

export function nombreNivel(tipo: TipoDocLiberacion, nivel: NivelLiberacion): string {
  return nivelesDe(tipo).find((d) => d.nivel === nivel)?.nombre ?? nivel;
}

export const fmtUSD = (n: number) =>
  `US$ ${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
