// Construcción del workbook para las exportaciones a Excel.
//
// Separado de ExportarExcelButton para que sea función pura testeable (sin
// antd/React) y para centralizar el tipado de celdas:
//   - `Date`   → celda de tipo fecha real (t:"d") con formato dd/mm/yyyy.
//   - `number` → celda numérica (t:"n"), con formato opcional por columna.
//   - resto    → texto, igual que siempre.
//
// Antes TODO salía como texto (las fechas ya venían formateadas "DD/MM/YY" y
// los Decimal de Prisma llegan como string por JSON), así que en Excel no se
// podía ordenar por fecha ni sumar montos sin convertir a mano.

import type { WorkBook } from "xlsx";

/** Valor exportable de una celda. */
export type ValorCelda = string | number | boolean | Date | null | undefined;

/** Formato de fecha por default (celda date-only). */
export const FORMATO_FECHA = "dd/mm/yyyy";

/**
 * Construye el workbook con celdas tipadas.
 *
 * @param rows      filas ya extraídas: array de objetos label → valor.
 * @param sheetName nombre de la hoja.
 * @param formatos  formato numérico Excel (`z`) por label de columna, opcional.
 *                  Ej: { "Monto Cotización": "#,##0.00", "Fecha Creación": "dd/mm/yyyy hh:mm" }.
 *                  Para celdas Date sin formato explícito se usa FORMATO_FECHA.
 */
export async function construirLibroExcel(
  rows: Record<string, ValorCelda>[],
  sheetName: string,
  formatos?: Record<string, string>,
): Promise<WorkBook> {
  const XLSX = await import("xlsx");
  // cellDates: los `Date` se escriben como celdas fecha (t:"d") en vez de
  // serial numbers sin formato.
  const ws = XLSX.utils.json_to_sheet(rows, { cellDates: true });

  // Aplicar formatos: recorremos el rango real de la hoja. La fila 0 es el
  // header; el label de cada columna sale de esa fila para mapear `formatos`.
  const ref = ws["!ref"];
  if (ref) {
    const range = XLSX.utils.decode_range(ref);
    for (let c = range.s.c; c <= range.e.c; c++) {
      const headerCell = ws[XLSX.utils.encode_cell({ r: range.s.r, c })];
      const label = headerCell?.v != null ? String(headerCell.v) : "";
      const zCol = formatos?.[label];
      for (let r = range.s.r + 1; r <= range.e.r; r++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (!cell) continue;
        if (cell.t === "d") cell.z = zCol ?? FORMATO_FECHA;
        else if (cell.t === "n" && zCol) cell.z = zCol;
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return wb;
}
