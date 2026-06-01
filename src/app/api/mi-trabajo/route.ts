import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sumarHorasReales, estadoTecnico, type EstadoTecnico } from "@/lib/plan-sesion";

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
export async function GET(req: Request) {
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
    // Semana a mostrar: por defecto la actual; el dashboard puede pedir otra con
    // ?semana=YYYY-MM-DD (cualquier día dentro de esa semana) para navegar.
    const semanaParam = new URL(req.url).searchParams.get("semana");
    const refParsed = semanaParam ? dayjs.tz(semanaParam, TZ) : ahoraLima;
    const refLima = refParsed.isValid() ? refParsed : ahoraLima;

    const hoyIni = ahoraLima.startOf("day").toDate();
    const hoyFin = ahoraLima.endOf("day").toDate();
    const semIni = refLima.startOf("isoWeek").toDate();
    const semFin = refLima.endOf("isoWeek").toDate();
    const mesIni = ahoraLima.startOf("month").toDate();
    const mesFin = ahoraLima.endOf("month").toDate();
    // Código de la semana mostrada (ej. "2026W22"), igual que semana_plan, para
    // incluir tareas asignadas a esa semana aunque todavía no tengan hora.
    const semanaActual = `${refLima.isoWeekYear()}W${String(refLima.isoWeek()).padStart(2, "0")}`;

    // Sesión abierta (si el técnico está trabajando algo ahora)
    const sesionAbierta = await prisma.planificacionOTSesion.findFirst({
      // Ignora sesiones abiertas de tareas ya canceladas/realizadas (evita que el
      // cronómetro "Trabajando ahora" quede colgado si una se cerró por otra vía).
      where: { tecnico, fin: null, planificacion_ot: { estado: { notIn: ["cancelado", "realizado"] } } },
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
          cliente: { select: { razon_social: true, nombre_comercial: true } },
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

    // ── Estado PERSONAL del técnico en cada tarea (multi-técnico) ──────────
    // Una tarea puede tener varios técnicos; cada uno avanza por su cuenta. El
    // estado del técnico logueado se deriva de SUS sesiones en esa tarea.
    const idsLista = [...new Set([...tareasHoy, ...tareasSemana].map((t) => t.id))];
    const misSesiones = idsLista.length
      ? await prisma.planificacionOTSesion.findMany({
          where: { tecnico, planificacion_ot_id: { in: idsLista } },
          select: { planificacion_ot_id: true, tecnico: true, inicio: true, fin: true, cierre: true },
        })
      : [];
    const miEstadoPorTarea = new Map<number, EstadoTecnico>();
    for (const id of idsLista) {
      miEstadoPorTarea.set(id, estadoTecnico(misSesiones.filter((s) => s.planificacion_ot_id === id)));
    }

    // Mapa código de equipo → nombre, para mostrar el NOMBRE de la máquina (no el
    // código) en el dashboard del técnico.
    const equiposCat = await prisma.equipo.findMany({ select: { codigo: true, descripcion: true } });
    const nombreEquipo = new Map(equiposCat.map((e) => [e.codigo, e.descripcion ?? e.codigo]));
    const maquinaNombre = (maq: string | null | undefined): string | null => {
      if (!maq) return null;
      return maq.split("|").map((c) => nombreEquipo.get(c.trim()) ?? c.trim()).filter(Boolean).join(" | ");
    };

    const conMiEstado = <T extends { id: number; maquina?: string | null }>(arr: T[]) =>
      arr.map((t) => ({
        ...t,
        miEstado: miEstadoPorTarea.get(t.id) ?? "sin_empezar" as EstadoTecnico,
        maquina_nombre: maquinaNombre(t.maquina),
      }));

    // Horas reales del técnico logueado en un conjunto de tareas (sus sesiones).
    async function horasRealesTecnico(taskIds: number[]): Promise<number> {
      if (taskIds.length === 0) return 0;
      const ss = await prisma.planificacionOTSesion.findMany({
        where: { tecnico, planificacion_ot_id: { in: taskIds } },
        select: { inicio: true, fin: true },
      });
      return sumarHorasReales(ss);
    }

    // ── Rendimiento (POR TÉCNICO, consistente con el resto del dashboard) ──
    // "Realizado" = el técnico terminó SU parte (miEstado=realizado, derivado de
    // sus sesiones), NO el estado global (que es multi-técnico). "Programado" =
    // total de tareas que tiene en el período. Así realizadas ⊆ total y cierra.

    // `realHoras` son las horas reales DEL TÉCNICO (sus sesiones), no la suma de
    // todos los que trabajaron la tarea. Antes se comparaba horas_estimadas (por
    // persona) contra horas_reales (de todos) → eficiencia falsa en multi-técnico.
    function calcRendimiento(realizadas: { horas_estimadas: unknown }[], total: number, realHoras: number) {
      let est = 0;
      for (const t of realizadas) est += Number(t.horas_estimadas ?? 0);
      const eficiencia = realHoras > 0 ? Math.round((est / realHoras) * 100) : null;
      return {
        totalProgramadas: total,
        realizadas: realizadas.length,
        horas_estimadas: Math.round(est * 10) / 10,
        horas_reales: Math.round(realHoras * 10) / 10,
        eficienciaPct: eficiencia,
      };
    }

    // Semana: reusa tareasSemana + su miEstado ya calculado (por técnico).
    const realizadasSemList = tareasSemana.filter((t) => miEstadoPorTarea.get(t.id) === "realizado");
    const realSem = await horasRealesTecnico(realizadasSemList.map((t) => t.id));
    const rendimientoSemana = calcRendimiento(realizadasSemList, tareasSemana.length, realSem);

    // Mes: tareas del técnico con fecha_inicio en el mes + su estado por sesiones.
    const tareasMes = await prisma.planificacionOT.findMany({
      where: { AND: [whereTecnico, { fecha_inicio: { gte: mesIni, lte: mesFin } }] },
      select: { id: true, horas_estimadas: true },
    });
    const mesIds = tareasMes.map((t) => t.id);
    const sesMes = mesIds.length
      ? await prisma.planificacionOTSesion.findMany({
          where: { tecnico, planificacion_ot_id: { in: mesIds } },
          select: { planificacion_ot_id: true, tecnico: true, inicio: true, fin: true, cierre: true },
        })
      : [];
    const realizadasMesList = tareasMes.filter(
      (t) => estadoTecnico(sesMes.filter((s) => s.planificacion_ot_id === t.id)) === "realizado",
    );
    const realMes = sumarHorasReales(
      sesMes.filter((s) => realizadasMesList.some((t) => t.id === s.planificacion_ot_id)),
    );
    const rendimientoMes = calcRendimiento(realizadasMesList, tareasMes.length, realMes);

    // ── Histórico últimas 4 semanas (por técnico) ──────────────────
    const historico: Array<{ semana: string; estimadas: number; reales: number; eficienciaPct: number | null }> = [];
    for (let i = 3; i >= 0; i--) {
      const ini = dayjs().subtract(i, "week").startOf("isoWeek").toDate();
      const fin = dayjs().subtract(i, "week").endOf("isoWeek").toDate();
      const tareas = await prisma.planificacionOT.findMany({
        where: { AND: [whereTecnico, { fecha_inicio: { gte: ini, lte: fin } }] },
        select: { id: true, horas_estimadas: true },
      });
      const ids = tareas.map((t) => t.id);
      const ses = ids.length
        ? await prisma.planificacionOTSesion.findMany({
            where: { tecnico, planificacion_ot_id: { in: ids } },
            select: { planificacion_ot_id: true, tecnico: true, inicio: true, fin: true, cierre: true },
          })
        : [];
      const hechas = tareas.filter(
        (t) => estadoTecnico(ses.filter((s) => s.planificacion_ot_id === t.id)) === "realizado",
      );
      let est = 0;
      for (const t of hechas) est += Number(t.horas_estimadas ?? 0);
      const real = sumarHorasReales(ses.filter((s) => hechas.some((t) => t.id === s.planificacion_ot_id)));
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
      semana: semanaActual,
      sesionEnCurso,
      tareasHoy: conMiEstado(tareasHoy),
      tareasSemana: conMiEstado(tareasSemana),
      rendimientoSemana,
      rendimientoMes,
      historico,
    });
  } catch (error) {
    console.error("GET /api/mi-trabajo error:", error);
    return NextResponse.json({ error: "Error obteniendo datos" }, { status: 500 });
  }
}
