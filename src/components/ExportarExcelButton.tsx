"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Button, App, Modal, Form, DatePicker, Checkbox, Input, Space, Divider,
  Typography, Tag, Alert,
} from "antd";
import {
  FileExcelOutlined, SearchOutlined, CalendarOutlined, FilterOutlined,
} from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { brand, space as spc } from "@/lib/theme";

const { Text } = Typography;

export interface ExportColumn<T> {
  /** Identificador para selección/persistencia. Si no se pasa, se usa `label`. */
  key?: string;
  /** Header de la columna en el .xlsx */
  label: string;
  /** Cómo extraer el valor desde el record */
  value: (record: T) => string | number | boolean | null | undefined;
  /** Si false, arranca DESMARCADA en el selector. Default: true. */
  defaultSelected?: boolean;
}

/** Filtro multi-select de categoría (ej. tipo de OT, estado, etc.). */
export interface ExportCategoryFilter<T = unknown> {
  /** ID interno (para form + storage). */
  key: string;
  /** Etiqueta visible. */
  label: string;
  options: { value: string; label: string }[];
  /**
   * Si se pasa, los valores seleccionados se mandan al endpoint como query param
   * (CSV de los `value`). Ej. paramName="tipo_ot" → ?tipo_ot=Bien,Servicio
   */
  paramName?: string;
  /**
   * Si se pasa, el filtro se aplica en el cliente sobre cada registro DESPUÉS
   * de bajar todo. Útil cuando el endpoint no acepta el filtro como query.
   */
  predicate?: (record: T, selected: string[]) => boolean;
}

/** Filtro de rango de fechas. Puede aplicar server-side, client-side, o ambos. */
export interface ExportDateFilter<T = unknown> {
  /** Etiqueta del campo (default: "Rango de fechas"). */
  label?: string;
  /** Si se pasa, se manda como query param (formato YYYY-MM-DD). */
  paramNameDesde?: string;
  /** Si se pasa, se manda como query param (formato YYYY-MM-DD). */
  paramNameHasta?: string;
  /**
   * Filtro client-side: se llama por cada record con el rango elegido.
   * Si devuelve false, el record se excluye.
   */
  predicate?: (record: T, desde: Dayjs | null, hasta: Dayjs | null) => boolean;
}

interface Props<T> {
  /** Endpoint que devuelve { data: T[] } */
  endpoint: string;
  /** Si el endpoint pagina, se itera con este límite y page hasta consumir todo */
  limit?: number;
  /** Columnas disponibles para exportar */
  columns: ExportColumn<T>[];
  /** Nombre base del archivo (sin extensión ni timestamp) */
  filename: string;
  /** Sheet name dentro del .xlsx (default: filename) */
  sheetName?: string;
  /** Filtro opcional de rango de fechas. */
  dateFilter?: ExportDateFilter<T>;
  /** Filtros opcionales de categoría (multi-select). */
  categoryFilters?: ExportCategoryFilter<T>[];
  /**
   * Clave de localStorage para persistir las columnas elegidas + filtros entre
   * descargas. Default: `excel-export-${filename}`.
   */
  storageKey?: string;
  /**
   * Filas actualmente visibles en la tabla (después de aplicar búsqueda y
   * filtros de columna de AntD). Si se pasa, aparece un checkbox "Usar filtros
   * actuales de la tabla" en el modal; cuando está marcado, la descarga usa
   * estas filas directamente en lugar de re-fetchear desde el endpoint. El
   * caller debe pasar las filas filtradas (no solo la página visible) — lo más
   * común es leerlas del callback `onChange` de AntD Table:
   *   <Table onChange={(_, _, _, ext) => setFiltradas(ext.currentDataSource)} />
   * o usar el helper `useTablaFiltrada` de `@/lib/tables`.
   *
   * IMPORTANTE: para tablas server-side paginadas, `currentRows` solo trae la
   * página visible (típicamente 20 filas). En ese caso usar `endpointParams`
   * en su lugar — el componente fetchea TODAS las páginas pasando esos
   * filtros como query params al server.
   */
  currentRows?: T[];
  /**
   * Query params extra para agregar al endpoint cuando el usuario eligió
   * "Usar filtros actuales de la tabla". Pensado para tablas server-side
   * paginadas: el caller pasa acá los mismos filtros que envía a `fetchData`
   * (search, estado, fecha, etc.) y la descarga los respeta server-side.
   *
   * Valores `undefined`, `null` o "" se omiten automáticamente.
   *
   * Ejemplo:
   *   endpointParams={{ search, planta: filterPlanta, estado }}
   *
   * Si pasás esto Y `currentRows`, se prefiere `endpointParams` porque trae
   * TODAS las filas filtradas (no solo la página visible). `currentRows`
   * sigue sirviendo para mostrar el conteo en el checkbox.
   */
  endpointParams?: Record<string, string | number | boolean | null | undefined> | URLSearchParams;
  /**
   * Layout actual de la tabla — para que el Excel salga con las mismas
   * columnas visibles y en el mismo orden que el usuario tiene configurado.
   * Cuando se pasa, aparece un checkbox "Respetar layout actual de la tabla"
   * en el modal (activo por default). Cuando está activo:
   *   - Solo se exportan columnas cuya `key` NO está en `ocultas`.
   *   - El orden de las columnas en el .xlsx sigue `orden` (las que no
   *     aparecen en `orden` van al final con el orden original).
   * El caller debe asegurarse de que las `key` de los `ExportColumn` coincidan
   * con las `key` de las columnas de AntD para que el match funcione.
   */
  tablaLayout?: {
    /** Orden actual de columnas (keys). Las no listadas van al final. */
    orden?: string[];
    /** Keys ocultas. Se excluyen del export cuando el checkbox está activo. */
    ocultas?: string[];
  };
  /** Texto del botón */
  children?: React.ReactNode;
}

