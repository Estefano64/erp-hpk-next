"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Checkbox, DatePicker, Divider, Popover, Space, Typography } from "antd";
import { CalendarOutlined, SettingOutlined } from "@ant-design/icons";
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
export function numeracionColumn<T>(opts: NumeracionOpts = {}): ColumnType<T> {
  const { current = 1, pageSize = 20, width = 60, fixed = true } = opts;
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
  const claves = columns
    .map((c) => (c as { key?: React.Key }).key)
    .filter((k): k is string | number => k !== undefined)
    .map(String);
  const visibles = claves.filter((k) => !ocultas.includes(k));

  const contenido = (
    <div style={{ minWidth: 220, maxHeight: 380, overflowY: "auto" }}>
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
export function valoresUnicos<T>(
  data: T[],
  campo: keyof T,
): { text: string; value: string }[] {
  const set = new Set<string>();
  for (const r of data) {
    const v = (r as Record<string, unknown>)[campo as string];
    if (v === null || v === undefined || v === "") continue;
    set.add(String(v));
  }
  return [...set].sort((a, b) => a.localeCompare(b)).map((v) => ({ text: v, value: v }));
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
  onFilter: (value: boolean | React.Key, record: T) => boolean;
} {
  return {
    filters: valoresUnicos(data, campo),
    filterSearch: true,
    onFilter: (value, record) =>
      String((record as Record<string, unknown>)[campo as string] ?? "") === value,
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
};

function SortableResizableTitle(props: SortableResizableTitleProps) {
  const { onResize, onResizeStop, width, columnKey, sortable, style: styleProp, children, ...restProps } = props;
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

  const dragHandle = isInteractive ? (
    <span
      {...sort.attributes}
      {...sort.listeners}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        width: 14,
        zIndex: 2,
        cursor: sort.isDragging ? "grabbing" : "grab",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "rgba(0,0,0,0.25)",
        fontSize: 11,
        opacity: 0,
        transition: "opacity 0.15s",
      }}
      className="col-drag-handle"
      title="Arrastrar para reordenar columna"
      onClick={(e) => e.stopPropagation()}
    >
      ⋮⋮
    </span>
  ) : null;

  const innerContent = (
    <>
      {dragHandle}
      {children}
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
// Uso:
//   const { columnas, components } = useColumnasRedimensionables(myColumns, "mi-tabla");
//   <Table columns={columnas} components={components} ... />
export function useColumnasRedimensionables<T>(
  columns: ColumnsType<T>,
  storageKey?: string,
) {
  const claveColumna = useCallback(
    (c: ColumnType<T>, idx: number): string =>
      String((c as { key?: React.Key }).key ?? (c as { dataIndex?: React.Key }).dataIndex ?? `col-${idx}`),
    [],
  );

  // ── Anchos (resize) ─────────────────────────────────────────────────
  const [anchos, setAnchos] = useState<Record<string, number>>({});
  const [hidratado, setHidratado] = useState(false);

  useEffect(() => {
    if (!storageKey) { setHidratado(true); return; }
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) setAnchos(JSON.parse(stored));
    } catch { /* ignore */ }
    setHidratado(true);
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !hidratado) return;
    try { localStorage.setItem(storageKey, JSON.stringify(anchos)); } catch { /* ignore */ }
  }, [anchos, hidratado, storageKey]);

  // ── Orden (drag-to-reorder) ─────────────────────────────────────────
  const orderKey = storageKey ? `${storageKey}-order` : undefined;
  const [orden, setOrden] = useState<string[] | null>(null);

  useEffect(() => {
    if (!orderKey) return;
    try {
      const stored = localStorage.getItem(orderKey);
      if (stored) setOrden(JSON.parse(stored));
    } catch { /* ignore */ }
  }, [orderKey]);

  useEffect(() => {
    if (!orderKey || orden === null) return;
    try { localStorage.setItem(orderKey, JSON.stringify(orden)); } catch { /* ignore */ }
  }, [orden, orderKey]);

  // Aplicar orden personalizado a las columnas. Las columnas fixed mantienen su posición original.
  const columnasOrdenadas = useMemo<ColumnsType<T>>(() => {
    if (!orden || orden.length === 0) return columns;
    // Separar fixed (no reordenables) de las normales
    const fixedCols = columns.filter((c) => (c as ColumnType<T>).fixed);
    const movableCols = columns.filter((c) => !(c as ColumnType<T>).fixed);
    const byKey = new Map(movableCols.map((c, i) => [claveColumna(c as ColumnType<T>, i), c] as const));
    // Aplicar orden persistido + agregar al final las que no estaban (columnas nuevas)
    const orderedMovable: ColumnsType<T> = [];
    const seen = new Set<string>();
    for (const k of orden) {
      const c = byKey.get(k);
      if (c) { orderedMovable.push(c); seen.add(k); }
    }
    for (const c of movableCols) {
      const k = claveColumna(c as ColumnType<T>, 0);
      if (!seen.has(k)) orderedMovable.push(c);
    }
    // Reinsertar fixed manteniendo su side
    const left = fixedCols.filter((c) => (c as ColumnType<T>).fixed === "left");
    const right = fixedCols.filter((c) => (c as ColumnType<T>).fixed === "right");
    return [...left, ...orderedMovable, ...right];
  }, [columns, orden, claveColumna]);

  const columnasRedim = useMemo<ColumnsType<T>>(() => {
    return columnasOrdenadas.map((c, idx) => {
      const col = c as ColumnType<T>;
      const k = claveColumna(col, idx);
      const widthActual = anchos[k] ?? (typeof col.width === "number" ? col.width : undefined);
      // Las columnas fixed mantienen ancho original (Resizable rompe el sticky)
      if (col.fixed) {
        return {
          ...col,
          onHeaderCell: () => ({ columnKey: k, sortable: false }),
        } as ColumnType<T>;
      }
      return {
        ...col,
        ...(widthActual ? { width: widthActual } : {}),
        onHeaderCell: (column: { width?: number }) => ({
          width: column.width,
          columnKey: k,
          sortable: true,
          // Commit del ancho solo al soltar (onResizeStop) — evita re-renders en cada pixel
          // que interrumpen el drag.
          onResizeStop: (_e: React.SyntheticEvent, data: ResizeCallbackData) => {
            setAnchos((prev) => ({ ...prev, [k]: Math.max(40, Math.round(data.size.width)) }));
          },
        }),
      } as ColumnType<T>;
    });
  }, [columnasOrdenadas, anchos, claveColumna]);

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
  const TableDragWrapper = useCallback(
    ({ children }: { children: React.ReactNode }) => (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={movableKeys} strategy={horizontalListSortingStrategy}>
          {children}
        </SortableContext>
      </DndContext>
    ),
    [sensors, handleDragEnd, movableKeys],
  );

  const resetAnchos = useCallback(() => {
    setAnchos({});
    setOrden(null);
    if (orderKey) try { localStorage.removeItem(orderKey); } catch { /* ignore */ }
  }, [orderKey]);

  return { columnas: columnasRedim, components, resetAnchos, TableDragWrapper };
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
