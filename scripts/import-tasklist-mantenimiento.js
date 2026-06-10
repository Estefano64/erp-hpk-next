// Import del Excel tasklist_Mantenimiento.xlsx hacia BD Railway.
//
// Defaults a DRY-RUN — no escribe nada. Para ejecutar:
//   node scripts/import-tasklist-mantenimiento.js --apply
//
// Operaciones (en orden):
//   1. Rename de 4 equipos en BD para que matcheen los nombres del Excel:
//      MAQ013 → "Máquina de Soldar Lincoln 350 XL Construction"
//      MAQ014 → "Máquina de Soldar Lincoln 350 XP Power Conect"
//      MAQ019 → "Torno JP MAQ"
//      MAQ018 → "Torno TKM1000"
//   2. Crear 4 Estrategias PM1/PM2/PM3/PM4 en el catálogo.
//   3. Borrar TaskList + TaskListItem existentes (idempotencia — ahora están vacíos).
//   4. Importar Excel:
//      - Una fila del Excel = un item dentro de una TaskList
//      - Group key: (equipo_codigo, actividad_codigo, descripcion)
//      - Cada grupo crea 1 TaskList + N TaskListItems
//      - Normaliza MP1-4 (typos) → PM1-4
//      - Resuelve maquina_excel → equipo_codigo via diccionario.
const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");

const FILE = "C:/Users/cesar/OneDrive/Desktop/ERP-HpyK/Ramas/cambi/Cloudflare/Excels_HPK/tasklist_Mantenimiento.xlsx";
const APPLY = process.argv.includes("--apply");

// Renames acordados con el user (sin match exacto en BD pero corresponden).
const EQUIPO_RENAMES = [
  { codigo: "MAQ013", nuevaDescripcion: "Máquina de Soldar Lincoln 350 XL Construction" },
  { codigo: "MAQ014", nuevaDescripcion: "Máquina de Soldar Lincoln 350 XP Power Conect" },
  { codigo: "MAQ019", nuevaDescripcion: "Torno JP MAQ" },
  { codigo: "MAQ018", nuevaDescripcion: "Torno TKM1000" },
];

// Estrategias PM a crear. La cascada PM1→PM4 NO se modela en BD — vive en el
// query del endpoint aplicar-tasklist (ej. PM2 incluye PM1+PM2). Acá solo
// creamos el catálogo de 4 entradas.
const ESTRATEGIAS_PM = [
  { codigo: "PM1", descripcion: "Mantenimiento Preventivo Nivel 1", frecuencia: 1, unidad: "MES" },
  { codigo: "PM2", descripcion: "Mantenimiento Preventivo Nivel 2 (incluye PM1)", frecuencia: 3, unidad: "MES" },
  { codigo: "PM3", descripcion: "Mantenimiento Preventivo Nivel 3 (incluye PM1+PM2)", frecuencia: 6, unidad: "MES" },
  { codigo: "PM4", descripcion: "Mantenimiento Preventivo Nivel 4 (incluye PM1+PM2+PM3)", frecuencia: 12, unidad: "MES" },
];

function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Normaliza "MP1"→"PM1" (typo del Excel). Acepta también lowercase.
function normalizaActividad(raw) {
  const s = String(raw ?? "").trim().toUpperCase();
  // MP1, MP2, MP3, MP4 → PM1, PM2, PM3, PM4
  const mp = s.match(/^MP([1-4])$/);
  if (mp) return `PM${mp[1]}`;
  // PM1..PM4 ya están OK
  if (/^PM[1-4]$/.test(s)) return s;
  return s; // valor desconocido — lo dejamos tal cual para reportar después
}

