// GET /api/dashboard/logistica/oc
//
// Agregados de Órdenes de Compra para el dashboard de Logística — Fase 3.
//
// Query params:
//   ?modo=anio|mes|sem            obligatorio
//   ?anio=2026                     obligatorio
//   ?mes=6                         obligatorio cuando modo=mes
//   ?sem=23                        obligatorio cuando modo=sem
//   ?tipo=all|rep|serv             default all
//
// Respuesta:
//   {
//     kpis: { colocadas, costo: {usd,sol}, ticket: {usd,sol} },
//     estado: { recibidas, enProceso, pendientes, anuladas },
//     topProveedores: [{ nombre, usd, sol }, ...],   // top 10; la UI ordena por la moneda elegida
//     porMesCantidad: number[12],
//     porMesCosto: { usd: number[12], sol: number[12] },
//     porTiempo: number[5],   // [Mismo día, 1-2d, 3-5d, 6-10d, +10d] desde apr. del primer req hasta crear OC
//     tiempoPromedio: number, // en días, desde aprob. promedio del primer req hasta crear OC
//   }
//
// Notas:
//   - "Recibidas" = ENTREGADO | COMPLETO; "En proceso" = PROCESO | INCOMPLETO;
//     "Pendientes" = PEND_OC; "Anuladas" = ANULADO.
//   - Filtro por tipo: si tipo=rep, solo OCs que tienen items OTRepuesto MAC/CAD;
//     serv → items SER; all → todas las OCs.
//   - Los montos se separan SIEMPRE por moneda (USD vs SOL) — nunca se suman
//     entre sí. Las OCs ANULADAS cuentan en `colocadas`/`estado` pero quedan
//     fuera de todos los montos (costo, ticket, top proveedores, costo mensual).
//   - Tiempo de colocación = Compra.fecha_solicitud - max(req.fecha_aprobacion) del OTRepuesto vinculado.

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import dayjs from "dayjs";
import {
  rangoUTC, anioUTC, mesUTC, esSol, montoCero, sumarMonto, mediana,
} from "@/lib/dashboard-logistica";

type Tipo = "all" | "rep" | "serv";

