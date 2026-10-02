// POST /api/servicios-externos/envios/[id]/adjuntos/upload-url
// Presigned URL para subir un PDF del envío (guía, cotización, informe,
// factura). La key cuelga del requerimiento SER dentro de la OT (externa o
// interna). Body: { fileName, fileType, fileSize }
import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { generateUploadUrl } from "@/lib/r2-helpers";
import { R2Keys, otCodigoFor, otInternaCodigoFor } from "@/lib/r2";
import { readJsonBody, validateUploadBody } from "@/lib/r2-server";
import { parseInt4Safe } from "@/lib/ot-formato";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const envioId = parseInt4Safe(id) ?? 0;
  if (envioId <= 0) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const envio = await prisma.servicioEnvio.findUnique({
    where: { id: envioId },
    select: {
      id: true,
      ot_repuesto: {
        select: {
          id: true,
          orden_trabajo: { select: { id: true, ot: true } },
          orden_trabajo_interna: { select: { id: true, ot: true } },
        },
      },
    },
  });
  if (!envio) return NextResponse.json({ error: "Envío no encontrado" }, { status: 404 });

  const rep = envio.ot_repuesto;
  const folderPrefix = rep.orden_trabajo
    ? R2Keys.servicioEnvioAdjunto(otCodigoFor(rep.orden_trabajo), rep.id, envio.id)
    : rep.orden_trabajo_interna
      ? R2Keys.otInternaServicioEnvioAdjunto(otInternaCodigoFor(rep.orden_trabajo_interna), rep.id, envio.id)
      : null;
  if (!folderPrefix) return NextResponse.json({ error: "Requerimiento sin OT asociada" }, { status: 400 });

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const upload = validateUploadBody(parsed.body, "documentos");
  if (!upload.ok) return upload.response;

  try {
    const result = await generateUploadUrl({
      folderPrefix,
      fileName: upload.value.fileName,
      fileType: upload.value.fileType,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/servicios-externos/envios/[id]/adjuntos/upload-url error:", error);
    return NextResponse.json({ error: "Error generando URL de subida" }, { status: 500 });
  }
}
