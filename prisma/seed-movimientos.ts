/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("\n========================================");
  console.log("SEED Movimientos de Inventario");
  console.log("========================================\n");

  const materiales = await prisma.material.findMany({
    take: 30,
    orderBy: { material_id: "asc" },
  });

  if (materiales.length === 0) {
    console.log("  ⚠ No hay materiales en la BD. Ejecuta primero el seed principal.");
    return;
  }
  console.log(`  ✓ ${materiales.length} materiales encontrados`);

  // Limpiar movimientos anteriores
  const borrados = await prisma.movimientoInventario.deleteMany({});
  console.log(`  ✓ ${borrados.count} movimientos previos eliminados`);

  // Reset de stock a 0 para que los movimientos dejen el estado correcto
  await prisma.material.updateMany({
    where: { material_id: { in: materiales.map((m) => m.material_id) } },
    data: { stock_actual: 0 },
  });

  const fechaOffset = (dias: number) => {
    const d = new Date();
    d.setDate(d.getDate() - dias);
    d.setHours(Math.floor(Math.random() * 8) + 8); // 8-16h
    return d;
  };

  type MovSeed = {
    matIdx: number;
    tipo: "ENTRADA" | "SALIDA" | "AJUSTE";
    cantidad: number;
    doc?: string;
    obs?: string;
    usuario: string;
    dias: number;
  };

  // Movimientos ordenados cronológicamente (de más antiguo a más reciente)
  const movimientos: MovSeed[] = [
    // ── ENTRADAS históricas (recepciones de OCs) ──
    { matIdx: 0, tipo: "ENTRADA", cantidad: 20, doc: "D260002", obs: "Recepción OC D260002 - REPUESTOS MINEROS", usuario: "almacen01", dias: 75 },
    { matIdx: 1, tipo: "ENTRADA", cantidad: 50, doc: "D260002", obs: "Recepción OC D260002", usuario: "almacen01", dias: 75 },
    { matIdx: 2, tipo: "ENTRADA", cantidad: 30, doc: "D260003", obs: "Compra directa - SELLOS Y REPUESTOS", usuario: "almacen01", dias: 68 },
    { matIdx: 3, tipo: "ENTRADA", cantidad: 100, doc: "D260003", usuario: "almacen01", dias: 68 },
    { matIdx: 4, tipo: "ENTRADA", cantidad: 40, doc: "D260004", obs: "Recepción desde Lima", usuario: "almacen02", dias: 62 },
    { matIdx: 5, tipo: "ENTRADA", cantidad: 10, doc: "D260005", obs: "Barras cromadas Ø4\" x 85 pulg", usuario: "almacen01", dias: 55 },
    { matIdx: 6, tipo: "ENTRADA", cantidad: 25, doc: "D260006", obs: "Bujes de bronce BUR08", usuario: "almacen01", dias: 50 },
    { matIdx: 7, tipo: "ENTRADA", cantidad: 8, doc: "D260006", usuario: "almacen01", dias: 50 },
    { matIdx: 8, tipo: "ENTRADA", cantidad: 80, doc: "D260007", obs: "Lote de O-Rings Viton 150x5mm", usuario: "almacen01", dias: 48 },
    { matIdx: 9, tipo: "ENTRADA", cantidad: 6, doc: "D260008", obs: "Válvulas de muelle acumulador", usuario: "almacen02", dias: 45 },
    { matIdx: 10, tipo: "ENTRADA", cantidad: 4, doc: "D260009", obs: "Vejigas acumuladores 20GL", usuario: "almacen02", dias: 42 },
    { matIdx: 11, tipo: "ENTRADA", cantidad: 5, doc: "D260010", obs: "Kits reparación cilindros", usuario: "almacen01", dias: 40 },
    { matIdx: 12, tipo: "ENTRADA", cantidad: 60, doc: "D260011", obs: "Pernos M24x120 G10.9", usuario: "almacen01", dias: 38 },
    { matIdx: 13, tipo: "ENTRADA", cantidad: 120, doc: "D260011", obs: "Arandelas de presión M24", usuario: "almacen01", dias: 38 },
    { matIdx: 14, tipo: "ENTRADA", cantidad: 35, doc: "D260012", usuario: "almacen02", dias: 35 },
    { matIdx: 15, tipo: "ENTRADA", cantidad: 15, doc: "D260012", usuario: "almacen02", dias: 35 },

    // ── SALIDAS (consumo para OTs) ──
    { matIdx: 0, tipo: "SALIDA", cantidad: 2, doc: "OT-2026-001", obs: "Kit sellos CAT 793 - Taller", usuario: "tecnico01", dias: 30 },
    { matIdx: 1, tipo: "SALIDA", cantidad: 4, doc: "OT-2026-001", obs: "Bujes para ensamble", usuario: "tecnico01", dias: 28 },
    { matIdx: 2, tipo: "SALIDA", cantidad: 2, doc: "OT-2026-001", obs: "Cojinetes 200-3926", usuario: "tecnico02", dias: 25 },
    { matIdx: 3, tipo: "SALIDA", cantidad: 8, doc: "OT-2026-002", obs: "Inserts de bronce", usuario: "tecnico02", dias: 24 },
    { matIdx: 4, tipo: "SALIDA", cantidad: 12, doc: "OT-2026-002", obs: "Casquillos ensamble pivotado", usuario: "tecnico03", dias: 22 },
    { matIdx: 5, tipo: "SALIDA", cantidad: 1, doc: "OT-2026-002", obs: "Barra cromada para vástago", usuario: "tecnico01", dias: 20 },
    { matIdx: 6, tipo: "SALIDA", cantidad: 2, doc: "OT-2026-002", obs: "Bujes BUR08", usuario: "tecnico01", dias: 20 },
    { matIdx: 8, tipo: "SALIDA", cantidad: 15, doc: "OT-2026-003", obs: "O-Rings reparación acumulador", usuario: "tecnico03", dias: 18 },
    { matIdx: 9, tipo: "SALIDA", cantidad: 2, doc: "OT-2026-003", obs: "Válvulas muelle", usuario: "tecnico02", dias: 16 },
    { matIdx: 10, tipo: "SALIDA", cantidad: 1, doc: "OT-2026-003", obs: "Vejiga 20GL", usuario: "tecnico02", dias: 15 },
    { matIdx: 12, tipo: "SALIDA", cantidad: 20, doc: "OT-2026-004", obs: "Pernos M24 ensamble", usuario: "tecnico04", dias: 12 },
    { matIdx: 13, tipo: "SALIDA", cantidad: 40, doc: "OT-2026-004", obs: "Arandelas de presión", usuario: "tecnico04", dias: 10 },
    { matIdx: 14, tipo: "SALIDA", cantidad: 8, doc: "OT-2026-001", obs: "Consumo adicional", usuario: "tecnico01", dias: 8 },
    { matIdx: 0, tipo: "SALIDA", cantidad: 1, doc: "OT-2026-003", obs: "Kit sellos emergencia", usuario: "tecnico03", dias: 5 },
    { matIdx: 8, tipo: "SALIDA", cantidad: 10, doc: "OT-2026-002", obs: "O-Rings adicionales", usuario: "tecnico01", dias: 3 },

    // ── AJUSTES (inventario físico) ──
    { matIdx: 6, tipo: "AJUSTE", cantidad: 21, doc: "INV-2026-01", obs: "Ajuste inventario físico enero - diferencia -2", usuario: "supervisor01", dias: 33 },
    { matIdx: 7, tipo: "AJUSTE", cantidad: 7, doc: "INV-2026-01", obs: "Ajuste inventario físico enero", usuario: "supervisor01", dias: 33 },
    { matIdx: 11, tipo: "AJUSTE", cantidad: 3, doc: "INV-2026-02", obs: "Merma detectada en inspección", usuario: "supervisor01", dias: 14 },
    { matIdx: 15, tipo: "AJUSTE", cantidad: 15, doc: "INV-2026-02", obs: "Ajuste inventario físico febrero", usuario: "supervisor01", dias: 14 },
  ];

  // Ordenar por fecha (más antiguo primero) para que el stock se actualice en el orden correcto
  movimientos.sort((a, b) => b.dias - a.dias);

  let creados = 0;
  for (const m of movimientos) {
    const mat = materiales[m.matIdx];
    if (!mat) continue;
    await prisma.$transaction(async (tx: any) => {
      await tx.movimientoInventario.create({
        data: {
          material_id: mat.material_id,
          tipo_movimiento: m.tipo,
          cantidad: m.cantidad,
          documento_referencia: m.doc || null,
          observacion: m.obs || null,
          usuario: m.usuario,
          fecha_movimiento: fechaOffset(m.dias),
        },
      });
      if (m.tipo === "AJUSTE") {
        await tx.material.update({
          where: { material_id: mat.material_id },
          data: { stock_actual: m.cantidad },
        });
      } else {
        const delta = m.tipo === "ENTRADA" ? m.cantidad : -m.cantidad;
        await tx.$executeRaw`UPDATE material SET stock_actual = COALESCE(stock_actual, 0) + ${delta}, updated_at = NOW() WHERE material_id = ${mat.material_id}`;
      }
    });
    creados++;
  }

  console.log(`  ✓ ${creados} movimientos creados\n`);

  // Resumen por tipo
  const resumen = await prisma.movimientoInventario.groupBy({
    by: ["tipo_movimiento"],
    _count: { _all: true },
    _sum: { cantidad: true },
  });
  console.log("Resumen por tipo de movimiento:");
  console.table(
    resumen.map((r) => ({
      Tipo: r.tipo_movimiento,
      Registros: r._count._all,
      "Total cantidad": Number(r._sum.cantidad || 0),
    }))
  );

  // Stock resultante de los materiales afectados
  const matsAfectados = await prisma.material.findMany({
    where: { material_id: { in: materiales.slice(0, 16).map((m) => m.material_id) } },
    select: { codigo: true, descripcion: true, stock_actual: true, unidad_medida_codigo: true },
    orderBy: { material_id: "asc" },
  });
  console.log("\nStock final (primeros materiales afectados):");
  console.table(
    matsAfectados.map((m) => ({
      Código: m.codigo,
      Material: m.descripcion.slice(0, 40),
      Stock: Number(m.stock_actual || 0),
      UM: m.unidad_medida_codigo,
    }))
  );

  console.log("\n========================================");
  console.log("✓ Seed de movimientos completado");
  console.log("========================================\n");
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
