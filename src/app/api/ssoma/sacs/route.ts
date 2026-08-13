import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { nextNumeroSac } from "@/lib/ssoma-numero";
import { parseSsomaCodigoSearch, formatSacCodigo } from "@/lib/ssoma";
import {
  esEncargadoSsoma, sacDataDesdeBody, sacAccionesDesdeBody,
  responsablesSsomaPorNombre, notificarNuevosResponsables,
} from "@/lib/ssoma-server";
import { getUsuarioIdSesion } from "@/lib/notificaciones-server";
import { TIPOS_NOTIFICACION } from "@/lib/notificaciones";

// GET — lista de SACs con filtros y paginación.
// Filtros: search (código SAC, descripción, proceso), estado, anio.
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
      const codigo = parseSsomaCodigoSearch("SAC", search);
      where.OR = [
        ...(codigo ? [{ AND: [{ numero: codigo.numero }, { anio: codigo.anio }] }] : []),
        { descripcion: { contains: search, mode: "insensitive" } },
        { proceso_responsable: { contains: search, mode: "insensitive" } },
        { identificado_por: { contains: search, mode: "insensitive" } },
        { norma_requisito: { contains: search, mode: "insensitive" } },
      ];
    }
    if (estado) where.estado = estado;
    if (anio) where.anio = Number(anio);
    if (searchParams.get("incluirInactivos") !== "1") where.activo = true;

    const [data, total] = await Promise.all([
      prisma.solicitudAccionCorrectiva.findMany({
        where,
        include: {
          acciones: { orderBy: { orden: "asc" } },
          salida_no_conforme: { select: { id: true, numero: true, anio: true } },
        },
        orderBy: { id: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.solicitudAccionCorrectiva.count({ where }),
    ]);

    return NextResponse.json({ data, total, page });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

// POST — crea una SAC standalone (sin salida no conforme).
// Solo el encargado de seguridad (además del gating del middleware).
export async function POST(req: NextRequest) {
  try {
    if (!(await esEncargadoSsoma(req))) {
      return NextResponse.json(
        { error: "Solo el encargado de seguridad puede crear SACs" },
        { status: 403 },
      );
    }
    const body = await req.json();

    if (!body.descripcion || typeof body.descripcion !== "string" || !body.descripcion.trim()) {
      return NextResponse.json({ error: "La descripción es requerida" }, { status: 400 });
    }
    const parsed = sacDataDesdeBody(body);
    if (parsed.error) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const mapaResponsables = await responsablesSsomaPorNombre();
    const acciones = sacAccionesDesdeBody(body, mapaResponsables) ?? [];

    const usuarioCrea = (await getAuditUser(req)) ?? "sistema";

    const created = await prisma.$transaction(async (tx) => {
      const { numero, anio } = await nextNumeroSac(tx);
      return tx.solicitudAccionCorrectiva.create({
        data: {
          ...parsed.data,
          numero,
          anio,
          descripcion: body.descripcion.trim(),
          identificado_por: parsed.data.identificado_por ?? usuarioCrea,
          estado: "ABIERTA",
          usuario_crea: usuarioCrea,
          acciones: { create: acciones },
        },
        include: {
          acciones: { orderBy: { orden: "asc" } },
          salida_no_conforme: { select: { id: true, numero: true, anio: true } },
        },
      });
    });

    // Aviso a los responsables asignados (acciones + responsable del cierre).
    const codigo = formatSacCodigo(created.numero, created.anio);
    await notificarNuevosResponsables({
      antes: [],
      ahora: [...acciones.map((a) => a.responsable), created.responsable_cierre],
      tipo: TIPOS_NOTIFICACION.SSOMA_ACCION_SAC,
      titulo: `${codigo}: te asignaron una acción correctiva`,
      mensaje: created.descripcion?.slice(0, 200) ?? null,
      url: `/ssoma/sacs?search=${codigo}`,
      creadaPor: usuarioCrea,
      omitirUsuarioId: await getUsuarioIdSesion(req),
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}
