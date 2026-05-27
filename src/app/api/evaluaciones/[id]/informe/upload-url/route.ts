// POST /api/evaluaciones/[id]/informe/upload-url
// Genera presigned URL para subir el informe técnico de una evaluación.
// Path: R2Keys.otEvaluacion(otCodigo).
//
// Regla de negocio: no permite generar URL si la evaluación está APROBADA o
// PENDIENTE_APROBACION (mismo bloqueo que el POST de registro).
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateUploadUrl } from "@/lib/r2-helpers";
import { R2Keys, otCodigoFor } from "@/lib/r2";
import { assertOTAccess, readJsonBody, validateUploadBody } from "@/lib/r2-server";

type Params = { params: Promise<{ id: string }> };
const ESTADOS_BLOQUEADOS = new Set(["APROBADA", "PENDIENTE_APROBACION"]);

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const evalId = Number(id);
  if (!Number.isFinite(evalId) || evalId <= 0) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const evalRow = await prisma.evaluacionTecnica.findUnique({
    where: { id: evalId },
    select: { id: true, ot_id: true, estado: true },
  });
  if (!evalRow) {
    return NextResponse.json({ error: "Evaluación no encontrada" }, { status: 404 });
  }
  if (ESTADOS_BLOQUEADOS.has(evalRow.estado)) {
    const msg =
      evalRow.estado === "APROBADA"
        ? "La evaluacion esta APROBADA. Debes reabrirla para cambiar el informe."
        : "La evaluacion esta PENDIENTE DE APROBACION y no se puede modificar.";
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  const access = await assertOTAccess(req, evalRow.ot_id);
  if (!access.ok) return access.response;

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const upload = validateUploadBody(parsed.body, "informes");
  if (!upload.ok) return upload.response;

  try {
    const folderPrefix = R2Keys.otEvaluacion(otCodigoFor(access.ot));
    const result = await generateUploadUrl({
      folderPrefix,
      fileName: upload.value.fileName,
      fileType: upload.value.fileType,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/evaluaciones/[id]/informe/upload-url error:", error);
    return NextResponse.json({ error: "Error generando URL de subida" }, { status: 500 });
  }
}
