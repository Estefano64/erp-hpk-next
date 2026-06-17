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

    // ── Resolver cada tarea contra el catálogo y extenderlo solo con lo que
    // realmente NO existe. Las planificaciones traen `componente`/`operacion_codigo`
    // como TEXTO LIBRE: a veces el NOMBRE como "código" ("Desarmado" en vez de
    // "DES"), a veces otra capitalización ("Cilindro" vs "CILINDRO"). Sin resolver,
    // cada variante generaba una columna "extra" duplicada (Desarmado×2) y el filtro
    // por componente perdía las de distinto casing. Resolvemos por código O por
    // nombre (normalizado) al código CANÓNICO del catálogo.
    const norm = (s: string | null | undefined): string => (s ?? "").trim().toUpperCase();
    const compsCatSet = new Set(componentesCat.map((c) => norm(c.codigo)));
    // Componente: por código y por nombre → código canónico.
    const compCanonByKey = new Map<string, string>();
    for (const c of componentesCat) {
      compCanonByKey.set(norm(c.codigo), c.codigo);
      compCanonByKey.set(norm(c.nombre), c.codigo);
    }
    // Operación: `${normCompCanon}__${normCódigoONombre}` → código canónico.
    const opCanonByKey = new Map<string, string>();
    for (const o of operacionesCat) {
      const cc = norm(o.componente_codigo);
      opCanonByKey.set(`${cc}__${norm(o.codigo)}`, o.codigo);
      opCanonByKey.set(`${cc}__${norm(o.nombre)}`, o.codigo);
    }
    // Devuelve los códigos canónicos de una planificación. `opCanon` es null si la
    // operación no existe en el catálogo (ni por código ni por nombre) → es un extra.
    const resolver = (p: Plan) => {
      const rawComp = (p.componente ?? "").trim();
      const rawOp = (p.operacion_codigo ?? "").trim();
      const compCanon = compCanonByKey.get(norm(rawComp)) ?? rawComp;
      const cc = norm(compCanon);
      const opCanon =
        opCanonByKey.get(`${cc}__${norm(rawOp)}`) ??
        opCanonByKey.get(`${cc}__${norm((p.descripcion ?? "").trim())}`) ??
        null;
      return { rawComp, rawOp, compCanon, opCanon };
    };

    const compsExtra = new Map<string, { codigo: string; nombre: string }>();
    const opsExtra = new Map<string, { codigo: string; nombre: string; componente_codigo: string; clasificacion: string }>();

    for (const ot of otsRaw) {
      for (const p of ot.planificaciones as Plan[]) {
        const { rawComp, rawOp, compCanon, opCanon } = resolver(p);
        if (!rawComp || !rawOp) continue;
        const compKey = norm(compCanon);
        if (!compsCatSet.has(compKey) && !compsExtra.has(compKey)) {
          compsExtra.set(compKey, { codigo: compCanon, nombre: compCanon });
        }
        // Resolvió a una operación del catálogo: su columna ya existe, no es extra.
        if (opCanon) continue;
        const fullKey = `${compKey}__${norm(rawOp)}`;
        if (!opsExtra.has(fullKey)) {
          opsExtra.set(fullKey, {
            codigo: rawOp,
            // Usamos la descripción de la propia planificación si está, sino el código.
            nombre: (p.descripcion ?? "").trim() || rawOp,
            componente_codigo: compCanon,
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
        // Clave CANÓNICA (resuelta contra el catálogo): coincide con la columna
        // del catálogo o con la extra. Varias tareas de la misma operación caen
        // en la misma celda; conservamos un estado representativo que prioriza lo
        // NO realizado (una celda solo queda "verde" si todas están realizadas).
        const { compCanon, opCanon, rawOp } = resolver(p);
        const key = `${norm(compCanon)}__${norm(opCanon ?? rawOp)}`;
        const estado = p.estado ?? null;
        const prev = planMap[key];
        if (!prev) {
          planMap[key] = { estado, externo: p.trabajo_externo ?? null };
        } else if (prev.estado === "realizado" && estado && estado !== "realizado") {
          planMap[key] = { estado, externo: p.trabajo_externo ?? null };
        }
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
