// Adjuntos múltiples de una OC: guías de remisión, facturas, comprobantes de pago.
//
// GET  /api/compras/[id]/adjuntos?tipo=guia|factura|pago  → lista (filtrable)
// POST /api/compras/[id]/adjuntos
//   body: { tipo: "guia"|"factura"|"pago", key, nombre_archivo, tipo_mime, tamano }
//
// El cliente sube primero a R2 usando /api/compras/[id]/guia/upload-url?tipo=…
// (el endpoint legacy sigue sirviendo la presigned URL — el path R2 ya soporta
// múltiples archivos porque el prefijo termina en "/guia" o "/factura" o "/pago"
// y cada archivo cae en una sub-key con timestamp/uuid). Esta ruta REGISTRA el
// adjunto en `compra_adjunto` en lugar de pisar el legacy.
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { sanitizarNombreArchivo } from "@/lib/file-uploads";
import { R2Keys, otCodigoFor } from "@/lib/r2";
import { getAuditUser } from "@/lib/audit";

import { parseInt4Safe } from "@/lib/ot-formato";
type Params = { params: Promise<{ id: string }> };
type Tipo = "guia" | "factura" | "pago";

const ETIQUETA: Record<Tipo, string> = {
  guia: "Guía",
  factura: "Factura",
  pago: "Comprobante de pago",
};

function isTipo(v: unknown): v is Tipo {
  return v === "guia" || v === "factura" || v === "pago";
}

// GET — lista adjuntos de la OC. Filtra por tipo si viene en query.
export async function GET(req: NextRequest, { params }: Params) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { id } = await params;
    const compraId = parseInt4Safe(id) ?? 0;
    if (compraId == null || compraId <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }
    const tipoQ = new URL(req.url).searchParams.get("tipo");
    const where: { compra_id: number; tipo?: string } = { compra_id: compraId };
    if (tipoQ && isTipo(tipoQ)) where.tipo = tipoQ;
    const adjuntos = await prisma.compraAdjunto.findMany({
      where,
      orderBy: [{ tipo: "asc" }, { fecha_subida: "asc" }],
    });
    return NextResponse.json({ data: adjuntos });
  } catch (error) {
    console.error("GET /api/compras/[id]/adjuntos error:", error);
    return NextResponse.json({ error: "Error al listar adjuntos" }, { status: 500 });
  }
}

// POST — registra un adjunto ya subido a R2.
export async function POST(req: NextRequest, { params }: Params) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { id } = await params;
    const compraId = parseInt4Safe(id) ?? 0;
    if (compraId == null || compraId <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
    const { tipo, key, nombre_archivo, tipo_mime, tamano } = body as {
      tipo?: unknown; key?: unknown; nombre_archivo?: unknown;
      tipo_mime?: unknown; tamano?: unknown;
    };
    if (!isTipo(tipo)) {
      return NextResponse.json({ error: "tipo inválido (guia|factura|pago)" }, { status: 400 });
    }
    if (typeof key !== "string" || key.length === 0) {
      return NextResponse.json({ error: "key requerida" }, { status: 400 });
    }
    if (typeof nombre_archivo !== "string" || nombre_archivo.length === 0) {
      return NextResponse.json({ error: "nombre_archivo requerido" }, { status: 400 });
    }

    const compra = await prisma.compra.findUnique({
      where: { id: compraId },
      include: { orden_trabajo: { select: { id: true, ot: true } } },
    });
    if (!compra) {
      return NextResponse.json({ error: "Compra no encontrada" }, { status: 404 });
    }

    // Verificar que la key pertenece al prefijo R2 correcto para esta OC + tipo.
    const otCodigo = compra.orden_trabajo ? otCodigoFor(compra.orden_trabajo) : null;
    const prefijoBase = otCodigo
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
    if (!key.startsWith(prefijoBase + "/")) {
      return NextResponse.json({ error: "key fuera del namespace de la compra" }, { status: 400 });
    }

    const nombreSanitizado = sanitizarNombreArchivo(nombre_archivo);
    const usuario = (await getAuditUser(req)) ?? "sistema";

    const created = await prisma.compraAdjunto.create({
      data: {
        compra_id: compraId,
        tipo,
        r2_key: key,
        nombre_archivo: nombreSanitizado,
        tipo_mime: typeof tipo_mime === "string" ? tipo_mime : null,
        tamano: typeof tamano === "number" && Number.isFinite(tamano) ? tamano : null,
        usuario_carga: usuario,
      },
    });

    // Auditoría en el historial de la OT (si está vinculada).
    if (compra.ot_id) {
      await prisma.oTHistorial.create({
        data: {
          ot_id: compra.ot_id,
          tipo_operacion: "ADJUNTO",
          descripcion: `${ETIQUETA[tipo]} subida en OC ${compra.numero_po}: ${nombreSanitizado}`,
          usuario,
        },
      });
    }

    return NextResponse.json({ data: created });
  } catch (error) {
    console.error("POST /api/compras/[id]/adjuntos error:", error);
    const msg = error instanceof Error ? error.message : "Error al registrar adjunto";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
