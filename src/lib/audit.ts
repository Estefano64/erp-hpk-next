import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import type { Prisma, PrismaClient } from "@prisma/client";

export async function getAuditUser(req: NextRequest): Promise<string | null> {
  const token = await getToken({ req });
  if (!token) return null;
  return (token.name as string) ?? (token.email as string) ?? null;
}

export async function isAdmin(req: NextRequest): Promise<boolean> {
  const token = await getToken({ req });
  const roles = (token?.roles as string[] | undefined) ?? [];
  return roles.includes("admin");
}

type OTSnapshot = Record<string, unknown>;

type AuditField = {
  key: string;
  label: string;
  op: "CAMBIO_ESTADO" | "REPROGRAMACION" | "EDICION";
  /** Si la diferencia se mide como fecha. */
  isDate?: boolean;
};

const AUDITED_FIELDS: AuditField[] = [
  // Status
  { key: "ot_status_codigo", label: "OT Status", op: "CAMBIO_ESTADO" },
  { key: "recursos_status_codigo", label: "Recursos Status", op: "CAMBIO_ESTADO" },
  { key: "taller_status_codigo", label: "Taller Status", op: "CAMBIO_ESTADO" },
  // Reprogramación / fechas clave
  { key: "fecha_reprogramada", label: "Fecha Reprogramada", op: "REPROGRAMACION", isDate: true },
  { key: "fecha_requerimiento_cliente", label: "Fecha Requerimiento Cliente", op: "REPROGRAMACION", isDate: true },
  { key: "fecha_recepcion", label: "Fecha Recepción", op: "EDICION", isDate: true },
  // Identificación
  { key: "id_cliente", label: "Cliente", op: "EDICION" },
  { key: "id_cod_rep", label: "Código Estratégico", op: "EDICION" },
  { key: "equipo_codigo", label: "Equipo", op: "EDICION" },
  { key: "descripcion", label: "Descripción", op: "EDICION" },
  // Atención / Reparación / Garantía
  { key: "atencion_reparacion_codigo", label: "Atención Reparación", op: "EDICION" },
  { key: "tipo_reparacion_codigo", label: "Tipo Reparación", op: "EDICION" },
  { key: "prioridad_atencion_codigo", label: "Prioridad", op: "EDICION" },
  { key: "garantia_codigo", label: "Garantía", op: "EDICION" },
  { key: "tipo_garantia_codigo", label: "Tipo Garantía", op: "EDICION" },
  { key: "base_metalica_codigo", label: "Base Metálica", op: "EDICION" },
  // Numéricos / texto
  { key: "pcr", label: "PCR", op: "EDICION" },
  { key: "horas", label: "Horas", op: "EDICION" },
  { key: "comentarios", label: "Comentarios", op: "EDICION" },
];

/** Campos snapshot que el caller debe seleccionar antes del UPDATE. */
export const AUDIT_OT_SELECT_FIELDS = AUDITED_FIELDS.reduce((acc, f) => {
  acc[f.key] = true;
  return acc;
}, {} as Record<string, true>);

function normalizar(v: unknown, isDate?: boolean): string {
  if (v == null) return "";
  if (isDate) {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return String(v).slice(0, 10);
  }
  return String(v);
}

export async function auditOTChange(
  tx: PrismaClient | Prisma.TransactionClient,
  otId: number,
  before: OTSnapshot,
  after: OTSnapshot,
  usuario: string,
): Promise<number> {
  let count = 0;
  for (const f of AUDITED_FIELDS) {
    const prev = normalizar(before[f.key], f.isDate);
    const next = normalizar(after[f.key], f.isDate);
    if (prev === next) continue;
    await tx.oTHistorial.create({
      data: {
        ot_id: otId,
        tipo_operacion: f.op,
        descripcion: `${f.label}: ${prev || "(vacío)"} → ${next || "(vacío)"}`,
        usuario,
        datos_adicionales: JSON.stringify({
          campo: f.key,
          valor_anterior: before[f.key] ?? null,
          valor_nuevo: after[f.key] ?? null,
        }),
      },
    });
    count++;
  }
  return count;
}

