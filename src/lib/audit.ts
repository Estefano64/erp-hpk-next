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
  return token?.rol === "admin";
}

type OTStatusSnapshot = {
  ot_status_codigo?: string | null;
  recursos_status_codigo?: string | null;
  taller_status_codigo?: string | null;
};

const OT_STATUS_FIELDS: {
  key: keyof OTStatusSnapshot;
  label: string;
}[] = [
  { key: "ot_status_codigo", label: "OT Status" },
  { key: "recursos_status_codigo", label: "Recursos Status" },
  { key: "taller_status_codigo", label: "Taller Status" },
];

export async function auditOTStatusChange(
  tx: PrismaClient | Prisma.TransactionClient,
  otId: number,
  before: OTStatusSnapshot,
  after: OTStatusSnapshot,
  usuario: string,
): Promise<number> {
  let count = 0;
  for (const { key, label } of OT_STATUS_FIELDS) {
    const prev = before[key] ?? null;
    const next = after[key] ?? null;
    if (prev === next) continue;
    await tx.oTHistorial.create({
      data: {
        ot_id: otId,
        tipo_operacion: "CAMBIO_ESTADO",
        descripcion: `${label}: ${prev ?? "(vacío)"} → ${next ?? "(vacío)"}`,
        usuario,
        datos_adicionales: JSON.stringify({
          campo: key,
          valor_anterior: prev,
          valor_nuevo: next,
        }),
      },
    });
    count++;
  }
  return count;
}
