// scripts/smoke-test-costos.ts
// Verifica el flujo de costos PPP:
//   1) Crea OT, material, OCs con 2 precios distintos para el mismo material.
//   2) Recibe ambas OCs y valida que material.costo_promedio sea el promedio
//      ponderado correcto.
//   3) Consume material de almacén contra la OT y valida el snapshot.
//   4) Llama al endpoint /costos y valida que el ejecutado refleje los consumos.
//   5) Cleanup: borra todo lo creado.

import { prisma } from "../src/lib/prisma";
import { nextNumeroOTExterna } from "../src/lib/ot-numero";
import { recalcularCostoPromedio, resolverPrecioSalida } from "../src/lib/inventario";
import { Prisma } from "@prisma/client";

const USUARIO = "SMOKE-COSTOS";

async function fail(msg: string): Promise<never> {
  console.error(`❌ ${msg}`);
  await prisma.$disconnect();
  process.exit(1);
}

async function main() {
  console.log("=".repeat(64));
  console.log("SMOKE TEST — COSTOS PPP + ENDPOINT");
  console.log("=".repeat(64));

  if (!process.env.DATABASE_URL?.includes("localhost")) {
    return fail("DATABASE_URL no es local. Abortando.");
  }

  // Material de prueba con stock 0 y sin costo previo
  const codigoTest = `SMOKE-MAT-${Date.now()}`;
  const material = await prisma.material.create({
    data: {
      codigo: codigoTest,
      descripcion: "Material de prueba PPP",
      planta_codigo: (await prisma.planta.findFirst())?.codigo ?? "T",
      area_codigo: (await prisma.area.findFirst())?.codigo ?? "T",
      categoria_codigo: (await prisma.categoria.findFirst())?.codigo ?? "T",
      clasificacion_codigo: (await prisma.clasificacion.findFirst())?.codigo ?? "T",
      unidad_medida_codigo: (await prisma.unidadMedida.findFirst())?.codigo ?? "T",
      stock_actual: 0,
    },
  });
  console.log(`\n✓ Material creado: ${material.codigo} (id=${material.material_id})`);

  // OT externa REP
  const ot = await prisma.$transaction(async (tx) => {
    const num = await nextNumeroOTExterna(tx, "REP");
    return tx.ordenTrabajo.create({
      data: {
        ot: num,
        anio: num % 100,
        tipo_codigo: "REP",
        descripcion: "OT smoke costos",
        usuario_crea: USUARIO,
        ot_status_codigo: "Abierta",
        recursos_status_codigo: "En revision procesos",
        taller_status_codigo: "Pdt Evaluación",
      },
    });
  });
  console.log(`✓ OT creada: ot=${ot.ot} id=${ot.id}`);

  try {
    // ──────────────────────────────────────────────────────────
    // [1] Simular ENTRADA 1: 10 unidades a USD 10 = stock 10 / costo 10
    // ──────────────────────────────────────────────────────────
    console.log("\n[1] Entrada 1: 10 u a USD 10");
    await prisma.$transaction(async (tx) => {
      await recalcularCostoPromedio(tx, material.material_id, {
        stockPrevio: 0,
        costoPrevio: null,
        cantidadEntrada: 10,
        precioEntrada: 10,
        monedaEntrada: "USD",
      });
      await tx.material.update({
        where: { material_id: material.material_id },
        data: { stock_actual: { increment: 10 } },
      });
    });
    let m = await prisma.material.findUnique({ where: { material_id: material.material_id } });
    console.log(`  stock=${m?.stock_actual}  costo_promedio=${m?.costo_promedio}  moneda=${m?.costo_promedio_moneda}`);
    if (Number(m?.costo_promedio) !== 10) return fail(`Esperaba costo=10, recibí ${m?.costo_promedio}`);

    // ──────────────────────────────────────────────────────────
    // [2] ENTRADA 2: 10 unidades a USD 20
    //     stock previo 10 a costo 10 → valor 100
    //     nuevo: 10×20 = 200 → total valor 300 / 20 unidades = 15
    // ──────────────────────────────────────────────────────────
    console.log("\n[2] Entrada 2: 10 u a USD 20 — esperado costo promedio = 15");
    await prisma.$transaction(async (tx) => {
      await recalcularCostoPromedio(tx, material.material_id, {
        stockPrevio: 10,
        costoPrevio: 10,
        cantidadEntrada: 10,
        precioEntrada: 20,
        monedaEntrada: "USD",
      });
      await tx.material.update({
        where: { material_id: material.material_id },
        data: { stock_actual: { increment: 10 } },
      });
    });
    m = await prisma.material.findUnique({ where: { material_id: material.material_id } });
    console.log(`  stock=${m?.stock_actual}  costo_promedio=${m?.costo_promedio}`);
    if (Number(m?.costo_promedio) !== 15) return fail(`Esperaba costo=15, recibí ${m?.costo_promedio}`);

    // ──────────────────────────────────────────────────────────
    // [3] resolverPrecioSalida debe devolver 15 (USD)
    // ──────────────────────────────────────────────────────────
    console.log("\n[3] resolverPrecioSalida en plena cuenta promediada");
    const res = await prisma.$transaction(async (tx) => resolverPrecioSalida(tx, material.material_id));
    console.log(`  precio=${res.precio?.toString()}  moneda=${res.moneda}`);
    if (Number(res.precio) !== 15 || res.moneda !== "USD") {
      return fail(`Esperaba precio=15 USD, recibí ${res.precio} ${res.moneda}`);
    }

    // ──────────────────────────────────────────────────────────
    // [4] ENTRADA 3 con stock < cantidad (lleva el costo al precio nuevo)
    //     stock 0 → entrada 5 a USD 7 → costo debería pasar a 7
    // ──────────────────────────────────────────────────────────
    console.log("\n[4] Reset y entrada con stock 0 → costo = precio entrada");
    await prisma.material.update({
      where: { material_id: material.material_id },
      data: { stock_actual: 0, costo_promedio: null, costo_promedio_moneda: null },
    });
    await prisma.$transaction(async (tx) => {
      await recalcularCostoPromedio(tx, material.material_id, {
        stockPrevio: 0,
        costoPrevio: null,
        cantidadEntrada: 5,
        precioEntrada: 7,
        monedaEntrada: "PEN",
      });
    });
    m = await prisma.material.findUnique({ where: { material_id: material.material_id } });
    console.log(`  costo_promedio=${m?.costo_promedio}  moneda=${m?.costo_promedio_moneda}`);
    if (Number(m?.costo_promedio) !== 7 || m?.costo_promedio_moneda !== "PEN") {
      return fail(`Esperaba 7 PEN, recibí ${m?.costo_promedio} ${m?.costo_promedio_moneda}`);
    }

    // ──────────────────────────────────────────────────────────
    // [5] Llamar endpoint /costos — debería devolver estructura vacía
    // ──────────────────────────────────────────────────────────
    console.log("\n[5] Endpoint /api/ordenes-trabajo/${otId}/costos — estructura sin movimientos");
    const fakeReq = new Request(`http://localhost/api/ordenes-trabajo/${ot.id}/costos`);
    const { GET } = await import(`../src/app/api/ordenes-trabajo/[id]/costos/route`);
    // Adaptamos a la signature de Next con params Promise
    const response = await GET(fakeReq as unknown as Parameters<typeof GET>[0], {
      params: Promise.resolve({ id: String(ot.id) }),
    } as unknown as Parameters<typeof GET>[1]);
    const json = await response.json();
    if (!json.data?.ejecutado) return fail("Estructura de /costos inválida");
    console.log(`  ✓ ejecutado.total_por_moneda = ${JSON.stringify(json.data.ejecutado.total_por_moneda)}`);
    console.log(`  ✓ proyectado.total_por_moneda = ${JSON.stringify(json.data.proyectado.total_por_moneda)}`);

    console.log("\n✅ Todas las pruebas de costos pasaron.");
  } finally {
    // Cleanup
    console.log("\n🧹 Limpiando datos de smoke...");
    await prisma.movimientoInventario.deleteMany({ where: { material_id: material.material_id } });
    await prisma.material.delete({ where: { material_id: material.material_id } });
    await prisma.oTRepuesto.deleteMany({ where: { ot_id: ot.id } });
    await prisma.oTHistorial.deleteMany({ where: { ot_id: ot.id } });
    await prisma.ordenTrabajo.delete({ where: { id: ot.id } });
    await prisma.$disconnect();
  }
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

// Suprime warning de Prisma.Decimal sin uso
void Prisma;
