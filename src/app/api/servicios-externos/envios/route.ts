// POST /api/servicios-externos/envios
// Registra la SALIDA de uno o varios requerimientos SER hacia un proveedor
// (en lote: todos comparten proveedor, fecha y guía de salida). Crea un
// ServicioEnvio por SER.
//
// Reglas:
//   - Solo SER en estado APROBADO.
//   - No puede haber un envío en curso (en cotización / rechazado sin
//     devolución / en trabajo / recibido). Solo PENDIENTE_ENVIO o DEVUELTO.
//
// Body: { repuesto_ids: number[], proveedor_id, fecha_salida: "YYYY-MM-DD",
//         guia_salida?, observaciones? }
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuditUser } from "@/lib/audit";
import { parseDateOnly } from "@/lib/dates";
import { prisma, cargarSer, historialServicio, serializarEnvio, SELECT_ENVIO } from "@/lib/servicios-externos-server";
import { puedeEnviar, SERVICIO_ESTADO_LABELS, estadoServicio } from "@/lib/servicios-externos";

const Schema = z.object({
  repuesto_ids: z.array(z.coerce.number().int().positive()).min(1).max(100),
  proveedor_id: z.coerce.number().int().positive(),
  fecha_salida: z.string().min(8),
  guia_salida: z.string().trim().max(100).optional().nullable(),
  observaciones: z.string().trim().max(2000).optional().nullable(),
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
  const fechaSalida = parseDateOnly(d.fecha_salida);
  if (!fechaSalida) return NextResponse.json({ error: "fecha_salida inválida" }, { status: 400 });

  try {
    const proveedor = await prisma.proveedor.findUnique({
      where: { id: d.proveedor_id }, select: { id: true, razon_social: true },
    });
    if (!proveedor) return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });

    const ids = [...new Set(d.repuesto_ids)];
    const result = await prisma.$transaction(async (tx) => {
      const creados = [];
      for (const repId of ids) {
        const ser = await cargarSer(tx, repId);
        if (!ser) throw Object.assign(new Error(`Requerimiento ${repId} no es un servicio (SER)`), { code: "BAD_REQ" });
        const envios = ser.servicio_envios.map(serializarEnvio);
        if (!puedeEnviar(ser.status_requerimiento_codigo, envios)) {
          const est = estadoServicio(ser.status_requerimiento_codigo, envios);
          const motivo = ser.status_requerimiento_codigo !== "APROBADO"
            ? `no está aprobado (${ser.status_requerimiento_codigo ?? "sin estado"})`
            : `ya tiene un envío en curso (${SERVICIO_ESTADO_LABELS[est]})`;
          throw Object.assign(new Error(`${ser.descripcion ?? `Item ${repId}`}: ${motivo}`), { code: "BAD_STATE" });
        }
        const envio = await tx.servicioEnvio.create({
          data: {
            ot_repuesto_id: ser.id,
            proveedor_id: proveedor.id,
            fecha_salida: fechaSalida,
            guia_salida: d.guia_salida || null,
            observaciones: d.observaciones || null,
            usuario_crea: usuario,
            usuario_actualiza: usuario,
          },
          select: SELECT_ENVIO,
        });
        await historialServicio(
          tx, ser,
          `Servicio "${ser.descripcion ?? ser.id}" enviado a cotizar a ${proveedor.razon_social}` +
            (d.guia_salida ? ` (guía ${d.guia_salida})` : ""),
          usuario,
        );
        creados.push(serializarEnvio(envio));
      }
      return creados;
    });

    return NextResponse.json({ data: result, creados: result.length }, { status: 201 });
  } catch (error) {
    const e = error as { code?: string; message?: string };
    if (e.code === "BAD_REQ" || e.code === "BAD_STATE") {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("POST /api/servicios-externos/envios error:", error);
    return NextResponse.json({ error: "Error al registrar salida" }, { status: 500 });
  }
}
