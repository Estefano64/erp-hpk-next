// /api/servicios-externos/envios/[id]
//
// PATCH — avanza o corrige un envío. Body: { accion, ...campos }
//   accion = "cotizacion"  { resultado: ACEPTADA|RECHAZADA, fecha_cotizacion?,
//                            nro_cotizacion?, monto_cotizacion?, moneda_cotizacion? }
//            Si ACEPTADA y el SER no tiene OC todavía: prellena proveedor y
//            precio unitario del requerimiento (monto / cantidad) para que la
//            OC salga con esos datos. monto_cotizacion = TOTAL cotizado para
//            la cantidad del requerimiento.
//   accion = "devolucion"  { fecha_devolucion, guia_devolucion? }
//            Solo con cotización RECHAZADA. Cierra el intento → el SER vuelve
//            a estar disponible para un envío nuevo.
//   accion = "llegada"     { fecha_llegada, guia_llegada?, recibido_por?, nro_factura? }
//            Solo con cotización ACEPTADA. ES la recepción del servicio: marca
//            el SER (y sus ítems asociados) como recibidos aunque no exista
//            OC. Recalcula recursos_status de la OT.
//   accion = "factura"     { nro_factura }
//   accion = "editar"      { guia_salida?, guia_devolucion?, guia_llegada?,
//                            nro_cotizacion?, nro_factura?, recibido_por?,
//                            observaciones?, fecha_salida? }  (no cambia etapa)
// La lógica vive en src/lib/servicios-externos-acciones.ts (compartida con
// PATCH /envios/lote, el envío conjunto).
//
// DELETE — elimina el envío (y sus PDFs en R2). Solo si todavía no se
// registró la llegada; un servicio recibido no se deshace por acá. Si el
// envío era parte de un envío conjunto, los PDFs compartidos con el resto del
// lote se conservan en R2.
import { NextRequest, NextResponse } from "next/server";
import { getAuditUser } from "@/lib/audit";
import { deleteObject } from "@/lib/r2-helpers";
import { parseInt4Safe } from "@/lib/ot-formato";
import { recalcularRecursosStatusDesdeRep } from "@/lib/recursos-ot";
import { prisma, historialServicio } from "@/lib/servicios-externos-server";
import { AccionEnvioSchema, aplicarAccionEnvio } from "@/lib/servicios-externos-acciones";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const usuario = await getAuditUser(req);
  if (!usuario) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await ctx.params;
  const envioId = parseInt4Safe(id) ?? 0;
  if (envioId <= 0) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = AccionEnvioSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const { envio, ser } = await aplicarAccionEnvio(tx, envioId, d, usuario);
      if (d.accion === "llegada") await recalcularRecursosStatusDesdeRep(tx, ser);
      return envio;
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    const e = error as { code?: string; message?: string };
    if (e.code === "NOT_FOUND") return NextResponse.json({ error: e.message }, { status: 404 });
    if (e.code === "BAD_REQ" || e.code === "BAD_STATE") return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("PATCH /api/servicios-externos/envios/[id] error:", error);
    return NextResponse.json({ error: "Error al actualizar envío" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const usuario = await getAuditUser(req);
  if (!usuario) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await ctx.params;
  const envioId = parseInt4Safe(id) ?? 0;
  if (envioId <= 0) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  try {
    const envio = await prisma.servicioEnvio.findUnique({
      where: { id: envioId },
      select: {
        id: true, fecha_llegada: true, guia_salida: true, cotizacion_resultado: true,
        proveedor: { select: { razon_social: true } },
        adjuntos: { select: { r2_key: true } },
        ot_repuesto: { select: { id: true, ot_id: true, orden_trabajo_interna_id: true, descripcion: true, po_id: true, proveedor_id: true } },
      },
    });
    if (!envio) return NextResponse.json({ error: "Envío no encontrado" }, { status: 404 });
    if (envio.fecha_llegada) {
      return NextResponse.json({ error: "El servicio ya fue recibido; no se puede eliminar el envío." }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.servicioEnvio.delete({ where: { id: envioId } });
      // Si este envío había prellenado proveedor para la OC y aún no hay OC, limpiarlo.
      const rep = envio.ot_repuesto;
      if (envio.cotizacion_resultado === "ACEPTADA" && rep.po_id == null) {
        await tx.oTRepuesto.update({ where: { id: rep.id }, data: { proveedor_id: null } });
      }
      await historialServicio(
        tx, rep,
        `Envío a ${envio.proveedor?.razon_social ?? "proveedor"} eliminado ("${rep.descripcion ?? rep.id}")` +
          (envio.guia_salida ? ` — guía ${envio.guia_salida}` : ""),
        usuario,
      );
    });

    // R2 fuera de la transacción (best-effort). Los PDFs de un envío conjunto
    // están replicados en los otros envíos del lote: esos no se borran.
    const keys = [...new Set(envio.adjuntos.map((a) => a.r2_key))];
    const enUso = new Set(
      keys.length
        ? (await prisma.servicioEnvioAdjunto.findMany({ where: { r2_key: { in: keys } }, select: { r2_key: true } })).map((a) => a.r2_key)
        : [],
    );
    for (const k of keys) {
      if (enUso.has(k)) continue;
      try { await deleteObject(k); } catch (e) { console.warn("R2 delete falló:", k, e); }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/servicios-externos/envios/[id] error:", error);
    return NextResponse.json({ error: "Error al eliminar envío" }, { status: 500 });
  }
}
