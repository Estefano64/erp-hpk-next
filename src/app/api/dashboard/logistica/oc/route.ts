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
//     kpis: { colocadas, costoTotal, ticketPromedio, moneda },
//     estado: { recibidas, enProceso, pendientes, anuladas },
//     topProveedores: [{ nombre, monto }, ...],
//     porMesCantidad: number[12],
//     porMesCosto: number[12],
//     porTiempo: number[5],   // [Mismo día, 1-2d, 3-5d, 6-10d, +10d] desde apr. del primer req hasta crear OC
//     tiempoPromedio: number, // en días, desde aprob. promedio del primer req hasta crear OC
//   }
//
// Notas:
//   - "Recibidas" = ENTREGADO | COMPLETO; "En proceso" = PROCESO | INCOMPLETO;
//     "Pendientes" = PEND_OC; "Anuladas" = ANULADO.
//   - Filtro por tipo: si tipo=rep, solo OCs que tienen items OTRepuesto MAC/CAD;
//     serv → items SER; all → todas las OCs.
//   - "Costo total" se reporta como suma de Compra.total (moneda dominante).
//   - Tiempo de colocación = Compra.fecha_solicitud - max(req.fecha_aprobacion) del OTRepuesto vinculado.

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";

dayjs.extend(isoWeek);

type Tipo = "all" | "rep" | "serv";

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

    const { desde, hasta } = rango(modo, anio, mes, sem);
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
        proveedor: { select: { razon_social: true } },
        ot_repuestos: {
          select: { fecha_aprobacion: true },
          orderBy: { fecha_aprobacion: "desc" },
          take: 1, // la fecha de aprobación más reciente del req vinculado
        },
      },
    });

    // KPIs
    const colocadas = compras.length;
    let costoTotal = 0;
    for (const c of compras) {
      const t = Number(c.total ?? 0);
      if (Number.isFinite(t)) costoTotal += t;
    }
    const ticketPromedio = colocadas > 0 ? costoTotal / colocadas : 0;
    // Moneda dominante (la que más se repite)
    const monedaCount: Record<string, number> = {};
    for (const c of compras) {
      const m = c.moneda_codigo ?? "USD";
      monedaCount[m] = (monedaCount[m] ?? 0) + 1;
    }
    const moneda = Object.entries(monedaCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";

    // Estado
    const estado = { recibidas: 0, enProceso: 0, pendientes: 0, anuladas: 0 };
    for (const c of compras) {
      const s = c.status_oc_codigo ?? "";
      if (s === "ENTREGADO" || s === "COMPLETO") estado.recibidas++;
      else if (s === "PROCESO" || s === "INCOMPLETO") estado.enProceso++;
      else if (s === "PEND_OC") estado.pendientes++;
      else if (s === "ANULADO") estado.anuladas++;
    }

    // Top 5 proveedores por monto
    const provTotales: Record<string, number> = {};
    for (const c of compras) {
      const nombre = c.proveedor?.razon_social ?? "(sin proveedor)";
      const t = Number(c.total ?? 0);
      if (!Number.isFinite(t)) continue;
      provTotales[nombre] = (provTotales[nombre] ?? 0) + t;
    }
    const topProveedores = Object.entries(provTotales)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([nombre, monto]) => ({ nombre, monto }));

    // ── Por mes (12 valores) — del año, ignora modo ──────────────────
    const comprasAnio = await prisma.compra.findMany({
      where: {
        ...tipoWhere,
        fecha_solicitud: {
          gte: dayjs(`${anio}-01-01`).startOf("year").toDate(),
          lt: dayjs(`${anio + 1}-01-01`).startOf("year").toDate(),
        },
      },
      select: { fecha_solicitud: true, total: true },
    });
    const porMesCantidad: number[] = Array(12).fill(0);
    const porMesCosto: number[] = Array(12).fill(0);
    for (const c of comprasAnio) {
      const m = dayjs(c.fecha_solicitud).month();
      porMesCantidad[m]++;
      const t = Number(c.total ?? 0);
      if (Number.isFinite(t)) porMesCosto[m] += t;
    }

    // ── Tiempo para colocar OC (distribución + promedio) ──────────────
    // Para cada compra: días entre fecha_aprobacion del req más reciente y
    // fecha_solicitud de la compra. Si no hay fecha_aprobacion → se omite.
    const porTiempo: number[] = [0, 0, 0, 0, 0]; // [mismo día, 1-2, 3-5, 6-10, +10]
    let sumDias = 0;
    let muestras = 0;
    for (const c of compras) {
      const aprob = c.ot_repuestos[0]?.fecha_aprobacion;
      if (!aprob) continue;
      const dias = dayjs(c.fecha_solicitud).diff(dayjs(aprob), "day");
      if (dias < 0) continue;
      sumDias += dias;
      muestras++;
      if (dias === 0) porTiempo[0]++;
      else if (dias <= 2) porTiempo[1]++;
      else if (dias <= 5) porTiempo[2]++;
      else if (dias <= 10) porTiempo[3]++;
      else porTiempo[4]++;
    }
    const tiempoPromedio = muestras > 0 ? sumDias / muestras : 0;

    return NextResponse.json({
      kpis: { colocadas, costoTotal, ticketPromedio, moneda },
      estado,
      topProveedores,
      porMesCantidad,
      porMesCosto,
      porTiempo,
      tiempoPromedio,
      meta: { modo, anio, mes, sem, tipo },
    });
  } catch (e) {
    console.error("GET /api/dashboard/logistica/oc error:", e);
    return NextResponse.json({ error: "Error al obtener datos" }, { status: 500 });
  }
}
