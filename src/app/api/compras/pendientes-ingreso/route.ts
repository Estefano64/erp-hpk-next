import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — listar OCs pendientes de recepción.
// Sólo se incluyen OCs ya APROBADAS por el admin: estado PROCESO (aceptadas y
// aún por recibir) o INCOMPLETO (parcialmente recibidas). Las OCs en PEND_OC
// (pendientes de aprobación) NO deben aparecer acá — primero deben ser
// aceptadas en /compras (botón "Aceptar OC").
//
// 2026-06: ahora también se incluyen OCs cuyos items son SOLO "libres" (sin
// material_id, ej. items CAD como "Barra Cromada D 40x450"). En ese caso los
// items vienen de `ot_repuestos` en vez de `compra_detalle`. La UI los recibe
// con `repuesto_id` para que la API de recepción los matchee.
//
// 2026-06 fix: el código anterior tenía un bug — solo cargaba items de
// `ot_repuestos` cuando `compra_detalle` estaba VACÍO (caso ALL-free). En OCs
// MIXTAS (ej. 6 items con material + 1 item CAD libre), los items libres
// quedaban invisibles. Ahora combinamos: CompraDetalle para items con material
// + OTRepuesto SOLO para items free (material_id IS NULL) que no tienen
// equivalente en CompraDetalle. Así cubrimos las 3 combinaciones: all-mat,
// all-free, mixed.
export async function GET() {
  try {
    const compras = await prisma.compra.findMany({
      where: { status_oc_codigo: { in: ["PROCESO", "INCOMPLETO"] } },
      include: {
        proveedor: { select: { id: true, razon_social: true } },
        ubicacion: { select: { codigo: true, nombre: true } },
        moneda: { select: { codigo: true } },
        detalles: {
          include: { material: { select: { codigo: true, descripcion: true, unidad_medida_codigo: true } } },
        },
        // Para OCs creadas desde requerimientos con items free (sin material_id),
        // necesitamos ot_repuestos como fuente alternativa.
        ot_repuestos: {
          select: {
            id: true,
            material_id: true,
            material_codigo: true,
            descripcion: true,
            unidad_medida: true,
            cantidad: true,
            cantidad_recibida: true,
            precio_unitario: true,
            // Necesario para diferenciar SERVICIOS (SER) en el modal de
            // recepción — los servicios no requieren zona de almacén y se
            // auto-marcan en bloque.
            tipo_codigo: true,
          },
        },
      },
      orderBy: { fecha_solicitud: "desc" },
    });

    type C = typeof compras[number];
    type D = C["detalles"][number];
    type R = C["ot_repuestos"][number];

    const data = compras
      .map((c: C) => {
        // Mapa material_id → tipo_codigo derivado de los OTRepuestos vinculados
        // a la compra. CompraDetalle no tiene tipo_codigo, así que lo inferimos
        // desde el req (MAC/CAD/SER). Si no matchea queda como null y el
        // frontend lo trata como MAC (default seguro).
        const tipoPorMaterialId = new Map<number, string>();
        for (const r of c.ot_repuestos) {
          if (r.material_id != null && r.tipo_codigo) {
            tipoPorMaterialId.set(r.material_id, r.tipo_codigo);
          }
        }

        // Caso 1 (mayoritario): la OC tiene CompraDetalle → items vienen de ahí.
        // Cada item con `cantidad` = pendiente (cantidad − cantidad_recibida).
        const itemsDetalles = c.detalles
          .map((d: D) => {
            const pendiente = Number(d.cantidad) - Number(d.cantidad_recibida ?? 0);
            return {
              id: d.id,
              repuesto_id: null as number | null,
              material_id: d.material_id as number | null,
              codigo: d.material?.codigo ?? null,
              descripcion: d.material?.descripcion ?? null,
              unidad_medida: d.material?.unidad_medida_codigo ?? "und",
              cantidad: pendiente,
              precio_unitario: d.precio_unitario != null ? Number(d.precio_unitario) : null,
              tipo_codigo: (d.material_id != null ? tipoPorMaterialId.get(d.material_id) : null) ?? null,
            };
          })
          .filter((it) => it.cantidad > 0);

        // Caso 2: items FREE (material_id IS NULL en OTRepuesto). Estos no
        // generan CompraDetalle al crear la OC, así que se cargan de
        // ot_repuestos. Cada uno se identifica por `repuesto_id` para que la
        // API de recepción lo matchee directamente. SE INCLUYEN SIEMPRE
        // (estén o no presentes los CompraDetalle).
        const itemsRepuestosFree = c.ot_repuestos
          .filter((r: R) => r.material_id == null)
          .map((r: R) => {
            const pendiente = Number(r.cantidad) - Number(r.cantidad_recibida ?? 0);
            return {
              id: r.id,
              repuesto_id: r.id,
              material_id: null as number | null,
              codigo: r.material_codigo ?? null,
              descripcion: r.descripcion ?? null,
              unidad_medida: r.unidad_medida ?? "und",
              cantidad: pendiente,
              precio_unitario: r.precio_unitario != null ? Number(r.precio_unitario) : null,
              tipo_codigo: r.tipo_codigo ?? null,
            };
          })
          .filter((it) => it.cantidad > 0);

        return {
          id: c.id,
          numero_po: c.numero_po,
          proveedor_nombre: c.proveedor?.razon_social ?? null,
          ubicacion_nombre: c.ubicacion?.nombre ?? null,
          fecha_solicitud: c.fecha_solicitud,
          fecha_entrega_esperada: c.fecha_entrega_esperada,
          status_oc_codigo: c.status_oc_codigo,
          total: c.total,
          moneda: c.moneda?.codigo ?? c.moneda_codigo ?? null,
          observaciones: c.observaciones ?? null,
          nro_guia: c.nro_guia ?? null,
          nro_factura: c.nro_factura ?? null,
          guia_key: c.guia_key ?? null,
          guia_nombre: c.guia_nombre ?? null,
          factura_key: c.factura_key ?? null,
          factura_nombre: c.factura_nombre ?? null,
          // Combinar: items con material (CompraDetalle) + items free (OTRepuesto sin material_id).
          // Cubre OCs all-mat, all-free, y MIXTAS (que antes perdían los free).
          items: [...itemsDetalles, ...itemsRepuestosFree],
        };
      })
      // OCs sin items pendientes no aparecen (probablemente ya recibidas).
      .filter((c) => c.items.length > 0);

    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/compras/pendientes-ingreso error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
