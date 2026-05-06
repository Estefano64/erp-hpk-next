"use client";

import { useEffect, useState } from "react";
import { Button, Checkbox, Divider, Popover, Space } from "antd";
import { SettingOutlined } from "@ant-design/icons";
import type { ColumnsType, ColumnType, TablePaginationConfig } from "antd/es/table/interface";

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
export const PAGINATION_PAGE_SIZE_OPTIONS = ["10", "20", "50", "100"];

// Configuración de paginación común. `current`, `pageSize`, `total` y `onChange` se
// pasan desde la página; el resto sale de aquí.
export function paginacionEstandar(
  args: {
    current: number;
    pageSize: number;
    total: number;
    onChange: (page: number, size: number) => void;
    label?: string; // ej: "registros", "órdenes de compra", "evaluaciones"
  },
): TablePaginationConfig {
  const { current, pageSize, total, onChange, label = "registros" } = args;
  return {
    current,
    pageSize,
    total,
    pageSizeOptions: PAGINATION_PAGE_SIZE_OPTIONS,
    showSizeChanger: true,
    showTotal: (t) => `${t.toLocaleString("es-PE")} ${label}`,
    onChange,
    onShowSizeChange: onChange,
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
export function useColumnasOcultas(storageKey: string) {
  const [ocultas, setOcultas] = useState<string[]>([]);
  const [hidratado, setHidratado] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) setOcultas(JSON.parse(stored));
    } catch { /* ignore */ }
    setHidratado(true);
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
export function visibleColumns<T>(columns: ColumnsType<T>, ocultas: string[]): ColumnsType<T> {
  return columns.filter((c) => {
    const k = (c as { key?: React.Key }).key;
    return k === undefined || !ocultas.includes(String(k));
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