// Filtro de Compra que tiene al menos un OTRepuesto del tipo dado.
function tipoComprasWhere(tipo: Tipo): Record<string, unknown> {
  if (tipo === "all") return {};
  const tipos = tipo === "rep" ? ["MAC", "CAD"] : ["SER"];
  return {
    ot_repuestos: {
      some: { tipo_codigo: { in: tipos } },
    },
  };
}

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const sp = req.nextUrl.searchParams;
    const modo = sp.get("modo") ?? "mes";
    const anio = Number(sp.get("anio") ?? dayjs().year());
    const mes = sp.get("mes") ? Number(sp.get("mes")) : null;
    const sem = sp.get("sem") ? Number(sp.get("sem")) : null;
    const tipo = (sp.get("tipo") as Tipo) ?? "all";

    if (!Number.isFinite(anio) || anio < 2020 || anio > 2100) {
      return NextResponse.json({ error: "anio inválido" }, { status: 400 });
    }

    const { desde, hasta } = rangoUTC(modo, anio, mes, sem);
    const tipoWhere = tipoComprasWhere(tipo);

    // OCs del rango activo (para KPIs, estado, top proveedores, tiempo)
    const compras = await prisma.compra.findMany({
      where: {
        ...tipoWhere,
        fecha_solicitud: { gte: desde, lt: hasta },
      },
      select: {
        id: true,
        status_oc_codigo: true,
        total: true,
        moneda_codigo: true,
        fecha_solicitud: true,
        // La setea la recepción (ingreso-po) — es "cuándo llegó a HPK".
        fecha_entrega_real: true,
        proveedor: { select: { razon_social: true } },
        ot_repuestos: {
          select: { fecha_aprobacion: true },
          orderBy: { fecha_aprobacion: "desc" },
          take: 1, // la fecha de aprobación más reciente del req vinculado
        },
      },
    });

    // KPIs — montos por moneda, anuladas fuera.
    const colocadas = compras.length;
    const costo = montoCero();
    let countUsd = 0;
    let countSol = 0;
    for (const c of compras) {
      if (c.status_oc_codigo === "ANULADO") continue;
      const t = Number(c.total ?? 0);
      if (!Number.isFinite(t)) continue;
      sumarMonto(costo, t, c.moneda_codigo);
      if (esSol(c.moneda_codigo)) countSol++;
      else countUsd++;
    }
    const ticket = {
      usd: countUsd > 0 ? costo.usd / countUsd : 0,
      sol: countSol > 0 ? costo.sol / countSol : 0,
    };

    // Estado
    const estado = { recibidas: 0, enProceso: 0, pendientes: 0, anuladas: 0 };
    for (const c of compras) {
      const s = c.status_oc_codigo ?? "";
      if (s === "ENTREGADO" || s === "COMPLETO") estado.recibidas++;
      else if (s === "PROCESO" || s === "INCOMPLETO") estado.enProceso++;
      else if (s === "PEND_OC") estado.pendientes++;
      else if (s === "ANULADO") estado.anuladas++;
    }

    // Top proveedores por monto, separado por moneda. Devolvemos 10 y la UI
    // ordena/recorta según la moneda que el usuario elija — así el ranking
    // nunca compara dólares contra soles.
    const provTotales: Record<string, { usd: number; sol: number }> = {};
    for (const c of compras) {
      if (c.status_oc_codigo === "ANULADO") continue;
      const nombre = c.proveedor?.razon_social ?? "(sin proveedor)";
      const t = Number(c.total ?? 0);
      if (!Number.isFinite(t) || t === 0) continue;
      if (!provTotales[nombre]) provTotales[nombre] = montoCero();
      sumarMonto(provTotales[nombre], t, c.moneda_codigo);
    }
    const topProveedores = Object.entries(provTotales)
      .sort((a, b) => Math.max(b[1].usd, b[1].sol) - Math.max(a[1].usd, a[1].sol))
      .slice(0, 10)
      .map(([nombre, m]) => ({ nombre, usd: m.usd, sol: m.sol }));

    // ── Por mes (12 valores) — del año, ignora modo ──────────────────
    const { inicio, fin } = anioUTC(anio);
    const comprasAnio = await prisma.compra.findMany({
      where: {
        ...tipoWhere,
        fecha_solicitud: { gte: inicio, lt: fin },
      },
      select: { fecha_solicitud: true, total: true, moneda_codigo: true, status_oc_codigo: true },
    });
    const porMesCantidad: number[] = Array(12).fill(0);
    const porMesCosto = { usd: Array(12).fill(0) as number[], sol: Array(12).fill(0) as number[] };
    for (const c of comprasAnio) {
      const m = mesUTC(c.fecha_solicitud);
      porMesCantidad[m]++;
      if (c.status_oc_codigo === "ANULADO") continue;
      const t = Number(c.total ?? 0);
      if (!Number.isFinite(t)) continue;
      if (esSol(c.moneda_codigo)) porMesCosto.sol[m] += t;
      else porMesCosto.usd[m] += t;
    }

    // ── Tiempo para colocar OC (distribución + promedio) ──────────────
    // Para cada compra: días entre fecha_aprobacion del req más reciente y
    // fecha_solicitud de la compra. Si no hay fecha_aprobacion → se omite.
    const porTiempo: number[] = [0, 0, 0, 0, 0]; // [mismo día, 1-2, 3-5, 6-10, +10]
    const diasColocar: number[] = [];
    for (const c of compras) {
      const aprob = c.ot_repuestos[0]?.fecha_aprobacion;
      if (!aprob) continue;
      const dias = dayjs(c.fecha_solicitud).diff(dayjs(aprob), "day");
      if (dias < 0) continue;
      diasColocar.push(dias);
      if (dias === 0) porTiempo[0]++;
      else if (dias <= 2) porTiempo[1]++;
      else if (dias <= 5) porTiempo[2]++;
      else if (dias <= 10) porTiempo[3]++;
      else porTiempo[4]++;
    }
    const tiempoPromedio = diasColocar.length > 0
      ? diasColocar.reduce((a, b) => a + b, 0) / diasColocar.length : 0;
    const tiempoMediana = mediana(diasColocar);

    // ── Tiempo de llegada desde generación de OC (pedido 2026-08-20) ──
    // Días entre la generación de la OC (fecha_solicitud) y su llegada a HPK
    // (fecha_entrega_real, seteada por la recepción). Solo OCs del rango ya
    // recibidas; anuladas fuera.
    const diasLlegada: number[] = [];
    for (const c of compras) {
      if (c.status_oc_codigo === "ANULADO") continue;
      if (!c.fecha_entrega_real) continue;
      const dias = dayjs(c.fecha_entrega_real).diff(dayjs(c.fecha_solicitud), "day");
      if (dias < 0) continue;
      diasLlegada.push(dias);
    }
    const tiempoLlegada = {
      promedio: diasLlegada.length > 0
        ? diasLlegada.reduce((a, b) => a + b, 0) / diasLlegada.length : 0,
      mediana: mediana(diasLlegada),
      n: diasLlegada.length,
    };

    return NextResponse.json({
      kpis: { colocadas, costo, ticket },
      estado,
      topProveedores,
      porMesCantidad,
      porMesCosto,
      porTiempo,
      tiempoPromedio,
      tiempoMediana,
      tiempoLlegada,
      meta: { modo, anio, mes, sem, tipo },
    });
  } catch (e) {
    console.error("GET /api/dashboard/logistica/oc error:", e);
    return NextResponse.json({ error: "Error al obtener datos" }, { status: 500 });
  }
}
