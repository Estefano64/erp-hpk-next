// GET /api/dashboard/logistica/facturacion
//
// Agregados de Facturación (OT externas con fecha_facturacion) para el
// dashboard de Logística — Fase 5.
//
// Query params:
//   ?modo=anio|mes|sem   obligatorio
//   ?anio=2026            obligatorio
//   ?mes=6                obligatorio cuando modo=mes
//   ?sem=23               obligatorio cuando modo=sem
//   ?tipo=all|rep|bien|serv  default all
//
// Respuesta (todos los montos separados por moneda — nunca se suman USD y
// soles entre sí; los % de participación se calculan dentro de cada moneda):
//   {
//     kpis: {
//       usd: { total, rep, bien, serv, repPct, bienPct, servPct },
//       sol: { total, rep, bien, serv, repPct, bienPct, servPct },
//     },
//     porMes: {
//       usd: { rep: number[12]; bien: number[12]; serv: number[12] },
//       sol: { rep: number[12]; bien: number[12]; serv: number[12] },
//     },
//   }

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import dayjs from "dayjs";
import { rangoUTC, anioUTC, mesUTC, esSol } from "@/lib/dashboard-logistica";

type Tipo = "all" | "rep" | "bien" | "serv";

type KpisMoneda = {
  total: number; rep: number; bien: number; serv: number;
  repPct: number; bienPct: number; servPct: number;
};

function kpisVacios(): KpisMoneda {
  return { total: 0, rep: 0, bien: 0, serv: 0, repPct: 0, bienPct: 0, servPct: 0 };
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
    const { inicio: inicioAnio, fin: finAnio } = anioUTC(anio);

    // KPIs del rango: total + por tipo
    const tipos = tipo === "all" ? ["REP", "BIE", "SER"]
      : tipo === "rep" ? ["REP"]
      : tipo === "bien" ? ["BIE"]
      : ["SER"];

    const otsRango = await prisma.ordenTrabajo.findMany({
      where: {
        activo: true,
        fecha_facturacion: { gte: desde, lt: hasta, not: null },
        tipo_codigo: { in: tipos },
      },
      select: {
        tipo_codigo: true,
        monto_cotizacion: true,
        moneda_cotizacion_codigo: true,
      },
    });

    const kpis = { usd: kpisVacios(), sol: kpisVacios() };
    for (const ot of otsRango) {
      const m = Number(ot.monto_cotizacion ?? 0);
      if (!Number.isFinite(m) || m <= 0) continue;
      const k = esSol(ot.moneda_cotizacion_codigo) ? kpis.sol : kpis.usd;
      k.total += m;
      if (ot.tipo_codigo === "REP") k.rep += m;
      else if (ot.tipo_codigo === "BIE") k.bien += m;
      else if (ot.tipo_codigo === "SER") k.serv += m;
    }
    for (const k of [kpis.usd, kpis.sol]) {
      k.repPct = k.total > 0 ? (k.rep / k.total) * 100 : 0;
      k.bienPct = k.total > 0 ? (k.bien / k.total) * 100 : 0;
      k.servPct = k.total > 0 ? (k.serv / k.total) * 100 : 0;
    }

    // Por mes (12 valores) — del año, ignora modo
    const otsAnio = await prisma.ordenTrabajo.findMany({
      where: {
        activo: true,
        fecha_facturacion: { gte: inicioAnio, lt: finAnio, not: null },
        tipo_codigo: { in: ["REP", "BIE", "SER"] },
      },
      select: {
        fecha_facturacion: true,
        tipo_codigo: true,
        monto_cotizacion: true,
        moneda_cotizacion_codigo: true,
      },
    });
    const mesesVacios = () => ({
      rep: Array(12).fill(0) as number[],
      bien: Array(12).fill(0) as number[],
      serv: Array(12).fill(0) as number[],
    });
    const porMes = { usd: mesesVacios(), sol: mesesVacios() };
    for (const ot of otsAnio) {
      if (!ot.fecha_facturacion) continue;
      const m = mesUTC(ot.fecha_facturacion);
      const monto = Number(ot.monto_cotizacion ?? 0);
      if (!Number.isFinite(monto) || monto <= 0) continue;
      const bucket = esSol(ot.moneda_cotizacion_codigo) ? porMes.sol : porMes.usd;
      if (ot.tipo_codigo === "REP") bucket.rep[m] += monto;
      else if (ot.tipo_codigo === "BIE") bucket.bien[m] += monto;
      else if (ot.tipo_codigo === "SER") bucket.serv[m] += monto;
    }

    return NextResponse.json({
      kpis,
      porMes,
      meta: { modo, anio, mes, sem, tipo },
    });
  } catch (e) {
    console.error("GET /api/dashboard/logistica/facturacion error:", e);
    return NextResponse.json({ error: "Error al obtener datos" }, { status: 500 });
  }
}
