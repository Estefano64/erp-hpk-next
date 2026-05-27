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
        np: true,
        fecha_recepcion: true,
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
    const compsCatSet = new Set(componentesCat.map((c) => c.codigo));
    const opsCatKey = new Set(
      operacionesCat.map((o) => `${o.componente_codigo ?? "__SIN_COMP__"}__${o.codigo}`),
    );
    const compsExtra = new Map<string, { codigo: string; nombre: string }>();
    const opsExtra = new Map<string, { codigo: string; nombre: string; componente_codigo: string; clasificacion: string }>();

    for (const ot of otsRaw) {
      for (const p of ot.planificaciones as Plan[]) {
        const compCod = p.componente;
        const opCod = p.operacion_codigo;
        if (!compsCatSet.has(compCod) && !compsExtra.has(compCod)) {
          compsExtra.set(compCod, { codigo: compCod, nombre: compCod });
        }
        const key = `${compCod}__${opCod}`;
        if (!opsCatKey.has(key) && !opsExtra.has(key)) {
          opsExtra.set(key, {
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
        const key = `${p.componente}__${p.operacion_codigo}`;
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
        modelo: o.codigo_reparacion?.flota?.codigo ?? null,
        modelo_nombre: o.codigo_reparacion?.flota?.nombre ?? null,
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
