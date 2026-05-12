"use client";

import { useState, useEffect, useCallback } from "react";
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
  App,
  Statistic,
  Popover,
  Tooltip,
} from "antd";
import {
  SearchOutlined,
  ReloadOutlined,
  ArrowUpOutlined,
  DatabaseOutlined,
  InboxOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  FileDoneOutlined,
  InfoCircleOutlined,
  FileExcelOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { brand } from "@/lib/theme";
import {
  numeracionColumn,
  paginacionEstandar,
  PAGINATION_PAGE_SIZE,
  useColumnasOcultas,
  ColumnasToggleButton,
  visibleColumns,
  filtroPorColumna,
} from "@/lib/tables";
import dayjs from "dayjs";


const { Title } = Typography;

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

const alertaColor: Record<string, string> = {
  OK: "green",
  BAJO: "orange",
  SIN: "red",
  EXCESO: "purple",
};

export default function StockPage() {
  const { message } = App.useApp();
  const [data, setData] = useState<StockItem[]>([]);
  const [kpis, setKpis] = useState<StockKPIs>({
    totalMateriales: 0, sinStock: 0, bajoStock: 0,
    exceso: 0, enPO: 0, enReq: 0, porSolicitar: 0,
    valorTotal: 0,
  });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState<string>("todos");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGINATION_PAGE_SIZE);
  const { ocultas, setOcultas } = useColumnasOcultas("stock-list-cols-v1");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtro !== "todos") params.set("filtro", filtro);
      if (search) params.set("search", search);
      const res = await fetch(`/api/stock?${params}`);
      const json = await res.json();
      setData(json.data ?? []);
      setKpis(json.kpis ?? {});
    } catch {
      message.error("Error al cargar stock");
    } finally {
      setLoading(false);
    }
  }, [filtro, search, message]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const popoverContent = (r: StockItem) => (
    <div style={{ maxWidth: 380, fontSize: 12 }}>
      <div style={{ fontWeight: 600, color: brand.navy, marginBottom: 6 }}>{r.descripcion}</div>
      <Row gutter={[8, 4]}>
        <Col span={12}><span style={{ color: "#888" }}>Código:</span> <b>{r.codigo}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>N/P:</span> <b>{r.np || "-"}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>Stock actual:</span> <b style={{ color: r.alerta === "SIN" ? "#ff4d4f" : r.alerta === "BAJO" ? "#faad14" : r.alerta === "EXCESO" ? "#722ed1" : "#52c41a" }}>{r.stock_actual}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>UM:</span> <b>{r.unidad_medida || "-"}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>Pto. reposición:</span> <b>{r.punto_reposicion}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>Stock máximo:</span> <b>{r.stock_maximo}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>En POs (entrante):</span> <b style={{ color: "#1677ff" }}>+{r.cantidad_en_po}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>En REQ (a solicitar):</span> <b style={{ color: "#faad14" }}>{r.cantidad_en_req}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>Stock proyectado:</span> <b style={{ color: brand.cyan }}>{r.stock_proyectado}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>Por solicitar:</span> <b style={{ color: r.por_solicitar > 0 ? "#cf1322" : "#666" }}>{r.por_solicitar}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>Almacén:</span> <b>{r.almacen || "-"}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>Ubicación:</span> <b>{r.ubicacion || "-"}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>Caja:</span> <b>{r.caja || "-"}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>Fabricante:</span> <b>{r.fabricante || "-"}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>Precio:</span> <b>{r.precio ? `${r.moneda || ""} ${r.precio.toFixed(2)}` : "-"}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>Valor total:</span> <b style={{ color: brand.navy }}>{r.moneda || "USD"} {r.valor_total.toFixed(2)}</b></Col>
        {r.pos_pendientes.length > 0 && (
          <Col span={24} style={{ borderTop: `1px dashed ${brand.border}`, paddingTop: 4, marginTop: 4 }}>
            <span style={{ color: "#888" }}>POs:</span>{" "}
            {r.pos_pendientes.slice(0, 4).map((po, i) => (
              <Tag key={i} color="blue" style={{ fontSize: 10 }}>{po}</Tag>
            ))}
          </Col>
        )}
        {r.reqs_pendientes.length > 0 && (
          <Col span={24}>
            <span style={{ color: "#888" }}>REQs:</span>{" "}
            {r.reqs_pendientes.slice(0, 4).map((req, i) => (
              <Tag key={i} color="orange" style={{ fontSize: 10 }}>{req}</Tag>
            ))}
          </Col>
        )}
      </Row>
    </div>
  );

  const valoresUnicos = (campo: keyof StockItem) => {
    const set = new Set<string>();
    data.forEach((r) => {
      const v = r[campo];
      if (v !== null && v !== undefined && v !== "") set.add(String(v));
    });
    return [...set].sort().map((v) => ({ text: v, value: v }));
  };

  const columns: ColumnsType<StockItem> = [
    numeracionColumn<StockItem>({ current: page, pageSize }),
    {
      key: "alerta",
      title: "Alerta",
      dataIndex: "alerta",
      width: 90,
      fixed: "left",
      filters: [
        { text: "Sin stock", value: "SIN" },
        { text: "Bajo stock", value: "BAJO" },
        { text: "OK", value: "OK" },
        { text: "Exceso", value: "EXCESO" },
      ],
      onFilter: (value, r) => r.alerta === value,
      render: (v: string) => (
        <Tag color={alertaColor[v]} icon={v === "SIN" || v === "BAJO" ? <WarningOutlined /> : <CheckCircleOutlined />}>
          {v === "SIN" ? "Sin" : v === "BAJO" ? "Bajo" : v === "EXCESO" ? "Exceso" : "OK"}
        </Tag>
      ),
    },
    {
      key: "codigo",
      title: "Código",
      dataIndex: "codigo",
      width: 110,
      fixed: "left",
      filters: valoresUnicos("codigo"),
      filterSearch: true,
      onFilter: (value, r) => r.codigo === value,
      sorter: (a, b) => (a.codigo || "").localeCompare(b.codigo || ""),
    },
    {
      key: "descripcion",
      title: "Descripción",
      dataIndex: "descripcion",
      width: 280,
      ellipsis: true,
      ...filtroPorColumna(data, "descripcion"),
      render: (v: string, r: StockItem) => (
        <Popover content={popoverContent(r)} placement="right" mouseEnterDelay={0.3} trigger="hover">
          <div style={{ cursor: "help", display: "flex", alignItems: "center", gap: 4 }}>
            <InfoCircleOutlined style={{ color: brand.cyan, fontSize: 11 }} />
            {v}
          </div>
        </Popover>
      ),
    },
    { key: "np", title: "N/P", dataIndex: "np", width: 110, ...filtroPorColumna(data, "np") },
    {
      key: "stock_actual",
      title: "Stock",
      dataIndex: "stock_actual",
      width: 80,
      align: "right",
      sorter: (a, b) => a.stock_actual - b.stock_actual,
      render: (v: number, r: StockItem) => (
        <span style={{ fontWeight: 600, color: r.alerta === "SIN" ? "#ff4d4f" : r.alerta === "BAJO" ? "#faad14" : r.alerta === "EXCESO" ? "#722ed1" : "#52c41a" }}>
          {v.toLocaleString("en", { maximumFractionDigits: 2 })}
        </span>
      ),
    },
    { key: "unidad_medida", title: "UM", dataIndex: "unidad_medida", width: 55, align: "center", ...filtroPorColumna(data, "unidad_medida") },
    {
      key: "cantidad_en_po",
      title: "En POs",
      dataIndex: "cantidad_en_po",
      width: 90,
      align: "right",
      sorter: (a, b) => a.cantidad_en_po - b.cantidad_en_po,
      render: (v: number, r: StockItem) =>
        v > 0 ? (
          <Tooltip title={`POs: ${r.pos_pendientes.join(", ") || "-"}`}>
            <Tag color="blue" style={{ fontWeight: 600 }}>+{v}</Tag>
          </Tooltip>
        ) : (
          <span style={{ color: "#bbb" }}>—</span>
        ),
    },
    {
      key: "cantidad_en_req",
      title: "En REQ",
      dataIndex: "cantidad_en_req",
      width: 90,
      align: "right",
      sorter: (a, b) => a.cantidad_en_req - b.cantidad_en_req,
      render: (v: number, r: StockItem) =>
        v > 0 ? (
          <Tooltip title={`REQs pendientes: ${r.reqs_pendientes.join(", ") || "-"}`}>
            <Tag color="orange" style={{ fontWeight: 600 }}>{v}</Tag>
          </Tooltip>
        ) : (
          <span style={{ color: "#bbb" }}>—</span>
        ),
    },
    {
      key: "stock_proyectado",
      title: "Proyectado",
      dataIndex: "stock_proyectado",
      width: 100,
      align: "right",
      sorter: (a, b) => a.stock_proyectado - b.stock_proyectado,
      render: (v: number) => (
        <Tooltip title="Stock + lo entrante en POs - lo solicitado en REQ">
          <b style={{ color: v < 0 ? "#cf1322" : v === 0 ? "#faad14" : brand.cyan }}>
            {v.toLocaleString("en", { maximumFractionDigits: 2 })}
          </b>
        </Tooltip>
      ),
    },
    {
      key: "punto_reposicion",
      title: "Pto. Repo",
      dataIndex: "punto_reposicion",
      width: 90,
      align: "right",
      sorter: (a, b) => Number(a.punto_reposicion) - Number(b.punto_reposicion),
      filters: [...new Set(data.map((r) => Number(r.punto_reposicion)))]
        .sort((a, b) => a - b).map((v) => ({ text: String(v), value: String(v) })),
      filterSearch: true,
      onFilter: (value, r) => String(Number(r.punto_reposicion)) === value,
    },
    {
      key: "stock_maximo", title: "Máximo", dataIndex: "stock_maximo", width: 80, align: "right",
      sorter: (a, b) => Number(a.stock_maximo) - Number(b.stock_maximo),
      filters: [...new Set(data.map((r) => Number(r.stock_maximo)))]
        .sort((a, b) => a - b).map((v) => ({ text: String(v), value: String(v) })),
      filterSearch: true,
      onFilter: (value, r) => String(Number(r.stock_maximo)) === value,
    },
    {
      key: "por_solicitar",
      title: "Por Solicitar",
      dataIndex: "por_solicitar",
      width: 110,
      align: "right",
      sorter: (a, b) => a.por_solicitar - b.por_solicitar,
      render: (v: number) =>
        v > 0 ? (
          <Tag color="red" style={{ fontWeight: 600 }}>↑ {v}</Tag>
        ) : (
          <span style={{ color: "#bbb" }}>—</span>
        ),
    },
    {
      key: "almacen",
      title: "Almacén",
      dataIndex: "almacen",
      width: 130,
      filters: valoresUnicos("almacen"),
      filterSearch: true,
      onFilter: (value, r) => r.almacen === value,
      render: (v: string | null) => v || <span style={{ color: "#bbb" }}>—</span>,
    },
    { key: "ubicacion", title: "Ubicación", dataIndex: "ubicacion", width: 110, ...filtroPorColumna(data, "ubicacion") },
    {
      key: "fabricante",
      title: "Fabricante",
      dataIndex: "fabricante",
      width: 110,
      filters: valoresUnicos("fabricante"),
      filterSearch: true,
      onFilter: (value, r) => r.fabricante === value,
    },
    {
      key: "precio",
      title: "Precio",
      dataIndex: "precio",
      width: 100,
      align: "right",
      render: (v: number | null, r: StockItem) => (v != null ? `${r.moneda || ""} ${v.toFixed(2)}` : "-"),
    },
    {
      key: "valor_total",
      title: "Valor Total",
      dataIndex: "valor_total",
      width: 120,
      align: "right",
      sorter: (a, b) => a.valor_total - b.valor_total,
      render: (v: number) => <b style={{ color: brand.navy }}>{v.toFixed(2)}</b>,
    },
  ];

  const exportarStockExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const rows = data.map((m) => ({
        Alerta: m.alerta,
        Código: m.codigo,
        Descripción: m.descripcion,
        "N/P": m.np ?? "",
        Stock: m.stock_actual,
        UM: m.unidad_medida ?? "",
        "En POs": m.cantidad_en_po,
        "POs Pendientes": m.pos_pendientes.join(", "),
        "En REQ": m.cantidad_en_req,
        "REQs Pendientes": m.reqs_pendientes.join(", "),
        "Stock Proyectado": m.stock_proyectado,
        "Pto. Reposición": m.punto_reposicion,
        Máximo: m.stock_maximo,
        "Por Solicitar": m.por_solicitar,
        Almacén: m.almacen ?? "",
        Ubicación: m.ubicacion ?? "",
        Fabricante: m.fabricante ?? "",
        Categoría: m.categoria ?? "",
        Precio: m.precio ?? "",
        Moneda: m.moneda ?? "",
        "Valor Total": m.valor_total,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Stock");
      XLSX.writeFile(wb, `Stock-${dayjs().format("YYYYMMDD-HHmm")}.xlsx`);
      message.success("Excel descargado");
    } catch {
      message.error("Error al exportar Excel");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          <DatabaseOutlined style={{ marginRight: 8, color: brand.navy }} />
          Stock de Materiales
        </Title>
        <Space>
          <ColumnasToggleButton<StockItem>
            columns={columns}
            ocultas={ocultas}
            setOcultas={setOcultas}
            obligatorias={["__num", "codigo", "descripcion"]}
          />
          <Button
            icon={<FileExcelOutlined />}
            onClick={exportarStockExcel}
            style={{ background: "#1d6f42", color: "#fff", borderColor: "#1d6f42" }}
          >
            Descargar Excel
          </Button>
        </Space>
      </div>

      {/* KPIs */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} md={6} lg={3}>
          <Card styles={{ body: { padding: 12 } }} hoverable onClick={() => setFiltro("todos")}>
            <Statistic title="Total" value={kpis.totalMateriales} prefix={<DatabaseOutlined style={{ color: brand.navy }} />} styles={{ content: { color: brand.navy, fontSize: 22 } }} />
          </Card>
        </Col>
        <Col xs={12} md={6} lg={3}>
          <Card styles={{ body: { padding: 12 } }} hoverable onClick={() => setFiltro("sin_stock")}>
            <Statistic title="Sin stock" value={kpis.sinStock} prefix={<WarningOutlined style={{ color: "#ff4d4f" }} />} styles={{ content: { color: "#ff4d4f", fontSize: 22 } }} />
          </Card>
        </Col>
        <Col xs={12} md={6} lg={3}>
          <Card styles={{ body: { padding: 12 } }} hoverable onClick={() => setFiltro("bajo_stock")}>
            <Statistic title="Bajo stock" value={kpis.bajoStock} prefix={<WarningOutlined style={{ color: "#faad14" }} />} styles={{ content: { color: "#faad14", fontSize: 22 } }} />
          </Card>
        </Col>
        <Col xs={12} md={6} lg={3}>
          <Card styles={{ body: { padding: 12 } }} hoverable onClick={() => setFiltro("exceso")}>
            <Statistic title="Exceso" value={kpis.exceso ?? 0} prefix={<ArrowUpOutlined style={{ color: "#722ed1" }} />} styles={{ content: { color: "#722ed1", fontSize: 22 } }} />
          </Card>
        </Col>
        <Col xs={12} md={6} lg={3}>
          <Card styles={{ body: { padding: 12 } }} hoverable onClick={() => setFiltro("en_po")}>
            <Statistic title="En POs" value={kpis.enPO ?? 0} prefix={<InboxOutlined style={{ color: "#1677ff" }} />} styles={{ content: { color: "#1677ff", fontSize: 22 } }} />
          </Card>
        </Col>
        <Col xs={12} md={6} lg={3}>
          <Card styles={{ body: { padding: 12 } }} hoverable onClick={() => setFiltro("en_req")}>
            <Statistic title="En REQ" value={kpis.enReq ?? 0} prefix={<FileDoneOutlined style={{ color: "#fa8c16" }} />} styles={{ content: { color: "#fa8c16", fontSize: 22 } }} />
          </Card>
        </Col>
        <Col xs={12} md={6} lg={3}>
          <Card styles={{ body: { padding: 12 } }} hoverable onClick={() => setFiltro("por_solicitar")}>
            <Statistic title="Por solicitar" value={kpis.porSolicitar ?? 0} prefix={<WarningOutlined style={{ color: "#cf1322" }} />} styles={{ content: { color: "#cf1322", fontSize: 22 } }} />
          </Card>
        </Col>
        <Col xs={12} md={6} lg={3}>
          <Card styles={{ body: { padding: 12 } }}>
            <Statistic title="Valor total" value={kpis.valorTotal} precision={2} prefix="$" styles={{ content: { color: brand.navy, fontSize: 18 } }} />
          </Card>
        </Col>
      </Row>

      <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 12 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={10} md={8}>
            <Input
              placeholder="Buscar código, descripción, N/P..."
              prefix={<SearchOutlined />}
              allowClear
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Col>
          <Col xs={12} sm={8} md={6}>
            <Select
              value={filtro}
              onChange={setFiltro}
              style={{ width: "100%" }}
              options={[
                { value: "todos", label: "Todos los materiales" },
                { value: "sin_stock", label: "Solo sin stock" },
                { value: "bajo_stock", label: "Solo bajo stock" },
                { value: "exceso", label: "Solo en exceso" },
                { value: "en_po", label: "Con cantidad en POs" },
                { value: "en_req", label: "En requerimientos" },
                { value: "por_solicitar", label: "Por solicitar" },
              ]}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Button icon={<ReloadOutlined />} onClick={fetchData} block>
              Actualizar
            </Button>
          </Col>
        </Row>
      </Card>

      <Table
        rowKey="material_id"
        columns={visibleColumns(columns, ocultas)}
        dataSource={data}
        loading={loading}
        pagination={paginacionEstandar({
          current: page,
          pageSize,
          total: data.length,
          onChange: (p, s) => { setPage(p); setPageSize(s); },
          label: "materiales",
        })}
        scroll={{ x: 1700 }}
        size="small"
      />
    </div>
  );
}
