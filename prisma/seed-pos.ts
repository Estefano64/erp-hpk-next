import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("\n========================================");
  console.log("SEED POs — Datos de ejemplo para Compras");
  console.log("========================================\n");

  // ── 1. Proveedores ───────────────────────────────────
  console.log("1. Creando proveedores...");
  const proveedores = [
    { ruc: "20123456789", razonSocial: "REPUESTOS MINEROS SAC", contacto: "Juan Pérez", telefono: "054-123456", email: "ventas@repuestosmineros.com", direccion: "Av. Industrial 123, Arequipa", estado: "Activo" },
    { ruc: "20987654321", razonSocial: "HIDRÁULICA DEL SUR EIRL", contacto: "María García", telefono: "054-654321", email: "contacto@hidraulicasur.com", direccion: "Calle Los Tornos 456, Arequipa", estado: "Activo" },
    { ruc: "20456789123", razonSocial: "SELLOS Y REPUESTOS SA", contacto: "Carlos López", telefono: "01-7778888", email: "info@sellosrepuestos.com", direccion: "Jr. Maquinaria 789, Lima", estado: "Activo" },
    { ruc: "20789456123", razonSocial: "IMPORTACIONES CATERPILLAR", contacto: "Ana Torres", telefono: "01-4445555", email: "cat@importaciones.com", direccion: "Av. República 321, Lima", estado: "Activo" },
    { ruc: "20321654987", razonSocial: "SUMINISTROS INDUSTRIALES HP", contacto: "Luis Fernández", telefono: "054-999888", email: "ventas@suministroshp.com", direccion: "Calle Comercio 654, Arequipa", estado: "Activo" },
    { ruc: "20111222333", razonSocial: "PARKER HANNIFIN PERU SA", contacto: "Rosa Vega", telefono: "01-2223344", email: "ventas@parker.pe", direccion: "Av. La Marina 1200, Lima", estado: "Activo" },
    { ruc: "20444555666", razonSocial: "BOHLER IMPORTACIONES", contacto: "Miguel Castro", telefono: "01-5556677", email: "info@bohler.pe", direccion: "Av. Argentina 890, Lima", estado: "Activo" },
  ];
  for (const p of proveedores) {
    await prisma.proveedor.upsert({ where: { ruc: p.ruc }, update: p, create: p });
  }
  console.log(`  ✓ ${proveedores.length} proveedores creados`);

  // ── 2. Almacenes ─────────────────────────────────────
  console.log("2. Creando almacenes...");
  const almacenes = [
    { codigo: "ALM-PRIN", nombre: "Almacén Principal Arequipa", capacidad: 5000, ocupacion: 3200, zonas: 20, ubicacion: "Planta principal - Zona A", estado: "Activo" },
    { codigo: "ALM-REP", nombre: "Almacén de Repuestos", capacidad: 2000, ocupacion: 1500, zonas: 10, ubicacion: "Planta principal - Zona B", estado: "Activo" },
    { codigo: "ALM-CONS", nombre: "Almacén de Consumibles", capacidad: 1000, ocupacion: 600, zonas: 5, ubicacion: "Planta principal - Zona C", estado: "Activo" },
    { codigo: "ALM-HERRA", nombre: "Almacén de Herramientas", capacidad: 500, ocupacion: 350, zonas: 8, ubicacion: "Taller mecánico", estado: "Activo" },
  ];
  for (const a of almacenes) {
    await prisma.almacen.upsert({ where: { codigo: a.codigo }, update: a, create: a });
  }
  console.log(`  ✓ ${almacenes.length} almacenes creados`);

  // ── 3. Órdenes de Trabajo ────────────────────────────
  console.log("3. Creando órdenes de trabajo...");

  const clientes = await prisma.cliente.findMany({ take: 5 });
  const codReps = await prisma.codigoReparacion.findMany({ take: 5 });

  if (clientes.length === 0) {
    console.log("  ⚠ No hay clientes en la BD. Ejecuta primero el seed principal.");
    return;
  }

  const otsData = [
    {
      ot: "OT-2026-001",
      id_cliente: clientes[0].cliente_id,
      id_cod_rep: codReps[0]?.cod_rep_id,
      tipo: "Cilindro hidráulico de vástago simple",
      np: "NP-KS-CAT-001",
      descripcion: "Cilindro dirección CAT 793",
      equipo_codigo: "CAT-793-DIR",
      ns: "SN-793-DIR-001",
      fecha_recepcion: new Date("2026-01-10"),
      ot_status_codigo: "Abierta",
      recursos_status_codigo: "En espera de recursos",
      taller_status_codigo: "Pdt Evaluación",
      prioridad_atencion_codigo: "1",
      estrategia: true,
      usuario_crea: "admin",
    },
    {
      ot: "OT-2026-002",
      id_cliente: clientes[1]?.cliente_id,
      id_cod_rep: codReps[1]?.cod_rep_id,
      tipo: "Cilindro hidráulico pivotado",
      np: "NP-CIL-797-PIV",
      descripcion: "Cilindro pivotado CAT 797F",
      equipo_codigo: "CAT-797F-PIV",
      ns: "SN-797F-PIV-002",
      fecha_recepcion: new Date("2026-01-15"),
      ot_status_codigo: "Abierta",
      recursos_status_codigo: "En cotización",
      taller_status_codigo: "Programado Evaluación",
      prioridad_atencion_codigo: "2",
      estrategia: true,
      usuario_crea: "admin",
    },
    {
      ot: "OT-2026-003",
      id_cliente: clientes[2]?.cliente_id,
      id_cod_rep: codReps[2]?.cod_rep_id,
      tipo: "Acumulador de émbolo",
      np: "NP-ACU-KOM-001",
      descripcion: "Acumulador KOM 930E",
      equipo_codigo: "KOM-930E-ACU",
      ns: "SN-930E-ACU-003",
      fecha_recepcion: new Date("2026-01-20"),
      ot_status_codigo: "Abierta",
      recursos_status_codigo: "Recursos completos",
      taller_status_codigo: "Pdt proceso",
      prioridad_atencion_codigo: "1",
      estrategia: true,
      usuario_crea: "admin",
    },
    {
      ot: "OT-2026-004",
      id_cliente: clientes[3]?.cliente_id,
      tipo: "Cilindro general",
      np: "NP-CIL-393",
      descripcion: "Cilindro de elevación CAT 393F",
      equipo_codigo: "CAT-393F-ELV",
      ns: "SN-393F-ELV-004",
      fecha_recepcion: new Date("2026-02-01"),
      ot_status_codigo: "Abierta",
      recursos_status_codigo: "En revision procesos",
      taller_status_codigo: "Pdt Evaluación",
      prioridad_atencion_codigo: "3",
      estrategia: false,
      usuario_crea: "admin",
    },
  ];

  const otsCreadas = [];
  for (const ot of otsData) {
    if (!ot.id_cliente) continue;
    const existing = await prisma.ordenTrabajo.findFirst({ where: { ot: ot.ot } });
    if (existing) {
      otsCreadas.push(existing);
    } else {
      const created = await prisma.ordenTrabajo.create({ data: ot });
      otsCreadas.push(created);
    }
  }
  console.log(`  ✓ ${otsCreadas.length} órdenes de trabajo disponibles`);

  // ── 4. OT Repuestos (requerimientos) ─────────────────
  console.log("4. Creando requerimientos (OT Repuestos)...");

  const materiales = await prisma.material.findMany({ take: 30 });
  if (materiales.length === 0) {
    console.log("  ⚠ No hay materiales en la BD.");
    return;
  }

  const prov1 = await prisma.proveedor.findFirst({ where: { ruc: "20123456789" } });
  const prov2 = await prisma.proveedor.findFirst({ where: { ruc: "20987654321" } });

  // Eliminar requerimientos existentes de estas OTs para evitar duplicados
  for (const ot of otsCreadas) {
    await prisma.oTRepuesto.deleteMany({ where: { ot_id: ot.id } });
  }

  let totalReqs = 0;

  // OT-001: requerimientos en diferentes estados
  if (otsCreadas[0]) {
    const ot = otsCreadas[0];
    const reqs = [
      { item_req: 1, tipo_codigo: "MAC", cantidad: 2, descripcion: "Kit de sellos CAT 793", material_id: materiales[0].material_id, material_codigo: materiales[0].codigo, estado: "Pendiente", estado_cot: "PDT_COT", precio_unitario: 380, moneda: "USD", fabricante_codigo: "CAT" },
      { item_req: 2, tipo_codigo: "MAC", cantidad: 4, descripcion: "Buje 1J-2192", material_id: materiales[1].material_id, material_codigo: materiales[1].codigo, estado: "Aprobado", estado_cot: "APR", precio_unitario: 85, moneda: "USD", fabricante_codigo: "CAT", proveedor_id: prov1?.id },
      { item_req: 3, tipo_codigo: "MAC", cantidad: 2, descripcion: "Cojinete 200-3926", material_id: materiales[2].material_id, material_codigo: materiales[2].codigo, estado: "Aprobado", estado_cot: "APR", precio_unitario: 320, moneda: "USD", fabricante_codigo: "CAT", proveedor_id: prov1?.id },
      { item_req: 4, tipo_codigo: "MAC", cantidad: 2, descripcion: "Insert 9J-0521", material_id: materiales[3].material_id, material_codigo: materiales[3].codigo, estado: "Pendiente", precio_unitario: 45, moneda: "USD", fabricante_codigo: "CAT" },
      { item_req: 5, tipo_codigo: "MAC", cantidad: 4, descripcion: "Casquillo 9J-0521", material_id: materiales[4].material_id, material_codigo: materiales[4].codigo, estado: "Pendiente", estado_cot: "PDT_COT", precio_unitario: 38, moneda: "USD", fabricante_codigo: "CAT" },
      { item_req: 6, tipo_codigo: "SER", cantidad: 1, descripcion: "Servicio de cromado duro exterior", texto: "Cromado de vástago D=100mm L=1800mm", estado: "Pendiente", precio_unitario: 2500, moneda: "USD" },
    ];
    for (const r of reqs) {
      await prisma.oTRepuesto.create({
        data: {
          ot_id: ot.id,
          nro_req: "REQ-2026-001",
          fecha_solicitud: new Date("2026-01-12"),
          fecha_requerida: new Date("2026-01-25"),
          unidad_medida: "und",
          usuario_solicita: "admin",
          ...r,
        },
      });
      totalReqs++;
    }
  }

  // OT-002: requerimientos en cotización y con proveedores
  if (otsCreadas[1]) {
    const ot = otsCreadas[1];
    const reqs = [
      { item_req: 1, tipo_codigo: "MAC", cantidad: 1, descripcion: "Barra cromada Ø 4\" x 85\" LONG", material_id: materiales[5].material_id, material_codigo: materiales[5].codigo, estado: "Aprobado", estado_cot: "APR", precio_unitario: 1800, moneda: "USD", proveedor_id: prov2?.id, fabricante_codigo: "HOLDING" },
      { item_req: 2, tipo_codigo: "MAC", cantidad: 1, descripcion: "BUR08 101.60 x 117.5 x 2.6 mm PA", material_id: materiales[6].material_id, material_codigo: materiales[6].codigo, estado: "Aprobado", estado_cot: "APR", precio_unitario: 425, moneda: "USD", proveedor_id: prov2?.id, fabricante_codigo: "MACHEN" },
      { item_req: 3, tipo_codigo: "MAC", cantidad: 1, descripcion: "RS17C 117.80 x 101.60 x 10.4 PU", material_id: materiales[7].material_id, material_codigo: materiales[7].codigo, estado: "Pendiente", estado_cot: "PDT_APR", precio_unitario: 235, moneda: "USD", fabricante_codigo: "MACHEN" },
      { item_req: 4, tipo_codigo: "MAC", cantidad: 3, descripcion: "O-Ring 150x5mm Viton", material_id: materiales[8].material_id, material_codigo: materiales[8].codigo, estado: "Aprobado", estado_cot: "APR", precio_unitario: 12.5, moneda: "USD", proveedor_id: prov2?.id },
    ];
    for (const r of reqs) {
      await prisma.oTRepuesto.create({
        data: {
          ot_id: ot.id,
          nro_req: "REQ-2026-002",
          fecha_solicitud: new Date("2026-01-17"),
          fecha_requerida: new Date("2026-01-30"),
          unidad_medida: "und",
          usuario_solicita: "admin",
          ...r,
        },
      });
      totalReqs++;
    }
  }

  // OT-003: requerimientos ya asignados a una OC (simulamos)
  if (otsCreadas[2]) {
    const ot = otsCreadas[2];
    const reqs = [
      { item_req: 1, tipo_codigo: "MAC", cantidad: 2, descripcion: "Válvula de muelle acumulador", material_id: materiales[9].material_id, material_codigo: materiales[9].codigo, estado: "En PO", estado_cot: "APR", precio_unitario: 580, moneda: "USD", proveedor_id: prov1?.id },
      { item_req: 2, tipo_codigo: "MAC", cantidad: 1, descripcion: "Vejiga acumulador 20GL", material_id: materiales[10].material_id, material_codigo: materiales[10].codigo, estado: "En PO", estado_cot: "APR", precio_unitario: 1200, moneda: "USD", proveedor_id: prov1?.id },
      { item_req: 3, tipo_codigo: "SER", cantidad: 1, descripcion: "Pruebas hidráulicas en banco", texto: "Pruebas hasta 3500 PSI", estado: "En PO", estado_cot: "APR", precio_unitario: 500, moneda: "USD", proveedor_id: prov1?.id },
    ];
    for (const r of reqs) {
      await prisma.oTRepuesto.create({
        data: {
          ot_id: ot.id,
          nro_req: "REQ-2026-003",
          fecha_solicitud: new Date("2026-01-22"),
          fecha_requerida: new Date("2026-02-05"),
          unidad_medida: "und",
          usuario_solicita: "admin",
          ...r,
        },
      });
      totalReqs++;
    }
  }

  // OT-004: requerimientos pendientes
  if (otsCreadas[3]) {
    const ot = otsCreadas[3];
    const reqs = [
      { item_req: 1, tipo_codigo: "MAC", cantidad: 1, descripcion: "Kit reparación cilindro elevación", material_id: materiales[11].material_id, material_codigo: materiales[11].codigo, estado: "Pendiente", precio_unitario: 850, moneda: "USD" },
      { item_req: 2, tipo_codigo: "MAC", cantidad: 4, descripcion: "Perno M24x120 G10.9", material_id: materiales[12].material_id, material_codigo: materiales[12].codigo, estado: "Pendiente", estado_cot: "PDT_COT", precio_unitario: 4.5, moneda: "USD" },
      { item_req: 3, tipo_codigo: "MAC", cantidad: 8, descripcion: "Arandela de presión M24", material_id: materiales[13].material_id, material_codigo: materiales[13].codigo, estado: "Pendiente", precio_unitario: 0.8, moneda: "USD" },
    ];
    for (const r of reqs) {
      await prisma.oTRepuesto.create({
        data: {
          ot_id: ot.id,
          nro_req: "REQ-2026-004",
          fecha_solicitud: new Date("2026-02-02"),
          fecha_requerida: new Date("2026-02-20"),
          unidad_medida: "und",
          usuario_solicita: "admin",
          ...r,
        },
      });
      totalReqs++;
    }
  }

  console.log(`  ✓ ${totalReqs} requerimientos creados`);

  // ── 5. Compra (OC) vinculada a OT-003 ─────────────────
  console.log("5. Creando orden de compra (OC)...");

  const almacen = await prisma.almacen.findFirst({ where: { codigo: "ALM-PRIN" } });
  if (otsCreadas[2] && prov1 && almacen) {
    // Buscar los requerimientos "En PO" de OT-003
    const reqsEnPO = await prisma.oTRepuesto.findMany({
      where: { ot_id: otsCreadas[2].id, estado: "En PO" },
    });

    if (reqsEnPO.length > 0) {
      const subtotal = reqsEnPO.reduce((s, r) => s + Number(r.precio_unitario || 0) * Number(r.cantidad), 0);
      const impuesto = subtotal * 0.18;
      const total = subtotal + impuesto;

      // Borrar compra existente si hay una con ese numero
      await prisma.compra.deleteMany({ where: { numero_po: "D260001" } });

      const compra = await prisma.compra.create({
        data: {
          numero_po: "D260001",
          proveedor_id: prov1.id,
          almacen_id: almacen.id,
          fecha_solicitud: new Date("2026-01-23"),
          fecha_entrega_esperada: new Date("2026-02-05"),
          estado: "Pendiente",
          subtotal,
          impuesto,
          total,
          moneda: "USD",
          observaciones: "OC de demo para OT-2026-003",
          usuario_solicita: "admin",
        },
      });

      // Vincular los requerimientos a esta OC
      for (const req of reqsEnPO) {
        await prisma.oTRepuesto.update({
          where: { id: req.id },
          data: {
            po_id: compra.id,
            nro_oc: compra.numero_po,
            fecha_oc: new Date("2026-01-23"),
          },
        });
      }

      // Crear detalles solo para items MAC con material
      for (const req of reqsEnPO.filter((r) => r.material_id)) {
        const itemSub = Number(req.precio_unitario || 0) * Number(req.cantidad);
        await prisma.compraDetalle.create({
          data: {
            compra_id: compra.id,
            material_id: req.material_id!,
            cantidad: Math.round(Number(req.cantidad)),
            precio_unitario: Number(req.precio_unitario || 0),
            subtotal: itemSub,
            impuesto: itemSub * 0.18,
            total: itemSub * 1.18,
          },
        });
      }

      console.log(`  ✓ OC ${compra.numero_po} creada con ${reqsEnPO.length} items - Total: $${total.toFixed(2)}`);
    }
  }

  // ── 6. Segunda OC (Recibida) ─────────────────────────
  console.log("6. Creando OC adicional (Recibida)...");

  if (otsCreadas[0] && prov2 && almacen) {
    await prisma.compra.deleteMany({ where: { numero_po: "D260002" } });
    const compra2 = await prisma.compra.create({
      data: {
        numero_po: "D260002",
        proveedor_id: prov2.id,
        almacen_id: almacen.id,
        fecha_solicitud: new Date("2026-01-05"),
        fecha_entrega_esperada: new Date("2026-01-20"),
        fecha_entrega_real: new Date("2026-01-18"),
        estado: "Recibido",
        subtotal: 1450,
        impuesto: 261,
        total: 1711,
        moneda: "USD",
        nro_factura: "F001-12345",
        nro_guia: "DHL-4830192",
        observaciones: "OC histórica ya recibida",
        usuario_solicita: "admin",
        usuario_aprueba: "admin",
      },
    });
    console.log(`  ✓ OC ${compra2.numero_po} creada (Recibida)`);
  }

  console.log("\n========================================");
  console.log("✓ Seed completado exitosamente");
  console.log("========================================\n");

  const counts = {
    OT: await prisma.ordenTrabajo.count(),
    Proveedores: await prisma.proveedor.count(),
    Almacenes: await prisma.almacen.count(),
    Requerimientos: await prisma.oTRepuesto.count(),
    Compras: await prisma.compra.count(),
  };
  console.table(counts);
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
