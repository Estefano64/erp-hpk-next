import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateOnly } from "@/lib/dates";

// Genera el siguiente código OT-YYYY-XXXX
async function generarNumeroOT(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `OT-${year}-`;

  const last = await prisma.ordenTrabajo.findFirst({
    where: { ot: { startsWith: prefix } },
    orderBy: { id: "desc" },
    select: { ot: true },
  });

  const lastNum = last?.ot ? parseInt(last.ot.replace(prefix, ""), 10) : 0;
  return `${prefix}${String(lastNum + 1).padStart(4, "0")}`;
}

// GET — lista con filtros y paginación
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 20)));
    const search = searchParams.get("search")?.trim() ?? "";
    const otStatus = searchParams.get("ot_status") ?? "";
    const recursosStatus = searchParams.get("recursos_status") ?? "";
    const tallerStatus = searchParams.get("taller_status") ?? "";
    const clienteId = searchParams.get("cliente") ?? "";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (search) {
      where.OR = [
        { ot: { contains: search, mode: "insensitive" } },
        { equipo_codigo: { contains: search, mode: "insensitive" } },
        { ns: { contains: search, mode: "insensitive" } },
        { wo_cliente: { contains: search, mode: "insensitive" } },
        { descripcion: { contains: search, mode: "insensitive" } },
      ];
    }
    if (otStatus) where.ot_status_codigo = otStatus;
    if (recursosStatus) where.recursos_status_codigo = recursosStatus;
    if (tallerStatus) where.taller_status_codigo = tallerStatus;
    if (clienteId) where.id_cliente = Number(clienteId);

    const [data, total] = await Promise.all([
      prisma.ordenTrabajo.findMany({
        where,
        include: {
          cliente: true,
          codigo_reparacion: { include: { tipo: true, flota: true, fabricante: true, posicion: true } },
          fabricante: true,
          garantia: true,
          atencion_reparacion: true,
          tipo_reparacion: true,
          tipo_garantia: true,
          prioridad_atencion: true,
          base_metalica: true,
          ot_status: true,
          recursos_status: true,
          taller_status: true,
        },
        orderBy: { id: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.ordenTrabajo.count({ where }),
    ]);

    return NextResponse.json({ data, total, page });
  } catch (error) {
    console.error("GET /api/ordenes-trabajo error:", error);
    return NextResponse.json({ error: "Error al obtener datos" }, { status: 500 });
  }
}

// POST — crear nueva OT
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const ot = await generarNumeroOT();

    // Si atención es "Contrato", buscar días del contrato por cliente + cod_rep
    let contratoDias: number | null = null;
    let fechaRequerimiento: Date | null = null;

    if (body.atencion_reparacion_codigo === "Contrato" && body.id_cliente && body.id_cod_rep) {
      const contrato = await prisma.contrato.findFirst({
        where: {
          cliente_id: body.id_cliente,
          cod_rep_id: body.id_cod_rep,
          activo: true,
        },
        orderBy: { id: "desc" },
      });
      if (contrato) {
        contratoDias = contrato.dias_reparacion;
        if (body.fecha_recepcion) {
          const recepcion = parseDateOnly(body.fecha_recepcion)!;
          fechaRequerimiento = new Date(recepcion);
          fechaRequerimiento.setDate(fechaRequerimiento.getDate() + contrato.dias_reparacion);
        }
      }
    } else if (body.fecha_requerimiento_cliente) {
      // Presupuesto o Emergencia: fecha manual, días calculados
      fechaRequerimiento = parseDateOnly(body.fecha_requerimiento_cliente);
      if (body.fecha_recepcion) {
        const recepcion = parseDateOnly(body.fecha_recepcion)!;
        const diff = Math.ceil((fechaRequerimiento!.getTime() - recepcion.getTime()) / (1000 * 60 * 60 * 24));
        contratoDias = diff;
      }
    }

    // Calcular % PCR
    let porcentajePcr: number | null = null;
    if (body.pcr && body.horas && Number(body.pcr) > 0) {
      porcentajePcr = Number(((Number(body.horas) / Number(body.pcr)) * 100).toFixed(2));
    }

    // Auto-completar datos del código reparable
    let tipo: string | null = null;
    let np: string | null = null;
    let descripcion: string | null = null;
    let idFabricante: number | null = null;
    let codRepFlota: string | null = null;
    let codRepPosicion: string | null = null;

    if (body.id_cod_rep) {
      const codRep = await prisma.codigoReparacion.findUnique({
        where: { cod_rep_id: body.id_cod_rep },
        include: { tipo: true, flota: true, fabricante: true, posicion: true },
      });
      if (codRep) {
        tipo = codRep.tipo?.nombre ?? null;
        np = codRep.np ?? null;
        descripcion = codRep.descripcion;
        idFabricante = codRep.fabricante?.fabricante_id ?? null;
        codRepFlota = codRep.flota?.nombre ?? null;
        codRepPosicion = codRep.posicion?.nombre ?? null;
      }
    }

    // Tipo Garantía automático
    let tipoGarantiaCodigo = body.tipo_garantia_codigo ?? null;
    if (body.garantia_codigo === "Si") {
      tipoGarantiaCodigo = "Por definir";
    } else if (body.garantia_codigo === "No" && !tipoGarantiaCodigo) {
      tipoGarantiaCodigo = "NA";
    }

    const created = await prisma.ordenTrabajo.create({
      data: {
        ot,
        id_cliente: body.id_cliente || null,
        estrategia: body.estrategia ?? false,
        id_cod_rep: body.id_cod_rep || null,
        tipo,
        np,
        descripcion,
        id_fabricante: idFabricante,
        cod_rep_flota: codRepFlota,
        cod_rep_posicion: codRepPosicion,
        equipo_codigo: body.equipo_codigo || null,
        ns: body.ns || null,
        plaqueteo: body.plaqueteo || null,
        wo_cliente: body.wo_cliente || null,
        po_cliente: body.po_cliente || null,
        id_viajero: body.id_viajero || null,
        guia_remision: body.guia_remision || null,
        empresa_entrega: body.empresa_entrega || null,
        fecha_recepcion: parseDateOnly(body.fecha_recepcion),
        pcr: body.pcr ?? null,
        horas: body.horas ?? null,
        porcentaje_pcr: porcentajePcr,
        garantia_codigo: body.garantia_codigo || null,
        atencion_reparacion_codigo: body.atencion_reparacion_codigo || null,
        tipo_reparacion_codigo: body.tipo_reparacion_codigo || null,
        tipo_garantia_codigo: tipoGarantiaCodigo,
        prioridad_atencion_codigo: body.prioridad_atencion_codigo || null,
        contrato_dias: contratoDias,
        base_metalica_codigo: body.base_metalica_codigo || null,
        comentarios: body.comentarios || null,
        fecha_requerimiento_cliente: fechaRequerimiento,
        // Status por defecto al crear
        ot_status_codigo: "Abierta",
        recursos_status_codigo: "En revision procesos",
        taller_status_codigo: "Pdt Evaluación",
      },
      include: {
        cliente: true,
        codigo_reparacion: true,
        fabricante: true,
        ot_status: true,
        recursos_status: true,
        taller_status: true,
      },
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/ordenes-trabajo error:", error);
    return NextResponse.json({ error: "Error al crear OT" }, { status: 500 });
  }
}
