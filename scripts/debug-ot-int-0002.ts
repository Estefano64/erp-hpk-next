// scripts/debug-ot-int-0002.ts
// Saca la fila OT-INT-0002-1 EXACTAMENTE como la devuelve /api/requerimientos
// para detectar valores raros que pudieran crashear el render del cliente.

import { PrismaClient } from "@prisma/client";
const RAILWAY_URL =
  "postgresql://postgres:vthphXsotIJPSGPdpZkkLRSDVxVuBHVG@yamabiko.proxy.rlwy.net:42613/railway";
const prisma = new PrismaClient({ datasources: { db: { url: RAILWAY_URL } } });

async function main() {
  const target = "OT-INT-0002-1";
  console.log(`Buscando nro_req = ${target}\n`);

  const rows = await prisma.oTRepuesto.findMany({
    where: { nro_req: target },
    include: {
      orden_trabajo: {
        select: { id: true, ot: true, descripcion: true, cod_rep_flota: true,
          cliente: { select: { codigo: true, razon_social: true, nombre_comercial: true } },
          codigo_reparacion: { select: { codigo: true, descripcion: true } } } },
      orden_trabajo_interna: { select: { id: true, ot: true, descripcion: true } },
      material: { select: { codigo: true, descripcion: true, unidad_medida_codigo: true, stock_actual: true, np: true, precio: true, moneda_codigo: true } },
      status_requerimiento: { select: { codigo: true, nombre: true } },
      status_cotizacion: { select: { codigo: true, nombre: true } },
      status_oc: { select: { codigo: true, nombre: true } },
      proveedor: { select: { id: true, razon_social: true } },
      compra: { select: { id: true, numero_po: true, status_oc_codigo: true } },
      adjuntos: { select: { id: true, nombre_archivo: true, r2_key: true, tamano: true } },
    },
  });

  console.log(`Filas: ${rows.length}\n`);
  for (const r of rows) {
    console.log(JSON.stringify(r, null, 2));
    console.log("---");
  }

  // ¿Cuántas OT-INT en total tiene la BD?
  const allInt = await prisma.oTRepuesto.count({ where: { orden_trabajo_interna_id: { not: null } } });
  const allOT = await prisma.oTRepuesto.count({ where: { ot_id: { not: null } } });
  const huerf = await prisma.oTRepuesto.count({ where: { ot_id: null, orden_trabajo_interna_id: null } });
  console.log(`\nTotal OTRepuesto: ot_id=${allOT}, ot_interna=${allInt}, huerfanos=${huerf}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
