import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

type Ref = { model: string; field: string; getCount: (code: string | number) => Promise<number> };

type CatalogDef = {
  name: string;
  model: any;
  isIdInt?: boolean;
  refs: Ref[];
};

const catalogs: CatalogDef[] = [
  {
    name: "Moneda",
    model: p.moneda,
    refs: [
      { model: "Material", field: "moneda_codigo", getCount: (c) => p.material.count({ where: { moneda_codigo: c as string } }) },
      { model: "Equipo", field: "moneda_codigo", getCount: (c) => p.equipo.count({ where: { moneda_codigo: c as string } }) },
      { model: "CodigoReparacion", field: "moneda_codigo", getCount: (c) => p.codigoReparacion.count({ where: { moneda_codigo: c as string } }) },
    ],
  },
  {
    name: "Fabricante",
    model: p.fabricante,
    refs: [
      { model: "Material", field: "fabricante_codigo", getCount: (c) => p.material.count({ where: { fabricante_codigo: c as string } }) },
      { model: "Equipo", field: "fabricante_codigo", getCount: (c) => p.equipo.count({ where: { fabricante_codigo: c as string } }) },
      { model: "CodigoReparacion", field: "fabricante_codigo", getCount: (c) => p.codigoReparacion.count({ where: { fabricante_codigo: c as string } }) },
    ],
  },
  {
    name: "Planta",
    model: p.planta,
    refs: [
      { model: "Area", field: "planta_codigo", getCount: (c) => p.area.count({ where: { planta_codigo: c as string } }) },
      { model: "Material", field: "planta_codigo", getCount: (c) => p.material.count({ where: { planta_codigo: c as string } }) },
      { model: "Equipo", field: "planta_codigo", getCount: (c) => p.equipo.count({ where: { planta_codigo: c as string } }) },
    ],
  },
  {
    name: "SubArea",
    model: p.subArea,
    refs: [
      { model: "Equipo", field: "sub_area_codigo", getCount: (c) => p.equipo.count({ where: { sub_area_codigo: c as string } }) },
    ],
  },
  {
    name: "Criticidad",
    model: p.criticidad,
    refs: [
      { model: "Equipo", field: "criticidad_codigo", getCount: (c) => p.equipo.count({ where: { criticidad_codigo: c as string } }) },
    ],
  },
  {
    name: "TipoEquipo",
    model: p.tipoEquipo,
    refs: [
      { model: "Equipo", field: "tipo_codigo", getCount: (c) => p.equipo.count({ where: { tipo_codigo: c as string } }) },
    ],
  },
  {
    name: "StatusEquipo",
    model: p.statusEquipo,
    refs: [
      { model: "Equipo", field: "status_codigo", getCount: (c) => p.equipo.count({ where: { status_codigo: c as string } }) },
    ],
  },
  {
    name: "Posicion",
    model: p.posicion,
    refs: [
      { model: "CodigoReparacion", field: "posicion_codigo", getCount: (c) => p.codigoReparacion.count({ where: { posicion_codigo: c as string } }) },
    ],
  },
  {
    name: "TipoCodRep",
    model: p.tipoCodRep,
    refs: [
      { model: "CodigoReparacion", field: "tipo_codigo", getCount: (c) => p.codigoReparacion.count({ where: { tipo_codigo: c as string } }) },
    ],
  },
  {
    name: "CategoriaCodRep",
    model: p.categoriaCodRep,
    refs: [
      { model: "CodigoReparacion", field: "categoria_codigo", getCount: (c) => p.codigoReparacion.count({ where: { categoria_codigo: c as string } }) },
    ],
  },
  {
    name: "FlotaEquipo",
    model: p.flotaEquipo,
    refs: [
      { model: "CodigoReparacion", field: "flota_codigo", getCount: (c) => p.codigoReparacion.count({ where: { flota_codigo: c as string } }) },
    ],
  },
  {
    name: "UnidadMedida",
    model: p.unidadMedida,
    refs: [
      { model: "Material", field: "unidad_medida_codigo", getCount: (c) => p.material.count({ where: { unidad_medida_codigo: c as string } }) },
      { model: "Equipo", field: "unidad_medida_codigo", getCount: (c) => p.equipo.count({ where: { unidad_medida_codigo: c as string } }) },
      { model: "Estrategia", field: "unidad_medida_codigo", getCount: (c) => p.estrategia.count({ where: { unidad_medida_codigo: c as string } }) },
    ],
  },
  {
    name: "Cliente",
    model: p.cliente,
    isIdInt: true,
    refs: [
      { model: "Contrato", field: "cliente_id", getCount: (id) => p.contrato.count({ where: { cliente_id: id as number } }) },
      { model: "OrdenTrabajo", field: "id_cliente", getCount: (id) => p.ordenTrabajo.count({ where: { id_cliente: id as number } }) },
    ],
  },
];

async function main() {
  console.log("=== AUDITORÍA DE CATÁLOGOS: INACTIVOS CON 0 REFERENCIAS ===\n");
  const toDelete: { cat: string; model: any; codes: (string | number)[] }[] = [];

  for (const cat of catalogs) {
    const inactives = await cat.model.findMany({ where: { activo: false } });
    if (inactives.length === 0) {
      console.log(`[${cat.name}] sin inactivos`);
      continue;
    }
    console.log(`[${cat.name}] ${inactives.length} inactivos:`);
    const safe: (string | number)[] = [];
    const unsafe: { key: string | number; refs: string }[] = [];
    for (const row of inactives) {
      const key = cat.isIdInt ? row.cliente_id : row.codigo;
      let total = 0;
      const breakdown: string[] = [];
      for (const r of cat.refs) {
        const n = await r.getCount(key);
        total += n;
        if (n > 0) breakdown.push(`${r.model}=${n}`);
      }
      const label = cat.isIdInt ? `id=${key} ${row.razon_social ?? ""}` : `${key} ${row.nombre ?? ""}`;
      if (total === 0) {
        safe.push(key);
        console.log(`  ✓ ${label}  → 0 refs (BORRABLE)`);
      } else {
        unsafe.push({ key, refs: breakdown.join(", ") });
        console.log(`  ✗ ${label}  → ${breakdown.join(", ")} (CONSERVAR)`);
      }
    }
    if (safe.length) toDelete.push({ cat: cat.name, model: cat.model, codes: safe });
  }

  console.log("\n=== RESUMEN ===");
  for (const td of toDelete) console.log(`${td.cat}: ${td.codes.length} borrables`);
  const arg = process.argv[2];
  if (arg === "--apply") {
    console.log("\n=== APLICANDO BORRADO ===");
    for (const td of toDelete) {
      const where = typeof td.codes[0] === "number" ? { cliente_id: { in: td.codes } } : { codigo: { in: td.codes } };
      const r = await td.model.deleteMany({ where });
      console.log(`${td.cat}: borrados ${r.count}`);
    }
  } else {
    console.log("\n(modo dry-run. Correr con --apply para borrar)");
  }

  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