// Resuelve un key estable por columna (cae a label si no se pasa explícito).
function colKey<T>(c: ExportColumn<T>): string {
  return c.key ?? c.label;
}

/**
 * Botón que abre un modal de configuración antes de descargar el .xlsx:
 *  - Rango de fechas (opcional)
 *  - Filtros multi-select de categoría (opcional)
 *  - Checklist de columnas a incluir
 *
 * Persiste la última selección de columnas y filtros en localStorage por tabla.
 * Itera páginas del endpoint si las soporta; agrega timestamp al filename.
 */
export function ExportarExcelButton<T>({
  endpoint,
  limit = 1000,
  columns,
  filename,
  sheetName,
  dateFilter,
  categoryFilters,
  storageKey,
  currentRows,
  endpointParams,
  tablaLayout,
  children,
}: Props<T>) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  // Si el caller pasó currentRows, por defecto descargamos esos (respeta los
  // filtros que el usuario tiene aplicados en la tabla). El usuario puede
  // desmarcar para forzar re-fetch desde el endpoint.
  const [usarFiltrosTabla, setUsarFiltrosTabla] = useState(true);
  // Cuando el caller pasó `tablaLayout`, el .xlsx respeta orden + visibilidad
  // de la tabla por default. El usuario puede desmarcar para volver al orden
  // original definido en `columns`.
  const [respetarLayout, setRespetarLayout] = useState(true);

  const persistKey = storageKey ?? `excel-export-${filename}`;

  // ── Selección de columnas ──────────────────────────────────────────────
  const allKeys = useMemo(() => columns.map((c) => colKey(c)), [columns]);
  const defaultSelected = useMemo(
    () => columns.filter((c) => c.defaultSelected !== false).map((c) => colKey(c)),
    [columns],
  );

  const [selectedCols, setSelectedCols] = useState<string[]>(defaultSelected);
  const [colSearch, setColSearch] = useState("");

  // ── Filtros ────────────────────────────────────────────────────────────
  const [desde, setDesde] = useState<Dayjs | null>(null);
  const [hasta, setHasta] = useState<Dayjs | null>(null);
  // Por cada categoryFilter, un array de valores seleccionados.
  const [catSelections, setCatSelections] = useState<Record<string, string[]>>({});

  // Hidratar desde localStorage al abrir el modal por primera vez.
  useEffect(() => {
    if (!open) return;
    try {
      const stored = localStorage.getItem(persistKey);
      if (stored) {
        const parsed = JSON.parse(stored) as {
          cols?: string[];
          cats?: Record<string, string[]>;
        };
        // Filtrar keys que ya no existen (columnas eliminadas en código).
        if (Array.isArray(parsed.cols)) {
          const validas = parsed.cols.filter((k) => allKeys.includes(k));
          // Si quedó vacío (todas las cols del usuario desaparecieron), volver al default.
          setSelectedCols(validas.length > 0 ? validas : defaultSelected);
        } else {
          setSelectedCols(defaultSelected);
        }
        if (parsed.cats && typeof parsed.cats === "object") {
          setCatSelections(parsed.cats);
        }
      } else {
        setSelectedCols(defaultSelected);
      }
    } catch {
      setSelectedCols(defaultSelected);
    }
    // Reset filtros de fecha cada vez que abre — no persistimos para evitar
    // que el usuario descargue accidentalmente filtrado de una vez previa.
    setDesde(null);
    setHasta(null);
    setColSearch("");
  }, [open, persistKey, allKeys, defaultSelected]);

  function persistir(next: { cols?: string[]; cats?: Record<string, string[]> }) {
    try {
      const current = {
        cols: next.cols ?? selectedCols,
        cats: next.cats ?? catSelections,
      };
      localStorage.setItem(persistKey, JSON.stringify(current));
    } catch {
      /* ignore */
    }
  }

  async function fetchAll(opts?: { incluirEndpointParams?: boolean }): Promise<T[]> {
    // Construir query params extra a partir de los filtros del modal.
    const extraParams = new URLSearchParams();
    if (dateFilter?.paramNameDesde && desde) {
      extraParams.set(dateFilter.paramNameDesde, desde.format("YYYY-MM-DD"));
    }
    if (dateFilter?.paramNameHasta && hasta) {
      extraParams.set(dateFilter.paramNameHasta, hasta.format("YYYY-MM-DD"));
    }
    for (const f of categoryFilters ?? []) {
      const sel = catSelections[f.key] ?? [];
      if (f.paramName && sel.length > 0) {
        extraParams.set(f.paramName, sel.join(","));
      }
    }
    // Si el caller pasó endpointParams y el usuario marcó "usar filtros de la
    // tabla", agregamos esos como query params al endpoint (típico de tablas
    // server-side paginadas: respetan los filtros que ya están aplicados).
    if (opts?.incluirEndpointParams && endpointParams) {
      if (endpointParams instanceof URLSearchParams) {
        for (const [k, v] of endpointParams.entries()) {
          if (v === "") continue;
          extraParams.set(k, v);
        }
      } else {
        for (const [k, v] of Object.entries(endpointParams)) {
          if (v == null || v === "") continue;
          extraParams.set(k, String(v));
        }
      }
    }
    const extraStr = extraParams.toString();

    const all: T[] = [];
    let page = 1;
    while (true) {
      const sep = endpoint.includes("?") ? "&" : "?";
      const extra = extraStr ? `&${extraStr}` : "";
      const url = `${endpoint}${sep}page=${page}&limit=${limit}${extra}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Error cargando página ${page}`);
      const j = await res.json();
      const rows = (j.data ?? []) as T[];
      all.push(...rows);
      const total = typeof j.total === "number" ? j.total : null;
      if ((total != null && all.length >= total) || rows.length < limit) break;
      page++;
      if (page > 50) {
        message.warning("Más de 50.000 registros — exportación truncada");
        break;
      }
    }
    return all;
  }

  function aplicarFiltrosCliente(records: T[]): T[] {
    let out = records;
    // Fecha client-side (solo si el caller pasó predicate).
    if (dateFilter?.predicate && (desde || hasta)) {
      out = out.filter((r) => dateFilter.predicate!(r, desde, hasta));
    }
    // Categorías client-side.
    for (const f of categoryFilters ?? []) {
      const sel = catSelections[f.key] ?? [];
      if (sel.length > 0 && f.predicate) {
        out = out.filter((r) => f.predicate!(r, sel));
      }
    }
    return out;
  }

  async function descargar() {
    if (selectedCols.length === 0) {
      message.warning("Elegí al menos una columna");
      return;
    }
    setLoading(true);
    try {
      // Si el usuario marcó "Usar filtros actuales de la tabla":
      //   - Si hay endpointParams → fetch al endpoint con esos params (trae
      //     TODAS las filas que cumplen los filtros server-side, no solo la
      //     página visible).
      //   - Si no hay endpointParams pero hay currentRows → usar las filas
      //     visibles directamente (caso tablas client-side).
      // Si NO está marcado → fetch sin endpointParams + aplicar filtros del modal.
      const usarFiltrosActivos = usarFiltrosTabla && (endpointParams != null || currentRows != null);
      let filtrados: T[];
      if (usarFiltrosActivos && endpointParams != null) {
        // Server-side: el endpoint ya filtra; los filtros del modal se ignoran.
        filtrados = await fetchAll({ incluirEndpointParams: true });
      } else if (usarFiltrosActivos && currentRows != null) {
        // Client-side: ya tenemos las filas filtradas en memoria.
        filtrados = currentRows;
      } else {
        // Sin filtros de tabla — descarga "todo" con los filtros del modal.
        filtrados = aplicarFiltrosCliente(await fetchAll());
      }
      if (filtrados.length === 0) {
        message.info(usarFiltrosActivos
          ? "No hay registros que cumplan los filtros actuales de la tabla"
          : "No hay registros que cumplan los filtros");
        return;
      }
      // Persistir selección actual para próxima descarga.
      persistir({ cols: selectedCols, cats: catSelections });

      // Conservar el orden original de columnas (no el orden en que el usuario las marcó).
      // Si tablaLayout está activo: respetar orden + ocultas de la tabla.
      // El user puede tener columnas seleccionadas en el modal que la tabla tenga
      // ocultas; cuando "respetar layout" está ON, las ocultas SE EXCLUYEN incluso
      // si fueron marcadas. Es lo que el usuario espera ("descargá lo que veo").
      let colsParaExport: ExportColumn<T>[];
      if (tablaLayout && respetarLayout) {
        const ocultasSet = new Set(tablaLayout.ocultas ?? []);
        const ordenArr = tablaLayout.orden ?? [];
        const ordenIdx = new Map<string, number>();
        ordenArr.forEach((k, i) => ordenIdx.set(k, i));
        const filtradas = columns.filter((c) => {
          const k = colKey(c);
          if (ocultasSet.has(k)) return false;
          if (!selectedCols.includes(k)) return false;
          return true;
        });
        // Sort: las que están en `orden` van primero en ese orden; las que no
        // están van al final manteniendo su orden original (estable).
        filtradas.sort((a, b) => {
          const ka = colKey(a);
          const kb = colKey(b);
          const ia = ordenIdx.has(ka) ? ordenIdx.get(ka)! : Number.MAX_SAFE_INTEGER;
          const ib = ordenIdx.has(kb) ? ordenIdx.get(kb)! : Number.MAX_SAFE_INTEGER;
          return ia - ib;
        });
        colsParaExport = filtradas;
      } else {
        colsParaExport = columns.filter((c) => selectedCols.includes(colKey(c)));
      }

      const XLSX = await import("xlsx");
      const rows = filtrados.map((r) => {
        const row: Record<string, unknown> = {};
        for (const col of colsParaExport) {
          row[col.label] = col.value(r) ?? "";
        }
        return row;
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName ?? filename);
      const ts = dayjs().format("YYYYMMDD-HHmm");
      XLSX.writeFile(wb, `${filename}-${ts}.xlsx`);
      message.success(`Excel descargado: ${filtrados.length} registro(s)`);
      setOpen(false);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Error al exportar");
    } finally {
      setLoading(false);
    }
  }

  const colsFiltradas = useMemo(() => {
    const term = colSearch.trim().toLowerCase();
    if (!term) return columns;
    return columns.filter((c) => c.label.toLowerCase().includes(term));
  }, [columns, colSearch]);

  const todasMarcadas = selectedCols.length === columns.length;
  const ningunaMarcada = selectedCols.length === 0;

  return (
    <>
      <Button
        icon={<FileExcelOutlined />}
        onClick={() => setOpen(true)}
        style={{ background: "#1d6f42", color: "#fff", borderColor: "#1d6f42" }}
      >
        {children ?? "Descargar Excel"}
      </Button>

      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        title={
          <Space>
            <FileExcelOutlined style={{ color: "#1d6f42" }} />
            <span>Configurar exportación a Excel</span>
          </Space>
        }
        width={720}
        destroyOnHidden
        footer={
          <Space>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {selectedCols.length} de {columns.length} columna(s) seleccionada(s)
            </Text>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              type="primary"
              icon={<FileExcelOutlined />}
              loading={loading}
              onClick={descargar}
              style={{ background: "#1d6f42", borderColor: "#1d6f42" }}
            >
              Descargar
            </Button>
          </Space>
        }
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: spc.md }}
          message={
            <span style={{ fontSize: 12 }}>
              Tu selección se recuerda para la próxima descarga.
            </span>
          }
        />

        {/* Checkbox para respetar el layout de la tabla (orden + ocultas).
            Aparece solo si el caller pasó tablaLayout. */}
        {tablaLayout && (
          <div style={{ marginBottom: spc.md, padding: spc.sm, background: "#f5f5f5", borderRadius: 4 }}>
            <Checkbox
              checked={respetarLayout}
              onChange={(e) => setRespetarLayout(e.target.checked)}
            >
              <Text strong>Respetar layout actual de la tabla</Text>
              {(tablaLayout.ocultas?.length ?? 0) > 0 && (
                <Tag color="orange" style={{ marginLeft: 6 }}>
                  {tablaLayout.ocultas?.length} ocultas
                </Tag>
              )}
            </Checkbox>
            <div style={{ marginTop: 4, marginLeft: 24 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {respetarLayout
                  ? "Las columnas saldrán en el orden que tenés en la tabla; las ocultas se excluyen aunque estén marcadas abajo."
                  : "Se ignora el layout: usás la selección y orden original de columnas."}
              </Text>
            </div>
          </div>
        )}

        {/* Checkbox para descargar respetando los filtros activos de la tabla.
            Aparece si el caller pasó currentRows o endpointParams. */}
        {(currentRows != null || endpointParams != null) && (() => {
          // Lista de filtros activos para mostrarlos al usuario.
          const activos: string[] = [];
          if (endpointParams) {
            if (endpointParams instanceof URLSearchParams) {
              for (const [k, v] of endpointParams.entries()) {
                if (v === "") continue;
                activos.push(`${k}=${v}`);
              }
            } else {
              for (const [k, v] of Object.entries(endpointParams)) {
                if (v == null || v === "") continue;
                activos.push(`${k}=${v}`);
              }
            }
          }
          return (
            <div style={{ marginBottom: spc.md, padding: spc.sm, background: "#f5f5f5", borderRadius: 4 }}>
              <Checkbox
                checked={usarFiltrosTabla}
                onChange={(e) => setUsarFiltrosTabla(e.target.checked)}
              >
                <Text strong>Usar filtros actuales de la tabla</Text>
                {currentRows != null && (
                  <Tag color="blue" style={{ marginLeft: 6 }}>
                    {currentRows.length} fila(s) visible(s)
                  </Tag>
                )}
              </Checkbox>
              <div style={{ marginTop: 4, marginLeft: 24 }}>
                {usarFiltrosTabla ? (
                  <>
                    <Text type="secondary" style={{ fontSize: 11, display: "block" }}>
                      {endpointParams != null
                        ? "Se descargarán todas las filas que cumplen los filtros actuales (no solo la página visible). Los filtros de abajo no aplican."
                        : "Se descargarán las filas visibles en la tabla (búsqueda + filtros de columna ya aplicados). Los filtros de abajo no aplican."}
                    </Text>
                    {activos.length > 0 && (
                      <div style={{ marginTop: 4 }}>
                        <Text style={{ fontSize: 11 }} type="secondary">Filtros activos: </Text>
                        {activos.map((s) => (
                          <Tag key={s} style={{ margin: "2px 4px 0 0", fontSize: 10 }}>{s}</Tag>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Se descargarán TODOS los registros del endpoint, aplicando los filtros que elijas abajo.
                  </Text>
                )}
              </div>
            </div>
          );
        })()}

        {/* Rango de fechas — solo cuando NO usamos los filtros de la tabla */}
        {!((currentRows != null || endpointParams != null) && usarFiltrosTabla) && dateFilter && (
          <Form layout="vertical" style={{ marginBottom: spc.sm }}>
            <Form.Item
              label={
                <Space size={4}>
                  <CalendarOutlined style={{ color: brand.cyan }} />
                  <Text strong>{dateFilter.label ?? "Rango de fechas"}</Text>
                </Space>
              }
              style={{ marginBottom: spc.sm }}
            >
              <Space wrap>
                <DatePicker
                  placeholder="Desde"
                  format="DD/MM/YYYY"
                  value={desde}
                  onChange={(d) => setDesde(d)}
                  allowClear
                />
                <DatePicker
                  placeholder="Hasta"
                  format="DD/MM/YYYY"
                  value={hasta}
                  onChange={(d) => setHasta(d)}
                  allowClear
                />
                {(desde || hasta) && (
                  <Button size="small" type="link" onClick={() => { setDesde(null); setHasta(null); }}>
                    Limpiar
                  </Button>
                )}
              </Space>
            </Form.Item>
          </Form>
        )}

        {/* Categorías multi-select — solo cuando NO usamos los filtros de la tabla */}
        {!((currentRows != null || endpointParams != null) && usarFiltrosTabla) && (categoryFilters ?? []).length > 0 && (
          <div style={{ marginBottom: spc.md }}>
            {(categoryFilters ?? []).map((f) => {
              const sel = catSelections[f.key] ?? [];
              const allVals = f.options.map((o) => o.value);
              const todos = sel.length === allVals.length;
              return (
                <div key={f.key} style={{ marginBottom: spc.sm }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <Space size={4}>
                      <FilterOutlined style={{ color: brand.cyan }} />
                      <Text strong>{f.label}</Text>
                      {sel.length > 0 && sel.length < allVals.length && (
                        <Tag color="blue" style={{ margin: 0 }}>{sel.length} de {allVals.length}</Tag>
                      )}
                      {todos && <Tag color="default" style={{ margin: 0 }}>Todos</Tag>}
                    </Space>
                    <Space size={4}>
                      <Button
                        size="small" type="link"
                        onClick={() => setCatSelections((prev) => ({ ...prev, [f.key]: allVals }))}
                        disabled={todos}
                      >
                        Todos
                      </Button>
                      <Button
                        size="small" type="link"
                        onClick={() => setCatSelections((prev) => ({ ...prev, [f.key]: [] }))}
                        disabled={sel.length === 0}
                      >
                        Ninguno
                      </Button>
                    </Space>
                  </div>
                  <Checkbox.Group
                    value={sel}
                    onChange={(vals) => setCatSelections((prev) => ({ ...prev, [f.key]: vals as string[] }))}
                    options={f.options}
                  />
                </div>
              );
            })}
            <Text type="secondary" style={{ fontSize: 11 }}>
              Si no marcás ninguna opción de un filtro, no se aplica (se exportan todos).
            </Text>
          </div>
        )}

        <Divider style={{ margin: `${spc.sm}px 0` }} />

        {/* Selección de columnas */}
        <div style={{ marginBottom: spc.sm, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Text strong>Columnas a exportar</Text>
          <Space size={4}>
            <Button
              size="small" type="link"
              onClick={() => setSelectedCols(allKeys)}
              disabled={todasMarcadas}
            >
              Marcar todas
            </Button>
            <Button
              size="small" type="link" danger
              onClick={() => setSelectedCols([])}
              disabled={ningunaMarcada}
            >
              Desmarcar todas
            </Button>
          </Space>
        </div>

        <Input
          placeholder="Buscar columna..."
          prefix={<SearchOutlined />}
          value={colSearch}
          onChange={(e) => setColSearch(e.target.value)}
          allowClear
          style={{ marginBottom: spc.sm }}
        />

        <div
          style={{
            maxHeight: 320,
            overflowY: "auto",
            border: `1px solid ${brand.border}`,
            borderRadius: 4,
            padding: spc.sm,
          }}
        >
          <Checkbox.Group
            value={selectedCols}
            onChange={(vals) => setSelectedCols(vals as string[])}
            style={{ width: "100%" }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
              {colsFiltradas.map((c) => {
                const k = colKey(c);
                return (
                  <Checkbox key={k} value={k} style={{ fontSize: 13 }}>
                    {c.label}
                  </Checkbox>
                );
              })}
            </div>
            {colsFiltradas.length === 0 && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Sin columnas que coincidan con "{colSearch}".
              </Text>
            )}
          </Checkbox.Group>
        </div>
      </Modal>
    </>
  );
}
