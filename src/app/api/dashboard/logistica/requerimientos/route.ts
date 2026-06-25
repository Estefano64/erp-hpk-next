// GET /api/dashboard/logistica/requerimientos
//
// Agregados de requerimientos para el dashboard de Logística — Fase 2.
//
// Query params:
//   ?modo=anio|mes|sem            obligatorio
//   ?anio=2026                     obligatorio
//   ?mes=6                         obligatorio cuando modo=mes
//   ?sem=23                        obligatorio cuando modo=sem (ISO week)
//   ?vista=gen|item                default gen (gen = por nro_req único; item = por OTRepuesto)
//   ?tipo=all|rep|serv             default all (rep = MAC+CAD; serv = SER)
//
// Respuesta:
//   {
//     kpis: { emitidos, aprobados, enProceso, l1Label },
//     porMes: number[12],          // emitidos por mes del año
//     porSemana: { label, value }[], // emitidos por semana del mes (4-5 valores)
//     porOt: number[5],            // distribución: cuántas OTs tienen [1, 2, 3, 4, 5+] reqs/items
//     porTiempo: number[4],        // tiempo aprobación: [1-3d, 4-6d, 7-10d, +10d]
//   }
//
// Notas:
//   - "Emitidos" = items con status_req IN (SIN_APROBACION, APROBADO, ANULADO, DESAPROBADO).
//     BORRADOR queda fuera porque aún no se envió formalmente.
//   - "Aprobados" = status_req = APROBADO.
//   - "En proceso" = APROBADO + po_id IS NOT NULL + status_oc no entregada.
//   - Vista "gen" cuenta nro_req únicos; vista "item" cuenta OTRepuesto.

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";

dayjs.extend(isoWeek);

type Vista = "gen" | "item";
type Tipo = "all" | "rep" | "serv";

// Filtro por tipo_codigo: MAC y CAD = repuestos, SER = servicios.
function tipoCodigoFiltro(tipo: Tipo): string[] | null {
  if (tipo === "rep") return ["MAC", "CAD"];
  if (tipo === "serv") return ["SER"];
  return null; // all → sin filtro
}

