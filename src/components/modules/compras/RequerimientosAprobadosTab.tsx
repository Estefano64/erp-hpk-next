"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Table, Tag, Space, Button, Modal, Form, Select, DatePicker, Input, InputNumber,
  message, Empty, Alert, Row, Col, Typography, Tooltip,
} from "antd";
import { FileAddOutlined, ReloadOutlined, InboxOutlined, SearchOutlined, EditOutlined, CheckOutlined, CloseOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { brand } from "@/lib/theme";
import { useCachedFetch } from "@/lib/useCachedFetch";
import { formatDateOnlyShort } from "@/lib/dates";
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
    nombre?: string;
  }>();

  // Edición inline de precio por fila
  const [editPrecioId, setEditPrecioId] = useState<number | null>(null);
  const [editPrecioVal, setEditPrecioVal] = useState<number | null>(null);
  const [savingPrecio, setSavingPrecio] = useState(false);

  const guardarPrecio = async (row: Row) => {
    if (editPrecioVal == null || editPrecioVal <= 0) {
      messageApi.warning("El precio debe ser mayor a 0.");
      return;
    }
    setSavingPrecio(true);
    try {
      const res = await fetch(`/api/requerimientos/${row.id}/precio`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          precio_unitario: editPrecioVal,
          moneda: row.moneda ?? "USD",
          proveedor_id: row.proveedor_id ?? undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Error guardando precio");
      messageApi.success("Precio actualizado");
      setEditPrecioId(null);
      setEditPrecioVal(null);
      fetchData();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSavingPrecio(false);
    }
  };

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
    // Validación: TODOS los items seleccionados deben tener precio > 0.
    const sinPrecio = selectedRows.filter((r) => {
      const p = Number(r.precio_unitario ?? 0);
      return !Number.isFinite(p) || p <= 0;
    });
    if (sinPrecio.length > 0) {
      const labels = sinPrecio.map((r) => `${r.nro_req ?? `#${r.id}`}/${r.item_req ?? "-"}`).join(", ");
      modalApi.error({
        title: "Faltan precios para crear la OC",
        content: (
          <div>
            <p>{sinPrecio.length} item(s) sin precio unitario: <b>{labels}</b></p>
            <p>Asigná un precio a cada item antes de generar la OC (click en la columna “Precio unit.”).</p>
          </div>
        ),
      });
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
          nombre: values.nombre ?? null,
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
      title: "Precio unit.", key: "precio", width: 150, align: "right",
      sorter: (a, b) => Number(a.precio_unitario ?? 0) - Number(b.precio_unitario ?? 0),
      filters: [...new Set(rows.map((r) => r.precio_unitario).filter(Boolean) as string[])]
        .sort().map((v) => ({ text: Number(v).toFixed(2), value: v })),
      filterSearch: true,
      onFilter: (value, r) => String(r.precio_unitario ?? "") === value,
      render: (_, r) => {
        const precio = r.precio_unitario != null ? Number(r.precio_unitario) : null;
        const enEdit = editPrecioId === r.id;
        if (enEdit) {
          return (
            <Space size={2}>
              <InputNumber
                size="small" autoFocus value={editPrecioVal} min={0} step={0.01} precision={2}
                style={{ width: 90 }}
                onChange={(v) => setEditPrecioVal(v == null ? null : Number(v))}
                onPressEnter={() => guardarPrecio(r)}
              />
              <Button size="small" type="primary" icon={<CheckOutlined />} loading={savingPrecio}
                onClick={() => guardarPrecio(r)} />
              <Button size="small" icon={<CloseOutlined />}
                onClick={() => { setEditPrecioId(null); setEditPrecioVal(null); }} />
            </Space>
          );
        }
        const sinPrecio = precio == null || precio <= 0;
        return (
          <Tooltip title={sinPrecio ? "Falta precio — click para asignar" : "Click para editar"}>
            <div
              style={{
                cursor: "pointer",
                padding: "2px 6px",
                borderRadius: 3,
                background: sinPrecio ? "#fff1f0" : undefined,
                border: sinPrecio ? "1px dashed #ff4d4f" : undefined,
              }}
              onClick={() => { setEditPrecioId(r.id); setEditPrecioVal(precio); }}
            >
              {sinPrecio
                ? <Text type="danger" style={{ fontSize: 11 }}>+ asignar</Text>
                : <span style={{ fontSize: 11 }}>{precio!.toFixed(2)} {r.moneda ?? ""} <EditOutlined style={{ fontSize: 9, color: "#bbb", marginLeft: 2 }} /></span>}
            </div>
          </Tooltip>
        );
      },
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
        .sort().map((v) => ({ text: formatDateOnlyShort(v), value: v })),
      filterSearch: true,
      onFilter: (value, r) => r.fecha_solicitud === value,
      render: (v: string) => v ? <Text style={{ fontSize: 11 }}>{formatDateOnlyShort(v)}</Text> : "—",
    },
  ];

  const { columnas: columnsResizable, components: tableComponents, resetAnchos, TableDragWrapper } =
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
        <TableDragWrapper>
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
        </TableDragWrapper>
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
      >
        <Form form={ocForm} layout="vertical">
          <Form.Item name="proveedor_id" label="Proveedor" rules={[{ required: true, message: "Proveedor requerido" }]}>
            <Select showSearch optionFilterProp="label" placeholder="Buscá por nombre o RUC…" options={proveedoresOpts} />
          </Form.Item>
          <Form.Item
            name="nombre"
            label="Nombre OC (opcional)"
            tooltip="Si lo dejás vacío, se autogenera como 'OT {códigos} · {Proveedor}'."
          >
            <Input placeholder="Ej: Repuestos cilindro hidráulico - OT 12345" maxLength={300} />
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
