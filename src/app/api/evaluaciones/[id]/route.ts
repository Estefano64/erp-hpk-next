import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateOnly } from "@/lib/dates";

import { parseInt4Safe } from "@/lib/ot-formato";
type Params = { params: Promise<{ id: string }> };

// GET — obtener una evaluacion por id
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const record = await prisma.evaluacionTecnica.findUnique({
      where: { id: (parseInt4Safe(id) ?? 0) },
      include: {
        orden_trabajo: true,
      },
    });
    if (!record) return NextResponse.json({ error: "Evaluacion no encontrada" }, { status: 404 });
    return NextResponse.json({ data: record });
  } catch (error) {
    console.error("GET /api/evaluaciones/[id] error:", error);
    return NextResponse.json({ error: "Error al obtener evaluacion" }, { status: 500 });
  }
}

// PUT — actualizar
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();

    // Verificar estado actual: no se puede editar contenido en APROBADA/PENDIENTE_APROBACION
    const actual = await prisma.evaluacionTecnica.findUnique({
      where: { id: (parseInt4Safe(id) ?? 0) },
      select: { estado: true },
    });
    if (!actual) {
      return NextResponse.json({ error: "Evaluacion no encontrada" }, { status: 404 });
    }

    const camposContenido = [
      "modelo_evaluacion",
      "sistema_medicion",
      "fecha_evaluacion",
      "evaluado_por",
      "supervisor",
      "datos_formulario",
      "resultado_general",
      "recomendaciones_general",
    ];
    const intentaEditarContenido = camposContenido.some((k) => body[k] !== undefined);
    const bloqueado = ["APROBADA", "PENDIENTE_APROBACION"].includes(actual.estado);

    if (intentaEditarContenido && bloqueado) {
      const msg =
        actual.estado === "APROBADA"
          ? "La evaluacion esta APROBADA. Debes reabrirla para poder editarla."
          : "La evaluacion esta PENDIENTE DE APROBACION y no se puede editar hasta que sea aprobada o rechazada.";
      return NextResponse.json({ error: msg }, { status: 409 });
    }

    const data: Record<string, unknown> = {};
    if (body.modelo_evaluacion !== undefined) data.modelo_evaluacion = body.modelo_evaluacion;
    if (body.sistema_medicion !== undefined) data.sistema_medicion = body.sistema_medicion;
    if (body.fecha_evaluacion !== undefined) data.fecha_evaluacion = parseDateOnly(body.fecha_evaluacion);
    if (body.evaluado_por !== undefined) data.evaluado_por = body.evaluado_por;
    if (body.supervisor !== undefined) data.supervisor = body.supervisor;
    if (body.datos_formulario !== undefined) data.datos_formulario = body.datos_formulario;
    if (body.resultado_general !== undefined) data.resultado_general = body.resultado_general;
    if (body.recomendaciones_general !== undefined) data.recomendaciones_general = body.recomendaciones_general;
    if (body.estado !== undefined) data.estado = body.estado;

    const record = await prisma.evaluacionTecnica.update({
      where: { id: (parseInt4Safe(id) ?? 0) },
      data,
    });
    return NextResponse.json({ data: record });
  } catch (error) {
    console.error("PUT /api/evaluaciones/[id] error:", error);
    return NextResponse.json({ error: "Error al actualizar evaluacion" }, { status: 500 });
  }
}

// DELETE
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const evalId = parseInt4Safe(id) ?? 0;
    // 1. Antes de eliminar, recoger TODAS las r2_keys de fotos dentro de
    //    `datos_formulario` (campos `*_imagenes`). Si las dejamos en R2 al
    //    eliminar la evaluación, quedan archivos huérfanos pagando storage.
    const evalRow = await prisma.evaluacionTecnica.findUnique({
      where: { id: evalId },
      select: { datos_formulario: true, informe_key: true },
    });
    const keysAEliminar: string[] = [];
    if (evalRow?.datos_formulario && typeof evalRow.datos_formulario === "object") {
      const datos = evalRow.datos_formulario as Record<string, unknown>;
      for (const [k, v] of Object.entries(datos)) {
        if (!k.endsWith("_imagenes") || !Array.isArray(v)) continue;
        for (const foto of v as Array<{ r2_key?: string }>) {
          if (typeof foto?.r2_key === "string") keysAEliminar.push(foto.r2_key);
        }
      }
    }
    if (evalRow?.informe_key) keysAEliminar.push(evalRow.informe_key);

    // 2. Borrar el record en BD primero.
    await prisma.evaluacionTecnica.delete({ where: { id: evalId } });

    // 3. Borrar de R2 best-effort. Si algún delete falla quedan huérfanos pero
    //    el record principal ya no existe (consistencia eventual aceptable).
    if (keysAEliminar.length > 0) {
      const { deleteObject } = await import("@/lib/r2-helpers");
      await Promise.allSettled(keysAEliminar.map((k) => deleteObject(k)));
    }
    return NextResponse.json({ message: "Eliminada", r2_keys_eliminadas: keysAEliminar.length });
  } catch (error) {
    console.error("DELETE /api/evaluaciones/[id] error:", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
