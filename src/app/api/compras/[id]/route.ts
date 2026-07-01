import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { parseDateOnly } from "@/lib/dates";

import { parseInt4Safe } from "@/lib/ot-formato";
type Params = { params: Promise<{ id: string }> };

// ── Mapeos status (POs2 ↔ current) ─────────────────────────────
const codeToLabel: Record<string, string> = {
  PEND_OC: "Pendiente",
  PROCESO: "En Proceso",
  ENTREGADO: "Recibido",
  INCOMPLETO: "En Proceso",
  COMPLETO: "Recibido",
  ANULADO: "Cancelado",
  DEVOLUCION: "Cancelado",
};
const labelToCode: Record<string, string> = {
  Pendiente: "PEND_OC",
  Aprobado: "PROCESO",
  "En Proceso": "PROCESO",
  Recibido: "COMPLETO",
  Cancelado: "ANULADO",
};

// GET — obtener una compra por id (DTO compatible con POs2)
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const r = await prisma.compra.findUnique({
      where: { id: (parseInt4Safe(id) ?? 0) },
      include: {
        proveedor: true,
        ubicacion: true,
        orden_trabajo: { select: { id: true, ot: true, descripcion: true } },
        detalles: {
          include: { material: { select: { material_id: true, codigo: true, descripcion: true, np: true } } },
          orderBy: { id: "asc" },
        },
        ot_repuestos: {
          include: {
            material: { select: { codigo: true, descripcion: true } },
            // tipo_codigo necesario para formatOtCodigo (V/S/REP prefix) en el editor.
            orden_trabajo: { select: { id: true, ot: true, tipo_codigo: true } },
            // OT interna (cuando el req viene de mantenimiento interno) — formato
            // OIXXXXYY. Permite que el editor muestre la OT correcta por fila.
            orden_trabajo_interna: { select: { id: true, ot: true } },
            // Adjuntos del req original (cotización, ficha técnica, fotos)
            // para que el aprobador de OC los pueda revisar antes de aceptar.
            adjuntos: { select: { id: true, nombre_archivo: true, r2_key: true, tamano: true } },
          },
          // Orden reproducible (mismo criterio que el PDF): primero
          // `oc_orden_item` (la posición que el user dejó en el editor),
          // luego fallback a `nro_req` → `item_req` → `id` para items legacy
          // que aún no tienen oc_orden_item seteado.
          orderBy: [
            { oc_orden_item: { sort: "asc", nulls: "last" } },
            { nro_req: "asc" },
            { item_req: "asc" },
            { id: "asc" },
          ],
        },
        // Adjuntos múltiples de la OC (guías, facturas, comprobantes de pago).
        adjuntos: {
          select: {
            id: true, tipo: true, r2_key: true, nombre_archivo: true,
            tipo_mime: true, tamano: true, fecha_subida: true,
          },
          orderBy: [{ tipo: "asc" }, { fecha_subida: "asc" }],
        },
      },
    });
    if (!r) return NextResponse.json({ error: "Compra no encontrada" }, { status: 404 });

    type Repuesto = (typeof r.ot_repuestos)[number];
    const data = {
      id: r.id,
      numero_po: r.numero_po,
      numero_req: r.numero_req,
      ot_id: r.ot_id,
      proveedor: r.proveedor
        ? { id: r.proveedor.id, razonSocial: r.proveedor.razon_social, ruc: r.proveedor.ruc, direccion: r.proveedor.direccion, telefono: r.proveedor.telefono, email: r.proveedor.email, contacto: r.proveedor.contacto }
        : null,
      almacen: r.ubicacion ? { id: r.ubicacion_codigo, codigo: r.ubicacion.codigo, nombre: r.ubicacion.nombre } : null,
      ubicacion_codigo: r.ubicacion_codigo,
      orden_trabajo: r.orden_trabajo,
      fecha_solicitud: r.fecha_solicitud,
      fecha_entrega_esperada: r.fecha_entrega_esperada,
      fecha_entrega_real: r.fecha_entrega_real,
      estado: r.status_oc_codigo ? codeToLabel[r.status_oc_codigo] ?? r.status_oc_codigo : "Pendiente",
      status_oc_codigo: r.status_oc_codigo,
      subtotal: r.subtotal,
      descuento: r.descuento,
      impuesto: r.impuesto,
      otros: r.otros,
      total: r.total,
      moneda: r.moneda_codigo ?? "USD",
      nombre: r.nombre ?? null,
      proveedor_nombre: r.proveedor?.nombre_comercial ?? r.proveedor?.razon_social ?? null,
      nro_factura: r.nro_factura,
      nro_guia: r.nro_guia,
      tipo_pago: r.tipo_pago,
      dias_credito: r.dias_credito,
      aplica_igv: r.aplica_igv,
      guia_key: r.guia_key,
      guia_nombre: r.guia_nombre,
      guia_fecha_subida: r.guia_fecha_subida,
      factura_key: r.factura_key,
      factura_nombre: r.factura_nombre,
      factura_fecha_subida: r.factura_fecha_subida,
      pago_key: r.pago_key,
      pago_nombre: r.pago_nombre,
      adjuntos: r.adjuntos,
      observaciones: r.observaciones,
      usuario_solicita: r.usuario_solicita,
      usuario_aprueba: r.usuario_aprueba,
      detalles: r.detalles,
      ot_repuestos: r.ot_repuestos.map((rep: Repuesto) => ({
        id: rep.id,
        nro_req: rep.nro_req,
        item_req: rep.item_req,
        material_id: rep.material_id,
        material_codigo: rep.material_codigo,
        descripcion: rep.descripcion,
        texto: rep.texto,
        unidad_medida: rep.unidad_medida,
        cantidad: rep.cantidad,
        precio_unitario: rep.precio_unitario,
        moneda: rep.moneda,
        fabricante_codigo: rep.fabricante_codigo,
        // Fecha de entrega POR ITEM — la que se pone en Crear OC (columna
        // F. Entrega de la tabla del modal) y persiste en OTRepuesto. Antes
        // no se enviaba en la response, por eso el editor la mostraba
        // siempre vacía y al guardar sobrescribía con null.
        fecha_entrega_esperada: rep.fecha_entrega_esperada,
        // Overrides que hace Crear OC: si el user ajustó cantidad/precio/
        // descripción/UM al momento de generar la OC, esos valores se guardan
        // en estos campos oc_* del OTRepuesto. Sin devolverlos, el editor
        // caía al valor original del req y "no se veían los cambios".
        oc_descripcion: rep.oc_descripcion,
        oc_cantidad: rep.oc_cantidad,
        oc_precio_unitario: rep.oc_precio_unitario,
        oc_unidad_medida: rep.oc_unidad_medida,
        oc_orden_item: rep.oc_orden_item,
        estado: rep.status_oc_codigo
          ? codeToLabel[rep.status_oc_codigo] ?? rep.status_oc_codigo
          : "Pendiente",
        material: rep.material,
        orden_trabajo: rep.orden_trabajo,
        orden_trabajo_interna: rep.orden_trabajo_interna,
        comentario_aprobacion: rep.comentario_aprobacion,
        adjuntos: rep.adjuntos,
      })),
    };

    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/compras/[id] error:", error);
    return NextResponse.json({ error: "Error al obtener compra" }, { status: 500 });
  }
}

