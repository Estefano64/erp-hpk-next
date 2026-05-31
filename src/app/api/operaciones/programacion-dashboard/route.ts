import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — Dashboard estilo matriz: OTs (filas) × operaciones (columnas).
//
// Columnas: catálogo `Componente` × `OperacionReparacion`, EXTENDIDO con
// cualquier (componente, operacion_codigo) que aparezca en alguna planificación
// de OTs activas — así no se pierden tareas agregadas manualmente que no estén
// en el catálogo.
export async function GET() {
  try {
    const [componentesCat, operacionesCat, estados] = await Promise.all([
      prisma.componente.findMany({
        where: { activo: true },
        orderBy: { codigo: "asc" },
        select: { componente_id: true, codigo: true, nombre: true, color: true },
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
        cod_rep_flota: true,
        np: true,
        fecha_recepcion: true,
        fecha_entrega: true,
        fecha_requerimiento_cliente: true,
        ot_status_codigo: true,
        prioridad_atencion: { select: { codigo: true, nombre: true, nivel: true } },
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
            descripcion: true,
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

    // ── Extender catálogo con (componente, op) presentes en planificaciones
    // pero NO en el catálogo maestro. Esto cubre tareas que el usuario agrega
    // manualmente desde el tab Planificación con códigos no catalogados.
    //
    // Normalizamos (trim + uppercase) para comparar — sin esto, "General",
    // "GENERAL" y " general " aparecen como 3 columnas duplicadas en la matriz
    // (los `componente`/`operacion_codigo` de PlanificacionOT son strings libres).
    const norm = (s: string | null | undefined): string => (s ?? "").trim().toUpperCase();
    const compsCatSet = new Set(componentesCat.map((c) => norm(c.codigo)));
    const opsCatKey = new Set(
      operacionesCat.map((o) => `${norm(o.componente_codigo) || "__SIN_COMP__"}__${norm(o.codigo)}`),
    );
    const compsExtra = new Map<string, { codigo: string; nombre: string }>();
    const opsExtra = new Map<string, { codigo: string; nombre: string; componente_codigo: string; clasificacion: string }>();

    for (const ot of otsRaw) {
      for (const p of ot.planificaciones as Plan[]) {
        const compCod = (p.componente ?? "").trim();
        const opCod = (p.operacion_codigo ?? "").trim();
        if (!compCod || !opCod) continue;
        const compKey = norm(compCod);
        if (!compsCatSet.has(compKey) && !compsExtra.has(compKey)) {
          compsExtra.set(compKey, { codigo: compCod, nombre: compCod });
        }
        const fullKey = `${compKey}__${norm(opCod)}`;
        if (!opsCatKey.has(fullKey) && !opsExtra.has(fullKey)) {
          opsExtra.set(fullKey, {
            codigo: opCod,
            // Usamos la descripción de la propia planificación si está, sino el código.
            nombre: (p.descripcion ?? "").trim() || opCod,
            componente_codigo: compCod,
            clasificacion: "STD",
          });
        }
      }
    }

    // Anexamos extras al final. El frontend ya tiene un orden personalizable
    // por usuario, así que el "orden" del backend no es crítico.
    const componentes = [
      ...componentesCat,
      ...Array.from(compsExtra.values()).map((c) => ({
        componente_id: -1, // marcador: extra (no existe en BD)
        codigo: c.codigo,
        nombre: c.nombre,
        color: null,
      })),
    ];
    const operaciones = [...operacionesCat, ...Array.from(opsExtra.values())];

    const ots = otsRaw.map((o: OT) => {
      const planMap: Record<string, { estado: string | null; externo: boolean | null }> = {};
      let total = 0;
      let realizadas = 0;
      for (const p of o.planificaciones as Plan[]) {
        // Clave normalizada (trim + upper) para que coincida con la clave
        // que el frontend construye desde el catálogo, incluso si la
        // planificación quedó con casing/whitespace distinto.
        const key = `${norm(p.componente)}__${norm(p.operacion_codigo)}`;
        planMap[key] = { estado: p.estado ?? null, externo: p.trabajo_externo ?? null };
        total++;
        if ((p.estado ?? "").trim().toLowerCase() === "realizado") realizadas++;
      }
      return {
        id: o.id,
        ot: o.ot,
        descripcion: o.descripcion,
        np: o.np,
        equipo_codigo: o.equipo_codigo,
        cliente_codigo: o.cliente?.codigo ?? null,
        cliente_nombre: o.cliente?.nombre_comercial ?? o.cliente?.razon_social ?? null,
        modelo: o.codigo_reparacion?.flota?.codigo ?? o.cod_rep_flota ?? null,
        modelo_nombre: o.codigo_reparacion?.flota?.nombre ?? o.cod_rep_flota ?? null,
        prioridad_codigo: o.prioridad_atencion?.codigo ?? null,
        prioridad_nombre: o.prioridad_atencion?.nombre ?? null,
        prioridad_nivel: o.prioridad_atencion?.nivel ?? null,
        fecha_recepcion: o.fecha_recepcion,
        fecha_entrega: o.fecha_entrega,
        fecha_requerimiento: o.fecha_requerimiento_cliente,
        ot_status: o.ot_status_codigo,
        plan: planMap,
        progreso: { total, realizadas },
      };
    });

    return NextResponse.json({ componentes, operaciones, estados, ots });
  } catch (error) {
    console.error("GET /api/operaciones/programacion-dashboard error:", error);
    return NextResponse.json({ error: "Error obteniendo dashboard" }, { status: 500 });
  }
}
