"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Typography, Table, Input, Space, Button, Empty, Row, Col, Card, Statistic,
  Tag, InputNumber, App, Tooltip,
} from "antd";
import { ReloadOutlined, SearchOutlined, FileSearchOutlined, EditOutlined } from "@ant-design/icons";
import type { ColumnsType, ColumnGroupType, ColumnType } from "antd/es/table/interface";
import { brand } from "@/lib/theme";
import {
  useColumnasOcultas, ColumnasToggleButton, visibleColumns, STICKY_HEADER,
  filtroPorColumna,
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
  const [busqueda, setBusqueda] = useState("");
  const [editando, setEditando] = useState<{ matId: number; provId: number } | null>(null);
  const [editValor, setEditValor] = useState<number | null>(null);
  const { ocultas, setOcultas } = useColumnasOcultas("historico-matriz-cols-v1");

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

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return materiales;
    return materiales.filter((m) =>
      (m.codigo || "").toLowerCase().includes(q) ||
      (m.np || "").toLowerCase().includes(q) ||
      (m.descripcion || "").toLowerCase().includes(q) ||
      (m.marca || "").toLowerCase().includes(q));
  }, [materiales, busqueda]);

  const guardarCotizacion = async (matId: number, provId: number, precio: number | null) => {
    try {
      const res = await fetch("/api/compras/cotizaciones", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          material_id: matId, proveedor_id: provId,
          precio_unitario: precio ?? 0, usuario: "Logistica",
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Error");
      message.success(j.message || "Cotización guardada");
      setEditando(null); setEditValor(null);
      fetchData();
    } catch (e) {
      if (e instanceof Error) message.error(e.message);
    }
  };

  const fmt = (n: number | null | undefined) =>
    n == null ? "—" : n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Columnas de identificación (fijas a la izquierda)
  const infoCols: ColumnsType<MatRow> = [
    {
      key: "codigo", title: "Código", dataIndex: "codigo", width: 130, fixed: "left", align: "left",
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
            <Space size={2}>
              <InputNumber
                size="small" autoFocus value={editValor} min={0} step={0.01}
                style={{ width: 80 }}
                onChange={(v) => setEditValor(v == null ? null : Number(v))}
                onPressEnter={() => guardarCotizacion(r.material_id, p.id, editValor)}
              />
              <Button size="small" type="primary" onClick={() => guardarCotizacion(r.material_id, p.id, editValor)}>OK</Button>
            </Space>
          );
        }
        const esGanador = r.proveedor_ganador_id === p.id;
        return (
          <div
            style={{
              cursor: "pointer", padding: "2px 4px", borderRadius: 3,
              background: esGanador ? "#d9f7be" : c?.origen === "cotizacion" ? "#fff7e6" : undefined,
              fontWeight: esGanador ? 700 : 400,
            }}
            title={c ? `${c.origen === "cotizacion" ? "Cotización manual" : "Precio de OC"}${c.fecha ? " · " + new Date(c.fecha).toLocaleDateString("es-PE") : ""} — click para editar` : "Sin precio — click para cotizar"}
            onClick={() => { setEditando({ matId: r.material_id, provId: p.id }); setEditValor(c?.precio ?? null); }}
          >
            {c ? `$ ${fmt(c.precio)}` : <span style={{ color: "#bbb" }}>+ cotizar</span>}
            {c?.origen === "cotizacion" && <EditOutlined style={{ fontSize: 9, marginLeft: 3, color: "#fa8c16" }} />}
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
          <b style={{ color: brand.navy }}>$ {fmt(r.ultima_compra_precio)}</b>
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
        <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>Refrescar</Button>
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
        <Space wrap>
          <Input
            placeholder="Buscar código, N° parte, descripción, marca…"
            prefix={<SearchOutlined />} allowClear
            value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            style={{ width: 360 }}
          />
          <ColumnasToggleButton<MatRow>
            columns={infoCols}
            ocultas={ocultas}
            setOcultas={setOcultas}
            obligatorias={["codigo", "descripcion"]}
          />
          <Tag color="green">Verde = mejor precio</Tag>
          <Tag color="orange">Naranja = cotización manual</Tag>
        </Space>
      </Card>

      {filtradas.length === 0 && !loading ? (
        <Empty description="No hay materiales con precios registrados." />
      ) : (
        <Table<MatRow>
          rowKey="material_id"
          size="small"
          bordered
          columns={[...visibleColumns(infoCols, ocultas), provGroup, ...ofertaCols] as ColumnsType<MatRow>}
          dataSource={filtradas}
          loading={loading}
          sticky={STICKY_HEADER}
          scroll={{ x: "max-content", y: "calc(100vh - 360px)" }}
          pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (t) => `${t} repuestos` }}
        />
      )}
    </div>
  );
}
