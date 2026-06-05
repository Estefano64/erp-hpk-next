import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { nextNumeroCorrectivo } from "@/lib/ot-numero";

// GET — lista con filtros y paginación.
// Filtros: search (código RC, equipo, falla), estado, equipo, anio.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit = Math.min(10000, Math.max(1, Number(searchParams.get("limit") ?? 50)));
    const search = searchParams.get("search")?.trim() ?? "";
    const estado = searchParams.get("estado") ?? "";
    const equipo = searchParams.get("equipo") ?? "";
    const anio = searchParams.get("anio") ?? "";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (search) {
      // Aceptamos "RC-0001-26" o el correlativo raw o cualquier texto en falla/equipo.
      const m = search.match(/^RC-?(\d+)-?(\d{2})$/i);
      const numero = m ? Number(m[1]) : null;
      const anioSearch = m ? Number(m[2]) : null;
      where.OR = [
        ...(numero != null && anioSearch != null
          ? [{ AND: [{ numero }, { anio: anioSearch }] }]
          : []),
        { equipo_codigo: { contains: search, mode: "insensitive" } },
        { detalle_falla: { contains: search, mode: "insensitive" } },
        { reportado_por: { contains: search, mode: "insensitive" } },
      ];
    }
    if (estado) where.estado = estado;
    if (equipo) where.equipo_codigo = equipo;
    if (anio) where.anio = Number(anio);
    if (searchParams.get("incluirInactivos") !== "1") where.activo = true;

    const [data, total] = await Promise.all([
      prisma.reporteCorrectivo.findMany({
        where,
        include: {
          equipo: { select: { codigo: true, descripcion: true, tipo_codigo: true } },
          area: { select: { codigo: true, nombre: true } },
          ot_interna: {
            select: {
              id: true,
              ot: true,
              ot_status_codigo: true,
              ot_status: { select: { nombre: true } },
            },
          },
        },
        orderBy: { id: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.reporteCorrectivo.count({ where }),
    ]);

    return NextResponse.json({ data, total, page });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

// POST — crea un reporte correctivo en estado REPORTADO (etapa 1).
// Campos mínimos: equipo_codigo + detalle_falla.
// Área se toma del equipo automáticamente si no viene en el body.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.equipo_codigo) {
      return NextResponse.json({ error: "equipo_codigo es requerido" }, { status: 400 });
    }
    if (!body.detalle_falla || typeof body.detalle_falla !== "string" || !body.detalle_falla.trim()) {
      return NextResponse.json({ error: "detalle_falla es requerido" }, { status: 400 });
    }

    const equipo = await prisma.equipo.findUnique({
      where: { codigo: body.equipo_codigo },
      select: { codigo: true, area_codigo: true },
    });
    if (!equipo) {
      return NextResponse.json({ error: "Equipo no encontrado" }, { status: 404 });
    }
    const areaCodigo: string = body.area_codigo || equipo.area_codigo;

    const usuarioCrea = (await getAuditUser(req)) ?? "sistema";

    const created = await prisma.$transaction(async (tx) => {
      const { numero, anio } = await nextNumeroCorrectivo(tx);
      return tx.reporteCorrectivo.create({
        data: {
          numero,
          anio,
          equipo_codigo: equipo.codigo,
          area_codigo: areaCodigo,
          fecha: body.fecha ? new Date(body.fecha) : new Date(),
          detalle_falla: body.detalle_falla.trim(),
          reportado_por: body.reportado_por?.trim() || usuarioCrea,
          fecha_reporte: new Date(),
          estado: "REPORTADO",
          usuario_crea: usuarioCrea,
        },
        include: {
          equipo: { select: { codigo: true, descripcion: true } },
          area: { select: { codigo: true, nombre: true } },
        },
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
