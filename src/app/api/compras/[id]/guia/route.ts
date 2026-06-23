// Guía de remisión / factura / comprobante de pago de Compra en Cloudflare R2.
//
// POST body: { tipo?: "guia"|"factura"|"pago", key, nombre_archivo, tipo_mime, tamano }
// El cliente subió antes a R2 via /api/r2/upload-url con
//   resource = "compra-guia" | "compra-factura" | "compra-pago".
//
// Decisión del user (2026-06): se removió la regla que bloqueaba subir factura
// sin guía. Algunos proveedores entregan factura antes que la guía, o nunca
// emiten guía formal (servicios). Ahora ambos archivos son independientes —
// el orden de subida es libre.
//
// "pago" = comprobante de pago (voucher, boleta de transferencia). Solo se
// muestra/permite cuando compra.tipo_pago = "CONTADO" o "TRANSFERENCIA". El
// gate visual está en la UI; el endpoint acepta el tipo siempre que la compra
// exista (validación blanda — útil para corregir clasificaciones tardías).
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { sanitizarNombreArchivo } from "@/lib/file-uploads";
import { deleteObject } from "@/lib/r2-helpers";
import { R2Keys, otCodigoFor } from "@/lib/r2";
import { getAuditUser } from "@/lib/audit";

import { parseInt4Safe } from "@/lib/ot-formato";
type Params = { params: Promise<{ id: string }> };
type Tipo = "guia" | "factura" | "pago";

function parseTipo(req: NextRequest, fallback?: Tipo): Tipo {
  const t = new URL(req.url).searchParams.get("tipo");
  if (t === "factura") return "factura";
  if (t === "pago") return "pago";
  if (t === "guia") return "guia";
  return fallback ?? "guia";
}

const ETIQUETA: Record<Tipo, string> = {
  guia: "Guía",
  factura: "Factura",
  pago: "Comprobante de pago",
};

