// Helpers de servidor del módulo SSOMA - SIG.
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { SAC_TIPOS_DESVIACION, SAC_FUENTES, SAC_SISTEMAS } from "./ssoma";

// ¿El usuario es encargado de seguridad (rol "ssoma") o admin?
// Gatea las acciones del flujo: aprobar/cerrar reportes de seguridad,
// generar SACs y anular registros. El middleware ya aplica una capa previa
// (REGLAS_ESCRITURA_API) — esto es la verificación in-route.
export async function esEncargadoSsoma(req: NextRequest): Promise<boolean> {
  const token = await getToken({ req });
  const roles = (token?.roles as string[] | undefined) ?? [];
  return roles.includes("admin") || roles.includes("ssoma");
}

// Valida el objeto foto que el cliente registra después de subir a R2
// ({ key, nombre_archivo, tipo_mime, tamano }). Devuelve null si es inválido.
export interface FotoInput {
  key: string;
  nombre_archivo: string;
  tipo_mime: string;
  tamano: number;
}

export function parseFotoInput(raw: unknown): FotoInput | null {
  if (raw === null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const key = typeof o.key === "string" ? o.key.trim() : "";
  const nombre = typeof o.nombre_archivo === "string" ? o.nombre_archivo.trim() : "";
  const mime = typeof o.tipo_mime === "string" ? o.tipo_mime.trim() : "";
  const tamano = typeof o.tamano === "number" && Number.isFinite(o.tamano) ? Math.round(o.tamano) : 0;
  if (!key || !nombre || !mime || tamano <= 0) return null;
  return { key: key.slice(0, 500), nombre_archivo: nombre.slice(0, 255), tipo_mime: mime.slice(0, 100), tamano };
}

// Las fotos SSOMA se suben bajo estos prefijos (ver R2Keys). Rechazamos keys
// que no pertenezcan al namespace — evita registrar en BD una key ajena.
export function esKeySsoma(key: string, prefijo: string): boolean {
  return key.startsWith(prefijo + "/") && !key.includes("..");
}

// ── Normalización de body de SAC (compartido por POST y PATCH) ───
const TIPOS_VALIDOS = new Set<string>(SAC_TIPOS_DESVIACION.map((t) => t.value));
const FUENTES_VALIDAS = new Set<string>(SAC_FUENTES.map((f) => f.value));
const SISTEMAS_VALIDOS = new Set<string>(SAC_SISTEMAS.map((s) => s.value));

// Extrae el bloque de campos editables de una SAC desde el body. Solo toca
// las claves presentes (patrón `!== undefined` del resto de PATCHs del repo).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sacDataDesdeBody(body: any): { error?: string; data?: any } {
  if (body.tipo_desviacion && !TIPOS_VALIDOS.has(body.tipo_desviacion)) {
    return { error: "tipo_desviacion inválido" };
  }
  if (body.fuente && !FUENTES_VALIDAS.has(body.fuente)) {
    return { error: "fuente inválida" };
  }
  const sistemas: string[] = Array.isArray(body.sistemas)
    ? body.sistemas.filter((s: unknown) => typeof s === "string" && SISTEMAS_VALIDOS.has(s as string))
    : [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};
  if (body.tipo_desviacion !== undefined) data.tipo_desviacion = body.tipo_desviacion || null;
  if (body.fuente !== undefined) data.fuente = body.fuente || null;
  if (body.fuente_otros !== undefined) data.fuente_otros = body.fuente_otros?.trim() || null;
  if (body.sistemas !== undefined) data.sistemas = sistemas;
  if (body.descripcion !== undefined) data.descripcion = body.descripcion?.trim() || null;
  if (body.norma_requisito !== undefined) data.norma_requisito = body.norma_requisito?.trim() || null;
  if (body.documento_referencia !== undefined) data.documento_referencia = body.documento_referencia?.trim() || null;
  if (body.proceso_responsable !== undefined) data.proceso_responsable = body.proceso_responsable?.trim() || null;
  if (body.identificado_por !== undefined) data.identificado_por = body.identificado_por?.trim() || null;
  if (body.fecha_identificacion !== undefined) {
    data.fecha_identificacion = body.fecha_identificacion ? new Date(body.fecha_identificacion) : null;
  }
  if (body.correccion_inmediata !== undefined) data.correccion_inmediata = body.correccion_inmediata?.trim() || null;
  if (body.analisis_causa_raiz !== undefined) data.analisis_causa_raiz = body.analisis_causa_raiz?.trim() || null;
  if (body.responsable_cierre !== undefined) data.responsable_cierre = body.responsable_cierre?.trim() || null;
  if (body.fecha_cierre_programada !== undefined) {
    data.fecha_cierre_programada = body.fecha_cierre_programada ? new Date(body.fecha_cierre_programada) : null;
  }
  if (body.verificacion_eficacia !== undefined) data.verificacion_eficacia = body.verificacion_eficacia?.trim() || null;
  if (body.verificado_por !== undefined) data.verificado_por = body.verificado_por?.trim() || null;
  if (body.fecha_verificacion !== undefined) {
    data.fecha_verificacion = body.fecha_verificacion ? new Date(body.fecha_verificacion) : null;
  }
  if (body.genera_riesgo !== undefined) {
    data.genera_riesgo = body.genera_riesgo === null ? null : body.genera_riesgo === true;
  }
  if (body.riesgo_identificado !== undefined) data.riesgo_identificado = body.riesgo_identificado?.trim() || null;
  if (body.proceso_afectado !== undefined) data.proceso_afectado = body.proceso_afectado?.trim() || null;
  if (body.accion_riesgo !== undefined) data.accion_riesgo = body.accion_riesgo?.trim() || null;
  return { data };
}

// Normaliza el array `acciones` del body (o null si no vino — no tocar).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sacAccionesDesdeBody(body: any):
  | { orden: number; descripcion: string; responsable: string | null; fecha: Date | null }[]
  | null {
  if (!Array.isArray(body.acciones)) return null;
  return body.acciones
    .map((a: Record<string, unknown>, i: number) => ({
      orden: i + 1,
      descripcion: typeof a.descripcion === "string" ? a.descripcion.trim() : "",
      responsable: typeof a.responsable === "string" ? a.responsable.trim() || null : null,
      fecha: a.fecha ? new Date(String(a.fecha)) : null,
    }))
    .filter((a: { descripcion: string }) => a.descripcion.length > 0);
}
