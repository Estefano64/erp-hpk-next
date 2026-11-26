// Formato Excel para cargar items de un requerimiento en bloque (detalle de OT
// externa e interna, formulario "Nuevo Requerimiento"). El Excel NO se guarda
// directo: llena las filas del borrador y el usuario revisa y guarda con el
// botón de siempre (mismas validaciones que la carga manual).

import dayjs from "dayjs";

export interface MaterialRef {
  codigo: string;
  descripcion: string;
  fabricante_codigo?: string | null;
  unidad_medida_codigo?: string | null;
  precio?: number | string | null;
  moneda_codigo?: string | null;
}
export interface UnidadRef { codigo: string; nombre: string; abreviatura?: string }
export interface FabricanteRef { codigo: string; nombre: string }

export interface FilaImportada {
  fila: number; // fila del Excel (1 = encabezado)
  tipo_codigo: "MAC" | "CAD" | "SER";
  material_codigo?: string;
  descripcion: string;
  cantidad: number;
  unidad_medida?: string;
  fabricante_codigo?: string;
  precio_unitario?: number;
  moneda?: "USD" | "SOL";
  fecha_requerida?: dayjs.Dayjs | null;
  observaciones?: string;
  // Lo que falta completar en el formulario (la fila se carga igual; Guardar
  // no deja crear el borrador hasta completarlo).
  pendientes: string[];
  // Valores que no coincidieron con una opción y se ajustaron.
  avisos: string[];
}

// Columnas del formato. `alias`: otros nombres de encabezado aceptados.
const COLUMNAS = [
  { key: "tipo", label: "Tipo", alias: ["tipo material"] },
  { key: "codigo", label: "Código material", alias: ["codigo", "código", "cod material", "material"] },
  { key: "descripcion", label: "Descripción", alias: ["descripcion", "detalle", "item"] },
  { key: "marca", label: "Marca", alias: ["fabricante", "marca / fabricante"] },
  { key: "cantidad", label: "Cantidad", alias: ["cant", "cant."] },
  { key: "um", label: "U.M.", alias: ["um", "unidad", "unidad de medida", "u.m"] },
  { key: "precio", label: "Precio ref.", alias: ["precio", "precio unitario", "p. unit", "precio referencial"] },
  { key: "moneda", label: "Moneda", alias: [] },
  { key: "fecha", label: "F. requerida (dd/mm/aaaa)", alias: ["f. requerida", "fecha requerida", "fecha"] },
  { key: "obs", label: "Observaciones", alias: ["observacion", "comentario", "comentarios"] },
] as const;
type ColKey = (typeof COLUMNAS)[number]["key"];

