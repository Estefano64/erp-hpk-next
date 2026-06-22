// POST /api/compras/[id]/consumir-almacen-abierto
//
// Descuenta stock de una OC marcada como "almacén abierto" (ej. PO 4504281587
// emitida a BC Bering) para cubrir uno o varios requerimientos sin generar
// una OC nueva. La trazabilidad se hace por NP (Número de parte) del material.
//
// Flujo:
//   1. Valida que la Compra tenga es_almacen_abierto = true y no haya expirado.
//   2. Para cada item: valida match material req vs detalle compra, stock
//      suficiente, req no anulado/con OC.
//   3. Descuenta del CompraDetalle (cantidad_recibida +=).
//   4. Marca el OTRepuesto con status_oc = CONSUMIDO_OC_ABIERTA, po_id, fechas.
//   5. Registra OTHistorial (si el req pertenece a una OT externa o interna).
//
// Body:
//   {
//     items: [
//       { requerimiento_id: 123, detalle_compra_id: 456, cantidad: 2 }
//     ],
//     comentarios?: string
//   }
//
// Respuesta: { ok: [...ids], errores: [{ requerimiento_id, error }] }
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { recalcularRecursosStatusOT, recalcularRecursosStatusOTInterna } from "@/lib/recursos-ot";

type Ctx = { params: Promise<{ id: string }> };

const Schema = z.object({
  items: z.array(
    z.object({
      requerimiento_id: z.coerce.number().int().positive(),
      detalle_compra_id: z.coerce.number().int().positive(),
      cantidad: z.coerce.number().positive(),
    }),
  ).min(1),
  comentarios: z.string().trim().max(500).optional().nullable(),
});

