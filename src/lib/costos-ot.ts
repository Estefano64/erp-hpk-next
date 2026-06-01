// Cálculo de costos de una OT (externa o interna).
//
// EJECUTADO = costo real ya gastado:
//   - Materiales: OTRepuesto con cantidad_recibida > 0 → recibido × precio
//   - Servicios:  OTRepuesto SER con status_oc ENTREGADO/COMPLETO → cantidad × precio
//   - HH:         PlanificacionOTSesion con `fin != null` × costo_hora del Trabajador
//                 (solo aplica a OT externa — internas no tienen PlanificacionOT)
//   - OCs:        auditoría de las OCs vinculadas
//
// PROYECTADO = costo aprobado pero no ejecutado:
//   - Materiales: APROBADO no ENTREGADO → (cantidad - recibido) × precio
//   - Servicios:  idem
//
// Las monedas se agrupan por código — no se convierte automáticamente.

import { Prisma, type PrismaClient } from "@prisma/client";

export type MonedaTotales = Record<string, number>;

export interface MaterialItem {
  id: number;
  nro_req: string | null;
  item_req: number | null;
  material_codigo: string | null;
  descripcion: string;
  cantidad: number;
  cantidad_recibida: number;
  precio_unitario: number;
  moneda: string;
  subtotal: number;
  subtotal_ejecutado: number;
  subtotal_proyectado: number;
  status_req: string | null;
  status_oc: string | null;
}

export type ServicioItem = MaterialItem;

export interface OCItem {
  id: number;
  numero_po: string;
  proveedor: string | null;
  status_oc: string | null;
  moneda: string;
  total: number;
  total_recibido: number;
  fecha_solicitud: string | null;
  fecha_entrega_real: string | null;
}

export interface HHItem {
  planificacion_id: number;
  descripcion: string;
  tecnico: string;
  horas_normales: number;
  horas_extras: number;
  costo_hora_hombre: number;
  costo_hora_extra: number;
  moneda: string;
  subtotal: number;
}

export interface CostosResultado {
  ejecutado: {
    materiales: { items: MaterialItem[]; total_por_moneda: MonedaTotales };
    servicios: { items: ServicioItem[]; total_por_moneda: MonedaTotales };
    hh: { items: HHItem[]; total_por_moneda: MonedaTotales };
    ocs: { items: OCItem[]; total_por_moneda: MonedaTotales };
    total_por_moneda: MonedaTotales;
  };
  proyectado: {
    materiales: { items: MaterialItem[]; total_por_moneda: MonedaTotales };
    servicios: { items: ServicioItem[]; total_por_moneda: MonedaTotales };
    total_por_moneda: MonedaTotales;
  };
}

function sumarMoneda(acc: MonedaTotales, moneda: string, monto: number): void {
  if (!Number.isFinite(monto) || monto === 0) return;
  acc[moneda] = (acc[moneda] ?? 0) + monto;
}

function dec(v: Prisma.Decimal | number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "object" && "toNumber" in (v as object)
    ? (v as Prisma.Decimal).toNumber()
    : Number(v);
  return Number.isFinite(n) ? n : 0;
}

// La moneda de HH no está en el modelo Trabajador. Asumimos PEN — el costo
// de mano de obra en HP&K se maneja en soles. Para cambiar, override aquí
// (en una fase posterior puede moverse a ConfiguracionCotizacion).
const MONEDA_HH = "PEN";

interface Args {
  otId?: number | null;
  otInternaId?: number | null;
}

