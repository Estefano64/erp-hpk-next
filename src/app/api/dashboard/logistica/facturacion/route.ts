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
// Respuesta:
//   {
//     kpis: { total, rep, bien, serv, moneda, repPct, bienPct, servPct },
//     porMes: { rep: number[12]; bien: number[12]; serv: number[12] },
//   }

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";

dayjs.extend(isoWeek);

type Tipo = "all" | "rep" | "bien" | "serv";

function rango(modo: string, anio: number, mes: number | null, sem: number | null): { desde: Date; hasta: Date } {
  if (modo === "mes" && mes != null) {
    const desde = dayjs(`${anio}-${String(mes).padStart(2, "0")}-01`).startOf("month").toDate();
    const hasta = dayjs(desde).add(1, "month").toDate();
    return { desde, hasta };
  }
  if (modo === "sem" && sem != null) {
    const desde = dayjs(`${anio}-01-04`).startOf("isoWeek").add(sem - 1, "week").toDate();
    const hasta = dayjs(desde).add(7, "day").toDate();
    return { desde, hasta };
  }
  const desde = dayjs(`${anio}-01-01`).startOf("year").toDate();
  const hasta = dayjs(desde).add(1, "year").toDate();
  return { desde, hasta };
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

    const { desde, hasta } = rango(modo, anio, mes, sem);
    const inicioAnio = dayjs(`${anio}-01-01`).startOf("year").toDate();
    const finAnio = dayjs(`${anio + 1}-01-01`).startOf("year").toDate();

    // KPIs del rango: total + por tipo
    const tipos = tipo === "all" ? ["REP", "BIE", "SER"]
      : tipo === "rep" ? ["REP"]
      : tipo === "bien" ? ["BIE"]
      : ["SER"];

    const otsRango = await prisma.ordenTrabajo.findMany({
      where: {
        fecha_facturacion: { gte: desde, lt: hasta, not: null },
        tipo_codigo: { in: tipos },
      },
      select: {
        tipo_codigo: true,
        monto_cotizacion: true,
        moneda_cotizacion_codigo: true,
      },
    });

    let total = 0;
    let rep = 0; let bien = 0; let serv = 0;
    const monedaCount: Record<string, number> = {};
    for (const ot of otsRango) {
      const m = Number(ot.monto_cotizacion ?? 0);
      if (!Number.isFinite(m) || m <= 0) continue;
      total += m;
      if (ot.tipo_codigo === "REP") rep += m;
      else if (ot.tipo_codigo === "BIE") bien += m;
      else if (ot.tipo_codigo === "SER") serv += m;
      const mc = ot.moneda_cotizacion_codigo ?? "USD";
      monedaCount[mc] = (monedaCount[mc] ?? 0) + 1;
    }
    const moneda = Object.entries(monedaCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";
    const repPct = total > 0 ? (rep / total) * 100 : 0;
    const bienPct = total > 0 ? (bien / total) * 100 : 0;
    const servPct = total > 0 ? (serv / total) * 100 : 0;

    // Por mes (12 valores) — del año, ignora modo
    const otsAnio = await prisma.ordenTrabajo.findMany({
      where: {
        fecha_facturacion: { gte: inicioAnio, lt: finAnio, not: null },
        tipo_codigo: { in: ["REP", "BIE", "SER"] },
      },
      select: { fecha_facturacion: true, tipo_codigo: true, monto_cotizacion: true },
    });
    const porMes = { rep: Array(12).fill(0), bien: Array(12).fill(0), serv: Array(12).fill(0) };
    for (const ot of otsAnio) {
      if (!ot.fecha_facturacion) continue;
      const m = dayjs(ot.fecha_facturacion).month();
      const monto = Number(ot.monto_cotizacion ?? 0);
      if (!Number.isFinite(monto) || monto <= 0) continue;
      if (ot.tipo_codigo === "REP") porMes.rep[m] += monto;
      else if (ot.tipo_codigo === "BIE") porMes.bien[m] += monto;
      else if (ot.tipo_codigo === "SER") porMes.serv[m] += monto;
    }

    return NextResponse.json({
      kpis: { total, rep, bien, serv, moneda, repPct, bienPct, servPct },
      porMes,
      meta: { modo, anio, mes, sem, tipo },
    });
  } catch (e) {
    console.error("GET /api/dashboard/logistica/facturacion error:", e);
    return NextResponse.json({ error: "Error al obtener datos" }, { status: 500 });
  }
}
