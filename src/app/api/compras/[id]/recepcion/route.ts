import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";

// Recibe mercadería de una compra existente.
// - Actualiza cantidad_recibida por línea
// - Crea MovimientoInventario(ENTRADA) por línea
// - Incrementa Material.stock_actual
// - Recalcula estado de Compra: todas completas → ENTREGADO, parcial → INCOMPLETO
// - Registra OTHistorial si la compra tiene OT ligada

const LineaSchema = z.object({
  detalle_id: z.number().int().positive(),
  cantidad_llegada: z.coerce.number().positive(),
});

const RecepcionSchema = z.object({
  lineas: z.array(LineaSchema).min(1),
  nro_guia: z.string().trim().optional().nullable(),
  fecha_recepcion: z.string().optional().nullable(),
  observacion: z.string().trim().optional().nullable(),
});

type Ctx = { params: Promise<{ id: string }> };

// Estados desde los que se permite recepcionar
const ESTADOS_RECEPCIONABLES = new Set(["PROCESO", "ENTREGADO", "INCOMPLETO"]);

function toDate(s: string | null | undefined): Date {
  if (!s) return new Date();
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date() : d;
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const compraId = Number(id);
    const body = await req.json();
    const parsed = RecepcionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;
    const usuario = (await getAuditUser(req)) ?? "sistema";
    const fechaRecep = toDate(d.fecha_recepcion);

    const result = await prisma.$transaction(async (tx) => {
      const compra = await tx.compra.findUnique({
        where: { id: compraId },
        include: {
          detalles: { select: { id: true, material_id: true, cantidad: true, cantidad_recibida: true, cantidad_en_transito: true } },
        },
      });
      if (!compra) throw Object.assign(new Error("Compra no encontrada"), { code: "NOT_FOUND" });
      if (!compra.status_oc_codigo || !ESTADOS_RECEPCIONABLES.has(compra.status_oc_codigo)) {
        throw Object.assign(
          new Error(`No se puede recepcionar en estado ${compra.status_oc_codigo ?? "(vacío)"}. Debe estar en PROCESO, ENTREGADO o INCOMPLETO.`),
          { code: "INVALID_STATE" },
        );
      }

      const detallesById = new Map(compra.detalles.map((x) => [x.id, x]));
      const lineasProcesadas: { detalle_id: number; cantidad_llegada: number; material_id: number }[] = [];

      for (const l of d.lineas) {
        const det = detallesById.get(l.detalle_id);
        if (!det) throw Object.assign(new Error(`Línea ${l.detalle_id} no pertenece a la compra`), { code: "BAD_LINE" });
        const pedida = Number(det.cantidad);
        const yaRecibida = Number(det.cantidad_recibida ?? 0);
        const pendiente = pedida - yaRecibida;
        if (l.cantidad_llegada > pendiente + 0.0001) {
          throw Object.assign(
            new Error(`Línea ${l.detalle_id}: cantidad ${l.cantidad_llegada} excede lo pendiente (${pendiente})`),
            { code: "OVER_QTY" },
          );
        }
        const nuevaRecibida = yaRecibida + l.cantidad_llegada;
        const enTransitoActual = Number(det.cantidad_en_transito ?? 0);
        const nuevaEnTransito = Math.max(0, enTransitoActual - l.cantidad_llegada);

        await tx.compraDetalle.update({
          where: { id: det.id },
          data: {
            cantidad_recibida: nuevaRecibida,
            cantidad_en_transito: nuevaEnTransito,
          },
        });

        await tx.movimientoInventario.create({
          data: {
            material_id: det.material_id,
            tipo_movimiento: "ENTRADA",
            cantidad: l.cantidad_llegada,
            documento_referencia: d.nro_guia ?? `PO-${compraId}`,
            observacion: d.observacion ?? `Recepción PO #${compraId}`,
            usuario,
            fecha_movimiento: fechaRecep,
          },
        });

        // Incrementar stock del material
        await tx.material.update({
          where: { material_id: det.material_id },
          data: { stock_actual: { increment: l.cantidad_llegada } },
        });

        lineasProcesadas.push({
          detalle_id: det.id,
          cantidad_llegada: l.cantidad_llegada,
          material_id: det.material_id,
        });
      }

      // Recalcular estado de la compra
      const detallesActualizados = await tx.compraDetalle.findMany({
        where: { compra_id: compraId },
        select: { cantidad: true, cantidad_recibida: true },
      });
      const todasCompletas = detallesActualizados.every(
        (x) => Number(x.cantidad_recibida ?? 0) >= Number(x.cantidad) - 0.0001,
      );
      const nuevoEstado = todasCompletas ? "ENTREGADO" : "INCOMPLETO";

      const updateData: Record<string, unknown> = {
        status_oc_codigo: nuevoEstado,
        fecha_entrega_real: fechaRecep,
      };
      if (d.nro_guia) updateData.nro_guia = d.nro_guia;

      await tx.compra.update({ where: { id: compraId }, data: updateData });

      // Audit en OTHistorial si la compra está ligada a una OT
      if (compra.ot_id) {
        const lineasInfo = lineasProcesadas
          .map((l) => `det=${l.detalle_id} cant=${l.cantidad_llegada}`)
          .join(", ");
        await tx.oTHistorial.create({
          data: {
            ot_id: compra.ot_id,
            tipo_operacion: "RECEPCION_REPUESTOS",
            descripcion: `Recepción PO ${compra.numero_po}: ${lineasProcesadas.length} línea(s). ${lineasInfo}`,
            usuario,
            fecha: fechaRecep,
            datos_adicionales: JSON.stringify({
              compra_id: compraId,
              numero_po: compra.numero_po,
              nro_guia: d.nro_guia ?? null,
              lineas: lineasProcesadas,
              nuevo_estado_oc: nuevoEstado,
            }),
          },
        });
      }

      return {
        lineas_procesadas: lineasProcesadas.length,
        nuevo_estado: nuevoEstado,
        compra_id: compraId,
      };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err?.code === "NOT_FOUND") return NextResponse.json({ error: err.message }, { status: 404 });
    if (err?.code === "INVALID_STATE" || err?.code === "BAD_LINE" || err?.code === "OVER_QTY") {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("POST /api/compras/[id]/recepcion error:", error);
    return NextResponse.json({ error: "Error al procesar recepción" }, { status: 500 });
  }
}