(async () => {
  const p = new PrismaClient();

  console.log(`\n╔══════════════════════════════════════════════════════════╗`);
  console.log(`║  IMPORT tasklist_Mantenimiento.xlsx                      ║`);
  console.log(`║  Modo: ${APPLY ? "APPLY (escribe en BD)" : "DRY-RUN (no escribe)"}${" ".repeat(APPLY ? 28 : 30)}║`);
  console.log(`╚══════════════════════════════════════════════════════════╝`);

  // ─── 1. Cargar Excel ──────────────────────────────────────────────
  const wb = XLSX.readFile(FILE);
  const ws = wb.Sheets["Task List Materiales"];
  const rawRows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });
  // La primera fila es header repetido — la filtramos.
  const rows = rawRows.filter((r) => r["__EMPTY"] !== "N/P cod 2");
  console.log(`\nFilas de items en Excel (sin header): ${rows.length}`);

  // ─── 2. Construir diccionario maquina_excel → equipo_codigo ──────
  // Para los 4 renames usamos el código viejo (con su nuevo nombre).
  // Para el resto matcheamos por descripción normalizada.
  const equiposDB = await p.equipo.findMany({ select: { codigo: true, descripcion: true } });
  const equipoByDescNorm = new Map(equiposDB.map((e) => [norm(e.descripcion), e.codigo]));
  // Sobrescribimos los renames con el nombre nuevo (post-rename) → código.
  for (const r of EQUIPO_RENAMES) {
    equipoByDescNorm.set(norm(r.nuevaDescripcion), r.codigo);
  }
  // Caso fuzzy: el Excel trae "Montacargas\nHYNDAI\n3TN" — el norm() ya colapsa
  // los \n a espacio. Pero el equipo en BD es "Montacargas HYNDAI" sin "3TN".
  // Mapeo manual:
  equipoByDescNorm.set(norm("Montacargas\nHYNDAI\n3TN"), "MAQ024");

  // ─── 3. Agrupar filas del Excel por (maquina, actividad, descripcion) ─
  const grupos = new Map(); // key: maquina|actividad|descripcion → { ...info, items: [] }
  const sinEquipo = new Set(); // máquinas que no resuelven a equipo_codigo
  const actividadesDesconocidas = new Set();

  for (const r of rows) {
    const maquinaRaw = r["__EMPTY"];
    if (!maquinaRaw || String(maquinaRaw).trim() === "") continue;
    const maquina = String(maquinaRaw).trim();
    const actividadRaw = r["Prod y Mant_1"];
    const actividad = normalizaActividad(actividadRaw);
    if (!/^PM[1-4]$/.test(actividad)) {
      actividadesDesconocidas.add(actividad);
      continue;
    }
    const descripcion = String(r["Prod y Mant_2"] ?? "").trim();
    if (!descripcion) continue;

    const equipo_codigo = equipoByDescNorm.get(norm(maquina)) ?? null;
    if (!equipo_codigo) sinEquipo.add(maquina);

    const key = `${equipo_codigo ?? "(?)"}|${actividad}|${descripcion}`;
    let grupo = grupos.get(key);
    if (!grupo) {
      grupo = {
        maquina_taller: maquina,
        equipo_codigo,
        actividad_codigo: actividad,
        descripcion,
        usuario_responsable: r["Prod y Mant"] ?? null,
        items: [],
      };
      grupos.set(key, grupo);
    }

    const itemNum = Number(r["Prod y Mant_3"]);
    if (!Number.isFinite(itemNum) || itemNum <= 0) continue;
    const tipoRaw = String(r["Prod y Mant_4"] ?? "").trim().toUpperCase();
    const tipo = tipoRaw === "MAC" || tipoRaw === "CAD" || tipoRaw === "SER" ? tipoRaw : "CAD";
    const cantidad = Number(r[" Prod y Mant"]);
    const um = r["__EMPTY_3"] ? String(r["__EMPTY_3"]).trim() : null;
    const refDesc = r["__EMPTY_4"] ? String(r["__EMPTY_4"]).trim() : null;
    const np = r["Prod y Mant_5"] ? String(r["Prod y Mant_5"]).trim() : null;
    const texto = r["Prod y Mant(Solo si es servicio)"] ? String(r["Prod y Mant(Solo si es servicio)"]).trim() : null;
    const precioRaw = r["Logistica(Solo si es servicio)"];
    const precio = precioRaw != null && precioRaw !== "" && Number.isFinite(Number(precioRaw)) ? Number(precioRaw) : null;

    grupo.items.push({
      item: itemNum,
      tipo,
      material_codigo: r["Software_2"] ? String(r["Software_2"]).trim() : null,
      ref_descripcion: refDesc,
      np,
      requerimiento: Number.isFinite(cantidad) ? cantidad : null,
      um,
      texto,
      precio,
    });
  }

  console.log(`\nGrupos (TaskList) a crear: ${grupos.size}`);
  let totalItems = 0;
  for (const g of grupos.values()) totalItems += g.items.length;
  console.log(`Total TaskListItems: ${totalItems}`);
  console.log(`Máquinas SIN match a equipo: ${sinEquipo.size}${sinEquipo.size ? " — " + [...sinEquipo].join(", ") : ""}`);
  if (actividadesDesconocidas.size > 0) {
    console.log(`⚠ Actividades desconocidas (no PM1-4): ${[...actividadesDesconocidas].join(", ")}`);
  }

  // Desglose por equipo + PM
  console.log(`\nDesglose por equipo + PM (primeros 10 equipos):`);
  const porEquipo = new Map();
  for (const g of grupos.values()) {
    const ec = g.equipo_codigo ?? "(?)";
    let m = porEquipo.get(ec);
    if (!m) { m = { equipo: ec, maquina: g.maquina_taller, PM1: 0, PM2: 0, PM3: 0, PM4: 0, totalItems: 0 }; porEquipo.set(ec, m); }
    m[g.actividad_codigo]++;
    m.totalItems += g.items.length;
  }
  let i = 0;
  for (const m of porEquipo.values()) {
    if (i++ >= 10) break;
    console.log(`  ${m.equipo.padEnd(8)} ${m.maquina.padEnd(45)} PM1=${m.PM1} PM2=${m.PM2} PM3=${m.PM3} PM4=${m.PM4} items=${m.totalItems}`);
  }
  if (porEquipo.size > 10) console.log(`  ... y ${porEquipo.size - 10} más`);

  console.log(`\nMuestra de 1 TaskList:`);
  const muestra = grupos.values().next().value;
  if (muestra) {
    console.log(`  ${muestra.actividad_codigo} | ${muestra.maquina_taller} (${muestra.equipo_codigo})`);
    console.log(`  Descripción: ${muestra.descripcion.slice(0, 80)}`);
    console.log(`  Items (${muestra.items.length}):`);
    for (const it of muestra.items.slice(0, 5)) {
      console.log(`    ${it.item}. [${it.tipo}] ${it.ref_descripcion ?? ""}  ${it.requerimiento ?? ""} ${it.um ?? ""}${it.np ? ` (NP: ${it.np})` : ""}`);
    }
  }

  // ─── 4. Rename equipos y catálogos previos al import ──────────────
  console.log(`\nOperaciones extras:`);
  console.log(`  Rename de equipos: ${EQUIPO_RENAMES.length}`);
  console.log(`  Crear Estrategias PM: ${ESTRATEGIAS_PM.length}`);

  if (!APPLY) {
    console.log(`\n══ DRY-RUN ══ Nada se escribió. Para aplicar: node scripts/import-tasklist-mantenimiento.js --apply`);
    await p.$disconnect();
    return;
  }

  // ─── APPLY ─────────────────────────────────────────────────────────
  console.log(`\n>>> APPLY MODE — escribiendo en Railway`);

  // 4.1 Rename equipos
  console.log(`\n[1/4] Renombrando ${EQUIPO_RENAMES.length} equipos...`);
  for (const r of EQUIPO_RENAMES) {
    await p.equipo.update({
      where: { codigo: r.codigo },
      data: { descripcion: r.nuevaDescripcion },
    });
    console.log(`  ✓ ${r.codigo} → "${r.nuevaDescripcion}"`);
  }

  // 4.2 Crear Estrategias PM (idempotente: upsert)
  console.log(`\n[2/4] Creando/actualizando ${ESTRATEGIAS_PM.length} estrategias PM...`);
  // Necesitamos area_codigo, tipo_estrategia_codigo, status_codigo válidos. Tomamos
  // los primeros que estén activos en cada catálogo para no fallar la FK.
  const primerArea = await p.area.findFirst({ select: { codigo: true } });
  const primerTipoEstr = await p.tipoEstrategia.findFirst({ select: { codigo: true } });
  const primerStatusEstr = await p.statusEstrategia.findFirst({ select: { codigo: true } });
  const primerUM = await p.unidadMedida.findFirst({ where: { codigo: "MES" }, select: { codigo: true } })
    ?? await p.unidadMedida.findFirst({ select: { codigo: true } });
  if (!primerArea || !primerTipoEstr || !primerStatusEstr || !primerUM) {
    throw new Error("Faltan catálogos base (area, tipo_estrategia, status_estrategia, unidad_medida) para crear las Estrategias PM.");
  }
  for (const e of ESTRATEGIAS_PM) {
    await p.estrategia.upsert({
      where: { codigo: e.codigo },
      update: { descripcion: e.descripcion },
      create: {
        codigo: e.codigo,
        descripcion: e.descripcion,
        area_codigo: primerArea.codigo,
        actividad_codigo: e.codigo, // reusa el mismo código (PM1, etc.)
        frecuencia: e.frecuencia,
        unidad_medida_codigo: primerUM.codigo,
        tipo_estrategia_codigo: primerTipoEstr.codigo,
        status_codigo: primerStatusEstr.codigo,
      },
    });
    console.log(`  ✓ Estrategia ${e.codigo}: ${e.descripcion}`);
  }

  // 4.3 Borrar TaskList + Items previos (están vacíos hoy, pero idempotente)
  console.log(`\n[3/4] Limpiando TaskList previos (idempotencia)...`);
  await p.taskListItem.deleteMany({});
  const delTL = await p.taskList.deleteMany({});
  console.log(`  ✓ ${delTL.count} TaskList borrados`);

  // 4.4 Insertar nuevos TaskList + Items
  console.log(`\n[4/4] Insertando ${grupos.size} TaskList + ${totalItems} items...`);
  let creadosTL = 0;
  let creadosItems = 0;
  for (const g of grupos.values()) {
    const tl = await p.taskList.create({
      data: {
        maquina_taller: g.maquina_taller,
        equipo_codigo: g.equipo_codigo,
        actividad_codigo: g.actividad_codigo,
        descripcion: g.descripcion,
        usuario_responsable: g.usuario_responsable,
        items: {
          create: g.items.map((it) => ({
            item: it.item,
            tipo: it.tipo,
            material_codigo: it.material_codigo,
            ref_descripcion: it.ref_descripcion,
            np: it.np,
            requerimiento: it.requerimiento,
            um: it.um,
            texto: it.texto,
            precio: it.precio,
          })),
        },
      },
    });
    creadosTL++;
    creadosItems += g.items.length;
    if (creadosTL % 20 === 0) process.stdout.write(`\r  ${creadosTL}/${grupos.size}`);
  }
  console.log(`\n✓ ${creadosTL} TaskList + ${creadosItems} items insertados.`);

  await p.$disconnect();
})().catch(async (e) => {
  console.error("\n✗ ERROR:", e);
  process.exit(1);
});
