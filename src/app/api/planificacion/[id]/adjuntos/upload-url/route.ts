// POST /api/planificacion/[id]/adjuntos/upload-url
// Genera una presigned URL para que el TÉCNICO suba un adjunto (foto/documento)
// al pausar o finalizar su tarea. El path R2 lo arma el servidor con R2Keys.
import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateUploadUrl } from "@/lib/r2-helpers";
import { R2Keys, otCodigoFor } from "@/lib/r2";
import { readJsonBody, validateUploadBody } from "@/lib/r2-server";
import { splitRecursos } from "@/lib/recursos";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await ctx.params;
  const planId = Number(id);
  if (!Number.isFinite(planId) || planId <= 0) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const userId = Number((session.user as { id?: string }).id);
  const me = await prisma.usuario.findUnique({
    where: { id: userId },
    select: { roles: true, trabajador: { select: { nombre: true } } },
  });

  const plan = await prisma.planificacionOT.findUnique({
    where: { id: planId },
    select: { id: true, tecnico: true, orden_trabajo: { select: { id: true, ot: true } } },
  });
  if (!plan) return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });

  // Solo el técnico asignado (o un admin) puede adjuntar a la tarea.
  const esAdmin = me?.roles.includes("admin") ?? false;
  const asignados = splitRecursos(plan.tecnico);
  const miNombre = me?.trabajador?.nombre ?? "";
  if (!esAdmin && (!miNombre || !asignados.includes(miNombre))) {
    return NextResponse.json({ error: "Esta tarea no está asignada a vos" }, { status: 403 });
  }

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const upload = validateUploadBody(parsed.body, "documentos");
  if (!upload.ok) return upload.response;

  const folderPrefix = plan.orden_trabajo
    ? R2Keys.planificacionAdjunto(otCodigoFor(plan.orden_trabajo), planId)
    : R2Keys.planificacionSueltaAdjunto(planId);

  try {
    const result = await generateUploadUrl({
      folderPrefix,
      fileName: upload.value.fileName,
      fileType: upload.value.fileType,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/planificacion/[id]/adjuntos/upload-url error:", error);
    return NextResponse.json({ error: "Error generando URL de subida" }, { status: 500 });
  }
}
