import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST — crear OC desde multiples requerimientos
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      repuesto_ids,
      proveedor_id,
      almacen_id,
      moneda,
      fecha_entrega_esperada,
      observaciones,
      usuario,
    } = body;

    if (!Array.isArray(repuesto_ids) || repuesto_ids.length === 0) {
      return NextResponse.json({ error: "Debes seleccionar al menos un requerimiento" }, { status: 400 });
    }
    if (!proveedor_id || !almacen_id) {
      return NextResponse.json({ error: "proveedor_id y almacen_id son obligatorios" }, { status: 400 });
    }

    // Cargar requerimientos
    const repuestos = await prisma.oTRepuesto.findMany({
      where: { id: { in: repuesto_ids.map(Number) } },
    });
    if (!repuestos.length) {
      return NextResponse.json({ error: "Requerimientos no encontrados" }, { status: 404 });
    }

    // Generar numero de PO: D{YY}{NNNN}
    const year = new Date().getFullYear().toString().slice(-2);
    const prefix = `D${year}`;
    const ultima = await prisma.compra.findFirst({
      where: { numero_po: { startsWith: prefix } },
      orderBy: { numero_po: "desc" },
    });
    let seq = 1;
    if (ultima) {
      const lastNum = parseInt(ultima.numero_po.substring(3)) || 0;
      seq = lastNum + 1;
    }
    const numero_po = `${prefix}${String(seq).padStart(4, "0")}`;

    // Calcular totales (con IGV 18%)
    const IGV_PCT = 0.18;
    let subtotal = 0;
    const detallesData: Array<{
      material_id: number;
      cantidad: number;
      precio_unitario: number;
      subtotal: number;
      impuesto: number;
      total: number;
    }> = [];

    for (const rep of repuestos) {
      const precio = parseFloat(String(rep.precio_unitario || 0));
      const cant = parseFloat(String(rep.cantidad || 0));
      const itemSub = precio * cant;
      subtotal += itemSub;

      // Solo items MAC con material_id van en compra_detalles
      if (rep.material_id) {
        detallesData.push({
          material_id: rep.material_id,
          cantidad: Math.round(cant),
          precio_unitario: precio,
          subtotal: itemSub,
          impuesto: itemSub * IGV_PCT,
          total: itemSub * (1 + IGV_PCT),
        });
      }
    }

    const impuesto = subtotal * IGV_PCT;
    const total = subtotal + impuesto;

    // Crear la Compra
    const compra = await prisma.compra.create({
      data: {
        numero_po,
        proveedor_id: Number(proveedor_id),
        almacen_id: Number(almacen_id),
        fecha_solicitud: new Date(),
        fecha_entrega_esperada: fecha_entrega_esperada ? new Date(fecha_entrega_esperada) : null,
        estado: "Pendiente",
        subtotal,
        impuesto,
        total,
        moneda: moneda || "USD",
        observaciones: observaciones || `OC generada desde ${repuestos.length} requerimiento(s)`,
        usuario_solicita: usuario || "Logistica",
      },
    });

    // Crear los CompraDetalle
    if (detallesData.length > 0) {
      await prisma.compraDetalle.createMany({
        data: detallesData.map((d) => ({ ...d, compra_id: compra.id })),
      });
    }

    // Actualizar los requerimientos: estado "En PO", po_id, nro_oc
    await prisma.oTRepuesto.updateMany({
      where: { id: { in: repuestos.map((r) => r.id) } },
      data: {
        estado: "En PO",
        po_id: compra.id,
        nro_oc: numero_po,
        fecha_oc: new Date(),
      },
    });

    // Registrar historial por cada OT unica involucrada
    const otIds = [...new Set(repuestos.map((r) => r.ot_id))];
    await Promise.all(
      otIds.map((otId) =>
        prisma.oTHistorial.create({
          data: {
            ot_id: otId,
            tipo_operacion: "Otro",
            descripcion: `Generacion de OC ${numero_po} con ${repuestos.filter((r) => r.ot_id === otId).length} item(s)`,
            usuario: usuario || "Logistica",
            datos_adicionales: JSON.stringify({ po_id: compra.id, numero_po }),
          },
        })
      )
    );

    return NextResponse.json(
      {
        message: `OC ${numero_po} creada con ${repuestos.length} item(s)`,
        compra,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/compras/crear-oc error:", error);
    const msg = error instanceof Error ? error.message : "Error al crear OC";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
