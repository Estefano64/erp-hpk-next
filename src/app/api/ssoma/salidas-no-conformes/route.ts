import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { nextNumeroSalidaNoConforme } from "@/lib/ssoma-numero";
import { parseSsomaCodigoSearch } from "@/lib/ssoma";
import { parseFotoInput, esKeySsoma, esEncargadoSsoma } from "@/lib/ssoma-server";
import { R2Keys } from "@/lib/r2";

// GET — lista de salidas no conformes con filtros y paginación.
// Filtros: search (código SNC, área, descripción, reportado_por), estado, anio.
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
      const codigo = parseSsomaCodigoSearch("SNC", search);
      where.OR = [
        ...(codigo ? [{ AND: [{ numero: codigo.numero }, { anio: codigo.anio }] }] : []),
        { area: { contains: search, mode: "insensitive" } },
        { descripcion: { contains: search, mode: "insensitive" } },
        { reportado_por: { contains: search, mode: "insensitive" } },
        { accion_tomada: { contains: search, mode: "insensitive" } },
      ];
    }
    if (estado) where.estado = estado;
    if (anio) where.anio = Number(anio);
    if (searchParams.get("incluirInactivos") !== "1") where.activo = true;

    const [data, total] = await Promise.all([
      prisma.salidaNoConforme.findMany({
        where,
        include: {
          fotos: { orderBy: { id: "asc" } },
          sacs: { select: { id: true, numero: true, anio: true, estado: true, activo: true } },
        },
        orderBy: { id: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.salidaNoConforme.count({ where }),
    ]);

    return NextResponse.json({ data, total, page });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

// POST — crea una salida no conforme (cualquier usuario logueado).
// Genera el correlativo SNC-NNNN-YY. Acepta fotos ya subidas a R2.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.descripcion || typeof body.descripcion !== "string" || !body.descripcion.trim()) {
      return NextResponse.json({ error: "La descripción es requerida" }, { status: 400 });
    }

    const prefijo = R2Keys.ssomaSalidaNoConforme();
    const fotos = (Array.isArray(body.fotos) ? body.fotos : [])
      .map(parseFotoInput)
      .filter((f: ReturnType<typeof parseFotoInput>) => f !== null && esKeySsoma(f.key, prefijo));

    const usuarioCrea = (await getAuditUser(req)) ?? "sistema";

    const created = await prisma.$transaction(async (tx) => {
      const { numero, anio } = await nextNumeroSalidaNoConforme(tx);
      return tx.salidaNoConforme.create({
        data: {
          numero,
          anio,
          fecha: body.fecha ? new Date(body.fecha) : new Date(),
          area: body.area?.trim() || null,
          descripcion: body.descripcion.trim(),
          reportado_por: body.reportado_por?.trim() || usuarioCrea,
          area_reportante: body.area_reportante?.trim() || null,
          accion_tomada: body.accion_tomada?.trim() || null,
          generado_por: body.generado_por?.trim() || usuarioCrea,
          responsable_salida: body.responsable_salida?.trim() || null,
          // Solicitar una SAC es del encargado de seguridad (o admin): para
          // el resto el flag se ignora aunque venga en el body.
          requiere_sac: body.requiere_sac === true && (await esEncargadoSsoma(req)),
          observaciones: body.observaciones?.trim() || null,
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
        include: { fotos: true, sacs: true },
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