const norm = (s: unknown) => String(s ?? "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/\s+/g, " ").trim();

export const MAX_ITEMS_REQ = 100;

/**
 * Descarga el formato vacío con listas desplegables (Tipo, Moneda, U.M., Marca),
 * ejemplos e instrucciones. Usa exceljs (la versión libre de `xlsx` no escribe
 * validaciones de datos); se carga solo al pulsar el botón.
 */
export async function descargarFormatoRequerimiento(unidades: UnidadRef[], fabricantes: FabricanteRef[] = []): Promise<void> {
  // Build de navegador (el entry por defecto de exceljs usa fs/stream de Node).
  const mod = await import("exceljs/dist/exceljs.min.js");
  const ExcelJS = ((mod as { default?: unknown }).default ?? mod) as typeof import("exceljs");
  const wb = new ExcelJS.Workbook();

  const ws = wb.addWorksheet("Requerimiento", { views: [{ state: "frozen", ySplit: 1 }] });
  const anchos = [8, 20, 40, 18, 10, 14, 12, 9, 22, 40];
  ws.columns = COLUMNAS.map((c, i) => ({ header: c.label, width: anchos[i] }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
  head.alignment = { vertical: "middle" };
  ws.addRows([
    ["MAC", "(código del catálogo)", "", "", 2, "", null, "", null, "Fila de ejemplo: borrala. Si es MAC, descripción, marca, U.M. y precio salen del catálogo"],
    ["CAD", "", "Manguera hidráulica 1/2\" x 2 m", "", 4, "UNIDAD", 35.5, "USD", null, "Fila de ejemplo: borrala"],
    ["SER", "", "SVC Cromado de vástago", "", 1, "", 1200, "SOL", null, "Fila de ejemplo: borrala"],
  ]);
  for (let r = 2; r <= 4; r++) ws.getRow(r).font = { italic: true, color: { argb: "FF808080" } };

  // Hojas de listas (fuente de los desplegables de U.M. y Marca).
  const wsUm = wb.addWorksheet("Unidades");
  wsUm.columns = [{ header: "Código", width: 16 }, { header: "Nombre", width: 30 }];
  wsUm.getRow(1).font = { bold: true };
  unidades.forEach((u) => wsUm.addRow([u.codigo, u.nombre]));
  const wsFab = wb.addWorksheet("Marcas");
  wsFab.columns = [{ header: "Nombre", width: 30 }, { header: "Código", width: 16 }];
  wsFab.getRow(1).font = { bold: true };
  fabricantes.forEach((f) => wsFab.addRow([f.nombre, f.codigo]));

  // Validaciones en las filas de items (2..MAX+1).
  const lista = (formula: string, titulo: string, msg: string, estricta = true) => ({
    type: "list" as const, allowBlank: true, formulae: [formula],
    showErrorMessage: true, errorStyle: estricta ? "stop" as const : "warning" as const,
    errorTitle: titulo, error: msg,
  });
  const colDe = (k: ColKey) => COLUMNAS.findIndex((c) => c.key === k) + 1;
  for (let r = 2; r <= MAX_ITEMS_REQ + 1; r++) {
    const row = ws.getRow(r);
    row.getCell(colDe("tipo")).dataValidation = lista('"MAC,CAD,SER"', "Tipo", "Elegí MAC, CAD o SER.");
    row.getCell(colDe("moneda")).dataValidation = lista('"USD,SOL"', "Moneda", "Elegí USD o SOL.");
    if (unidades.length > 0) {
      row.getCell(colDe("um")).dataValidation = lista(`Unidades!$A$2:$A$${unidades.length + 1}`, "U.M.", "Elegí una unidad de la lista (hoja Unidades).");
    }
    if (fabricantes.length > 0) {
      // Advertencia (no bloquea): la marca es opcional y puede crearse luego.
      row.getCell(colDe("marca")).dataValidation = lista(`Marcas!$A$2:$A$${fabricantes.length + 1}`, "Marca", "Esa marca no está en el catálogo (hoja Marcas). Se puede dejar vacía.", false);
    }
    row.getCell(colDe("cantidad")).dataValidation = { type: "decimal", operator: "greaterThan", formulae: [0], allowBlank: true, showErrorMessage: true, errorTitle: "Cantidad", error: "La cantidad debe ser mayor a 0." };
    row.getCell(colDe("fecha")).numFmt = "dd/mm/yyyy";
  }

  const wsInstr = wb.addWorksheet("Instrucciones");
  wsInstr.getColumn(1).width = 110;
  [
    "Cómo llenar el formato",
    "",
    "• Una fila por item. Borrá las 3 filas de ejemplo antes de cargar.",
    "• Tipo, Moneda, U.M. y Marca tienen lista desplegable (flecha al seleccionar la celda).",
    "• Tipo: MAC (material del catálogo), CAD (material libre) o SER (servicio). Vacío = MAC si hay código, si no CAD.",
    "• MAC: el Código material debe existir en el catálogo. Descripción, marca, U.M. y precio se completan solos.",
    "• CAD / SER: Descripción, Cantidad y Precio ref. son obligatorios.",
    "• Si falta algo o un valor no coincide, la fila se carga igual y lo completás en el formulario antes de guardar.",
    "• Marca: opcional; elegila de la lista (hoja Marcas).",
    "• Moneda: USD o SOL (vacío = USD).",
    "• F. requerida: opcional, formato dd/mm/aaaa.",
    `• Máximo ${MAX_ITEMS_REQ} items por requerimiento.`,
    "• Al cargar, los items quedan en el borrador para revisarlos; recién se crean al Guardar.",
  ].forEach((t, i) => { const c = wsInstr.getCell(i + 1, 1); c.value = t; if (i === 0) c.font = { bold: true, size: 13 }; });

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "Formato-requerimiento.xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function aFecha(v: unknown): dayjs.Dayjs | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return dayjs(v);
  if (typeof v === "number") {
    // Serial de Excel (días desde 1899-12-30).
    const d = dayjs("1899-12-30").add(Math.round(v), "day");
    return d.isValid() ? d : null;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const anio = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = dayjs(new Date(anio, Number(m[2]) - 1, Number(m[1])));
    return d.isValid() ? d : null;
  }
  const d = dayjs(s);
  return d.isValid() ? d : null;
}

function aNumero(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Lee el Excel y devuelve las filas válidas + errores por fila. No toca nada:
 * el caller decide qué hacer (cargar en el borrador).
 */
export async function leerExcelRequerimiento(
  file: File,
  ctx: { materiales: MaterialRef[]; unidades: UnidadRef[]; fabricantes?: FabricanteRef[] },
): Promise<{ filas: FilaImportada[]; errores: string[]; avisos: string[] }> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const hoja = wb.Sheets["Requerimiento"] ?? wb.Sheets[wb.SheetNames[0]];
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, defval: null, raw: true });
  if (matriz.length < 2) return { filas: [], errores: ["El archivo no tiene filas debajo del encabezado."], avisos: [] };

  // Mapear encabezados → columnas del formato.
  const idx = new Map<ColKey, number>();
  (matriz[0] ?? []).forEach((h, i) => {
    const n = norm(h);
    const col = COLUMNAS.find((c) => norm(c.label) === n || c.alias.some((a) => norm(a) === n));
    if (col && !idx.has(col.key)) idx.set(col.key, i);
  });
  if (!idx.has("descripcion") && !idx.has("codigo")) {
    return { filas: [], errores: ["No se encontraron las columnas del formato. Descargá el formato y usalo como base."], avisos: [] };
  }

  const matPorCodigo = new Map(ctx.materiales.map((m) => [norm(m.codigo), m]));
  const umPor = new Map<string, string>();
  for (const u of ctx.unidades) {
    umPor.set(norm(u.codigo), u.codigo);
    umPor.set(norm(u.nombre), u.codigo);
    if (u.abreviatura) umPor.set(norm(u.abreviatura), u.codigo);
  }

  // Marca: el formulario la elige de la lista de fabricantes (valor = código).
  const fabPor = new Map<string, string>();
  for (const f of ctx.fabricantes ?? []) {
    fabPor.set(norm(f.codigo), f.codigo);
    fabPor.set(norm(f.nombre), f.codigo);
  }
  // Toda fila con datos se carga: lo que falte o no coincida queda vacío en el
  // formulario para completarlo ahí (pedido 2026-11-26: no obligar a corregir
  // el Excel y volver a subirlo).
  const filas: FilaImportada[] = [];
  for (let r = 1; r < matriz.length; r++) {
    const row = matriz[r] ?? [];
    const get = (k: ColKey) => { const i = idx.get(k); return i == null ? null : row[i]; };
    const vacia = COLUMNAS.every((c) => { const v = get(c.key); return v == null || String(v).trim() === ""; });
    if (vacia) continue;
    const nFila = r + 1;
    const codigoTxt = String(get("codigo") ?? "").trim();
    // Filas de ejemplo del formato: se ignoran.
    if (codigoTxt.startsWith("(")) continue;
    const pendientes: string[] = [];
    const avisosFila: string[] = [];

    const tipoTxt = norm(get("tipo")).toUpperCase();
    let tipo: FilaImportada["tipo_codigo"] = codigoTxt ? "MAC" : "CAD";
    if (tipoTxt === "MAC" || tipoTxt === "CAD" || tipoTxt === "SER") tipo = tipoTxt;
    else if (tipoTxt !== "") avisosFila.push(`Tipo "${get("tipo")}" no válido; quedó ${tipo}.`);

    const cantidadNum = aNumero(get("cantidad"));
    const cantidad = cantidadNum != null && cantidadNum > 0 ? cantidadNum : 0;
    if (cantidad <= 0) pendientes.push("Cantidad");

    const umTxt = String(get("um") ?? "").trim();
    let unidad = umTxt ? umPor.get(norm(umTxt)) : undefined;
    if (umTxt && !unidad) { avisosFila.push(`U.M. "${umTxt}" no está en el catálogo; quedó UNIDAD.`); unidad = "UNIDAD"; }

    const monedaTxt = norm(get("moneda")).toUpperCase();
    const moneda: "USD" | "SOL" | undefined = monedaTxt === "" ? undefined
      : monedaTxt === "SOL" || monedaTxt === "PEN" || monedaTxt === "S/" || monedaTxt === "SOLES" ? "SOL" : "USD";
    const precioNum = aNumero(get("precio"));
    const precio = precioNum != null && precioNum > 0 ? precioNum : undefined;
    const fechaRaw = get("fecha");
    const fecha = aFecha(fechaRaw);
    if (fechaRaw != null && String(fechaRaw).trim() !== "" && !fecha) avisosFila.push(`F. requerida "${fechaRaw}" no se entendió; quedó vacía.`);
    const descTxt = String(get("descripcion") ?? "").trim();
    const marcaTxt = String(get("marca") ?? "").trim();
    let marca: string | undefined;
    if (marcaTxt) {
      marca = fabPor.get(norm(marcaTxt));
      if (!marca && fabPor.size > 0) avisosFila.push(`Marca "${marcaTxt}" no está en el catálogo de fabricantes; quedó vacía.`);
      if (!marca && fabPor.size === 0) marca = marcaTxt;
    }
    const obs = String(get("obs") ?? "").trim() || undefined;

    if (tipo === "MAC") {
      const m = codigoTxt ? matPorCodigo.get(norm(codigoTxt)) : undefined;
      if (!m) {
        // Sin material válido: se carga igual para elegirlo en la fila.
        pendientes.push(codigoTxt ? `Material (el código "${codigoTxt}" no existe en el catálogo)` : "Material");
        filas.push({
          fila: nFila, tipo_codigo: "MAC", descripcion: descTxt, cantidad,
          unidad_medida: unidad ?? "UNIDAD", fabricante_codigo: marca,
          precio_unitario: precio, moneda: moneda ?? "USD",
          fecha_requerida: fecha, observaciones: obs, pendientes, avisos: avisosFila,
        });
        continue;
      }
      const precioCat = m.precio != null ? Number(m.precio) : null;
      const conPrecioCat = precioCat != null && precioCat > 0;
      if (!conPrecioCat && precio == null) pendientes.push("Precio ref.");
      filas.push({
        fila: nFila, tipo_codigo: "MAC", material_codigo: m.codigo,
        descripcion: descTxt || m.descripcion,
        cantidad,
        unidad_medida: unidad ?? m.unidad_medida_codigo ?? "UNIDAD",
        fabricante_codigo: marca ?? m.fabricante_codigo ?? undefined,
        // Igual que al elegirlo a mano: precio y moneda del catálogo si tiene.
        precio_unitario: conPrecioCat ? precioCat : precio,
        moneda: conPrecioCat ? (m.moneda_codigo === "SOL" ? "SOL" : "USD") : (moneda ?? "USD"),
        fecha_requerida: fecha, observaciones: obs, pendientes, avisos: avisosFila,
      });
      continue;
    }
    if (!descTxt) pendientes.push("Descripción");
    if (precio == null) pendientes.push("Precio ref.");
    filas.push({
      fila: nFila, tipo_codigo: tipo, descripcion: descTxt, cantidad,
      unidad_medida: unidad ?? "UNIDAD", fabricante_codigo: marca,
      precio_unitario: precio, moneda: moneda ?? "USD",
      fecha_requerida: fecha, observaciones: obs, pendientes, avisos: avisosFila,
    });
  }
  const errores: string[] = [];
  const avisos: string[] = [];
  return { filas, errores, avisos };
}
