// POST /api/compras/[id]/guia/upload-url?tipo=guia|factura|pago
// Genera presigned URL para subir guía, factura o comprobante de pago.
// Path:
//   - Si Compra.ot_id != null: R2Keys.compra{Guia|Factura|Pago}(otCodigo, numero_po)
//   - Si Compra.ot_id == null: R2Keys.compraSuelta{Guia|Factura|Pago}(numero_po)
//
// Decisión del user (2026-06): se removió la regla que bloqueaba la presigned
// URL de factura si la compra no tenía guía. El orden de subida es libre.
// El "pago" es el comprobante (voucher / boleta de transferencia); la UI lo
// gatea por tipo_pago, el endpoint no, para permitir corregir clasificaciones.
import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { generateUploadUrl } from "@/lib/r2-helpers";
import { R2Keys, otCodigoFor } from "@/lib/r2";
import { assertOTAccess, readJsonBody, validateUploadBody } from "@/lib/r2-server";

import { parseInt4Safe } from "@/lib/ot-formato";
type Params = { params: Promise<{ id: string }> };
type Tipo = "guia" | "factura" | "pago";

function parseTipo(req: NextRequest): Tipo {
  const t = new URL(req.url).searchParams.get("tipo");
  if (t === "factura") return "factura";
  if (t === "pago") return "pago";
  return "guia";
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const compraId = parseInt4Safe(id) ?? 0;
  if (compraId == null || compraId <= 0) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  const tipo = parseTipo(req);

  const compra = await prisma.compra.findUnique({
    where: { id: compraId },
    select: { id: true, numero_po: true, ot_id: true },
  });
  if (!compra) {
    return NextResponse.json({ error: "Compra no encontrada" }, { status: 404 });
  }

  // (Antes había un gate factura-sin-guía. Removido — el orden es libre.)

  // Si la compra está ligada a una OT, validar acceso a la OT.
  // Si no, solo exigir sesión activa (compras-sueltas/...).
  let otCodigo: string | null = null;
  if (compra.ot_id != null) {
    const access = await assertOTAccess(req, compra.ot_id);
    if (!access.ok) return access.response;
    otCodigo = otCodigoFor(access.ot);
  } else {
    const token = await getToken({ req });
    if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const upload = validateUploadBody(parsed.body, "documentos");
  if (!upload.ok) return upload.response;

  try {
    const folderPrefix = otCodigo
      ? (tipo === "guia"
          ? R2Keys.compraGuia(otCodigo, compra.numero_po)
          : tipo === "factura"
            ? R2Keys.compraFactura(otCodigo, compra.numero_po)
            : R2Keys.compraPago(otCodigo, compra.numero_po))
      : (tipo === "guia"
          ? R2Keys.compraSueltaGuia(compra.numero_po)
          : tipo === "factura"
            ? R2Keys.compraSueltaFactura(compra.numero_po)
            : R2Keys.compraSueltaPago(compra.numero_po));

    const result = await generateUploadUrl({
      folderPrefix,
      fileName: upload.value.fileName,
      fileType: upload.value.fileType,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/compras/[id]/guia/upload-url error:", error);
    return NextResponse.json({ error: "Error generando URL de subida" }, { status: 500 });
  }
}
