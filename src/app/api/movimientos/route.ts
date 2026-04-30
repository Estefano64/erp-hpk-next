/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { TipoMovimientoInventario } from "@prisma/client";

type TipoMov = "ENTRADA" | "SALIDA" | "AJUSTE";

// GET — listar movimientos con datos de material joinados
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tipo = searchParams.get("tipo");
    const materialId = searchParams.get("material_id");
    const desde = searchParams.get("desde");
    const hasta = searchParams.get("hasta");

    const movimientos = await prisma.movimientoInventario.findMany({
      where: {
        ...(tipo ? { tipo_movimiento: tipo as TipoMovimientoInventario } : {}),
        ...(materialId ? { material_id: Number(materialId) } : {}),
        ...(desde || hasta
          ? {
              fecha_movimiento: {
                ...(desde ? { gte: new Date(desde) } : {}),
                ...(hasta ? { lte: new Date(hasta) } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ fecha_movimiento: "desc" }, { id: "desc" }],
      take: 500,
    });

    // Cargar materiales en batch
    type Mov = typeof movimientos[number];
    const materialIds: number[] = Array.from(new Set(movimientos.map((m: Mov) => m.material_id)));
    const materiales = await prisma.material.findMany({
      where: { material_id: { in: materialIds } },
      select: { material_id: true, codigo: true, descripcion: true, stock_actual: true, unidad_medida_codigo: true },
    });
    type Mat = typeof materiales[number];
    const matMap = new Map<number, Mat>(materiales.map((m: Mat) => [m.material_id, m]));

    const data = movimientos.map((m: Mov) => {
      const mat = matMap.get(m.material_id);
      return {
        id: m.id,
        material_id: m.material_id,
        material_codigo: mat?.codigo ?? null,
        material_nombre: mat?.descripcion ?? null,
        unidad_medida: mat?.unidad_medida_codigo ?? null,
        stock_actual: mat?.stock_actual ?? null,
        tipo_movimiento: m.tipo_movimiento,
        cantidad: m.cantidad,
        documento_referencia: m.documento_referencia,
        observacion: m.observacion,
        usuario: m.usuario,
        fecha_movimiento: m.fecha_movimiento,
      };
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/movimientos error:", error);
    return NextResponse.json({ error: "Error al obtener movimientos" }, { status: 500 });
  }
}

// POST — crear un movimiento (actualiza stock del material automaticamente)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { material_id, tipo_movimiento, cantidad, documento_referencia, observacion, usuario } = body;

    if (!material_id || !tipo_movimiento || !cantidad || !usuario) {
      return NextResponse.json(
        { error: "Campos obligatorios: material_id, tipo_movimiento, cantidad, usuario" },
        { status: 400 }
      );
    }
    const tiposValidos: TipoMov[] = ["ENTRADA", "SALIDA", "AJUSTE"];
    if (!tiposValidos.includes(tipo_movimiento)) {
      return NextResponse.json(
        { error: "tipo_movimiento debe ser ENTRADA, SALIDA o AJUSTE" },
        { status: 400 }
      );
    }

    const cant = Number(cantidad);
    if (cant <= 0) {
      return NextResponse.json({ error: "La cantidad debe ser > 0" }, { status: 400 });
    }

    // Validar stock en SALIDA
    if (tipo_movimiento === "SALIDA") {
      const mat = await prisma.material.findUnique({
        where: { material_id: Number(material_id) },
        select: { stock_actual: true, codigo: true },
      });
      const stockActual = mat?.stock_actual != null ? Number(mat.stock_actual) : 0;
      if (stockActual < cant) {
        return NextResponse.json(
          { error: `Stock insuficiente. Disponible: ${stockActual}` },
          { status: 400 }
        );
      }
    }

    // Crear movimiento + actualizar stock en transaccion
    const result = await prisma.$transaction(async (tx: any) => {
      const mov = await tx.movimientoInventario.create({
        data: {
          material_id: Number(material_id),
          tipo_movimiento: tipo_movimiento as TipoMovimientoInventario,
          cantidad: cant,
          documento_referencia: documento_referencia || null,
          observacion: observacion || null,
          usuario,
        },
      });

      if (tipo_movimiento === "AJUSTE") {
        // Setea stock directamente al valor
        await tx.material.update({
          where: { material_id: Number(material_id) },
          data: { stock_actual: cant },
        });
      } else {
        const delta = tipo_movimiento === "ENTRADA" ? cant : -cant;
        await tx.$executeRaw`UPDATE material SET stock_actual = COALESCE(stock_actual, 0) + ${delta}, updated_at = NOW() WHERE material_id = ${Number(material_id)}`;
      }

      return mov;
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    console.error("POST /api/movimientos error:", error);
    const msg = error instanceof Error ? error.message : "Error al crear movimiento";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
