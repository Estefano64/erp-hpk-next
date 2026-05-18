import { prisma } from "../src/lib/prisma";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/localhost|127\.0\.0\.1/i.test(url)) {
    console.error("ABORT: DATABASE_URL no parece ser local. URL:", url);
    process.exit(1);
  }

  console.log("Conexion local OK. DB:", url.replace(/:[^:@/]+@/, ":****@"));

  const [otBefore, reqBefore, ocBefore, movBefore, planBefore, evalBefore, prestBefore] =
    await Promise.all([
      prisma.ordenTrabajo.count(),
      prisma.oTRepuesto.count(),
      prisma.compra.count(),
      prisma.movimientoInventario.count(),
      prisma.planificacionOT.count(),
      prisma.evaluacionTecnica.count(),
      prisma.prestamoHerramienta.count(),
    ]);
  console.log("ANTES:", {
    ordenes: otBefore,
    repuestos: reqBefore,
    compras: ocBefore,
    movimientos: movBefore,
    planificaciones: planBefore,
    evaluaciones: evalBefore,
    prestamos: prestBefore,
  });

  console.log("Ejecutando TRUNCATE ... RESTART IDENTITY CASCADE...");
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      orden_trabajo,
      compras,
      movimientos_inventario
    RESTART IDENTITY CASCADE;
  `);

  const [otAfter, reqAfter, ocAfter, movAfter, planAfter, evalAfter, prestAfter] =
    await Promise.all([
      prisma.ordenTrabajo.count(),
      prisma.oTRepuesto.count(),
      prisma.compra.count(),
      prisma.movimientoInventario.count(),
      prisma.planificacionOT.count(),
      prisma.evaluacionTecnica.count(),
      prisma.prestamoHerramienta.count(),
    ]);
  console.log("DESPUES:", {
    ordenes: otAfter,
    repuestos: reqAfter,
    compras: ocAfter,
    movimientos: movAfter,
    planificaciones: planAfter,
    evaluaciones: evalAfter,
    prestamos: prestAfter,
  });
  console.log("OK. nro_req y numero_po se recalculan al crear (parten en 0001).");
}

main()
  .catch((e) => {
    console.error("ERROR:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
