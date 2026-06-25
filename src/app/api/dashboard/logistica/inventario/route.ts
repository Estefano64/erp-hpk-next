// GET /api/dashboard/logistica/inventario
//
// Agregados de Inventario (catalogados + no-catalogados) para el dashboard
// de Logística — Fase 4.
//
// Query params:
//   ?modo=anio|mes|sem            obligatorio
//   ?anio=2026                     obligatorio
//   ?mes=6                         obligatorio cuando modo=mes
//   ?sem=23                        obligatorio cuando modo=sem
//   ?cat=all|cat|nocat             default all (cat = catalogados; nocat = no catalogados)
//   ?unidad=np|cant                default np (np = NP únicos; cant = cantidad)
//
// Respuesta:
//   {
//     kpis: {
//       stock,            // según unidad: NP únicos o cantidad total
//       valorizacion,     // SUM(stock_actual × precio) — solo aplica a catalogados
//       ingresos,         // monto $ del rango (solo catalogados; no-cat no tiene precio)
//       ingresosQ,        // cantidad de NP o piezas según unidad
//       salidas,
//       salidasQ,
//       moneda,
//     },
//     porMesValorizacion: number[12], // snapshot al cierre de cada mes (aproximado)
//     porMesIngresos: number[12],     // monto de ENTRADAs por mes
//     porMesSalidas: number[12],      // monto de SALIDAs por mes
//     topProductos: { codigo, descripcion, salidaQ, salidaMonto }[],
//   }
//
// Notas:
//   - Stock actual es siempre "ahora" (no históricamente). Los KPIs ingresos/
//     salidas SÍ usan el rango.
//   - "Valorización mensual" es una aproximación: stock_actual_HOY × precio
//     dividido en una proyección por meses. La valorización histórica exacta
//     requeriría snapshots — no los tenemos. Solo se grafica el rango activo
//     como referencia plana.
//   - Sin filtro de cat: combina catalogados (con precio) y no-cat (sin precio).
//   - El precio del MovimientoInventario tiene snapshot; si no, cae a material.precio.

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";

dayjs.extend(isoWeek);

