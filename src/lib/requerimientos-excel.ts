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

/** Descarga el formato vacío (con ejemplos e instrucciones). */
export async function descargarFormatoRequerimiento(unidades: UnidadRef[]): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const ejemplos = [
    ["MAC", "(código del catálogo)", "", "", 2, "", "", "", "", "Si es MAC, la descripción, marca, U.M. y precio salen del catálogo"],
    ["CAD", "", "Manguera hidráulica 1/2\" x 2 m", "PARKER", 4, "UNIDAD", 35.5, "USD", "", ""],
    ["SER", "", "SVC Cromado de vástago", "", 1, "SERVICIO", 1200, "SOL", "", "Servicio externo"],
  ];
  const ws = XLSX.utils.aoa_to_sheet([COLUMNAS.map((c) => c.label), ...ejemplos]);
  ws["!cols"] = [8, 20, 40, 14, 10, 12, 12, 9, 22, 40].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws, "Requerimiento");
  const instr = XLSX.utils.aoa_to_sheet([
    ["Cómo llenar el formato"],
    [""],
    ["• Una fila por item. Borrá las 3 filas de ejemplo antes de cargar."],
    ["• Tipo: MAC (material del catálogo), CAD (material libre) o SER (servicio). Vacío = MAC si hay código, si no CAD."],
    ["• MAC: el Código material debe existir en el catálogo. Descripción, marca, U.M. y precio se completan solos."],
    ["• CAD / SER: Descripción, Cantidad y Precio ref. son obligatorios."],
    ["• Si falta algo o un valor no coincide, la fila se carga igual y lo completás en el formulario antes de guardar."],
    ["• U.M.: usar un código de la hoja \"Unidades\" (si no coincide, queda UNIDAD)."],
    ["• Marca: opcional; código o nombre de un fabricante del catálogo (si no coincide, queda vacía)."],
    ["• Moneda: USD o SOL (vacío = USD)."],
    ["• F. requerida: opcional, formato dd/mm/aaaa."],
    [`• Máximo ${MAX_ITEMS_REQ} items por requerimiento.`],
    ["• Al cargar, los items quedan en el borrador para revisarlos; recién se crean al Guardar."],
  ]);
  instr["!cols"] = [{ wch: 110 }];
  XLSX.utils.book_append_sheet(wb, instr, "Instrucciones");
  const um = XLSX.utils.aoa_to_sheet([["Código", "Nombre"], ...unidades.map((u) => [u.codigo, u.nombre])]);
  um["!cols"] = [{ wch: 16 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, um, "Unidades");
  XLSX.writeFile(wb, "Formato-requerimiento.xlsx");
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
