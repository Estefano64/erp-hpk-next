// Lee MEDIDAS2.xlsx y genera src/lib/medidas-modelo-data.ts con los datos
// de medidas modelo (referencias) para cada cilindro identificado por NP.
//
// El Excel viene con esta estructura:
//   R1..R4: encabezados / metadata
//   R5    : nombres de columna
//   R6+   : una fila por cilindro (NP1, NP2, sistema medición, descripción, marca, modelo, + medidas)
//
// Generamos un array tipado donde cada entry agrupa las medidas por componente
// (cilindro, vástago, cuerpoIntermedio, tapa, pistón) para que el lookup desde
// el formulario sea simple: getMedidasModelo(np) → { cilindro: {...}, vastago: {...} }.

import xlsx from "xlsx";
import { writeFileSync } from "fs";
import path from "path";

const SRC = "c:/Users/cesar/OneDrive/Desktop/ERP-HpyK/Ramas/cambi/MEDIDAS2.xlsx";
const OUT = "src/lib/medidas-modelo-data.ts";

const wb = xlsx.readFile(SRC);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false });

// Las filas de datos arrancan en R6 (índice 5).
const dataRows = rows.slice(5).filter((r) => (r[0] && String(r[0]).trim()) || (r[1] && String(r[1]).trim()));

// Layout de columnas según R5 (índice 4) del Excel:
//   0: NP 1
//   1: NP 2
//   2: SIST. MED
//   3: DESCRIPCION
//   4: MARCA
//   5: MODELO
//   ── CILINDRO ──
//   6: DIAM INTERIOR
//   7: DIAM SALIDA
//   8: DIAM EXTERIOR
//   9: LONG BRUÑIDO
//  10: LONG TOTAL
//  11: DIAMETRO OJO
//  12: DIAMETRO IN COJINETE
//  13: ANCHO OJO
//  14: CANCAMO - TUBO (no usado)
//  15: CANCAMO - TUBO (no usado)
//   ── VASTAGO ──
//  16: DIAMETRO VASTAGO
//  17: LONGITUD CROMO
//  18: LONGITUD TOTAL
//  19: DIAMETRO ESPIGA
//  20: LONGITUD ESPIGA
//   ── VASTAGO - OJO ──
//  21: DIAMETRO EXT OJO
//  22: DIAMETRO INT OJO
//  23: ANCHO OJO
//  24: DIAMETRO INT COJINETE
//   ── CUERPO INTERMEDIO (telescópico) ──
//  25: Long. Cromado
//  26: Long. Bruñido
//  27: Diam. Int C1
//  28: Diam. Int C2
//  29: DIAM EX. CUERPO 1
//  30: Diam Ex C2
//   ── TAPA ──
//  31: EXTERIOR
//  32: INTERIOR
//  33: SELLADO
//  34: LONGITUD TOTAL
//   ── PISTON ──
//  35: EXTERIOR
//  36: INTERIOR
//  37: LONGITUD

const num = (v) => {
  if (v === "" || v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Number(n.toFixed(4)) : null;
};

const str = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
};

const items = dataRows.map((r) => ({
  np1: str(r[0]),
  np2: str(r[1]),
  sistema: str(r[2]) ?? "mm",
  descripcion: str(r[3]),
  marca: str(r[4]),
  modelo: str(r[5]),
  cilindro: {
    diamInterior: num(r[6]),
    diamSalida: num(r[7]),
    diamExterior: num(r[8]),
    longBrunido: num(r[9]),
    longTotal: num(r[10]),
    diamOjo: num(r[11]),
    diamIntCojinete: num(r[12]),
    anchoOjo: num(r[13]),
  },
  vastago: {
    diamVastago: num(r[16]),
    longCromo: num(r[17]),
    longTotal: num(r[18]),
    diamEspiga: num(r[19]),
    longEspiga: num(r[20]),
    diamExtOjo: num(r[21]),
    diamIntOjo: num(r[22]),
    anchoOjo: num(r[23]),
    diamIntCojinete: num(r[24]),
  },
  cuerpoIntermedio: {
    longCromo: num(r[25]),
    longBrunido: num(r[26]),
    diamIntC1: num(r[27]),
    diamIntC2: num(r[28]),
    diamExtC1: num(r[29]),
    diamExtC2: num(r[30]),
  },
  tapa: {
    exterior: num(r[31]),
    interior: num(r[32]),
    sellado: num(r[33]),
    longTotal: num(r[34]),
  },
  piston: {
    exterior: num(r[35]),
    interior: num(r[36]),
    longitud: num(r[37]),
  },
}));

// Filtra entries totalmente vacías
const items_ok = items.filter((it) => it.np1 || it.np2);

const ts = `// AUTO-GENERADO desde MEDIDAS2.xlsx por scripts/_generate-medidas-modelo.mjs
// NO EDITAR A MANO. Regenerar con: node scripts/_generate-medidas-modelo.mjs

export interface MedidaModeloCilindro {
  diamInterior: number | null;
  diamSalida: number | null;
  diamExterior: number | null;
  longBrunido: number | null;
  longTotal: number | null;
  diamOjo: number | null;
  diamIntCojinete: number | null;
  anchoOjo: number | null;
}

export interface MedidaModeloVastago {
  diamVastago: number | null;
  longCromo: number | null;
  longTotal: number | null;
  diamEspiga: number | null;
  longEspiga: number | null;
  diamExtOjo: number | null;
  diamIntOjo: number | null;
  anchoOjo: number | null;
  diamIntCojinete: number | null;
}

export interface MedidaModeloCuerpoIntermedio {
  longCromo: number | null;
  longBrunido: number | null;
  diamIntC1: number | null;
  diamIntC2: number | null;
  diamExtC1: number | null;
  diamExtC2: number | null;
}

export interface MedidaModeloTapa {
  exterior: number | null;
  interior: number | null;
  sellado: number | null;
  longTotal: number | null;
}

export interface MedidaModeloPiston {
  exterior: number | null;
  interior: number | null;
  longitud: number | null;
}

export interface MedidaModelo {
  np1: string | null;
  np2: string | null;
  sistema: string;
  descripcion: string | null;
  marca: string | null;
  modelo: string | null;
  cilindro: MedidaModeloCilindro;
  vastago: MedidaModeloVastago;
  cuerpoIntermedio: MedidaModeloCuerpoIntermedio;
  tapa: MedidaModeloTapa;
  piston: MedidaModeloPiston;
}

export const MEDIDAS_MODELO: MedidaModelo[] = ${JSON.stringify(items_ok, null, 2)};
`;

writeFileSync(path.join(process.cwd(), OUT), ts);
console.log(`✓ Generado ${OUT} con ${items_ok.length} cilindros modelo`);
