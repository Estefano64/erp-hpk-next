// Diagnóstico: item "Anillo De Retención, 143-1452" desaparece entre la
// vista de Requerimientos y la vista de Ingreso de POs / Despachos.
// Hipótesis: es un item FREE (sin material_id) → CompraDetalle no se creó,
// por eso falta en Ingreso de POs. Para Despachos también puede faltar si
// la lógica del endpoint filtra items por material o por status diferente.
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  // Buscamos por descripcion textual primero (el código '143-1452' aparece en la
  // descripción del item)
  const reps = await p.oTRepuesto.findMany({
    where: {
      OR: [
        { descripcion: { contains: "143-1452", mode: "insensitive" } },
        { descripcion: { contains: "Anillo De Retenci", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      ot_id: true,
      orden_trabajo_interna_id: true,
      nro_req: true,
      item_req: true,
      tipo_codigo: true,
      material_id: true,
      material_codigo: true,
      descripcion: true,
      cantidad: true,
      cantidad_recibida: true,
      precio_unitario: true,
      moneda: true,
      status_requerimiento_codigo: true,
      status_oc_codigo: true,
      po_id: true,
      nro_oc: true,
      es_adicional: true,
      almacen_zona_id: true,
      almacen_posicion_id: true,
    },
  });
  console.log(`OTRepuesto matchings: ${reps.length}\n`);
  for (const r of reps) {
    console.log("──────────────────────────────────────────────────────────");
    console.log(`OTRepuesto id=${r.id}`);
    for (const [k, v] of Object.entries(r)) {
      if (k === "id") continue;
      console.log(`  ${k.padEnd(32)} ${v ?? "(null)"}`);
    }
  }

  // Si encontramos al menos uno, buscar el detalle de la OC asociada
  for (const r of reps) {
    if (!r.po_id) continue;
    console.log(`\n══ Detalle de la OC ${r.nro_oc} (id=${r.po_id}) ══`);
    const compra = await p.compra.findUnique({
      where: { id: r.po_id },
      select: {
        id: true, numero_po: true, status_oc_codigo: true,
        ot_id: true,
        proveedor: { select: { razon_social: true } },
        detalles: {
          select: {
            id: true,
            material_id: true,
            cantidad: true,
            cantidad_recibida: true,
            precio_unitario: true,
            material: { select: { codigo: true, descripcion: true } },
          },
        },
        ot_repuestos: {
          select: {
            id: true, nro_req: true, item_req: true,
            material_id: true, material_codigo: true,
            descripcion: true, cantidad: true,
            status_requerimiento_codigo: true,
            status_oc_codigo: true,
          },
        },
      },
    });
    console.log(`  proveedor: ${compra.proveedor?.razon_social ?? "?"}`);
    console.log(`  status_oc: ${compra.status_oc_codigo}`);
    console.log(`  OT id principal: ${compra.ot_id}`);
    console.log(`  CompraDetalle rows: ${compra.detalles.length}`);
    for (const d of compra.detalles) {
      console.log(`    - id=${d.id} material=${d.material?.codigo ?? "(null)"} ${d.material?.descripcion ?? ""} cant=${d.cantidad} recibido=${d.cantidad_recibida ?? 0} precio=${d.precio_unitario}`);
    }
    console.log(`  OTRepuesto rows vinculados a esta OC: ${compra.ot_repuestos.length}`);
    for (const rp of compra.ot_repuestos) {
      console.log(`    - id=${rp.id} req=${rp.nro_req}/${rp.item_req} material=${rp.material_codigo ?? "(null)"} desc="${rp.descripcion}" cant=${rp.cantidad} statusReq=${rp.status_requerimiento_codigo} statusOC=${rp.status_oc_codigo}`);
    }
  }

  await p.$disconnect();
})();
