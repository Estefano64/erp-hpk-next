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
// Respuesta (montos SIEMPRE separados por moneda {usd, sol} — un material en
// soles nunca se suma con uno en dólares):
//   {
//     kpis: {
//       stock,                       // según unidad: NP únicos o cantidad total
//       valorizacion: { usd, sol },  // SUM(stock_actual × precio) — solo catalogados
//       ingresos: { usd, sol },      // monto del rango (solo catalogados; no-cat no tiene precio)
//       ingresosQ,                   // cantidad de NP o piezas según unidad
//       salidas: { usd, sol },
//       salidasQ,
//     },
//     porMesValorizacion: { usd: number[12], sol: number[12] }, // snapshot aprox.
//     porMesIngresos: { usd: number[12], sol: number[12] },
//     porMesSalidas: { usd: number[12], sol: number[12] },
//     topProductos: { codigo, np, descripcion, salidaQ, salidaMonto, moneda }[],
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
//   - El precio del MovimientoInventario tiene snapshot (precio_unitario +
//     moneda); si no, cae a material.precio/material.moneda_codigo.
//   - Moneda: SOL/PEN → bucket "sol"; el resto (USD o null) → "usd".

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import dayjs from "dayjs";
import { rangoUTC, anioUTC, montoCero } from "@/lib/dashboard-logistica";

