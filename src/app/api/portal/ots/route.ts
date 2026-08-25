// GET /api/portal/ots — Portal de clientes (fase 1).
//
// Devuelve las OTs PUBLICADAS (visible_portal=true) de LA EMPRESA de la
// cuenta logueada, con su línea de tiempo de hitos derivada de los estados
// y fechas que el equipo ya carga. Reglas de seguridad:
//   - El cliente se toma SIEMPRE del JWT (token.clienteId) — jamás de un
//     parámetro. Una cuenta de Antapaccay no puede pedir OTs de Bambas.
//   - Solo OTs con visible_portal=true (opt-in que publica el equipo).
//   - No se exponen costos, comentarios internos ni historial crudo.

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { diasEnTaller } from "@/lib/dias-taller";

// Etapas del timeline en lenguaje de cliente, en orden.
const ETAPAS = ["Recibido", "En evaluación", "En reparación", "Listo", "Entregado"] as const;

function etapaActualDe(status: string | null, tieneRecepcion: boolean): number {
  const s = (status ?? "").trim();
  if (s === "Entregado" || s === "Cobranza") return 4;
  if (s === "Terminado") return 3;
  if (s === "Pdt proceso" || s === "Programado Proceso") return 2;
  if (s === "Pdt Evaluación" || s === "Programado Evaluación") return 1;
  return tieneRecepcion ? 0 : 0;
}

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const roles = (token.roles as string[] | undefined) ?? [];
    if (!roles.includes("cliente") && !roles.includes("admin")) {
      return NextResponse.json({ error: "Solo cuentas de portal" }, { status: 403 });
    }
    const clienteId = (token.clienteId as number | null | undefined) ?? null;
    if (!clienteId) {
      return NextResponse.json({ error: "La cuenta no está vinculada a una empresa. Contacte a HP&K." }, { status: 403 });
    }

    const [cliente, ots] = await Promise.all([
      prisma.cliente.findUnique({
        where: { cliente_id: clienteId },
        select: { nombre_comercial: true, razon_social: true },
      }),
      prisma.ordenTrabajo.findMany({
        where: { id_cliente: clienteId, visible_portal: true, activo: true },
        select: {
          id: true,
          ot: true,
          tipo_codigo: true,
          descripcion: true,
          np: true,
          equipo_codigo: true,
          cod_rep_flota: true,
          taller_status_codigo: true,
          fecha_recepcion: true,
          fecha_evaluacion: true,
          fecha_despacho: true,
          fecha_entrega: true,
          fecha_facturacion: true,
          fecha_requerimiento_cliente: true,
          fecha_actualizacion: true,
          cantidad: true,
          // Ficha completa para el cliente (pedido 2026-08-24). Documentos y
          // catálogos descriptivos — SIN montos (monto_cotizacion NO se expone,
          // solo el número y las fechas del ciclo de cotización).
          taller_status: { select: { nombre: true } },
          prioridad_atencion: { select: { codigo: true, nombre: true } },
          fabricante: { select: { nombre: true } },
          atencion_reparacion: { select: { nombre: true } },
          tipo_reparacion: { select: { nombre: true } },
          garantia: { select: { nombre: true } },
          base_metalica: { select: { nombre: true } },
          wo_cliente: true,
          po_cliente: true,
          po_item: true,
          id_viajero: true,
          guia_remision: true,
          nro_cotizacion: true,
          fecha_cotizacion: true,
          fecha_aprobacion: true,
          // Monto cotizado AL CLIENTE (confirmado por el usuario 2026-08-24:
          // es el precio que ya se le cotizó a él, no un costo interno).
          monto_cotizacion: true,
          moneda_cotizacion_codigo: true,
        },
        orderBy: [{ fecha_recepcion: "desc" }, { id: "desc" }],
      }),
    ]);

    const data = ots.map((o) => {
      const etapa = etapaActualDe(o.taller_status_codigo, o.fecha_recepcion != null);
      const fechaEntrega = o.fecha_despacho ?? o.fecha_entrega ?? null;
      // Días en taller: misma lógica que el ERP (dias-taller.ts) — en curso
      // cuenta hasta hoy; entregada usa recepción→salida.
      const dias = diasEnTaller({
        fecha_recepcion: o.fecha_recepcion,
        fecha_despacho: o.fecha_despacho,
        fecha_entrega: o.fecha_entrega,
        fecha_facturacion: o.fecha_facturacion,
        taller_status_codigo: o.taller_status_codigo,
      });
      return {
        id: o.id,
        ot: o.ot,
        tipo_codigo: o.tipo_codigo,
        descripcion: o.descripcion,
        np: o.np,
        equipo: o.equipo_codigo,
        flota: o.cod_rep_flota,
        cantidad: o.cantidad,
        etapaActual: etapa,
        estadoLabel: ETAPAS[etapa],
        entregada: etapa === 4,
        fecha_recepcion: o.fecha_recepcion,
        fecha_evaluacion: o.fecha_evaluacion,
        fecha_entrega: fechaEntrega,
        // Info extra del timeline (pedido del usuario):
        fecha_requerida: o.fecha_requerimiento_cliente,
        actualizado: o.fecha_actualizacion,
        dias_taller: dias?.dias ?? null,
        dias_en_curso: dias?.enCurso ?? false,
        // Ficha completa (2026-08-24) — solo datos descriptivos, sin montos.
        estado_taller: o.taller_status?.nombre ?? null,
        prioridad: o.prioridad_atencion
          ? `${o.prioridad_atencion.codigo} - ${o.prioridad_atencion.nombre}`
          : null,
        fabricante: o.fabricante?.nombre ?? null,
        tipo_atencion: o.atencion_reparacion?.nombre ?? null,
        tipo_reparacion: o.tipo_reparacion?.nombre ?? null,
        garantia: o.garantia?.nombre ?? null,
        base_metalica: o.base_metalica?.nombre ?? null,
        wo_cliente: o.wo_cliente,
        po_cliente: o.po_cliente,
        po_item: o.po_item,
        id_viajero: o.id_viajero,
        guia_remision: o.guia_remision,
        nro_cotizacion: o.nro_cotizacion,
        fecha_cotizacion: o.fecha_cotizacion,
        fecha_aprobacion_cotizacion: o.fecha_aprobacion,
        monto_cotizacion: o.monto_cotizacion != null ? Number(o.monto_cotizacion) : null,
        moneda_cotizacion: o.moneda_cotizacion_codigo,
      };
    });

    return NextResponse.json({
      cliente: cliente?.nombre_comercial ?? cliente?.razon_social ?? "",
      etapas: ETAPAS,
      ots: data,
    });
  } catch (e) {
    console.error("GET /api/portal/ots error:", e);
    return NextResponse.json({ error: "Error al obtener datos" }, { status: 500 });
  }
}
