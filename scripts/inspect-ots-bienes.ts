// scripts/inspect-ots-bienes.ts
// SOLO LECTURA. Inspecciona el Excel 6.1_Ots_VENTAS_INFORMACION.xlsx
// para entender el shape de la hoja de "OTs de bienes" antes de subirla.

import * as XLSX from "xlsx";
import * as path from "node:path";

const EXCEL_PATH = path.resolve(__dirname, "../../6.1_Ots_VENTAS_INFORMACION.xlsx");

function analizarBienes(wb: XLSX.WorkBook) {
  const ws = wb.Sheets["Ots De bienes "];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  console.log(`\n${"#".repeat(70)}`);
  console.log("ANÁLISIS DETALLADO — HOJA 'Ots De bienes'");
  console.log("#".repeat(70));

  // Las primeras 2 filas son: r0 headers, r1 marcadores "X". Los datos
  // empiezan en r2.
  const dataRows = rows.slice(2).filter((r) => {
    const v = String((r as unknown[])[0] ?? "").trim();
    return v.length > 0;
  });
  console.log(`Total filas de datos: ${dataRows.length}`);

  // Distribución por año (parseado del código VYYNNNN).
  const porAnio = new Map<string, number>();
  const porTipo = new Map<string, number>();
  const codigosInvalidos: string[] = [];
  for (const r of dataRows) {
    const row = r as unknown[];
    const cod = String(row[0] ?? "").trim();
    // Formato esperado: V + 2 dígitos año + 4 dígitos correlativo
    const m = /^V(\d{2})(\d{4,})$/.exec(cod);
    if (!m) {
      codigosInvalidos.push(cod);
      continue;
    }
    const anio = m[1];
    porAnio.set(anio, (porAnio.get(anio) ?? 0) + 1);

    const tipo = String(row[2] ?? "").trim() || "(vacío)";
    porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + 1);
  }
  console.log(`\nPor año (del código VYYNNNN):`);
  [...porAnio.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([k, n]) =>
    console.log(`   20${k}: ${n} OTs`),
  );
  if (codigosInvalidos.length > 0) {
    console.log(`\n⚠️  Códigos que NO matchean V<yy><nnnn>: ${codigosInvalidos.length}`);
    console.log(`   primeros 10: ${codigosInvalidos.slice(0, 10).join(", ")}`);
  }
  console.log(`\nPor "Tipo" (col 2):`);
  [...porTipo.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) =>
    console.log(`   ${String(n).padStart(4)}  "${k}"`),
  );

  // Valores únicos de las columnas categóricas para mapear contra catálogos.
  function unicos(c: number, etiq: string) {
    const set = new Map<string, number>();
    for (const r of dataRows) {
      const v = String((r as unknown[])[c] ?? "").trim() || "(vacío)";
      set.set(v, (set.get(v) ?? 0) + 1);
    }
    console.log(`\n📋 ${etiq} (col ${c}) — valores únicos:`);
    [...set.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).forEach(([k, n]) =>
      console.log(`   ${String(n).padStart(4)}  "${k}"`),
    );
    if (set.size > 30) console.log(`   ... y ${set.size - 30} más`);
  }
  unicos(1, "Cliente");
  unicos(7, "Fabricante");
  unicos(22, "Garantia");
  unicos(23, "Atencion reparacion");
  unicos(24, "Tipo Reparacion");
  unicos(25, "Tipo Garantia");
  unicos(26, "Prioridad de atención");
  unicos(28, "Base Metalica");
  unicos(31, "OT Status");
  unicos(32, "Recursos Status");
  unicos(33, "Taller Status");

  // Conteo de campos llenos vs vacíos en columnas clave (para saber qué
  // se puede mapear y qué quedará null).
  console.log(`\n📊 % de filas con campo lleno:`);
  const cols = [
    [4, "Cod Rep"], [5, "NP"], [7, "Fabricante"], [10, "Equipo"], [11, "NS"],
    [18, "Fecha recepcion"], [22, "Garantia"], [29, "Comentarios"], [30, "Fecha req. cliente"],
  ] as const;
  for (const [c, etiq] of cols) {
    let llenos = 0;
    for (const r of dataRows) {
      const v = String((r as unknown[])[c] ?? "").trim();
      if (v) llenos++;
    }
    const pct = ((llenos / dataRows.length) * 100).toFixed(1);
    console.log(`   ${String(llenos).padStart(4)}/${dataRows.length} (${pct}%)  ${etiq}`);
  }
}

function main() {
  const wb = XLSX.readFile(EXCEL_PATH);
  console.log(`Archivo: ${EXCEL_PATH}\n`);
  console.log("Sheets disponibles:");
  wb.SheetNames.forEach((n, i) => console.log(`  ${i}. ${n}`));

  analizarBienes(wb);
  return;

  // (código original de inspección de todas las hojas)
  // eslint-disable-next-line no-unreachable
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
    console.log(`\n${"=".repeat(70)}`);
    console.log(`=== HOJA: "${name}" (${rows.length} filas) ===`);

    let maxCols = 0;
    for (const r of rows) maxCols = Math.max(maxCols, (r as unknown[]).length);
    console.log(`Max columnas: ${maxCols}`);

    // Mostrar primeras 5 filas con todas las columnas que tengan contenido.
    for (let r = 0; r < Math.min(6, rows.length); r++) {
      const row = rows[r] as unknown[];
      const cells: string[] = [];
      for (let c = 0; c < maxCols; c++) {
        const v = String(row[c] ?? "").trim();
        if (v) cells.push(`c${c}="${v.slice(0, 50)}"`);
      }
      if (cells.length > 0) console.log(`   r${r}: ${cells.join(" | ")}`);
      else console.log(`   r${r}: (vacía)`);
    }

    // Si la hoja tiene > 5 filas, mostrar también el conteo de filas con OT (col 0 numérico) y rango de OTs.
    if (rows.length > 5) {
      let conOt = 0;
      const ots: number[] = [];
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r] as unknown[];
        const v = String(row[0] ?? "").trim();
        if (/^\d+$/.test(v)) {
          conOt++;
          ots.push(parseInt(v, 10));
        }
      }
      console.log(`   📊 Filas con OT numérico en col 0: ${conOt}`);
      if (ots.length > 0) {
        ots.sort((a, b) => a - b);
        console.log(`   📊 Rango de OTs: ${ots[0]} → ${ots[ots.length - 1]}`);
      }
    }
  }
}
main();
