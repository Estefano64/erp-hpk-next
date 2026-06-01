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

  let body: { nro_req?: unknown; ids?: unknown; comentario?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const nroReq = typeof body.nro_req === "string" && body.nro_req.length > 0 ? body.nro_req : null;
  const ids = Array.isArray(body.ids)
    ? (body.ids as unknown[]).filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x > 0)
    : null;
  // Comentario / recomendación OPCIONAL del aprobador. Si viene, se guarda
  // en cada item del lote (mismo texto) y se appendea al historial.
  const comentario = typeof body.comentario === "string"
    ? (body.comentario.trim().slice(0, 500) || null)
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
        select: { id: true, ot_id: true, orden_trabajo_interna_id: true, nro_req: true },
      });

      if (candidatos.length === 0) {
        return {
          aprobados: 0,
          ot_ids: [] as number[],
          ot_internas_ids: [] as number[],
          ref: nroReq ?? `${ids?.length ?? 0} items`,
        };
      }

      const idsParaAprobar = candidatos.map((c) => c.id);
      await tx.oTRepuesto.updateMany({
        where: { id: { in: idsParaAprobar } },
        data: {
          status_requerimiento_codigo: "APROBADO",
          usuario_aprueba: usuario,
          fecha_aprobacion: new Date(),
          status_cotizacion_codigo: "PEND_COT", // arranca flujo de cotización
          // El mismo comentario aplica a todos los items del lote. Si no
          // vino, se mantiene null (no se borra uno previo accidentalmente
          // porque solo aprobamos items en estado SIN_APROBACION).
          comentario_aprobacion: comentario,
        },
      });

      // Historial: una entrada por OT afectada (no por item — sería ruidoso).
      // Las OT internas iban silenciosamente sin historial antes — ahora se
      // loggean por separado para que la auditoría sea completa.
      const otsExternasUnicas = [
        ...new Set(candidatos.filter((c) => c.ot_id != null).map((c) => c.ot_id as number)),
      ];
      const otsInternasUnicas = [
        ...new Set(
          candidatos
            .filter((c) => c.orden_trabajo_interna_id != null)
            .map((c) => c.orden_trabajo_interna_id as number),
        ),
      ];
      const refTexto = nroReq ?? `${candidatos.length} item(s)`;
      const baseHist = `Requerimiento ${refTexto} aprobado (${candidatos.length} item${candidatos.length === 1 ? "" : "s"})`;
      const descripcionHist = comentario ? `${baseHist} — ${comentario}` : baseHist;
      for (const ot_id of otsExternasUnicas) {
        await tx.oTHistorial.create({
          data: { ot_id, tipo_operacion: "Otro", descripcion: descripcionHist, usuario },
        });
      }
      for (const orden_trabajo_interna_id of otsInternasUnicas) {
        await tx.oTHistorial.create({
          data: { orden_trabajo_interna_id, tipo_operacion: "Otro", descripcion: descripcionHist, usuario },
        });
      }

      return {
        aprobados: candidatos.length,
        ot_ids: otsExternasUnicas,
        ot_internas_ids: otsInternasUnicas,
        ref: refTexto,
      };
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("POST /api/requerimientos/aprobar-lote error:", error);
    return NextResponse.json({ error: "Error al aprobar requerimiento" }, { status: 500 });
  }
}
