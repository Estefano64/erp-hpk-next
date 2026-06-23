// POST /api/ordenes-trabajo-internas/[id]/adjuntos/upload-url
// Genera una presigned URL bajo el namespace de la OT interna. El cliente NO
// decide el path — lo arma el backend con R2Keys.otInternaAdjunto.
//
// Body: { fileName, fileType, etapa? }
// La etapa puede venir como query param ?etapa=X o en el body.extra.etapa.
// Si no viene, default "general" (legacy).
import { NextResponse, type NextRequest } from "next/server";
import { generateUploadUrl } from "@/lib/r2-helpers";
import { R2Keys, otInternaCodigoFor } from "@/lib/r2";
import { assertOTInternaAccess, readJsonBody, validateUploadBody } from "@/lib/r2-server";

import { parseInt4Safe } from "@/lib/ot-formato";
type Params = { params: Promise<{ id: string }> };

const ETAPAS_VALIDAS = ["recepcion", "evaluacion", "cotizacion", "po_cliente", "termino", "despacho", "facturacion", "general"] as const;
type Etapa = (typeof ETAPAS_VALIDAS)[number];
function isEtapa(v: unknown): v is Etapa {
  return typeof v === "string" && (ETAPAS_VALIDAS as readonly string[]).includes(v);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const otId = parseInt4Safe(id) ?? 0;

  const access = await assertOTInternaAccess(req, otId);
  if (!access.ok) return access.response;

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const upload = validateUploadBody(parsed.body, "documentos");
  if (!upload.ok) return upload.response;

  // Etapa: prioridad query param > body.extra.etapa > default "general"
  // El frontend la manda via `extra: { etapa: "recepcion" }` en uploadToR2.
  const etapaQuery = req.nextUrl.searchParams.get("etapa");
  const bodyEtapa = (parsed.body as { etapa?: unknown })?.etapa;
  const etapaRaw = etapaQuery ?? bodyEtapa;
  const etapa: Etapa = isEtapa(etapaRaw) ? etapaRaw : "general";

  try {
    const folderPrefix = R2Keys.otInternaAdjunto(otInternaCodigoFor(access.ot), etapa);
    const result = await generateUploadUrl({
      folderPrefix,
      fileName: upload.value.fileName,
      fileType: upload.value.fileType,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/ordenes-trabajo-internas/[id]/adjuntos/upload-url error:", error);
    return NextResponse.json({ error: "Error generando URL de subida" }, { status: 500 });
  }
}
