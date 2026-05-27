"use client";

// Página /suministros — vista del almacén de suministros (consumibles que
// gestiona Don Juve: trapos, pintura, pernos, disolventes, etc.).
//
// Reutiliza /api/stock + /api/movimientos sin schema nuevo. Filtra por:
//   - categoria_codigo / clasificacion_codigo configurable
//   - O por una palabra clave "suministro" en la descripción si no hay categoría
//
// Cuando se implementen los 3 almacenes formalmente con su propia tabla,
// esta página se conectará a ese modelo. Por ahora es una vista filtrada.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Typography, Card, Table, Tag, Space, Button, Row, Col, Statistic, Empty,
  Input, App, Tooltip, Alert,
} from "antd";
import {
  InboxOutlined, ReloadOutlined, SearchOutlined, ArrowDownOutlined, ArrowUpOutlined,
  CheckCircleOutlined, WarningOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { brand } from "@/lib/theme";
import { EditableCell } from "@/components/EditableCell";
import { filtroPorColumna, paginacionEstandar } from "@/lib/tables";

const { Title, Text } = Typography;

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
  precio: number | null;
  moneda: string | null;
  fabricante: string | null;
  categoria: string | null;
  clasificacion: string | null;
  alerta: "OK" | "BAJO" | "SIN" | "EXCESO";
}

// Lista de codigos / palabras que identifican a un suministro consumible.
// Si no hay match, la página muestra "sin suministros configurados".
const FILTRO_CATEGORIA = ["SUM", "SUMI", "SUMINISTRO", "CONS", "CONSUMIBLE"];
const FILTRO_PALABRAS = ["trapo", "pintura", "perno", "disolvente", "lija", "tornillo", "tuerca", "wd-40", "thinner", "lubricante"];

function esSuministro(item: StockItem): boolean {
  const cat = (item.categoria ?? "").toUpperCase();
  if (FILTRO_CATEGORIA.includes(cat)) return true;
  const desc = (item.descripcion ?? "").toLowerCase();
  return FILTRO_PALABRAS.some((p) => desc.includes(p));
}

