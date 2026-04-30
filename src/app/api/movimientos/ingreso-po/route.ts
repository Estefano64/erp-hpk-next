/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST — recibir una PO y generar ENTRADAS en inventario
// body: { po_id, items: [{material_id, cantidad, observacion?}], usuario, nro_guia?, nro_factura?, comentarios? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { po_id, items, usuario, nro_guia, nro_factura, comentarios } = body;

    if (!po_id || !items || !Array.isArray(items) || items.length === 0 || !usuario) {
      return NextResponse.json(
        { error: "Campos requeridos: po_id, items[], usuario" },
        { status: 400 }
      );
    }

    const compra = await prisma.compra.findUnique({ where: { id: Number(po_id) } });
    if (!compra) {
      return NextResponse.json({ error: "Orden de compra no encontrada" }, { status: 404 });
    }
    if (compra.status_oc_codigo === "COMPLETO") {
      return NextResponse.json({ error: "La OC ya fue recibida" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx: any) => {
      const movimientos = [];

      for (const item of items) {
        const cant = Number(item.cantidad);
        if (!item.material_id || cant <= 0) continue;

        const docRef = nro_guia ? `${compra.numero_po} / G:${nro_guia}` : compra.numero_po;
        const obsBase = `Recepción OC ${compra.numero_po}` +
          (nro_guia ? ` — Guía: ${nro_guia}` : "") +
          (nro_factura ? ` — Factura: ${nro_factura}` : "");

        // Crear movimiento ENTRADA
        const mov = await tx.movimientoInventario.create({
          data: {
            material_id: Number(item.material_id),
            tipo_movimiento: "ENTRADA",
            cantidad: cant,
            documento_referencia: docRef,
            observacion: item.observacion || obsBase,
            usuario,
          },
        });
        movimientos.push(mov);

        // Actualizar stock del material
        await tx.$executeRaw`UPDATE material SET stock_actual = COALESCE(stock_actual, 0) + ${cant}, updated_at = NOW() WHERE material_id = ${Number(item.material_id)}`;
      }

      // Actualizar OC a COMPLETO + nro_guia + nro_factura + comentarios
      const obsCompra = comentarios
        ? `${compra.observaciones ? compra.observaciones + "\n— Recepción: " : "Recepción: "}${comentarios}`
        : compra.observaciones;

      await tx.compra.update({
        where: { id: Number(po_id) },
        data: {
          status_oc_codigo: "COMPLETO",
          fecha_entrega_real: new Date(),
          usuario_aprueba: usuario,
          ...(nro_guia ? { nro_guia } : {}),
          ...(nro_factura ? { nro_factura } : {}),
          ...(comentarios ? { observaciones: obsCompra } : {}),
        },
      });

      // Actualizar requerimientos vinculados
      await tx.oTRepuesto.updateMany({
        where: { po_id: Number(po_id) },
        data: {
          fecha_entrega_real: new Date(),
          ...(nro_guia ? { nro_guia } : {}),
          ...(nro_factura ? { nro_factura_proveedor: nro_factura } : {}),
        },
      });

      return movimientos;
    });

    return NextResponse.json(
      {
        message: `OC ${compra.numero_po} recibida correctamente. ${result.length} entradas generadas.`,
        movimientos: result,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/movimientos/ingreso-po error:", error);
    const msg = error instanceof Error ? error.message : "Error al registrar ingreso";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
