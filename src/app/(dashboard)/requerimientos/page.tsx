"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Typography,
  Table,
  Button,
  Input,
  Select,
  Tag,
  Row,
  Col,
  Card,
  Space,
  Tooltip,
  App,
  Statistic,
} from "antd";
import {
  SearchOutlined,
  ReloadOutlined,
  EyeOutlined,
  FileDoneOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  SettingOutlined,
  FileExcelOutlined,
  ShoppingCartOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { Popover, Divider, Checkbox } from "antd";
import { brand } from "@/lib/theme";
import dayjs from "dayjs";

const { Title } = Typography;

interface Requerimiento {
  id: number;
  ot_id: number;
  numero_ot: string | null;
  material_id: number | null;
  material_codigo: string | null;
  material_nombre: string | null;
  stock_actual: number;
  nro_req: string | null;
  item_req: number | null;
  tipo_codigo: string | null;
  cantidad: number;
  descripcion: string | null;
  fabricante_codigo: string | null;
  unidad_medida: string | null;
  fecha_solicitud: string | null;
  fecha_requerida: string | null;
  estado: string | null;
  estado_cot: string | null;
  nro_oc: string | null;
  numero_po: string | null;
  proveedor_nombre: string | null;
  precio_unitario: number | null;
  moneda: string | null;
  cliente_nombre: string | null;
  prioridad_atencion_codigo: string | null;
}

const estadoReqColor: Record<string, string> = {
  Pendiente: "gold",
  REV: "gold",
  Aprobado: "green",
  APR: "green",
  "En PO": "blue",
  COM: "default",
  ANU: "red",
  PRO: "blue",
};

const estadoCotColor: Record<string, string> = {
  PDT_COT: "gold",
  PDT_APR: "orange",
  APR: "green",
  ANU: "red",
  DES: "red",
};

const prioridadColor: Record<string, string> = {
  E: "volcano",
  "1": "red",
  "2": "orange",
  "3": "cyan",
};

export default function RequerimientosPage() {
  const router = useRouter();
  const { message } = App.useApp();

  const [data, setData] = useState<Requerimiento[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState<string>("");
  const [tipo, setTipo] = useState<string>("");

  // Columnas ocultas (persistidas en localStorage)
  const COLS_STORAGE_KEY = "req-list-cols-v1";
  const [columnasOcultas, setColumnasOcultas] = useState<string[]>([]);
  const [columnasHidratadas, setColumnasHidratadas] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(COLS_STORAGE_KEY);
      if (stored) setColumnasOcultas(JSON.parse(stored));
    } catch { /* ignore */ }
    setColumnasHidratadas(true);
  }, []);

  useEffect(() => {
    if (!columnasHidratadas) return;
    try {
      localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(columnasOcultas));
    } catch { /* ignore */ }
  }, [columnasOcultas, columnasHidratadas]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (estado) params.set("estado", estado);
      if (search) params.set("search", search);
      const res = await fetch(`/api/requerimientos?${params}`);
      const json = await res.json();
      let rows = json.data as Requerimiento[];
      if (tipo) rows = rows.filter((r) => (r.tipo_codigo || "MAC") === tipo);
      setData(rows);
    } catch {
      message.error("Error al cargar requerimientos");
    } finally {
      setLoading(false);
    }
  }, [estado, search, tipo, message]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // KPIs
  const activos = data.filter((r) => !["COM", "ANU"].includes(r.estado || ""));
  const pendientes = activos.filter((r) => !r.estado || r.estado === "Pendiente" || r.estado === "REV").length;
  const aprobados = activos.filter((r) => r.estado === "Aprobado" || r.estado === "APR").length;
  const enCot = activos.filter((r) => r.estado_cot && !["APR", "ANU", ""].includes(r.estado_cot)).length;
  const enOC = activos.filter((r) => r.nro_oc).length;
  const porSolicitar = activos.filter((r) => !r.nro_oc && (r.estado === "Aprobado" || r.estado === "APR" || r.estado_cot === "APR")).length;
  const sinStock = activos.filter((r) => r.material_id !== null && !(r.stock_actual > 0)).length;

  const exportarExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const rows = data.map((r) => ({
        OT: r.numero_ot ?? "",
        "Estado REQ": r.estado ?? "",
        "Estado COT": r.estado_cot ?? "",
        "Nro REQ": r.nro_req ?? "",
        Item: r.item_req ?? "",
        Tipo: r.tipo_codigo ?? "",
        Código: r.material_codigo ?? "",
        Material: r.material_nombre ?? r.descripcion ?? "",
        Cantidad: r.cantidad,
        UM: r.unidad_medida ?? "",
        Stock: r.stock_actual,
        Cliente: r.cliente_nombre ?? "",
        Prioridad: r.prioridad_atencion_codigo ?? "",
        Fabricante: r.fabricante_codigo ?? "",
        "P. Unit": r.precio_unitario ?? "",
        Moneda: r.moneda ?? "",
        Subtotal: r.precio_unitario != null ? Number(r.precio_unitario) * Number(r.cantidad) : "",
        "Nro OC": r.nro_oc ?? "",
        Proveedor: r.proveedor_nombre ?? "",
        "F. Solicitud": r.fecha_solicitud ? dayjs(r.fecha_solicitud).format("DD/MM/YYYY") : "",
        "F. Requerida": r.fecha_requerida ? dayjs(r.fecha_requerida).format("DD/MM/YYYY") : "",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Requerimientos");
      XLSX.writeFile(wb, `Requerimientos-${dayjs().format("YYYYMMDD-HHmm")}.xlsx`);
      message.success("Excel descargado");
    } catch {
      message.error("Error al exportar Excel");
    }
  };

  // Valores únicos para filtros
  const valoresUnicos = (campo: keyof Requerimiento) => {
    const set = new Set<string>();
    data.forEach((r) => {
      const v = r[campo];
      if (v !== null && v !== undefined && v !== "") set.add(String(v));
    });
    return [...set].sort().map((v) => ({ text: v, value: v }));
  };

  const popoverContent = (r: Requerimiento) => (
    <div style={{ maxWidth: 360, fontSize: 12 }}>
      <div style={{ fontWeight: 600, color: brand.navy, marginBottom: 6 }}>
        {r.material_nombre || r.descripcion || "Sin descripción"}
      </div>
      <Row gutter={[8, 4]}>
        <Col span={12}><span style={{ color: "#888" }}>OT:</span> <b>{r.numero_ot || "-"}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>REQ/Item:</span> <b>{r.nro_req}/{r.item_req}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>Código:</span> <b>{r.material_codigo || "-"}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>Tipo:</span> <b>{r.tipo_codigo || "MAC"}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>Cant:</span> <b>{r.cantidad} {r.unidad_medida || ""}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>Stock:</span> <b style={{ color: r.stock_actual > 0 ? "#52c41a" : "#ff4d4f" }}>{r.stock_actual ?? 0}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>Fabricante:</span> <b>{r.fabricante_codigo || "-"}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>P. Unit:</span> <b>{r.precio_unitario != null ? Number(r.precio_unitario).toFixed(2) : "-"}</b></Col>
        <Col span={24}><span style={{ color: "#888" }}>Cliente:</span> {r.cliente_nombre || "-"}</Col>
        <Col span={24}><span style={{ color: "#888" }}>Proveedor:</span> {r.proveedor_nombre || "-"}</Col>
      </Row>
      <Divider style={{ margin: "8px 0" }} />
      <Space size={4} wrap>
        <Tag color={estadoReqColor[r.estado || "Pendiente"] || "default"}>{r.estado || "Pendiente"}</Tag>
        {r.estado_cot && <Tag color={estadoCotColor[r.estado_cot] || "default"}>COT: {r.estado_cot}</Tag>}
        {r.nro_oc && <Tag color="blue">OC: {r.nro_oc}</Tag>}
      </Space>
    </div>
  );

  const columns: ColumnsType<Requerimiento> = [
    {
      key: "numero_ot",
      title: "OT",
      dataIndex: "numero_ot",
      width: 130,
      fixed: "left",
      filters: valoresUnicos("numero_ot"),
      filterSearch: true,
      onFilter: (value, r) => r.numero_ot === value,
      sorter: (a, b) => (a.numero_ot || "").localeCompare(b.numero_ot || ""),
      render: (v: string) => (v ? <Tag color={brand.navy}>{v}</Tag> : "-"),
    },
    {
      key: "estado",
      title: "Estado REQ",
      dataIndex: "estado",
      width: 110,
      filters: [
        { text: "Pendiente", value: "Pendiente" },
        { text: "Aprobado", value: "Aprobado" },
        { text: "APR", value: "APR" },
        { text: "En PO", value: "En PO" },
        { text: "REV", value: "REV" },
      ],
      onFilter: (value, r) => (r.estado || "Pendiente") === value,
      render: (v: string | null) => {
        const est = v || "Pendiente";
        return <Tag color={estadoReqColor[est] || "default"}>{est}</Tag>;
      },
    },
    {
      key: "estado_cot",
      title: "Estado COT",
      dataIndex: "estado_cot",
      width: 110,
      filters: [
        { text: "PDT_COT", value: "PDT_COT" },
        { text: "PDT_APR", value: "PDT_APR" },
        { text: "APR", value: "APR" },
        { text: "DES", value: "DES" },
      ],
      onFilter: (value, r) => r.estado_cot === value,
      render: (v: string | null) => (v ? <Tag color={estadoCotColor[v] || "default"}>{v}</Tag> : "-"),
    },
    {
      key: "tipo_codigo",
      title: "Tipo",
      dataIndex: "tipo_codigo",
      width: 70,
      align: "center",
      filters: [
        { text: "MAC", value: "MAC" },
        { text: "SER", value: "SER" },
        { text: "CAD", value: "CAD" },
      ],
      onFilter: (value, r) => (r.tipo_codigo || "MAC") === value,
      render: (v: string | null) => <Tag>{v || "MAC"}</Tag>,
    },
    {
      key: "nro_req",
      title: "Nro REQ",
      dataIndex: "nro_req",
      width: 130,
      filters: valoresUnicos("nro_req"),
      filterSearch: true,
      onFilter: (value, r) => r.nro_req === value,
      render: (v: string | null) => v || "-",
    },
    {
      key: "material",
      title: "Material",
      width: 240,
      ellipsis: true,
      render: (_: unknown, r: Requerimiento) => (
        <Popover content={popoverContent(r)} placement="right" mouseEnterDelay={0.3} trigger="hover">
          <div style={{ cursor: "help" }}>
            <div style={{ fontWeight: 500, fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
              <InfoCircleOutlined style={{ color: brand.cyan, fontSize: 11 }} />
              {r.material_nombre || r.descripcion || "-"}
            </div>
            {r.material_codigo && <div style={{ fontSize: 11, color: "#888", marginLeft: 16 }}>{r.material_codigo}</div>}
          </div>
        </Popover>
      ),
    },
    {
      key: "cantidad",
      title: "Cant.",
      dataIndex: "cantidad",
      width: 70,
      align: "center",
      sorter: (a, b) => Number(a.cantidad) - Number(b.cantidad),
      render: (v: number) => Number(v).toLocaleString("en", { maximumFractionDigits: 2 }),
    },
    {
      key: "unidad_medida",
      title: "UM",
      dataIndex: "unidad_medida",
      width: 60,
      align: "center",
    },
    {
      key: "cliente_nombre",
      title: "Cliente",
      dataIndex: "cliente_nombre",
      width: 140,
      ellipsis: true,
      filters: valoresUnicos("cliente_nombre"),
      filterSearch: true,
      onFilter: (value, r) => r.cliente_nombre === value,
      render: (v: string | null) => v || "-",
    },
    {
      key: "prioridad_atencion_codigo",
      title: "Prioridad",
      dataIndex: "prioridad_atencion_codigo",
      width: 90,
      align: "center",
      filters: [
        { text: "E (Emergencia)", value: "E" },
        { text: "1 (Alta)", value: "1" },
        { text: "2 (Media)", value: "2" },
        { text: "3 (Normal)", value: "3" },
      ],
      onFilter: (value, r) => r.prioridad_atencion_codigo === value,
      render: (v: string | null) => (v ? <Tag color={prioridadColor[v] || "default"}>{v}</Tag> : "-"),
    },
    {
      key: "precio_unitario",
      title: "P. Unit.",
      dataIndex: "precio_unitario",
      width: 90,
      align: "right",
      sorter: (a, b) => Number(a.precio_unitario || 0) - Number(b.precio_unitario || 0),
      render: (v: number | null) => (v != null ? Number(v).toFixed(2) : "-"),
    },
    {
      key: "nro_oc",
      title: "Nro OC",
      dataIndex: "nro_oc",
      width: 110,
      filters: valoresUnicos("nro_oc"),
      filterSearch: true,
      onFilter: (value, r) => r.nro_oc === value,
      render: (v: string | null) => v ? <Tag color="blue">{v}</Tag> : "-",
    },
    {
      key: "proveedor_nombre",
      title: "Proveedor",
      dataIndex: "proveedor_nombre",
      width: 150,
      ellipsis: true,
      filters: valoresUnicos("proveedor_nombre"),
      filterSearch: true,
      onFilter: (value, r) => r.proveedor_nombre === value,
      render: (v: string | null) => v || "-",
    },
    {
      key: "fecha_solicitud",
      title: "F. Solicitud",
      dataIndex: "fecha_solicitud",
      width: 110,
      sorter: (a, b) => (a.fecha_solicitud || "").localeCompare(b.fecha_solicitud || ""),
      render: (v: string | null) => (v ? dayjs(v).format("DD/MM/YYYY") : "-"),
    },
    {
      key: "acciones",
      title: "Acciones",
      width: 80,
      align: "center",
      fixed: "right",
      render: (_: unknown, r: Requerimiento) => (
        <Tooltip title="Ver detalle">
          <Button
            type="text"
            icon={<EyeOutlined />}
            onClick={() => router.push(`/requerimientos/detalle?ot_id=${r.ot_id}`)}
          />
        </Tooltip>
      ),
    },
  ];

  // Filtrar columnas visibles (respetando orden)
  const columnasVisibles = columns.filter(
    (c) => !columnasOcultas.includes(String(c.key))
  );

  const clavesTotales = columns.map((c) => String(c.key));
  const clavesVisibles = clavesTotales.filter((k) => !columnasOcultas.includes(k));

  // Popover de selección de columnas
  const contenidoColumnas = (
    <div style={{ minWidth: 220, maxHeight: 380, overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <Button
          size="small"
          type="link"
          onClick={() => setColumnasOcultas([])}
          disabled={columnasOcultas.length === 0}
        >
          Mostrar todas
        </Button>
        <Button
          size="small"
          type="link"
          danger
          onClick={() =>
            setColumnasOcultas(clavesTotales.filter((k) => k !== "numero_ot" && k !== "acciones"))
          }
        >
          Ocultar todas
        </Button>
      </div>
      <Divider style={{ margin: "4px 0 8px" }} />
      <Checkbox.Group
        value={clavesVisibles}
        onChange={(checkedValues) => {
          const checked = checkedValues as string[];
          // Columnas obligatorias: siempre visibles
          const obligatorias = ["numero_ot", "acciones"];
          const ocultas = clavesTotales.filter(
            (k) => !checked.includes(k) && !obligatorias.includes(k)
          );
          setColumnasOcultas(ocultas);
        }}
        style={{ width: "100%" }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {columns.map((c) => {
            const k = String(c.key);
            const obligatoria = k === "numero_ot" || k === "acciones";
            return (
              <Checkbox key={k} value={k} disabled={obligatoria}>
                <span style={{ fontSize: 13 }}>
                  {typeof c.title === "string" ? c.title : k}
                  {obligatoria && (
                    <span style={{ color: "#999", fontSize: 11, marginLeft: 6 }}>(fija)</span>
                  )}
                </span>
              </Checkbox>
            );
          })}
        </div>
      </Checkbox.Group>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          Requerimientos de Compra
        </Title>
        <Space>
          <Popover
            content={contenidoColumnas}
            title={
              <Space>
                <SettingOutlined style={{ color: brand.navy }} />
                <span>Columnas visibles ({clavesVisibles.length}/{clavesTotales.length})</span>
              </Space>
            }
            trigger="click"
            placement="bottomRight"
          >
            <Button icon={<SettingOutlined />}>Columnas</Button>
          </Popover>
          <Button
            icon={<FileExcelOutlined />}
            onClick={exportarExcel}
            style={{ background: "#1d6f42", color: "#fff", borderColor: "#1d6f42" }}
          >
            Descargar Excel
          </Button>
          <Button icon={<FileDoneOutlined />} onClick={() => router.push("/compras")}>
            Ver Órdenes de Compra
          </Button>
          <Button type="primary" icon={<EyeOutlined />} onClick={() => router.push("/requerimientos/detalle")}>
            Ver Detalle Completo
          </Button>
        </Space>
      </div>

      {/* KPI Cards */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={4}>
          <Card styles={{ body: { padding: 12 } }}>
            <Statistic title="Pendientes" value={pendientes} prefix={<ClockCircleOutlined style={{ color: "#faad14" }} />} styles={{ content: { color: "#faad14", fontSize: 22 } }} />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card styles={{ body: { padding: 12 } }}>
            <Statistic title="Aprobados" value={aprobados} prefix={<CheckCircleOutlined style={{ color: "#52c41a" }} />} styles={{ content: { color: "#52c41a", fontSize: 22 } }} />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card styles={{ body: { padding: 12 } }}>
            <Statistic title="En Cotización" value={enCot} styles={{ content: { color: brand.cyan, fontSize: 22 } }} />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card styles={{ body: { padding: 12 } }}>
            <Statistic title="Por Solicitar" value={porSolicitar} prefix={<ShoppingCartOutlined style={{ color: "#cf1322" }} />} styles={{ content: { color: "#cf1322", fontSize: 22 } }} />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card styles={{ body: { padding: 12 } }}>
            <Statistic title="En OC" value={enOC} prefix={<FileDoneOutlined style={{ color: brand.navy }} />} styles={{ content: { color: brand.navy, fontSize: 22 } }} />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card styles={{ body: { padding: 12 } }}>
            <Statistic title="Total Activos" value={activos.length} styles={{ content: { color: "#666", fontSize: 22 } }} />
          </Card>
        </Col>
      </Row>

      {/* Filtros */}
      <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={8} md={6}>
            <Input
              placeholder="Buscar material, OT, OC..."
              prefix={<SearchOutlined />}
              allowClear
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              placeholder="Estado REQ"
              allowClear
              style={{ width: "100%" }}
              value={estado || undefined}
              onChange={(v) => setEstado(v ?? "")}
              options={[
                { value: "Pendiente", label: "Pendiente" },
                { value: "Aprobado", label: "Aprobado" },
                { value: "En PO", label: "En OC" },
                { value: "COM", label: "Completado" },
                { value: "ANU", label: "Anulado" },
              ]}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              placeholder="Tipo"
              allowClear
              style={{ width: "100%" }}
              value={tipo || undefined}
              onChange={(v) => setTipo(v ?? "")}
              options={[
                { value: "MAC", label: "MAC - Material" },
                { value: "SER", label: "SER - Servicio" },
                { value: "CAD", label: "CAD - Cargo directo" },
              ]}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Button icon={<ReloadOutlined />} onClick={fetchData} block>
              Actualizar
            </Button>
          </Col>
          {sinStock > 0 && (
            <Col>
              <Tag icon={<WarningOutlined />} color="red" style={{ padding: "6px 12px", fontSize: 13 }}>
                {sinStock} sin stock
              </Tag>
            </Col>
          )}
        </Row>
      </Card>

      <Table
        rowKey="id"
        columns={columnasVisibles}
        dataSource={data}
        loading={loading}
        pagination={{
          pageSize: 20,
          showTotal: (t) => `${t} requerimientos`,
        }}
        scroll={{ x: 1800 }}
        size="small"
      />
    </div>
  );
}
