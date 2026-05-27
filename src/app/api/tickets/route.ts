// Tickets: bugs / mejoras / preguntas reportadas por usuarios sobre el ERP.
// Canal lateral — no está vinculado a OT.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { R2Keys } from "@/lib/r2";

const ESTADOS_VALIDOS = ["ABIERTO", "EN_PROCESO", "RESUELTO", "CERRADO"] as const;
type Estado = (typeof ESTADOS_VALIDOS)[number];

// Convención del codebase: no se chequea `getToken` en endpoints — la sesión
// se valida a nivel de layout/middleware. Acá solo usamos `getAuditUser` para
// trazabilidad del creador/modificador.

// GET — lista con filtros opcionales (?estado=ABIERTO, ?asignado_a=X)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const estado = searchParams.get("estado");
    const asignado_a = searchParams.get("asignado_a");
    const limit = Math.min(500, Math.max(1, Number(searchParams.get("limit") ?? 100)));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (estado && (ESTADOS_VALIDOS as readonly string[]).includes(estado)) where.estado = estado;
    if (asignado_a) where.asignado_a = asignado_a;

    const data = await prisma.ticket.findMany({
      where,
      orderBy: [{ estado: "asc" }, { created_at: "desc" }],
      take: limit,
    });
    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/tickets error:", error);
    return NextResponse.json({ error: "Error al listar tickets" }, { status: 500 });
  }
}

// POST — crear ticket. Body: { descripcion, captura?: { key, nombre, mime, tamano } }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "JSON inválido" }, { status: 400 });

    const descripcion = body.descripcion;
    if (typeof descripcion !== "string" || descripcion.trim().length === 0) {
      return NextResponse.json({ error: "descripcion requerida" }, { status: 400 });
    }
    if (descripcion.length > 5000) {
      return NextResponse.json({ error: "descripcion demasiado larga (max 5000)" }, { status: 400 });
    }

    // Captura opcional. Si viene, validamos que la key esté en el namespace de tickets.
    const captura = body.captura as { key?: unknown; nombre?: unknown; mime?: unknown; tamano?: unknown } | undefined;
    let capturaData: { captura_key: string; captura_nombre: string; captura_mime: string; captura_tamano: number } | null = null;
    if (captura && typeof captura === "object") {
      const { key, nombre, mime, tamano } = captura;
      if (typeof key !== "string" || !key.startsWith(R2Keys.ticket() + "/")) {
        return NextResponse.json({ error: "captura.key fuera del namespace de tickets" }, { status: 400 });
      }
      if (typeof nombre !== "string" || nombre.length === 0) {
        return NextResponse.json({ error: "captura.nombre requerido" }, { status: 400 });
      }
      if (typeof mime !== "string" || mime.length === 0) {
        return NextResponse.json({ error: "captura.mime requerido" }, { status: 400 });
      }
      if (typeof tamano !== "number" || !Number.isFinite(tamano) || tamano <= 0) {
        return NextResponse.json({ error: "captura.tamano inválido" }, { status: 400 });
      }
      capturaData = { captura_key: key, captura_nombre: nombre, captura_mime: mime, captura_tamano: tamano };
    }

    const usuario = (await getAuditUser(req)) ?? "sistema";

    const created = await prisma.ticket.create({
      data: {
        descripcion: descripcion.trim(),
        estado: "ABIERTO",
        creado_por: usuario,
        ...capturaData,
      },
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/tickets error:", error);
    return NextResponse.json({ error: "Error al crear ticket" }, { status: 500 });
  }
}
