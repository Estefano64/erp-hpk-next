"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Table, Tag, Space, Button, Modal, Form, Select, DatePicker, Input,
  message, Empty, Alert, Row, Col, Typography, Tooltip,
} from "antd";
import { FileAddOutlined, ReloadOutlined, InboxOutlined, SearchOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { brand } from "@/lib/theme";
import { useCachedFetch } from "@/lib/useCachedFetch";
import {
  useColumnasOcultas,
  ColumnasToggleButton,
  visibleColumns,
  filtroPorColumna,
  useColumnasRedimensionables,
} from "@/lib/tables";

const { Text } = Typography;

interface Row {
  id: number;
  ot_id: number;
  nro_req: string | null;
  item_req: number | null;
  tipo_codigo: string;
  material_codigo: string | null;
  descripcion: string | null;
  cantidad: string;
  unidad_medida: string | null;
  precio_unitario: string | null;
  moneda: string | null;
  proveedor_id: number | null;
  proveedor: { id: number; razon_social: string } | null;
  orden_trabajo: { id: number; ot: string | null; cliente: { razon_social: string; nombre_comercial: string | null } | null } | null;
  fecha_solicitud: string;
}

interface ProveedorOpt { id: number; razon_social: string; ruc: string | null }
interface UbicacionOpt { codigo: string; nombre: string }

const TIPO_COLOR: Record<string, string> = { MAC: "blue", CAD: "orange", SER: "purple" };

interface Props {
  /** Llamado cuando se generó una OC, para que el padre (lista de OCs) refresque. */
  onOCCreated?: () => void;
}

export default function RequerimientosAprobadosTab({ onOCCreated }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterProv, setFilterProv] = useState<number | undefined>();
  const [selectedKeys, setSelectedKeys] = useState<number[]>([]);
  const [messageApi, contextHolder] = message.useMessage();
  const [modalApi, modalCtx] = Modal.useModal();
  const { ocultas, setOcultas } = useColumnasOcultas("compras-req-aprob-cols-v1");

  // OC modal
  const [ocOpen, setOcOpen] = useState(false);
  const [ocSaving, setOcSaving] = useState(false);
  const [ocForm] = Form.useForm<{
    proveedor_id: number;
    ubicacion_codigo?: string;
    moneda: string;
    fecha_entrega_esperada?: dayjs.Dayjs | null;
    observaciones?: string;
  }>();

  // Catálogos
  type Wrapped<T> = { data: T[] } | null;
  const provRes = useCachedFetch<Wrapped<ProveedorOpt>>("/api/proveedores?limit=500");
  const ubicRes = useCachedFetch<Wrapped<UbicacionOpt>>("/api/catalogos?tabla=ubicacion");
  const proveedoresOpts = (provRes?.data ?? []).map((p) => ({ value: p.id, label: `${p.razon_social}${p.ruc ? ` (${p.ruc})` : ""}` }));
  const ubicacionesOpts = (ubicRes?.data ?? []).map((u) => ({ value: u.codigo, label: `${u.codigo} — ${u.nombre}` }));

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ solo_aprobados_sin_oc: "1", limit: "500" });
      if (search) params.set("search", search);
      if (filterProv) params.set("proveedor_id", String(filterProv));
      const res = await fetch(`/api/requerimientos?${params}`);
      if (res.ok) {
        const j = await res.json();
        setRows(j.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [search, filterProv]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const selectedRows = useMemo(() => rows.filter((r) => selectedKeys.includes(r.id)), [rows, selectedKeys]);
  const proveedoresEnSeleccion = new Set(selectedRows.map((r) => r.proveedor_id ?? null));

  function abrirOcModal() {
    if (selectedRows.length === 0) {
      messageApi.warning("Seleccioná al menos un requerimiento.");
      return;
    }
    if (proveedoresEnSeleccion.size > 1) {
      modalApi.warning({
        title: "Proveedores múltiples",
        content: "Los items seleccionados tienen proveedores distintos. Una OC se crea con UN solo proveedor — los demás se asignarán al proveedor que elijas.",
      });
    }
    const provId = selectedRows.find((r) => r.proveedor_id)?.proveedor_id;
    const moneda = selectedRows.find((r) => r.moneda)?.moneda ?? "USD";
    ocForm.resetFields();
    ocForm.setFieldsValue({ proveedor_id: provId ?? undefined, moneda });
    setOcOpen(true);
  }

  async function onCrearOC() {
    const values = await ocForm.validateFields().catch(() => null);
    if (!values) return;
    setOcSaving(true);
    try {
      const res = await fetch("/api/compras/crear-oc", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repuesto_ids: selectedRows.map((r) => r.id),
          proveedor_id: values.proveedor_id,
          ubicacion_codigo: values.ubicacion_codigo ?? null,
          moneda: values.moneda,
          fecha_entrega_esperada: values.fecha_entrega_esperada ? values.fecha_entrega_esperada.format("YYYY-MM-DD") : null,
          observaciones: values.observaciones ?? null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        messageApi.error(err?.error ?? "Error al generar OC.");
        return;
      }
      const j = await res.json();
      messageApi.success(j.message ?? "OC creada.");
      setOcOpen(false);
      setSelectedKeys([]);
      fetchData();
      onOCCreated?.();
    } finally {
      setOcSaving(false);
    }
  }

  const otValores = [...new Set(rows.map((r) => r.orden_trabajo?.ot).filter(Boolean) as string[])]
    .sort()
    .map((v) => ({ text: v, value: v }));
  const clienteValores = [...new Set(rows.map((r) => r.orden_trabajo?.cliente?.nombre_comercial ?? r.orden_trabajo?.cliente?.razon_social).filter(Boolean) as string[])]
    .sort()
    .map((v) => ({ text: v, value: v }));
  const provValores = [...new Set(rows.map((r) => r.proveedor?.razon_social).filter(Boolean) as string[])]
    .sort()
    .map((v) => ({ text: v, value: v }));

  const columns: ColumnsType<Row> = [
    {
      title: "OT", key: "ot", width: 110,
      filters: otValores, filterSearch: true,
      onFilter: (value, r) => r.orden_trabajo?.ot === value,
      render: (_, r) => r.orden_trabajo?.ot ? (
        <a onClick={() => router.push(`/ordenes-trabajo/${r.ot_id}`)}>
          <Tag color={brand.navy} style={{ margin: 0 }}>{r.orden_trabajo.ot}</Tag>
        </a>
      ) : <Tag>#{r.ot_id}</Tag>,
    },
    {
      title: "Nro Req / Item", key: "nro", width: 130,
      ...filtroPorColumna(rows, "nro_req"),
      render: (_, r) => (
        <Space size={4} orientation="vertical" style={{ lineHeight: 1.1 }}>
          <Text strong style={{ fontSize: 11 }}>{r.nro_req ?? "—"}</Text>
          <Text type="secondary" style={{ fontSize: 10 }}>Item {r.item_req}</Text>
        </Space>
      ),
    },
    {
      title: "Cliente", key: "cliente", width: 160, ellipsis: true,
      filters: clienteValores, filterSearch: true,
      onFilter: (value, r) => (r.orden_trabajo?.cliente?.nombre_comercial ?? r.orden_trabajo?.cliente?.razon_social) === value,
      render: (_, r) => r.orden_trabajo?.cliente?.nombre_comercial ?? r.orden_trabajo?.cliente?.razon_social ?? "—",
    },
    {
      title: "Tipo", key: "tipo_codigo", dataIndex: "tipo_codigo", width: 60, align: "center",
      filters: [
        { text: "MAC", value: "MAC" },
        { text: "CAD", value: "CAD" },
        { text: "SER", value: "SER" },
      ],
      onFilter: (value, r) => r.tipo_codigo === value,
      render: (v: string) => <Tag color={TIPO_COLOR[v] ?? "default"} style={{ margin: 0 }}>{v}</Tag>,
    },
    {
      title: "Material / Descripción", key: "desc", ellipsis: true,
      ...filtroPorColumna(rows, "material_codigo"),
      render: (_, r) => (
        <div style={{ lineHeight: 1.2 }}>
          {r.material_codigo && <Tag style={{ fontSize: 10, marginRight: 4 }}>{r.material_codigo}</Tag>}
          <span style={{ fontSize: 12 }}>{r.descripcion}</span>
        </div>
      ),
    },
    {
      title: "Qty", key: "qty", width: 90, align: "right",
      sorter: (a, b) => Number(a.cantidad) - Number(b.cantidad),
      filters: [...new Set(rows.map((r) => Number(r.cantidad)))]
        .sort((a, b) => a - b).map((v) => ({ text: String(v), value: String(v) })),
      filterSearch: true,
      onFilter: (value, r) => String(Number(r.cantidad)) === value,
      render: (_, r) => `${Number(r.cantidad).toLocaleString()} ${r.unidad_medida ?? ""}`,
    },
    {
      title: "Precio est.", key: "precio", width: 110, align: "right",
      sorter: (a, b) => Number(a.precio_unitario ?? 0) - Number(b.precio_unitario ?? 0),
      filters: [...new Set(rows.map((r) => r.precio_unitario).filter(Boolean) as string[])]
        .sort().map((v) => ({ text: Number(v).toFixed(2), value: v })),
      filterSearch: true,
      onFilter: (value, r) => String(r.precio_unitario ?? "") === value,
      render: (_, r) => r.precio_unitario != null
        ? `${Number(r.precio_unitario).toFixed(2)} ${r.moneda ?? ""}`
        : <Text type="secondary">—</Text>,
    },
    {
      title: "Proveedor sugerido", key: "prov", width: 160, ellipsis: true,
      filters: provValores, filterSearch: true,
      onFilter: (value, r) => r.proveedor?.razon_social === value,
      render: (_, r) => r.proveedor?.razon_social ?? <Text type="secondary">—</Text>,
    },
    {
      title: "Solicitado", key: "fecha_solicitud", dataIndex: "fecha_solicitud", width: 90,
      sorter: (a, b) => (a.fecha_solicitud || "").localeCompare(b.fecha_solicitud || ""),
      filters: [...new Set(rows.map((r) => r.fecha_solicitud).filter(Boolean) as string[])]
        .sort().map((v) => ({ text: dayjs(v).format("DD/MM/YY"), value: v })),
      filterSearch: true,
      onFilter: (value, r) => r.fecha_solicitud === value,
      render: (v: string) => v ? <Text style={{ fontSize: 11 }}>{dayjs(v).format("DD/MM/YY")}</Text> : "—",
    },
  ];

  const { columnas: columnsResizable, components: tableComponents, resetAnchos } =
    useColumnasRedimensionables<Row>(columns, "compras-reqaprob-cols-widths-v1");

  return (
    <div>
      {contextHolder}
      {modalCtx}

      <Alert
        type="info" showIcon
        style={{ marginBottom: 12 }}
        title="Requerimientos aprobados pendientes de OC"
        description="Estos items ya fueron aprobados por Operaciones. Seleccioná los que quieras juntar en una misma orden de compra y generala. Si necesitás filtros más completos podés ir al módulo Requerimientos."
      />

      {/* Toolbar */}
      <Row gutter={12} style={{ marginBottom: 12 }} wrap>
        <Col xs={24} sm={8}>
          <Input
            placeholder="Buscar (descripción, OT, material, nro req)…"
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
          />
        </Col>
        <Col xs={24} sm={6}>
          <Select
            placeholder="Filtrar por proveedor sugerido"
            value={filterProv}
            onChange={setFilterProv}
            options={proveedoresOpts}
            allowClear showSearch optionFilterProp="label"
            style={{ width: "100%" }}
          />
        </Col>
        <Col flex="auto" />
        <Col>
          <Space>
            <Tag color={brand.navy}>Total: {rows.length}</Tag>
            {selectedKeys.length > 0 && (
              <Tag color={brand.cyan} style={{ fontWeight: 600 }}>{selectedKeys.length} seleccionado(s)</Tag>
            )}
            <ColumnasToggleButton<Row>
              columns={columns}
              ocultas={ocultas}
              setOcultas={setOcultas}
              obligatorias={["ot", "desc"]}
            />
          <Button onClick={resetAnchos}>Restablecer anchos</Button>
            <Button icon={<ReloadOutlined />} onClick={fetchData}>Refrescar</Button>
            <Button
              type="primary"
              icon={<FileAddOutlined />}
              onClick={abrirOcModal}
              disabled={selectedKeys.length === 0}
            >
              Generar OC ({selectedKeys.length})
            </Button>
          </Space>
        </Col>
      </Row>

      {rows.length === 0 && !loading ? (
        <Empty description={
          <span>
            No hay requerimientos aprobados pendientes de OC.
            <br />
            <Tooltip title="Si querés, podés revisar todos los requerimientos">
              <a onClick={() => router.push("/requerimientos")}>
                <InboxOutlined /> Ir al módulo Requerimientos
              </a>
            </Tooltip>
          </span>
        } />
      ) : (
        <Table
          rowKey="id"
          columns={visibleColumns(columnsResizable, ocultas)}
        components={tableComponents}
          dataSource={rows}
          loading={loading}
          size="small"
          pagination={{ pageSize: 50, showTotal: (t) => `${t} items`, placement: ["topEnd", "bottomEnd"] }}
          scroll={{ x: 1200 }}
          sticky={{ offsetHeader: 56, offsetScroll: 0 }}
          rowSelection={{
            selectedRowKeys: selectedKeys,
            onChange: (keys) => setSelectedKeys(keys as number[]),
          }}
        />
      )}

      {/* Modal Generar OC */}
      <Modal
        title={`Generar OC con ${selectedRows.length} item(s)`}
        open={ocOpen}
        onCancel={() => setOcOpen(false)}
        onOk={onCrearOC}
        confirmLoading={ocSaving}
        okText="Generar OC"
        cancelText="Cancelar"
        width={620}
        destroyOnHidden
      >
        <Form form={ocForm} layout="vertical">
          <Form.Item name="proveedor_id" label="Proveedor" rules={[{ required: true, message: "Proveedor requerido" }]}>
            <Select showSearch optionFilterProp="label" placeholder="Buscá por nombre o RUC…" options={proveedoresOpts} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="ubicacion_codigo" label="Ubicación de entrega">
                <Select showSearch optionFilterProp="label" allowClear options={ubicacionesOpts} placeholder="Opcional" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="moneda" label="Moneda" rules={[{ required: true }]}>
                <Select options={[{ value: "USD", label: "USD" }, { value: "SOL", label: "SOL" }]} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="fecha_entrega_esperada" label="Fecha entrega">
                <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="observaciones" label="Observaciones">
            <Input.TextArea rows={2} maxLength={300} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
