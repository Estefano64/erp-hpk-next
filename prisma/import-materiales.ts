import { PrismaClient } from "@prisma/client";
import XLSX from "xlsx";

const prisma = new PrismaClient();

// Mapeo descripción → código para Área
const areaMap: Record<string, string> = {
  "Producción": "PR",
  "Produccion": "PR",
  "Seguridad": "SG",
  "Logistica": "LG",
  "Logística": "LG",
  "Mantenimiento": "MT",
  "Administración": "AD",
  "Administracion": "AD",
};

// Mapeo descripción → código para Categoría
const categoriaMap: Record<string, string> = {
  "Consumible": "CON",
  "Crítico": "CRI",
  "Critico": "CRI",
  "Repuesto": "REP",
  "Capital": "CAP",
  "Obsoleto": "OBS",
  "Fabricado": "FAB",
};

// Mapeo descripción → código para Clasificación
const clasificacionMap: Record<string, string> = {
  "Aceite": "ACEI",
  "Acero": "ACER",
  "Adaptador": "ADAP",
  "Anillo": "ANIL",
  "Anillo de desgaste": "ADES",
  "Anillo metálico": "AMET",
  "Anillo de respaldo": "ARES",
  "Anillo de retención": "ARET",
  "Anillo de retencion": "ARET",
  "Arandela": "ARAN",
  "Arandela de goma": "AGOM",
  "Back Up": "BACK",
  "Barras": "BARR",
  "Billa": "BILL",
  "Buffer": "BUFF",
  "Calce": "CALC",
  "Carrier Seal": "CASE",
  "Casquillo": "CASQ",
  "Cojinete": "COJI",
  "Conjunto amortiguador": "CAMO",
  "Conjunto de enchufe": "CENC",
  "Conjunto de imán": "CIMA",
  "Conjunto de iman": "CIMA",
  "Conjunto de resorte": "CRES",
  "Conjunto de sello": "CSEL",
  "Conjunto de tapón": "CTAP",
  "Conjunto de tapon": "CTAP",
  "Conjunto de válvula": "CVAL",
  "Conjunto de valvula": "CVAL",
  "Cone Roller": "CONR",
  "Contratuerca": "CONT",
  "Cup Roller.": "CUPR",
  "Cup Roller": "CUPR",
  "Damper": "DAMP",
  "Discos": "DISC",
  "Disco de fricción": "DFRI",
  "Disco de friccion": "DFRI",
  "Dowel Spring": "DOWS",
  "Duo cone": "DUOC",
  "Embolo": "EMB",
  "Equipo de seguridad": "EPPS",
  "Espaciador": "ESPA",
  "Espiga": "ESPI",
  "Guia": "GUIA",
  "Guía": "GUIA",
  "Grupo de sensor": "GSEN",
  "Iman": "IMAN",
  "Imán": "IMAN",
  "Insert": "INSE",
  "Iron Cast": "IRONC",
  "Juego de recptáculo": "JUREC",
  "Juego de recptaculo": "JUREC",
  "Kit de bladder": "KITB",
  "Kit de sellos": "KITS",
  "Limpiadores": "LIMP",
  "Limpiador": "LIMP",
  "Manguito": "MANG",
  "Sello anular": "ORIN",
  "Pasador": "PASA",
  "Perno": "PERN",
  "Pista": "PISTA",
  "Placa": "PLCA",
  "Plate": "PLTE",
  "Plug": "PLUG",
  "Prisionero de bola": "PRIB",
  "Prisionero": "PRIS",
  "Protector": "PROT",
  "Protector de válvula": "PROV",
  "Protector de valvula": "PROV",
  "Resorte": "RESO",
  "Retenedor": "RETD",
  "Reten": "RETE",
  "Retén": "RETE",
  "Ring Cushion": "RINC",
  "Rodamiento": "RODA",
  "Rod Bushing": "RODB",
  "Rótula": "ROTU",
  "Rótulas": "ROTU",
  "Seguro seager": "SEGS",
  "Seguros": "SEGU",
  "Sello anillo": "SELA",
  "Sello de culata": "SELC",
  "Sello de funda": "SELF",
  "Sellos": "SELL",
  "Sello": "SELL",
  "Sello principal": "SELP",
  "Sensores": "SENS",
  "Sensor de velocidad": "SENV",
  "Shim": "SHIM",
  "Suministros": "SUMI",
  "Tapa": "TAPA",
  "Tapon": "TAPO",
  "Tapón": "TAPO",
  "Tornillo": "TORN",
  "Trabador": "TRAB",
  "Tubos": "TUBO",
  "Tuerca": "TUER",
  "Uniformes": "UNIF",
  "Válvula": "VALV",
  "Valvula": "VALV",
};

