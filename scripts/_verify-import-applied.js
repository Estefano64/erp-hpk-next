// Verifica que el import se aplicó: lee 3 OTs UPDATE + 2 OTs CREATE y muestra
// los campos relevantes.
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  const ots = [336425, 337225, 337625, 326425, 330925];
  for (const ot of ots) {
    const r = await p.ordenTrabajo.findFirst({
      where: { ot },
      select: {
        id: true, ot: true,
        fecha_evaluacion: true, evaluador: true,
        fecha_cotizacion: true, fecha_aprobacion: true, fecha_facturacion: true,
        reparacion_externa: true, vendor_externo: true,
        caracteristica_cilindro: true,
        usuario_crea: true, comentarios: true,
      },
    });
    console.log(`\n=== ot=${ot} (id=${r?.id ?? "NOT FOUND"}) ===`);
    if (r) for (const [k, v] of Object.entries(r)) {
      if (k === "id" || k === "ot") continue;
      const display = v instanceof Date ? v.toISOString().slice(0, 10) : (v ?? "(null)");
      console.log(`  ${k.padEnd(28)} ${display}`);
    }
  }

  // Conteos globales para confirmar volumen
  const conFEval = await p.ordenTrabajo.count({ where: { fecha_evaluacion: { not: null } } });
  const conEvaluador = await p.ordenTrabajo.count({ where: { evaluador: { not: null } } });
  const conCaract = await p.ordenTrabajo.count({ where: { caracteristica_cilindro: { not: null } } });
  const conRepExt = await p.ordenTrabajo.count({ where: { reparacion_externa: true } });
  const total = await p.ordenTrabajo.count();
  console.log(`\n=== CONTEOS GLOBALES POST-IMPORT ===`);
  console.log(`  Total OTs en BD:            ${total}`);
  console.log(`  Con fecha_evaluacion:       ${conFEval}`);
  console.log(`  Con evaluador:              ${conEvaluador}`);
  console.log(`  Con caracteristica_cilindro:${conCaract}`);
  console.log(`  Con reparacion_externa=true:${conRepExt}`);

  await p.$disconnect();
})();
