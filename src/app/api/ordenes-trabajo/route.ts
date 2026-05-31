import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { parseDateOnly } from "@/lib/dates";

// Genera el siguiente código de OT en formato NNNNYY:
//   - los últimos 2 dígitos son el año (ej. "26" para 2026)
//   - los 4 anteriores son el correlativo del año (ej. "0001")
// Ejemplo: la primera OT del 2026 es "000126".
//
// OTs antiguas con formato "OT-YYYY-NNNN" se ignoran al calcular el correlativo
// (solo cuentan las que matchean exactamente \d{4}YY).
//
// MIN_CORRELATIVO_POR_ANIO: punto de partida del correlativo cuando todavía
// no hay OTs nuevas registradas. Permite reservar números porque las OTs
// antiguas se importarán después con código mayor al "min". Una vez importadas
// (o cuando se cree una OT con número mayor), `maxN > minN` y este min queda
// como histórico — se puede borrar la entrada del año cuando ya no aplique.
const MIN_CORRELATIVO_POR_ANIO: Record<string, number> = {
  "26": 3905, // primera OT nueva del 2026 será 390626; las anteriores se importarán después
};

// Genera el siguiente número de OT con CONTADOR INDEPENDIENTE POR TIPO.
//   - REP (Reparación): comparte contador con históricas (tipo_codigo NULL),
//     porque las históricas importadas de BDU son todas reparaciones.
//     Continúa la serie actual (ej. 392026 → 392126 → ...).
//   - BIE (Bien): contador propio. Empieza en 1 si no hay Bienes previos
//     en el año. Se muestra como V<num> via formatOtCodigo().
//   - SER (Servicio): contador propio. Mismo esquema, prefijo S.
//
// El formato sigue siendo NNNNYY (correlativo * 100 + año-2-dígitos).
// El "MIN reservado" (MIN_CORRELATIVO_POR_ANIO) solo aplica a REP/null.
async function generarNumeroOT(tipoCodigo: string | null | undefined): Promise<number> {
  const year2 = new Date().getFullYear() % 100; // ej. 26

  // Ámbito del contador según tipo:
  //   BIE → solo OTs con tipo_codigo='BIE'
  //   SER → solo OTs con tipo_codigo='SER'
  //   REP o null/otro → tipo_codigo IN ('REP', NULL) (las históricas vienen sin tipo)
  const tipoWhere = tipoCodigo === "BIE"
    ? { tipo_codigo: "BIE" }
    : tipoCodigo === "SER"
      ? { tipo_codigo: "SER" }
      : { OR: [{ tipo_codigo: "REP" }, { tipo_codigo: null }] };

  const candidatos = await prisma.ordenTrabajo.findMany({
    // Solo OTs activas: una OT desactivada libera su número (se puede reusar).
    where: { ot: { not: null, lt: 1_000_000 }, activo: true, ...tipoWhere },
    select: { ot: true },
  });

  let maxN = 0;
  for (const { ot } of candidatos) {
    if (ot == null) continue;
    if (ot % 100 !== year2) continue;
    const n = Math.floor(ot / 100);
    if (n > maxN) maxN = n;
  }

  // El MIN reservado solo aplica al ámbito histórico (REP/null). BIE y SER
  // empiezan naturalmente desde 1 dentro del año.
  const aplicaMin = tipoCodigo !== "BIE" && tipoCodigo !== "SER";
  const minN = aplicaMin
    ? (MIN_CORRELATIVO_POR_ANIO[String(year2).padStart(2, "0")] ?? 0)
    : 0;
  const next = Math.max(maxN, minN) + 1;
  // Devolvemos el código como número: NNNNYY = N * 100 + YY (sin padding).
  return next * 100 + year2;
}

