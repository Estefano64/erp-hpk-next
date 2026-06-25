"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useSession } from "next-auth/react";
import { Button, Checkbox, DatePicker, Divider, Input, Popover, Space, Typography } from "antd";
import { CalendarOutlined, SettingOutlined, PushpinOutlined, PushpinFilled, SearchOutlined } from "@ant-design/icons";
import { brand } from "@/lib/theme";
import type { ColumnsType, ColumnType, TablePaginationConfig } from "antd/es/table/interface";
import dayjs, { Dayjs } from "dayjs";
import { Resizable, type ResizeCallbackData } from "react-resizable";
import "react-resizable/css/styles.css";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface NumeracionOpts {
  current?: number;
  pageSize?: number;
  width?: number;
  fixed?: boolean;
}

// Columna "NRO" estandarizada para todas las tablas listables.
// Mantiene la numeración correcta cuando la página o el tamaño cambian.
// Por defecto NO es fixed-left: solo las columnas de Acciones son fijas.
// Si por algún motivo se quiere fixearla, pasar `fixed: true` explícitamente.
export function numeracionColumn<T>(opts: NumeracionOpts = {}): ColumnType<T> {
  const { current = 1, pageSize = 20, width = 60, fixed = false } = opts;
  return {
    title: "NRO",
    key: "__num",
    width,
    align: "center",
    fixed: fixed ? "left" : undefined,
    render: (_v: unknown, _r: T, index: number) => (current - 1) * pageSize + index + 1,
  };
}

export const PAGINATION_PAGE_SIZE = 20;

// Configuración estándar para sticky de tablas (header + scrollbar horizontal).
export const STICKY_HEADER = { offsetHeader: 56, offsetScroll: 0 } as const;
const PAGINATION_BASE_OPTIONS = [10, 20, 50, 100, 500, 1000];
export const PAGINATION_PAGE_SIZE_OPTIONS = PAGINATION_BASE_OPTIONS.map(String);

// Devuelve solo las opciones que tienen sentido dado el total (las que son <= total),
// más una opción "Todos" si el total supera la opción más grande mostrada.
function dynamicPageSizeOptions(total: number): string[] {
  if (total <= 0) return ["10"];
  const visible = PAGINATION_BASE_OPTIONS.filter((opt, i) => {
    // Mantener siempre la primera (10) para flexibilidad; agregar el resto si total la rebasa.
    if (i === 0) return true;
    return total > PAGINATION_BASE_OPTIONS[i - 1];
  });
  const max = visible[visible.length - 1];
  if (total > max) visible.push(total);
  return visible.map(String);
}

// Configuración de paginación común. `current`, `pageSize`, `total` y `onChange` se
// pasan desde la página; el resto sale de aquí.
// Default antd v6: paginación arriba y abajo (alineada al final, RTL-friendly).
// Cualquier callsite puede sobreescribirlo pasando `placement`.
const DEFAULT_PAGINATION_PLACEMENT: NonNullable<TablePaginationConfig["placement"]> = ["topEnd", "bottomEnd"];

export function paginacionEstandar(
  args: {
    current: number;
    pageSize: number;
    total: number;
    onChange: (page: number, size: number) => void;
    label?: string; // ej: "registros", "órdenes de compra", "evaluaciones"
    // antd v6: ej. ["topEnd", "bottomEnd"]. Default: arriba+abajo.
    placement?: NonNullable<TablePaginationConfig["placement"]>;
  },
): TablePaginationConfig {
  const { current, pageSize, total, onChange, label = "registros", placement = DEFAULT_PAGINATION_PLACEMENT } = args;
  return {
    current,
    pageSize,
    total,
    pageSizeOptions: dynamicPageSizeOptions(total),
    showSizeChanger: true,
    showTotal: (t) => `${t.toLocaleString("es-PE")} ${label}`,
    onChange,
    onShowSizeChange: onChange,
    placement,
  };
}

export type EstadoVista<T extends string> = { value: T | "__all"; label: string; color?: string };

// Helper para extraer la opción "Todos" + las opciones individuales para Segmented.
export function vistasEstado<T extends string>(
  estados: { value: T; label: string; color?: string }[],
): EstadoVista<T>[] {
  return [{ value: "__all", label: "Todos" }, ...estados];
}

// ───────────────────────────────────────────────────────────────────────────
// Selector de columnas + filtros por columna (reutilizable)
// ───────────────────────────────────────────────────────────────────────────

// Hook: gestiona qué columnas están ocultas y persiste la preferencia en
// localStorage usando una key única por tabla. Devuelve helpers para filtrar
// las `columns` y para componer el botón Popover de selección.
export function useColumnasOcultas(storageKey: string, defaultOcultas: string[] = []) {
  const [ocultas, setOcultas] = useState<string[]>(defaultOcultas);
  const [hidratado, setHidratado] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        setOcultas(JSON.parse(stored));
      } else {
        // Primera visita del usuario: aplica defaults y persiste.
        setOcultas(defaultOcultas);
      }
    } catch { /* ignore */ }
    setHidratado(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!hidratado) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(ocultas));
    } catch { /* ignore */ }
  }, [ocultas, hidratado, storageKey]);

  return { ocultas, setOcultas, hidratado };
}

// Filtra las columnas según las claves ocultas. Las columnas sin `key` siempre se conservan.
export function visibleColumns<T>(columns: ColumnsType<T>, ocultas: string[], obligatorias: string[] = []): ColumnsType<T> {
  const ob = new Set(obligatorias);
  return columns.filter((c) => {
    const k = (c as { key?: React.Key }).key;
    if (k === undefined) return true;
    if (ob.has(String(k))) return true; // siempre visible
    return !ocultas.includes(String(k));
  });
}

