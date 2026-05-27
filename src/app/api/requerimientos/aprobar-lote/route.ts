// POST /api/requerimientos/aprobar-lote
// Aprueba TODOS los items de un requerimiento de una sola vez, en una sola
// transacción. Usado por el módulo /aprobaciones (que muestra requerimientos
// agrupados por nro_req).
//
// Body acepta dos formas:
//   { nro_req: string }       → aprueba todos los OTRepuesto con ese nro_req
//                                  en estado SIN_APROBACION
//   { ids: number[] }         → aprueba esos ids específicos (fallback para
//                                  items sin nro_req)
//
// Permiso: cualquier usuario autenticado (mismo criterio que aceptar OC).
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: { nro_req?: unknown; ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const nroReq = typeof body.nro_req === "string" && body.nro_req.length > 0 ? body.nro_req : null;
  const ids = Array.isArray(body.ids)
    ? (body.ids as unknown[]).filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x > 0)
    : null;

  if (!nroReq && (!ids || ids.length === 0)) {
    return NextResponse.json({ error: "Se requiere nro_req o ids[]" }, { status: 400 });
  }

  const usuario = (await getAuditUser(req)) ?? "sistema";

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Cargar items candidatos: SIN_APROBACION + sin OC asociada.
      const candidatos = await tx.oTRepuesto.findMany({
        where: {
          status_requerimiento_codigo: "SIN_APROBACION",
          ...(nroReq ? { nro_req: nroReq } : { id: { in: ids! } }),
        },
        select: { id: true, ot_id: true, nro_req: true },
      });

      if (candidatos.length === 0) {
        return { aprobados: 0, ot_ids: [] as number[], ref: nroReq ?? `${ids?.length ?? 0} items` };
      }

      const idsParaAprobar = candidatos.map((c) => c.id);
      await tx.oTRepuesto.updateMany({
        where: { id: { in: idsParaAprobar } },
        data: {
          status_requerimiento_codigo: "APROBADO",
          usuario_aprueba: usuario,
          fecha_aprobacion: new Date(),
          status_cotizacion_codigo: "PEND_COT", // arranca flujo de cotización
        },
      });

      // Historial: una entrada por OT afectada (no por item — sería ruidoso).
      const otsUnicas = [...new Set(candidatos.map((c) => c.ot_id))];
      const refTexto = nroReq ?? `${candidatos.length} item(s)`;
      for (const ot_id of otsUnicas) {
        await tx.oTHistorial.create({
          data: {
            ot_id,
            tipo_operacion: "Otro",
            descripcion: `Requerimiento ${refTexto} aprobado (${candidatos.length} item${candidatos.length === 1 ? "" : "s"})`,
            usuario,
          },
        });
      }

      return { aprobados: candidatos.length, ot_ids: otsUnicas, ref: refTexto };
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("POST /api/requerimientos/aprobar-lote error:", error);
    return NextResponse.json({ error: "Error al aprobar requerimiento" }, { status: 500 });
  }
}
