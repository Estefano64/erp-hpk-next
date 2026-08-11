import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { nextNumeroReporteSeguridad } from "@/lib/ssoma-numero";
import { parseSsomaCodigoSearch } from "@/lib/ssoma";
import { parseFotoInput, esKeySsoma } from "@/lib/ssoma-server";
import { R2Keys } from "@/lib/r2";

// GET — lista de reportes de seguridad con filtros y paginación.
// Filtros: search (código RS, lugar, descripción, reportado_por), estado, anio.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit = Math.min(10000, Math.max(1, Number(searchParams.get("limit") ?? 50)));
    const search = searchParams.get("search")?.trim() ?? "";
    const estado = searchParams.get("estado") ?? "";
    const anio = searchParams.get("anio") ?? "";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (search) {
      const codigo = parseSsomaCodigoSearch("RS", search);
      where.OR = [
        ...(codigo ? [{ AND: [{ numero: codigo.numero }, { anio: codigo.anio }] }] : []),
        { lugar: { contains: search, mode: "insensitive" } },
        { descripcion: { contains: search, mode: "insensitive" } },
        { reportado_por: { contains: search, mode: "insensitive" } },
        { cargo: { contains: search, mode: "insensitive" } },
      ];
    }
    if (estado) where.estado = estado;
    if (anio) where.anio = Number(anio);
    if (searchParams.get("incluirInactivos") !== "1") where.activo = true;

    const [data, total] = await Promise.all([
      prisma.reporteSeguridad.findMany({
        where,
        include: {
          acciones: { orderBy: { orden: "asc" } },
          fotos: { orderBy: { id: "asc" } },
        },
        orderBy: { id: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.reporteSeguridad.count({ where }),
    ]);

    return NextResponse.json({ data, total, page });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

// POST — crea un reporte de seguridad (cualquier usuario logueado).
// Genera el correlativo RS-NNNN-YY dentro de la transacción. Acepta fotos ya
// subidas a R2 (array `fotos` con { key, nombre_archivo, tipo_mime, tamano }).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.descripcion || typeof body.descripcion !== "string" || !body.descripcion.trim()) {
      return NextResponse.json({ error: "La descripción es requerida" }, { status: 400 });
    }
    if (body.tipo && !["ACTO_INSEGURO", "CONDICION_INSEGURA"].includes(body.tipo)) {
      return NextResponse.json({ error: "tipo inválido" }, { status: 400 });
    }
    const danos: string[] = Array.isArray(body.danos_potenciales)
      ? body.danos_potenciales.filter((d: unknown) =>
          typeof d === "string" &&
          ["PERSONAL", "EQUIPOS_MATERIALES_AMBIENTALES", "VEHICULARES"].includes(d))
      : [];

    const prefijo = R2Keys.ssomaReporteSeguridad();
    const fotos = (Array.isArray(body.fotos) ? body.fotos : [])
      .map(parseFotoInput)
      .filter((f: ReturnType<typeof parseFotoInput>) => f !== null && esKeySsoma(f.key, prefijo));

    const usuarioCrea = (await getAuditUser(req)) ?? "sistema";

    const created = await prisma.$transaction(async (tx) => {
      const { numero, anio } = await nextNumeroReporteSeguridad(tx);
      return tx.reporteSeguridad.create({
        data: {
          numero,
          anio,
          lugar: body.lugar?.trim() || null,
          fecha: body.fecha ? new Date(body.fecha) : new Date(),
          hora: body.hora?.trim() || null,
          tipo: body.tipo || null,
          reportado_por: body.reportado_por?.trim() || usuarioCrea,
          cargo: body.cargo?.trim() || null,
          danos_potenciales: danos,
          descripcion: body.descripcion.trim(),
          estado: "ABIERTO",
          usuario_crea: usuarioCrea,
          fotos: {
            create: fotos.map((f: NonNullable<ReturnType<typeof parseFotoInput>>) => ({
              nombre_archivo: f.nombre_archivo,
              r2_key: f.key,
              tipo_mime: f.tipo_mime,
              tamano: f.tamano,
              usuario_sube: usuarioCrea,
            })),
          },
        },
        include: { acciones: true, fotos: true },
      });
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}
