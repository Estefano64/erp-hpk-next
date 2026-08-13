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
//     tiempoAlmacen: number[5],  // OT cerradas: días en almacén [1-3, 4-7, 8-14, 15-30, +30]
//     avanceMes: { entregadasArmado: number; despachadas: number; facturadas: number },
//   }
//
// Reglas:
//   - "OT abiertas": ot_status="Abierta". "Completas" en almacén =
//     recursos_status = "Recursos completos"; "incompletas" = el resto activo.
//   - "Tiempo en almacén" = fecha_despacho - fecha_recepcion en días, para OT
//     con ambos campos seteados y fecha_despacho dentro del rango activo.
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

    // ── Tiempo en almacén: días entre recepción y despacho ──────────────
    // De las OT con fecha_despacho en el rango activo.
    const tiempoAlmacen = [0, 0, 0, 0, 0]; // [1-3, 4-7, 8-14, 15-30, +30]
    const diasAlmacen: number[] = [];
    const otsDespachadas = await prisma.ordenTrabajo.findMany({
      where: {
        fecha_despacho: { gte: desde, lt: hasta, not: null },
        fecha_recepcion: { not: null },
      },
      select: { fecha_recepcion: true, fecha_despacho: true },
    });
    for (const ot of otsDespachadas) {
      if (!ot.fecha_recepcion || !ot.fecha_despacho) continue;
      const dias = dayjs(ot.fecha_despacho).diff(dayjs(ot.fecha_recepcion), "day");
      if (dias < 0) continue;
      diasAlmacen.push(dias);
      if (dias <= 3) tiempoAlmacen[0]++;
      else if (dias <= 7) tiempoAlmacen[1]++;
      else if (dias <= 14) tiempoAlmacen[2]++;
      else if (dias <= 30) tiempoAlmacen[3]++;
      else tiempoAlmacen[4]++;
    }
    const tiempoAlmacenPromedio = diasAlmacen.length > 0
      ? diasAlmacen.reduce((a, b) => a + b, 0) / diasAlmacen.length : 0;
    const tiempoAlmacenMediana = mediana(diasAlmacen);

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
      tiempoAlmacen,
      tiempoAlmacenPromedio,
      tiempoAlmacenMediana,
      avanceMes: { entregadasArmado, despachadas, facturadas },
      meta: { modo, anio, mes, sem },
    });
  } catch (e) {
    console.error("GET /api/dashboard/logistica/ot error:", e);
    return NextResponse.json({ error: "Error al obtener datos" }, { status: 500 });
  }
}
