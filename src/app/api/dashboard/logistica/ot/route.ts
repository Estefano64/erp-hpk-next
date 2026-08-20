// GET /api/dashboard/logistica/ot
//
// Agregados de Órdenes de Trabajo (externas) para el dashboard de Logística
// — Fase 5.
//
// Query params:
//   ?modo=anio|mes|sem   obligatorio
//   ?anio=2026            obligatorio
//   ?mes=6                obligatorio cuando modo=mes
//   ?sem=23               obligatorio cuando modo=sem
//
// Respuesta:
//   {
//     estadoAlmacen: { completas: number; incompletas: number },
//     enAlmacen: { total, aging: number[5], promedio, mediana },
//       // OTs abiertas recibidas sin despachar (stock actual de almacén),
//       // antigüedad en días desde recepción: [0-30, 31-60, 61-90, 91-180, +180]
//     avanceMes: { entregadasArmado: number; despachadas: number; facturadas: number },
//   }
//
// Reglas:
//   - "OT abiertas": ot_status="Abierta". "Completas" en almacén =
//     recursos_status = "Recursos completos"; "incompletas" = el resto activo.
//   - "En almacén" es la foto de HOY (no usa el rango de fechas), igual que
//     estadoAlmacen.
//   - "Avance del mes" cuenta OTs cuyos hitos (fin real / despacho / facturación)
//     cayeron en el rango activo.

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import dayjs from "dayjs";
import { rangoUTC, mediana } from "@/lib/dashboard-logistica";

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const sp = req.nextUrl.searchParams;
    const modo = sp.get("modo") ?? "mes";
    const anio = Number(sp.get("anio") ?? dayjs().year());
    const mes = sp.get("mes") ? Number(sp.get("mes")) : null;
    const sem = sp.get("sem") ? Number(sp.get("sem")) : null;

    if (!Number.isFinite(anio) || anio < 2020 || anio > 2100) {
      return NextResponse.json({ error: "anio inválido" }, { status: 400 });
    }

    const { desde, hasta } = rangoUTC(modo, anio, mes, sem);

    // ── Estado en almacén: OT abiertas, completas vs incompletas ────────
    const [completas, abiertasTotal] = await Promise.all([
      prisma.ordenTrabajo.count({
        where: {
          activo: true,
          ot_status_codigo: "Abierta",
          recursos_status_codigo: "Recursos completos",
        },
      }),
      prisma.ordenTrabajo.count({
        where: { activo: true, ot_status_codigo: "Abierta" },
      }),
    ]);
    const incompletas = Math.max(0, abiertasTotal - completas);

    // ── OTs en almacén AHORA (stock): recibidas y sin despachar ─────────
    // Reemplaza al viejo "tiempo en almacén de despachadas", que dependía de
    // que hubiera despachos en el rango (en prod solo jun/jul 2026 tienen —
    // el chart salía vacío casi siempre). Esto es la foto actual, igual que
    // el card de estado: independiente del filtro de fechas. Solo Abiertas —
    // hay ~2,900 OTs Cerradas históricas (BDU) sin fecha_despacho registrada
    // que NO son stock real.
    const agingRows = await prisma.$queryRaw<Array<{ d: number }>>`
      SELECT (CURRENT_DATE - fecha_recepcion)::int AS d
      FROM orden_trabajo
      WHERE activo = true AND ot_status_codigo = 'Abierta'
        AND fecha_recepcion IS NOT NULL AND fecha_despacho IS NULL`;
    const aging = [0, 0, 0, 0, 0]; // [0-30, 31-60, 61-90, 91-180, +180]
    const diasAlmacen: number[] = [];
    for (const { d } of agingRows) {
      if (d < 0) continue;
      diasAlmacen.push(d);
      if (d <= 30) aging[0]++;
      else if (d <= 60) aging[1]++;
      else if (d <= 90) aging[2]++;
      else if (d <= 180) aging[3]++;
      else aging[4]++;
    }
    const enAlmacen = {
      total: diasAlmacen.length,
      aging,
      promedio: diasAlmacen.length > 0
        ? diasAlmacen.reduce((a, b) => a + b, 0) / diasAlmacen.length : 0,
      mediana: mediana(diasAlmacen),
    };

    // ── Avance del mes: hitos del rango ────────────────────────────────
    // OT externa no tiene `fecha_fin_real` — usamos `fecha_entrega` (entrega
    // final del componente) como proxy de "entregadas a armado/final".
    // ── Tiempos del ciclo logístico de la OT (pedido 2026-08-20) ────────
    // Tres indicadores, cada uno {promedio, mediana, n} en días. El rango se
    // aplica sobre la fecha de CIERRE de cada intervalo (misma lógica que los
    // hitos de "Avance del rango").
    const stats = (dias: number[]) => ({
      promedio: dias.length > 0 ? dias.reduce((a, b) => a + b, 0) / dias.length : 0,
      mediana: mediana(dias),
      n: dias.length,
    });
    const soloPositivos = (rows: Array<{ d: number | null }>) =>
      rows.map((r) => r.d).filter((d): d is number => d != null && d >= 0);

    // (a) OT almacenada: desde que llegó el ÚLTIMO repuesto a HPK hasta la
    //     ÚLTIMA entrega al trabajador (max fecha_salida_almacen). Solo OTs
    //     con todos sus repuestos ya entregados; servicios y anulados fuera.
    //     La llegada se lee de compras.fecha_entrega_real (la setea la
    //     RECEPCIÓN) — NO de ot_repuestos.fecha_entrega_real, porque el
    //     despacho al técnico la pisa con la fecha de despacho y el
    //     indicador daría siempre 0.
    const almacenadaRows = await prisma.$queryRaw<Array<{ d: number | null }>>`
      SELECT (MAX(r.fecha_salida_almacen) - MAX(c.fecha_entrega_real))::int AS d
      FROM ot_repuestos r
      LEFT JOIN compras c ON c.id = r.po_id
      WHERE r.ot_id IS NOT NULL
        AND (r.status_requerimiento_codigo IS NULL OR r.status_requerimiento_codigo NOT IN ('ANULADO', 'DESAPROBADO'))
        AND (r.tipo_codigo IS NULL OR r.tipo_codigo <> 'SER')
      GROUP BY r.ot_id
      HAVING COUNT(*) FILTER (WHERE r.fecha_salida_almacen IS NULL) = 0
        AND MAX(c.fecha_entrega_real) IS NOT NULL
        AND MAX(r.fecha_salida_almacen) >= ${desde} AND MAX(r.fecha_salida_almacen) < ${hasta}`;

    // (b) Tiempo de armado: desde la guía de remisión de despacho del
    //     componente (fecha_despacho, salida del taller) hasta el ingreso de
    //     la guía firmada por el almacén de mina — Hagemsa/Ransa —
    //     (fecha_entrega, la setea el flujo de despacho a mina).
    const armadoRows = await prisma.$queryRaw<Array<{ d: number | null }>>`
      SELECT (fecha_entrega - fecha_despacho)::int AS d
      FROM orden_trabajo
      WHERE fecha_entrega >= ${desde} AND fecha_entrega < ${hasta}
        AND fecha_despacho IS NOT NULL`;

    // (c) Tiempo de facturación: desde la guía de remisión de despacho
    //     (fecha_despacho) hasta la fecha de facturación de la OT.
    const facturacionRows = await prisma.$queryRaw<Array<{ d: number | null }>>`
      SELECT (fecha_facturacion - fecha_despacho)::int AS d
      FROM orden_trabajo
      WHERE fecha_facturacion >= ${desde} AND fecha_facturacion < ${hasta}
        AND fecha_despacho IS NOT NULL`;

    const tiempos = {
      almacenada: stats(soloPositivos(almacenadaRows)),
      armado: stats(soloPositivos(armadoRows)),
      facturacion: stats(soloPositivos(facturacionRows)),
    };

    const [entregadas, despachadas, facturadas] = await Promise.all([
      prisma.ordenTrabajo.count({
        where: { fecha_entrega: { gte: desde, lt: hasta, not: null } },
      }),
      prisma.ordenTrabajo.count({
        where: { fecha_despacho: { gte: desde, lt: hasta, not: null } },
      }),
      prisma.ordenTrabajo.count({
        where: { fecha_facturacion: { gte: desde, lt: hasta, not: null } },
      }),
    ]);
    const entregadasArmado = entregadas;

    return NextResponse.json({
      estadoAlmacen: { completas, incompletas },
      enAlmacen,
      tiempos,
      avanceMes: { entregadasArmado, despachadas, facturadas },
      meta: { modo, anio, mes, sem },
    });
  } catch (e) {
    console.error("GET /api/dashboard/logistica/ot error:", e);
    return NextResponse.json({ error: "Error al obtener datos" }, { status: 500 });
  }
}
