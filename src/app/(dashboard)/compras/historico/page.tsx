"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Typography, Table, Input, Space, Button, Empty, Row, Col, Card, Statistic,
  Tag, InputNumber, DatePicker, App, Tooltip, Select, Segmented, Switch, Badge,
  Modal, Form,
} from "antd";
import dayjs, { Dayjs } from "dayjs";
import { ReloadOutlined, SearchOutlined, FileSearchOutlined, EditOutlined, FileExcelOutlined, ClearOutlined, PlusOutlined } from "@ant-design/icons";
import type { ColumnsType, ColumnGroupType, ColumnType } from "antd/es/table/interface";
import { brand } from "@/lib/theme";
import {
  useColumnasOcultas, ColumnasToggleButton, visibleColumns, STICKY_HEADER,
  filtroPorColumna, paginacionEstandar, useColumnasRedimensionables,
} from "@/lib/tables";

const { Title, Text } = Typography;

interface Celda { precio: number; moneda: string; origen: "oc" | "cotizacion"; fecha: string | null }
interface MatRow {
  material_id: number;
  codigo: string | null;
  np: string | null;
  descripcion: string | null;
  marca: string | null;
  precios: Record<string, Celda>;
  precio_minimo: number | null;
  proveedor_ganador: string | null;
  proveedor_ganador_id: number | null;
  ultima_compra_precio: number | null;
  ultima_compra_fecha: string | null;
  ultima_compra_prov: string | null;
}
interface Prov { id: number; nombre: string }

