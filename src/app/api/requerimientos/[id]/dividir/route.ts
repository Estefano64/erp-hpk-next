import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// POST — dividir un requerimiento en varios sub-items
// body: { partes: number[]  ej: [1, 1] o [1, 3] o [2, 2] (deben sumar la cantidad original)
//                                                        o ser menor — el resto queda en el original }
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const partes = body.partes as number[];

    if (!Array.isArray(partes) || partes.length < 2) {
      return NextResponse.json(
        { error: "Debes especificar al menos 2 partes" },
        { status: 400 }
      );
    }

    // Cargar el requerimiento original
    const original = await prisma.oTRepuesto.findUnique({ where: { id: Number(id) } });
    if (!original) return NextResponse.json({ error: "Requerimiento no encontrado" }, { status: 404 });

    if (original.nro_oc || original.po_id) {
      return NextResponse.json(
        { error: "No se puede dividir un requerimiento ya asignado a una OC" },
        { status: 400 }
      );
    }

    const cantOriginal = parseFloat(String(original.cantidad));
    const sumaPartes = partes.reduce((s, p) => s + Number(p), 0);

    if (sumaPartes > cantOriginal) {
      return NextResponse.json(
        { error: `Las partes (${sumaPartes}) no pueden superar la cantidad original (${cantOriginal})` },
        { status: 400 }
      );
    }
    if (partes.some((p) => !p || p <= 0)) {
      return NextResponse.json({ error: "Todas las partes deben ser mayores a 0" }, { status: 400 });
    }

    // Buscar el siguiente item_req disponible dentro del nro_req
    const sameReq = await prisma.oTRepuesto.findMany({
      where: { ot_id: original.ot_id, nro_req: original.nro_req },
      orderBy: { item_req: "desc" },
      take: 1,
    });
    const startItem = ((sameReq[0]?.item_req ?? original.item_req ?? 0) as number) + 1;

    // Transaccion: actualizar el original con la primera parte, crear nuevos registros con las demas
    const result = await prisma.$transaction(async (tx) => {
      // Primera parte: actualizar el original
      await tx.oTRepuesto.update({
        where: { id: original.id },
        data: { cantidad: partes[0] },
      });

      // Resto de partes: crear nuevos registros copia del original
      const nuevos = [];
      for (let i = 1; i < partes.length; i++) {
        const nuevo = await tx.oTRepuesto.create({
          data: {
            ot_id: original.ot_id,
            material_id: original.material_id,
            material_codigo: original.material_codigo,
            nro_req: original.nro_req,
            item_req: startItem + i - 1,
            tipo_codigo: original.tipo_codigo,
            cantidad: partes[i],
            descripcion: original.descripcion,
            texto: original.texto,
            fabricante_codigo: original.fabricante_codigo,
            unidad_medida: original.unidad_medida,
            fecha_solicitud: new Date(),
            fecha_requerida: original.fecha_requerida,
            estado: original.estado || "Pendiente",
            estado_cot: original.estado_cot,
            precio_unitario: original.precio_unitario,
            precio_venta: original.precio_venta,
            moneda: original.moneda,
            es_adicional: original.es_adicional,
            usuario_solicita: original.usuario_solicita,
            observaciones: `Dividido del requerimiento #${original.id}`,
          },
        });
        nuevos.push(nuevo);
      }

      // Si la suma de partes es MENOR que la cantidad original, el remanente queda en el original
      // pero ya lo actualizamos arriba con partes[0] — si habia remanente, se pierde
      // Ajuste: si hay remanente, crear un registro adicional con el resto
      const remanente = cantOriginal - sumaPartes;
      if (remanente > 0) {
        const remanenteReg = await tx.oTRepuesto.create({
          data: {
            ot_id: original.ot_id,
            material_id: original.material_id,
            material_codigo: original.material_codigo,
            nro_req: original.nro_req,
            item_req: startItem + partes.length - 1,
            tipo_codigo: original.tipo_codigo,
            cantidad: remanente,
            descripcion: original.descripcion,
            texto: original.texto,
            fabricante_codigo: original.fabricante_codigo,
            unidad_medida: original.unidad_medida,
            fecha_solicitud: new Date(),
            fecha_requerida: original.fecha_requerida,
            estado: original.estado || "Pendiente",
            precio_unitario: original.precio_unitario,
            moneda: original.moneda,
            usuario_solicita: original.usuario_solicita,
            observaciones: `Remanente dividido del requerimiento #${original.id}`,
          },
        });
        nuevos.push(remanenteReg);
      }

      return nuevos;
    });

    return NextResponse.json({
      message: `Requerimiento dividido en ${partes.length + (cantOriginal - sumaPartes > 0 ? 1 : 0)} partes`,
      creados: result,
    });
  } catch (error) {
    console.error("POST /api/requerimientos/[id]/dividir error:", error);
    const msg = error instanceof Error ? error.message : "Error al dividir";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