// GET — lista con filtros y paginación
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit = Math.min(10000, Math.max(1, Number(searchParams.get("limit") ?? 20)));
    const search = searchParams.get("search")?.trim() ?? "";
    const clienteId = searchParams.get("cliente") ?? "";
    // El export a Excel pide ?export=1 para recibir también los campos
    // históricos. El listado normal los omite para aligerar el payload.
    const isExport = searchParams.get("export") === "1";

    // Campos escalares que SOLO usa el export (históricos importados del Excel).
    // La tabla del listado no los muestra, así que los omitimos cuando no es
    // export — con 3000+ OTs aligera bastante la respuesta.
    const omitExportOnly = {
      fecha_evaluacion: true, evaluador: true, nro_informe_evaluacion: true,
      fecha_cotizacion: true, nro_cotizacion: true, monto_cotizacion: true,
      fecha_aprobacion: true, fecha_entrega: true, cumplimiento: true,
      dias_proceso: true, dias_en_taller: true, nro_factura: true, fecha_facturacion: true,
    } as const;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (search) {
      // `ot` ahora es INTEGER en DB. Si la búsqueda es un número, hacemos
      // exact match contra `ot`. Si no, no se busca por ot.
      const otNum = /^\d+$/.test(search) ? Number(search) : null;
      where.OR = [
        ...(otNum != null ? [{ ot: otNum }] : []),
        { equipo_codigo: { contains: search, mode: "insensitive" } },
        { ns: { contains: search, mode: "insensitive" } },
        { wo_cliente: { contains: search, mode: "insensitive" } },
        { descripcion: { contains: search, mode: "insensitive" } },
      ];
    }
    // Selects/filtros por columna FK (value = codigo del catálogo).
    const FK_CODIGO: Record<string, string> = {
      ot_status: "ot_status_codigo",
      recursos_status: "recursos_status_codigo",
      taller_status: "taller_status_codigo",
      prioridad_atencion: "prioridad_atencion_codigo",
      atencion_reparacion: "atencion_reparacion_codigo",
      tipo_reparacion: "tipo_reparacion_codigo",
      tipo_garantia: "tipo_garantia_codigo",
      tipo_ot: "tipo_codigo",
    };
    for (const [param, col] of Object.entries(FK_CODIGO)) {
      const v = searchParams.get(param);
      if (v) where[col] = v;
    }
    if (clienteId) where.id_cliente = Number(clienteId);

    // Filtro por año (2 dígitos, ot % 100). Llega como ?anios=26,25. Si no
    // viene, no se filtra por año (el front manda el año actual por default;
    // el export no manda nada → trae todos los años).
    const aniosParam = searchParams.get("anios");
    if (aniosParam) {
      const years = aniosParam.split(",").map((s) => Number(s.trim())).filter(Number.isFinite);
      if (years.length) where.anio = { in: years };
    }

    // Filtros por relación (value = el valor mostrado).
    const codRep = searchParams.get("codigo_reparacion");
    if (codRep) where.codigo_reparacion = { is: { codigo: codRep } };
    const fab = searchParams.get("fabricante");
    if (fab) where.fabricante = { is: { nombre: fab } };

    // Si / No: presencia de garantía / base metálica.
    const garantia = searchParams.get("garantia");
    if (garantia === "Si") where.garantia_codigo = { not: null };
    else if (garantia === "No") where.garantia_codigo = null;
    const baseMet = searchParams.get("base_metalica");
    if (baseMet === "Si") where.base_metalica_codigo = { not: null };
    else if (baseMet === "No") where.base_metalica_codigo = null;

    // Estado de la hoja de evaluación (__none__ = sin evaluación).
    const evalEstado = searchParams.get("evaluacion_estado");
    if (evalEstado === "__none__") where.evaluaciones_tecnicas = { none: {} };
    else if (evalEstado) where.evaluaciones_tecnicas = { some: { estado: evalEstado } };

    // Filtros de texto libre (contains, insensitive). Llegan como txt_<campo>.
    const TEXT_FIELDS = [
      "equipo_codigo", "descripcion", "tipo", "np", "cod_rep_flota", "cod_rep_posicion",
      "plaqueteo", "wo_cliente", "po_cliente", "po_item", "id_viajero",
      "guia_remision", "empresa_entrega", "usuario_crea", "comentarios",
    ];
    for (const f of TEXT_FIELDS) {
      const v = searchParams.get(`txt_${f}`)?.trim();
      if (v) where[f] = { contains: v, mode: "insensitive" };
    }

    // Rango de fecha de recepción.
    const fDesde = searchParams.get("fecha_recepcion_desde");
    const fHasta = searchParams.get("fecha_recepcion_hasta");
    if (fDesde || fHasta) {
      where.fecha_recepcion = {} as Record<string, Date>;
      if (fDesde) where.fecha_recepcion.gte = new Date(fDesde);
      if (fHasta) where.fecha_recepcion.lte = new Date(fHasta + "T23:59:59.999Z");
    }

    // Por defecto solo OTs activas; las desactivadas (anuladas) se ocultan.
    // El admin puede pedirlas con ?incluirInactivas=1 (para reactivarlas).
    if (searchParams.get("incluirInactivas") !== "1") where.activo = true;

    // Ordenamiento server-side. La tabla manda sortField (key) + sortOrder.
    const sortOrder = searchParams.get("sortOrder") === "ascend" ? "asc" : "desc";
    const sortField = searchParams.get("sortField") ?? "";
    const SORT_SCALAR: Record<string, true> = {
      ot: true, equipo_codigo: true, descripcion: true, fecha_recepcion: true,
      porcentaje_pcr: true, pcr: true, horas: true, contrato_dias: true,
      fecha_requerimiento_cliente: true, fecha_reprogramada: true, fecha_creacion: true,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let orderBy: any = { id: "desc" };
    if (sortField === "cliente") orderBy = { cliente: { razon_social: sortOrder } };
    else if (sortField === "codigo_reparacion") orderBy = { codigo_reparacion: { codigo: sortOrder } };
    else if (sortField === "prioridad_atencion") orderBy = { prioridad_atencion_codigo: sortOrder };
    else if (sortField === "ot_status") orderBy = { ot_status: { nombre: sortOrder } };
    else if (sortField === "recursos_status") orderBy = { recursos_status: { nombre: sortOrder } };
    else if (sortField === "taller_status") orderBy = { taller_status: { nombre: sortOrder } };
    else if (SORT_SCALAR[sortField]) orderBy = { [sortField]: sortOrder };

    const [data, total] = await Promise.all([
      prisma.ordenTrabajo.findMany({
        where,
        ...(isExport ? {} : { omit: omitExportOnly }),
        // `include` conserva TODOS los campos escalares de la OT (incluidos los
        // históricos que van al Excel: monto_cotizacion, fecha_evaluacion, etc.),
        // pero a cada relación le pedimos SOLO los sub-campos que el listado y el
        // export usan. Antes se traía la fila completa de cada relación (+ anidados):
        // con 3000+ OTs eso hacía el payload enorme y la carga lenta.
        include: {
          cliente: { select: { codigo: true, nombre_comercial: true, razon_social: true } },
          codigo_reparacion: {
            select: {
              codigo: true, descripcion: true,
              tipo: { select: { nombre: true } },
              flota: { select: { nombre: true } },
              fabricante: { select: { nombre: true } },
              posicion: { select: { nombre: true } },
            },
          },
          fabricante: { select: { nombre: true } },
          garantia: { select: { nombre: true } },
          atencion_reparacion: { select: { nombre: true } },
          tipo_reparacion: { select: { nombre: true } },
          tipo_garantia: { select: { nombre: true } },
          tipo_ot: { select: { codigo: true, nombre: true } },
          prioridad_atencion: { select: { codigo: true, nombre: true } },
          base_metalica: { select: { nombre: true } },
          ot_status: { select: { nombre: true } },
          recursos_status: { select: { nombre: true } },
          taller_status: { select: { nombre: true } },
          // Sólo el estado de la hoja de evaluación (la fila completa no se
          // usa en el listado). La relación es 1-N pero en la práctica solo hay
          // una por OT; tomamos el último id por las dudas.
          evaluaciones_tecnicas: { select: { estado: true }, orderBy: { id: "desc" }, take: 1 },
        },
        orderBy,
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

    // Generar número según el tipo seleccionado por el usuario.
    // El form lo manda como required (REP/BIE/SER), pero por defensa
    // tratamos undefined/null como ámbito REP.
    const ot = await generarNumeroOT(body.tipo_codigo as string | null | undefined);

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
        // N/P: si el form envía un valor explícito (incluso si difiere del
        // cod_rep), respetarlo. Solo fall back al N/P del cod_rep si el form
        // no envió el campo del todo.
        np = body.np !== undefined ? (body.np || null) : (codRep.np ?? null);
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
        anio: ot % 100, // año derivado del número de OT (para filtrar por año)
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
          const { nextNroReqExterna, pickDescripcionFromTarea, pickCantidadFromTarea } = await import("@/lib/requerimientos");
          await prisma.$transaction(async (tx) => {
            const nroReq = await nextNroReqExterna(tx, created.id);

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
                  cantidad: pickCantidadFromTarea(t),
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