export default function SuministrosPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const [data, setData] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stock");
      const json = await res.json();
      setData(json.data ?? []);
    } catch {
      message.error("Error al cargar suministros");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Filtrar a sólo los que califican como suministro
  const suministros = useMemo(() => data.filter(esSuministro), [data]);

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suministros;
    return suministros.filter((s) =>
      s.codigo.toLowerCase().includes(q) ||
      (s.descripcion || "").toLowerCase().includes(q) ||
      (s.np ?? "").toLowerCase().includes(q),
    );
  }, [suministros, search]);

  const guardarUbicacion = async (materialId: number, nueva: string | null) => {
    const res = await fetch(`/api/materiales/${materialId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ubicacion: nueva ?? "" }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      message.error(j.error ?? "Error");
      throw new Error(j.error ?? "Error");
    }
    setData((prev) => prev.map((r) => (r.material_id === materialId ? { ...r, ubicacion: nueva } : r)));
    message.success("Ubicación actualizada");
  };

  const totalItems = filtrados.length;
  const sinStock = filtrados.filter((s) => s.stock_actual <= 0).length;
  const bajoStock = filtrados.filter((s) => s.punto_reposicion > 0 && s.stock_actual > 0 && s.stock_actual <= s.punto_reposicion).length;
  const conMinMax = filtrados.filter((s) => s.punto_reposicion > 0 && s.stock_maximo > 0).length;

  const columns: ColumnsType<StockItem> = [
    {
      key: "alerta", title: "Estado", width: 90, align: "center",
      render: (_, r) => {
        if (r.alerta === "SIN") return <Tag icon={<WarningOutlined />} color="error">Sin stock</Tag>;
        if (r.alerta === "BAJO") return <Tag icon={<WarningOutlined />} color="warning">Bajo</Tag>;
        if (r.alerta === "EXCESO") return <Tag color="purple">Exceso</Tag>;
        return <Tag icon={<CheckCircleOutlined />} color="success">OK</Tag>;
      },
    },
    {
      key: "codigo", title: "Código", dataIndex: "codigo", width: 110, fixed: "left",
      render: (v: string) => <Text strong style={{ fontSize: 11, color: brand.navy }}>{v}</Text>,
    },
    { key: "descripcion", title: "Descripción", dataIndex: "descripcion", ellipsis: true, ...filtroPorColumna(filtrados, "descripcion") },
    { key: "np", title: "N/P", dataIndex: "np", width: 100, ...filtroPorColumna(filtrados, "np") },
    {
      key: "stock_actual", title: "Stock", dataIndex: "stock_actual", width: 90, align: "right",
      sorter: (a, b) => a.stock_actual - b.stock_actual,
      render: (v: number, r) => (
        <span style={{ fontWeight: 600, color: r.alerta === "SIN" ? "#cf1322" : r.alerta === "BAJO" ? "#faad14" : "#52c41a" }}>
          {v}
        </span>
      ),
    },
    { key: "um", title: "UM", dataIndex: "unidad_medida", width: 60, align: "center" },
    {
      key: "pto_repo", title: "Pto. Repo", dataIndex: "punto_reposicion", width: 90, align: "right",
      render: (v: number) => v > 0 ? v : <Text type="secondary">—</Text>,
    },
    {
      key: "stock_max", title: "Máximo", dataIndex: "stock_maximo", width: 90, align: "right",
      render: (v: number) => v > 0 ? v : <Text type="secondary">—</Text>,
    },
    {
      key: "ubicacion", title: "Ubicación", dataIndex: "ubicacion", width: 130,
      render: (v: string | null, r) => (
        <EditableCell
          value={v}
          type="string"
          emptyPlaceholder="+ ubicar"
          onSave={async (next) => {
            const txt = (next == null || next === "") ? null : String(next).trim() || null;
            await guardarUbicacion(r.material_id, txt);
          }}
        />
      ),
    },
    {
      key: "fabricante", title: "Fabricante", dataIndex: "fabricante", width: 100,
      render: (v: string | null) => v ? <Tag>{v}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      key: "precio", title: "Precio Último", dataIndex: "precio", width: 110, align: "right",
      render: (v: number | null, r) => v != null ? `${r.moneda || ""} ${v.toFixed(2)}` : <Text type="secondary">—</Text>,
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
        <Title level={3} style={{ margin: 0 }}>
          <InboxOutlined style={{ marginRight: 8 }} />
          Almacén de suministros
        </Title>
        <Space>
          <Tooltip title="Ir a movimientos para registrar entrada/salida">
            <Button icon={<ArrowDownOutlined />} onClick={() => router.push("/movimientos")}>
              Registrar movimiento
            </Button>
          </Tooltip>
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>Actualizar</Button>
        </Space>
      </div>

      <Alert
        type="info" showIcon style={{ marginBottom: 12 }}
        title="Consumibles que se entregan a una OT (trapos, pintura, pernos, disolventes, etc.)"
        description={
          <div style={{ fontSize: 12 }}>
            Esta vista muestra materiales identificados como suministros por categoría
            (<b>{FILTRO_CATEGORIA.join(", ")}</b>) o por palabras clave en la descripción.
            Para gestionar ingresos/salidas usá <a onClick={() => router.push("/movimientos")}>Movimiento de repuestos</a> con el tipo de ingreso correspondiente.
          </div>
        }
      />

      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Total suministros" value={totalItems} prefix={<InboxOutlined style={{ color: brand.navy }} />} styles={{ content: { color: brand.navy, fontSize: 22 } }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Sin stock" value={sinStock} prefix={<WarningOutlined style={{ color: "#ff4d4f" }} />} styles={{ content: { color: "#ff4d4f", fontSize: 22 } }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Bajo stock" value={bajoStock} prefix={<WarningOutlined style={{ color: "#faad14" }} />} styles={{ content: { color: "#faad14", fontSize: 22 } }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Con mín/máx" value={conMinMax} prefix={<CheckCircleOutlined style={{ color: "#13c2c2" }} />} styles={{ content: { color: "#13c2c2", fontSize: 22 } }} />
          </Card>
        </Col>
      </Row>

      <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: 10 } }}>
        <Input
          placeholder="Buscar código, descripción, N/P..."
          prefix={<SearchOutlined />}
          allowClear
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 360 }}
        />
      </Card>

      {filtrados.length === 0 && !loading ? (
        <Empty
          description={
            <div>
              <p>No hay materiales clasificados como suministro.</p>
              <p style={{ fontSize: 12, color: "#888" }}>
                Para que un material aparezca acá, asigná categoría <b>SUM</b> en el catálogo de materiales,
                o nombrá su descripción con palabras como “trapo”, “pintura”, “pernos”, etc.
              </p>
            </div>
          }
        />
      ) : (
        <Card>
          <Table<StockItem>
            rowKey="material_id"
            size="small"
            columns={columns}
            dataSource={filtrados}
            loading={loading}
            pagination={paginacionEstandar({
              current: page,
              pageSize,
              total: filtrados.length,
              onChange: (p, s) => { setPage(p); setPageSize(s); },
              label: "suministro(s)",
            })}
            scroll={{ x: 1200 }}
          />
        </Card>
      )}
    </div>
  );
}
