// Import del PO Quellaveco PDF (4504281587) como "Compra Almacén Abierto"
// en Railway. Usa SQL raw para los campos nuevos (es_almacen_abierto +
// fecha_expiracion) porque el cliente Prisma puede no estar regenerado
// (dev server bloquea query_engine.dll). Los reads usan el cliente Prisma
// normal (suficientemente compatible para los campos legacy).
//
// Defaults a DRY-RUN. Para ejecutar:
//   node scripts/import-pdf-quellaveco.js --apply
const { PrismaClient, Prisma } = require("@prisma/client");

const APPLY = process.argv.includes("--apply");

const PO_DATA = {
  numero_po: "4504281587",
  proveedor: {
    razon_social: "Anglo American Quellaveco S.A.",
    nombre_comercial: "Quellaveco",
    ruc: "20137913250",
    direccion: "CALLE ESQUILACHE NRO. 371 PISO 10, LIMA",
    telefono: "5116146000",
  },
  fecha_solicitud: "2026-05-18",
  fecha_entrega_esperada: "2026-06-25",
  fecha_expiracion: "2027-05-18", // OC dura 1 año
  moneda_codigo: "USD",
  items: [
    { descripcion: "CONTAINMENT TRAY", cantidad: 2, unidad_medida: "und", precio_unitario: 2100.00 },
    { descripcion: "SPILL PALLET",      cantidad: 5, unidad_medida: "und", precio_unitario: 830.00 },
  ],
  subtotal: 8350.00,
  igv: 1503.00,
  total: 9853.00,
};

