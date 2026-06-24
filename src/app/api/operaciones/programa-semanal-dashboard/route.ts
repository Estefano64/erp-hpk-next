import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { splitRecursos } from "@/lib/recursos";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import isoWeek from "dayjs/plugin/isoWeek";
dayjs.extend(utc); dayjs.extend(timezone); dayjs.extend(isoWeek);
const TZ = "America/Lima";

// GET /api/operaciones/programa-semanal-dashboard?semana=2026W25
// Agrega la programación de una semana para el dashboard del planner (Fase 1):
// KPIs (eval/reparación), curva S, QTY por día y HH por equipo.
//
// Definiciones (Fase 1):
//  - Tareas de la semana = planificacion_ot con semana_plan = <semana>.
//  - "Evaluación" = TAREA con operacion_codigo = "EVAL" (operación "Evaluacion");
//    el resto = "Reparación". (No es un tipo de OT, son las tareas de evaluación.)
//  - HH programado = horas_estimadas × qty_personal; HH realizado = horas_reales.
//  - Correctivo = es_correctivo. Equipos: se muestra el NOMBRE del equipo (catálogo).
function semanaActualCodigo(): string {
  const d = dayjs().tz(TZ);
  return `${d.isoWeekYear()}W${String(d.isoWeek()).padStart(2, "0")}`;
}
function lunesDeSemana(cod: string): dayjs.Dayjs {
  const m = cod.match(/^(\d{4})W(\d{2})$/);
  if (!m) return dayjs().tz(TZ).isoWeekday(1).startOf("day");
  // Lunes de la semana ISO N del año Y: partimos del 4-ene (siempre en la
  // semana ISO 1), tomamos su lunes y sumamos N-1 semanas. (isoWeekYear no
  // tiene setter en dayjs, por eso este camino.)
  const lunesW1 = dayjs().tz(TZ).year(Number(m[1])).month(0).date(4).isoWeekday(1);
  return lunesW1.add(Number(m[2]) - 1, "week").startOf("day");
}
const esEval = (op: string | null) => (op ?? "").trim().toUpperCase() === "EVAL";
const hhProg = (r: { horas_estimadas: unknown; qty_personal: number | null }) =>
  Number(r.horas_estimadas ?? 0) * Math.max(1, Number(r.qty_personal ?? 1));