// PUT — actualizar compra (acepta params POs2 y traduce al schema current)
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const usuario = await getAuditUser(req);

    const data: Record<string, unknown> = {};
    // Aliases POs2 → current
    if (body.proveedor_id !== undefined) data.proveedor_id = body.proveedor_id;
    if (body.almacen_id !== undefined) data.ubicacion_codigo = body.almacen_id; // POs2 manda id, lo guardamos como código
    if (body.ubicacion_codigo !== undefined) data.ubicacion_codigo = body.ubicacion_codigo;
    if (body.estado !== undefined) {
      data.status_oc_codigo = labelToCode[body.estado] ?? body.estado;
    }
    if (body.status_oc_codigo !== undefined) data.status_oc_codigo = body.status_oc_codigo;
    if (body.moneda !== undefined) data.moneda_codigo = body.moneda;
    if (body.moneda_codigo !== undefined) data.moneda_codigo = body.moneda_codigo;
    for (const k of ["fecha_entrega_esperada", "fecha_entrega_real", "fecha_solicitud", "fecha_expiracion"]) {
      if (body[k] !== undefined) data[k] = parseDateOnly(body[k]);
    }
    // `nombre` = label de display de la OC (ej. "BC BEARING — OC Abierta M260033").
    // Lo usa el módulo de OC abiertas para identificar la fuente sin tocar
    // la tabla de proveedores.
    for (const k of ["nro_factura", "nro_guia", "observaciones", "usuario_aprueba", "tipo_pago", "nombre", "numero_po"]) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    // dias_credito: normalizamos para que CONTADO siempre sea 0/null y no
    // arrastre un plazo viejo si se cambió desde CREDITO.
    if (body.tipo_pago === "CONTADO") {
      data.dias_credito = 0;
    } else if (body.dias_credito !== undefined) {
      const n = Number(body.dias_credito);
      data.dias_credito = Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
    }
    // Descuento / otros (header-level): si vienen, recalcular total = subtotal - descuento + impuesto + otros
    let recalcularTotal = false;
    if (body.descuento !== undefined) { data.descuento = body.descuento; recalcularTotal = true; }
    if (body.otros !== undefined) { data.otros = body.otros; recalcularTotal = true; }
    if (usuario && data.usuario_aprueba === undefined) data.usuario_aprueba = usuario;

    const record = await prisma.compra.update({
      where: { id: (parseInt4Safe(id) ?? 0) },
      data,
    });

    if (recalcularTotal) {
      const { Prisma } = await import("@prisma/client");
      const subtotal = new Prisma.Decimal(record.subtotal);
      const descuento = new Prisma.Decimal(record.descuento);
      const impuesto = new Prisma.Decimal(record.impuesto);
      const otros = new Prisma.Decimal(record.otros);
      const total = subtotal.minus(descuento).plus(impuesto).plus(otros);
      const updated = await prisma.compra.update({
        where: { id: record.id },
        data: { total },
      });
      return NextResponse.json({ data: updated });
    }
    return NextResponse.json({ data: record });
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err?.code === "P2025") return NextResponse.json({ error: "Compra no encontrada" }, { status: 404 });
    console.error("PUT /api/compras/[id] error:", error);
    return NextResponse.json({ error: "Error al actualizar compra" }, { status: 500 });
  }
}

