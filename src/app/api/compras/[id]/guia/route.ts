// Guía de remisión / factura de Compra en Cloudflare R2.
//
// POST body: { tipo?: "guia"|"factura", key, nombre_archivo, tipo_mime, tamano }
// El cliente subió antes a R2 via /api/r2/upload-url con
//   resource = "compra-guia" | "compra-factura".
//
// Regla de negocio preservada: no se acepta factura si la compra no tiene guía.
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { sanitizarNombreArchivo } from "@/lib/file-uploads";
import { deleteObject } from "@/lib/r2-helpers";
import { R2Keys, otCodigoFor } from "@/lib/r2";
import { getAuditUser } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };
type Tipo = "guia" | "factura";

function parseTipo(req: NextRequest, fallback?: Tipo): Tipo {
  const t = new URL(req.url).searchParams.get("tipo");
  if (t === "factura") return "factura";
  if (t === "guia") return "guia";
  return fallback ?? "guia";
}

// POST — registra una guía o factura ya subida a R2.
export async function POST(req: NextRequest, { params }: Params) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { id } = await params;
    const compraId = Number(id);
    const tipo = parseTipo(req);

    const compra = await prisma.compra.findUnique({
      where: { id: compraId },
      include: { orden_trabajo: { select: { id: true, ot: true } } },
    });
    if (!compra) {
      return NextResponse.json({ error: "Compra no encontrada" }, { status: 404 });
    }

    if (tipo === "factura" && !compra.guia_key) {
      return NextResponse.json(
        {
          error: "No se puede subir factura: primero cargá la guía de remisión del proveedor.",
          falta: "guia",
        },
        { status: 400 },
      );
    }

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
    const expectedPrefix = (compra.orden_trabajo
      ? (tipo === "guia"
          ? R2Keys.compraGuia(otCodigoFor(compra.orden_trabajo), compra.numero_po)
          : R2Keys.compraFactura(otCodigoFor(compra.orden_trabajo), compra.numero_po))
      : (tipo === "guia"
          ? R2Keys.compraSueltaGuia(compra.numero_po)
          : R2Keys.compraSueltaFactura(compra.numero_po))) + "/";
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
    const keyAnterior = tipo === "guia" ? compra.guia_key : compra.factura_key;
    if (keyAnterior && keyAnterior !== key) {
      try {
        await deleteObject(keyAnterior);
      } catch (error) {
        console.warn("No se pudo eliminar archivo anterior de R2:", error);
        // Continuamos: el archivo viejo queda huérfano pero no bloqueamos al usuario.
      }
    }

    const nombreSanitizado = sanitizarNombreArchivo(nombre_archivo);
    const dataUpdate =
      tipo === "guia"
        ? {
            guia_key: key,
            guia_nombre: nombreSanitizado,
            guia_mime: tipo_mime,
            guia_tamano: tamano,
            guia_fecha_subida: new Date(),
          }
        : {
            factura_key: key,
            factura_nombre: nombreSanitizado,
            factura_mime: tipo_mime,
            factura_tamano: tamano,
            factura_fecha_subida: new Date(),
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
          descripcion: `${tipo === "guia" ? "Guía" : "Factura"} subida en OC ${compra.numero_po}: ${nombreSanitizado}`,
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
    const compraId = Number(id);
    const tipo = parseTipo(req);

    const compra = await prisma.compra.findUnique({ where: { id: compraId } });
    if (!compra) {
      return NextResponse.json({ error: "Compra no encontrada" }, { status: 404 });
    }

    const keyActual = tipo === "guia" ? compra.guia_key : compra.factura_key;
    if (!keyActual) {
      return NextResponse.json({ error: `No hay ${tipo} adjunta` }, { status: 404 });
    }

    try {
      await deleteObject(keyActual);
    } catch (error) {
      console.error("DELETE compra: fallo R2", error);
      return NextResponse.json({ error: "No se pudo eliminar el archivo de R2" }, { status: 500 });
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
        : {
            factura_key: null,
            factura_nombre: null,
            factura_mime: null,
            factura_tamano: null,
            factura_fecha_subida: null,
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
