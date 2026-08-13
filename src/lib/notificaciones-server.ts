// Notificaciones in-app — helpers de servidor.
//
// Diseño: crear una notificación NUNCA debe voltear la operación de negocio
// que la origina. Por eso `crearNotificaciones` traga sus propios errores y
// se llama FUERA de la transacción principal (después del commit).
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { prisma } from "./prisma";

export interface NuevaNotificacion {
  usuario_id: number;
  tipo: string;
  titulo: string;
  mensaje?: string | null;
  url?: string | null;
}

// Id de la cuenta logueada (token.sub = String(usuario.id)), o null.
export async function getUsuarioIdSesion(req: NextRequest): Promise<number | null> {
  const token = await getToken({ req });
  const n = Number(token?.sub);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Inserta el lote de notificaciones. Descarta las dirigidas a quien las
// genera (no te notificás a vos mismo) y las de usuarios inexistentes.
// Devuelve cuántas se crearon; ante error loguea y devuelve 0.
export async function crearNotificaciones(
  notis: NuevaNotificacion[],
  opts: { creadaPor?: string | null; omitirUsuarioId?: number | null } = {},
): Promise<number> {
  const filtradas = notis.filter(
    (n) => Number.isInteger(n.usuario_id) && n.usuario_id > 0 && n.usuario_id !== opts.omitirUsuarioId,
  );
  if (filtradas.length === 0) return 0;
  try {
    const res = await prisma.notificacion.createMany({
      data: filtradas.map((n) => ({
        usuario_id: n.usuario_id,
        tipo: n.tipo.slice(0, 40),
        titulo: n.titulo.slice(0, 200),
        mensaje: n.mensaje?.slice(0, 600) ?? null,
        url: n.url?.slice(0, 300) ?? null,
        creada_por: opts.creadaPor?.slice(0, 100) ?? null,
      })),
      skipDuplicates: false,
    });
    return res.count;
  } catch (e) {
    console.error("crearNotificaciones error:", e);
    return 0;
  }
}