interface CompraRow {
  id: number;
  numero_po: string;
  es_almacen_abierto: boolean;
  fecha_expiracion: Date | null;
  status_oc_codigo: string | null;
  moneda_codigo: string | null;
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const compraId = Number(id);
    if (!Number.isFinite(compraId) || compraId <= 0) {
      return NextResponse.json({ error: "ID de Compra inválido" }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const usuario = (await getAuditUser(req)) ?? "Logistica";

    const result = await prisma.$transaction(async (tx) => {
      // 1. Validar Compra es almacén abierto activa. SQL raw porque el campo
      //    es_almacen_abierto puede no estar en el cliente Prisma (dev server
      //    bloquea regenerate).
      const compraRows = await tx.$queryRaw<CompraRow[]>`
        SELECT id, numero_po, es_almacen_abierto, fecha_expiracion,
               status_oc_codigo, moneda_codigo
          FROM "compras" WHERE id = ${compraId} LIMIT 1
      `;
      if (compraRows.length === 0) {
        throw Object.assign(new Error("Compra no encontrada"), { code: "NOT_FOUND" });
      }
      const compra = compraRows[0];
      if (!compra.es_almacen_abierto) {
        throw Object.assign(
          new Error("Esta OC no está marcada como almacén abierto."),
          { code: "NOT_OPEN_WAREHOUSE" },
        );
      }
      if (compra.status_oc_codigo === "ANULADO" || compra.status_oc_codigo === "COMPLETO") {
        throw Object.assign(
          new Error(`OC en estado ${compra.status_oc_codigo} no permite consumo.`),
          { code: "INVALID_STATE" },
        );
      }
      if (compra.fecha_expiracion && compra.fecha_expiracion < new Date()) {
        throw Object.assign(
          new Error(`OC expiró el ${compra.fecha_expiracion.toISOString().slice(0, 10)}. Importá la OC del nuevo período.`),
          { code: "EXPIRED" },
        );
      }

      const ok: number[] = [];
      const errores: { requerimiento_id: number; error: string }[] = [];
      // OTs tocadas — al final recalculamos su recursos_status.
      const otsTocadas = new Set<number>();
      const otsInternasTocadas = new Set<number>();

      for (const it of parsed.data.items) {
        try {
          // Detalle de la Compra. Incluimos el `np` del material para
          // poder dejarlo en la observación del req — la trazabilidad del
          // item sacado del almacén abierto se hace por NP.
          const detalle = await tx.compraDetalle.findUnique({
            where: { id: it.detalle_compra_id },
            select: {
              id: true, compra_id: true, material_id: true,
              cantidad: true, cantidad_recibida: true, precio_unitario: true,
              material: { select: { codigo: true, np: true } },
            },
          });
          if (!detalle || detalle.compra_id !== compraId) {
            errores.push({ requerimiento_id: it.requerimiento_id, error: "Detalle de compra no pertenece a esta OC." });
            continue;
          }

          // Requerimiento. Traemos el material del rep para poder comparar
          // por NP (no por material_id). El user solo ve el NP en el sistema,
          // y la OC abierta normalmente trae materiales nuevos cuyo id no
          // coincide con los de los catálogos previos.
          const rep = await tx.oTRepuesto.findUnique({
            where: { id: it.requerimiento_id },
            include: { material: { select: { codigo: true, np: true } } },
          });
          if (!rep) {
            errores.push({ requerimiento_id: it.requerimiento_id, error: "Requerimiento no encontrado." });
            continue;
          }
          if (rep.po_id != null) {
            errores.push({ requerimiento_id: it.requerimiento_id, error: "El requerimiento ya está asignado a otra OC." });
            continue;
          }
          if (rep.status_requerimiento_codigo === "ANULADO" || rep.status_requerimiento_codigo === "DESAPROBADO") {
            errores.push({ requerimiento_id: it.requerimiento_id, error: `Req en estado ${rep.status_requerimiento_codigo} no se puede consumir.` });
            continue;
          }
          // Match por NP (Número de parte): normalización LAXA que ignora
          // case y trata cualquier separador (guión, punto, slash, underscore,
          // espacios múltiples) como un único espacio. Espejo de la lógica
          // del cliente en /requerimientos/detalle para que ambos lados
          // matcheen los mismos NPs. Los dígitos siguen siendo significativos.
          // Fallback a material_id solo si ambos lados lo tienen igual.
          const normalizaNp = (s: string | null | undefined) =>
            (s ?? "")
              .trim()
              .toLowerCase()
              .replace(/[-_./\\]+/g, " ")
              .replace(/\s+/g, " ")
              .trim();
          const npRep = normalizaNp(rep.material?.np);
          const npDet = normalizaNp(detalle.material?.np);
          const matchPorNp = npRep && npDet && npRep === npDet;
          const matchPorId = rep.material_id != null && rep.material_id === detalle.material_id;
          if (!matchPorNp && !matchPorId) {
            errores.push({
              requerimiento_id: it.requerimiento_id,
              error: `NP del req "${rep.material?.np ?? "—"}" no coincide con el NP del detalle de la OC abierta "${detalle.material?.np ?? "—"}".`,
            });
            continue;
          }

          // Stock disponible del detalle
          const stockDisp = new Prisma.Decimal(detalle.cantidad).minus(detalle.cantidad_recibida ?? 0);
          const cant = new Prisma.Decimal(it.cantidad);
          if (cant.lte(0)) {
            errores.push({ requerimiento_id: it.requerimiento_id, error: "Cantidad debe ser > 0." });
            continue;
          }
          if (cant.gt(stockDisp)) {
            errores.push({ requerimiento_id: it.requerimiento_id, error: `Stock insuficiente en OC abierta (disponible: ${stockDisp}, pedido: ${cant}).` });
            continue;
          }
          const cantPedida = new Prisma.Decimal(rep.cantidad);
          if (cant.gt(cantPedida)) {
            errores.push({ requerimiento_id: it.requerimiento_id, error: `Cantidad ${cant} excede la pedida del req (${cantPedida}).` });
            continue;
          }

          // 1. Descontar stock del CompraDetalle
          await tx.compraDetalle.update({
            where: { id: detalle.id },
            data: { cantidad_recibida: { increment: cant } },
          });

          // 2. Marcar el req como CONSUMIDO_OC_ABIERTA. Usamos el precio
          //    congelado de la OC abierta para el req (sobreescribe el precio
          //    libre que pudiera tener antes). En la observación incluimos
          //    el NP (Número de parte) del item sacado para trazabilidad.
          //
          //    NO incrementamos `cantidad_recibida` en el OTRepuesto ni
          //    seteamos `fecha_entrega_real` — eso lo hace el módulo
          //    /despachos cuando se confirma la entrega al técnico (mismo
          //    patrón que `consumir-de-almacen`). Antes el incremento
          //    automático dejaba el ítem con cantPendiente=0 y se filtraba
          //    de la lista de despachos por OT → el user no podía entregarlo.
          const obsPrev = rep.observaciones ? `${rep.observaciones}\n` : "";
          const npStr = detalle.material?.np
            ? ` · NP ${detalle.material.np}`
            : detalle.material?.codigo
              ? ` · cod ${detalle.material.codigo}`
              : "";
          await tx.oTRepuesto.update({
            where: { id: rep.id },
            data: {
              status_oc_codigo: "CONSUMIDO_OC_ABIERTA",
              status_requerimiento_codigo: "APROBADO", // al consumir, queda como aprobado
              po_id: compraId,
              nro_oc: compra.numero_po,
              precio_unitario: detalle.precio_unitario,
              moneda: compra.moneda_codigo ?? "USD",
              observaciones: `${obsPrev}Consumido de OC abierta ${compra.numero_po}${npStr} el ${new Date().toLocaleDateString("es-PE")} — ${cant} unid. (${usuario}) — pendiente despacho al técnico${parsed.data.comentarios ? ` · ${parsed.data.comentarios}` : ""}`,
            },
          });

          // 3. Historial polimórfico (OT externa o interna)
          await tx.oTHistorial.create({
            data: {
              ot_id: rep.ot_id,
              orden_trabajo_interna_id: rep.orden_trabajo_interna_id,
              tipo_operacion: "REQUERIMIENTO",
              descripcion: `Req ${rep.nro_req ?? rep.id} consumido de OC abierta ${compra.numero_po}: ${cant} × ${detalle.precio_unitario} ${compra.moneda_codigo ?? "USD"}`,
              usuario,
            },
          });

          ok.push(rep.id);
          if (rep.ot_id != null) otsTocadas.add(rep.ot_id);
          else if (rep.orden_trabajo_interna_id != null) otsInternasTocadas.add(rep.orden_trabajo_interna_id);
        } catch (e) {
          errores.push({
            requerimiento_id: it.requerimiento_id,
            error: e instanceof Error ? e.message : "Error",
          });
        }
      }

      // Recalc del estado de recursos de cada OT afectada.
      for (const otId of otsTocadas) await recalcularRecursosStatusOT(tx, otId);
      for (const otIntId of otsInternasTocadas) await recalcularRecursosStatusOTInterna(tx, otIntId);

      // 4. Si quedó sin stock total la OC abierta, marcarla COMPLETO.
      const detallesAct = await tx.compraDetalle.findMany({
        where: { compra_id: compraId },
        select: { cantidad: true, cantidad_recibida: true },
      });
      const todoConsumido = detallesAct.every(
        (d) => new Prisma.Decimal(d.cantidad).minus(d.cantidad_recibida ?? 0).lte(0),
      );
      if (todoConsumido) {
        await tx.compra.update({
          where: { id: compraId },
          data: { status_oc_codigo: "COMPLETO" },
        });
      }

      return { ok, errores };
    }, { maxWait: 10_000, timeout: 30_000 });

    const partes: string[] = [];
    if (result.ok.length) partes.push(`${result.ok.length} consumido(s)`);
    if (result.errores.length) partes.push(`${result.errores.length} error(es)`);
    return NextResponse.json({
      message: `Consumo de OC abierta: ${partes.join(", ") || "sin cambios"}.`,
      ...result,
    });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err.code === "NOT_FOUND") return NextResponse.json({ error: err.message }, { status: 404 });
    if (err.code === "NOT_OPEN_WAREHOUSE" || err.code === "INVALID_STATE" || err.code === "EXPIRED") {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("POST consumir-almacen-abierto error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 500 });
  }
}
