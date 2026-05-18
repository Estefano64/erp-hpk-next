"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Typography,
  Tabs,
  Table,
  Button,
  Input,
  Select,
  Tag,
  Row,
  Col,
  Card,
  Space,
  App,
  Statistic,
  Modal,
  Form,
  InputNumber,
  DatePicker,
  Popover,
  Divider,
  Alert,
  Tooltip,
  Upload,
  Checkbox,
} from "antd";
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  ToolOutlined,
  DatabaseOutlined,
  InboxOutlined,
  ExportOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  FileDoneOutlined,
  InfoCircleOutlined,
  SwapOutlined,
  FileExcelOutlined,
  UploadOutlined,
  DownloadOutlined,
  DeleteOutlined,
  PaperClipOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import {
  numeracionColumn,
  useColumnasOcultas,
  ColumnasToggleButton,
  visibleColumns,
  filtroPorColumna,
  useRangoFechas,
  RangoFechasFiltro,
  dentroDeRango,
  useColumnasRedimensionables,
} from "@/lib/tables";
import { brand } from "@/lib/theme";
import dayjs, { Dayjs } from "dayjs";

import { formatDateOnly } from "@/lib/dates";
const { Title, Text } = Typography;
const { TextArea } = Input;

interface Movimiento {
  id: number;
  material_id: number;
  material_codigo: string | null;
  material_nombre: string | null;
  unidad_medida: string | null;
  stock_actual: number | null;
  tipo_movimiento: "ENTRADA" | "SALIDA" | "AJUSTE";
  cantidad: number;
  documento_referencia: string | null;
  observacion: string | null;
  usuario: string;
  fecha_movimiento: string;
}

interface StockItem {
  material_id: number;
  codigo: string;
  descripcion: string;
  np: string | null;
  stock_actual: number;
  punto_reposicion: number;
  stock_maximo: number;
  unidad_medida: string | null;
  ubicacion: string | null;
  caja: string | null;
  precio: number | null;
  moneda: string | null;
  fabricante: string | null;
  categoria: string | null;
  clasificacion: string | null;
  valor_total: number;
  alerta: "OK" | "BAJO" | "SIN" | "EXCESO";
  cantidad_en_po: number;
  pos_pendientes: string[];
  cantidad_en_req: number;
  reqs_pendientes: string[];
  almacen: string | null;
  stock_proyectado: number;
  por_solicitar: number;
}

interface StockKPIs {
  totalMateriales: number;
  sinStock: number;
  bajoStock: number;
  exceso: number;
  enPO: number;
  enReq: number;
  porSolicitar: number;
  valorTotal: number;
}

interface POPendiente {
  id: number;
  numero_po: string;
  proveedor_nombre: string | null;
  almacen_nombre: string | null;
  fecha_solicitud: string;
  fecha_entrega_esperada: string | null;
  estado: string;
  total: number;
  moneda: string;
  observaciones: string | null;
  nro_guia: string | null;
  nro_factura: string | null;
  guia_archivo: string | null;
  guia_nombre: string | null;
  factura_archivo: string | null;
  factura_nombre: string | null;
  items: Array<{
    id: number;
    material_id: number;
    codigo: string | null;
    descripcion: string | null;
    unidad_medida: string;
    cantidad: number;
    precio_unitario: number | null;
  }>;
}

const tipoColor: Record<string, string> = {
  ENTRADA: "green",
  SALIDA: "red",
  AJUSTE: "blue",
};

const alertaColor: Record<string, string> = {
  OK: "green",
  BAJO: "orange",
  SIN: "red",
  EXCESO: "purple",
};

