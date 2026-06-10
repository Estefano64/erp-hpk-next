// Análisis de matching: máquinas del Excel tasklist_Mantenimiento vs Equipos
// en BD Railway. Solo lectura.
const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

const FILE = "C:/Users/cesar/OneDrive/Desktop/ERP-HpyK/Ramas/cambi/Cloudflare/Excels_HPK/tasklist_Mantenimiento.xlsx";

// Normaliza para comparar nombres: lowercase, remueve dobles espacios, quita acentos.
function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

(async () => {
  // 1) Leer máquinas únicas del Excel (de la columna "N/P cod 2" que es __EMPTY).
  const wb = XLSX.readFile(FILE);
  const ws = wb.Sheets["Task List Materiales"];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });
  // Saltar la primera fila (es header repetido); usar __EMPTY como nombre máquina.
  const maquinasExcel = new Set();
  for (const r of rows) {
    const m = r["__EMPTY"];
    if (m && String(m).trim() !== "" && m !== "N/P cod 2") {
      maquinasExcel.add(String(m).trim());
    }
  }
  console.log(`Máquinas únicas en Excel: ${maquinasExcel.size}`);

  // 2) Leer todos los equipos de BD que parezcan máquinas de taller.
  const equiposDB = await p.equipo.findMany({
    select: { codigo: true, descripcion: true, tipo_codigo: true, area_codigo: true, activo: true },
  });
  console.log(`Total equipos en BD: ${equiposDB.length}`);

  // 3) Para cada máquina del Excel: buscar mejor match en BD.
  const resultados = [];
  for (const m of maquinasExcel) {
    const mNorm = norm(m);
    // Exact match
    const exacto = equiposDB.find((e) => norm(e.descripcion) === mNorm);
    if (exacto) {
      resultados.push({ excel: m, status: "EXACTO", match: exacto });
      continue;
    }
    // Contains (fuzzy)
    const contains = equiposDB.filter((e) => {
      const dNorm = norm(e.descripcion);
      return dNorm.includes(mNorm) || mNorm.includes(dNorm);
    });
    if (contains.length === 1) {
      resultados.push({ excel: m, status: "FUZZY-1", match: contains[0] });
    } else if (contains.length > 1) {
      resultados.push({ excel: m, status: "FUZZY-AMBIGUO", matches: contains });
    } else {
      resultados.push({ excel: m, status: "SIN-MATCH", match: null });
    }
  }

  // 4) Reportar
  const conteo = { EXACTO: 0, "FUZZY-1": 0, "FUZZY-AMBIGUO": 0, "SIN-MATCH": 0 };
  for (const r of resultados) conteo[r.status]++;

  console.log("\n══ RESUMEN ══");
  console.log(`  EXACTO:        ${conteo.EXACTO} (matchea perfecto por descripción)`);
  console.log(`  FUZZY-1:       ${conteo["FUZZY-1"]} (1 candidato similar)`);
  console.log(`  FUZZY-AMBIGUO: ${conteo["FUZZY-AMBIGUO"]} (varios candidatos — hay que decidir)`);
  console.log(`  SIN-MATCH:     ${conteo["SIN-MATCH"]} (no existe en BD — crear nuevo)`);

  console.log("\n══ DETALLE ══");
  for (const status of ["EXACTO", "FUZZY-1", "FUZZY-AMBIGUO", "SIN-MATCH"]) {
    const items = resultados.filter((r) => r.status === status);
    if (items.length === 0) continue;
    console.log(`\n── ${status} (${items.length}) ──`);
    for (const r of items) {
      if (status === "FUZZY-AMBIGUO") {
        console.log(`  Excel: "${r.excel}"`);
        for (const m of r.matches) console.log(`     → ${m.codigo}  ${m.descripcion}`);
      } else if (status === "SIN-MATCH") {
        console.log(`  "${r.excel}"  (crear nuevo)`);
      } else {
        console.log(`  ${r.match.codigo.padEnd(8)} "${r.excel}"  →  "${r.match.descripcion}"`);
      }
    }
  }

  await p.$disconnect();
})();
