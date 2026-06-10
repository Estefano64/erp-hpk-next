// GET /api/ordenes-trabajo-internas/[id]/tareas/preview-tasklist
//
// Read-only: devuelve la lista de DESCRIPCIONES de tareas del task list
// del equipo + estrategia PM de la OT, con cascada acumulativa.
// NO crea nada en BD — el endpoint solo lee.
//
// La UI usa esto para auto-poblar el textarea de `task_list` en el tab
// "Tareas" del detalle de OT interna (botón "Aplicar Task List").
//
// Respuesta:
//   {
//     equipo_codigo: "MAQ001",
//     estrategia_pm: "PM2",
//     cascada: ["PM1", "PM2"],
//     tareas: [
//       { actividad_codigo: "PM1", descripcion: "Limpieza de tanque..." },
//       ...
//     ],
//     // Formato "uno por línea, con prefijo [PMx]" listo para pegar en el textarea.
//     task_list_text: "[PM1] Limpieza de tanque...\n[PM2] Otra tarea..."
//   }
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

const CASCADA_PM: Record<string, string[]> = {
  PM1: ["PM1"],
  PM2: ["PM1", "PM2"],
  PM3: ["PM1", "PM2", "PM3"],
  PM4: ["PM1", "PM2", "PM3", "PM4"],
};

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const otId = Number(id);
    if (!Number.isFinite(otId) || otId <= 0) {
      return NextResponse.json({ error: "ID de OT inválido" }, { status: 400 });
    }

    const ot = await prisma.ordenTrabajoInterna.findUnique({
      where: { id: otId },
      select: {
        id: true,
        equipo_codigo: true,
        estrategia: { select: { codigo: true } },
      },
    });
    if (!ot) {
      return NextResponse.json({ error: "OT interna no encontrada" }, { status: 404 });
    }
    if (!ot.equipo_codigo) {
      return NextResponse.json({ error: "La OT no tiene equipo asignado." }, { status: 400 });
    }
    const estrCodigo = ot.estrategia?.codigo;
    if (!estrCodigo) {
      return NextResponse.json({ error: "La OT no tiene estrategia asignada." }, { status: 400 });
    }
    const cascada = CASCADA_PM[estrCodigo];
    if (!cascada) {
      return NextResponse.json(
        { error: `La estrategia "${estrCodigo}" no es un nivel PM (PM1/PM2/PM3/PM4).` },
        { status: 400 },
      );
    }

    // Las TaskList se modelan como una entrada por (equipo, actividad,
    // descripcion). Para el preview de tareas, solo necesitamos los headers
    // (descripcion + actividad_codigo) — no traemos los items materiales.
    const taskLists = await prisma.taskList.findMany({
      where: {
        equipo_codigo: ot.equipo_codigo,
        actividad_codigo: { in: cascada },
        activo: true,
      },
      select: { actividad_codigo: true, descripcion: true },
      // PM1 primero, después PM2, etc. Dentro de cada nivel, orden por id (insert order).
      orderBy: [{ actividad_codigo: "asc" }, { id: "asc" }],
    });

    const tareas = taskLists.map((tl) => ({
      actividad_codigo: tl.actividad_codigo,
      descripcion: tl.descripcion,
    }));

    // Formato listo para pegar en el textarea. Cada línea: `[PMx] descripción`.
    const task_list_text = tareas
      .map((t) => `[${t.actividad_codigo}] ${t.descripcion}`)
      .join("\n");

    return NextResponse.json({
      equipo_codigo: ot.equipo_codigo,
      estrategia_pm: estrCodigo,
      cascada,
      tareas,
      task_list_text,
    });
  } catch (error) {
    console.error("GET preview-tasklist error:", error);
    return NextResponse.json({ error: "Error al consultar task list" }, { status: 500 });
  }
}