export async function GET(req: NextRequest) {
  try {
    const semana = (req.nextUrl.searchParams.get("semana") || semanaActualCodigo()).trim();
    const lunes = lunesDeSemana(semana);
    const dias = Array.from({ length: 5 }, (_, i) => lunes.add(i, "day")); // Lun..Vie

    const tareas = await prisma.planificacionOT.findMany({
      where: { semana_plan: semana },
      select: {
        ot_id: true, maquina: true, operacion_codigo: true, estado: true, es_correctivo: true,
        horas_estimadas: true, qty_personal: true, horas_reales: true,
        fecha_inicio: true, fecha_fin_real: true,
      },
    });

    // Catálogo de equipos: maquina guarda el CÓDIGO (MAQ002) → mostramos el nombre.
    const eqCat = await prisma.equipo.findMany({ select: { codigo: true, descripcion: true } });
    const equipoNombre = new Map(eqCat.map((e) => [e.codigo, e.descripcion ?? e.codigo]));

    const diaIdx = (d: Date | null): number => {
      if (!d) return -1;
      const dj = dayjs(d).tz(TZ).startOf("day");
      const i = dj.diff(lunes, "day");
      return i >= 0 && i < 5 ? i : -1;
    };
    const realizado = (t: { estado: string | null }) => t.estado === "realizado";

    // ── KPIs eval/reparación (por QTY de tareas) ──
    const evalT = tareas.filter((t) => esEval(t.operacion_codigo));
    const repT = tareas.filter((t) => !esEval(t.operacion_codigo));
    const resumenDe = (arr: typeof tareas) => {
      const prog = arr.length;
      const real = arr.filter(realizado).length;
      return { programado: prog, realizado: real, pct: prog ? Math.round((real / prog) * 100) : 0 };
    };
    const kpis = {
      tareasEvaluacion: evalT.length,
      tareasReparacion: repT.length,
      evaluacion: resumenDe(evalT),
      reparacion: resumenDe(repT),
    };

    // ── QTY por día (programado/realizado/correctivo, por día planificado) ──
    const qtyPorDia = dias.map((d, i) => {
      const delDia = tareas.filter((t) => diaIdx(t.fecha_inicio) === i);
      return {
        dia: d.format("DD/MM"),
        programado: delDia.length,
        realizado: delDia.filter(realizado).length,
        correctivo: delDia.filter((t) => t.es_correctivo).length,
      };
    });

    // ── Curva S: % acumulado programado vs realizado (por QTY) ──
    const totalProg = tareas.filter((t) => diaIdx(t.fecha_inicio) >= 0).length || 1;
    let accP = 0, accR = 0;
    const curvaS = dias.map((d, i) => {
      accP += qtyPorDia[i].programado;
      accR += qtyPorDia[i].realizado;
      return {
        dia: d.format("DD/MM"),
        pctProgramado: Math.round((accP / totalProg) * 100),
        pctRealizado: Math.round((accR / totalProg) * 100),
      };
    });

    // ── HH por equipo (maquina) ──
    const mapEq = new Map<string, { equipo: string; programado: number; realizado: number; correctivo: number }>();
    for (const t of tareas) {
      const eqs = splitRecursos(t.maquina);
      if (eqs.length === 0) continue;
      const prog = hhProg(t), real = Number(t.horas_reales ?? 0);
      for (const eq of eqs) {
        const nombre = equipoNombre.get(eq) ?? eq; // código -> nombre del equipo
        const e = mapEq.get(nombre) ?? { equipo: nombre, programado: 0, realizado: 0, correctivo: 0 };
        e.programado += prog;
        if (realizado(t)) e.realizado += real;
        if (t.es_correctivo) e.correctivo += prog;
        mapEq.set(nombre, e);
      }
    }
    const hhPorEquipo = [...mapEq.values()]
      .map((e) => ({ ...e, programado: +e.programado.toFixed(1), realizado: +e.realizado.toFixed(1), correctivo: +e.correctivo.toFixed(1) }))
      .sort((a, b) => b.programado - a.programado);

    // ── Utilización HH – Taller (global) ──
    // HH Disponibles = horas-hombre = (operarios con rol "tecnico" activos) ×
    // jornada (9h = 08-18 menos 1h almuerzo). Programadas por día (HH plan a su
    // día de inicio). Libres = disponibles − programadas.
    const JORNADA_HH = 9;
    const nTecnicos = await prisma.usuario.count({ where: { activo: true, roles: { has: "tecnico" } } });
    const utilizacionTaller = dias.map((d, i) => {
      const prog = tareas.filter((t) => diaIdx(t.fecha_inicio) === i).reduce((sum, t) => sum + hhProg(t), 0);
      const disp = nTecnicos * JORNADA_HH;
      return {
        dia: d.format("DD/MM"),
        disponibles: disp,
        programadas: +prog.toFixed(1),
        libres: +Math.max(0, disp - prog).toFixed(1),
      };
    });

    // ── Semanas disponibles (para el selector) ──
    const semanasRaw = await prisma.planificacionOT.findMany({
      where: { semana_plan: { not: null } },
      select: { semana_plan: true },
      distinct: ["semana_plan"],
      orderBy: { semana_plan: "desc" },
    });
    const semanas = semanasRaw.map((s) => s.semana_plan).filter(Boolean) as string[];

    return NextResponse.json({ semana, kpis, curvaS, qtyPorDia, hhPorEquipo, utilizacionTaller, totalTecnicos: nTecnicos, jornadaHoras: JORNADA_HH, semanas });
  } catch (error) {
    console.error("GET programa-semanal-dashboard error:", error);
    return NextResponse.json({ error: "Error al cargar el dashboard de programación" }, { status: 500 });
  }
}