type CatFilter = "all" | "cat" | "nocat";
type UnidadFilter = "np" | "cant";

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
    const cat = (sp.get("cat") as CatFilter) ?? "all";
    const unidad = (sp.get("unidad") as UnidadFilter) ?? "np";

    if (!Number.isFinite(anio) || anio < 2020 || anio > 2100) {
      return NextResponse.json({ error: "anio inválido" }, { status: 400 });
    }

    const { desde, hasta } = rango(modo, anio, mes, sem);
    const inicioAnio = dayjs(`${anio}-01-01`).startOf("year").toDate();
    const finAnio = dayjs(`${anio + 1}-01-01`).startOf("year").toDate();

    // ── KPIs de stock + valorización (siempre "ahora") ─────────────────
    let stock = 0;
    let valorizacion = 0;
    let moneda = "USD";

    if (cat === "all" || cat === "cat") {
      const materiales = await prisma.material.findMany({
        where: { activo: true },
        select: { material_id: true, stock_actual: true, precio: true, moneda_codigo: true },
      });
      const monedaCount: Record<string, number> = {};
      for (const m of materiales) {
        const s = Number(m.stock_actual ?? 0);
        if (!Number.isFinite(s) || s <= 0) continue;
        if (unidad === "np") stock += 1; else stock += s;
        const p = Number(m.precio ?? 0);
        if (Number.isFinite(p) && p > 0) {
          valorizacion += s * p;
          const mc = m.moneda_codigo ?? "USD";
          monedaCount[mc] = (monedaCount[mc] ?? 0) + 1;
        }
      }
      moneda = Object.entries(monedaCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";
    }
    if (cat === "all" || cat === "nocat") {
      const noCat = await prisma.materialNoCatalogado.findMany({
        where: { activo: true },
        select: { id: true, stock_actual: true },
      });
      for (const m of noCat) {
        const s = Number(m.stock_actual ?? 0);
        if (!Number.isFinite(s) || s <= 0) continue;
        if (unidad === "np") stock += 1; else stock += s;
        // no-cat no tiene precio → no aporta a valorización
      }
    }

    // ── Ingresos / salidas del rango ───────────────────────────────────
    let ingresos = 0;
    let ingresosQ = 0;
    let salidas = 0;
    let salidasQ = 0;

    if (cat === "all" || cat === "cat") {
      // Catalogados: movimientos del rango con precio snapshot o catálogo
      const movs = await prisma.movimientoInventario.findMany({
        where: { fecha_movimiento: { gte: desde, lt: hasta } },
        select: {
          material_id: true,
          tipo_movimiento: true,
          cantidad: true,
          precio_unitario: true,
          material: { select: { precio: true } },
        },
      });
      const setIngresoNPs = new Set<number>();
      const setSalidaNPs = new Set<number>();
      for (const m of movs) {
        const c = Number(m.cantidad ?? 0);
        if (!Number.isFinite(c) || c <= 0) continue;
        const p = Number(m.precio_unitario ?? m.material?.precio ?? 0);
        const monto = Number.isFinite(p) ? c * p : 0;
        if (m.tipo_movimiento === "ENTRADA") {
          ingresos += monto;
          if (unidad === "np") setIngresoNPs.add(m.material_id); else ingresosQ += c;
        } else if (m.tipo_movimiento === "SALIDA") {
          salidas += monto;
          if (unidad === "np") setSalidaNPs.add(m.material_id); else salidasQ += c;
        }
      }
      if (unidad === "np") { ingresosQ += setIngresoNPs.size; salidasQ += setSalidaNPs.size; }
    }
    if (cat === "all" || cat === "nocat") {
      const movsNc = await prisma.movimientoNoCatalogado.findMany({
        where: { fecha_movimiento: { gte: desde, lt: hasta } },
        select: { material_no_cat_id: true, tipo_movimiento: true, cantidad: true },
      });
      const setIngresoNc = new Set<number>();
      const setSalidaNc = new Set<number>();
      for (const m of movsNc) {
        const c = Number(m.cantidad ?? 0);
        if (!Number.isFinite(c) || c <= 0) continue;
        if (m.tipo_movimiento === "ENTRADA") {
          if (unidad === "np") setIngresoNc.add(m.material_no_cat_id); else ingresosQ += c;
        } else if (m.tipo_movimiento === "SALIDA") {
          if (unidad === "np") setSalidaNc.add(m.material_no_cat_id); else salidasQ += c;
        }
      }
      if (unidad === "np") { ingresosQ += setIngresoNc.size; salidasQ += setSalidaNc.size; }
    }

    // ── Por mes (12 valores) — del año, ignora modo ────────────────────
    const porMesIngresos: number[] = Array(12).fill(0);
    const porMesSalidas: number[] = Array(12).fill(0);
    if (cat === "all" || cat === "cat") {
      const movsAnio = await prisma.movimientoInventario.findMany({
        where: { fecha_movimiento: { gte: inicioAnio, lt: finAnio } },
        select: {
          tipo_movimiento: true, cantidad: true, fecha_movimiento: true,
          precio_unitario: true, material: { select: { precio: true } },
        },
      });
      for (const m of movsAnio) {
        const mi = dayjs(m.fecha_movimiento).month();
        const c = Number(m.cantidad ?? 0);
        const p = Number(m.precio_unitario ?? m.material?.precio ?? 0);
        if (!Number.isFinite(c) || c <= 0) continue;
        const monto = Number.isFinite(p) ? c * p : 0;
        if (m.tipo_movimiento === "ENTRADA") porMesIngresos[mi] += monto;
        else if (m.tipo_movimiento === "SALIDA") porMesSalidas[mi] += monto;
      }
    }
    // Valorización mensual: aproximación plana (stock × precio actual) por
    // cada mes que ya ocurrió. Más sofisticado requeriría snapshots históricos.
    const porMesValorizacion: number[] = Array(12).fill(0);
    const mesActual = dayjs().year() === anio ? dayjs().month() : 11;
    for (let i = 0; i <= Math.min(mesActual, 11); i++) {
      porMesValorizacion[i] = valorizacion;
    }

    // ── Top 10 productos más movidos por cantidad de SALIDA ────────────
    const topProductos: { codigo: string; np: string | null; descripcion: string; salidaQ: number; salidaMonto: number }[] = [];
    if (cat === "all" || cat === "cat") {
      const movsSalida = await prisma.movimientoInventario.findMany({
        where: { tipo_movimiento: "SALIDA", fecha_movimiento: { gte: desde, lt: hasta } },
        select: {
          material_id: true,
          cantidad: true,
          precio_unitario: true,
          material: { select: { codigo: true, descripcion: true, np: true, precio: true } },
        },
      });
      const porMat: Record<number, { codigo: string; np: string | null; descripcion: string; q: number; monto: number }> = {};
      for (const m of movsSalida) {
        if (!m.material) continue;
        const c = Number(m.cantidad ?? 0);
        if (!Number.isFinite(c) || c <= 0) continue;
        const p = Number(m.precio_unitario ?? m.material.precio ?? 0);
        const monto = Number.isFinite(p) ? c * p : 0;
        if (!porMat[m.material_id]) {
          porMat[m.material_id] = {
            codigo: m.material.codigo,
            np: m.material.np ?? null,
            descripcion: m.material.descripcion ?? "",
            q: 0, monto: 0,
          };
        }
        porMat[m.material_id].q += c;
        porMat[m.material_id].monto += monto;
      }
      Object.values(porMat).forEach((v) => {
        topProductos.push({ codigo: v.codigo, np: v.np, descripcion: v.descripcion, salidaQ: v.q, salidaMonto: v.monto });
      });
    }
    topProductos.sort((a, b) => b.salidaQ - a.salidaQ);
    const top10 = topProductos.slice(0, 10);

    return NextResponse.json({
      kpis: { stock, valorizacion, ingresos, ingresosQ, salidas, salidasQ, moneda },
      porMesValorizacion,
      porMesIngresos,
      porMesSalidas,
      topProductos: top10,
      meta: { modo, anio, mes, sem, cat, unidad },
    });
  } catch (e) {
    console.error("GET /api/dashboard/logistica/inventario error:", e);
    return NextResponse.json({ error: "Error al obtener datos" }, { status: 500 });
  }
}