export default function HistoricoComprasPage() {
  const { message } = App.useApp();
  const [materiales, setMateriales] = useState<MatRow[]>([]);
  const [proveedores, setProveedores] = useState<Prov[]>([]);
  const [stats, setStats] = useState({ materiales: 0, proveedores: 0, cotizaciones: 0 });
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [busqueda, setBusqueda] = useState("");
  const [editando, setEditando] = useState<{ matId: number; provId: number } | null>(null);
  const [editValor, setEditValor] = useState<number | null>(null);
  // Fecha de la cotización (editable, default a hoy).
  const [editFecha, setEditFecha] = useState<Dayjs>(dayjs());
  const { ocultas, setOcultas } = useColumnasOcultas("historico-matriz-cols-v1");
  // Vista actual después de filtros de columna + sort (la setea el Table.onChange).
  // Permite que el export Excel respete TODOS los filtros visibles, no solo la búsqueda libre.
  const [vistaActual, setVistaActual] = useState<MatRow[] | null>(null);

  // ── Filtros adicionales (state controlado, se aplican antes que el Table) ──
  const [filtroMarcas, setFiltroMarcas] = useState<string[]>([]);
  const [filtroProvCotiz, setFiltroProvCotiz] = useState<number[]>([]);
  const [filtroProvGanador, setFiltroProvGanador] = useState<number[]>([]);
  const [filtroEstadoCot, setFiltroEstadoCot] = useState<"todos" | "manual" | "oc" | "sin">("todos");
  const [precioMin, setPrecioMin] = useState<number | null>(null);
  const [precioMax, setPrecioMax] = useState<number | null>(null);
  const [minCantProveedores, setMinCantProveedores] = useState<number | null>(null);
  const [soloConCompra, setSoloConCompra] = useState(false);

  // Modal "Nueva cotización": permite crear una cotización fresca eligiendo
  // material + proveedor + precio + fecha desde un único formulario, sin
  // depender de que la celda esté visible en la matriz. Útil cuando el
  // material todavía no aparece (no tiene OC previa ni cotización registrada).
  const [nuevaCotOpen, setNuevaCotOpen] = useState(false);
  const [nuevaCotForm] = Form.useForm<{
    material_id: number;
    proveedor_id: number;
    precio_unitario: number;
    moneda_codigo: string;
    fecha: Dayjs;
    observaciones?: string;
  }>();
  const [matOptions, setMatOptions] = useState<Array<{ value: number; label: string }>>([]);
  const [matSearch, setMatSearch] = useState("");
  const [matLoading, setMatLoading] = useState(false);
  const [savingNuevaCot, setSavingNuevaCot] = useState(false);

  // Búsqueda incremental de materiales (debounce 250ms). Cada query trae los
  // 30 más relevantes por code/np/descripción.
  useEffect(() => {
    if (!nuevaCotOpen) return;
    const q = matSearch.trim();
    if (!q) { setMatOptions([]); return; }
    const t = setTimeout(async () => {
      setMatLoading(true);
      try {
        const res = await fetch(`/api/materiales?limit=30&search=${encodeURIComponent(q)}`);
        if (res.ok) {
          const j = await res.json();
          type MatBrief = { material_id: number; codigo: string | null; np: string | null; descripcion: string | null };
          const opts = (j.data as MatBrief[]).map((m) => ({
            value: m.material_id,
            label: `${m.codigo ?? "—"} · ${m.np ?? "—"} · ${m.descripcion ?? ""}`.trim(),
          }));
          setMatOptions(opts);
        }
      } finally { setMatLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [matSearch, nuevaCotOpen]);

  const abrirNuevaCot = () => {
    nuevaCotForm.resetFields();
    nuevaCotForm.setFieldsValue({ fecha: dayjs(), moneda_codigo: "USD" });
    setMatOptions([]); setMatSearch("");
    setNuevaCotOpen(true);
  };

  const guardarNuevaCot = async () => {
    try {
      const v = await nuevaCotForm.validateFields();
      setSavingNuevaCot(true);
      const res = await fetch("/api/compras/cotizaciones", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          material_id: v.material_id,
          proveedor_id: v.proveedor_id,
          precio_unitario: v.precio_unitario,
          moneda_codigo: v.moneda_codigo || "USD",
          observaciones: v.observaciones || null,
          usuario: "Logistica",
          fecha: v.fecha.format("YYYY-MM-DD"),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Error");
      message.success(j.message || "Cotización creada");
      setNuevaCotOpen(false);
      fetchData();
    } catch (e) {
      if (e instanceof Error) message.error(e.message);
    } finally { setSavingNuevaCot(false); }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/compras/historico");
      if (res.ok) {
        const j = await res.json();
        setMateriales(j.materiales ?? []);
        setProveedores(j.proveedores ?? []);
        setStats(j.stats ?? { materiales: 0, proveedores: 0, cotizaciones: 0 });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Opciones únicas de marca calculadas desde los datos cargados.
  const marcasOpts = useMemo(() => {
    const set = new Set<string>();
    materiales.forEach((m) => { if (m.marca) set.add(m.marca); });
    return [...set].sort().map((v) => ({ value: v, label: v }));
  }, [materiales]);

  // Aplica TODOS los filtros del state (búsqueda + multi-selects + numéricos).
  // Esto define el dataSource del Table; los filtros de columna van por encima.
  const filtradas = useMemo(() => {
    let rows = materiales;

    // Búsqueda libre
    const q = busqueda.trim().toLowerCase();
    if (q) rows = rows.filter((m) =>
      (m.codigo || "").toLowerCase().includes(q) ||
      (m.np || "").toLowerCase().includes(q) ||
      (m.descripcion || "").toLowerCase().includes(q) ||
      (m.marca || "").toLowerCase().includes(q));

    // Marca (multi)
    if (filtroMarcas.length > 0) {
      const set = new Set(filtroMarcas);
      rows = rows.filter((m) => m.marca != null && set.has(m.marca));
    }

    // Proveedor con cotización (multi) — material tiene precio cargado de
    // al menos uno de los proveedores seleccionados.
    if (filtroProvCotiz.length > 0) {
      rows = rows.filter((m) =>
        filtroProvCotiz.some((pid) => m.precios[String(pid)] != null));
    }

    // Proveedor ganador (multi) — el ganador actual es uno de los seleccionados.
    if (filtroProvGanador.length > 0) {
      const set = new Set(filtroProvGanador);
      rows = rows.filter((m) => m.proveedor_ganador_id != null && set.has(m.proveedor_ganador_id));
    }

    // Estado de cotización
    if (filtroEstadoCot !== "todos") {
      rows = rows.filter((m) => {
        const tieneAlgo = m.precio_minimo != null;
        const celdas = Object.values(m.precios);
        const tieneManual = celdas.some((c) => c?.origen === "cotizacion");
        const tieneOC = celdas.some((c) => c?.origen === "oc");
        if (filtroEstadoCot === "sin") return !tieneAlgo;
        if (filtroEstadoCot === "manual") return tieneManual;
        if (filtroEstadoCot === "oc") return tieneOC;
        return true;
      });
    }

    // Rango de precio mínimo
    if (precioMin != null) rows = rows.filter((m) => m.precio_minimo != null && m.precio_minimo >= precioMin);
    if (precioMax != null) rows = rows.filter((m) => m.precio_minimo != null && m.precio_minimo <= precioMax);

    // Cantidad mínima de proveedores con cotización (≥ N).
    if (minCantProveedores != null && minCantProveedores > 0) {
      rows = rows.filter((m) => {
        const cant = Object.values(m.precios).filter((c) => c != null).length;
        return cant >= minCantProveedores;
      });
    }

    // Solo con compra reciente
    if (soloConCompra) rows = rows.filter((m) => m.ultima_compra_precio != null);

    return rows;
  }, [materiales, busqueda, filtroMarcas, filtroProvCotiz, filtroProvGanador, filtroEstadoCot, precioMin, precioMax, minCantProveedores, soloConCompra]);

  // Reset vistaActual cuando cambian datos o filtros: el Table reaplicará
  // sus filtros de columna sobre el nuevo dataset y avisará vía onChange.
  useEffect(() => { setVistaActual(null); }, [filtradas]);

  // Resetea TODOS los filtros (botón "Limpiar").
  const limpiarFiltros = () => {
    setBusqueda("");
    setFiltroMarcas([]);
    setFiltroProvCotiz([]);
    setFiltroProvGanador([]);
    setFiltroEstadoCot("todos");
    setPrecioMin(null);
    setPrecioMax(null);
    setMinCantProveedores(null);
    setSoloConCompra(false);
  };

  // Cuántos filtros hay activos (para el badge del botón "Limpiar").
  const cantFiltrosActivos =
    (busqueda ? 1 : 0) +
    (filtroMarcas.length > 0 ? 1 : 0) +
    (filtroProvCotiz.length > 0 ? 1 : 0) +
    (filtroProvGanador.length > 0 ? 1 : 0) +
    (filtroEstadoCot !== "todos" ? 1 : 0) +
    (precioMin != null ? 1 : 0) +
    (precioMax != null ? 1 : 0) +
    (minCantProveedores != null && minCantProveedores > 0 ? 1 : 0) +
    (soloConCompra ? 1 : 0);

  const guardarCotizacion = async (matId: number, provId: number, precio: number | null) => {
    try {
      const res = await fetch("/api/compras/cotizaciones", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          material_id: matId, proveedor_id: provId,
          precio_unitario: precio ?? 0, usuario: "Logistica",
          fecha: editFecha.format("YYYY-MM-DD"),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Error");
      message.success(j.message || "Cotización guardada");
      setEditando(null); setEditValor(null); setEditFecha(dayjs());
      fetchData();
    } catch (e) {
      if (e instanceof Error) message.error(e.message);
    }
  };

  const fmt = (n: number | null | undefined) =>
    n == null ? "—" : n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Descarga la matriz visible en Excel respetando filtros (búsqueda + filtros de columna).
  // Genera 2 hojas:
  //  - "Matriz": una fila por material, con un PU por proveedor (igual a lo que ve en pantalla)
  //  - "Cotizaciones (long)": una fila por (material, proveedor) — pivoteable en Excel
  const exportarExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      // Fuente: filas que pasan filtros de columna del Table (o filtradas por búsqueda si todavía no se interactuó).
      const dataset = vistaActual ?? filtradas;
      if (dataset.length === 0) {
        message.warning("No hay datos para exportar con los filtros actuales.");
        return;
      }

      // ── Hoja 1: matriz (1 fila por material, 1 columna por proveedor) ──
      const matriz = dataset.map((m) => {
        const row: Record<string, unknown> = {
          "Código": m.codigo ?? "",
          "N° Parte": m.np ?? "",
          "Descripción": m.descripcion ?? "",
          "Marca": m.marca ?? "",
        };
        for (const p of proveedores) {
          const c = m.precios[String(p.id)];
          row[`PU ${p.nombre}`] = c?.precio ?? null;
        }
        row["Precio mínimo"] = m.precio_minimo ?? null;
        row["Proveedor ganador"] = m.proveedor_ganador ?? "";
        row["Últ. compra ($)"] = m.ultima_compra_precio ?? null;
        row["Últ. compra (fecha)"] = m.ultima_compra_fecha
          ? new Date(m.ultima_compra_fecha).toLocaleDateString("es-PE")
          : "";
        row["Últ. compra (proveedor)"] = m.ultima_compra_prov ?? "";
        return row;
      });

      // ── Hoja 2: formato long — pivoteable ──
      const long: Array<Record<string, unknown>> = [];
      for (const m of dataset) {
        for (const p of proveedores) {
          const c = m.precios[String(p.id)];
          if (!c) continue;
          long.push({
            "Código": m.codigo ?? "",
            "N° Parte": m.np ?? "",
            "Descripción": m.descripcion ?? "",
            "Marca": m.marca ?? "",
            "Proveedor": p.nombre,
            "Precio ($)": c.precio,
            "Moneda": c.moneda,
            "Origen": c.origen === "cotizacion" ? "Cotización manual" : "Precio de OC",
            "Fecha": c.fecha ? new Date(c.fecha).toLocaleDateString("es-PE") : "",
            "Es ganador": m.proveedor_ganador_id === p.id ? "Sí" : "",
          });
        }
      }

      const wb = XLSX.utils.book_new();
      const wsMatriz = XLSX.utils.json_to_sheet(matriz);
      const wsLong = XLSX.utils.json_to_sheet(long);
      XLSX.utils.book_append_sheet(wb, wsMatriz, "Matriz");
      XLSX.utils.book_append_sheet(wb, wsLong, "Cotizaciones (long)");
      const stamp = dayjs().format("YYYYMMDD-HHmm");
      XLSX.writeFile(wb, `Cotizaciones-${stamp}.xlsx`);
      message.success(`Excel descargado (${dataset.length} repuestos · ${long.length} cotizaciones)`);
    } catch (e) {
      console.error(e);
      message.error("Error al generar el Excel");
    }
  };

  // Columnas de identificación (fijas a la izquierda)
  const infoCols: ColumnsType<MatRow> = [
    {
      key: "codigo", title: "Código", dataIndex: "codigo", width: 130, align: "left",
      sorter: (a, b) => (a.codigo || "").localeCompare(b.codigo || ""),
      ...filtroPorColumna(filtradas, "codigo"),
      render: (v: string | null) => <Text strong style={{ fontSize: 11, color: brand.navy }}>{v ?? "—"}</Text>,
    },
    {
      key: "np", title: "N° Parte", dataIndex: "np", width: 130, align: "left",
      sorter: (a, b) => (a.np || "").localeCompare(b.np || ""),
      ...filtroPorColumna(filtradas, "np"),
      render: (v: string | null) => <span style={{ fontSize: 11 }}>{v ?? "—"}</span>,
    },
    {
      key: "descripcion", title: "Descripción", dataIndex: "descripcion", width: 240, align: "left", ellipsis: true,
      sorter: (a, b) => (a.descripcion || "").localeCompare(b.descripcion || ""),
      ...filtroPorColumna(filtradas, "descripcion"),
    },
    {
      key: "marca", title: "Marca", dataIndex: "marca", width: 90, align: "center",
      ...filtroPorColumna(filtradas, "marca"),
      render: (v: string | null) => v ? <Tag>{v}</Tag> : <Text type="secondary">—</Text>,
    },
  ];

  // Grupo: precio unitario por proveedor (dinámico, editable)
  const provGroup: ColumnGroupType<MatRow> = {
    key: "proveedores",
    title: <span style={{ fontWeight: 700 }}>PRECIO UNITARIO POR PROVEEDOR ($)</span>,
    children: proveedores.map((p): ColumnType<MatRow> => ({
      key: `prov-${p.id}`,
      title: <Tooltip title={p.nombre}><span style={{ fontSize: 11 }}>PU {p.nombre}</span></Tooltip>,
      width: 110,
      align: "right",
      render: (_v: unknown, r: MatRow) => {
        const c = r.precios[String(p.id)];
        const enEdit = editando?.matId === r.material_id && editando?.provId === p.id;
        if (enEdit) {
          return (
            <Space orientation="vertical" size={2} style={{ width: "100%" }}>
              <Space size={2}>
                <InputNumber
                  size="small" autoFocus value={editValor} min={0} step={0.01}
                  style={{ width: 80 }}
                  onChange={(v) => setEditValor(v == null ? null : Number(v))}
                  onPressEnter={() => guardarCotizacion(r.material_id, p.id, editValor)}
                />
                <Button size="small" type="primary" onClick={() => guardarCotizacion(r.material_id, p.id, editValor)}>OK</Button>
              </Space>
              <DatePicker
                size="small"
                value={editFecha}
                format="DD/MM/YY"
                onChange={(d) => setEditFecha(d ?? dayjs())}
                allowClear={false}
                style={{ width: 110 }}
              />
            </Space>
          );
        }
        const esGanador = r.proveedor_ganador_id === p.id;
        const fechaCorta = c?.fecha
          ? new Date(c.fecha).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "2-digit" })
          : null;
        return (
          <div
            style={{
              cursor: "pointer", padding: "2px 4px", borderRadius: 3,
              background: esGanador ? "#d9f7be" : c?.origen === "cotizacion" ? "#fff7e6" : undefined,
              fontWeight: esGanador ? 700 : 400,
              lineHeight: 1.15,
            }}
            title={c ? `${c.origen === "cotizacion" ? "Cotización manual" : "Precio de OC"}${c.fecha ? " · " + new Date(c.fecha).toLocaleDateString("es-PE") : ""} — click para editar` : "Sin precio — click para cotizar"}
            onClick={() => {
              setEditando({ matId: r.material_id, provId: p.id });
              setEditValor(c?.precio ?? null);
              setEditFecha(c?.fecha ? dayjs(c.fecha) : dayjs());
            }}
          >
            <div>
              {c ? `$ ${fmt(c.precio)}` : <span style={{ color: "#bbb" }}>+ cotizar</span>}
              {c?.origen === "cotizacion" && <EditOutlined style={{ fontSize: 9, marginLeft: 3, color: "#fa8c16" }} />}
            </div>
            {fechaCorta && (
              <div style={{ fontSize: 9, color: "#888", textAlign: "right" }}>{fechaCorta}</div>
            )}
          </div>
        );
      },
    })),
  };

  // Mejor oferta + histórico
  const ofertaCols: ColumnsType<MatRow> = [
    {
      key: "precio_minimo", title: "Precio mínimo", width: 110, align: "right", fixed: "right",
      sorter: (a, b) => (a.precio_minimo ?? Infinity) - (b.precio_minimo ?? Infinity),
      render: (_v, r) => <b style={{ color: "#389e0d" }}>{r.precio_minimo != null ? `$ ${fmt(r.precio_minimo)}` : "—"}</b>,
    },
    {
      key: "proveedor_ganador", title: "Proveedor ganador", dataIndex: "proveedor_ganador", width: 150, align: "center", fixed: "right",
      render: (v: string | null) => v ? <Tag color="green">{v}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      key: "ultima_compra", title: "Últ. compra", width: 130, align: "right", fixed: "right",
      render: (_v, r) => r.ultima_compra_precio != null ? (
        <Tooltip title={`${r.ultima_compra_prov ?? ""}${r.ultima_compra_fecha ? " · " + new Date(r.ultima_compra_fecha).toLocaleDateString("es-PE") : ""}`}>
          <div style={{ lineHeight: 1.15 }}>
            <b style={{ color: brand.navy }}>$ {fmt(r.ultima_compra_precio)}</b>
            {r.ultima_compra_fecha && (
              <div style={{ fontSize: 9, color: "#888" }}>
                {new Date(r.ultima_compra_fecha).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "2-digit" })}
              </div>
            )}
          </div>
        </Tooltip>
      ) : <Text type="secondary">—</Text>,
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <Title level={4} style={{ margin: 0, color: brand.navy }}>
          <FileSearchOutlined style={{ marginRight: 8 }} />
          Listado de Repuestos — Precios Unitarios por Proveedor
        </Title>
        <Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={abrirNuevaCot}
            style={{ background: brand.navy, borderColor: brand.navy }}
          >
            Nueva cotización
          </Button>
          <Tooltip title="Descarga lo que está visible en la tabla — respeta búsqueda y filtros de columna">
            <Button
              icon={<FileExcelOutlined />}
              onClick={exportarExcel}
              style={{ background: "#1d6f42", color: brand.white, borderColor: "#1d6f42" }}
            >
              Descargar Excel
            </Button>
          </Tooltip>
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>Refrescar</Button>
        </Space>
      </div>
      <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
        Matriz de precios. Cada celda muestra el precio de OC real o tu cotización manual (override). Hacé click en una celda para cotizar/editar — soporta cualquier número de proveedores. El proveedor con el menor precio se resalta en verde.
      </Text>

      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col xs={12} sm={8}><Card size="small"><Statistic title="Materiales" value={stats.materiales} styles={{ content: { color: brand.navy, fontSize: 22 } }} /></Card></Col>
        <Col xs={12} sm={8}><Card size="small"><Statistic title="Proveedores" value={stats.proveedores} styles={{ content: { color: brand.cyan, fontSize: 22 } }} /></Card></Col>
        <Col xs={12} sm={8}><Card size="small"><Statistic title="Cotizaciones manuales" value={stats.cotizaciones} styles={{ content: { color: "#fa8c16", fontSize: 22 } }} /></Card></Col>
      </Row>

      <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: 10 } }}>
        <Space orientation="vertical" size={8} style={{ width: "100%" }}>
          {/* Fila 1: búsqueda + columnas + leyenda */}
          <Space wrap>
            <Input
              placeholder="Buscar código, N° parte, descripción, marca…"
              prefix={<SearchOutlined />} allowClear
              value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              style={{ width: 360, maxWidth: "100%" }}
            />
            <ColumnasToggleButton<MatRow>
              columns={infoCols}
              ocultas={ocultas}
              setOcultas={setOcultas}
              obligatorias={["codigo", "descripcion"]}
            />
            <Badge count={cantFiltrosActivos} size="small" offset={[-4, 4]}>
              <Button
                icon={<ClearOutlined />}
                onClick={limpiarFiltros}
                disabled={cantFiltrosActivos === 0}
              >
                Limpiar filtros
              </Button>
            </Badge>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {filtradas.length} de {materiales.length} materiales
            </Text>
            <Tag color="green">Verde = mejor precio</Tag>
            <Tag color="orange">Naranja = cotización manual</Tag>
          </Space>

          {/* Fila 2: filtros categóricos */}
          <Space wrap>
            <Select
              mode="multiple"
              allowClear
              placeholder="Marca"
              value={filtroMarcas}
              onChange={setFiltroMarcas}
              options={marcasOpts}
              style={{ minWidth: 180 }}
              maxTagCount="responsive"
            />
            <Select
              mode="multiple"
              allowClear
              placeholder="Con cotización de proveedor…"
              value={filtroProvCotiz}
              onChange={setFiltroProvCotiz}
              options={proveedores.map((p) => ({ value: p.id, label: p.nombre }))}
              style={{ minWidth: 220 }}
              maxTagCount="responsive"
              optionFilterProp="label"
              showSearch
            />
            <Select
              mode="multiple"
              allowClear
              placeholder="Proveedor ganador…"
              value={filtroProvGanador}
              onChange={setFiltroProvGanador}
              options={proveedores.map((p) => ({ value: p.id, label: p.nombre }))}
              style={{ minWidth: 200 }}
              maxTagCount="responsive"
              optionFilterProp="label"
              showSearch
            />
            <Tooltip title="Filtra por estado del precio: ninguno / al menos una manual / al menos uno de OC / sin precio">
              <Segmented
                value={filtroEstadoCot}
                onChange={(v) => setFiltroEstadoCot(v as typeof filtroEstadoCot)}
                options={[
                  { value: "todos", label: "Todos" },
                  { value: "manual", label: "Con cotiz. manual" },
                  { value: "oc", label: "Con precio de OC" },
                  { value: "sin", label: "Sin precio" },
                ]}
                size="small"
              />
            </Tooltip>
          </Space>

          {/* Fila 3: filtros numéricos */}
          <Space wrap>
            <span style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>Precio mínimo:</span>
            <InputNumber
              placeholder="Min $"
              value={precioMin}
              onChange={(v) => setPrecioMin(v == null ? null : Number(v))}
              min={0}
              step={1}
              style={{ width: 110 }}
            />
            <InputNumber
              placeholder="Max $"
              value={precioMax}
              onChange={(v) => setPrecioMax(v == null ? null : Number(v))}
              min={0}
              step={1}
              style={{ width: 110 }}
            />
            <span style={{ fontSize: 12, color: "rgba(0,0,0,0.55)", marginLeft: 8 }}>≥</span>
            <InputNumber
              placeholder="N proveedores"
              value={minCantProveedores}
              onChange={(v) => setMinCantProveedores(v == null ? null : Number(v))}
              min={0}
              max={proveedores.length}
              style={{ width: 130 }}
            />
            <Tooltip title="Solo materiales con al menos una OC ya ingresada (la columna Últ. compra tiene valor)">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
                <Switch checked={soloConCompra} onChange={setSoloConCompra} size="small" />
                <span style={{ fontSize: 12 }}>Solo con última compra</span>
              </span>
            </Tooltip>
          </Space>
        </Space>
      </Card>

      {filtradas.length === 0 && !loading ? (
        <Empty description="No hay materiales con precios registrados." />
      ) : (
        <TablaHistorico
          columns={[...visibleColumns(infoCols, ocultas), provGroup, ...ofertaCols] as ColumnsType<MatRow>}
          data={filtradas}
          loading={loading}
          page={page}
          pageSize={pageSize}
          onPageChange={(p, s) => { setPage(p); setPageSize(s); }}
          onFilteredChange={setVistaActual}
        />
      )}

      <Modal
        title={<Space><PlusOutlined style={{ color: brand.navy }} /><span>Nueva cotización</span></Space>}
        open={nuevaCotOpen}
        onCancel={() => setNuevaCotOpen(false)}
        onOk={guardarNuevaCot}
        confirmLoading={savingNuevaCot}
        okText="Guardar cotización"
        cancelText="Cancelar"
        destroyOnHidden
        width={560}
      >
        <Text type="secondary" style={{ display: "block", marginBottom: 12, fontSize: 12 }}>
          Crea una cotización manual: elegí material, proveedor y precio. Aparecerá luego en la matriz como override (naranja).
        </Text>
        <Form form={nuevaCotForm} layout="vertical" preserve={false}>
          <Form.Item
            name="material_id"
            label="Material"
            rules={[{ required: true, message: "Elegí un material" }]}
          >
            <Select
              showSearch
              placeholder="Buscá por código, N° parte o descripción…"
              filterOption={false}
              onSearch={setMatSearch}
              notFoundContent={matLoading ? "Buscando…" : matSearch ? "Sin resultados" : "Escribí para buscar"}
              options={matOptions}
              loading={matLoading}
            />
          </Form.Item>
          <Form.Item
            name="proveedor_id"
            label="Proveedor"
            rules={[{ required: true, message: "Elegí un proveedor" }]}
          >
            <Select
              showSearch
              placeholder="Elegí proveedor"
              optionFilterProp="label"
              options={proveedores.map((p) => ({ value: p.id, label: p.nombre }))}
            />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="precio_unitario"
                label="Precio unitario"
                rules={[{ required: true, message: "Precio requerido" }]}
              >
                <InputNumber min={0} step={0.01} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="moneda_codigo" label="Moneda" initialValue="USD">
                <Select options={[
                  { value: "USD", label: "USD" },
                  { value: "PEN", label: "PEN" },
                  { value: "EUR", label: "EUR" },
                ]} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}>
                <DatePicker format="DD/MM/YY" style={{ width: "100%" }} allowClear={false} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="observaciones" label="Observaciones (opcional)">
            <Input.TextArea rows={2} maxLength={300} showCount placeholder="Notas internas" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function TablaHistorico({
  columns, data, loading, page, pageSize, onPageChange, onFilteredChange,
}: {
  columns: ColumnsType<MatRow>;
  data: MatRow[];
  loading: boolean;
  page: number;
  pageSize: number;
  onPageChange: (p: number, s: number) => void;
  onFilteredChange: (rows: MatRow[]) => void;
}) {
  const { columnas, components, TableDragWrapper } = useColumnasRedimensionables<MatRow>(
    columns, "compras-historico-v1",
  );
  return (
    <TableDragWrapper>
      <Table<MatRow>
        rowKey="material_id"
        size="small"
        bordered
        columns={columnas}
        components={components}
        dataSource={data}
        loading={loading}
        sticky={STICKY_HEADER}
        scroll={{ x: "max-content", y: "calc(100vh - 360px)" }}
        pagination={paginacionEstandar({
          current: page,
          pageSize,
          total: data.length,
          onChange: onPageChange,
          label: "repuestos",
        })}
        onChange={(_pagination, _filters, _sorter, extra) => {
          onFilteredChange(extra.currentDataSource);
        }}
      />
    </TableDragWrapper>
  );
}