export async function calcularCostosOT(
  prisma: PrismaClient,
  args: Args,
): Promise<CostosResultado> {
  if (!args.otId && !args.otInternaId) {
    throw new Error("calcularCostosOT requiere otId u otInternaId");
  }

  const esInterna = args.otInternaId != null;
  const filtroRepuestos = esInterna
    ? { orden_trabajo_interna_id: args.otInternaId! }
    : { ot_id: args.otId! };

  // ── Repuestos (materiales + servicios) ──────────────────────────────
  const repuestos = await prisma.oTRepuesto.findMany({
    where: filtroRepuestos,
    select: {
      id: true,
      nro_req: true,
      item_req: true,
      tipo_codigo: true,
      material_codigo: true,
      descripcion: true,
      cantidad: true,
      cantidad_recibida: true,
      precio_unitario: true,
      moneda: true,
      status_requerimiento_codigo: true,
      status_oc_codigo: true,
    },
    orderBy: [{ nro_req: "asc" }, { item_req: "asc" }],
  });

  const materiales: MaterialItem[] = [];
  const servicios: ServicioItem[] = [];
  const totalEjecutadoMat: MonedaTotales = {};
  const totalEjecutadoSer: MonedaTotales = {};
  const totalProyectadoMat: MonedaTotales = {};
  const totalProyectadoSer: MonedaTotales = {};

  for (const r of repuestos) {
    const cantidad = dec(r.cantidad);
    const recibido = dec(r.cantidad_recibida);
    const precio = dec(r.precio_unitario);
    const moneda = r.moneda ?? "USD";
    const anulado =
      r.status_requerimiento_codigo === "ANULADO"
      || r.status_requerimiento_codigo === "DESAPROBADO";
    if (anulado) continue;
    const enProceso =
      r.status_requerimiento_codigo === "APROBADO"
      || (r.status_oc_codigo != null && r.status_oc_codigo !== "ANULADO");
    const subEjecutado = recibido * precio;
    const pendiente = Math.max(cantidad - recibido, 0);
    const subProyectado = enProceso ? pendiente * precio : 0;
    const item: MaterialItem = {
      id: r.id,
      nro_req: r.nro_req,
      item_req: r.item_req,
      material_codigo: r.material_codigo,
      descripcion: r.descripcion ?? r.material_codigo ?? "—",
      cantidad,
      cantidad_recibida: recibido,
      precio_unitario: precio,
      moneda,
      subtotal: cantidad * precio,
      subtotal_ejecutado: subEjecutado,
      subtotal_proyectado: subProyectado,
      status_req: r.status_requerimiento_codigo,
      status_oc: r.status_oc_codigo,
    };
    if (r.tipo_codigo === "SER") {
      servicios.push(item);
      sumarMoneda(totalEjecutadoSer, moneda, subEjecutado);
      sumarMoneda(totalProyectadoSer, moneda, subProyectado);
    } else {
      materiales.push(item);
      sumarMoneda(totalEjecutadoMat, moneda, subEjecutado);
      sumarMoneda(totalProyectadoMat, moneda, subProyectado);
    }
  }

  // ── OCs vinculadas ──────────────────────────────────────────────────
  // OT externa: por Compra.ot_id directo.
  // OT interna: hay que buscar OCs que tengan reqs con orden_trabajo_interna_id.
  const ocsItems: OCItem[] = [];
  let ocs: Array<{
    id: number;
    numero_po: string;
    moneda_codigo: string | null;
    status_oc_codigo: string | null;
    fecha_solicitud: Date | null;
    fecha_entrega_real: Date | null;
    proveedor: { razon_social: string } | null;
    detalles: { cantidad: Prisma.Decimal; cantidad_recibida: Prisma.Decimal | null; precio_unitario: Prisma.Decimal }[];
  }> = [];
  if (esInterna) {
    // Conjunto de po_id que tienen al menos un req de esta OT interna.
    const reqsConPO = await prisma.oTRepuesto.findMany({
      where: { orden_trabajo_interna_id: args.otInternaId!, po_id: { not: null } },
      select: { po_id: true },
      distinct: ["po_id"],
    });
    const poIds = reqsConPO.map((r) => r.po_id!).filter((x): x is number => x != null);
    if (poIds.length > 0) {
      ocs = await prisma.compra.findMany({
        where: { id: { in: poIds } },
        select: {
          id: true,
          numero_po: true,
          moneda_codigo: true,
          status_oc_codigo: true,
          fecha_solicitud: true,
          fecha_entrega_real: true,
          proveedor: { select: { razon_social: true } },
          detalles: { select: { cantidad: true, cantidad_recibida: true, precio_unitario: true } },
        },
        orderBy: { id: "desc" },
      });
    }
  } else {
    ocs = await prisma.compra.findMany({
      where: { ot_id: args.otId! },
      select: {
        id: true,
        numero_po: true,
        moneda_codigo: true,
        status_oc_codigo: true,
        fecha_solicitud: true,
        fecha_entrega_real: true,
        proveedor: { select: { razon_social: true } },
        detalles: { select: { cantidad: true, cantidad_recibida: true, precio_unitario: true } },
      },
      orderBy: { id: "desc" },
    });
  }
  for (const c of ocs) {
    const total = c.detalles.reduce(
      (s, d) => s + dec(d.cantidad) * dec(d.precio_unitario),
      0,
    );
    const recibido = c.detalles.reduce(
      (s, d) => s + dec(d.cantidad_recibida) * dec(d.precio_unitario),
      0,
    );
    ocsItems.push({
      id: c.id,
      numero_po: c.numero_po,
      proveedor: c.proveedor?.razon_social ?? null,
      status_oc: c.status_oc_codigo,
      moneda: c.moneda_codigo ?? "USD",
      total,
      total_recibido: recibido,
      fecha_solicitud: c.fecha_solicitud?.toISOString() ?? null,
      fecha_entrega_real: c.fecha_entrega_real?.toISOString() ?? null,
    });
  }

  // ── HH (sólo OT externa — internas no usan PlanificacionOT) ─────────
  const hhItems: HHItem[] = [];
  const totalEjecutadoHH: MonedaTotales = {};
  if (!esInterna) {
    const planificaciones = await prisma.planificacionOT.findMany({
      where: { ot_id: args.otId! },
      select: {
        id: true,
        descripcion: true,
        tecnico: true,
        horas_extras: true,
        sesiones: {
          where: { fin: { not: null } },
          select: { tecnico: true, inicio: true, fin: true },
        },
      },
    });
    const tecnicosUsados = new Set<string>();
    for (const p of planificaciones) {
      for (const s of p.sesiones) tecnicosUsados.add(s.tecnico);
    }
    const trabajadores = tecnicosUsados.size > 0
      ? await prisma.trabajador.findMany({
          where: { nombre: { in: Array.from(tecnicosUsados) } },
          select: { nombre: true, costo_hora_hombre: true, costo_hora_extra: true },
        })
      : [];
    const costoPorTecnico = new Map<string, { normal: number; extra: number }>();
    for (const t of trabajadores) {
      costoPorTecnico.set(t.nombre, {
        normal: dec(t.costo_hora_hombre),
        extra: dec(t.costo_hora_extra),
      });
    }
    for (const p of planificaciones) {
      const aggregadoPorTecnico = new Map<string, { horasNormales: number; horasExtras: number }>();
      for (const s of p.sesiones) {
        if (!s.fin) continue;
        const horas = (s.fin.getTime() - s.inicio.getTime()) / (1000 * 60 * 60);
        if (!Number.isFinite(horas) || horas <= 0) continue;
        const cur = aggregadoPorTecnico.get(s.tecnico) ?? { horasNormales: 0, horasExtras: 0 };
        if (p.horas_extras) cur.horasExtras += horas;
        else cur.horasNormales += horas;
        aggregadoPorTecnico.set(s.tecnico, cur);
      }
      for (const [tec, h] of aggregadoPorTecnico) {
        const cost = costoPorTecnico.get(tec) ?? { normal: 0, extra: 0 };
        const subtotal = h.horasNormales * cost.normal + h.horasExtras * cost.extra;
        hhItems.push({
          planificacion_id: p.id,
          descripcion: p.descripcion,
          tecnico: tec,
          horas_normales: Number(h.horasNormales.toFixed(2)),
          horas_extras: Number(h.horasExtras.toFixed(2)),
          costo_hora_hombre: cost.normal,
          costo_hora_extra: cost.extra,
          moneda: MONEDA_HH,
          subtotal,
        });
        sumarMoneda(totalEjecutadoHH, MONEDA_HH, subtotal);
      }
    }
  }

  // ── Totales generales por moneda ────────────────────────────────────
  const totalEjecutado: MonedaTotales = {};
  const totalProyectado: MonedaTotales = {};
  for (const [m, v] of Object.entries(totalEjecutadoMat)) sumarMoneda(totalEjecutado, m, v);
  for (const [m, v] of Object.entries(totalEjecutadoSer)) sumarMoneda(totalEjecutado, m, v);
  for (const [m, v] of Object.entries(totalEjecutadoHH)) sumarMoneda(totalEjecutado, m, v);
  for (const [m, v] of Object.entries(totalProyectadoMat)) sumarMoneda(totalProyectado, m, v);
  for (const [m, v] of Object.entries(totalProyectadoSer)) sumarMoneda(totalProyectado, m, v);

  return {
    ejecutado: {
      materiales: { items: materiales.filter((m) => m.subtotal_ejecutado > 0), total_por_moneda: totalEjecutadoMat },
      servicios: { items: servicios.filter((s) => s.subtotal_ejecutado > 0), total_por_moneda: totalEjecutadoSer },
      hh: { items: hhItems, total_por_moneda: totalEjecutadoHH },
      ocs: { items: ocsItems, total_por_moneda: {} },
      total_por_moneda: totalEjecutado,
    },
    proyectado: {
      materiales: { items: materiales.filter((m) => m.subtotal_proyectado > 0), total_por_moneda: totalProyectadoMat },
      servicios: { items: servicios.filter((s) => s.subtotal_proyectado > 0), total_por_moneda: totalProyectadoSer },
      total_por_moneda: totalProyectado,
    },
  };
}
