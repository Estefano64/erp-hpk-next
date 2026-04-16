/**
 * Script de importación de equipos desde Excel
 * Ejecutar: npx tsx scripts/import-equipos.ts
 */
import XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const EXCEL_PATH = "C:/Users/HP/Downloads/2 Mant - equipos y Herramientos (1).xlsx";

// Mapeo de fabricantes del Excel → código corto para la DB
// Se genera automáticamente tomando las primeras letras significativas
function generateFabCode(name: string, existingCodes: Set<string>): string {
  // Limpiar: tomar solo la primera palabra significativa (antes de paréntesis)
  const clean = name.replace(/\(.*\)/, "").trim().toUpperCase();
  const words = clean.split(/[\s\-\/]+/).filter(Boolean);

  // Intentar código de 3-4 letras del nombre principal
  let base = words[0]?.substring(0, 4) ?? "XXX";
  if (base.length < 3) base = clean.substring(0, 4);
  base = base.replace(/[^A-Z0-9]/g, "");
  if (base.length < 2) base = "XX";

  let code = base.substring(0, 4);
  if (!existingCodes.has(code)) return code;

  // Si colisiona, agregar letras de la segunda palabra
  if (words.length > 1) {
    code = base.substring(0, 3) + words[1][0];
    if (!existingCodes.has(code)) return code;
  }

  // Si aún colisiona, agregar número
  for (let i = 2; i < 100; i++) {
    code = base.substring(0, 3) + String(i);
    if (!existingCodes.has(code)) return code;
  }

  return code;
}