type CatFilter = "all" | "cat" | "nocat";
type UnidadFilter = "np" | "cant";

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

    const { desde, hasta } = rangoUTC(modo, anio, mes, sem);
    const { inicio: inicioAnio, fin: finAnio } = anioUTC(anio);

    // Todos los agregados se calculan en SQL y se lanzan en un solo
    // Promise.all. Los montos se agrupan por bucket de moneda (USD/SOL) en
    // el propio SQL — nunca se suman monedas distintas.
    const wantCat = cat === "all" || cat === "cat";
    const wantNoCat = cat === "all" || cat === "nocat";

    type MatAggRow = { nps: number; cant: number; val_usd: number; val_sol: number };
    type RangoRow = { tipo: string; mon: string; monto: number; cant: number; nps: number };
    type RangoNcRow = { tipo: string; cant: number; nps: number };
    type PorMesRow = { mes: number; tipo: string; mon: string; monto: number };
    type TopRow = { codigo: string; np: string | null; descripcion: string; salidaQ: number; salidaMonto: number; moneda: string | null };

    const [matAgg, ncAgg, rangoCat, rangoNc, porMesRows, topRows] = await Promise.all([
      // ── KPIs de stock + valorización (siempre "ahora") ───────────────
      wantCat
        ? prisma.$queryRaw<MatAggRow[]>`
            SELECT COUNT(*) FILTER (WHERE stock_actual > 0)::int AS nps,
                   COALESCE(SUM(stock_actual) FILTER (WHERE stock_actual > 0), 0)::float AS cant,
                   COALESCE(SUM(stock_actual * precio) FILTER (
                     WHERE stock_actual > 0 AND precio > 0
                       AND COALESCE(moneda_codigo, 'USD') NOT IN ('SOL', 'PEN')), 0)::float AS val_usd,
                   COALESCE(SUM(stock_actual * precio) FILTER (
                     WHERE stock_actual > 0 AND precio > 0
                       AND COALESCE(moneda_codigo, 'USD') IN ('SOL', 'PEN')), 0)::float AS val_sol
            FROM material
            WHERE activo = true
          `
        : Promise.resolve([] as MatAggRow[]),
      wantNoCat
        ? prisma.materialNoCatalogado.aggregate({
            where: { activo: true, stock_actual: { gt: 0 } },
            _count: { _all: true },
            _sum: { stock_actual: true },
          })
        : Promise.resolve(null),
      // ── Ingresos / salidas del rango (catalogados, con precio snapshot
      //    del movimiento o precio de catálogo), por bucket de moneda ─────
      wantCat
        ? prisma.$queryRaw<RangoRow[]>`
            SELECT m.tipo_movimiento::text AS tipo,
                   CASE WHEN COALESCE(m.moneda, mat.moneda_codigo, 'USD') IN ('SOL', 'PEN')
                        THEN 'SOL' ELSE 'USD' END AS mon,
                   COALESCE(SUM(m.cantidad * COALESCE(m.precio_unitario, mat.precio, 0)), 0)::float AS monto,
                   COALESCE(SUM(m.cantidad), 0)::float AS cant,
                   COUNT(DISTINCT m.material_id)::int AS nps
            FROM movimientos_inventario m
            LEFT JOIN material mat ON mat.material_id = m.material_id
            WHERE m.fecha_movimiento >= ${desde} AND m.fecha_movimiento < ${hasta}
              AND m.cantidad > 0
            GROUP BY 1, 2
          `
        : Promise.resolve([] as RangoRow[]),
      wantNoCat
        ? prisma.$queryRaw<RangoNcRow[]>`
            SELECT tipo_movimiento::text AS tipo,
                   COALESCE(SUM(cantidad), 0)::float AS cant,
                   COUNT(DISTINCT material_no_cat_id)::int AS nps
            FROM movimiento_no_catalogado
            WHERE fecha_movimiento >= ${desde} AND fecha_movimiento < ${hasta}
              AND cantidad > 0
            GROUP BY 1
          `
        : Promise.resolve([] as RangoNcRow[]),
      // ── Por mes (12 valores) — del año, ignora modo ───────────────────
      wantCat
        ? prisma.$queryRaw<PorMesRow[]>`
            SELECT EXTRACT(MONTH FROM m.fecha_movimiento)::int AS mes,
                   m.tipo_movimiento::text AS tipo,
                   CASE WHEN COALESCE(m.moneda, mat.moneda_codigo, 'USD') IN ('SOL', 'PEN')
                        THEN 'SOL' ELSE 'USD' END AS mon,
                   COALESCE(SUM(m.cantidad * COALESCE(m.precio_unitario, mat.precio, 0)), 0)::float AS monto
            FROM movimientos_inventario m
            LEFT JOIN material mat ON mat.material_id = m.material_id
            WHERE m.fecha_movimiento >= ${inicioAnio} AND m.fecha_movimiento < ${finAnio}
              AND m.cantidad > 0
            GROUP BY 1, 2, 3
          `
        : Promise.resolve([] as PorMesRow[]),
      // ── Top 10 productos más movidos por cantidad de SALIDA ──────────
      wantCat
        ? prisma.$queryRaw<TopRow[]>`
            SELECT mat.codigo,
                   mat.np,
                   mat.descripcion,
                   COALESCE(SUM(m.cantidad), 0)::float AS "salidaQ",
                   COALESCE(SUM(m.cantidad * COALESCE(m.precio_unitario, mat.precio, 0)), 0)::float AS "salidaMonto",
                   MODE() WITHIN GROUP (ORDER BY COALESCE(m.moneda, mat.moneda_codigo, 'USD')) AS moneda
            FROM movimientos_inventario m
            JOIN material mat ON mat.material_id = m.material_id
            WHERE m.tipo_movimiento = 'SALIDA'
              AND m.fecha_movimiento >= ${desde} AND m.fecha_movimiento < ${hasta}
              AND m.cantidad > 0
            GROUP BY mat.material_id, mat.codigo, mat.np, mat.descripcion
            ORDER BY "salidaQ" DESC
            LIMIT 10
          `
        : Promise.resolve([] as TopRow[]),
    ]);

    let stock = 0;
    const valorizacion = montoCero();
    if (matAgg[0]) {
      stock += unidad === "np" ? matAgg[0].nps : matAgg[0].cant;
      valorizacion.usd = matAgg[0].val_usd;
      valorizacion.sol = matAgg[0].val_sol;
    }
    if (ncAgg) {
      // no-cat no tiene precio → no aporta a valorización
      stock += unidad === "np" ? ncAgg._count._all : Number(ncAgg._sum.stock_actual ?? 0);
    }

    const ingresos = montoCero();
    const salidas = montoCero();
    let ingresosQ = 0;
    let salidasQ = 0;
    for (const r of rangoCat) {
      const bucket = r.tipo === "ENTRADA" ? ingresos : r.tipo === "SALIDA" ? salidas : null;
      if (!bucket) continue;
      if (r.mon === "SOL") bucket.sol += r.monto;
      else bucket.usd += r.monto;
      // Un material tiene una sola moneda → los nps de cada bucket no se repiten.
      if (r.tipo === "ENTRADA") ingresosQ += unidad === "np" ? r.nps : r.cant;
      else salidasQ += unidad === "np" ? r.nps : r.cant;
    }
    for (const r of rangoNc) {
      if (r.tipo === "ENTRADA") ingresosQ += unidad === "np" ? r.nps : r.cant;
      else if (r.tipo === "SALIDA") salidasQ += unidad === "np" ? r.nps : r.cant;
    }

    const mesesVacios = () => ({ usd: Array(12).fill(0) as number[], sol: Array(12).fill(0) as number[] });
    const porMesIngresos = mesesVacios();
    const porMesSalidas = mesesVacios();
    for (const r of porMesRows) {
      const target = r.tipo === "ENTRADA" ? porMesIngresos : r.tipo === "SALIDA" ? porMesSalidas : null;
      if (!target) continue;
      if (r.mon === "SOL") target.sol[r.mes - 1] += r.monto;
      else target.usd[r.mes - 1] += r.monto;
    }
    // Valorización mensual: aproximación plana (stock × precio actual) por
    // cada mes que ya ocurrió. Más sofisticado requeriría snapshots históricos.
    const porMesValorizacion = mesesVacios();
    const mesActual = dayjs().year() === anio ? dayjs().month() : 11;
    for (let i = 0; i <= Math.min(mesActual, 11); i++) {
      porMesValorizacion.usd[i] = valorizacion.usd;
      porMesValorizacion.sol[i] = valorizacion.sol;
    }

    const top10 = topRows.map((t) => ({
      codigo: t.codigo, np: t.np, descripcion: t.descripcion,
      salidaQ: t.salidaQ, salidaMonto: t.salidaMonto, moneda: t.moneda ?? "USD",
    }));

    return NextResponse.json({
      kpis: { stock, valorizacion, ingresos, ingresosQ, salidas, salidasQ },
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
