"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Typography, Card, Table, Tag, Space, Button, Row, Col, Statistic, Empty,
  Popconfirm, App, Tooltip, Alert,
} from "antd";
import {
  ExportOutlined, ReloadOutlined, CheckCircleOutlined, WarningOutlined,
  ToolOutlined, InboxOutlined, EyeOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { brand } from "@/lib/theme";
import {
  numeracionColumn, useColumnasOcultas, ColumnasToggleButton, visibleColumns,
  filtroPorColumna, STICKY_HEADER, useColumnasRedimensionables,
} from "@/lib/tables";

const { Title, Text } = Typography;

interface Item {
  id: number;
  ot_id: number;
  nro_req: string | null;
  item_req: number | null;
  descripcion: string | null;
  cantidad: number | string;
  cantidad_recibida: number | string | null;
  unidad_medida: string | null;
  material_id: number | null;
  po_id: number | null;
  status_oc_codigo: string | null;
  material: { codigo: string; descripcion: string; stock_actual: number | string | null; ubicacion: string | null } | null;
  compra: { numero_po: string; status_oc_codigo: string | null } | null;
  orden_trabajo: {
    id: number; ot: string | null;
    cliente: { codigo: string; razon_social: string; nombre_comercial: string | null } | null;
    codigo_reparacion: { codigo: string; descripcion: string } | null;
  } | null;
  _cant_pendiente: number;
  _puede_despachar: boolean;
  _po_status: string | null;
  _po_recibida: boolean;
}

interface GrupoOT {
  ot_id: number;
  ot: string | null;
  cliente: string | null;
  codigo_reparacion: string | null;
  recursos_status: string | null;
  ubicacion: string | null;
  items: Item[];
  con_stock: number;
  sin_stock: number;
  estado_ot: "completa" | "incompleta";
}

export default function DespachosPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const [grupos, setGrupos] = useState<GrupoOT[]>([]);
  const [loading, setLoading] = useState(false);
  const [seleccionados, setSeleccionados] = useState<Record<number, number[]>>({}); // otId -> reqIds
  const [submitting, setSubmitting] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/despachos/ot");
      const json = await res.json();
      setGrupos(json.data ?? []);
    } catch {
      message.error("Error al cargar despachos pendientes");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const despachar = async (otId: number) => {
    const ids = seleccionados[otId] ?? [];
    if (ids.length === 0) {
      message.warning("Seleccioná al menos un item.");
      return;
    }
    try {
      setSubmitting(otId);
      const res = await fetch(`/api/despachos/ot/${otId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requerimiento_ids: ids }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      message.success(json.message || "Despachado");
      if (json.errores?.length) {
        message.warning(`${json.errores.length} item(s) con error: ${json.errores.map((e: { error: string }) => e.error).join(", ")}`);
      }
      setSeleccionados((prev) => ({ ...prev, [otId]: [] }));
      fetchData();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(null);
    }
  };

  const totalItems = grupos.reduce((s, g) => s + g.items.length, 0);
  const totalConStock = grupos.reduce((s, g) => s + g.con_stock, 0);
  const totalSinStock = grupos.reduce((s, g) => s + g.sin_stock, 0);
  const otsCompletas = grupos.filter((g) => g.estado_ot === "completa").length;
  const otsIncompletas = grupos.filter((g) => g.estado_ot === "incompleta").length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
        <Title level={3} style={{ margin: 0 }}>
          <ExportOutlined style={{ marginRight: 8 }} />
          Despachos por OT
        </Title>
        <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>Actualizar</Button>
      </div>

      <Alert
        type="info" showIcon style={{ marginBottom: 12 }}
        title="¿Qué es esto?"
        description="OTs con requerimientos APROBADOS pendientes de entrega. Incluye items con OC ya recibida (material llegó al almacén) e items que ya estaban en stock. Una OT 'completa' tiene todos sus items con stock listo; 'incompleta' espera que llegue parte del material. Podés despachar parcial o completo: descuenta stock + marca ENTREGADO/INCOMPLETO + deja traza en historial."
      />

      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} md={4}><Card><Statistic title="OTs pendientes" value={grupos.length} prefix={<InboxOutlined style={{ color: brand.navy }} />} /></Card></Col>
        <Col xs={12} md={5}><Card><Statistic title="OTs completas" value={otsCompletas} styles={{ content: { color: "#52c41a" } }} prefix={<CheckCircleOutlined style={{ color: "#52c41a" }} />} /></Card></Col>
        <Col xs={12} md={5}><Card><Statistic title="OTs incompletas" value={otsIncompletas} styles={{ content: { color: otsIncompletas > 0 ? "#fa8c16" : "#bfbfbf" } }} prefix={<WarningOutlined style={{ color: otsIncompletas > 0 ? "#fa8c16" : "#bfbfbf" }} />} /></Card></Col>
        <Col xs={12} md={5}><Card><Statistic title="Items listos" value={totalConStock} styles={{ content: { color: "#52c41a" } }} /></Card></Col>
        <Col xs={12} md={5}><Card><Statistic title="Items sin stock" value={totalSinStock} styles={{ content: { color: totalSinStock > 0 ? "#cf1322" : "#bfbfbf" } }} /></Card></Col>
      </Row>

      {grupos.length === 0 && !loading ? (
        <Empty description="No hay despachos pendientes." />
      ) : (
        grupos.map((g) => <GrupoCard
          key={g.ot_id}
          grupo={g}
          seleccionados={seleccionados[g.ot_id] ?? []}
          onSelectChange={(ids) => setSeleccionados((prev) => ({ ...prev, [g.ot_id]: ids }))}
          onDespachar={() => despachar(g.ot_id)}
          submitting={submitting === g.ot_id}
          router={router}
        />)
      )}
    </div>
  );
}

function GrupoCard({
  grupo, seleccionados, onSelectChange, onDespachar, submitting, router,
}: {
  grupo: GrupoOT;
  seleccionados: number[];
  onSelectChange: (ids: number[]) => void;
  onDespachar: () => void;
  submitting: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  const { ocultas, setOcultas } = useColumnasOcultas(`despachos-ot-${grupo.ot_id}-cols-v1`);

  const columns: ColumnsType<Item> = [
    numeracionColumn<Item>(),
    {
      key: "nro_req", title: "Req / Item", width: 130,
      ...filtroPorColumna(grupo.items, "nro_req"),
      render: (_, r) => <Text strong style={{ fontSize: 12 }}>{r.nro_req ?? "—"}/{r.item_req ?? "—"}</Text>,
    },
    {
      key: "codigo", title: "Código", width: 110,
      render: (_, r) => r.material?.codigo ?? "—",
    },
    {
      key: "desc", title: "Descripción", ellipsis: true,
      render: (_, r) => r.material?.descripcion ?? r.descripcion ?? "—",
    },
    {
      key: "cantidad", title: "Pedido", width: 100, align: "right",
      render: (_, r) => `${Number(r.cantidad).toLocaleString()} ${r.unidad_medida ?? ""}`,
    },
    {
      key: "pendiente", title: "Pendiente", width: 100, align: "right",
      render: (_, r) => <span style={{ fontWeight: 600 }}>{r._cant_pendiente.toLocaleString()}</span>,
    },
    {
      key: "stock", title: "Stock alm.", width: 90, align: "right",
      render: (_, r) => {
        const st = Number(r.material?.stock_actual ?? 0);
        return <span style={{ color: r._puede_despachar ? "#52c41a" : "#cf1322", fontWeight: 600 }}>{st}</span>;
      },
    },
    {
      key: "origen", title: "Origen / PO", width: 150, align: "center",
      render: (_, r) => {
        if (!r.po_id) return <Tag color="default">Stock directo</Tag>;
        const recibida = r._po_recibida;
        return (
          <Tooltip title={`PO ${r.compra?.numero_po ?? r.po_id} — ${r._po_status ?? "—"}`}>
            <Tag color={recibida ? "green" : "orange"}>
              {r.compra?.numero_po ?? `PO#${r.po_id}`} {recibida ? "✓ recibida" : "⏳ por llegar"}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      key: "ubicacion", title: "Ubicación", width: 110,
      render: (_, r) => r.material?.ubicacion ? <Tag>{r.material.ubicacion}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      key: "puede", title: "Puede despachar", width: 130, align: "center",
      render: (_, r) => r._puede_despachar
        ? <Tag color="green">✓ Sí</Tag>
        : <Tag color="red">✗ Sin stock</Tag>,
    },
  ];

  const { columnas: columnsResizable, components: tableComponents } =
    useColumnasRedimensionables<Item>(columns, "despachos-list-cols-widths-v1");

  // Solo items que pueden despacharse (stock suficiente para lo pendiente)
  const itemsConStock = grupo.items.filter((i) => i._puede_despachar);

  return (
    <Card
      size="small"
      style={{ marginBottom: 12 }}
      title={
        <Space wrap>
          <Tag color={brand.navy} style={{ fontSize: 14, padding: "4px 8px" }}>{grupo.ot ?? `OT #${grupo.ot_id}`}</Tag>
          <Text>{grupo.cliente ?? "—"}</Text>
          {grupo.codigo_reparacion && <Text type="secondary">| {grupo.codigo_reparacion}</Text>}
          {grupo.estado_ot === "completa"
            ? <Tag color="green" style={{ fontWeight: 600 }}>OT COMPLETA — lista para despachar</Tag>
            : <Tag color="orange" style={{ fontWeight: 600 }}>OT INCOMPLETA — falta material</Tag>}
          {grupo.recursos_status && <Tag color="blue">{grupo.recursos_status}</Tag>}
          {grupo.ubicacion
            ? <Tag color="purple">📍 {grupo.ubicacion}</Tag>
            : <Tag>📍 Sin ubicación (asignar al recibir PO)</Tag>}
          <Tag color="green">{grupo.con_stock} listo(s)</Tag>
          {grupo.sin_stock > 0 && <Tag color="red">{grupo.sin_stock} sin stock</Tag>}
        </Space>
      }
      extra={
        <Space>
          <Tooltip title="Ver OT">
            <Button size="small" icon={<EyeOutlined />} onClick={() => router.push(`/ordenes-trabajo/${grupo.ot_id}`)} />
          </Tooltip>
          <ColumnasToggleButton<Item>
            columns={columns}
            ocultas={ocultas}
            setOcultas={setOcultas}
            obligatorias={["nro_req", "desc", "cantidad", "puede"]}
          />
          <Popconfirm
            title={`Despachar ${seleccionados.length} item(s)?`}
            description="Se descontará del stock y se marcará como ENTREGADO."
            onConfirm={onDespachar}
            okText="Despachar" cancelText="Cancelar"
            disabled={seleccionados.length === 0}
          >
            <Button
              type="primary"
              icon={<ExportOutlined />}
              disabled={seleccionados.length === 0}
              loading={submitting}
            >
              Despachar seleccionados ({seleccionados.length})
            </Button>
          </Popconfirm>
        </Space>
      }
    >
      <Table<Item>
        rowKey="id"
        size="small"
        columns={visibleColumns(columnsResizable, ocultas)}
        components={tableComponents}
        dataSource={grupo.items}
        sticky={STICKY_HEADER}
        pagination={false}
        rowSelection={{
          selectedRowKeys: seleccionados,
          onChange: (keys) => onSelectChange(keys as number[]),
          getCheckboxProps: (r) => ({ disabled: !r._puede_despachar }),
        }}
        footer={() => (
          <Space>
            <Button size="small" onClick={() => onSelectChange(itemsConStock.map((i) => i.id))} disabled={itemsConStock.length === 0}>
              Seleccionar todos con stock ({itemsConStock.length})
            </Button>
            <Button size="small" onClick={() => onSelectChange([])} disabled={seleccionados.length === 0}>
              Limpiar selección
            </Button>
          </Space>
        )}
      />
    </Card>
  );
}
