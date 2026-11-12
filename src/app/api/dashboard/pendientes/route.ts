// GET /api/dashboard/pendientes
//
// Panel "Pendientes" del dashboard (pedido 2026-11-10): todo lo que está
// esperando acción, en números y con antigüedad:
//   - Requerimientos: sin aprobar, observados (devueltos a revisión) y
//     aprobados sin OC ("listos para OC"). BORRADOR no cuenta.
//   - OCs: por aprobar, en proceso sin recibir (y atrasadas vs fecha esperada).
//   - Servicios externos (SER): pendientes de envío, en cotización,
//     incompletos (en trabajo).
//   - OTs sin cerrar (externas), por estado y antigüedad.
//   - OTs internas sin cerrar, agrupadas por quién las creó (2026-11-12):
//     "qué usuarios faltan que cierren sus OTs internas".
// Cada bloque trae `edad` = cantidades por tramo [0-3, 4-7, 8-15, 16+ días] y
// `top` = los más antiguos. Solo lectura, sin columnas pesadas.
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { hoyEnLima } from "@/lib/dates";
import { formatOtCodigo, formatOtInternaCodigo } from "@/lib/ot-formato";
import { SEGUIMIENTO_DESDE, estadoServicio, type EnvioLite } from "@/lib/servicios-externos";

// "No Ejecutada" también es final (2026-11-10): no cuenta como pendiente.
const OT_CERRADA = ["Cerrada", "Anulada", "Entregada", "No Ejecutada"];
const TRAMOS = [3, 7, 15] as const; // 0-3, 4-7, 8-15, 16+

type Tope = { id: number; titulo: string; detalle: string | null; dias: number; href: string };

