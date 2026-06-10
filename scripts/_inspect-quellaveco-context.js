// Inspecciona qué hay en BD relacionado al PO Quellaveco antes del import.
// Solo lectura.
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  // 1) Buscar Proveedor Quellaveco (RUC 20137913250 o nombre que contenga "Quellaveco" o "Anglo")
  const provs = await p.proveedor.findMany({
    where: {
      OR: [
        { ruc: "20137913250" },
        { razon_social: { contains: "Quellaveco", mode: "insensitive" } },
        { razon_social: { contains: "Anglo American", mode: "insensitive" } },
      ],
    },
    select: { id: true, razon_social: true, ruc: true, nombre_comercial: true },
  });
  console.log("Proveedores que matchean Quellaveco/AngloAmerican:");
  for (const v of provs) {
    console.log(`  id=${v.id}  RUC=${v.ruc}  ${v.razon_social} ${v.nombre_comercial ? `(${v.nombre_comercial})` : ""}`);
  }

  // 2) ¿Existe ya la Compra 4504281587?
  const yaImportada = await p.compra.findUnique({
    where: { numero_po: "4504281587" },
    select: { id: true, numero_po: true, status_oc_codigo: true },
  });
  console.log("\nCompra 4504281587 ya existe?", yaImportada ? `SÍ id=${yaImportada.id}` : "NO");

  // 3) ¿Existen materiales con descripción "Containment tray" o "Spill pallet"?
  const mats = await p.material.findMany({
    where: {
      OR: [
        { descripcion: { contains: "Containment", mode: "insensitive" } },
        { descripcion: { contains: "Spill pallet", mode: "insensitive" } },
      ],
    },
    select: { material_id: true, codigo: true, descripcion: true, unidad_medida_codigo: true, stock_actual: true },
  });
  console.log(`\nMateriales que matchean (${mats.length}):`);
  for (const m of mats) console.log(`  ${m.codigo}  ${m.descripcion}  UM=${m.unidad_medida_codigo}  stock=${m.stock_actual}`);

  // 4) ¿Existe la UM "EA" en el catálogo?
  const um = await p.unidadMedida.findFirst({ where: { codigo: "EA" }, select: { codigo: true, nombre: true } });
  console.log(`\nUM "EA" existe?`, um ? `SÍ → ${um.nombre}` : "NO — habría que crearla o mapear a UND");

  // 5) Listar UMs disponibles para que el user vea mapeo posible
  const ums = await p.unidadMedida.findMany({ select: { codigo: true, nombre: true } });
  console.log(`\nTodas las UMs (${ums.length}):`);
  for (const u of ums.slice(0, 15)) console.log(`  ${u.codigo.padEnd(8)} ${u.nombre}`);

  // 6) Status OC catalog — para saber si "ALMACEN_ABIERTO" o similar ya existe
  const statusOc = await p.statusOC.findMany({ select: { codigo: true, nombre: true } });
  console.log(`\nStatus OC catalog (${statusOc.length}):`);
  for (const s of statusOc) console.log(`  ${s.codigo.padEnd(20)} ${s.nombre}`);

  await p.$disconnect();
})().catch(async (e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
