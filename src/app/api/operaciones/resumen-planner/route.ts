import { NextResponse, type NextRequest } from "next/server";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { prisma } from "@/lib/prisma";
import { horasRealesEntre } from "@/lib/plan-sesion";
import { splitRecursos } from "@/lib/recursos";

dayjs.extend(isoWeek);
dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = "America/Lima";

// GET /api/operaciones/resumen-planner — la pantalla "de cada mañana" del
// planner. Responde en un solo request:
//   - trabajandoAhora: sesiones abiertas (quién está en qué, hace cuánto) +
//     operarios activos SIN tarea en curso.
//   - semana: cumplimiento del plan de la semana actual por operario
//     (realizadas/total, desviadas ↷ vs lo enviado, agregadas ＋ fuera de plan).
//   - pausas: horas de pausa de la semana POR MOTIVO (gap entre el fin de una
//     sesión pausada y el inicio de la siguiente del mismo técnico ese día —
//     si no retomó ese día no se cuenta, así fin de jornada no infla).
//   - alertas: OTs atrasadas / por vencer (7 días) + pool sin asignar.
export async function GET(req: NextRequest) {
  try {
    const ahora = dayjs().tz(TZ);
    // Semana objetivo: por defecto la actual; si viene ?semana=YYYYWww se usa esa
    // para las secciones "plan vs real" y "pausas". "Trabajando ahora" y las
    // alertas (atrasadas/por vencer) siguen siendo EN VIVO (no dependen de esto).
    const semanaParam = req.nextUrl.searchParams.get("semana");
    const m = semanaParam?.match(/^(\d{4})W(\d{1,2})$/);
    const semBase = m ? ahora.year(Number(m[1])).isoWeek(Number(m[2])) : ahora;
    const semIni = semBase.startOf("isoWeek").toDate();
    const semFin = semBase.endOf("isoWeek").toDate();
    const semanaActual = `${semBase.isoWeekYear()}W${String(semBase.isoWeek()).padStart(2, "0")}`;

    // ── Trabajando ahora ─────────────────────────────────────────────────
    const sesionesAbiertas = await prisma.planificacionOTSesion.findMany({
      where: { fin: null, planificacion_ot: { estado: { notIn: ["cancelado", "realizado"] } } },
      select: {
        tecnico: true, inicio: true,
        planificacion_ot: {
          select: {
            id: true, descripcion: true, componente: true, horas_estimadas: true, horas_extras: true,
            es_correctivo: true,
            orden_trabajo: { select: { id: true, ot: true } },
          },
        },
      },
      orderBy: { inicio: "asc" },
    });
    const nowDate = new Date();
    const trabajandoAhora = sesionesAbiertas.map((s) => ({
      tecnico: s.tecnico,
      inicio: s.inicio,
      transcurrido_h: s.planificacion_ot.horas_extras
        ? Math.round(((nowDate.getTime() - s.inicio.getTime()) / 3_600_000) * 100) / 100
        : horasRealesEntre(s.inicio, nowDate),
      tarea: s.planificacion_ot.descripcion,
      componente: s.planificacion_ot.componente,
      horas_estimadas: s.planificacion_ot.horas_estimadas != null ? Number(s.planificacion_ot.horas_estimadas) : null,
      es_correctivo: s.planificacion_ot.es_correctivo,
      ot: s.planificacion_ot.orden_trabajo?.ot ?? null,
      ot_id: s.planificacion_ot.orden_trabajo?.id ?? null,
    }));

    // Operarios activos sin sesión abierta (libres ahora).
    const operarios = await prisma.trabajador.findMany({
      where: { activo: true, usuario: { roles: { has: "tecnico" } } },
      select: { nombre: true },
      orderBy: { nombre: "asc" },
    });
    const ocupados = new Set(trabajandoAhora.map((t) => t.tecnico));
    const libres = operarios.map((o) => o.nombre).filter((n) => !ocupados.has(n));

    // ── Semana: cumplimiento por operario (vs lo enviado) ───────────────
    const tareasSemana = await prisma.planificacionOT.findMany({
      where: {
        estado: { not: "cancelado" },
        OR: [
          { semana_plan: semanaActual },
          { fecha_inicio: { gte: semIni, lte: semFin } },
        ],
      },
      select: {
        id: true, estado: true, tecnico: true, fecha_inicio: true, publicado: true,
        fecha_inicio_base: true, tecnico_base: true, semana_base: true,
      },
    });
    interface OpStat { total: number; realizadas: number; enProceso: number; desviadas: number; fueraDePlan: number }
    const porOperario = new Map<string, OpStat>();
    const conEnvio = new Set<string>(); // operarios con algo enviado esta semana
    for (const t of tareasSemana) {
      if (t.semana_base === semanaActual && t.fecha_inicio_base) {
        for (const op of splitRecursos(t.tecnico_base ?? t.tecnico)) conEnvio.add(op);
      }
    }
    for (const t of tareasSemana) {
      const desviada = !!t.fecha_inicio_base && !!t.fecha_inicio
        && (Math.abs(dayjs(t.fecha_inicio).diff(dayjs(t.fecha_inicio_base), "minute")) >= 1
          || (t.tecnico_base ?? t.tecnico ?? "") !== (t.tecnico ?? ""));
      for (const op of splitRecursos(t.tecnico)) {
        const e = porOperario.get(op) ?? { total: 0, realizadas: 0, enProceso: 0, desviadas: 0, fueraDePlan: 0 };
        e.total++;
        if (t.estado === "realizado") e.realizadas++;
        if (t.estado === "en_proceso") e.enProceso++;
        if (desviada) e.desviadas++;
        if (!t.fecha_inicio_base && conEnvio.has(op)) e.fueraDePlan++;
        porOperario.set(op, e);
      }
    }
    const semana = {
      codigo: semanaActual,
      total: tareasSemana.length,
      realizadas: tareasSemana.filter((t) => t.estado === "realizado").length,
      enviadas: tareasSemana.filter((t) => t.publicado).length,
      operarios: [...porOperario.entries()]
        .map(([nombre, s]) => ({ nombre, ...s, pct: s.total > 0 ? Math.round((s.realizadas / s.total) * 100) : 0 }))
        .sort((a, b) => a.pct - b.pct),
    };

    // ── Pausas de la semana por motivo (horas de hueco hasta retomar) ────
    const pausasSemana = await prisma.planificacionOTSesion.findMany({
      where: { cierre: "pausa", fin: { gte: semIni, lte: semFin } },
      select: { tecnico: true, fin: true, motivo_pausa: true },
    });
    const iniciosSemana = await prisma.planificacionOTSesion.findMany({
      where: { inicio: { gte: semIni, lte: semFin } },
      select: { tecnico: true, inicio: true },
      orderBy: { inicio: "asc" },
    });
    const pausasPorMotivo = new Map<string, { horas: number; veces: number }>();
    for (const p of pausasSemana) {
      if (!p.fin) continue;
      // Próximo inicio del MISMO técnico, MISMO día (si no retomó ese día, el
      // hueco no se cuenta — evita inflar con fin de jornada).
      const siguiente = iniciosSemana.find(
        (s) => s.tecnico === p.tecnico && s.inicio > p.fin! && dayjs(s.inicio).tz(TZ).isSame(dayjs(p.fin).tz(TZ), "day"),
      );
      if (!siguiente) continue;
      const horas = horasRealesEntre(p.fin, siguiente.inicio);
      if (horas <= 0) continue;
      const motivo = p.motivo_pausa ?? "SIN_MOTIVO";
      const e = pausasPorMotivo.get(motivo) ?? { horas: 0, veces: 0 };
      e.horas += horas;
      e.veces++;
      pausasPorMotivo.set(motivo, e);
    }
    const pausas = [...pausasPorMotivo.entries()]
      .map(([motivo, v]) => ({ motivo, horas: Math.round(v.horas * 10) / 10, veces: v.veces }))
      .sort((a, b) => b.horas - a.horas);

    // ── Alertas: OTs atrasadas / por vencer + pool ───────────────────────
    const hoy0 = ahora.startOf("day").toDate();
    const en7dias = ahora.add(7, "day").endOf("day").toDate();
    const otsActivas = await prisma.ordenTrabajo.findMany({
      where: { activo: true, ot_status_codigo: { not: "Cerrada" } },
      select: {
        id: true, ot: true, descripcion: true,
        fecha_requerimiento_cliente: true, fecha_reprogramada: true,
        cliente: { select: { nombre_comercial: true, razon_social: true } },
      },
    });
    const conFechaEf = otsActivas
      .map((o) => ({ ...o, fechaEf: o.fecha_reprogramada ?? o.fecha_requerimiento_cliente }))
      .filter((o) => o.fechaEf != null);
    const atrasadas = conFechaEf.filter((o) => o.fechaEf! < hoy0);
    const porVencer = conFechaEf
      .filter((o) => o.fechaEf! >= hoy0 && o.fechaEf! <= en7dias)
      .sort((a, b) => a.fechaEf!.getTime() - b.fechaEf!.getTime());
    const mapOt = (o: typeof conFechaEf[number]) => ({
      id: o.id, ot: o.ot, descripcion: o.descripcion,
      cliente: o.cliente?.nombre_comercial ?? o.cliente?.razon_social ?? null,
      fecha: o.fechaEf,
    });

    const poolSinAsignar = await prisma.planificacionOT.count({
      where: { fecha_inicio: null, estado: { notIn: ["cancelado", "realizado"] } },
    });

    return NextResponse.json({
      trabajandoAhora,
      libres,
      semana,
      pausas,
      alertas: {
        atrasadas: atrasadas.sort((a, b) => a.fechaEf!.getTime() - b.fechaEf!.getTime()).slice(0, 15).map(mapOt),
        atrasadasTotal: atrasadas.length,
        porVencer: porVencer.slice(0, 15).map(mapOt),
        porVencerTotal: porVencer.length,
        poolSinAsignar,
      },
    });
  } catch (error) {
    console.error("GET /api/operaciones/resumen-planner error:", error);
    return NextResponse.json({ error: "Error al obtener el resumen" }, { status: 500 });
  }
}
