// Verificación de autorización para download/delete de objetos R2 vía endpoints
// genéricos /api/r2/download-url y /api/r2/delete.
//
// IMPORTANTE: los endpoints de R2 NO aceptan keys arbitrarios. El caller debe
// especificar el tipo de recurso (resource) y su id; consultamos la BD para
// confirmar que la key corresponde a ese registro. Sin ese vínculo, no se
// firma/elimina nada (previene "te paso cualquier key y la firmás").
//
// El UPLOAD ya no pasa por acá: cada módulo expone su propio endpoint
// /api/<modulo>/.../upload-url que arma la key con R2Keys del lado servidor.
import { prisma } from "./prisma";

export type R2Resource =
  | "ot-adjunto"
  | "ot-interna-adjunto"
  | "req-adjunto"
  | "plan-adjunto"
  | "compra-guia"
  | "compra-factura"
  | "evaluacion-informe"
  | "ticket-captura";

const VALID_RESOURCES: ReadonlySet<R2Resource> = new Set([
  "ot-adjunto",
  "ot-interna-adjunto",
  "req-adjunto",
  "plan-adjunto",
  "compra-guia",
  "compra-factura",
  "evaluacion-informe",
  "ticket-captura",
]);

export function isValidResource(value: unknown): value is R2Resource {
  return typeof value === "string" && VALID_RESOURCES.has(value as R2Resource);
}

export interface AuthzResult {
  ok: boolean;
  error?: string;
  status?: number;
}

// Confirma que la key existe y que pertenece al recurso indicado.
// El llamador debe haber validado la sesión antes.
export async function authorizeR2Access(params: {
  resource: R2Resource;
  resourceId: number;
  key: string;
}): Promise<AuthzResult> {
  const { resource, resourceId, key } = params;

  if (!Number.isFinite(resourceId) || resourceId <= 0) {
    return { ok: false, error: "resourceId inválido", status: 400 };
  }
  if (typeof key !== "string" || key.length === 0) {
    return { ok: false, error: "key requerida", status: 400 };
  }

  switch (resource) {
    case "ot-adjunto": {
      const row = await prisma.otAdjunto.findFirst({
        where: { id: resourceId, r2_key: key, orden_trabajo_id: { not: null } },
        select: { id: true },
      });
      return row ? { ok: true } : notFound();
    }
    case "ot-interna-adjunto": {
      const row = await prisma.otAdjunto.findFirst({
        where: { id: resourceId, r2_key: key, orden_trabajo_interna_id: { not: null } },
        select: { id: true },
      });
      return row ? { ok: true } : notFound();
    }
    case "req-adjunto": {
      const row = await prisma.oTRepuestoAdjunto.findFirst({
        where: { id: resourceId, r2_key: key },
        select: { id: true },
      });
      return row ? { ok: true } : notFound();
    }
    case "plan-adjunto": {
      const row = await prisma.planificacionOTAdjunto.findFirst({
        where: { id: resourceId, r2_key: key },
        select: { id: true },
      });
      return row ? { ok: true } : notFound();
    }
    case "compra-guia": {
      const row = await prisma.compra.findFirst({
        where: { id: resourceId, guia_key: key },
        select: { id: true },
      });
      return row ? { ok: true } : notFound();
    }
    case "compra-factura": {
      const row = await prisma.compra.findFirst({
        where: { id: resourceId, factura_key: key },
        select: { id: true },
      });
      return row ? { ok: true } : notFound();
    }
    case "evaluacion-informe": {
      const row = await prisma.evaluacionTecnica.findFirst({
        where: { id: resourceId, informe_key: key },
        select: { id: true },
      });
      return row ? { ok: true } : notFound();
    }
    case "ticket-captura": {
      const row = await prisma.ticket.findFirst({
        where: { id: resourceId, captura_key: key },
        select: { id: true },
      });
      return row ? { ok: true } : notFound();
    }
  }
}

function notFound(): AuthzResult {
  return { ok: false, error: "Recurso no encontrado o key no coincide", status: 404 };
}
