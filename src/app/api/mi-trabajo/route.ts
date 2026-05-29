import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sumarHorasReales } from "@/lib/plan-sesion";

dayjs.extend(isoWeek);
dayjs.extend(utc);
dayjs.extend(timezone);

// El servidor corre en UTC (Railway). Para que "hoy" y "esta semana" coincidan
// con el día/semana real del taller, calculamos los límites en hora de Perú.
const TZ = "America/Lima";

// GET /api/mi-trabajo — vista personal del técnico autenticado.
// Devuelve:
//   - me: datos del trabajador
//   - sesionAbierta: sesión actualmente en curso (si la hay)
//   - tareasHoy: tareas asignadas hoy
//   - tareasSemana: tareas asignadas esta semana
//   - rendimientoSemana / rendimientoMes: agregados de horas estim vs reales
//   - historico: últimas 4 semanas (programado vs realizado)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    const userId = Number((session.user as { id?: string }).id);

    const me = await prisma.usuario.findUnique({
      where: { id: userId },
      select: {
        id: true, nombre: true, roles: true,
        trabajador: { select: { trabajador_id: true, nombre: true, area: true, puesto: true } },
      },
    });
    if (!me?.trabajador) {
      return NextResponse.json({ error: "Tu usuario no está enlazado a un trabajador" }, { status: 403 });
    }
    const tecnico = me.trabajador.nombre;

    // Filtro: tareas donde el campo `tecnico` contiene su nombre (puede tener
    // múltiples operarios separados por coma).
    const whereTecnico = { tecnico: { contains: tecnico, mode: "insensitive" as const } };

    const ahoraLima = dayjs().tz(TZ);
    const hoyIni = ahoraLima.startOf("day").toDate();
    const hoyFin = ahoraLima.endOf("day").toDate();
    const semIni = ahoraLima.startOf("isoWeek").toDate();
    const semFin = ahoraLima.endOf("isoWeek").toDate();
    const mesIni = ahoraLima.startOf("month").toDate();
    const mesFin = ahoraLima.endOf("month").toDate();
    // Código de la semana actual (ej. "2026W22"), igual que semana_plan, para
    // incluir tareas asignadas a esta semana aunque todavía no tengan hora.
    const semanaActual = `${ahoraLima.isoWeekYear()}W${String(ahoraLima.isoWeek()).padStart(2, "0")}`;

    // Sesión abierta (si el técnico está trabajando algo ahora)
    const sesionAbierta = await prisma.planificacionOTSesion.findFirst({
      where: { tecnico, fin: null },
      include: {
        planificacion_ot: {
          select: {
            id: true, descripcion: true, ot_id: true, componente: true, operacion_codigo: true,
            horas_estimadas: true, horas_reales: true,
            orden_trabajo: { select: { ot: true } },
          },
        },
      },
    });

    // Tareas que tocan hoy o esta semana (en base a su fecha_inicio programada)
    const include = {
      orden_trabajo: {
        select: {
          ot: true,
          descripcion: true,
          np: true,
          // Info del cilindro que el técnico necesita ver en su tarea.
          tipo: true,
          cod_rep_flota: true,
          cod_rep_posicion: true,
          fecha_entrega: true,
          fabricante: { select: { nombre: true } },
          codigo_reparacion: { select: { codigo: true, descripcion: true, flota: { select: { codigo: true, nombre: true } } } },
          prioridad_atencion: { select: { codigo: true, nombre: true, nivel: true } },
        },
      },
    };
    const tareasHoy = await prisma.planificacionOT.findMany({
      where: {
        AND: [
          whereTecnico,
          { fecha_inicio: { gte: hoyIni, lte: hoyFin } },
        ],
      },
      orderBy: { fecha_inicio: "asc" },
      include,
    });
    // Tareas de la semana del técnico: las que tienen fecha en el rango O las
    // que están asignadas a esta semana (semana_plan) aunque todavía no tengan
    // hora. Así el técnico ve TODO lo de su semana, no solo lo ya calendarizado.
    const tareasSemana = await prisma.planificacionOT.findMany({
      where: {
        AND: [
          whereTecnico,
          {
            OR: [
              { fecha_inicio: { gte: semIni, lte: semFin } },
              { semana_plan: semanaActual },
            ],
          },
        ],
      },
      orderBy: [{ fecha_inicio: "asc" }, { id: "asc" }],
      include,
    });

    // ── Rendimiento ────────────────────────────────────────────────
    // "Programado": tareas cuya fecha_inicio cae en el rango.
    // "Realizado": tareas con fecha_fin_real en el rango y estado=realizado.
    const tareasRealizadasSem = await prisma.planificacionOT.findMany({
      where: {
        AND: [
          whereTecnico,
          { estado: "realizado" },
          { fecha_fin_real: { gte: semIni, lte: semFin } },
        ],
      },
      select: { id: true, horas_estimadas: true, horas_reales: true },
    });
    const tareasRealizadasMes = await prisma.planificacionOT.findMany({
      where: {
        AND: [
          whereTecnico,
          { estado: "realizado" },
          { fecha_fin_real: { gte: mesIni, lte: mesFin } },
        ],
      },
      select: { id: true, horas_estimadas: true, horas_reales: true },
    });

    function calcRendimiento(realizadas: { horas_estimadas: unknown; horas_reales: unknown }[], total: number) {
      let est = 0, real = 0;
      for (const t of realizadas) {
        est += Number(t.horas_estimadas ?? 0);
        real += Number(t.horas_reales ?? 0);
      }
      // Eficiencia = horas_estimadas / horas_reales. Sin horas reales, null.
      const eficiencia = real > 0 ? Math.round((est / real) * 100) : null;
      return {
        totalProgramadas: total,
        realizadas: realizadas.length,
        horas_estimadas: Math.round(est * 10) / 10,
        horas_reales: Math.round(real * 10) / 10,
        eficienciaPct: eficiencia,
      };
    }

    const rendimientoSemana = calcRendimiento(tareasRealizadasSem, tareasSemana.length);
    const totalMes = await prisma.planificacionOT.count({
      where: { AND: [whereTecnico, { fecha_inicio: { gte: mesIni, lte: mesFin } }] },
    });
    const rendimientoMes = calcRendimiento(tareasRealizadasMes, totalMes);

    // ── Histórico últimas 4 semanas ───────────────────────────────
    const historico: Array<{ semana: string; estimadas: number; reales: number; eficienciaPct: number | null }> = [];
    for (let i = 3; i >= 0; i--) {
      const ini = dayjs().subtract(i, "week").startOf("isoWeek").toDate();
      const fin = dayjs().subtract(i, "week").endOf("isoWeek").toDate();
      const tareas = await prisma.planificacionOT.findMany({
        where: {
          AND: [
            whereTecnico,
            { estado: "realizado" },
            { fecha_fin_real: { gte: ini, lte: fin } },
          ],
        },
        select: { horas_estimadas: true, horas_reales: true },
      });
      let est = 0, real = 0;
      for (const t of tareas) { est += Number(t.horas_estimadas ?? 0); real += Number(t.horas_reales ?? 0); }
      historico.push({
        semana: dayjs(ini).format("DD/MM"),
        estimadas: Math.round(est * 10) / 10,
        reales: Math.round(real * 10) / 10,
        eficienciaPct: real > 0 ? Math.round((est / real) * 100) : null,
      });
    }

    // Tiempo de la sesión abierta (en segundos, para que el cliente pueda
    // mostrar un cronómetro vivo). El cliente sumará al horas_reales actual.
    let sesionEnCurso: {
      sesion_id: number;
      planificacion_ot_id: number;
      inicio: string;
      transcurrido_seg: number;
      // `ot` ahora es number (INTEGER) tras la migración del 2026-05-28.
      ot: number | null;
      descripcion: string;
      componente: string;
      operacion: string;
      horas_estimadas: number;
      horas_reales_previas: number;
    } | null = null;
    if (sesionAbierta) {
      const transcurridoMs = Date.now() - sesionAbierta.inicio.getTime();
      const planSesiones = await prisma.planificacionOTSesion.findMany({
        where: {
          planificacion_ot_id: sesionAbierta.planificacion_ot_id,
          NOT: { id: sesionAbierta.id },
        },
        select: { inicio: true, fin: true },
      });
      sesionEnCurso = {
        sesion_id: sesionAbierta.id,
        planificacion_ot_id: sesionAbierta.planificacion_ot_id,
        inicio: sesionAbierta.inicio.toISOString(),
        transcurrido_seg: Math.floor(transcurridoMs / 1000),
        ot: sesionAbierta.planificacion_ot.orden_trabajo?.ot ?? null,
        descripcion: sesionAbierta.planificacion_ot.descripcion,
        componente: sesionAbierta.planificacion_ot.componente,
        operacion: sesionAbierta.planificacion_ot.operacion_codigo,
        horas_estimadas: Number(sesionAbierta.planificacion_ot.horas_estimadas ?? 0),
        horas_reales_previas: sumarHorasReales(planSesiones),
      };
    }

    return NextResponse.json({
      me: {
        nombre: me.nombre,
        trabajador_id: me.trabajador.trabajador_id,
        area: me.trabajador.area,
        puesto: me.trabajador.puesto,
      },
      sesionEnCurso,
      tareasHoy,
      tareasSemana,
      rendimientoSemana,
      rendimientoMes,
      historico,
    });
  } catch (error) {
    console.error("GET /api/mi-trabajo error:", error);
    return NextResponse.json({ error: "Error obteniendo datos" }, { status: 500 });
  }
}
