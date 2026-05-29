import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

dayjs.extend(isoWeek);

// GET /api/ranking-tecnicos — ranking PÚBLICO de técnicos por eficiencia y
// productividad. El rol técnico decidió que es público (competitivo).
// Cualquier usuario logueado lo puede ver.
//
// ?periodo=semana|mes  (default: semana)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { searchParams } = req.nextUrl;
    const periodo = searchParams.get("periodo") === "mes" ? "mes" : "semana";

    const ini = periodo === "mes"
      ? dayjs().startOf("month").toDate()
      : dayjs().startOf("isoWeek").toDate();
    const fin = periodo === "mes"
      ? dayjs().endOf("month").toDate()
      : dayjs().endOf("isoWeek").toDate();

    // Solo cuentan tareas REALIZADAS en el período.
    const realizadas = await prisma.planificacionOT.findMany({
      where: {
        estado: "realizado",
        fecha_fin_real: { gte: ini, lte: fin },
        tecnico: { not: null },
      },
      select: {
        tecnico: true,
        horas_estimadas: true,
        horas_reales: true,
      },
    });

    // Agrupar por técnico. Si una tarea tiene varios técnicos (coma-separada),
    // se prorratea: cada uno recibe est/N y real/N.
    const acumulado = new Map<string, { tareas: number; estimadas: number; reales: number }>();
    for (const r of realizadas) {
      const tecnicos = (r.tecnico ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      if (tecnicos.length === 0) continue;
      const est = Number(r.horas_estimadas ?? 0) / tecnicos.length;
      const real = Number(r.horas_reales ?? 0) / tecnicos.length;
      const tareaCuota = 1 / tecnicos.length;
      for (const t of tecnicos) {
        if (t === "Tercero") continue; // no es un técnico real
        const prev = acumulado.get(t) ?? { tareas: 0, estimadas: 0, reales: 0 };
        prev.tareas += tareaCuota;
        prev.estimadas += est;
        prev.reales += real;
        acumulado.set(t, prev);
      }
    }

    // Ranking ordenado por eficiencia DESC. Tie-breaker: más horas trabajadas.
    const ranking = Array.from(acumulado.entries()).map(([tecnico, v]) => ({
      tecnico,
      tareas: Math.round(v.tareas * 10) / 10,
      horas_estimadas: Math.round(v.estimadas * 10) / 10,
      horas_reales: Math.round(v.reales * 10) / 10,
      eficienciaPct: v.reales > 0 ? Math.round((v.estimadas / v.reales) * 100) : null,
    }));
    ranking.sort((a, b) => {
      // Sin horas reales = no se puede calcular eficiencia, va al final.
      if (a.eficienciaPct == null && b.eficienciaPct == null) return b.horas_reales - a.horas_reales;
      if (a.eficienciaPct == null) return 1;
      if (b.eficienciaPct == null) return -1;
      if (b.eficienciaPct !== a.eficienciaPct) return b.eficienciaPct - a.eficienciaPct;
      return b.horas_reales - a.horas_reales;
    });

    return NextResponse.json({
      periodo,
      desde: ini.toISOString().slice(0, 10),
      hasta: fin.toISOString().slice(0, 10),
      ranking,
    });
  } catch (error) {
    console.error("GET /api/ranking-tecnicos error:", error);
    return NextResponse.json({ error: "Error obteniendo ranking" }, { status: 500 });
  }
}
