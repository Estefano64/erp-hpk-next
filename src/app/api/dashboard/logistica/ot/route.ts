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
      avanceMes: { entregadasArmado, despachadas, facturadas },
      meta: { modo, anio, mes, sem },
    });
  } catch (e) {
    console.error("GET /api/dashboard/logistica/ot error:", e);
    return NextResponse.json({ error: "Error al obtener datos" }, { status: 500 });
  }
}
