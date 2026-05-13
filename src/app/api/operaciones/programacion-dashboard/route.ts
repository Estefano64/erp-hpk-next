import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — Dashboard estilo matriz: OTs (filas) × operaciones del catálogo (columnas).
// Cada celda devuelve el estado de la planificación correspondiente (si existe).
export async function GET() {
  try {
    // 1) Catálogos: componentes + operaciones del maestro (columnas fijas)
    const [componentes, operaciones, estados] = await Promise.all([
      prisma.componente.findMany({
        where: { activo: true },
        orderBy: { codigo: "asc" },
        select: { codigo: true, nombre: true },
      }),
      prisma.operacionReparacion.findMany({
        where: { activo: true },
        orderBy: [{ componente_codigo: "asc" }, { nombre: "asc" }],
        select: {
          codigo: true,
          nombre: true,
          componente_codigo: true,
          clasificacion: true,
        },
      }),
      prisma.statusTarea.findMany({
        where: { activo: true },
        orderBy: { orden: "asc" },
        select: { codigo: true, nombre: true, color: true },
      }),
    ]);

    // 2) OTs activas (excluye Cerrada / Anulada / Entregada) + sus planificaciones.
    const otsRaw = await prisma.ordenTrabajo.findMany({
      where: {
        ot_status_codigo: { notIn: ["Cerrada", "Anulada", "Entregada"] },
      },
      orderBy: { fecha_recepcion: "desc" },
      select: {
        id: true,
        ot: true,
        descripcion: true,
        equipo_codigo: true,
        np: true,
        fecha_entrega: true,
        fecha_requerimiento_cliente: true,
        ot_status_codigo: true,
        cliente: { select: { codigo: true, razon_social: true, nombre_comercial: true } },
        codigo_reparacion: {
          select: {
            codigo: true,
            flota: { select: { codigo: true, nombre: true } },
          },
        },
        planificaciones: {
          select: {
            id: true,
            componente: true,
            operacion_codigo: true,
            estado: true,
            fecha_inicio: true,
            fecha_fin: true,
            trabajo_externo: true,
          },
        },
      },
    });

    type OT = (typeof otsRaw)[number];
    type Plan = OT["planificaciones"][number];

    // 3) Reducir a la forma esperada por la página: cada OT con un map de "comp/op" → estado.
    const ots = otsRaw.map((o: OT) => {
      const planMap: Record<string, { estado: string | null; externo: boolean | null }> = {};
      for (const p of o.planificaciones as Plan[]) {
        const key = `${p.componente}__${p.operacion_codigo}`;
        // Si hay duplicados, gana el último (no debería pasar para OTs bien planificadas).
        planMap[key] = { estado: p.estado ?? null, externo: p.trabajo_externo ?? null };
      }
      return {
        id: o.id,
        ot: o.ot,
        descripcion: o.descripcion,
        np: o.np,
        equipo_codigo: o.equipo_codigo,
        cliente_codigo: o.cliente?.codigo ?? null,
        cliente_nombre: o.cliente?.nombre_comercial ?? o.cliente?.razon_social ?? null,
        modelo: o.codigo_reparacion?.flota?.codigo ?? null,
        modelo_nombre: o.codigo_reparacion?.flota?.nombre ?? null,
        fecha_entrega: o.fecha_entrega,
        fecha_requerimiento: o.fecha_requerimiento_cliente,
        ot_status: o.ot_status_codigo,
        plan: planMap,
      };
    });

    return NextResponse.json({ componentes, operaciones, estados, ots });
  } catch (error) {
    console.error("GET /api/operaciones/programacion-dashboard error:", error);
    return NextResponse.json({ error: "Error obteniendo dashboard" }, { status: 500 });
  }
}
