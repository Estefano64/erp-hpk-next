"use client";

import { useState } from "react";
import { Button, App } from "antd";
import { FileExcelOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

export interface ExportColumn<T> {
  /** Header de la columna en el .xlsx */
  label: string;
  /** Cómo extraer el valor desde el record */
  value: (record: T) => string | number | boolean | null | undefined;
}

interface Props<T> {
  /** Endpoint que devuelve { data: T[] } */
  endpoint: string;
  /** Si el endpoint pagina, se itera con este límite y page hasta consumir todo */
  limit?: number;
  /** Columnas a exportar */
  columns: ExportColumn<T>[];
  /** Nombre base del archivo (sin extensión ni timestamp) */
  filename: string;
  /** Sheet name dentro del .xlsx (default: filename) */
  sheetName?: string;
  /** Texto del botón */
  children?: React.ReactNode;
}

// Botón que descarga todos los registros del endpoint en un .xlsx.
// Itera páginas si el endpoint las soporta; agrega timestamp al filename.
export function ExportarExcelButton<T>({
  endpoint, limit = 1000, columns, filename, sheetName, children,
}: Props<T>) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);

  async function fetchAll(): Promise<T[]> {
    const all: T[] = [];
    let page = 1;
    while (true) {
      const sep = endpoint.includes("?") ? "&" : "?";
      const url = `${endpoint}${sep}page=${page}&limit=${limit}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Error cargando página ${page}`);
      const j = await res.json();
      const rows = (j.data ?? []) as T[];
      all.push(...rows);
      const total = typeof j.total === "number" ? j.total : null;
      // Si el endpoint no devuelve total, paramos cuando recibimos menos del limit
      if ((total != null && all.length >= total) || rows.length < limit) break;
      page++;
      if (page > 50) {
        // Safety net: 50 páginas * 1000 = 50k registros. Si excede, abortar.
        message.warning("Más de 50.000 registros — exportación truncada");
        break;
      }
    }
    return all;
  }

  async function handleClick() {
    setLoading(true);
    try {
      const records = await fetchAll();
      if (records.length === 0) {
        message.info("No hay registros para exportar");
        return;
      }
      // Lazy-load xlsx (~400KB) solo cuando se usa
      const XLSX = await import("xlsx");
      const rows = records.map((r) => {
        const row: Record<string, unknown> = {};
        for (const col of columns) {
          row[col.label] = col.value(r) ?? "";
        }
        return row;
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName ?? filename);
      const ts = dayjs().format("YYYYMMDD-HHmm");
      XLSX.writeFile(wb, `${filename}-${ts}.xlsx`);
      message.success(`Excel descargado: ${records.length} registro(s)`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Error al exportar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      icon={<FileExcelOutlined />}
      onClick={handleClick}
      loading={loading}
      style={{ background: "#1d6f42", color: "#fff", borderColor: "#1d6f42" }}
    >
      {children ?? "Descargar Excel"}
    </Button>
  );
}