async function main() {
  console.log("📖 Leyendo Excel...");
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets["Sheet1"];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];

  // Obtener catálogos existentes en DB
  const [dbFabs, dbStatus, dbTipos, dbAreas, dbSubAreas, dbUnidades, dbCriticidades, dbPlantas] =
    await Promise.all([
      prisma.fabricante.findMany(),
      prisma.statusEquipo.findMany(),
      prisma.tipoEquipo.findMany(),
      prisma.area.findMany(),
      prisma.subArea.findMany(),
      prisma.unidadMedida.findMany(),
      prisma.criticidad.findMany(),
      prisma.planta.findMany(),
    ]);

  const fabByNombre = new Map(dbFabs.map((f) => [f.nombre.toUpperCase(), f.codigo]));
  const fabByCodigo = new Set(dbFabs.map((f) => f.codigo));
  const statusSet = new Set(dbStatus.map((s) => s.codigo));
  const tipoSet = new Set(dbTipos.map((t) => t.codigo));
  const areaSet = new Set(dbAreas.map((a) => a.codigo));
  const subAreaSet = new Set(dbSubAreas.map((s) => s.codigo));
  const undSet = new Set(dbUnidades.map((u) => u.codigo));
  const critSet = new Set(dbCriticidades.map((c) => c.codigo));
  const plantaSet = new Set(dbPlantas.map((p) => p.codigo));

  // ── Paso 1: Insertar catálogos faltantes ──

  // Status faltantes
  const statusMap: Record<string, string> = { OPE: "Operativo", INO: "Inoperativo", REP: "En Reparación", STD: "Standby", BAJ: "Baja" };
  for (const [codigo, nombre] of Object.entries(statusMap)) {
    if (!statusSet.has(codigo)) {
      await prisma.statusEquipo.create({ data: { codigo, nombre } });
      console.log(`  ✅ Status creado: ${codigo} - ${nombre}`);
      statusSet.add(codigo);
    }
  }

  // Tipos faltantes
  const tipoMap: Record<string, string> = { HER: "Herramientas", EQP: "Equipos", VEH: "Vehículos", INF: "Infraestructura", MAQ: "Máquinas" };
  for (const [codigo, nombre] of Object.entries(tipoMap)) {
    if (!tipoSet.has(codigo)) {
      await prisma.tipoEquipo.create({ data: { codigo, nombre } });
      console.log(`  ✅ Tipo creado: ${codigo} - ${nombre}`);
      tipoSet.add(codigo);
    }
  }

  // Áreas faltantes
  const areaMap: Record<string, string> = { PR: "Producción", SG: "Seguridad", LG: "Logística", MT: "Mantenimiento", AD: "Administración" };
  for (const [codigo, nombre] of Object.entries(areaMap)) {
    if (!areaSet.has(codigo)) {
      await prisma.area.create({ data: { codigo, nombre } });
      console.log(`  ✅ Área creada: ${codigo} - ${nombre}`);
      areaSet.add(codigo);
    }
  }

  // Sub Áreas faltantes
  const subAreaMap: Record<string, string> = {
    EVA: "Evaluación", BRU: "Bruñido", SOL: "Soldadura", MAQ: "Maquinado",
    PIN: "Pintura", CRO: "Cromado", HER: "Herramientas", EQP: "Equipos",
    VEH: "Vehículos", INF: "Infraestructura", ASU: "Almacén de Suministros", ARE: "Almacén de Repuestos",
  };
  for (const [codigo, nombre] of Object.entries(subAreaMap)) {
    if (!subAreaSet.has(codigo)) {
      await prisma.subArea.create({ data: { codigo, nombre, area_codigo: "MT" } });
      console.log(`  ✅ Sub Área creada: ${codigo} - ${nombre}`);
      subAreaSet.add(codigo);
    }
  }

  // Unidades de medida faltantes del Excel
  const undMap: Record<string, string> = {
    mm: "Milímetro", cm: "Centímetro", m: "Metro", in: "Pulgada",
    kg: "Kilogramo", tn: "Tonelada", h: "Hora", m2: "Metro cuadrado",
    m3: "Metro cúbico", lt: "Litro", gl: "Galones", und: "Unidad",
    cil: "Cilindro", año: "Año", mes: "Mes", dia: "Día",
    km: "Kilómetros", amp: "Amperaje", psi: "Libras por pulgada cuadrada", lbf: "Libras Fuerza",
  };
  for (const [codigo, nombre] of Object.entries(undMap)) {
    if (!undSet.has(codigo)) {
      await prisma.unidadMedida.create({ data: { codigo, nombre } });
      console.log(`  ✅ Unidad creada: ${codigo} - ${nombre}`);
      undSet.add(codigo);
    }
  }

  // Criticidades faltantes
  const critMap: Record<string, { nombre: string; nivel: number }> = {
    "1": { nombre: "Alta", nivel: 1 },
    "2": { nombre: "Media", nivel: 2 },
    "3": { nombre: "Baja", nivel: 3 },
  };
  for (const [codigo, { nombre, nivel }] of Object.entries(critMap)) {
    if (!critSet.has(codigo)) {
      await prisma.criticidad.create({ data: { codigo, nombre, nivel } });
      console.log(`  ✅ Criticidad creada: ${codigo} - ${nombre}`);
      critSet.add(codigo);
    }
  }

  // Planta
  if (!plantaSet.has("AQPTA01")) {
    await prisma.planta.create({ data: { codigo: "AQPTA01", nombre: "Taller de reparación Arequipa" } });
    console.log(`  ✅ Planta creada: AQPTA01`);
  }

  // ── Paso 2: Insertar fabricantes faltantes ──
  console.log("\n🏭 Procesando fabricantes...");
  const fabCache = new Map(fabByNombre); // nombre → codigo
  const newFabCount = { count: 0 };

  function getFabCode(excelName: string): string | null {
    const name = excelName.trim();
    if (!name || name === "HPK" || name === "HP&K") return null; // empresa propia, no fabricante externo

    const upper = name.toUpperCase();

    // Buscar por nombre exacto
    if (fabCache.has(upper)) return fabCache.get(upper)!;

    // Buscar por nombre base (antes del paréntesis)
    const baseName = upper.replace(/\(.*\)/, "").trim();
    for (const [key, code] of fabCache) {
      if (key === baseName || key.startsWith(baseName)) return code;
    }

    // No existe, crear nuevo
    const code = generateFabCode(name, fabByCodigo);
    fabByCodigo.add(code);
    fabCache.set(upper, code);
    newFabCount.count++;
    return code;
  }

  // Pre-procesar todos los fabricantes para crearlos en batch
  const fabsToCreate: { codigo: string; nombre: string }[] = [];
  const excelFabNames = new Set<string>();

  for (let i = 2; i < rows.length; i++) {
    const fabName = String(rows[i][9]).trim();
    if (fabName && fabName !== "HPK" && fabName !== "HP&K") {
      excelFabNames.add(fabName);
    }
  }

  for (const name of excelFabNames) {
    const upper = name.toUpperCase();
    if (fabCache.has(upper)) continue;

    const baseName = upper.replace(/\(.*\)/, "").trim();
    let found = false;
    for (const [key] of fabCache) {
      if (key === baseName || key.startsWith(baseName)) { found = true; break; }
    }
    if (found) continue;

    const code = generateFabCode(name, fabByCodigo);
    fabByCodigo.add(code);
    fabCache.set(upper, code);
    fabsToCreate.push({ codigo: code, nombre: name });
  }

  if (fabsToCreate.length > 0) {
    console.log(`  Creando ${fabsToCreate.length} fabricantes nuevos...`);
    for (const fab of fabsToCreate) {
      await prisma.fabricante.create({ data: { codigo: fab.codigo, nombre: fab.nombre } });
    }
    console.log(`  ✅ ${fabsToCreate.length} fabricantes creados`);
  }

  // Recargar fabricantes
  const allFabs = await prisma.fabricante.findMany();
  const fabFinalMap = new Map<string, string>(); // nombre upper → codigo
  for (const f of allFabs) {
    fabFinalMap.set(f.nombre.toUpperCase(), f.codigo);
  }

  function resolveFab(excelName: string): string | null {
    const name = excelName.trim();
    if (!name || name === "HPK" || name === "HP&K") return null;
    const upper = name.toUpperCase();
    if (fabFinalMap.has(upper)) return fabFinalMap.get(upper)!;

    // Buscar por base
    const baseName = upper.replace(/\(.*\)/, "").trim();
    for (const [key, code] of fabFinalMap) {
      if (key === baseName || key.startsWith(baseName) || baseName.startsWith(key.replace(/\(.*\)/, "").trim())) {
        return code;
      }
    }
    return null;
  }

  // Verificar moneda USD
  const usd = await prisma.moneda.findUnique({ where: { codigo: "USD" } });
  if (!usd) {
    await prisma.moneda.create({ data: { codigo: "USD", nombre: "Dólar Americano", simbolo: "$" } });
    console.log("  ✅ Moneda USD creada");
  }

  // ── Paso 3: Importar equipos ──
  console.log("\n📦 Importando equipos...");

  // Verificar equipos existentes
  const existingEquipos = new Set(
    (await prisma.equipo.findMany({ select: { codigo: true } })).map((e) => e.codigo)
  );

  let imported = 0;
  let skipped = 0;
  let errors = 0;
  const seenCodigos = new Set<string>();

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    const codigo = String(row[1]).trim();
    if (!codigo) continue; // fila vacía

    // Saltar duplicados en el Excel (MAQ014 aparece 2 veces)
    if (seenCodigos.has(codigo)) {
      skipped++;
      continue;
    }
    seenCodigos.add(codigo);

    if (existingEquipos.has(codigo)) {
      skipped++;
      continue;
    }

    const descripcion = String(row[2]).trim().replace(/\n/g, " ");
    const statusCodigo = String(row[3]).trim() || "OPE";
    const areaCodigo = String(row[4]).trim();
    const subAreaCodigo = String(row[5]).trim() || null;
    const tipoCodigo = String(row[6]).trim();
    const fechaInicio = row[7] ? Number(row[7]) : null;
    const fechaFab = row[8] ? Number(row[8]) : null;
    const fabName = String(row[9]).trim();
    const modelo = String(row[10]).trim() || null;
    const ns = String(row[11]).trim() || null;
    const np = String(row[12]).trim() || null;
    const capacidad = String(row[13]).trim() || null;
    const undMed = String(row[14]).trim() || null;
    const observaciones = String(row[15]).trim() || null;
    const plantaCodigo = String(row[16]).trim() || "AQPTA01";
    const critCodigo = row[17] !== "" && row[17] !== undefined ? String(row[17]).trim() : null;
    const costo = row[18] !== "" && row[18] !== undefined ? Number(row[18]) : null;
    const ubicacion = String(row[19]).trim() || null;
    const cantidad = row[20] !== "" && row[20] !== undefined ? Number(row[20]) || 1 : 1;
    const usuario = String(row[0]).trim() || String(row[21]).trim() || null;

    // Validar campos requeridos
    if (!descripcion || !statusCodigo || !areaCodigo || !tipoCodigo) {
      console.log(`  ⚠️ Fila ${i}: campos requeridos vacíos para ${codigo}, saltando`);
      errors++;
      continue;
    }

    // Validar que catálogos existen
    if (!statusSet.has(statusCodigo)) {
      console.log(`  ⚠️ Fila ${i}: status '${statusCodigo}' no existe, saltando ${codigo}`);
      errors++;
      continue;
    }
    if (!areaSet.has(areaCodigo)) {
      console.log(`  ⚠️ Fila ${i}: área '${areaCodigo}' no existe, saltando ${codigo}`);
      errors++;
      continue;
    }
    if (!tipoSet.has(tipoCodigo)) {
      console.log(`  ⚠️ Fila ${i}: tipo '${tipoCodigo}' no existe, saltando ${codigo}`);
      errors++;
      continue;
    }

    const fabCodigo = resolveFab(fabName);

    try {
      await prisma.equipo.create({
        data: {
          codigo,
          descripcion,
          status_codigo: statusCodigo,
          area_codigo: areaCodigo,
          sub_area_codigo: subAreaCodigo && subAreaSet.has(subAreaCodigo) ? subAreaCodigo : null,
          tipo_codigo: tipoCodigo,
          fecha_inicio: fechaInicio ? new Date(`${fechaInicio}-01-01`) : null,
          fecha_fabricacion: fechaFab ? new Date(`${fechaFab}-01-01`) : null,
          fabricante_codigo: fabCodigo,
          modelo: modelo?.replace(/\n/g, " ") ?? null,
          numero_serie: ns,
          numero_parte: np,
          capacidad,
          unidad_medida_codigo: undMed && undSet.has(undMed) ? undMed : null,
          observaciones: observaciones === "maquina" || observaciones === "vehiculo" ? null : observaciones,
          planta_codigo: plantaSet.has(plantaCodigo) ? plantaCodigo : "AQPTA01",
          criticidad_codigo: critCodigo && critSet.has(critCodigo) ? critCodigo : null,
          precio: costo != null && !isNaN(costo) ? costo : null,
          moneda_codigo: costo != null && !isNaN(costo) ? "USD" : null,
          ubicacion_codigo: ubicacion || null,
          cantidad,
          usuario_responsable: usuario,
        },
      });
      imported++;
    } catch (err) {
      console.log(`  ❌ Error fila ${i} (${codigo}):`, (err as Error).message?.substring(0, 100));
      errors++;
    }
  }

  console.log(`\n✅ Importación completada:`);
  console.log(`   - Importados: ${imported}`);
  console.log(`   - Saltados (ya existen o duplicados): ${skipped}`);
  console.log(`   - Errores: ${errors}`);

  // Verificación final
  const totalDB = await prisma.equipo.count();
  console.log(`   - Total equipos en DB: ${totalDB}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
