import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPlantilla } from "@/lib/evaluacion-templates";
import { detectarTipoCilindro } from "@/lib/cod-rep-tipos";

type Ctx = { params: Promise<{ id: string }> };

// Código especial para la fila PlanificacionOT que contiene las capturas de evaluación.
const EVAL_OPERACION_CODIGO = "EVAL";

/**
 * GET /api/ordenes-trabajo/[id]/evaluacion
 * Devuelve todo lo que necesita la página de evaluación:
 * - OT con FK a CodRep
 * - modelo_evaluacion_codigo (determina la plantilla a usar)
 * - planificacion_ot_id (bucket de las capturas); se crea lazy si no existe
 * - capturas actuales
 * - plantilla (template JSON)
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const otId = Number(id);

    const ot = await prisma.ordenTrabajo.findUnique({
      where: { id: otId },
      select: {
        id: true,
        ot: true,
        descripcion: true,
        taller_status_codigo: true,
        taller_status: { select: { codigo: true, nombre: true } },
        cliente: { select: { codigo: true, razon_social: true } },
        codigo_reparacion: {
          select: {
            codigo: true,
            descripcion: true,
            np: true,
            flota_codigo: true,
            posicion_codigo: true,
            modelo_evaluacion_codigo: true,
            modelo_evaluacion: { select: { codigo: true, nombre: true } },
          },
        },
      },
    });

    if (!ot) return NextResponse.json({ error: "OT no encontrada" }, { status: 404 });

    // 1. Si la BD ya tiene asignado el modelo_evaluacion_codigo, lo usamos directo.
    // 2. Si no, intentamos detectar el tipo de cilindro contra el catálogo del Excel
    //    (5. Cod Rep) usando descripción / NP / flota como llave.
    const modeloAsignado = ot.codigo_reparacion?.modelo_evaluacion_codigo ?? null;
    const deteccion = !modeloAsignado && ot.codigo_reparacion
      ? detectarTipoCilindro({
          descripcion: ot.codigo_reparacion.descripcion,
          np: ot.codigo_reparacion.np,
          flota: ot.codigo_reparacion.flota_codigo,
          posicion: ot.codigo_reparacion.posicion_codigo,
        })
      : null;
    const modeloCodigo = modeloAsignado ?? deteccion?.codigo ?? null;
    const plantilla = modeloCodigo ? getPlantilla(modeloCodigo) : null;

    // Buscar o crear la fila PlanificacionOT que sirve de bucket para las capturas
    const existing = await prisma.planificacionOT.findFirst({
      where: { ot_id: otId, operacion_codigo: EVAL_OPERACION_CODIGO },
      include: { capturas: { orderBy: { id: "asc" } } },
    });

    let planEvalId: number;
    let capturas: typeof existing extends null ? never : NonNullable<typeof existing>["capturas"];
    if (existing) {
      planEvalId = existing.id;
      capturas = existing.capturas;
    } else {
      const created = await prisma.planificacionOT.create({
        data: {
          ot_id: otId,
          componente: "CILINDRO",
          operacion_codigo: EVAL_OPERACION_CODIGO,
          descripcion: "Evaluación técnica (capturas)",
          orden: 0,
          estado: "abierto",
        },
      });
      planEvalId = created.id;
      capturas = [] as unknown as typeof capturas;
    }

    return NextResponse.json({
      data: {
        ot: {
          id: ot.id,
          ot: ot.ot,
          descripcion: ot.descripcion,
          taller_status: ot.taller_status,
          cliente: ot.cliente,
        },
        codigo_reparacion: ot.codigo_reparacion,
        modelo_evaluacion_codigo: modeloCodigo,
        modelo_evaluacion_origen: modeloAsignado ? "catalogo_cod_rep" : (deteccion?.codigo ? `detectado_${deteccion.via}` : "no_detectado"),
        deteccion: deteccion ?? null,
        plantilla,
        planificacion_eval_id: planEvalId,
        capturas,
      },
    });
  } catch (error) {
    console.error("GET /api/ordenes-trabajo/[id]/evaluacion error:", error);
    return NextResponse.json({ error: "Error al cargar evaluación" }, { status: 500 });
  }
}