// Mapeo nombre fabricante → código
const fabricanteMap: Record<string, string> = {
  "KOMATSU": "KOM",
  "CATERPILLAR": "CAT",
  "BOHLER": "BOH",
  "ALTERNATIVO": "ALT",
  "MACHEN": "MAC",
  "CHEM TOOLS": "CHMT",
};

// Mapeo descripción → código para Und Med
const undMedMap: Record<string, string> = {
  "unidad": "und",
  "Unidad": "und",
  "Kilogramo": "kg",
  "kilogramo": "kg",
  "cilindro": "cil",
  "Cilindro": "cil",
  "Metro": "m",
  "metro": "m",
  "Balde": "bal",
  "balde": "bal",
  "litro": "lt",
  "Litro": "lt",
  "galones": "gl",
  "Galones": "gl",
};

async function main() {
  const xlsxPath = process.argv[2] || "C:/Users/HP/Downloads/1 Log - material (4).xlsx";
  const wb = XLSX.readFile(xlsxPath);
  const ws = wb.Sheets["Sheet1"];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];

  // Row 0 = filtros, Row 1 = headers, Row 2+ = data
  let created = 0;
  let skipped = 0;
  let errors = 0;
  let counter = 1;

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[2]) {
      skipped++;
      continue;
    }

    const descripcion = String(row[2]).trim();
    const plantaCodigo = String(row[3] || "AQPTA01").trim();
    const areaRaw = String(row[4] || "").trim();
    const catRaw = String(row[5] || "").trim();
    const clasRaw = String(row[6] || "").trim();
    const undMedRaw = String(row[9] || "unidad").trim();
    const plazoEntrega = row[10] ? Number(row[10]) : null;
    const precio = row[11] ? Number(row[11]) : null;
    const monedaCodigo = row[12] ? String(row[12]).trim() : null;
    const fabRaw = row[13] ? String(row[13]).trim() : null;
    const np = row[14] ? String(row[14]).trim() : null;

    const areaCodigo = areaMap[areaRaw];
    const categoriaCodigo = categoriaMap[catRaw];
    const clasificacionCodigo = clasificacionMap[clasRaw];
    const undMedCodigo = undMedMap[undMedRaw] || undMedRaw;

    // Fabricante: check map first (full names), then use as-is (short codes)
    let fabricanteCodigo: string | null = null;
    if (fabRaw) {
      fabricanteCodigo = fabricanteMap[fabRaw] || fabRaw;
    }

    if (!areaCodigo) {
      console.error(`  ✗ Row ${i}: Área no mapeada: "${areaRaw}"`);
      errors++;
      continue;
    }
    if (!categoriaCodigo) {
      console.error(`  ✗ Row ${i}: Categoría no mapeada: "${catRaw}"`);
      errors++;
      continue;
    }
    if (!clasificacionCodigo) {
      console.error(`  ✗ Row ${i}: Clasificación no mapeada: "${clasRaw}"`);
      errors++;
      continue;
    }

    const codigo = String(counter).padStart(6, "0");

    try {
      await prisma.material.upsert({
        where: { codigo },
        update: {},
        create: {
          codigo,
          descripcion,
          planta_codigo: plantaCodigo,
          area_codigo: areaCodigo,
          categoria_codigo: categoriaCodigo,
          clasificacion_codigo: clasificacionCodigo,
          unidad_medida_codigo: undMedCodigo,
          plazo_entrega: plazoEntrega,
          precio,
          moneda_codigo: monedaCodigo,
          fabricante_codigo: fabricanteCodigo,
          np,
        },
      });
      created++;
      counter++;
    } catch (err) {
      console.error(`  ✗ Row ${i}: Error - ${err instanceof Error ? err.message : err}`);
      errors++;
    }
  }

  console.log(`\n✓ Importación completada:`);
  console.log(`  Creados: ${created}`);
  console.log(`  Saltados (vacíos): ${skipped}`);
  console.log(`  Errores: ${errors}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
