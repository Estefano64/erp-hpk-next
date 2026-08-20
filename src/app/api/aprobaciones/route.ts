import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseInt4Safe } from "@/lib/ot-formato";

// GET /api/aprobaciones — devuelve, en una sola llamada:
//   - ocs_pendientes:  Compras en estado PEND_OC
//   - reqs_pendientes: OTRepuesto en estado SIN_APROBACION
//   - historial:       últimas aprobaciones (OC y RQ)
//
// Query params opcionales (todos aplican a ambos lados cuando tienen sentido):
//   tipo          OC | RQ | all  (default all)
//   ot            string (contains, busca en orden_trabajo.ot)
//   proveedor_id  number (sólo OCs)
//   hist_desde / hist_hasta  YYYY-MM-DD — rango (días de Lima) para el historial.
//                            Con rango el tope sube a 500 filas; sin rango, hist_limit (25).
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const tipo = (sp.get("tipo") ?? "all").toUpperCase();
    const ot = sp.get("ot")?.trim();
    const proveedorId = sp.get("proveedor_id");
    // Rango de fechas del historial. Las columnas (updatedAt, fecha_aprobacion)
    // son timestamps UTC de eventos hechos en Lima (UTC-5): los límites se
    // construyen como día completo de Lima para que una aprobación de las
    // 21:00 del "hasta" (02:00 UTC del día siguiente) no quede afuera.
    const histDesdeRaw = sp.get("hist_desde")?.trim();
    const histHastaRaw = sp.get("hist_hasta")?.trim();
    const esFecha = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const histRango: { gte?: Date; lt?: Date } = {};
    if (esFecha(histDesdeRaw)) histRango.gte = new Date(`${histDesdeRaw}T00:00:00-05:00`);
    if (esFecha(histHastaRaw)) {
      const fin = new Date(`${histHastaRaw}T00:00:00-05:00`);
      fin.setUTCDate(fin.getUTCDate() + 1);
      histRango.lt = fin;
    }
    const hayRango = histRango.gte != null || histRango.lt != null;
    const histLimit = hayRango
      ? 500
      : Math.min(100, Math.max(5, Number(sp.get("hist_limit") ?? 25)));

    // ─── OCs pendientes (PEND_OC) ─────────────────────────────────────────
    let ocs_pendientes: Awaited<ReturnType<typeof prisma.compra.findMany>> = [];
    if (tipo === "ALL" || tipo === "OC") {
      const whereOC: Record<string, unknown> = { status_oc_codigo: "PEND_OC" };
      if (proveedorId) whereOC.proveedor_id = Number(proveedorId);
      if (ot) {
        // `ot` ahora es INTEGER. Si la búsqueda es un número, hacemos match
        // exacto; si no, no se filtra por OT.
        const otNum = parseInt4Safe(ot);
        if (otNum != null) whereOC.orden_trabajo = { ot: otNum };
      }
      ocs_pendientes = await prisma.compra.findMany({
        where: whereOC,
        include: {
          // Firmas de liberación A/B/C ya estampadas (esquema multi-nivel).
          liberaciones: { select: { nivel: true, liberado_por: true, fecha_liberacion: true, comentario: true } },
          proveedor: { select: { id: true, razon_social: true, ruc: true } },
          orden_trabajo: { select: { id: true, ot: true } },
          ubicacion: { select: { codigo: true, nombre: true } },
          ot_repuestos: {
            select: {
              id: true, nro_req: true, item_req: true, descripcion: true,
              cantidad: true, precio_unitario: true,
              comentario_aprobacion: true,
              material: { select: { codigo: true, descripcion: true } },
              orden_trabajo: { select: { id: true, ot: true } },
              adjuntos: { select: { id: true, nombre_archivo: true, r2_key: true, tamano: true } },
            },
          },
          detalles: {
            select: {
              id: true, cantidad: true, precio_unitario: true, total: true,
              material: { select: { codigo: true, descripcion: true } },
            },
          },
        },
        orderBy: [{ fecha_solicitud: "desc" }, { id: "desc" }],
        take: 500,
      });
    }

    // ─── RQs pendientes (SIN_APROBACION) ──────────────────────────────────
    let reqs_pendientes: Awaited<ReturnType<typeof prisma.oTRepuesto.findMany>> = [];
    if (tipo === "ALL" || tipo === "RQ") {
      const whereRQ: Record<string, unknown> = {
        status_requerimiento_codigo: "SIN_APROBACION",
        // Items "libres" del editor de OC nunca pasan por aprobación de req.
        OR: [{ solo_para_oc: false }, { solo_para_oc: null }],
      };
      if (ot) {
        const otNum = parseInt4Safe(ot);
        if (otNum != null) whereRQ.orden_trabajo = { ot: otNum };
      }
      reqs_pendientes = await prisma.oTRepuesto.findMany({
        where: whereRQ,
        include: {
          // Firmas de liberación A/B ya estampadas (esquema multi-nivel).
          liberaciones: { select: { nivel: true, liberado_por: true, fecha_liberacion: true, comentario: true } },
          orden_trabajo: {
            select: {
              id: true, ot: true,
              descripcion: true,
              cod_rep_flota: true,
              cliente: { select: { codigo: true, razon_social: true, nombre_comercial: true } },
              // Flag para la columna "Estado PO" de aprobaciones: presencia de
              // un adjunto de etapa 'po_cliente' en la OT (mismo criterio que el
              // listado de OTs externas). Trae 1 id como bandera.
              adjuntos: { where: { etapa_codigo: "po_cliente" }, select: { id: true }, take: 1 },
            },
          },
          material: { select: { codigo: true, descripcion: true, precio: true, moneda_codigo: true, stock_actual: true } },
          status_requerimiento: { select: { codigo: true, nombre: true } },
          adjuntos: { select: { id: true, nombre_archivo: true, r2_key: true, tamano: true } },
          // El aprobador suele querer ver si el item ya está pegado a una OC
          // (po_id != null). Si lo está, el req se aprueba pero ya no hay
          // que cotizar; queda como auditoría. Incluimos los datos básicos
          // de la OC para mostrar un tag en la grilla.
          compra: { select: { id: true, numero_po: true, status_oc_codigo: true } },
        },
        orderBy: [{ fecha_solicitud: "desc" }, { id: "desc" }],
        take: 500,
      });
    }

    // ─── Historial (últimas aprobaciones/aceptaciones) ────────────────────
    // OCs aceptadas: status != PEND_OC y usuario_aprueba != null. Ordena por updatedAt.
    const histOCs = await prisma.compra.findMany({
      where: {
        usuario_aprueba: { not: null },
        status_oc_codigo: { not: "PEND_OC" },
        ...(hayRango ? { updatedAt: histRango } : {}),
      },
      select: {
        id: true, numero_po: true, total: true, moneda_codigo: true,
        status_oc_codigo: true, usuario_aprueba: true, updatedAt: true, fecha_solicitud: true,
        proveedor: { select: { razon_social: true } },
        orden_trabajo: { select: { id: true, ot: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: histLimit,
    });

    // RQs aprobados: status = APROBADO con usuario_aprueba y fecha_aprobacion.
    const histRQs = await prisma.oTRepuesto.findMany({
      where: {
        status_requerimiento_codigo: "APROBADO",
        usuario_aprueba: { not: null },
        fecha_aprobacion: hayRango ? histRango : { not: null },
        OR: [{ solo_para_oc: false }, { solo_para_oc: null }],
      },
      select: {
        id: true, nro_req: true, item_req: true, descripcion: true, cantidad: true,
        usuario_aprueba: true, fecha_aprobacion: true,
        orden_trabajo: { select: { id: true, ot: true } },
        material: { select: { codigo: true, descripcion: true } },
      },
      orderBy: { fecha_aprobacion: "desc" },
      take: histLimit,
    });

    // Mezclo y ordeno por fecha de aceptación/aprobación descendente.
    const historial = [
      ...histOCs.map((c) => ({
        tipo: "OC" as const,
        id: c.id,
        ref: c.numero_po,
        descripcion: `Proveedor: ${c.proveedor?.razon_social ?? "—"}`,
        total: Number(c.total),
        moneda: c.moneda_codigo ?? "USD",
        ot: c.orden_trabajo?.ot ?? null,
        ot_id: c.orden_trabajo?.id ?? null,
        usuario: c.usuario_aprueba,
        fecha: c.updatedAt,
        nuevo_estado: c.status_oc_codigo,
      })),
      ...histRQs.map((r) => ({
        tipo: "RQ" as const,
        id: r.id,
        ref: `${r.nro_req ?? "—"}/${r.item_req ?? "—"}`,
        descripcion: r.material?.descripcion ?? r.descripcion ?? "—",
        total: null as number | null,
        moneda: null as string | null,
        ot: r.orden_trabajo?.ot ?? null,
        ot_id: r.orden_trabajo?.id ?? null,
        usuario: r.usuario_aprueba,
        fecha: r.fecha_aprobacion,
        nuevo_estado: "APROBADO",
      })),
    ]
      .sort((a, b) => (b.fecha ? new Date(b.fecha).getTime() : 0) - (a.fecha ? new Date(a.fecha).getTime() : 0))
      .slice(0, histLimit);

    return NextResponse.json({
      ocs_pendientes,
      reqs_pendientes,
      historial,
      counts: {
        ocs: ocs_pendientes.length,
        reqs: reqs_pendientes.length,
      },
    });
  } catch (error) {
    console.error("GET /api/aprobaciones error:", error);
    return NextResponse.json({ error: "Error al obtener aprobaciones" }, { status: 500 });
  }
}