// Botón "Columnas" con Popover que muestra una lista de checkboxes para
// elegir qué columnas se ven. Las columnas listadas en `obligatorias` quedan
// fijas (no se pueden ocultar).
export interface ColumnasToggleButtonProps<T> {
  columns: ColumnsType<T>;
  ocultas: string[];
  setOcultas: (next: string[]) => void;
  obligatorias?: string[];
  buttonText?: string;
}

export function ColumnasToggleButton<T>({
  columns,
  ocultas,
  setOcultas,
  obligatorias = [],
  buttonText = "Columnas",
}: ColumnasToggleButtonProps<T>) {
  // Buscador del popover: con 50+ columnas encontrar una a ojo era lento.
  const [busqueda, setBusqueda] = useState("");
  const claves = columns
    .map((c) => (c as { key?: React.Key }).key)
    .filter((k): k is string | number => k !== undefined)
    .map(String);
  const visibles = claves.filter((k) => !ocultas.includes(k));
  const termino = busqueda.trim().toLowerCase();

  const contenido = (
    <div style={{ minWidth: 220, maxHeight: 380, overflowY: "auto" }}>
      <Input
        size="small"
        allowClear
        placeholder="Buscar columna…"
        prefix={<SearchOutlined style={{ color: "#999" }} />}
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <Button
          size="small"
          type="link"
          onClick={() => setOcultas([])}
          disabled={ocultas.length === 0}
        >
          Mostrar todas
        </Button>
        <Button
          size="small"
          type="link"
          danger
          onClick={() => setOcultas(claves.filter((k) => !obligatorias.includes(k)))}
        >
          Ocultar todas
        </Button>
      </div>
      <Divider style={{ margin: "4px 0 8px" }} />
      <Checkbox.Group
        value={visibles}
        onChange={(checked) => {
          const next = claves.filter(
            (k) => !(checked as string[]).includes(k) && !obligatorias.includes(k),
          );
          setOcultas(next);
        }}
        style={{ width: "100%" }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {columns.map((c) => {
            const k = String((c as { key?: React.Key }).key ?? "");
            if (!k) return null;
            const fija = obligatorias.includes(k);
            const titulo = (c as { title?: unknown }).title;
            // Filtro del buscador: matchea por título visible o por key.
            const texto = typeof titulo === "string" ? titulo : k;
            if (termino && !texto.toLowerCase().includes(termino) && !k.toLowerCase().includes(termino)) return null;
            return (
              <Checkbox key={k} value={k} disabled={fija}>
                <span style={{ fontSize: 13 }}>
                  {typeof titulo === "string" ? titulo : k}
                  {fija && <span style={{ color: "#999", fontSize: 11, marginLeft: 6 }}>(fija)</span>}
                </span>
              </Checkbox>
            );
          })}
        </div>
      </Checkbox.Group>
    </div>
  );

  return (
    <Popover
      content={contenido}
      title={
        <Space>
          <SettingOutlined />
          <span>Columnas visibles ({visibles.length}/{claves.length})</span>
        </Space>
      }
      trigger="click"
      placement="bottomRight"
    >
      <Button icon={<SettingOutlined />}>{buttonText}</Button>
    </Popover>
  );
}

// Genera el array de filtros únicos para una columna a partir del dataSource.
// Usar como: `filters: valoresUnicos(data, "campo"), filterSearch: true,
//           onFilter: (v, r) => String(r.campo ?? "") === v`
// Sentinel value para representar "celda vacía" en el filtro.
// Las columnas que tengan algún valor null/undefined/"" en el dataSource
// reciben automáticamente una opción "(vacío)" con este value, y `onFilter`
// la reconoce. Si no hay celdas vacías, no se agrega esta opción.
export const FILTRO_VACIO_VALUE = "__vacio__";
export const FILTRO_VACIO_LABEL = "(vacío)";

function esVacio(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

export function valoresUnicos<T>(
  data: T[],
  campo: keyof T,
): { text: string; value: string }[] {
  const set = new Set<string>();
  let hayVacios = false;
  for (const r of data) {
    const v = (r as Record<string, unknown>)[campo as string];
    if (esVacio(v)) { hayVacios = true; continue; }
    set.add(String(v));
  }
  const opciones = [...set]
    .sort((a, b) => a.localeCompare(b, "es", { numeric: true, sensitivity: "base" }))
    .map((v) => ({ text: v, value: v }));
  // Si hay celdas vacías en el dataSource, agregar la opción "(vacío)" al final
  // para que el usuario pueda filtrar por filas sin dato (Excel-style).
  if (hayVacios) opciones.push({ text: FILTRO_VACIO_LABEL, value: FILTRO_VACIO_VALUE });
  return opciones;
}

// Devuelve un fragmento de columna con filtros únicos basados en los datos.
// Pegar con spread sobre la definición de la columna:
//   { title: "Nombre", dataIndex: "nombre", ...filtroPorColumna(data, "nombre") }
export function filtroPorColumna<T>(
  data: T[],
  campo: keyof T,
): {
  filters: { text: string; value: string }[];
  filterSearch: true;
  filterMultiple: true;
  onFilter: (value: boolean | React.Key, record: T) => boolean;
} {
  return {
    filters: valoresUnicos(data, campo),
    filterSearch: true,
    filterMultiple: true,
    onFilter: (value, record) => {
      const raw = (record as Record<string, unknown>)[campo as string];
      // Filtro especial "(vacío)" — matchea cuando la celda está vacía.
      if (value === FILTRO_VACIO_VALUE) return esVacio(raw);
      return String(raw ?? "") === value;
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Filtro por rango de fechas (desde / hasta)
// ───────────────────────────────────────────────────────────────────────────

export type RangoFechas = { desde: Dayjs | null; hasta: Dayjs | null };

const { Text } = Typography;

export interface RangoFechasFiltroProps {
  /** Etiqueta corta, ej: "Fecha de recepción". */
  label?: string;
  /** Estado controlado. */
  value: RangoFechas;
  onChange: (next: RangoFechas) => void;
}

// Componente reutilizable: dos DatePicker (Desde / Hasta) + botón limpiar.
// Ubicar en la barra superior de la tabla.
export function RangoFechasFiltro({
  label = "Rango de fechas",
  value,
  onChange,
}: RangoFechasFiltroProps) {
  return (
    <Space size={6} wrap>
      <CalendarOutlined style={{ color: "#888" }} />
      <Text type="secondary" style={{ fontSize: 12 }}>{label}:</Text>
      <DatePicker
        size="small"
        placeholder="Desde"
        format="DD/MM/YYYY"
        value={value.desde}
        onChange={(d) => onChange({ ...value, desde: d })}
        allowClear
      />
      <DatePicker
        size="small"
        placeholder="Hasta"
        format="DD/MM/YYYY"
        value={value.hasta}
        onChange={(d) => onChange({ ...value, hasta: d })}
        allowClear
      />
      {(value.desde || value.hasta) && (
        <Button size="small" type="link" onClick={() => onChange({ desde: null, hasta: null })}>
          Limpiar
        </Button>
      )}
    </Space>
  );
}

/**
 * Helper para filtrar un array según un rango de fechas en un campo.
 * Compara por día (inicio/fin del día), tolera valores nulos.
 */
export function dentroDeRango<T>(
  row: T,
  campo: keyof T,
  rango: RangoFechas,
): boolean {
  if (!rango.desde && !rango.hasta) return true;
  const raw = (row as Record<string, unknown>)[campo as string];
  if (!raw) return false;
  const d = dayjs(raw as string | Date);
  if (!d.isValid()) return false;
  if (rango.desde && d.isBefore(rango.desde.startOf("day"))) return false;
  if (rango.hasta && d.isAfter(rango.hasta.endOf("day"))) return false;
  return true;
}

/** Hook utilitario para manejar el estado de un rango de fechas. */
export function useRangoFechas(initial: RangoFechas = { desde: null, hasta: null }) {
  const [rango, setRango] = useState<RangoFechas>(initial);
  const limpiar = () => setRango({ desde: null, hasta: null });
  const hayFiltro = !!(rango.desde || rango.hasta);
  return { rango, setRango, limpiar, hayFiltro };
}

// ───────────────────────────────────────────────────────────────────────────
// Columnas redimensionables
// ───────────────────────────────────────────────────────────────────────────

// Componente custom para el <th> del header de la tabla AntD:
//  - Envuelve con Resizable (arrastrar borde derecho = cambiar ancho).
//  - Sortable via dnd-kit (arrastrar el header completo = reordenar columna).
// Mantenemos el handle de resize con stopPropagation para no chocar con el drag.
type SortableResizableTitleProps = React.HTMLAttributes<HTMLTableCellElement> & {
  width?: number;
  onResize?: (e: React.SyntheticEvent<Element>, data: ResizeCallbackData) => void;
  onResizeStop?: (e: React.SyntheticEvent<Element>, data: ResizeCallbackData) => void;
  columnKey?: string;
  sortable?: boolean;
  // Pin/unpin: solo se renderiza el ícono si `onTogglePin` está presente.
  // `isPinned` controla qué ícono mostrar (filled vs outlined).
  isPinned?: boolean;
  onTogglePin?: () => void;
};

function SortableResizableTitle(props: SortableResizableTitleProps) {
  const { onResize, onResizeStop, width, columnKey, sortable, isPinned, onTogglePin, style: styleProp, children, ...restProps } = props;
  // Ancho local durante drag para feedback visual sin re-render del Table.
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const effectiveWidth = liveWidth ?? width;

  const sort = useSortable({ id: columnKey ?? "__none__", disabled: !sortable || !columnKey });
  const isInteractive = sortable && columnKey;
  const dragStyle: React.CSSProperties = isInteractive
    ? {
        transform: CSS.Translate.toString(sort.transform),
        transition: sort.transition,
        opacity: sort.isDragging ? 0.4 : 1,
      }
    : {};

  // position:relative solo cuando hay resize (para el handle absolutely positioned).
  // Las columnas fixed conservan su position:sticky de antd intacto.
  const needsRelative = !!(width && onResize) || !!isInteractive;
  const cellStyle: React.CSSProperties = {
    ...styleProp,
    ...dragStyle,
    ...(needsRelative ? { position: "relative" } : {}),
  };

  // ref del nodo va sobre el <th> para que dnd-kit calcule posición.
  // Pero los listeners van SOLO en el drag handle, no en el <th> — así clicks en
  // sort/filter/checkboxes funcionan sin disparar drag.
  const thRefProps = isInteractive
    ? { ref: sort.setNodeRef as unknown as React.Ref<HTMLTableCellElement> }
    : {};

  // dnd-kit asigna `aria-describedby="DndDescribedBy-{N}"` con un counter
  // interno cuyo N puede diferir entre SSR y cliente (depende de cuántos
  // SortableContext se inicializaron en cada pasada). suppressHydrationWarning
  // silencia el warning de hydration para este atributo cosmético — el resto
  // del HTML se hidrata normal.
  const dragHandle = isInteractive ? (
    <span
      {...sort.attributes}
      {...sort.listeners}
      suppressHydrationWarning
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        width: 16,
        zIndex: 3,
        cursor: sort.isDragging ? "grabbing" : "grab",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "rgba(0,0,0,0.35)",
        fontSize: 11,
        // Opacidad baja idle (era 0 = invisible). 0.25 es suficiente para que
        // se vea el handle en columnas estrechas como fechas. Sube a 1 al hover
        // del header via CSS global.
        opacity: 0.25,
        transition: "opacity 0.15s",
      }}
      className="col-drag-handle"
      title="Arrastrar para reordenar columna"
      onClick={(e) => e.stopPropagation()}
    >
      ⋮⋮
    </span>
  ) : null;

  // Pin icon: filled cyan si está fijada, outline tenue si no. Click-toggle.
  // Solo se renderiza si onTogglePin está presente (las cols fixed-by-code no
  // lo reciben → no pueden ser desfijadas accidentalmente).
  const pinButton = onTogglePin ? (
    <span
      onClick={(e) => {
        e.stopPropagation();
        onTogglePin();
      }}
      className="col-pin-toggle"
      title={isPinned ? "Desfijar columna" : "Fijar columna a la izquierda"}
      style={{
        marginLeft: 4,
        cursor: "pointer",
        fontSize: 11,
        opacity: isPinned ? 1 : 0,
        transition: "opacity 0.15s",
        color: isPinned ? brand.cyan : "rgba(0,0,0,0.45)",
      }}
    >
      {isPinned ? <PushpinFilled /> : <PushpinOutlined />}
    </span>
  ) : null;

  const innerContent = (
    <>
      {dragHandle}
      {children}
      {pinButton}
    </>
  );

  if (!effectiveWidth || !onResizeStop) {
    return <th {...restProps} {...thRefProps} style={cellStyle}>{innerContent}</th>;
  }

  return (
    <Resizable
      width={effectiveWidth}
      height={0}
      handle={
        <span
          className="react-resizable-handle"
          style={{
            position: "absolute",
            right: -5,
            bottom: 0,
            top: 0,
            zIndex: 3,
            width: 10,
            cursor: "col-resize",
            userSelect: "none",
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          title="Arrastrar para cambiar ancho"
        />
      }
      onResize={(_e, data) => setLiveWidth(Math.max(40, Math.round(data.size.width)))}
      onResizeStop={(e, data) => {
        setLiveWidth(null);
        onResizeStop(e, data);
      }}
      draggableOpts={{ enableUserSelectHack: true }}
    >
      <th {...restProps} {...thRefProps} style={cellStyle}>{innerContent}</th>
    </Resizable>
  );
}

// Hook que convierte las columnas en redimensionables y devuelve también el
// `components` para pasar al <Table>. Persiste los anchos en localStorage si
// se le pasa un `storageKey`.
//
// Si se pasa `opts.data` (el mismo array que va al dataSource del Table), el
// hook auto-inyecta filtros tipo Excel en cada columna que tenga `dataIndex`
// y NO tenga `filters` / `filterDropdown` definidos. Los filtros incluyen
// "(vacío)" como opción cuando hay celdas nulas/vacías en esa columna.
//
// Uso:
//   const { columnas, components } = useColumnasRedimensionables(myColumns, "mi-tabla", { data: rows });
//   <Table columns={columnas} components={components} dataSource={rows} ... />
export function useColumnasRedimensionables<T>(
  columns: ColumnsType<T>,
  storageKey?: string,
  opts?: { data?: readonly T[] },
) {
  const dataParaFiltros = opts?.data;
  const claveColumna = useCallback(
    (c: ColumnType<T>, idx: number): string =>
      String((c as { key?: React.Key }).key ?? (c as { dataIndex?: React.Key }).dataIndex ?? `col-${idx}`),
    [],
  );

  // ── Anchos (resize) + Pin (fijar a la izquierda) + Orden ────────────
  //
  // BUG 2026-06: antes los 3 estados tenían efectos de lectura/escritura
  // SEPARADOS. El de `pinned` no chequeaba `hidratado` y arrancaba como
  // `new Set()` (no null como `orden`), así que en el primer mount el
  // efecto de escritura corría ANTES del de lectura y guardaba `[]`,
  // pisando las preferencias del usuario. Resultado: cada F5 borraba todas
  // las columnas pineadas.
  //
  // Solución: UN solo efecto de lectura atómico que hidrata los 3 estados,
  // y 3 efectos de escritura que TODOS chequean `hidratado` antes de tocar
  // localStorage.
  const pinnedKey = storageKey ? `${storageKey}-pinned` : undefined;
  const orderKey = storageKey ? `${storageKey}-order` : undefined;

  const [anchos, setAnchos] = useState<Record<string, number>>({});
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [orden, setOrden] = useState<string[] | null>(null);
  const [hidratado, setHidratado] = useState(false);

  // Lectura atómica de los 3 estados desde localStorage. Se ejecuta una vez
  // al montar (o cuando cambia el storageKey, ej. en /catalogos/[tabla]).
  useEffect(() => {
    if (!storageKey) { setHidratado(true); return; }
    try {
      const storedAnchos = localStorage.getItem(storageKey);
      if (storedAnchos) setAnchos(JSON.parse(storedAnchos));
      if (pinnedKey) {
        const storedPinned = localStorage.getItem(pinnedKey);
        if (storedPinned) setPinned(new Set(JSON.parse(storedPinned)));
      }
      if (orderKey) {
        const storedOrden = localStorage.getItem(orderKey);
        if (storedOrden) setOrden(JSON.parse(storedOrden));
      }
    } catch { /* ignore */ }
    setHidratado(true);
  }, [storageKey, pinnedKey, orderKey]);

  // 3 efectos de escritura. CADA UNO chequea `hidratado` para no pisar
  // localStorage con el valor inicial antes de haber leído.
  useEffect(() => {
    if (!storageKey || !hidratado) return;
    try { localStorage.setItem(storageKey, JSON.stringify(anchos)); } catch { /* ignore */ }
  }, [anchos, hidratado, storageKey]);

  useEffect(() => {
    if (!pinnedKey || !hidratado) return;
    try { localStorage.setItem(pinnedKey, JSON.stringify([...pinned])); } catch { /* ignore */ }
  }, [pinned, hidratado, pinnedKey]);

  const togglePin = useCallback((key: string) => {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Marca qué columnas estaban declaradas como fixed por código (immutables).
  const fixedPorCodigo = useMemo(() => {
    const set = new Set<string>();
    columns.forEach((c, idx) => {
      const col = c as ColumnType<T>;
      if (col.fixed) set.add(claveColumna(col, idx));
    });
    return set;
  }, [columns, claveColumna]);

  // Inyecta `fixed: "left"` a columnas que el user fijó.
  const columnsConPin = useMemo<ColumnsType<T>>(() => {
    if (pinned.size === 0) return columns;
    return columns.map((c, idx) => {
      const col = c as ColumnType<T>;
      const k = claveColumna(col, idx);
      if (pinned.has(k) && !col.fixed) {
        return { ...col, fixed: "left" as const };
      }
      return col;
    });
  }, [columns, pinned, claveColumna]);

  // ── Orden (drag-to-reorder) ─────────────────────────────────────────
  // El estado + key + lectura se manejan arriba (efecto atómico de hidratación);
  // acá solo queda el efecto de escritura, que también respeta `hidratado`.
  useEffect(() => {
    if (!orderKey || !hidratado || orden === null) return;
    try { localStorage.setItem(orderKey, JSON.stringify(orden)); } catch { /* ignore */ }
  }, [orden, hidratado, orderKey]);

  // Aplicar orden personalizado a las columnas. Las columnas fixed mantienen su posición original.
  // Se usa `columnsConPin` (que ya tiene `fixed:left` inyectado para las
  // columnas pinneadas por el user) en lugar del `columns` raw.
  const columnasOrdenadas = useMemo<ColumnsType<T>>(() => {
    if (!orden || orden.length === 0) return columnsConPin;
    // Separar fixed (no reordenables) de las normales
    const fixedCols = columnsConPin.filter((c) => (c as ColumnType<T>).fixed);
    const movableCols = columnsConPin.filter((c) => !(c as ColumnType<T>).fixed);
    // Calcular claves estables UNA vez, manteniendo el índice original. Es
    // importante usar el índice de la columna en `movableCols` para que el
    // fallback `col-N` matchee tanto en `byKey` como en `originalIndex`.
    const movableKeys = movableCols.map((c, i) => claveColumna(c as ColumnType<T>, i));
    const byKey = new Map(movableCols.map((c, i) => [movableKeys[i], c] as const));
    const originalIndex = new Map(movableKeys.map((k, i) => [k, i] as const));

    // Aplicar orden persistido respetando solo las keys que existen.
    const orderedKeys: string[] = [];
    const seen = new Set<string>();
    for (const k of orden) {
      if (byKey.has(k) && !seen.has(k)) { orderedKeys.push(k); seen.add(k); }
    }
    // Las columnas que no están en `orden` son columnas nuevas o columnas que
    // antes eran fixed y ahora son movables (ej: NRO/OT cuando se quitó el
    // fixed-left). Las insertamos en su posición ORIGINAL para no romper la
    // disposición esperada (antes se agregaban al final, lo que tiraba esas
    // columnas off-screen para usuarios con orden previo guardado).
    const restantes = movableKeys
      .filter((k) => !seen.has(k))
      .map((k) => ({ k, idx: originalIndex.get(k) ?? Number.MAX_SAFE_INTEGER }));
    for (const { k, idx } of restantes) {
      // Buscamos la posición correcta en orderedKeys: la primera key cuyo
      // índice ORIGINAL sea mayor que el de `k`. Si no hay, va al final.
      let insertAt = orderedKeys.length;
      for (let j = 0; j < orderedKeys.length; j++) {
        const jIdx = originalIndex.get(orderedKeys[j]) ?? Number.MAX_SAFE_INTEGER;
        if (jIdx > idx) { insertAt = j; break; }
      }
      orderedKeys.splice(insertAt, 0, k);
      seen.add(k);
    }
    const orderedMovable: ColumnsType<T> = orderedKeys.map((k) => byKey.get(k)!).filter(Boolean);

    // Reinsertar fixed manteniendo su side
    const left = fixedCols.filter((c) => (c as ColumnType<T>).fixed === "left");
    const right = fixedCols.filter((c) => (c as ColumnType<T>).fixed === "right");
    return [...left, ...orderedMovable, ...right];
  }, [columnsConPin, orden, claveColumna]);

  // Default cuando una columna no declara su `width`. Antes esas columnas
  // quedaban no-redimensionables porque SortableResizableTitle requiere width
  // numérico para activar Resizable. Con este fallback, TODAS las columnas
  // no-fixed pueden ajustarse.
  const DEFAULT_COL_WIDTH = 150;

  // Sorter automático para columnas sin sorter explícito. Lee el valor del
  // registro siguiendo `dataIndex` (string o array) y compara numéricamente
  // si ambos lados son números, sino con localeCompare para strings.
  function autoSorter(dataIndex: React.Key | React.Key[] | undefined): ((a: T, b: T) => number) | undefined {
    if (dataIndex === undefined) return undefined;
    const path = Array.isArray(dataIndex) ? dataIndex : [dataIndex];
    const read = (row: T): unknown => {
      let v: unknown = row;
      for (const seg of path) {
        if (v == null || typeof v !== "object") return undefined;
        v = (v as Record<string, unknown>)[String(seg)];
      }
      return v;
    };
    return (a: T, b: T) => {
      const va = read(a);
      const vb = read(b);
      if (va == null && vb == null) return 0;
      if (va == null) return -1;
      if (vb == null) return 1;
      const na = typeof va === "number" ? va : Number(va);
      const nb = typeof vb === "number" ? vb : Number(vb);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return String(va).localeCompare(String(vb), "es", { numeric: true, sensitivity: "base" });
    };
  }

  // Auto-filtros: para una columna con `dataIndex`, construye `filters` +
  // `onFilter` a partir de los valores únicos presentes en `data`. Devuelve {}
  // si no hay dataIndex o si la columna ya tiene filtros/filterDropdown.
  function autoFiltros(col: ColumnType<T>): Partial<ColumnType<T>> {
    if (!dataParaFiltros || dataParaFiltros.length === 0) return {};
    if (col.filters || col.filterDropdown) return {};
    const di = (col as { dataIndex?: React.Key | React.Key[] }).dataIndex;
    if (di === undefined) return {};
    const path = Array.isArray(di) ? di : [di];
    const read = (row: T): unknown => {
      let v: unknown = row;
      for (const seg of path) {
        if (v == null || typeof v !== "object") return undefined;
        v = (v as Record<string, unknown>)[String(seg)];
      }
      return v;
    };
    const set = new Set<string>();
    let hayVacios = false;
    for (const r of dataParaFiltros) {
      const v = read(r);
      if (esVacio(v)) { hayVacios = true; continue; }
      if (v instanceof Date) set.add(v.toISOString().slice(0, 10));
      else set.add(String(v));
    }
    // Si la columna NO tiene ningún valor (todos vacíos), no inyectar filtros.
    if (set.size === 0 && !hayVacios) return {};
    const filters = [...set]
      .sort((a, b) => a.localeCompare(b, "es", { numeric: true, sensitivity: "base" }))
      .map((v) => ({ text: v, value: v }));
    if (hayVacios) filters.push({ text: FILTRO_VACIO_LABEL, value: FILTRO_VACIO_VALUE });
    return {
      filters,
      filterSearch: true,
      filterMultiple: true,
      onFilter: (value: boolean | React.Key, record: T) => {
        const raw = read(record);
        if (value === FILTRO_VACIO_VALUE) return esVacio(raw);
        const str = raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw ?? "");
        return str === value;
      },
    };
  }

  const columnasRedim = useMemo<ColumnsType<T>>(() => {
    return columnasOrdenadas.map((c, idx) => {
      const col = c as ColumnType<T>;
      const k = claveColumna(col, idx);
      const widthActual =
        anchos[k] ?? (typeof col.width === "number" ? col.width : DEFAULT_COL_WIDTH);
      // Auto-sorter si la columna no lo declara: usa el dataIndex para comparar.
      const sorterFinal = col.sorter ?? autoSorter((col as { dataIndex?: React.Key | React.Key[] }).dataIndex);
      // Auto-filtros desde data (si está disponible y la columna no los tiene).
      const auto = autoFiltros(col);
      // Multi-select por default en todos los filtros de columna. Si la columna
      // define `filters` y no eligió explícitamente `filterMultiple`, lo forzamos
      // a `true` para que el dropdown rinda checkboxes en vez de radios.
      const conMultiSelect = ((col.filters || auto.filters) && col.filterMultiple === undefined)
        ? { filterMultiple: true as const }
        : {};
      // Pin: solo se ofrece toggle al usuario para las cols que NO eran fixed
      // por código (las hardcoded `fixed:left` quedan fijas para siempre).
      const esFixPorUsuario = !fixedPorCodigo.has(k);
      const pinProps = esFixPorUsuario
        ? { isPinned: pinned.has(k), onTogglePin: () => togglePin(k) }
        : {};
      // Las columnas fixed mantienen ancho original (Resizable rompe el sticky)
      if (col.fixed) {
        return {
          ...col,
          ...auto,
          ...conMultiSelect,
          ...(col.sorter ? {} : { sorter: sorterFinal }),
          onHeaderCell: () => ({ columnKey: k, sortable: false, ...pinProps }),
        } as ColumnType<T>;
      }
      return {
        ...col,
        ...auto,
        ...conMultiSelect,
        width: widthActual,
        ...(col.sorter ? {} : { sorter: sorterFinal }),
        onHeaderCell: (column: { width?: number }) => ({
          width: column.width,
          columnKey: k,
          sortable: true,
          ...pinProps,
          // Commit del ancho solo al soltar (onResizeStop) — evita re-renders en cada pixel
          // que interrumpen el drag.
          onResizeStop: (_e: React.SyntheticEvent, data: ResizeCallbackData) => {
            setAnchos((prev) => ({ ...prev, [k]: Math.max(40, Math.round(data.size.width)) }));
          },
        }),
      } as ColumnType<T>;
    });
  }, [columnasOrdenadas, anchos, claveColumna, dataParaFiltros, fixedPorCodigo, pinned, togglePin]);

  const components = useMemo(
    () => ({ header: { cell: SortableResizableTitle } }),
    [],
  );

  // Lista de keys reordenables (sin las fixed) para SortableContext
  const movableKeys = useMemo(
    () =>
      columnasRedim
        .filter((c) => !(c as ColumnType<T>).fixed)
        .map((c, idx) => claveColumna(c as ColumnType<T>, idx)),
    [columnasRedim, claveColumna],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      setOrden((prev) => {
        const current = prev ?? movableKeys;
        const oldIndex = current.indexOf(String(active.id));
        const newIndex = current.indexOf(String(over.id));
        if (oldIndex < 0 || newIndex < 0) return current;
        return arrayMove(current, oldIndex, newIndex);
      });
    },
    [movableKeys],
  );

  // Wrapper que provee DndContext + SortableContext alrededor del <Table>.
  // IMPORTANTE: definimos el componente una sola vez (identity estable) y leemos
  // sensors/handleDragEnd/movableKeys desde un ref. Sin esto, cada vez que
  // cambia `columns` arriba se crea una nueva función y React desmonta el Table,
  // perdiendo el scroll horizontal (típico al editar una celda).
  const dragStateRef = useRef({ sensors, handleDragEnd, movableKeys });
  dragStateRef.current = { sensors, handleDragEnd, movableKeys };

  const TableDragWrapper = useMemo(() => {
    function Wrapper({ children }: { children: React.ReactNode }) {
      const { sensors: s, handleDragEnd: h, movableKeys: m } = dragStateRef.current;
      return (
        <DndContext sensors={s} collisionDetection={closestCenter} onDragEnd={h}>
          <SortableContext items={m} strategy={horizontalListSortingStrategy}>
            {children}
          </SortableContext>
        </DndContext>
      );
    }
    return Wrapper;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetAnchos = useCallback(() => {
    setAnchos({});
    setOrden(null);
    if (orderKey) try { localStorage.removeItem(orderKey); } catch { /* ignore */ }
  }, [orderKey]);

  // Orden ACTUAL (post-hidratación) — útil para que las exportaciones a
  // Excel respeten el layout del usuario. Si el usuario nunca reordenó,
  // devolvemos null para que el caller use el orden original.
  const ordenActual: string[] | null = orden;

  return { columnas: columnasRedim, components, resetAnchos, TableDragWrapper, orden: ordenActual };
}

// ───────────────────────────────────────────────────────────────────────────
// Filas arrastrables (drag-to-reorder rows en tablas template/edición)
// ───────────────────────────────────────────────────────────────────────────

interface SortableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  "data-row-key"?: string | number;
}

function SortableRow(props: SortableRowProps) {
  const key = props["data-row-key"];
  const id = key != null ? String(key) : "__none__";
  const sort = useSortable({ id, disabled: key == null });

  const style: React.CSSProperties = {
    ...props.style,
    transform: CSS.Translate.toString(sort.transform),
    transition: sort.transition,
    ...(sort.isDragging ? { opacity: 0.5, zIndex: 999, position: "relative" } : {}),
  };

  return (
    <tr
      {...props}
      ref={sort.setNodeRef as unknown as React.Ref<HTMLTableRowElement>}
      style={style}
      {...sort.attributes}
      {...sort.listeners}
    />
  );
}

/**
 * Hook para filas arrastrables (drag-to-reorder).
 *
 * Uso:
 *   const { components, RowDragWrapper } = useFilasArrastrables({
 *     items: rows.map(r => String(r.id)),
 *     onReorder: (oldIdx, newIdx) => {  ...persistir el nuevo orden... },
 *   });
 *
 *   <RowDragWrapper>
 *     <Table rowKey="id" components={components} ... />
 *   </RowDragWrapper>
 */
export function useFilasArrastrables(opts: {
  items: string[];
  onReorder: (oldIndex: number, newIndex: number) => void;
}) {
  const { items, onReorder } = opts;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = items.indexOf(String(active.id));
      const newIndex = items.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      onReorder(oldIndex, newIndex);
    },
    [items, onReorder],
  );

  const components = useMemo(
    () => ({ body: { row: SortableRow } }),
    [],
  );

  const RowDragWrapper = useCallback(
    ({ children }: { children: React.ReactNode }) => (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          {children}
        </SortableContext>
      </DndContext>
    ),
    [sensors, handleDragEnd, items],
  );

  return { components, RowDragWrapper };
}

// ───────────────────────────────────────────────────────────────────────────
// Persistencia de filtros / búsquedas por usuario (localStorage namespaced)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Drop-in replacement de `useState` que persiste el valor en localStorage,
 * namespacificado por el usuario logueado (`session.user.id`). Pensado para
 * filtros de tabla: búsqueda libre, Selects, rangos de fecha, columnFilters
 * de antd, etc.
 *
 * - Distintos usuarios del ERP en la misma PC NO se pisan los filtros.
 * - F5 / reload no resetea el filtro.
 * - Navegación a otra ruta y volver tampoco lo resetea.
 *
 * Para tipos no-JSON-serializables (ej. `Dayjs`), pasá `opts.serialize` y
 * `opts.deserialize`. Por ejemplo, para un rango de fechas:
 *
 *   const [desde, setDesde] = usePersistedState<Dayjs | null>(
 *     "ot-fecha-desde",
 *     null,
 *     { serialize: (v) => v?.toISOString() ?? null, deserialize: (s) => s ? dayjs(s as string) : null },
 *   );
 *
 * IMPORTANTE: el `baseKey` debe ser único por tabla+campo. Si dos tablas usan
 * el mismo baseKey, comparten filtro (no es lo que querés).
 */
export function usePersistedState<T>(
  baseKey: string,
  initial: T,
  opts?: {
    serialize?: (v: T) => unknown;
    deserialize?: (v: unknown) => T;
  },
): [T, Dispatch<SetStateAction<T>>] {
  const { data: session } = useSession();
  // Si no hay sesión todavía, usamos "anon" — los anon shares-storage entre
  // sí pero por la naturaleza del ERP siempre hay sesión, esto solo aplica
  // durante el primer render antes de que next-auth resuelva la cookie.
  const userId = (session?.user as { id?: string } | undefined)?.id ?? "anon";
  const storageKey = `${baseKey}::${userId}`;
  const serialize = opts?.serialize;
  const deserialize = opts?.deserialize;

  const [value, setValue] = useState<T>(initial);
  const [hidratado, setHidratado] = useState(false);
  // Ref para evitar re-hidratar el state si el effect vuelve a correr para
  // el mismo storageKey. Antes: cuando next-auth refresca la sesión, el
  // session.user.id puede cambiar momentáneamente (undefined→real→undefined),
  // disparando el effect varias veces y PISANDO lo que el usuario acababa
  // de escribir en el input. Causa el bug "hay que buscar 3 veces para
  // que el filtro tome".
  const ultimoKeyHidratado = useRef<string | null>(null);

  useEffect(() => {
    if (ultimoKeyHidratado.current === storageKey) return;
    ultimoKeyHidratado.current = storageKey;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null) {
        const parsed = JSON.parse(stored) as unknown;
        setValue(deserialize ? deserialize(parsed) : (parsed as T));
      }
      // Si no hay storage NO reseteamos a initial — el componente ya arrancó
      // con initial y si el usuario escribió antes de que el effect corra,
      // pisarlo destruiría su input.
    } catch { /* ignore */ }
    setHidratado(true);
    // initial/deserialize pueden cambiar entre renders sin afectar persistencia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!hidratado) return;
    try {
      const toStore = serialize ? serialize(value) : value;
      localStorage.setItem(storageKey, JSON.stringify(toStore));
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, hidratado, storageKey]);

  return [value, setValue];
}

// Helpers de (de)serialización para tipos comunes que no son JSON-clean.

/** Para un solo Dayjs nullable. */
export const persistDayjs = {
  serialize: (v: Dayjs | null): string | null => (v && v.isValid() ? v.toISOString() : null),
  deserialize: (s: unknown): Dayjs | null => {
    if (typeof s !== "string" || !s) return null;
    const d = dayjs(s);
    return d.isValid() ? d : null;
  },
} as const;

/** Para un rango {desde, hasta} de Dayjs (usar con `useRangoFechas`-style). */
export const persistRangoFechas = {
  serialize: (v: RangoFechas): { desde: string | null; hasta: string | null } => ({
    desde: persistDayjs.serialize(v.desde),
    hasta: persistDayjs.serialize(v.hasta),
  }),
  deserialize: (s: unknown): RangoFechas => {
    const obj = (s && typeof s === "object" ? s : {}) as { desde?: unknown; hasta?: unknown };
    return {
      desde: persistDayjs.deserialize(obj.desde),
      hasta: persistDayjs.deserialize(obj.hasta),
    };
  },
} as const;

/**
 * Versión persistente de `useRangoFechas`. Mismo API que el original
 * (`{ rango, setRango, limpiar, hayFiltro }`) pero el rango sobrevive
 * a F5 / navegación, scope por usuario.
 */
export function useRangoFechasPersistente(
  baseKey: string,
  initial: RangoFechas = { desde: null, hasta: null },
) {
  const [rango, setRango] = usePersistedState<RangoFechas>(baseKey, initial, persistRangoFechas);
  const limpiar = useCallback(() => setRango({ desde: null, hasta: null }), [setRango]);
  const hayFiltro = !!(rango.desde || rango.hasta);
  return { rango, setRango, limpiar, hayFiltro };
}

// ───────────────────────────────────────────────────────────────────────────
// Filas filtradas por la tabla (para pasar a ExportarExcelButton)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Helper para capturar las filas "actualmente visibles" en una `<Table>` —
 * con búsqueda, filtros de columna y ordenamiento ya aplicados — y poder
 * pasárselas a `<ExportarExcelButton currentRows={...}>`.
 *
 * Devuelve:
 *  - `filtradas`: las filas que la tabla muestra después de filtros/sort.
 *    Arranca igual a `rows`; se actualiza cada vez que el usuario cambia un
 *    filtro de columna o un sort en la tabla.
 *  - `onChange`: handler para `<Table onChange={...}>`. Si la tabla ya tiene
 *    un onChange propio (ej. para persistir filtros), usar `composeOnChange`.
 *
 * Uso típico:
 *   const { filtradas, onChange } = useTablaFiltrada(rows);
 *   <Table dataSource={rows} onChange={onChange} ... />
 *   <ExportarExcelButton currentRows={filtradas} ... />
 *
 * Si tu tabla ya tiene `onChange` para otra cosa, componer:
 *   const { filtradas, captureFilteredRows } = useTablaFiltrada(rows);
 *   <Table onChange={(p, f, s, ext) => {
 *     captureFilteredRows(ext);
 *     setColumnFilters(f);  // tu lógica existente
 *   }} />
 */
export function useTablaFiltrada<T>(rows: readonly T[]) {
  const [filtradas, setFiltradas] = useState<T[]>(rows as T[]);

  // Si `rows` cambia (ej. refetch), reiniciar filtradas a la nueva fuente.
  // AntD volverá a llamar onChange al render si hay filtros activos, así que
  // este reset es seguro: se sobrescribirá inmediatamente con el resultado
  // del filtro.
  useEffect(() => {
    setFiltradas(rows as T[]);
  }, [rows]);

  const captureFilteredRows = useCallback(
    (ext: { currentDataSource: T[] }) => {
      setFiltradas(ext.currentDataSource);
    },
    [],
  );

  // Conveniencia: handler completo para `onChange` cuando la tabla no necesita
  // otra cosa más.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onChange = useCallback(
    (_p: unknown, _f: unknown, _s: unknown, ext: { currentDataSource: T[] }) => {
      captureFilteredRows(ext);
    },
    [captureFilteredRows],
  );

  return { filtradas, onChange, captureFilteredRows };
}

