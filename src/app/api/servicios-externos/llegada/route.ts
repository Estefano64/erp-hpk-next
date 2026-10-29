// POST /api/servicios-externos/llegada
// Registra la LLEGADA (= recepción) de varios SER seleccionados en
// /requerimientos, igual que "Generar seguimiento" registra la salida.
// Cada SER debe estar Incompleto (cotización aceptada, sin llegada): se marca
// la llegada en su último envío. Pueden ser de envíos/guías distintos.
// Llegada directa (2026-10-20): un SER con OC que nunca salió por el
// seguimiento (o sigue en cotización) también vale — si hay OC la cotización
// ya fue aceptada; ver prepararEnvioParaLlegada.
//
// Body: { repuesto_ids: number[], fecha_llegada: "YYYY-MM-DD", guia_llegada?,
//         recibido_por?, nro_factura?, lineas_oc?: number[] }
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuditUser } from "@/lib/audit";
import { recalcularRecursosStatusDesdeRep } from "@/lib/recursos-ot";
import { prisma, cargarSer } from "@/lib/servicios-externos-server";
import { aplicarAccionEnvio, errorAccion, prepararEnvioParaLlegada } from "@/lib/servicios-externos-acciones";

const Schema = z.object({
  repuesto_ids: z.array(z.coerce.number().int().positive()).min(1).max(100),
  fecha_llegada: z.string().min(8),
  guia_llegada: z.string().trim().max(100).optional().nullable(),
  recibido_por: z.string().trim().max(150).optional().nullable(),
  nro_factura: z.string().trim().max(100).optional().nullable(),
  lineas_oc: z.array(z.coerce.number().int().positive()).max(200).optional(),
});

export async function POST(req: NextRequest) {
  const usuario = await getAuditUser(req);
  if (!usuario) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const out = [];
      const ots = new Map<string, { ot_id: number | null; orden_trabajo_interna_id: number | null }>();
      // Llegada directa de varios SER de la misma OC: los envíos que se creen
      // comparten lote (un seguimiento conjunto por OC, no uno por servicio).
      const lotePorOC = new Map<number, string>();
      for (const repId of [...new Set(d.repuesto_ids)]) {
        const ser = await cargarSer(tx, repId);
        if (!ser) throw errorAccion("BAD_REQ", `Requerimiento ${repId} no es un servicio (SER)`);
        let loteId: string | null = null;
        if (ser.po_id != null) {
          loteId = lotePorOC.get(ser.po_id) ?? randomUUID();
          lotePorOC.set(ser.po_id, loteId);
        }
        const envioId = await prepararEnvioParaLlegada(tx, ser, d.fecha_llegada, usuario, loteId);
        const { envio } = await aplicarAccionEnvio(tx, envioId, {
          accion: "llegada", fecha_llegada: d.fecha_llegada, guia_llegada: d.guia_llegada,
          recibido_por: d.recibido_por, nro_factura: d.nro_factura, lineas_oc: d.lineas_oc,
        }, usuario);
        ots.set(`${ser.ot_id}|${ser.orden_trabajo_interna_id}`, { ot_id: ser.ot_id, orden_trabajo_interna_id: ser.orden_trabajo_interna_id });
        out.push(envio);
      }
      // Lote con un solo envío → individual (lote_id NULL, misma regla que /envios).
      for (const loteId of lotePorOC.values()) {
        if (await tx.servicioEnvio.count({ where: { lote_id: loteId } }) === 1) {
          await tx.servicioEnvio.updateMany({ where: { lote_id: loteId }, data: { lote_id: null } });
        }
      }
      for (const ot of ots.values()) await recalcularRecursosStatusDesdeRep(tx, ot);
      return out;
    });
    return NextResponse.json({ data: result, recibidos: result.length });
  } catch (error) {
    const e = error as { code?: string; message?: string };
    if (e.code === "NOT_FOUND") return NextResponse.json({ error: e.message }, { status: 404 });
    if (e.code === "BAD_REQ" || e.code === "BAD_STATE") return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("POST /api/servicios-externos/llegada error:", error);
    return NextResponse.json({ error: "Error al registrar la llegada" }, { status: 500 });
  }
}
