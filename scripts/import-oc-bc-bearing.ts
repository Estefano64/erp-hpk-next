// Reemplaza el contenido de la "OC abierta" (compra 48) con los datos reales
// del PDF de BC BEARING (Nº M260033). Antes estaba importada por error como
// "Anglo American Quellaveco S.A." (PO 4504281587) con solo 2 items.
//
// IMPORTANTE (decisión del user): NI SE TOCA la tabla de proveedores.
// El cambio "OC abierta = BC BEARING" se hace solo a nivel de la compra:
// usamos el campo `compra.nombre` como label de display en el módulo de
// OC abierta, sin alterar `compra.proveedor_id` ni la fila del proveedor.
//
// Ahora:
//   - Setea compra.nombre = "BC BEARING — OC Abierta M260033" (display).
//   - Cambia numero_po a M260033, fecha_emision 2026-01-13, tipo_pago
//     CREDITO 60 días, observaciones BC Bearing.
//   - Reemplaza los 2 detalles previos por los 26 items reales del PDF.
//   - Recalcula subtotal/IGV/total para coincidir con el PDF.
//
// Es seguro reemplazar los detalles porque no hay reqs vinculados a po_id=48
// ni consumos de almacén abierto sobre los detalles previos.
//
// Uso: npx tsx scripts/import-oc-bc-bearing.ts            # dry-run
//      npx tsx scripts/import-oc-bc-bearing.ts --apply    # aplica
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const APPLY = process.argv.includes("--apply");
const COMPRA_ID = 48;
const PROVEEDOR_ID = 136;

// Datos solo para display / observaciones — NO se escriben en la tabla
// proveedores. Quedan en la fila de la compra como referencia visual.
const OC = {
  numero_po: "M260033",
  nombre: "BC BEARING — OC Abierta M260033",
  fecha_solicitud: "2026-01-13",
  fecha_expiracion: "2027-01-13", // 1 año desde la emisión
  moneda_codigo: "USD",
  tipo_pago: "CREDITO",
  dias_credito: 60,
  observaciones: "OC ABIERTA — BC BEARING (RUC 20506568707, Av. Industrial Lt. 18, Lurín - Lima). Email ventas@bcbearing.com.pe. Atención: RONALD. Stock anual; descontar al consumir en OTs. Precios congelados. Importado del PDF OCM260033OCABIERTABCBEARING.pdf el 2026-01-13.",
};

// Las 26 líneas del PDF. precio_unitario en USD. La descripción es vacía en
// el PDF — se llena con el NP como placeholder para el catálogo (el user puede
// editarlo después).
const ITEMS: Array<{ cant: number; np: string; pu: number }> = [
  { cant: 10, np: "PB 8931",              pu: 800 },
  { cant: 10, np: "VL4293",               pu: 385 },
  { cant: 23, np: "PC 0824",              pu: 1000 },
  { cant: 44, np: "PC 1686",              pu: 245 },
  { cant: 12, np: "58B 32 00919",         pu: 800 },
  { cant: 2,  np: "B96 9L",               pu: 1500 },
  { cant: 2,  np: "B72 9L",               pu: 385 },
  { cant: 3,  np: "07137 06010",          pu: 800 },
  { cant: 2,  np: "PB 9622",              pu: 550 },
  { cant: 2,  np: "PC 1683 GEZ 208 ESRS", pu: 265 },
  { cant: 11, np: "5J 1446",              pu: 90 },
  { cant: 10, np: "8X 9620",              pu: 635 },
  { cant: 3,  np: "188 8697",             pu: 985 },
  { cant: 4,  np: "6Y 9380",              pu: 785 },
  { cant: 4,  np: "6Y 9379",              pu: 385 },
  { cant: 13, np: "343 7794",             pu: 540 },
  { cant: 13, np: "199 4221",             pu: 320 },
  { cant: 6,  np: "150 1889",             pu: 2900 },
  { cant: 6,  np: "150 1890",             pu: 950 },
  { cant: 20, np: "191 4427",             pu: 2900 },
  { cant: 15, np: "7J 3297",              pu: 258 },
  { cant: 2,  np: "4T 1684",              pu: 650 },
  { cant: 19, np: "152 7554 / 357 5362",  pu: 705 },
  { cant: 2,  np: "6V 7959",              pu: 125 },
  { cant: 2,  np: "8X 9619",              pu: 780 },
  { cant: 4,  np: "58B 50 00590",         pu: 4000 },
];

async function findOrCreateMaterialByNP(np: string, descripcionPlaceholder: string, pu: number): Promise<number> {
  // Busca por np exacto. Si no hay, crea un Material catalogado básico para
  // que el detalle de la compra tenga material_id válido (requerido por FK).
  const existing = await prisma.material.findFirst({
    where: { np },
    select: { material_id: true, codigo: true },
  });
  if (existing) return existing.material_id;

  // Generar un código nuevo "BC-<np-sanitizado>" único.
  let baseCode = `BC-${np.replace(/[^A-Z0-9]+/gi, "").slice(0, 18)}`;
  let codigo = baseCode;
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const clash = await prisma.material.findFirst({ where: { codigo }, select: { material_id: true } });
    if (!clash) break;
    n++;
    codigo = `${baseCode}-${n}`;
  }
  // Defaults razonables. Usamos SQL raw porque el cliente Prisma requiere
  // que se pase explícitamente cada relación (area/categoria/clasificacion/
  // planta) y queremos algo más liviano.
  await prisma.$executeRawUnsafe(`
    INSERT INTO material (codigo, descripcion, np, unidad_medida_codigo, precio,
      moneda_codigo, stock_actual, activo, area_codigo, categoria_codigo,
      clasificacion_codigo, planta_codigo)
    VALUES ($1, $2, $3, 'und', $4, 'USD', 0, true, 'LG', 'REP', 'ANIL',
      (SELECT codigo FROM planta LIMIT 1))
  `, codigo, descripcionPlaceholder, np, pu);
  const created = await prisma.material.findFirst({
    where: { codigo },
    select: { material_id: true },
  });
  if (!created) throw new Error(`No se pudo crear material codigo=${codigo}`);
  return created.material_id;
}