// ════════════════════════════════════════════════════════════
// TAB 1: MOVIMIENTOS (historial)
// ════════════════════════════════════════════════════════════
function TabMovimientos({ onRefresh }: { onRefresh: () => void }) {
  const { message } = App.useApp();
  const [data, setData] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(false);
  const [tipo, setTipo] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [desde, setDesde] = useState<Dayjs | null>(null);
  const [hasta, setHasta] = useState<Dayjs | null>(null);
  const { ocultas, setOcultas } = useColumnasOcultas("movimientos-historial-cols-v1");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tipo) params.set("tipo", tipo);
      if (desde) params.set("desde", desde.format("YYYY-MM-DD"));
      if (hasta) params.set("hasta", hasta.format("YYYY-MM-DD"));
      const res = await fetch(`/api/movimientos?${params}`);
      const json = await res.json();
      setData(json.data ?? []);
    } catch {
      message.error("Error al cargar movimientos");
    } finally {
      setLoading(false);
    }
  }, [tipo, desde, hasta, message]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = data.filter((m) => {
    if (!search) return true;
    const lc = search.toLowerCase();
    return (
      (m.material_codigo || "").toLowerCase().includes(lc) ||
      (m.material_nombre || "").toLowerCase().includes(lc) ||
      (m.documento_referencia || "").toLowerCase().includes(lc) ||
      (m.observacion || "").toLowerCase().includes(lc)
    );
  });

  const exportarMovExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const rows = filtered.map((m) => ({
        Fecha: formatDateOnly(m.fecha_movimiento),
        Tipo: m.tipo_movimiento,
        Código: m.material_codigo ?? "",
        Material: m.material_nombre ?? "",
        Cantidad: Number(m.cantidad),
        UM: m.unidad_medida ?? "",
        "Stock Final": m.stock_actual ?? "",
        "Documento Ref.": m.documento_referencia ?? "",
        Usuario: m.usuario,
        Observación: m.observacion ?? "",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Movimientos");
      XLSX.writeFile(wb, `Movimientos-${dayjs().format("YYYYMMDD-HHmm")}.xlsx`);
      message.success("Excel descargado");
    } catch (e) {
      message.error("Error al exportar Excel");
    }
  };

  const columns: ColumnsType<Movimiento> = [
    numeracionColumn<Movimiento>(),
    {
      key: "fecha_movimiento",
      title: "Fecha",
      dataIndex: "fecha_movimiento",
      width: 110,
      sorter: (a, b) => (a.fecha_movimiento || "").localeCompare(b.fecha_movimiento || ""),
      filters: [...new Set(filtered.map((r) => r.fecha_movimiento ? dayjs(r.fecha_movimiento).format("YYYY-MM-DD") : "").filter(Boolean))]
        .sort().map((v) => ({ text: formatDateOnly(v), value: v })),
      filterSearch: true,
      onFilter: (value, r) => (r.fecha_movimiento ? dayjs(r.fecha_movimiento).format("YYYY-MM-DD") : "") === value,
      render: (v: string) => formatDateOnly(v),
    },
    {
      key: "tipo_movimiento",
      title: "Tipo",
      dataIndex: "tipo_movimiento",
      width: 100,
      filters: [
        { text: "ENTRADA", value: "ENTRADA" },
        { text: "SALIDA", value: "SALIDA" },
        { text: "AJUSTE", value: "AJUSTE" },
      ],
      onFilter: (value, r) => r.tipo_movimiento === value,
      render: (v: string) => (
        <Tag color={tipoColor[v] || "default"} icon={v === "ENTRADA" ? <ArrowDownOutlined /> : v === "SALIDA" ? <ArrowUpOutlined /> : <SwapOutlined />}>
          {v}
        </Tag>
      ),
    },
    { key: "material_codigo", title: "Código", dataIndex: "material_codigo", width: 110, ...filtroPorColumna(filtered, "material_codigo") },
    {
      key: "material_nombre",
      title: "Material",
      dataIndex: "material_nombre",
      width: 280,
      ellipsis: true,
      ...filtroPorColumna(filtered, "material_nombre"),
    },
    {
      key: "cantidad",
      title: "Cantidad",
      dataIndex: "cantidad",
      width: 110,
      align: "right",
      sorter: (a, b) => Number(a.cantidad) - Number(b.cantidad),
      filters: [...new Set(filtered.map((r) => Number(r.cantidad)))]
        .sort((a, b) => a - b).map((v) => ({ text: String(v), value: String(v) })),
      filterSearch: true,
      onFilter: (value, r) => String(Number(r.cantidad)) === value,
      render: (v: number, r: Movimiento) => (
        <span style={{ fontWeight: 600, color: r.tipo_movimiento === "SALIDA" ? "#cf1322" : "#389e0d" }}>
          {r.tipo_movimiento === "SALIDA" ? "-" : "+"}
          {Number(v).toLocaleString("en", { maximumFractionDigits: 2 })}{" "}
          {r.unidad_medida}
        </span>
      ),
    },
    {
      key: "stock_actual",
      title: "Stock Final",
      dataIndex: "stock_actual",
      width: 110,
      align: "right",
      sorter: (a, b) => Number(a.stock_actual ?? 0) - Number(b.stock_actual ?? 0),
      filters: [...new Set(filtered.map((r) => r.stock_actual).filter((v): v is number => v != null))]
        .sort((a, b) => a - b).map((v) => ({ text: String(v), value: String(v) })),
      filterSearch: true,
      onFilter: (value, r) => String(r.stock_actual ?? "") === value,
      render: (v: number | null) => (v != null ? Number(v).toLocaleString() : "-"),
    },
    { key: "documento_referencia", title: "Documento Ref.", dataIndex: "documento_referencia", width: 150, ...filtroPorColumna(filtered, "documento_referencia") },
    { key: "usuario", title: "Usuario", dataIndex: "usuario", width: 110, ...filtroPorColumna(filtered, "usuario") },
    {
      key: "observacion",
      title: "Observación",
      dataIndex: "observacion",
      ellipsis: true,
      ...filtroPorColumna(filtered, "observacion"),
    },
  ];

  const { columnas: columnsResizable, components: tableComponents, resetAnchos, TableDragWrapper } =
    useColumnasRedimensionables<Movimiento>(columns, "movimientos-list-cols-widths-v1");

  return (
    <div>
      <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 12 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={8} md={5}>
            <Input
              placeholder="Buscar material..."
              prefix={<SearchOutlined />}
              allowClear
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              placeholder="Tipo"
              allowClear
              style={{ width: "100%" }}
              value={tipo}
              onChange={setTipo}
              options={[
                { value: "ENTRADA", label: "Entrada" },
                { value: "SALIDA", label: "Salida" },
                { value: "AJUSTE", label: "Ajuste" },
              ]}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <DatePicker placeholder="Desde" value={desde} onChange={setDesde} style={{ width: "100%" }} format="DD/MM/YYYY" />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <DatePicker placeholder="Hasta" value={hasta} onChange={setHasta} style={{ width: "100%" }} format="DD/MM/YYYY" />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Button icon={<ReloadOutlined />} onClick={fetchData} block>
              Actualizar
            </Button>
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Button
              icon={<FileExcelOutlined />}
              onClick={exportarMovExcel}
              block
              style={{ background: "#1d6f42", color: "#fff", borderColor: "#1d6f42" }}
            >
              Descargar Excel
            </Button>
          </Col>
        </Row>
      </Card>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <ColumnasToggleButton<Movimiento>
          columns={columns}
          ocultas={ocultas}
          setOcultas={setOcultas}
          obligatorias={["__num", "fecha_movimiento", "tipo_movimiento"]}
        />
        <Button onClick={resetAnchos}>Restablecer anchos</Button>
      </div>

      <TableDragWrapper>
              <Table
          rowKey="id"
          columns={visibleColumns(columnsResizable, ocultas)}
          components={tableComponents}
          dataSource={filtered}
          loading={loading}
          pagination={{ pageSize: 25, placement: ["topEnd", "bottomEnd"] }}
          size="small"
          scroll={{ x: 1200 }}
          sticky={{ offsetHeader: 56, offsetScroll: 0 }}
        />
      </TableDragWrapper>
    </div>
  );
}


