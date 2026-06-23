import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseInt4Safe } from "@/lib/ot-formato";

// GET /api/ordenes-trabajo/lookup — endpoint liviano de búsqueda de OTs.
// Devuelve solo id, ot (número), descripcion y cliente (nombre corto). Útil
// para autocomplete en formularios donde el usuario quiere asociar una OT
// (ej: entrega de suministros, préstamo de herramientas).
//
// Query params:
//   q     — texto libre. Si es numérico, matchea exact por OT; si no,
//           busca "contains" en descripción o cliente.
//   limit — máximo a devolver (default 50, max 200).
export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 50)));

    // Filtro base: solo OTs activas (no anuladas) y con número de OT no nulo.
    const where: Record<string, unknown> = { activo: true, ot: { not: null } };
    if (q) {
      const otNum = parseInt4Safe(q);
      if (otNum != null) {
        // Si es numérico, buscar OTs cuyo número comience con ese valor.
        // (No hay startsWith para int — usamos rango).
        // Simplificación: matchear exacto si es la longitud típica, sino contains via toString.
        // Para mantenerlo simple: si tiene 6 dígitos, exact; sino exact also.
        where.ot = otNum;
      } else {
        where.OR = [
          { descripcion: { contains: q, mode: "insensitive" } },
          { cliente: { is: { razon_social: { contains: q, mode: "insensitive" } } } },
          { cliente: { is: { nombre_comercial: { contains: q, mode: "insensitive" } } } },
        ];
      }
    }

    const rows = await prisma.ordenTrabajo.findMany({
      where,
      select: {
        id: true,
        ot: true,
        descripcion: true,
        cliente: { select: { codigo: true, nombre_comercial: true, razon_social: true } },
      },
      orderBy: { ot: "desc" },
      take: limit,
    });

    const data = rows.map((r) => ({
      id: r.id,
      ot: r.ot,
      descripcion: r.descripcion,
      cliente: r.cliente?.nombre_comercial ?? r.cliente?.razon_social ?? null,
    }));

    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/ordenes-trabajo/lookup error:", error);
    return NextResponse.json({ error: "Error en lookup de OTs" }, { status: 500 });
  }
}