// DELETE — soft-delete: cambia el estado de la OC a ANULADO y LIBERA los
// requerimientos (po_id=null, status_oc=null) para que vuelvan a estar
// disponibles para asignar a una nueva OC.
//
// Antes hacía .delete() físico, que fallaba con FK constraints (compra_detalle
// → compra, movimientos, etc.) — y mientras tanto los reqs ya quedaban
// desvinculados, dejándolos en un estado inconsistente. El pedido del user
// es que sea soft + atómico.
//
// `motivo` opcional en el body; si viene se loguea en el historial.
//
// Estados desde donde se permite anular: PEND_OC y PROCESO. Si la OC ya
// está ENTREGADO/COMPLETO/INCOMPLETO hay movimientos de inventario y no
// se puede anular sin revertir. ANULADO ya está anulada.
const ESTADOS_ANULABLES = new Set(["PEND_OC", "PROCESO"]);

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const compraId = parseInt4Safe(id) ?? 0;
    if (compraId <= 0) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    const body = await req.json().catch(() => ({}));
    const motivo = typeof body?.motivo === "string" ? body.motivo.trim() : "";
    const usuario = (await getAuditUser(req)) ?? "sistema";

    const result = await prisma.$transaction(async (tx) => {
      const compra = await tx.compra.findUnique({
        where: { id: compraId },
        select: { id: true, numero_po: true, status_oc_codigo: true },
      });
      if (!compra) {
        throw Object.assign(new Error("Compra no encontrada"), { status: 404 });
      }
      if (compra.status_oc_codigo === "ANULADO") {
        // Idempotente: si ya está anulada, devolvemos éxito sin tocar nada.
        // Antes lanzábamos 400 y el user veía "Error al eliminar" al re-clickear
        // sobre una fila stale del listado. El efecto buscado (anulada + reqs
        // liberados) ya está cumplido.
        return { compra, reqsLiberados: 0, yaEstaba: true };
      }
      if (!compra.status_oc_codigo || !ESTADOS_ANULABLES.has(compra.status_oc_codigo)) {
        throw Object.assign(
          new Error(`No se puede anular una OC en estado ${compra.status_oc_codigo ?? "—"}. Solo se permite desde PEND_OC o PROCESO (sin movimientos de inventario).`),
          { status: 400 },
        );
      }

      // 1) Capturar OTs vinculadas ANTES de modificar los reqs (sino el
      //    distinct queda vacío y el historial no se crea).
      const reqsVinculados = await tx.oTRepuesto.findMany({
        where: { po_id: compraId },
        select: { ot_id: true, orden_trabajo_interna_id: true },
      });
      const otsExternas = [...new Set(reqsVinculados.map((r) => r.ot_id).filter((x): x is number => x != null))];
      const otsInternas = [...new Set(reqsVinculados.map((r) => r.orden_trabajo_interna_id).filter((x): x is number => x != null))];

      // 2) Soft-delete: estado de la OC pasa a ANULADO. NO la borramos
      //    físicamente — quedaría rota si hay compra_detalle, items free,
      //    movimientos, etc.
      const actualizada = await tx.compra.update({
        where: { id: compraId },
        data: {
          status_oc_codigo: "ANULADO",
          usuario_aprueba: usuario,
          comentario_aprobacion: motivo || null,
        },
      });

      // 3) Liberar los reqs vinculados: desvincular po_id y status_oc para
      //    que vuelvan a estar disponibles en /requerimientos (tab Aprobados
      //    sin OC). Items "libres" (solo_para_oc=true) se borran porque NO
      //    tienen lugar fuera de esta OC.
      await tx.oTRepuesto.deleteMany({
        where: { po_id: compraId, solo_para_oc: true },
      });
      await tx.oTRepuesto.updateMany({
        where: { po_id: compraId },
        data: {
          po_id: null,
          nro_oc: null,
          fecha_oc: null,
          status_oc_codigo: null,
          // Limpiar overrides — al volver a la pool, ya no son válidos.
          oc_cantidad: null,
          oc_precio_unitario: null,
          oc_descripcion: null,
          oc_unidad_medida: null,
          oc_orden_item: null,
          fecha_entrega_esperada: null,
        },
      });

      // 4) Historial por cada OT afectada.
      const descripcionHist = motivo
        ? `OC ${compra.numero_po} ANULADA por ${usuario} — ${motivo} (requerimientos liberados)`
        : `OC ${compra.numero_po} ANULADA por ${usuario} (requerimientos liberados)`;
      for (const ot_id of otsExternas) {
        await tx.oTHistorial.create({
          data: { ot_id, tipo_operacion: "Otro", descripcion: descripcionHist, usuario },
        });
      }
      for (const orden_trabajo_interna_id of otsInternas) {
        await tx.oTHistorial.create({
          data: { orden_trabajo_interna_id, tipo_operacion: "Otro", descripcion: descripcionHist, usuario },
        });
      }

      return { compra: actualizada, reqsLiberados: reqsVinculados.length, yaEstaba: false };
    });

    return NextResponse.json({
      message: result.yaEstaba
        ? "Esta OC ya estaba anulada (sin cambios)."
        : `OC anulada. ${result.reqsLiberados} requerimiento(s) liberados para nueva OC.`,
      data: result.compra,
    });
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err?.status) {
      return NextResponse.json({ error: err.message ?? "Error" }, { status: err.status });
    }
    console.error("DELETE /api/compras/[id] error:", error);
    return NextResponse.json({ error: "Error al anular la OC" }, { status: 500 });
  }
}