function diasDesde(f: Date | null | undefined, hoy: Date): number {
  if (!f) return 0;
  const f0 = Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate());
  const h0 = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
  return Math.max(0, Math.round((h0 - f0) / 86400000));
}
function bloque(dias: number[]) {
  const edad = [0, 0, 0, 0];
  for (const d of dias) edad[d <= TRAMOS[0] ? 0 : d <= TRAMOS[1] ? 1 : d <= TRAMOS[2] ? 2 : 3]++;
  return { total: dias.length, edad };
}

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const hoy = hoyEnLima();

    // Requerimientos vivos: de OT abierta (externa o interna) y no libres de OC.
    const baseReq = {
      AND: [
        { OR: [{ solo_para_oc: false }, { solo_para_oc: null }] },
        { OR: [{ ot_id: null }, { orden_trabajo: { activo: true, OR: [{ ot_status_codigo: null }, { ot_status_codigo: { notIn: OT_CERRADA } }] } }] },
        { OR: [{ orden_trabajo_interna_id: null }, { orden_trabajo_interna: { activo: true } }] },
      ],
    };
    const selReq = {
      id: true, nro_req: true, item_req: true, descripcion: true, fecha_solicitud: true,
      orden_trabajo: { select: { id: true, ot: true, tipo_codigo: true } },
      orden_trabajo_interna: { select: { id: true, ot: true } },
    } as const;

    const [sinAprobar, observados, listosOC, ocsAprob, ocsProceso, sers, ots, otis] = await Promise.all([
      prisma.oTRepuesto.findMany({ where: { ...baseReq, status_requerimiento_codigo: "SIN_APROBACION", po_id: null }, select: selReq }),
      prisma.oTRepuesto.findMany({ where: { ...baseReq, status_requerimiento_codigo: "OBSERVADO", po_id: null }, select: selReq }),
      prisma.oTRepuesto.findMany({
        where: {
          AND: [
            ...baseReq.AND,
            { OR: [{ status_oc_codigo: null }, { status_oc_codigo: "PEND_OC" }] },
          ],
          status_requerimiento_codigo: "APROBADO",
          po_id: null,
        },
        select: selReq,
      }),
      prisma.compra.findMany({
        where: { status_oc_codigo: "PEND_OC" },
        select: { id: true, numero_po: true, fecha_solicitud: true },
      }),
      prisma.compra.findMany({
        where: { status_oc_codigo: { in: ["PROCESO", "INCOMPLETO"] }, es_almacen_abierto: false },
        select: {
          id: true, numero_po: true, fecha_solicitud: true, fecha_aprobacion: true, fecha_entrega_esperada: true,
          proveedor: { select: { razon_social: true } },
        },
      }),
      prisma.oTRepuesto.findMany({
        where: {
          AND: baseReq.AND,
          tipo_codigo: "SER",
          status_requerimiento_codigo: "APROBADO",
          fecha_solicitud: { gte: new Date(`${SEGUIMIENTO_DESDE}T00:00:00Z`) },
        },
        select: {
          id: true, descripcion: true, cantidad: true, cantidad_recibida: true, fecha_aprobacion: true, fecha_solicitud: true,
          po_id: true, status_oc_codigo: true,
          orden_trabajo: { select: { id: true, ot: true, tipo_codigo: true } },
          orden_trabajo_interna: { select: { id: true, ot: true } },
          servicio_envios: {
            select: { id: true, fecha_salida: true, cotizacion_resultado: true, fecha_devolucion: true, fecha_llegada: true },
            orderBy: { id: "asc" },
          },
        },
      }),
      prisma.ordenTrabajo.findMany({
        where: { activo: true, OR: [{ ot_status_codigo: null }, { ot_status_codigo: { notIn: OT_CERRADA } }] },
        select: {
          id: true, ot: true, tipo_codigo: true, ot_status_codigo: true, descripcion: true,
          fecha_creacion: true, fecha_recepcion: true, cliente: { select: { razon_social: true } },
        },
      }),
      prisma.ordenTrabajoInterna.findMany({
        where: { activo: true, fecha_cierre: null, OR: [{ ot_status_codigo: null }, { ot_status_codigo: { notIn: OT_CERRADA } }] },
        select: {
          id: true, ot: true, ot_status_codigo: true, descripcion: true, usuario_crea: true,
          asignado_a: true, fecha_creacion: true,
        },
      }),
    ]);

    type ConOt = {
      orden_trabajo: { id: number; ot: number | null; tipo_codigo: string | null } | null;
      orden_trabajo_interna: { id: number; ot: number | null } | null;
    };
    const otCod = (r: ConOt) =>
      r.orden_trabajo ? formatOtCodigo(r.orden_trabajo.ot, r.orden_trabajo.tipo_codigo, `OT-${r.orden_trabajo.id}`)
        : r.orden_trabajo_interna ? formatOtInternaCodigo(r.orden_trabajo_interna.ot, `OTI-${r.orden_trabajo_interna.id}`) : "—";

    const reqBloque = (rows: typeof sinAprobar, href: string) => {
      const conDias = rows.map((r) => ({ r, d: diasDesde(r.fecha_solicitud, hoy) }));
      const top: Tope[] = [...conDias].sort((a, b) => b.d - a.d).slice(0, 8).map(({ r, d }) => ({
        id: r.id, titulo: `${r.nro_req ?? "—"}/${r.item_req ?? "—"} · ${otCod(r)}`, detalle: r.descripcion, dias: d, href,
      }));
      return { ...bloque(conDias.map((x) => x.d)), top, href };
    };

    // Servicios: estado derivado de los envíos (misma regla que la pantalla).
    const serEstados = { PENDIENTE_ENVIO: 0, EN_COTIZACION: 0, EN_TRABAJO: 0 };
    const serTop: Tope[] = [];
    const incompletosDias: number[] = [];
    for (const s of sers) {
      const envios = s.servicio_envios as unknown as EnvioLite[];
      const est = estadoServicio("APROBADO", envios, {
        cantidad: s.cantidad?.toString(),
        cantidad_recibida: s.cantidad_recibida?.toString(),
        fecha_aprobacion: s.fecha_aprobacion ?? s.fecha_solicitud,
        po_id: s.po_id,
        status_oc_codigo: s.status_oc_codigo,
      });
      if (est !== "PENDIENTE_ENVIO" && est !== "EN_COTIZACION" && est !== "EN_TRABAJO") continue;
      serEstados[est]++;
      const ult = s.servicio_envios.length ? s.servicio_envios[s.servicio_envios.length - 1] : null;
      const d = diasDesde(ult?.fecha_salida ?? s.fecha_aprobacion ?? s.fecha_solicitud, hoy);
      if (est === "EN_TRABAJO") incompletosDias.push(d);
      const etiqueta = est === "PENDIENTE_ENVIO" ? "Pend. envío" : est === "EN_COTIZACION" ? "En cotización" : "Incompleto";
      serTop.push({ id: s.id, titulo: `${otCod(s)} · ${etiqueta}`, detalle: s.descripcion, dias: d, href: "/servicios-externos" });
    }
    serTop.sort((a, b) => b.dias - a.dias);

    const ocDias = ocsProceso.map((c) => diasDesde(c.fecha_aprobacion ?? c.fecha_solicitud, hoy));
    const atrasadas = ocsProceso.filter((c) => c.fecha_entrega_esperada && c.fecha_entrega_esperada.getTime() < hoy.getTime()).length;
    const ocTop: Tope[] = ocsProceso
      .map((c, i) => ({ id: c.id, titulo: `OC ${c.numero_po}`, detalle: c.proveedor?.razon_social ?? null, dias: ocDias[i], href: `/compras/${c.id}/editar` }))
      .sort((a, b) => b.dias - a.dias)
      .slice(0, 8);

    const otDias = ots.map((o) => diasDesde(o.fecha_recepcion ?? o.fecha_creacion, hoy));
    const porEstado = new Map<string, number>();
    for (const o of ots) {
      const k = o.ot_status_codigo ?? "Sin estado";
      porEstado.set(k, (porEstado.get(k) ?? 0) + 1);
    }
    const otTop: Tope[] = ots
      .map((o, i) => ({
        id: o.id,
        titulo: `${formatOtCodigo(o.ot, o.tipo_codigo, `OT-${o.id}`)} · ${o.ot_status_codigo ?? "—"}`,
        detalle: o.cliente?.razon_social ?? o.descripcion,
        dias: otDias[i],
        href: `/ordenes-trabajo/${o.id}`,
      }))
      .sort((a, b) => b.dias - a.dias)
      .slice(0, 10);

    // OTs internas sin cerrar, por creador (el responsable de cerrarla).
    const otiDias = otis.map((o) => diasDesde(o.fecha_creacion, hoy));
    const porCreador = new Map<string, { n: number; dias: number[]; maxDias: number }>();
    otis.forEach((o, i) => {
      const k = o.usuario_crea?.trim() || "(sin creador)";
      const e = porCreador.get(k) ?? { n: 0, dias: [], maxDias: 0 };
      e.n++;
      e.dias.push(otiDias[i]);
      e.maxDias = Math.max(e.maxDias, otiDias[i]);
      porCreador.set(k, e);
    });
    const otiTop: Tope[] = otis
      .map((o, i) => ({
        id: o.id,
        titulo: `${formatOtInternaCodigo(o.ot, `OTI-${o.id}`)} · ${o.usuario_crea ?? "—"}`,
        detalle: o.descripcion,
        dias: otiDias[i],
        href: `/ordenes-trabajo-internas/${o.id}`,
      }))
      .sort((a, b) => b.dias - a.dias)
      .slice(0, 10);

    return NextResponse.json({
      generado: new Date().toISOString(),
      requerimientos: {
        sinAprobar: reqBloque(sinAprobar, "/aprobaciones"),
        observados: reqBloque(observados, "/requerimientos"),
        listosParaOC: reqBloque(listosOC, "/requerimientos"),
      },
      ocs: {
        porAprobar: { ...bloque(ocsAprob.map((c) => diasDesde(c.fecha_solicitud, hoy))), href: "/aprobaciones" },
        sinRecibir: { ...bloque(ocDias), atrasadas, top: ocTop, href: "/compras" },
      },
      servicios: { ...serEstados, incompletosEdad: bloque(incompletosDias).edad, top: serTop.slice(0, 8), href: "/servicios-externos" },
      ots: {
        ...bloque(otDias),
        porEstado: [...porEstado.entries()].map(([estado, n]) => ({ estado, n })).sort((a, b) => b.n - a.n),
        top: otTop,
        href: "/ordenes-trabajo",
      },
      otsInternas: {
        ...bloque(otiDias),
        porUsuario: [...porCreador.entries()]
          .map(([usuario, e]) => ({ usuario, n: e.n, edad: bloque(e.dias).edad, maxDias: e.maxDias }))
          .sort((a, b) => b.n - a.n || b.maxDias - a.maxDias),
        top: otiTop,
        href: "/ordenes-trabajo-internas",
      },
    });
  } catch (error) {
    console.error("GET /api/dashboard/pendientes error:", error);
    return NextResponse.json({ error: "Error al calcular pendientes" }, { status: 500 });
  }
}
