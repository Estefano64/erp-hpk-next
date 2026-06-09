// Inspect helper — verifica catálogo tipo_reparacion + sample OTs en Railway.
// Borrar después de usar.
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  const tr = await p.tipoReparacion.findMany({ orderBy: { codigo: "asc" } });
  console.log("TIPO_REPARACION CATALOG:");
  for (const t of tr) console.log(`  ${t.codigo.padEnd(20)} → ${t.nombre}`);

  const total = await p.ordenTrabajo.count();
  console.log("\nTOTAL_OTS:", total);

  const sample = await p.ordenTrabajo.findMany({
    select: { id: true, ot: true, tipo_codigo: true },
    take: 8,
    orderBy: { ot: "desc" },
  });
  console.log("SAMPLE_OTS (ordenadas por `ot` desc):");
  for (const s of sample) console.log(`  id=${s.id}  ot=${s.ot}  tipo=${s.tipo_codigo}`);

  // Buscar las OTs específicas del primer row del Excel para confirmar matching
  const buscar = [336425, 337225];
  console.log("\nBUSQUEDA MUESTRA:");
  for (const ot of buscar) {
    const found = await p.ordenTrabajo.findFirst({
      where: { ot },
      select: {
        id: true, ot: true, tipo_codigo: true,
        fecha_evaluacion: true, evaluador: true,
        fecha_aprobacion_evaluacion: true, evaluacion_aprobado_por: true,
        fecha_cotizacion: true, tipo_reparacion_codigo: true,
        reparacion_externa: true, vendor_externo: true,
        fecha_aprobacion: true, fecha_facturacion: true,
      },
    });
    console.log(`  ot=${ot}:`, JSON.stringify(found, null, 2));
  }

  await p.$disconnect();
})();