async function main() {
  console.log(`\n=== Import OC BC BEARING M260033 — modo: ${APPLY ? "APPLY" : "DRY-RUN"} ===\n`);

  const compra = await prisma.compra.findUnique({
    where: { id: COMPRA_ID },
    select: { id: true, numero_po: true, proveedor_id: true, es_almacen_abierto: true },
  });
  if (!compra) {
    console.error(`No existe compra id=${COMPRA_ID}.`);
    process.exit(1);
  }
  if (compra.proveedor_id !== PROVEEDOR_ID) {
    console.warn(`Aviso: compra ${COMPRA_ID} no apunta al proveedor ${PROVEEDOR_ID} (actual: ${compra.proveedor_id}). Continúo igual — no se modifica el proveedor.`);
  }

  // Verificar que no haya consumos sobre los detalles previos.
  const detPrev = await prisma.compraDetalle.findMany({
    where: { compra_id: COMPRA_ID },
    select: { id: true, cantidad_recibida: true },
  });
  const yaConsumidos = detPrev.filter((d) => Number(d.cantidad_recibida ?? 0) > 0);
  if (yaConsumidos.length > 0) {
    console.error(`Hay ${yaConsumidos.length} detalle(s) con consumo previo. Abortando — no se puede reemplazar sin perder historial.`);
    process.exit(1);
  }

  // Resolver/crear materiales para los 26 items.
  console.log("Resolviendo materiales (busca por np, crea si no existe)…");
  const items = [] as Array<{ cant: number; pu: number; material_id: number; np: string }>;
  for (const it of ITEMS) {
    const descripcionPlaceholder = `BC BEARING — NP ${it.np}`;
    const material_id = APPLY
      ? await findOrCreateMaterialByNP(it.np, descripcionPlaceholder, it.pu)
      : 0; // dry-run: no resolvemos
    items.push({ cant: it.cant, pu: it.pu, material_id, np: it.np });
    console.log(`  NP ${it.np.padEnd(28)} cant=${String(it.cant).padStart(3)} × $${String(it.pu).padStart(7)} → material_id=${material_id || "(dry-run)"}`);
  }

  const subtotal = items.reduce((s, x) => s + x.cant * x.pu, 0);
  const igv = +(subtotal * 0.18).toFixed(2);
  const total = +(subtotal + igv).toFixed(2);
  console.log(`\nSubtotal=$${subtotal} IGV=$${igv} Total=$${total}`);

  if (!APPLY) {
    console.log("\nDry-run terminado. Para aplicar:");
    console.log("  npx tsx scripts/import-oc-bc-bearing.ts --apply");
    return;
  }

  await prisma.$transaction(async (tx) => {
    // (Tabla de proveedores INTACTA — decisión del user: el display "BC
    //  BEARING" vive solo en la compra, no se renombra Quellaveco.)

    // 1) Reemplazar detalles previos.
    const detIds = detPrev.map((d) => d.id);
    if (detIds.length > 0) {
      await tx.compraDetalle.deleteMany({ where: { id: { in: detIds } } });
      console.log(`✓ Eliminados ${detIds.length} detalle(s) previo(s)`);
    }
    for (const it of items) {
      await tx.compraDetalle.create({
        data: {
          compra_id: COMPRA_ID,
          material_id: it.material_id,
          cantidad: new Prisma.Decimal(it.cant),
          cantidad_recibida: new Prisma.Decimal(0),
          precio_unitario: new Prisma.Decimal(it.pu),
          subtotal: new Prisma.Decimal(it.cant * it.pu),
          total: new Prisma.Decimal(it.cant * it.pu),
        },
      });
    }
    console.log(`✓ Insertados ${items.length} detalles nuevos`);

    // 2) Actualizar la compra: numero_po, nombre (display), fechas, totales,
    //    observaciones. NO se toca proveedor_id (sigue apuntando a Quellaveco
    //    en la tabla de proveedores, intacta).
    await tx.compra.update({
      where: { id: COMPRA_ID },
      data: {
        numero_po: OC.numero_po,
        nombre: OC.nombre,
        fecha_solicitud: new Date(OC.fecha_solicitud + "T00:00:00"),
        fecha_expiracion: new Date(OC.fecha_expiracion + "T00:00:00"),
        moneda_codigo: OC.moneda_codigo,
        tipo_pago: OC.tipo_pago,
        dias_credito: OC.dias_credito,
        aplica_igv: true,
        subtotal: new Prisma.Decimal(subtotal),
        impuesto: new Prisma.Decimal(igv),
        otros: new Prisma.Decimal(0),
        descuento: new Prisma.Decimal(0),
        total: new Prisma.Decimal(total),
        observaciones: OC.observaciones,
      },
    });
    console.log(`✓ Compra ${COMPRA_ID} actualizada a ${OC.numero_po}`);
  }, { maxWait: 15_000, timeout: 60_000 });

  console.log("\n✓ Reemplazo aplicado.");
}
main().finally(() => prisma.$disconnect());