// POST — registra una guía o factura ya subida a R2.
export async function POST(req: NextRequest, { params }: Params) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { id } = await params;
    const compraId = parseInt4Safe(id) ?? 0;
    const tipo = parseTipo(req);

    const compra = await prisma.compra.findUnique({
      where: { id: compraId },
      include: { orden_trabajo: { select: { id: true, ot: true } } },
    });
    if (!compra) {
      return NextResponse.json({ error: "Compra no encontrada" }, { status: 404 });
    }

    // (Antes había un gate: si tipo==="factura" y compra.guia_key==null →
    //  bloqueaba con 400. Removido por decisión del user — guía y factura son
    //  independientes; el orden de subida es libre.)

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
    const { key, nombre_archivo, tipo_mime, tamano } = body as {
      key?: unknown;
      nombre_archivo?: unknown;
      tipo_mime?: unknown;
      tamano?: unknown;
    };

    // El path correcto depende de si la compra está asociada a una OT o no.
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
    const expectedPrefix = prefijoBase + "/";
    if (typeof key !== "string" || !key.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: "key fuera del namespace de la compra" }, { status: 400 });
    }
    if (typeof nombre_archivo !== "string" || nombre_archivo.length === 0) {
      return NextResponse.json({ error: "nombre_archivo requerido" }, { status: 400 });
    }
    if (typeof tipo_mime !== "string" || tipo_mime.length === 0) {
      return NextResponse.json({ error: "tipo_mime requerido" }, { status: 400 });
    }
    if (typeof tamano !== "number" || !Number.isFinite(tamano) || tamano <= 0) {
      return NextResponse.json({ error: "tamano inválido" }, { status: 400 });
    }

    // Eliminar archivo anterior en R2 si existe (reemplazo).
    const keyAnterior =
      tipo === "guia"
        ? compra.guia_key
        : tipo === "factura"
          ? compra.factura_key
          : compra.pago_key;
    if (keyAnterior && keyAnterior !== key) {
      try {
        await deleteObject(keyAnterior);
      } catch (error) {
        console.warn("No se pudo eliminar archivo anterior de R2:", error);
        // Continuamos: el archivo viejo queda huérfano pero no bloqueamos al usuario.
      }
    }

    const nombreSanitizado = sanitizarNombreArchivo(nombre_archivo);
    const ahora = new Date();
    const dataUpdate =
      tipo === "guia"
        ? {
            guia_key: key,
            guia_nombre: nombreSanitizado,
            guia_mime: tipo_mime,
            guia_tamano: tamano,
            guia_fecha_subida: ahora,
          }
        : tipo === "factura"
          ? {
              factura_key: key,
              factura_nombre: nombreSanitizado,
              factura_mime: tipo_mime,
              factura_tamano: tamano,
              factura_fecha_subida: ahora,
            }
          : {
              pago_key: key,
              pago_nombre: nombreSanitizado,
              pago_mime: tipo_mime,
              pago_tamano: tamano,
              pago_fecha_subida: ahora,
            };

    const updated = await prisma.compra.update({
      where: { id: compraId },
      data: dataUpdate,
    });

    // Auditoría: si la compra está vinculada a una OT, registrar en su historial.
    // Las compras sueltas (sin OT) no tienen historial propio — se omiten.
    if (compra.ot_id) {
      const usuario = (await getAuditUser(req)) ?? "sistema";
      await prisma.oTHistorial.create({
        data: {
          ot_id: compra.ot_id,
          tipo_operacion: "ADJUNTO",
          descripcion: `${ETIQUETA[tipo]} subida en OC ${compra.numero_po}: ${nombreSanitizado}`,
          usuario,
        },
      });
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("POST /api/compras/[id]/guia error:", error);
    const msg = error instanceof Error ? error.message : "Error al registrar archivo";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE — eliminar archivo subido (R2 + BD)
export async function DELETE(req: NextRequest, { params }: Params) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { id } = await params;
    const compraId = parseInt4Safe(id) ?? 0;
    const tipo = parseTipo(req);

    const compra = await prisma.compra.findUnique({ where: { id: compraId } });
    if (!compra) {
      return NextResponse.json({ error: "Compra no encontrada" }, { status: 404 });
    }

    const keyActual =
      tipo === "guia"
        ? compra.guia_key
        : tipo === "factura"
          ? compra.factura_key
          : compra.pago_key;
    if (!keyActual) {
      return NextResponse.json({ error: `No hay ${ETIQUETA[tipo]} adjunto` }, { status: 404 });
    }

    try {
      await deleteObject(keyActual);
    } catch (error: unknown) {
      // R2 a veces devuelve 404 si el objeto ya no existe (limpieza manual,
      // borrado anterior, etc.). Conceptualmente el archivo ya está borrado:
      // dejamos seguir y limpiamos la metadata en BD igual.
      const httpStatus = (error as { $metadata?: { httpStatusCode?: number } } | undefined)
        ?.$metadata?.httpStatusCode;
      if (httpStatus !== 404) {
        console.error("DELETE compra: fallo R2", error);
        return NextResponse.json({ error: "No se pudo eliminar el archivo de R2" }, { status: 500 });
      }
      console.warn(`DELETE compra: R2 reportó 404 para key ${keyActual} — se procede`);
    }

    const dataUpdate =
      tipo === "guia"
        ? {
            guia_key: null,
            guia_nombre: null,
            guia_mime: null,
            guia_tamano: null,
            guia_fecha_subida: null,
          }
        : tipo === "factura"
          ? {
              factura_key: null,
              factura_nombre: null,
              factura_mime: null,
              factura_tamano: null,
              factura_fecha_subida: null,
            }
          : {
              pago_key: null,
              pago_nombre: null,
              pago_mime: null,
              pago_tamano: null,
              pago_fecha_subida: null,
            };

    const updated = await prisma.compra.update({
      where: { id: compraId },
      data: dataUpdate,
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("DELETE /api/compras/[id]/guia error:", error);
    return NextResponse.json({ error: "Error al eliminar archivo" }, { status: 500 });
  }
}
