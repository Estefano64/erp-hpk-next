import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

const CalculateSchema = z.object({
  moneda: z.string().trim().optional(),
  guardar: z.boolean().optional().default(false),
  nro_cotizacion: z.string().trim().optional().nullable(),
});

function toNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * GET  /api/ordenes-trabajo/[id]/cotizacion — preview (no guarda)
 * POST /api/ordenes-trabajo/[id]/cotizacion — calcula y opcionalmente guarda en OT.monto_cotizacion
 *
 * Body POST: { moneda?: "USD"|"SOL", guardar?: boolean, nro_cotizacion?: string }
 */
async function calcular(otId: number, monedaOverride?: string) {
  const ot = await prisma.ordenTrabajo.findUnique({
    where: { id: otId },
    select: {
      id: true,
      ot: true,
      descripcion: true,
      id_cod_rep: true,
      codigo_reparacion: { select: { cod_rep_id: true, codigo: true, descripcion: true, np: true } },
    },
  });
  if (!ot) throw Object.assign(new Error("OT no encontrada"), { code: "NOT_FOUND" });
  if (!ot.codigo_reparacion) {
    throw Object.assign(new Error("La OT no tiene un CodRep asignado"), { code: "NO_CODREP" });
  }

  const config = await prisma.configuracionCotizacion.findFirst({ where: { id: 1 } });
  if (!config) {
    throw Object.assign(new Error("Configuración de cotización no inicializada"), { code: "NO_CONFIG" });
  }

  const moneda = monedaOverride?.trim() || config.moneda_default_codigo;
  const tarifaHora = moneda === "SOL" ? toNum(config.tarifa_hora_sol) : toNum(config.tarifa_hora_usd);
  const igvPct = toNum(config.igv_porcentaje);

  const codRepCodigo = ot.codigo_reparacion.codigo;

  // 1. Labor: HH × tarifa
  const operaciones = await prisma.operacionCodRep.findMany({
    where: { cod_rep_codigo: codRepCodigo, activo: true },
    select: {
      operacion_cod_rep_id: true,
      componente_codigo: true,
      trabajo: true,
      qty: true,
      horas: true,
      hh: true,
      orden: true,
    },
    orderBy: { orden: "asc" },
  });

  let laborHH = 0;
  let opsSinHH = 0;
  const laborBreakdown = operaciones.map((op) => {
    const hh = toNum(op.hh);
    const subtotal = hh * tarifaHora;
    laborHH += hh;
    if (hh <= 0) opsSinHH++;
    return {
      componente: op.componente_codigo,
      trabajo: op.trabajo,
      qty: op.qty,
      hh,
      tarifa: tarifaHora,
      subtotal,
    };
  });
  const laborCost = laborHH * tarifaHora;

  // 2. Materiales: requerimiento × material.precio
  const tareas = await prisma.tarea.findMany({
    where: { cod_rep_codigo: codRepCodigo },
    select: {
      tarea_id: true,
      descripcion: true,
      tipo_codigo: true,
      item_numero: true,
      requerimiento: true,
      precio: true,
      material_codigo: true,
      material: { select: { codigo: true, descripcion: true, precio: true, moneda_codigo: true } },
      ref_descripcion: true,
      np: true,
    },
  });

  let materialCost = 0;
  let tareasConPrecio = 0;
  let tareasSinMaterial = 0;
  let tareasSinPrecio = 0;
  const materialBreakdown = tareas.map((t) => {
    const requerimiento = toNum(t.requerimiento);
    // Precio: prioridad material.precio > tarea.precio (si fue especificado)
    let precioUnit = 0;
    if (t.material?.precio != null) precioUnit = toNum(t.material.precio);
    else if (t.precio != null) precioUnit = toNum(t.precio);

    const subtotal = requerimiento * precioUnit;
    if (!t.material_codigo) tareasSinMaterial++;
    else if (precioUnit === 0) tareasSinPrecio++;
    else {
      materialCost += subtotal;
      tareasConPrecio++;
    }

    return {
      tarea_id: t.tarea_id,
      item: t.item_numero,
      tipo: t.tipo_codigo,
      descripcion: t.descripcion,
      ref: t.ref_descripcion,
      np: t.np,
      material_codigo: t.material_codigo,
      requerimiento,
      precio_unitario: precioUnit,
      subtotal,
    };
  });

  const subtotal = laborCost + materialCost;
  const igv = subtotal * (igvPct / 100);
  const total = subtotal + igv;

  return {
    ot: { id: ot.id, ot: ot.ot, descripcion: ot.descripcion },
    codigo_reparacion: ot.codigo_reparacion,
    moneda,
    tarifa_hora_usada: tarifaHora,
    igv_porcentaje: igvPct,
    labor: {
      total_hh: laborHH,
      costo: laborCost,
      operaciones: laborBreakdown,
      operaciones_sin_hh: opsSinHH,
    },
    materiales: {
      costo: materialCost,
      tareas: materialBreakdown,
      tareas_con_precio: tareasConPrecio,
      tareas_sin_material: tareasSinMaterial,
      tareas_sin_precio: tareasSinPrecio,
    },
    subtotal,
    igv,
    total,
    warnings: [
      ...(laborHH === 0 ? ["Sin HH: completá OperacionCodRep del CodRep para que haya costo de labor."] : []),
      ...(opsSinHH > 0 ? [`${opsSinHH} operaciones tienen HH = 0 (no aportan al costo).`] : []),
      ...(tareasSinMaterial > 0 ? [`${tareasSinMaterial} tareas sin material_codigo resuelto — no contribuyen al costo.`] : []),
      ...(tareasSinPrecio > 0 ? [`${tareasSinPrecio} materiales sin precio cargado — no contribuyen al costo.`] : []),
    ],
  };
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const result = await calcular(Number(id));
    return NextResponse.json({ data: result });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err?.code === "NOT_FOUND") return NextResponse.json({ error: err.message }, { status: 404 });
    if (err?.code === "NO_CODREP" || err?.code === "NO_CONFIG") {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("GET /api/ordenes-trabajo/[id]/cotizacion error:", error);
    return NextResponse.json({ error: "Error al calcular cotización" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const otId = Number(id);
    const body = await req.json().catch(() => ({}));
    const parsed = CalculateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const usuario = (await getAuditUser(req)) ?? "sistema";
    const result = await calcular(otId, parsed.data.moneda);

    if (parsed.data.guardar) {
      await prisma.ordenTrabajo.update({
        where: { id: otId },
        data: {
          monto_cotizacion: result.total,
          fecha_cotizacion: new Date(),
          ...(parsed.data.nro_cotizacion ? { nro_cotizacion: parsed.data.nro_cotizacion } : {}),
        },
      });
      await prisma.oTHistorial.create({
        data: {
          ot_id: otId,
          tipo_operacion: "COTIZACION",
          descripcion: `Cotización calculada: ${result.moneda} ${result.total.toFixed(2)} (labor ${result.labor.costo.toFixed(2)} + materiales ${result.materiales.costo.toFixed(2)} + IGV ${result.igv.toFixed(2)})`,
          usuario,
          datos_adicionales: JSON.stringify({
            moneda: result.moneda,
            labor: result.labor.costo,
            materiales: result.materiales.costo,
            subtotal: result.subtotal,
            igv: result.igv,
            total: result.total,
            nro_cotizacion: parsed.data.nro_cotizacion ?? null,
          }),
        },
      });
    }

    return NextResponse.json({ data: result, guardado: !!parsed.data.guardar });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err?.code === "NOT_FOUND") return NextResponse.json({ error: err.message }, { status: 404 });
    if (err?.code === "NO_CODREP" || err?.code === "NO_CONFIG") {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("POST /api/ordenes-trabajo/[id]/cotizacion error:", error);
    return NextResponse.json({ error: "Error al generar cotización" }, { status: 500 });
  }
}