/** @deprecated Usar auditOTChange para registrar todos los cambios relevantes. */
export async function auditOTStatusChange(
  tx: PrismaClient | Prisma.TransactionClient,
  otId: number,
  before: OTSnapshot,
  after: OTSnapshot,
  usuario: string,
): Promise<number> {
  return auditOTChange(tx, otId, before, after, usuario);
}

// ─── Audit de OT Interna ────────────────────────────────────────────────
// Mismo patrón que OT externa pero los campos cambian (no hay cliente, no hay
// taller_status, agregamos area_taller y task_list propios de OT interna).
// El historial se persiste contra `orden_trabajo_interna_id`, no `ot_id`.

const AUDITED_FIELDS_OT_INTERNA: AuditField[] = [
  // Status
  { key: "ot_status_codigo", label: "OT Status", op: "CAMBIO_ESTADO" },
  { key: "user_status_codigo", label: "User Status", op: "CAMBIO_ESTADO" },
  { key: "recursos_status_codigo", label: "Recursos Status", op: "CAMBIO_ESTADO" },
  // Reprogramación / fechas clave
  { key: "fecha_inicio_plan", label: "Inicio Planificado", op: "REPROGRAMACION", isDate: true },
  { key: "fecha_fin_plan", label: "Fin Planificado", op: "REPROGRAMACION", isDate: true },
  { key: "fecha_inicio_real", label: "Inicio Real", op: "EDICION", isDate: true },
  { key: "fecha_fin_real", label: "Fin Real", op: "EDICION", isDate: true },
  { key: "fecha_cierre", label: "Cierre", op: "EDICION", isDate: true },
  // Identificación / asignación
  { key: "tipo_ot_interna_codigo", label: "Tipo", op: "EDICION" },
  { key: "area_taller", label: "Área asignada", op: "EDICION" },
  { key: "equipo_codigo", label: "Equipo", op: "EDICION" },
  { key: "planta_codigo", label: "Planta", op: "EDICION" },
  { key: "descripcion", label: "Descripción", op: "EDICION" },
  { key: "prioridad_atencion_codigo", label: "Prioridad", op: "EDICION" },
  { key: "asignado_a", label: "Asignado a", op: "EDICION" },
  // Planificación
  { key: "semana_revision", label: "Semana revisión", op: "EDICION" },
  { key: "estrategia_id", label: "Estrategia", op: "EDICION" },
  { key: "task_list", label: "Task list", op: "EDICION" },
  // Flags / texto
  { key: "solicitud_mantenimiento", label: "Solicitud Mtto", op: "EDICION" },
  { key: "comentarios", label: "Comentarios", op: "EDICION" },
];

export const AUDIT_OT_INTERNA_SELECT_FIELDS = AUDITED_FIELDS_OT_INTERNA.reduce(
  (acc, f) => { acc[f.key] = true; return acc; },
  {} as Record<string, true>,
);

export async function auditOTInternaChange(
  tx: PrismaClient | Prisma.TransactionClient,
  otInternaId: number,
  before: OTSnapshot,
  after: OTSnapshot,
  usuario: string,
): Promise<number> {
  let count = 0;
  for (const f of AUDITED_FIELDS_OT_INTERNA) {
    const prev = normalizar(before[f.key], f.isDate);
    const next = normalizar(after[f.key], f.isDate);
    if (prev === next) continue;
    await tx.oTHistorial.create({
      data: {
        orden_trabajo_interna_id: otInternaId,
        tipo_operacion: f.op,
        descripcion: `${f.label}: ${prev || "(vacío)"} → ${next || "(vacío)"}`,
        usuario,
        datos_adicionales: JSON.stringify({
          campo: f.key,
          valor_anterior: before[f.key] ?? null,
          valor_nuevo: after[f.key] ?? null,
        }),
      },
    });
    count++;
  }
  return count;
}
