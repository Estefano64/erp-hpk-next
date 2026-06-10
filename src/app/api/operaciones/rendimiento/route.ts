import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { splitRecursos } from "@/lib/recursos";

// GET /api/operaciones/rendimiento?semana=YYYYWww
// Rendimiento por operario en una semana, midiendo de forma JUSTA:
//   - Cumplimiento del PLAN: tareas plan asignadas vs realizadas (usa la LÍNEA
//     BASE *_base si existe; si no, cae a semana_plan/tecnico actuales).
//   - Correctivos: trabajo extra fuera del plan (es_correctivo=true) — crédito.
//   - Eficiencia: horas estimadas / horas reales de lo cumplido.
//   - Carga real: cumplidas + correctivos (lo que efectivamente sacó).
// Multi-operario: una tarea de "A | B" cuenta para ambos.
export async function GET(req: NextRequest) {
  try {
    const semana = (req.nextUrl.searchParams.get("semana") ?? "").trim();
    if (!semana) return NextResponse.json({ error: "Falta 'semana'" }, { status: 400 });

    const rows = await prisma.planificacionOT.findMany({
      where: { OR: [{ semana_base: semana }, { semana_plan: semana }] },
      select: {
        id: true, estado: true, es_correctivo: true,
        horas_estimadas: true, horas_estimadas_base: true, horas_reales: true,
        tecnico: true, tecnico_base: true, semana_base: true, semana_plan: true,
      },
    });

    type Agg = {
      operario: string;
      planAsignadas: number; planCumplidas: number; correctivos: number;
      horasEst: number; horasRealPlan: number; horasRealCorrectivos: number;
    };
    const map = new Map<string, Agg>();
    const get = (op: string): Agg => {
      let a = map.get(op);
      if (!a) {
        a = { operario: op, planAsignadas: 0, planCumplidas: 0, correctivos: 0, horasEst: 0, horasRealPlan: 0, horasRealCorrectivos: 0 };
        map.set(op, a);
      }
      return a;
    };
    const num = (d: unknown) => (d == null ? 0 : Number(d));

    for (const r of rows) {
      const realizado = r.estado === "realizado";
      if (r.es_correctivo) {
        // Correctivo de ESTA semana (donde se ejecutó/programó). Crédito al técnico actual.
        if (r.semana_plan === semana || r.semana_base === semana) {
          for (const op of splitRecursos(r.tecnico)) {
            const a = get(op);
            if (realizado) { a.correctivos++; a.horasRealCorrectivos += num(r.horas_reales); }
          }
        }
        continue;
      }
      // Tarea de plan: la LÍNEA BASE manda; si no hay base, cae al plan actual.
      const semPlan = r.semana_base ?? r.semana_plan;
      if (semPlan !== semana) continue;
      const tecPlan = r.tecnico_base ?? r.tecnico;
      const est = num(r.horas_estimadas_base ?? r.horas_estimadas);
      for (const op of splitRecursos(tecPlan)) {
        const a = get(op);
        a.planAsignadas++;
        if (realizado) {
          a.planCumplidas++;
          a.horasEst += est;
          a.horasRealPlan += num(r.horas_reales);
        }
      }
    }

    const r1 = (n: number) => Math.round(n * 10) / 10;
    const operarios = Array.from(map.values())
      .map((a) => ({
        operario: a.operario,
        planAsignadas: a.planAsignadas,
        planCumplidas: a.planCumplidas,
        pendientes: a.planAsignadas - a.planCumplidas,
        correctivos: a.correctivos,
        cargaReal: a.planCumplidas + a.correctivos,
        cumplimiento: a.planAsignadas > 0 ? a.planCumplidas / a.planAsignadas : null,
        eficiencia: a.horasRealPlan > 0 ? a.horasEst / a.horasRealPlan : null,
        horasEst: r1(a.horasEst),
        horasRealPlan: r1(a.horasRealPlan),
        horasRealCorrectivos: r1(a.horasRealCorrectivos),
      }))
      .filter((o) => o.planAsignadas > 0 || o.correctivos > 0)
      .sort((a, b) => b.cargaReal - a.cargaReal || a.operario.localeCompare(b.operario));

    return NextResponse.json({ semana, operarios });
  } catch (error) {
    console.error("GET /api/operaciones/rendimiento error:", error);
    return NextResponse.json({ error: "Error al calcular rendimiento" }, { status: 500 });
  }
}