// ════════════════════════════════════════════════════════════
// TAB 3: INGRESO DE POs (recepción) — vista de tabla plana
// ════════════════════════════════════════════════════════════
interface ItemFila {
  id: number;
  po_id: number;
  numero_po: string;
  proveedor_nombre: string | null;
  almacen_nombre: string | null;
  fecha_entrega_esperada: string | null;
  estado: string;
  observaciones_compra: string | null;
  material_id: number;
  codigo: string | null;
  descripcion: string | null;
  cantidad: number;
  unidad_medida: string;
  precio_unitario: number | null;
  moneda: string;
}

function TabIngresoPO({ onRefresh }: { onRefresh: () => void }) {
  const { message } = App.useApp();
  const [pos, setPos] = useState<POPendiente[]>([]);
  const [loading, setLoading] = useState(false);
  const [poSeleccionada, setPoSeleccionada] = useState<POPendiente | null>(null);
  const [cantidadesRecibidas, setCantidadesRecibidas] = useState<Record<number, number>>({});
  const [nroGuia, setNroGuia] = useState("");
  const [nroFactura, setNroFactura] = useState("");
  const [comentariosRec, setComentariosRec] = useState("");
  const [ubicacionRec, setUbicacionRec] = useState<string | undefined>();
  const [ubicaciones, setUbicaciones] = useState<{ codigo: string; nombre: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [filtroProv, setFiltroProv] = useState<string | undefined>();
  const [filtroEstado, setFiltroEstado] = useState<string | undefined>();
  const { ocultas: ingresoOcultas, setOcultas: setIngresoOcultas } = useColumnasOcultas("movimientos-ingreso-cols-v1");
  const { rango: rangoEntrega, setRango: setRangoEntrega } = useRangoFechas();

  const fetchPOs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/compras/pendientes-ingreso");
      const json = await res.json();
      setPos(json.data ?? []);
    } catch {
      message.error("Error al cargar POs pendientes");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    fetchPOs();
  }, [fetchPOs]);

  useEffect(() => {
    fetch("/api/almacenes")
      .then((r) => r.ok ? r.json() : { data: [] })
      .then((j) => setUbicaciones((j.data ?? []).map((u: { codigo: string; nombre: string }) => ({ codigo: u.codigo, nombre: u.nombre }))))
      .catch(() => { /* ignore */ });
  }, []);

  // Aplanar todos los items de todas las POs
  const filasAplanadas: ItemFila[] = pos.flatMap((po) =>
    po.items.map((i) => ({
      id: i.id,
      po_id: po.id,
      numero_po: po.numero_po,
      proveedor_nombre: po.proveedor_nombre,
      almacen_nombre: po.almacen_nombre,
      fecha_entrega_esperada: po.fecha_entrega_esperada,
      estado: po.estado,
      observaciones_compra: (po as POPendiente & { observaciones?: string | null }).observaciones ?? null,
      material_id: i.material_id,
      codigo: i.codigo,
      descripcion: i.descripcion,
      cantidad: Number(i.cantidad),
      unidad_medida: i.unidad_medida,
      precio_unitario: i.precio_unitario != null ? Number(i.precio_unitario) : null,
      moneda: po.moneda,
    }))
  );

  const filasFiltradas = filasAplanadas.filter((r) => {
    if (filtroProv && r.proveedor_nombre !== filtroProv) return false;
    if (filtroEstado && r.estado !== filtroEstado) return false;
    if (search) {
      const lc = search.toLowerCase();
      return (
        (r.codigo || "").toLowerCase().includes(lc) ||
        (r.descripcion || "").toLowerCase().includes(lc) ||
        r.numero_po.toLowerCase().includes(lc) ||
        (r.proveedor_nombre || "").toLowerCase().includes(lc)
      );
    }
    return true;
  });

  const proveedoresUnicos = [...new Set(pos.map((p) => p.proveedor_nombre).filter(Boolean) as string[])];
  const estadosUnicos = [...new Set(pos.map((p) => p.estado))];

  const abrirRecibir = (po_id: number) => {
    const po = pos.find((p) => p.id === po_id);
    if (!po) return;
    setPoSeleccionada(po);
    const inicial: Record<number, number> = {};
    po.items.forEach((i) => { inicial[i.id] = i.cantidad; });
    setCantidadesRecibidas(inicial);
    setNroGuia("");
    setNroFactura("");
    setComentariosRec("");
    setUbicacionRec(undefined);
  };

  const confirmarIngreso = async () => {
    if (!poSeleccionada) return;
    const items = poSeleccionada.items
      .filter((i) => cantidadesRecibidas[i.id] > 0)
      .map((i) => ({
        material_id: i.material_id,
        cantidad: cantidadesRecibidas[i.id],
      }));

    if (items.length === 0) {
      message.warning("Ingresa al menos una cantidad");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/movimientos/ingreso-po", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          po_id: poSeleccionada.id,
          items,
          usuario: "Almacenero",
          nro_guia: nroGuia || undefined,
          nro_factura: nroFactura || undefined,
          comentarios: comentariosRec || undefined,
          ubicacion_codigo: ubicacionRec || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al registrar ingreso");
      message.success(json.message);
      setPoSeleccionada(null);
      await fetchPOs();
      onRefresh();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(false);
    }
  };

  // Total resumen
  const totalPOsPendientes = pos.length;
  const totalItemsPendientes = filasAplanadas.length;
  const valorTotalPendiente = pos.reduce((s, p) => s + Number(p.total || 0), 0);

  const columnasItems: ColumnsType<ItemFila> = [
    {
      key: "numero_po",
      title: "OC",
      dataIndex: "numero_po",
      width: 110,
      fixed: "left",
      render: (v: string) => <Tag color={brand.navy}>{v}</Tag>,
      filters: [...new Set(filasAplanadas.map((r) => r.numero_po))].sort().map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, r) => r.numero_po === value,
    },
    {
      key: "estado",
      title: "Estado",
      dataIndex: "estado",
      width: 100,
      filters: estadosUnicos.map((v) => ({ text: v, value: v })),
      onFilter: (value, r) => r.estado === value,
      render: (v: string) => (
        <Tag color={v === "Pendiente" ? "gold" : v === "Aprobado" ? "blue" : "cyan"}>{v}</Tag>
      ),
    },
    {
      key: "proveedor_nombre",
      title: "Proveedor",
      dataIndex: "proveedor_nombre",
      width: 180,
      ellipsis: true,
      filters: proveedoresUnicos.map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, r) => r.proveedor_nombre === value,
      render: (v: string | null) => v || "-",
    },
    { key: "codigo", title: "Código", dataIndex: "codigo", width: 110, ...filtroPorColumna(filasAplanadas, "codigo") },
    {
      key: "descripcion",
      title: "Material",
      dataIndex: "descripcion",
      width: 280,
      ellipsis: true,
      ...filtroPorColumna(filasAplanadas, "descripcion"),
      render: (v: string | null, r) => (
        <Tooltip title={r.observaciones_compra ? `Comentarios OC: ${r.observaciones_compra}` : v}>
          <span>{v || "-"}</span>
        </Tooltip>
      ),
    },
    {
      key: "cantidad",
      title: "Cant.",
      dataIndex: "cantidad",
      width: 80,
      align: "right",
      sorter: (a, b) => a.cantidad - b.cantidad,
      render: (v: number, r) => (
        <span>
          <b>{v}</b> <span style={{ color: "#888" }}>{r.unidad_medida}</span>
        </span>
      ),
    },
    {
      key: "precio_unitario",
      title: "P. Unit.",
      dataIndex: "precio_unitario",
      width: 90,
      align: "right",
      sorter: (a, b) => (a.precio_unitario ?? 0) - (b.precio_unitario ?? 0),
      render: (v: number | null, r) => (v != null ? `${r.moneda} ${v.toFixed(2)}` : "-"),
    },
    {
      key: "subtotal",
      title: "Subtotal",
      width: 110,
      align: "right",
      sorter: (a, b) => (a.precio_unitario ?? 0) * a.cantidad - (b.precio_unitario ?? 0) * b.cantidad,
      filters: [...new Set(filasAplanadas.map((r) =>
        r.precio_unitario != null ? Number((r.precio_unitario * r.cantidad).toFixed(2)) : 0
      ))].sort((a, b) => a - b).map((v) => ({ text: v.toFixed(2), value: String(v) })),
      filterSearch: true,
      onFilter: (value, r) => {
        const sub = r.precio_unitario != null ? Number((r.precio_unitario * r.cantidad).toFixed(2)) : 0;
        return String(sub) === value;
      },
      render: (_, r) =>
        r.precio_unitario != null ? (
          <b style={{ color: brand.navy }}>
            {r.moneda} {(r.precio_unitario * r.cantidad).toFixed(2)}
          </b>
        ) : "-",
    },
    {
      key: "almacen_nombre",
      title: "Almacén",
      dataIndex: "almacen_nombre",
      width: 130,
      ellipsis: true,
      ...filtroPorColumna(filasAplanadas, "almacen_nombre"),
      render: (v: string | null) => v || "-",
    },
    {
      key: "fecha_entrega_esperada",
      title: "F. Entrega",
      dataIndex: "fecha_entrega_esperada",
      width: 110,
      sorter: (a, b) => (a.fecha_entrega_esperada || "").localeCompare(b.fecha_entrega_esperada || ""),
      render: (v: string | null) => (v ? formatDateOnly(v) : "-"),
    },
    {
      key: "acciones",
      title: "Acciones",
      width: 110,
      fixed: "right",
      align: "center",
      render: (_, r) => (
        <Button
          type="primary"
          size="small"
          icon={<InboxOutlined />}
          onClick={() => abrirRecibir(r.po_id)}
        >
          Recibir
        </Button>
      ),
    },
  ];

  const { columnas: itemsResizable, components: itemsComponents, resetAnchos: resetItemsAnchos, TableDragWrapper: ItemsDragWrapper } =
    useColumnasRedimensionables<ItemFila>(columnasItems, "movimientos-items-cols-widths-v1");

  return (
    <div>
      {/* KPIs */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} md={8}>
          <Card styles={{ body: { padding: 12 } }}>
            <Statistic title="OCs pendientes" value={totalPOsPendientes} prefix={<InboxOutlined style={{ color: brand.cyan }} />} styles={{ content: { color: brand.cyan } }} />
          </Card>
        </Col>
        <Col xs={12} md={8}>
          <Card styles={{ body: { padding: 12 } }}>
            <Statistic title="Items por recibir" value={totalItemsPendientes} prefix={<FileDoneOutlined style={{ color: "#fa8c16" }} />} styles={{ content: { color: "#fa8c16" } }} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card styles={{ body: { padding: 12 } }}>
            <Statistic title="Valor total pendiente" value={valorTotalPendiente} precision={2} prefix="$" styles={{ content: { color: brand.navy } }} />
          </Card>
        </Col>
      </Row>

      {/* Filtros */}
      <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 12 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={10} md={7}>
            <Input
              placeholder="Buscar OC, código, material, proveedor..."
              prefix={<SearchOutlined />}
              allowClear
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Col>
          <Col xs={12} sm={6} md={5}>
            <Select
              placeholder="Proveedor"
              allowClear
              style={{ width: "100%" }}
              showSearch
              optionFilterProp="label"
              value={filtroProv}
              onChange={setFiltroProv}
              options={proveedoresUnicos.map((p) => ({ value: p, label: p }))}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              placeholder="Estado"
              allowClear
              style={{ width: "100%" }}
              value={filtroEstado}
              onChange={setFiltroEstado}
              options={estadosUnicos.map((e) => ({ value: e, label: e }))}
            />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Button icon={<ReloadOutlined />} onClick={fetchPOs} block>
              Actualizar
            </Button>
          </Col>
        </Row>
      </Card>

      {pos.length === 0 && !loading && (
        <Alert type="info" title="No hay órdenes de compra pendientes de recepción" showIcon />
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <RangoFechasFiltro
          label="Fecha entrega esperada"
          value={rangoEntrega}
          onChange={setRangoEntrega}
        />
        <ColumnasToggleButton<ItemFila>
          columns={columnasItems}
          ocultas={ingresoOcultas}
          setOcultas={setIngresoOcultas}
          obligatorias={["numero_po", "descripcion", "acciones"]}
        />
        <Button onClick={resetItemsAnchos}>Restablecer anchos</Button>
      </div>

      <ItemsDragWrapper>
              <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={filasFiltradas.filter((r) => dentroDeRango(r, "fecha_entrega_esperada", rangoEntrega))}
          columns={visibleColumns(itemsResizable, ingresoOcultas)}
          components={itemsComponents}
          pagination={{ pageSize: 25, showTotal: (t) => `${t} items`, placement: ["topEnd", "bottomEnd"] }}
          scroll={{ x: 1500 }}
          sticky={{ offsetHeader: 56, offsetScroll: 0 }}
        />
      </ItemsDragWrapper>

      {/* Modal Recibir */}
      <Modal
        title={
          <Space>
            <InboxOutlined style={{ color: brand.cyan }} />
            Recibir OC — {poSeleccionada?.numero_po}
          </Space>
        }
        open={!!poSeleccionada}
        onCancel={() => setPoSeleccionada(null)}
        width={1000}
        okText="Confirmar Recepción"
        onOk={confirmarIngreso}
        confirmLoading={submitting}
      >
        {poSeleccionada && (
          <>
            <Card size="small" style={{ background: brand.bgPage, marginBottom: 12 }}>
              <Row gutter={16}>
                <Col span={8}><Text type="secondary">Proveedor:</Text> <b>{poSeleccionada.proveedor_nombre}</b></Col>
                <Col span={8}><Text type="secondary">Almacén destino:</Text> <b>{poSeleccionada.almacen_nombre}</b></Col>
                <Col span={8}><Text type="secondary">Total OC:</Text> <b style={{ color: brand.navy }}>{poSeleccionada.moneda} {Number(poSeleccionada.total).toFixed(2)}</b></Col>
              </Row>
            </Card>

            <Alert
              style={{ marginBottom: 12 }}
              type="info"
              showIcon
              title="Ajusta las cantidades si lo recibido no coincide con lo solicitado. Las entradas se crearán automáticamente."
            />

            {/* Datos de la recepción */}
            <Card size="small" title={<Space><FileDoneOutlined />Datos de recepción</Space>} style={{ marginBottom: 12 }}>
              <Row gutter={12} style={{ marginBottom: 12 }}>
                <Col xs={24} sm={8}>
                  <Text strong style={{ fontSize: 12 }}>Nro. Guía de Remisión</Text>
                  <Input
                    placeholder="Ej. G001-12345"
                    value={nroGuia}
                    onChange={(e) => setNroGuia(e.target.value)}
                    prefix={<PaperClipOutlined style={{ color: brand.cyan }} />}
                  />
                </Col>
                <Col xs={24} sm={8}>
                  <Text strong style={{ fontSize: 12 }}>Nro. Factura</Text>
                  <Input
                    placeholder="Ej. F001-98765"
                    value={nroFactura}
                    onChange={(e) => setNroFactura(e.target.value)}
                  />
                </Col>
                <Col xs={24} sm={8}>
                  <Text strong style={{ fontSize: 12 }}>Comentarios de recepción</Text>
                  <Input
                    placeholder="Ej. Recibido conforme, faltó 1 unidad..."
                    value={comentariosRec}
                    onChange={(e) => setComentariosRec(e.target.value)}
                  />
                </Col>
              </Row>
              <Row gutter={12}>
                <Col xs={24} sm={12}>
                  <Text strong style={{ fontSize: 12 }}>
                    Ubicación física del material <span style={{ color: "#cf1322" }}>*</span>
                  </Text>
                  <Select
                    placeholder="¿Dónde se guardó el material recibido?"
                    value={ubicacionRec}
                    onChange={setUbicacionRec}
                    options={ubicaciones.map((u) => ({ value: u.codigo, label: `${u.codigo} — ${u.nombre}` }))}
                    showSearch
                    optionFilterProp="label"
                    allowClear
                    style={{ width: "100%" }}
                  />
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Se guardará en la(s) OT(s) de esta PO para saber dónde está el material al despachar.
                  </Text>
                </Col>
              </Row>

              <Divider style={{ margin: "8px 0", fontSize: 11, color: "#666" }}>Archivos adjuntos (opcional)</Divider>

              <Row gutter={12}>
                <Col xs={24} sm={12}>
                  <Text strong style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
                    📎 Archivo de Guía de Remisión (PDF/imagen)
                  </Text>
                  {poSeleccionada.guia_archivo ? (
                    <Card size="small" style={{ background: "#f6ffed", borderColor: "#b7eb8f" }}>
                      <Space style={{ width: "100%", justifyContent: "space-between" }}>
                        <Space size={6}>
                          <CheckCircleOutlined style={{ color: "#52c41a" }} />
                          <a href={poSeleccionada.guia_archivo} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>
                            {poSeleccionada.guia_nombre || "Guía adjunta"}
                          </a>
                        </Space>
                        <Space size={4}>
                          <Tooltip title="Descargar">
                            <Button size="small" type="text" icon={<DownloadOutlined />} href={poSeleccionada.guia_archivo} target="_blank" />
                          </Tooltip>
                          <Tooltip title="Eliminar">
                            <Button
                              size="small"
                              type="text"
                              danger
                              icon={<DeleteOutlined />}
                              onClick={async () => {
                                try {
                                  const res = await fetch(`/api/compras/${poSeleccionada.id}/guia?tipo=guia`, { method: "DELETE" });
                                  if (!res.ok) throw new Error();
                                  message.success("Guía eliminada");
                                  await fetchPOs();
                                  setPoSeleccionada({ ...poSeleccionada, guia_archivo: null, guia_nombre: null });
                                } catch {
                                  message.error("Error al eliminar");
                                }
                              }}
                            />
                          </Tooltip>
                        </Space>
                      </Space>
                    </Card>
                  ) : (
                    <Upload
                      beforeUpload={async (file) => {
                        if (file.size > 20 * 1024 * 1024) {
                          message.warning("Archivo demasiado grande (max 20 MB)");
                          return false;
                        }
                        try {
                          const fd = new FormData();
                          fd.append("file", file);
                          const res = await fetch(`/api/compras/${poSeleccionada.id}/guia?tipo=guia`, { method: "POST", body: fd });
                          const json = await res.json();
                          if (!res.ok) throw new Error(json.error || "Error al subir");
                          message.success("Guía subida correctamente");
                          await fetchPOs();
                          setPoSeleccionada({ ...poSeleccionada, guia_archivo: json.data.guia_archivo, guia_nombre: json.data.guia_nombre });
                        } catch (err) {
                          message.error(err instanceof Error ? err.message : "Error");
                        }
                        return false;
                      }}
                      showUploadList={false}
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    >
                      <Button icon={<UploadOutlined />} block style={{ borderStyle: "dashed" }}>
                        Subir Guía de Remisión
                      </Button>
                    </Upload>
                  )}
                </Col>
                <Col xs={24} sm={12}>
                  <Text strong style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
                    📎 Archivo de Factura (PDF/imagen)
                  </Text>
                  {poSeleccionada.factura_archivo ? (
                    <Card size="small" style={{ background: "#f6ffed", borderColor: "#b7eb8f" }}>
                      <Space style={{ width: "100%", justifyContent: "space-between" }}>
                        <Space size={6}>
                          <CheckCircleOutlined style={{ color: "#52c41a" }} />
                          <a href={poSeleccionada.factura_archivo} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>
                            {poSeleccionada.factura_nombre || "Factura adjunta"}
                          </a>
                        </Space>
                        <Space size={4}>
                          <Tooltip title="Descargar">
                            <Button size="small" type="text" icon={<DownloadOutlined />} href={poSeleccionada.factura_archivo} target="_blank" />
                          </Tooltip>
                          <Tooltip title="Eliminar">
                            <Button
                              size="small"
                              type="text"
                              danger
                              icon={<DeleteOutlined />}
                              onClick={async () => {
                                try {
                                  const res = await fetch(`/api/compras/${poSeleccionada.id}/guia?tipo=factura`, { method: "DELETE" });
                                  if (!res.ok) throw new Error();
                                  message.success("Factura eliminada");
                                  await fetchPOs();
                                  setPoSeleccionada({ ...poSeleccionada, factura_archivo: null, factura_nombre: null });
                                } catch {
                                  message.error("Error al eliminar");
                                }
                              }}
                            />
                          </Tooltip>
                        </Space>
                      </Space>
                    </Card>
                  ) : (
                    <Upload
                      beforeUpload={async (file) => {
                        if (file.size > 20 * 1024 * 1024) {
                          message.warning("Archivo demasiado grande (max 20 MB)");
                          return false;
                        }
                        try {
                          const fd = new FormData();
                          fd.append("file", file);
                          const res = await fetch(`/api/compras/${poSeleccionada.id}/guia?tipo=factura`, { method: "POST", body: fd });
                          const json = await res.json();
                          if (!res.ok) throw new Error(json.error || "Error al subir");
                          message.success("Factura subida correctamente");
                          await fetchPOs();
                          setPoSeleccionada({ ...poSeleccionada, factura_archivo: json.data.factura_archivo, factura_nombre: json.data.factura_nombre });
                        } catch (err) {
                          message.error(err instanceof Error ? err.message : "Error");
                        }
                        return false;
                      }}
                      showUploadList={false}
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    >
                      <Button icon={<UploadOutlined />} block style={{ borderStyle: "dashed" }}>
                        Subir Factura
                      </Button>
                    </Upload>
                  )}
                </Col>
              </Row>
            </Card>

            <Table
              rowKey="id"
              pagination={false}
              size="small"
              dataSource={poSeleccionada.items}
              columns={[
                { title: "Código", dataIndex: "codigo", width: 100 },
                { title: "Descripción", dataIndex: "descripcion", ellipsis: true },
                { title: "Cant. Pedida", dataIndex: "cantidad", width: 100, align: "right" },
                {
                  title: "Cant. Recibida",
                  width: 130,
                  align: "right",
                  render: (_, r) => (
                    <InputNumber
                      min={0}
                      max={r.cantidad}
                      value={cantidadesRecibidas[r.id] ?? 0}
                      onChange={(v) => setCantidadesRecibidas({ ...cantidadesRecibidas, [r.id]: Number(v) || 0 })}
                      style={{ width: "100%" }}
                    />
                  ),
                },
                { title: "UM", dataIndex: "unidad_medida", width: 55, align: "center" },
              ]}
            />
          </>
        )}
      </Modal>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// TAB 4: SALIDA (manual)
// ════════════════════════════════════════════════════════════
function TabSalida({ onRefresh }: { onRefresh: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [materiales, setMateriales] = useState<StockItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [matSel, setMatSel] = useState<StockItem | null>(null);
  // Modo material NO catalogado.
  const [esNoCat, setEsNoCat] = useState(false);
  const [noCat, setNoCat] = useState<{ id: number; codigo: string; descripcion: string; unidad_medida: string; stock_actual: number; ubicacion_nombre: string | null }[]>([]);
  const [noCatSel, setNoCatSel] = useState<typeof noCat[number] | null>(null);

  const cargarMateriales = useCallback(async () => {
    try {
      const res = await fetch("/api/stock");
      const json = await res.json();
      setMateriales(json.data ?? []);
    } catch {}
  }, []);

  const cargarNoCat = useCallback(async () => {
    try {
      const res = await fetch("/api/no-catalogados");
      const json = await res.json();
      setNoCat(json.data ?? []);
    } catch {}
  }, []);

  useEffect(() => {
    cargarMateriales();
    cargarNoCat();
  }, [cargarMateriales, cargarNoCat]);

  const registrar = async (tipo: "SALIDA" | "ENTRADA" | "AJUSTE") => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      let res: Response;
      if (esNoCat) {
        // Movimiento sobre material NO catalogado (endpoint dedicado).
        res = await fetch(`/api/no-catalogados/${values.material_id}/movimiento`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo_movimiento: tipo,
            cantidad: values.cantidad,
            motivo: values.observacion,
            documento_referencia: values.documento_referencia,
            usuario: values.usuario || "Almacenero",
          }),
        });
      } else {
        res = await fetch("/api/movimientos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            material_id: values.material_id,
            tipo_movimiento: tipo,
            cantidad: values.cantidad,
            documento_referencia: values.documento_referencia,
            observacion: values.observacion,
            usuario: values.usuario || "Almacenero",
          }),
        });
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      message.success(`Movimiento ${tipo} registrado correctamente`);
      form.resetFields();
      setMatSel(null);
      setNoCatSel(null);
      await Promise.all([cargarMateriales(), cargarNoCat()]);
      onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error";
      if (!msg.includes("validation")) message.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={14}>
        <Card title={<Space><PlusOutlined />Registrar movimiento manual</Space>}>
          <Form form={form} layout="vertical">
            <Checkbox
              checked={esNoCat}
              onChange={(e) => {
                setEsNoCat(e.target.checked);
                form.setFieldsValue({ material_id: undefined });
                setMatSel(null); setNoCatSel(null);
              }}
              style={{ marginBottom: 12 }}
            >
              <b>Material NO catalogado</b> — registrar movimiento de un material fuera del catálogo
            </Checkbox>

            <Form.Item
              label={esNoCat ? "Material no catalogado" : "Material"}
              name="material_id"
              rules={[{ required: true, message: "Selecciona un material" }]}
            >
              <Select
                showSearch
                placeholder="Buscar por código o descripción..."
                optionFilterProp="label"
                onChange={(v) => {
                  if (esNoCat) {
                    setNoCatSel(noCat.find((x) => x.id === v) || null);
                  } else {
                    setMatSel(materiales.find((x) => x.material_id === v) || null);
                  }
                }}
                options={esNoCat
                  ? noCat.map((m) => ({ value: m.id, label: `${m.codigo} — ${m.descripcion}` }))
                  : materiales.map((m) => ({ value: m.material_id, label: `${m.codigo} — ${m.descripcion}` }))}
                notFoundContent={esNoCat && noCat.length === 0 ? "No hay materiales no catalogados. Creá uno en Inventario no catalogado." : undefined}
              />
            </Form.Item>

            {!esNoCat && matSel && (
              <Alert
                style={{ marginBottom: 12 }}
                type={matSel.alerta === "SIN" ? "error" : matSel.alerta === "BAJO" ? "warning" : "success"}
                showIcon
                title={
                  <Space>
                    <span>Stock actual: <b>{matSel.stock_actual}</b> {matSel.unidad_medida}</span>
                    {matSel.punto_reposicion > 0 && <span>| Pto. reposición: <b>{matSel.punto_reposicion}</b></span>}
                    {matSel.ubicacion && <span>| Ubicación: <b>{matSel.ubicacion}</b></span>}
                  </Space>
                }
              />
            )}
            {esNoCat && noCatSel && (
              <Alert
                style={{ marginBottom: 12 }}
                type={noCatSel.stock_actual <= 0 ? "error" : "success"}
                showIcon
                title={
                  <Space>
                    <span>Stock actual: <b>{noCatSel.stock_actual}</b> {noCatSel.unidad_medida}</span>
                    {noCatSel.ubicacion_nombre && <span>| Ubicación: <b>{noCatSel.ubicacion_nombre}</b></span>}
                  </Space>
                }
              />
            )}

            <Row gutter={12}>
              <Col span={12}>
                <Form.Item
                  label="Cantidad"
                  name="cantidad"
                  rules={[{ required: true, message: "Ingresa la cantidad" }]}
                >
                  <InputNumber min={0.01} step={0.01} style={{ width: "100%" }} placeholder="0.00" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Usuario" name="usuario" initialValue="Almacenero">
                  <Input placeholder="Nombre del usuario" />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item label="Documento de referencia" name="documento_referencia">
              <Input placeholder="OT-2026-001, OC-123, ajuste, etc." />
            </Form.Item>

            <Form.Item label="Observación" name="observacion">
              <TextArea rows={2} placeholder="Motivo del movimiento..." />
            </Form.Item>

            <Space wrap style={{ width: "100%", justifyContent: "flex-end" }}>
              <Tooltip title="Reduce el stock (ej: entrega a taller)">
                <Button
                  danger
                  icon={<ArrowUpOutlined />}
                  loading={submitting}
                  onClick={() => registrar("SALIDA")}
                >
                  Registrar SALIDA
                </Button>
              </Tooltip>
              <Tooltip title="Aumenta el stock (ej: devolución de material)">
                <Button
                  icon={<ArrowDownOutlined />}
                  style={{ background: "#52c41a", color: "#fff", borderColor: "#52c41a" }}
                  loading={submitting}
                  onClick={() => registrar("ENTRADA")}
                >
                  Registrar ENTRADA
                </Button>
              </Tooltip>
              <Tooltip title="Fija el stock al valor indicado (ajuste de inventario)">
                <Button
                  icon={<SwapOutlined />}
                  type="primary"
                  loading={submitting}
                  onClick={() => registrar("AJUSTE")}
                >
                  Registrar AJUSTE
                </Button>
              </Tooltip>
            </Space>
          </Form>
        </Card>
      </Col>

      <Col xs={24} md={10}>
        <Card title={<Space><InfoCircleOutlined />Información</Space>}>
          <Space orientation="vertical" size={12} style={{ width: "100%" }}>
            <div>
              <Text strong style={{ color: "#cf1322" }}>⬆ SALIDA</Text>
              <div style={{ fontSize: 12, color: "#666" }}>
                Usa esta opción para entregar material a un taller, técnico u OT.
                El stock se reducirá en la cantidad indicada.
              </div>
            </div>
            <Divider style={{ margin: 0 }} />
            <div>
              <Text strong style={{ color: "#389e0d" }}>⬇ ENTRADA</Text>
              <div style={{ fontSize: 12, color: "#666" }}>
                Úsala para registrar devoluciones o material recibido manualmente
                (sin una OC). Para recibir una OC completa usa la pestaña "Ingreso de POs".
              </div>
            </div>
            <Divider style={{ margin: 0 }} />
            <div>
              <Text strong style={{ color: brand.cyan }}>↔ AJUSTE</Text>
              <div style={{ fontSize: 12, color: "#666" }}>
                Fija el stock al valor exacto que indiques (inventario físico).
                Útil cuando el stock del sistema no coincide con lo físico.
              </div>
            </div>
          </Space>
        </Card>
      </Col>
    </Row>
  );
}

// ════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ════════════════════════════════════════════════════════════
export default function MovimientosPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  const tabItems = [
    {
      key: "movimientos",
      label: (
        <Space>
          <FileDoneOutlined />
          Movimientos
        </Space>
      ),
      children: <TabMovimientos key={`mov-${refreshKey}`} onRefresh={() => setRefreshKey((k) => k + 1)} />,
    },
    {
      key: "ingreso",
      label: (
        <Space>
          <InboxOutlined />
          Ingreso de POs
        </Space>
      ),
      children: <TabIngresoPO key={`po-${refreshKey}`} onRefresh={() => setRefreshKey((k) => k + 1)} />,
    },
    {
      key: "salida",
      label: (
        <Space>
          <ExportOutlined />
          Salida / Manual
        </Space>
      ),
      children: <TabSalida key={`salida-${refreshKey}`} onRefresh={() => setRefreshKey((k) => k + 1)} />,
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          <ToolOutlined style={{ color: brand.cyan, marginRight: 8 }} />
          Movimientos de Inventario
        </Title>
      </div>

      <Tabs items={tabItems} defaultActiveKey="movimientos" />
    </div>
  );
}