// Resuelve el rango [desde, hasta) (intervalo semi-abierto) para el modo+anio+mes+sem.
function rango(modo: string, anio: number, mes: number | null, sem: number | null): { desde: Date; hasta: Date } {
  if (modo === "mes" && mes != null) {
    const desde = dayjs(`${anio}-${String(mes).padStart(2, "0")}-01`).startOf("month").toDate();
    const hasta = dayjs(desde).add(1, "month").toDate();
    return { desde, hasta };
  }
  if (modo === "sem" && sem != null) {
    // Semana ISO sem de anio: empieza lunes.
    const desde = dayjs(`${anio}-01-04`).startOf("isoWeek").add(sem - 1, "week").toDate();
    const hasta = dayjs(desde).add(7, "day").toDate();
    return { desde, hasta };
  }
  // modo=anio (default fallback)
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
    const vista = (sp.get("vista") as Vista) ?? "gen";
    const tipo = (sp.get("tipo") as Tipo) ?? "all";

    if (!Number.isFinite(anio) || anio < 2020 || anio > 2100) {
      return NextResponse.json({ error: "anio inválido" }, { status: 400 });
    }

    const { desde, hasta } = rango(modo, anio, mes, sem);
    const tipos = tipoCodigoFiltro(tipo);
    const tipoWhere = tipos ? { tipo_codigo: { in: tipos } } : {};

    // ── KPIs del rango activo ─────────────────────────────────────────
    // Counts paralelos para los 3 KPIs.
    const baseWhere = {
      ...tipoWhere,
      fecha_solicitud: { gte: desde, lt: hasta },
    };

    const [items, emitidosCnt, aprobadosCnt, enProcesoCnt] = await Promise.all([
      // Para vista=gen necesitamos los nro_req únicos del rango.
      prisma.oTRepuesto.findMany({
        where: baseWhere,
        select: {
          id: true,
          nro_req: true,
          ot_id: true,
          orden_trabajo_interna_id: true,
          status_requerimiento_codigo: true,
          po_id: true,
          status_oc_codigo: true,
          fecha_solicitud: true,
          fecha_aprobacion: true,
        },
      }),
      prisma.oTRepuesto.count({
        where: {
          ...baseWhere,
          status_requerimiento_codigo: { in: ["SIN_APROBACION", "APROBADO", "ANULADO", "DESAPROBADO"] },
        },
      }),
      prisma.oTRepuesto.count({
        where: { ...baseWhere, status_requerimiento_codigo: "APROBADO" },
      }),
      prisma.oTRepuesto.count({
        where: {
          ...baseWhere,
          status_requerimiento_codigo: "APROBADO",
          po_id: { not: null },
          status_oc_codigo: { in: ["PEND_OC", "PROCESO", "INCOMPLETO"] },
        },
      }),
    ]);

    // Si vista=gen, convertir counts a nro_req únicos. Lo hacemos en memoria
    // porque count distinct no es directo en Prisma.
    function aGenCount(itemsFiltrados: typeof items, statusFilter?: (s: string | null) => boolean): number {
      if (vista !== "gen") return itemsFiltrados.length;
      const reqs = new Set<string>();
      for (const it of itemsFiltrados) {
        if (statusFilter && !statusFilter(it.status_requerimiento_codigo)) continue;
        if (!it.nro_req) continue;
        // Key compuesta para distinguir reqs de OT externa vs interna con mismo nro.
        const k = `${it.ot_id ?? "i"}_${it.orden_trabajo_interna_id ?? "e"}_${it.nro_req}`;
        reqs.add(k);
      }
      return reqs.size;
    }

    const emitidos = vista === "gen"
      ? aGenCount(items, (s) => s === "SIN_APROBACION" || s === "APROBADO" || s === "ANULADO" || s === "DESAPROBADO")
      : emitidosCnt;
    const aprobados = vista === "gen"
      ? aGenCount(items, (s) => s === "APROBADO")
      : aprobadosCnt;
    const enProceso = vista === "gen"
      ? (() => {
          const itemsFiltrados = items.filter(
            (it) =>
              it.status_requerimiento_codigo === "APROBADO" &&
              it.po_id != null &&
              ["PEND_OC", "PROCESO", "INCOMPLETO"].includes(it.status_oc_codigo ?? ""),
          );
          return aGenCount(itemsFiltrados);
        })()
      : enProcesoCnt;

    // ── Por mes (12 valores) — del año completo, ignora modo ─────────
    // Cuenta items con fecha_solicitud por mes (1-12).
    const itemsAnio = await prisma.oTRepuesto.findMany({
      where: {
        ...tipoWhere,
        fecha_solicitud: {
          gte: dayjs(`${anio}-01-01`).startOf("year").toDate(),
          lt: dayjs(`${anio + 1}-01-01`).startOf("year").toDate(),
        },
        status_requerimiento_codigo: { in: ["SIN_APROBACION", "APROBADO", "ANULADO", "DESAPROBADO"] },
      },
      select: {
        id: true,
        nro_req: true,
        ot_id: true,
        orden_trabajo_interna_id: true,
        fecha_solicitud: true,
        fecha_aprobacion: true,
      },
    });
    const porMes: number[] = Array(12).fill(0);
    if (vista === "gen") {
      const reqsPorMes: Array<Set<string>> = Array.from({ length: 12 }, () => new Set());
      for (const it of itemsAnio) {
        const m = dayjs(it.fecha_solicitud).month(); // 0-11
        if (!it.nro_req) continue;
        const k = `${it.ot_id ?? "i"}_${it.orden_trabajo_interna_id ?? "e"}_${it.nro_req}`;
        reqsPorMes[m].add(k);
      }
      for (let i = 0; i < 12; i++) porMes[i] = reqsPorMes[i].size;
    } else {
      for (const it of itemsAnio) {
        const m = dayjs(it.fecha_solicitud).month();
        porMes[m]++;
      }
    }

    // ── Por semana (4-5 semanas del mes seleccionado) ─────────────────
    const semanasMes: Array<{ label: string; value: number }> = [];
    if (modo === "mes" && mes != null) {
      const inicioMes = dayjs(`${anio}-${String(mes).padStart(2, "0")}-01`).startOf("month");
      const finMes = inicioMes.endOf("month");
      const semanasSet = new Set<number>();
      let cur = inicioMes.startOf("isoWeek");
      while (cur.isBefore(finMes) || cur.isSame(finMes, "day")) {
        semanasSet.add(cur.isoWeek());
        cur = cur.add(7, "day");
      }
      const semsArr = Array.from(semanasSet).sort((a, b) => a - b);
      // Para cada semana del mes contar items del rango activo.
      const itemsRango = items;
      for (const s of semsArr) {
        const count = vista === "gen"
          ? (() => {
              const reqs = new Set<string>();
              for (const it of itemsRango) {
                if (dayjs(it.fecha_solicitud).isoWeek() !== s) continue;
                if (!it.nro_req) continue;
                reqs.add(`${it.ot_id ?? "i"}_${it.orden_trabajo_interna_id ?? "e"}_${it.nro_req}`);
              }
              return reqs.size;
            })()
          : itemsRango.filter((it) => dayjs(it.fecha_solicitud).isoWeek() === s).length;
        semanasMes.push({ label: `S${s}`, value: count });
      }
    }

    // ── Por OT (distribución 1/2/3/4/5+) ──────────────────────────────
    // Para cada OT, cuántos reqs (o items) tiene en el rango activo.
    const porOtTmp: Record<string, number> = {};
    for (const it of items) {
      const otKey = `${it.ot_id ?? "i"}_${it.orden_trabajo_interna_id ?? "e"}`;
      if (vista === "gen") {
        if (!it.nro_req) continue;
        const k = `${otKey}_${it.nro_req}`;
        if (!porOtTmp[k]) porOtTmp[k] = 1; // dedup por req único
        porOtTmp[otKey] = (porOtTmp[otKey] ?? 0); // marcar OT
      }
    }
    // Calcular cuántos reqs/items por OT.
    const reqsPorOt: Record<string, Set<string>> = {};
    for (const it of items) {
      const otKey = `${it.ot_id ?? "i"}_${it.orden_trabajo_interna_id ?? "e"}`;
      if (!reqsPorOt[otKey]) reqsPorOt[otKey] = new Set();
      if (vista === "gen") {
        if (it.nro_req) reqsPorOt[otKey].add(it.nro_req);
      } else {
        reqsPorOt[otKey].add(String(it.id));
      }
    }
    const porOt: number[] = [0, 0, 0, 0, 0]; // [1, 2, 3, 4, 5+]
    for (const otKey of Object.keys(reqsPorOt)) {
      const n = reqsPorOt[otKey].size;
      if (n === 1) porOt[0]++;
      else if (n === 2) porOt[1]++;
      else if (n === 3) porOt[2]++;
      else if (n === 4) porOt[3]++;
      else if (n >= 5) porOt[4]++;
    }

    // ── Por tiempo de aprobación (1-3d, 4-6d, 7-10d, +10d) ───────────
    const porTiempo: number[] = [0, 0, 0, 0];
    for (const it of items) {
      if (!it.fecha_aprobacion || !it.fecha_solicitud) continue;
      const dias = dayjs(it.fecha_aprobacion).diff(dayjs(it.fecha_solicitud), "day");
      if (dias < 0) continue;
      if (dias <= 3) porTiempo[0]++;
      else if (dias <= 6) porTiempo[1]++;
      else if (dias <= 10) porTiempo[2]++;
      else porTiempo[3]++;
    }

    return NextResponse.json({
      kpis: {
        emitidos,
        aprobados,
        enProceso,
        l1Label: vista === "gen" ? "Requerimientos emitidos" : "Ítems requeridos",
      },
      porMes,
      porSemana: semanasMes,
      porOt,
      porTiempo,
      meta: { modo, anio, mes, sem, vista, tipo },
    });
  } catch (e) {
    console.error("GET /api/dashboard/logistica/requerimientos error:", e);
    return NextResponse.json({ error: "Error al obtener datos" }, { status: 500 });
  }
}