(async () => {
  const p = new PrismaClient();

  console.log(`\n╔══════════════════════════════════════════════════════════╗`);
  console.log(`║  IMPORT PO Quellaveco 4504281587 → BD Railway           ║`);
  console.log(`║  Modo: ${APPLY ? "APPLY (escribe en BD)" : "DRY-RUN (no escribe)"}${" ".repeat(APPLY ? 28 : 30)}║`);
  console.log(`╚══════════════════════════════════════════════════════════╝`);

  // ─── 1. Verificar Proveedor ─────────────────────────────────────
  let proveedor = await p.proveedor.findFirst({
    where: {
      OR: [
        { ruc: PO_DATA.proveedor.ruc },
        { razon_social: PO_DATA.proveedor.razon_social },
      ],
    },
    select: { id: true, razon_social: true, ruc: true },
  });
  console.log(proveedor
    ? `\n✓ Proveedor existe: id=${proveedor.id} "${proveedor.razon_social}"`
    : `\n[CREAR] Proveedor: ${PO_DATA.proveedor.razon_social} (RUC ${PO_DATA.proveedor.ruc})`);

  // ─── 2. Verificar Materials ─────────────────────────────────────
  const matChecks = [];
  for (const item of PO_DATA.items) {
    const found = await p.material.findFirst({
      where: { descripcion: { equals: item.descripcion, mode: "insensitive" } },
      select: { material_id: true, codigo: true, descripcion: true },
    });
    matChecks.push({ item, found, material_id: found?.material_id, codigo: found?.codigo });
    console.log(found
      ? `✓ Material existe: ${found.codigo} "${found.descripcion}"`
      : `[CREAR] Material: "${item.descripcion}" × ${item.cantidad} ${item.unidad_medida} @ USD ${item.precio_unitario}`);
  }

  // ─── 3. Verificar Compra existente (via SQL raw — campo es_almacen_abierto puede no estar en cliente) ─
  const existeCompraRaw = await p.$queryRaw`
    SELECT id, es_almacen_abierto FROM "compras" WHERE numero_po = ${PO_DATA.numero_po} LIMIT 1
  `;
  if (Array.isArray(existeCompraRaw) && existeCompraRaw.length > 0) {
    const c = existeCompraRaw[0];
    console.log(`\n⚠ Compra ${PO_DATA.numero_po} YA EXISTE (id=${c.id}, almacen_abierto=${c.es_almacen_abierto}).`);
    console.log(`  Si querés re-importar, borrá la Compra manualmente primero.`);
    if (APPLY) {
      console.log(`  ABORTANDO apply para no duplicar.`);
      await p.$disconnect();
      return;
    }
  } else {
    console.log(`\n[CREAR] Compra ${PO_DATA.numero_po}:`);
    console.log(`  es_almacen_abierto = true`);
    console.log(`  fecha_expiracion   = ${PO_DATA.fecha_expiracion}`);
    console.log(`  subtotal           = USD ${PO_DATA.subtotal}`);
    console.log(`  igv                = USD ${PO_DATA.igv}`);
    console.log(`  total              = USD ${PO_DATA.total}`);
    console.log(`  items              = ${PO_DATA.items.length}`);
  }

  if (!APPLY) {
    console.log(`\n══ DRY-RUN ══ Nada se escribió. Para aplicar: node scripts/import-pdf-quellaveco.js --apply`);
    await p.$disconnect();
    return;
  }

  // ════════════════════════════════════════════════════════════════
  // APPLY
  // ════════════════════════════════════════════════════════════════
  console.log(`\n>>> APPLY MODE — escribiendo en Railway`);

  // 1. Proveedor (cliente Prisma — campos legacy)
  if (!proveedor) {
    proveedor = await p.proveedor.create({
      data: {
        razon_social: PO_DATA.proveedor.razon_social,
        nombre_comercial: PO_DATA.proveedor.nombre_comercial,
        ruc: PO_DATA.proveedor.ruc,
        direccion: PO_DATA.proveedor.direccion,
        telefono: PO_DATA.proveedor.telefono,
        activo: true,
        usuario_crea: "import-quellaveco",
      },
      select: { id: true, razon_social: true, ruc: true },
    });
    console.log(`✓ Proveedor creado: id=${proveedor.id}`);
  }

  // 2. Materials — necesitamos catálogos base
  const area = await p.area.findFirst({ select: { codigo: true } });
  const categoria = await p.categoria.findFirst({ select: { codigo: true } });
  const clasificacion = await p.clasificacion.findFirst({ select: { codigo: true } });
  const planta = await p.planta.findFirst({ select: { codigo: true } });
  if (!area || !categoria || !clasificacion || !planta) {
    throw new Error("Faltan catálogos base.");
  }

  const ultimo = await p.material.findFirst({
    orderBy: { codigo: "desc" },
    select: { codigo: true },
  });
  let nextNum = ultimo ? (Number(ultimo.codigo) || 0) + 1 : 1;

  for (const mc of matChecks) {
    if (mc.material_id) continue;
    const codigo = String(nextNum).padStart(6, "0");
    nextNum++;
    const mat = await p.material.create({
      data: {
        codigo,
        descripcion: mc.item.descripcion,
        unidad_medida_codigo: mc.item.unidad_medida,
        precio: mc.item.precio_unitario,
        moneda_codigo: PO_DATA.moneda_codigo,
        area_codigo: area.codigo,
        categoria_codigo: categoria.codigo,
        clasificacion_codigo: clasificacion.codigo,
        planta_codigo: planta.codigo,
        stock_actual: 0, // El stock real vive en CompraDetalle.cantidad
        activo: true,
        created_at: new Date(),
      },
      select: { material_id: true, codigo: true },
    });
    mc.material_id = mat.material_id;
    mc.codigo = mat.codigo;
    console.log(`✓ Material creado: ${mat.codigo} "${mc.item.descripcion}"`);
  }

  // 3. Compra + Detalles via SQL raw (campos nuevos)
  // Inserto Compra primero, luego CompraDetalle para cada item.
  // Usar transacción para atomicidad.
  await p.$transaction(async (tx) => {
    const compraRows = await tx.$queryRaw`
      INSERT INTO "compras" (
        numero_po, proveedor_id, fecha_solicitud, fecha_entrega_esperada,
        fecha_expiracion, moneda_codigo, es_almacen_abierto, aplica_igv,
        status_oc_codigo, subtotal, impuesto, total,
        usuario_solicita, observaciones, "updatedAt"
      ) VALUES (
        ${PO_DATA.numero_po},
        ${proveedor.id},
        ${new Date(PO_DATA.fecha_solicitud + "T00:00:00.000Z")},
        ${new Date(PO_DATA.fecha_entrega_esperada + "T00:00:00.000Z")},
        ${new Date(PO_DATA.fecha_expiracion + "T00:00:00.000Z")},
        ${PO_DATA.moneda_codigo},
        true,
        true,
        'PROCESO',
        ${new Prisma.Decimal(PO_DATA.subtotal)},
        ${new Prisma.Decimal(PO_DATA.igv)},
        ${new Prisma.Decimal(PO_DATA.total)},
        'import-quellaveco',
        ${`OC ALMACÉN ABIERTO — ${PO_DATA.proveedor.razon_social}. Stock anual; descontar al consumir en OTs. Precios congelados. Importado del PDF Quellaveco.pdf el ${new Date().toISOString().slice(0, 10)}.`},
        NOW()
      )
      RETURNING id
    `;
    const compraId = Number(compraRows[0].id);
    console.log(`✓ Compra creada: id=${compraId} numero_po=${PO_DATA.numero_po}`);

    for (const mc of matChecks) {
      await tx.compraDetalle.create({
        data: {
          compra_id: compraId,
          material_id: mc.material_id,
          cantidad: new Prisma.Decimal(mc.item.cantidad),
          cantidad_recibida: new Prisma.Decimal(0),
          precio_unitario: new Prisma.Decimal(mc.item.precio_unitario),
          subtotal: new Prisma.Decimal(mc.item.cantidad * mc.item.precio_unitario),
          status_oc_codigo: "PROCESO",
        },
      });
      console.log(`  ✓ Detalle creado: ${mc.codigo} cant=${mc.item.cantidad} × USD ${mc.item.precio_unitario}`);
    }
  });

  await p.$disconnect();
  console.log(`\n✓ Import completo.`);
})().catch(async (e) => {
  console.error("\n✗ ERROR:", e.message ?? e);
  process.exit(1);
});
