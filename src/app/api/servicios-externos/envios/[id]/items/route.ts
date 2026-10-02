// POST /api/servicios-externos/envios/[id]/items
// Ítems que el proveedor agrega como parte del servicio cotizado (ej. barra
// cromada dentro del cromado). Se crean como líneas MAC/CAD del MISMO nro_req
// del SER, enganchadas vía servicio_padre_id, con el proveedor del envío y el
// precio cotizado. Nacen APROBADAS: la aprobación fue del servicio y la OC
// igual pasa por liberación por monto. Llegan instalados en el componente
// (sin zona de almacén): si el servicio ya fue recibido, nacen recibidos.
//
// Requiere cotización ACEPTADA en este envío.
// Body: { items: [{ tipo_codigo: MAC|CAD, material_codigo?, descripcion,
//                   cantidad, unidad_medida?, precio_unitario?, moneda? }] }
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getAuditUser } from "@/lib/audit";
import { parseInt4Safe } from "@/lib/ot-formato";
import { nextItemReq, nextItemReqInterna } from "@/lib/requerimientos";
import { prisma, historialServicio } from "@/lib/servicios-externos-server";

type Ctx = { params: Promise<{ id: string }> };

const Item = z.object({
  tipo_codigo: z.enum(["MAC", "CAD"]),
  material_codigo: z.string().trim().max(50).optional().nullable(),
  // Para MAC puede omitirse: se toma la descripción del catálogo.
  descripcion: z.string().trim().max(2000).optional().nullable(),
  cantidad: z.coerce.number().positive(),
  unidad_medida: z.string().trim().max(20).optional().nullable(),
  precio_unitario: z.coerce.number().min(0).optional().nullable(),
  moneda: z.string().trim().max(10).optional().nullable(),
});
const Schema = z.object({ items: z.array(Item).min(1).max(50) });

export async function POST(req: NextRequest, ctx: Ctx) {
  const usuario = await getAuditUser(req);
  if (!usuario) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await ctx.params;
  const envioId = parseInt4Safe(id) ?? 0;
  if (envioId <= 0) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const envio = await prisma.servicioEnvio.findUnique({
      where: { id: envioId },
      select: {
        id: true, proveedor_id: true, cotizacion_resultado: true, fecha_llegada: true, moneda_cotizacion: true,
        recibido_por: true,
        proveedor: { select: { razon_social: true } },
        ot_repuesto: {
          select: {
            id: true, ot_id: true, orden_trabajo_interna_id: true, nro_req: true, descripcion: true,
            tipo_codigo: true, moneda: true, usuario_solicita: true, fecha_requerida: true,
          },
        },
      },
    });
    if (!envio) return NextResponse.json({ error: "Envío no encontrado" }, { status: 404 });
    if (envio.cotizacion_resultado !== "ACEPTADA") {
      return NextResponse.json({ error: "Solo se agregan ítems a una cotización aceptada." }, { status: 400 });
    }
    const ser = envio.ot_repuesto;
    if (ser.tipo_codigo !== "SER" || !ser.nro_req) {
      return NextResponse.json({ error: "El requerimiento del envío no es un servicio válido." }, { status: 400 });
    }

    // Resolver materiales catalogados (MAC).
    const codigosMAC = [...new Set(parsed.data.items.filter((i) => i.tipo_codigo === "MAC" && i.material_codigo).map((i) => i.material_codigo!))];
    const materiales = codigosMAC.length
      ? await prisma.material.findMany({ where: { codigo: { in: codigosMAC } }, select: { material_id: true, codigo: true, descripcion: true, unidad_medida: { select: { codigo: true } } } })
      : [];
    const matMap = new Map(materiales.map((m) => [m.codigo, m]));
    for (const it of parsed.data.items) {
      if (it.tipo_codigo === "MAC") {
        if (!it.material_codigo) return NextResponse.json({ error: "Tipo MAC requiere material_codigo." }, { status: 400 });
        if (!matMap.has(it.material_codigo)) return NextResponse.json({ error: `Material "${it.material_codigo}" no existe.` }, { status: 400 });
      } else if (!it.descripcion) {
        return NextResponse.json({ error: "Los ítems CAD requieren descripción." }, { status: 400 });
      }
    }

    const creados = await prisma.$transaction(async (tx) => {
      let itemReq = ser.ot_id != null
        ? await nextItemReq(tx, ser.ot_id, ser.nro_req!)
        : await nextItemReqInterna(tx, ser.orden_trabajo_interna_id!, ser.nro_req!);
      const ahora = new Date();
      const rows = [];
      for (const it of parsed.data.items) {
        const mat = it.tipo_codigo === "MAC" && it.material_codigo ? matMap.get(it.material_codigo) : undefined;
        const cant = new Prisma.Decimal(it.cantidad);
        const row = await tx.oTRepuesto.create({
          data: {
            ot_id: ser.ot_id,
            orden_trabajo_interna_id: ser.orden_trabajo_interna_id,
            material_id: mat?.material_id ?? null,
            material_codigo: it.material_codigo ?? null,
            tipo_codigo: it.tipo_codigo,
            cantidad: cant,
            descripcion: it.descripcion || mat?.descripcion || it.material_codigo || "",
            unidad_medida: it.unidad_medida ?? mat?.unidad_medida?.codigo ?? "UNIDAD",
            fecha_requerida: ser.fecha_requerida,
            precio_unitario: it.precio_unitario != null ? new Prisma.Decimal(it.precio_unitario) : null,
            moneda: it.moneda ?? envio.moneda_cotizacion ?? ser.moneda ?? "USD",
            proveedor_id: envio.proveedor_id,
            es_adicional: true,
            nro_req: ser.nro_req,
            item_req: itemReq++,
            servicio_padre_id: ser.id,
            status_requerimiento_codigo: "APROBADO",
            status_cotizacion_codigo: "PEND_COT",
            usuario_solicita: usuario,
            usuario_aprueba: usuario,
            fecha_aprobacion: ahora,
            descripcion_aprobacion: `Ítem agregado por el proveedor en cotización del servicio "${ser.descripcion ?? ser.id}"`,
            // Si el servicio ya llegó, el ítem llegó instalado con él.
            ...(envio.fecha_llegada
              ? { cantidad_recibida: cant, fecha_entrega_real: envio.fecha_llegada, persona_recibe: envio.recibido_por ?? null }
              : {}),
          },
          select: { id: true, item_req: true, tipo_codigo: true, descripcion: true, cantidad: true, precio_unitario: true, moneda: true },
        });
        rows.push({ ...row, cantidad: Number(row.cantidad), precio_unitario: row.precio_unitario != null ? Number(row.precio_unitario) : null });
      }
      await historialServicio(
        tx, ser,
        `${rows.length} ítem(s) del proveedor ${envio.proveedor?.razon_social ?? ""} agregados al servicio "${ser.descripcion ?? ser.id}" (${ser.nro_req})`,
        usuario,
      );
      return rows;
    });

    return NextResponse.json({ data: creados, creados: creados.length }, { status: 201 });
  } catch (error) {
    console.error("POST /api/servicios-externos/envios/[id]/items error:", error);
    return NextResponse.json({ error: "Error al agregar ítems del proveedor" }, { status: 500 });
  }
}
