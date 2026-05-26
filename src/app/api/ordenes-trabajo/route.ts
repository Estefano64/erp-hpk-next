import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
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
    const limit = Math.min(10000, Math.max(1, Number(searchParams.get("limit") ?? 20)));
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
          tipo_ot: true,
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

    // TipoOT (REP/BIE/SER) es requerido — desbloqueado en Fase D1.
    if (!body.tipo_codigo || typeof body.tipo_codigo !== "string") {
      return NextResponse.json({ error: "tipo_codigo es requerido (REP / BIE / SER)" }, { status: 400 });
    }

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

    // Datos del cilindro: si hay cod_rep, deriva de ahí; si no, usa los valores manuales del body.
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
    } else {
      tipo = body.tipo ?? null;
      np = body.np ?? null;
      descripcion = body.descripcion ?? null;
      idFabricante = body.id_fabricante ? Number(body.id_fabricante) : null;
      codRepFlota = body.cod_rep_flota ?? null;
      codRepPosicion = body.cod_rep_posicion ?? null;
    }

    // Tipo garantía: confiar en lo que envía el form (form ya lo envía como "NA" si garantia=false).
    const tipoGarantiaCodigo = body.tipo_garantia_codigo ?? (body.garantia_codigo === "No" ? "NA" : null);

    const usuarioCrea = (await getAuditUser(req)) ?? "sistema";

    const created = await prisma.ordenTrabajo.create({
      data: {
        ot,
        id_cliente: body.id_cliente || null,
        estrategia: body.estrategia ?? false,
        id_cod_rep: body.id_cod_rep || null,
        tipo,
        tipo_codigo: body.tipo_codigo,
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
        po_item: body.po_item || null,
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
        monto_cotizacion: body.monto_cotizacion != null && body.monto_cotizacion !== "" ? body.monto_cotizacion : null,
        moneda_cotizacion_codigo: body.moneda_cotizacion_codigo || null,
        fecha_requerimiento_cliente: fechaRequerimiento,
        // Status por defecto al crear
        ot_status_codigo: "Abierta",
        recursos_status_codigo: "En revision procesos",
        taller_status_codigo: "Pdt Evaluación",
        // Auditoría de creación
        usuario_crea: usuarioCrea,
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

    const usuario = usuarioCrea;

    // Registrar evento de creación en el historial
    try {
      await prisma.oTHistorial.create({
        data: {
          ot_id: created.id,
          tipo_operacion: "CREACION",
          descripcion: `OT ${created.ot} creada${created.cliente?.razon_social ? ` para ${created.cliente.razon_social}` : ""}.`,
          usuario,
          fecha: new Date(),
        },
      });
    } catch (e) {
      console.error("No se pudo registrar historial de creación:", e);
    }

    // Auto-generar planificación + requerimientos desde el cod_rep (si existe)
    if (body.id_cod_rep && created.codigo_reparacion) {
      const codRepCodigo = created.codigo_reparacion.codigo;
      // 1) Planificación desde operacion_cod_rep
      try {
        const operaciones = await prisma.operacionCodRep.findMany({
          where: { cod_rep_codigo: codRepCodigo, activo: true },
          orderBy: { orden: "asc" },
        });
        if (operaciones.length > 0) {
          await prisma.planificacionOT.createMany({
            data: operaciones.map((op) => ({
              ot_id: created.id,
              operacion_cod_rep_id: op.operacion_cod_rep_id,
              componente: op.componente_codigo,
              operacion_codigo: op.operacion_reparacion_codigo ?? op.trabajo.slice(0, 20),
              descripcion: op.trabajo,
              orden: op.orden,
              horas_estimadas: op.horas ?? null,
              estado: "abierto",
            })),
          });
          await prisma.oTHistorial.create({
            data: {
              ot_id: created.id,
              tipo_operacion: "TAREAS_GENERADAS",
              descripcion: `Planificación auto-generada desde ${codRepCodigo}: ${operaciones.length} tarea(s).`,
              usuario,
            },
          });
        }
      } catch (e) {
        console.error("Auto-gen planificación falló:", e);
      }

      // 2) Requerimientos desde tarea (template del cod_rep)
      try {
        const tareas = await prisma.tarea.findMany({
          where: { cod_rep_codigo: codRepCodigo },
          orderBy: { item_numero: "asc" },
        });
        if (tareas.length > 0) {
          const { nextNroReq, pickDescripcionFromTarea } = await import("@/lib/requerimientos");
          await prisma.$transaction(async (tx) => {
            const nroReq = await nextNroReq(tx);

            // Pre-cargar Materiales con todos los campos que usamos (descripción real,
            // unidad de medida y fabricante específico — no la del cod_rep que es genérica).
            const codigosMat = [...new Set(tareas.filter((t) => t.material_codigo).map((t) => t.material_codigo!))];
            const materiales = codigosMat.length > 0
              ? await tx.material.findMany({
                  where: { codigo: { in: codigosMat } },
                  select: { material_id: true, codigo: true, descripcion: true, unidad_medida_codigo: true, fabricante_codigo: true },
                })
              : [];
            const matByCodigo = new Map(materiales.map((m) => [m.codigo, m]));

            // Pre-cargar Servicios para los SER con servicio_codigo asignado.
            const codigosSvc = [...new Set(tareas.filter((t) => t.servicio_codigo).map((t) => t.servicio_codigo!))];
            const servicios = codigosSvc.length > 0
              ? await tx.servicioReparacion.findMany({
                  where: { codigo: { in: codigosSvc } },
                  select: { codigo: true, nombre: true, descripcion: true },
                })
              : [];
            const svcByCodigo = new Map(servicios.map((s) => [s.codigo, s]));

            for (let i = 0; i < tareas.length; i++) {
              const t = tareas[i];
              const mat = t.material_codigo ? matByCodigo.get(t.material_codigo) : null;
              await tx.oTRepuesto.create({
                data: {
                  ot_id: created.id,
                  material_id: mat?.material_id ?? null,
                  material_codigo: t.material_codigo ?? null,
                  tipo_codigo: t.tipo_codigo,
                  cantidad: t.requerimiento,
                  descripcion: pickDescripcionFromTarea(t, matByCodigo, svcByCodigo),
                  texto: t.texto ?? null,
                  fabricante_codigo: t.fabricante_codigo ?? mat?.fabricante_codigo ?? null,
                  unidad_medida: mat?.unidad_medida_codigo ?? "UNIDAD",
                  precio_unitario: t.precio ?? null,
                  moneda: "USD",
                  es_adicional: false,
                  nro_req: nroReq,
                  item_req: i + 1,
                  status_requerimiento_codigo: "BORRADOR",
                  usuario_solicita: usuario,
                },
              });
            }
            await tx.oTHistorial.create({
              data: {
                ot_id: created.id,
                tipo_operacion: "REQUERIMIENTO",
                descripcion: `Requerimiento ${nroReq} auto-generado desde ${codRepCodigo}: ${tareas.length} item(s).`,
                usuario,
              },
            });
          });
        }
      } catch (e) {
        console.error("Auto-gen requerimientos falló:", e);
      }
    }

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/ordenes-trabajo error:", error);
    return NextResponse.json({ error: "Error al crear OT" }, { status: 500 });
  }
}
