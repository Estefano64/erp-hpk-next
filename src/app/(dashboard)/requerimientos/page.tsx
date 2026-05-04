"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Typography, Card, Table, Tag, Space, Button, Input, Select, DatePicker, Row, Col,
  Modal, Form, message, Tooltip, Popconfirm, Empty, Alert, InputNumber,
} from "antd";
import {
  SearchOutlined, ReloadOutlined, CheckOutlined, CloseOutlined, StopOutlined,
  EditOutlined, FileAddOutlined, InboxOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { brand } from "@/lib/theme";
import { useCachedFetch } from "@/lib/useCachedFetch";

const { Title, Text } = Typography;

interface RequerimientoRow {
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
  fecha_solicitud: string;
  fecha_requerida: string | null;
  status_requerimiento_codigo: string | null;
  status_cotizacion_codigo: string | null;
  status_oc_codigo: string | null;
  status_requerimiento: { codigo: string; nombre: string } | null;
  status_cotizacion: { codigo: string; nombre: string } | null;
  status_oc: { codigo: string; nombre: string } | null;
  proveedor: { id: number; razon_social: string } | null;
  compra: { id: number; numero_po: string } | null;
  po_id: number | null;
  es_adicional: boolean | null;
  orden_trabajo: {
    id: number;
    ot: string | null;
    cliente: { codigo: string; razon_social: string; nombre_comercial: string | null } | null;
    codigo_reparacion: { codigo: string; descripcion: string } | null;
  } | null;
  material: { codigo: string; descripcion: string; unidad_medida_codigo: string | null } | null;
}

interface CatalogOpt { codigo: string; nombre: string; orden?: number | null }
interface ProveedorOpt { id: number; razon_social: string; ruc: string | null }
interface UbicacionOpt { codigo: string; nombre: string }

const TIPO_COLOR: Record<string, string> = { MAC: "blue", CAD: "orange", SER: "purple" };
const REQ_COLOR: Record<string, string> = { SIN_APROBACION: "default", APROBADO: "success", DESAPROBADO: "error", ANULADO: "default" };
const COT_COLOR: Record<string, string> = { PEND_COT: "default", PEND_APROB: "processing", APROBADO: "success", COMPLETO: "success", ANULADO: "error" };
const OC_COLOR: Record<string, string> = { PEND_OC: "default", PROCESO: "processing", ENTREGADO: "success", COMPLETO: "success", INCOMPLETO: "warning", ANULADO: "error", DEVOLUCION: "warning" };

export default function RequerimientosPage() {
  const router = useRouter();
  const [rows, setRows] = useState<RequerimientoRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 100;

  // Filtros
  const [search, setSearch] = useState("");
  const [filterOt, setFilterOt] = useState("");
  const [filterStatusReq, setFilterStatusReq] = useState<string | undefined>();
  const [filterStatusCot, setFilterStatusCot] = useState<string | undefined>();
  const [filterStatusOc, setFilterStatusOc] = useState<string | undefined>();
  const [filterTipo, setFilterTipo] = useState<string | undefined>();
  const [filterProveedor, setFilterProveedor] = useState<number | undefined>();
  const [filterFechas, setFilterFechas] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [soloAprobadosSinOC, setSoloAprobadosSinOC] = useState(false);

  // Selección
  const [selectedKeys, setSelectedKeys] = useState<number[]>([]);

  // Rol
  const [rol, setRol] = useState<string | null>(null);
  const isAdmin = rol === "admin";

  const [messageApi, contextHolder] = message.useMessage();
  const [modalApi, modalCtx] = Modal.useModal();

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

  // Editar modal (admin)
  const [editOpen, setEditOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<RequerimientoRow | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm] = Form.useForm<{
    descripcion: string;
    cantidad: number;
    unidad_medida?: string;
    material_codigo?: string;
    fabricante_codigo?: string;
    fecha_requerida?: dayjs.Dayjs | null;
    observaciones?: string;
  }>();

  // Catálogos cacheados
  type Wrapped<T> = { data: T[] } | null;
  const srRes = useCachedFetch<Wrapped<CatalogOpt>>("/api/catalogos?tabla=statusRequerimiento");
  const scRes = useCachedFetch<Wrapped<CatalogOpt>>("/api/catalogos?tabla=statusCotizacion");
  const soRes = useCachedFetch<Wrapped<CatalogOpt>>("/api/catalogos?tabla=statusOc");
  const provRes = useCachedFetch<Wrapped<ProveedorOpt>>("/api/proveedores?limit=500");
  const ubicRes = useCachedFetch<Wrapped<UbicacionOpt>>("/api/catalogos?tabla=ubicacion");
  const matsRes = useCachedFetch<Wrapped<{ codigo: string; descripcion: string; fabricante_codigo: string | null; unidad_medida_codigo: string | null }>>("/api/materiales?limit=2000");
  const materiales = matsRes?.data ?? [];
  const fabsRes = useCachedFetch<Wrapped<{ codigo: string; nombre: string }>>("/api/catalogos?tabla=fabricante");
  const fabricantes = fabsRes?.data ?? [];

  const statusReqOpts = (srRes?.data ?? []).map((s) => ({ value: s.codigo, label: s.nombre }));
  const statusCotOpts = (scRes?.data ?? []).map((s) => ({ value: s.codigo, label: s.nombre }));
  const statusOcOpts = (soRes?.data ?? []).map((s) => ({ value: s.codigo, label: s.nombre }));
  const proveedoresOpts = (provRes?.data ?? []).map((p) => ({ value: p.id, label: `${p.razon_social}${p.ruc ? ` (${p.ruc})` : ""}` }));
  const ubicacionesOpts = (ubicRes?.data ?? []).map((u) => ({ value: u.codigo, label: `${u.codigo} — ${u.nombre}` }));

  useEffect(() => {
    fetch("/api/me").then((r) => r.ok ? r.json() : null).then((d) => { if (d?.user) setRol(d.user.rol); }).catch(() => { /* noop */ });
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (filterOt) params.set("ot", filterOt);
      if (filterStatusReq) params.set("status_req", filterStatusReq);
      if (filterStatusCot) params.set("status_cot", filterStatusCot);
      if (filterStatusOc) params.set("status_oc", filterStatusOc);
      if (filterTipo) params.set("tipo", filterTipo);
      if (filterProveedor) params.set("proveedor_id", String(filterProveedor));
      if (filterFechas?.[0]) params.set("fecha_desde", filterFechas[0].toISOString());
      if (filterFechas?.[1]) params.set("fecha_hasta", filterFechas[1].toISOString());
      if (soloAprobadosSinOC) params.set("solo_aprobados_sin_oc", "1");

      const res = await fetch(`/api/requerimientos?${params}`);
      if (res.ok) {
        const j = await res.json();
        setRows(j.data ?? []);
        setTotal(j.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [page, search, filterOt, filterStatusReq, filterStatusCot, filterStatusOc, filterTipo, filterProveedor, filterFechas, soloAprobadosSinOC]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function clearFilters() {
    setSearch(""); setFilterOt(""); setFilterStatusReq(undefined); setFilterStatusCot(undefined);
    setFilterStatusOc(undefined); setFilterTipo(undefined); setFilterProveedor(undefined);
    setFilterFechas(null); setSoloAprobadosSinOC(false); setPage(1);
  }

  // Selección candidata para acciones bulk
  const selectedRows = useMemo(() => rows.filter((r) => selectedKeys.includes(r.id)), [rows, selectedKeys]);
  const elegiblesAprobar = selectedRows.filter((r) => r.status_requerimiento_codigo === "SIN_APROBACION");
  const elegiblesOC = selectedRows.filter((r) => r.status_requerimiento_codigo === "APROBADO" && r.po_id == null);
  const proveedoresEnSeleccion = new Set(elegiblesOC.map((r) => r.proveedor_id ?? null));

  // ── Aprobar bulk ──
  async function aprobarBulk() {
    let ok = 0, errs = 0;
    for (const r of elegiblesAprobar) {
      const res = await fetch(`/api/requerimientos/${r.id}/aprobar`, { method: "POST" });
      if (res.ok) ok++; else errs++;
    }
    if (ok > 0) messageApi.success(`Aprobados ${ok} requerimiento(s).`);
    if (errs > 0) messageApi.warning(`${errs} con error.`);
    setSelectedKeys([]);
    fetchData();
  }

  // ── Generar OC ──
  function abrirOcModal() {
    if (elegiblesOC.length === 0) {
      messageApi.warning("Seleccioná al menos un requerimiento APROBADO sin OC.");
      return;
    }
    if (proveedoresEnSeleccion.size > 1) {
      modalApi.warning({
        title: "Proveedores múltiples",
        content: "Los items seleccionados tienen proveedores distintos. Una OC se crea con un solo proveedor — vas a tener que elegir uno y los items del otro proveedor irán al mismo OC con ese proveedor.",
      });
    }
    // Pre-seleccionar el proveedor más común si hay
    const provId = elegiblesOC.find((r) => r.proveedor_id)?.proveedor_id;
    const moneda = elegiblesOC.find((r) => r.moneda)?.moneda ?? "USD";
    ocForm.resetFields();
    ocForm.setFieldsValue({ proveedor_id: provId ?? undefined, moneda });
    setOcOpen(true);
  }

  async function onCrearOC() {
    const values = await ocForm.validateFields().catch(() => null);
    if (!values) return;
    setOcSaving(true);
    try {
      const payload = {
        repuesto_ids: elegiblesOC.map((r) => r.id),
        proveedor_id: values.proveedor_id,
        ubicacion_codigo: values.ubicacion_codigo ?? null,
        moneda: values.moneda,
        fecha_entrega_esperada: values.fecha_entrega_esperada ? values.fecha_entrega_esperada.format("YYYY-MM-DD") : null,
        observaciones: values.observaciones ?? null,
      };
      const res = await fetch("/api/compras/crear-oc", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
    } finally {
      setOcSaving(false);
    }
  }

  // ── Acciones admin por fila ──
  async function aprobar(r: RequerimientoRow) {
    const res = await fetch(`/api/requerimientos/${r.id}/aprobar`, { method: "POST" });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      messageApi.error(err?.error ?? "Error.");
      return;
    }
    messageApi.success(`${r.nro_req ?? "Item"} aprobado.`);
    fetchData();
  }
  function desaprobar(r: RequerimientoRow) {
    let motivo = "";
    modalApi.confirm({
      title: `Desaprobar ${r.nro_req ?? "requerimiento"}`,
      content: (
        <Input.TextArea rows={3} placeholder="Motivo (opcional)" onChange={(e) => { motivo = e.target.value; }} />
      ),
      okText: "Desaprobar", okButtonProps: { danger: true },
      onOk: async () => {
        const res = await fetch(`/api/requerimientos/${r.id}/desaprobar`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ motivo: motivo || null }),
        });
        if (!res.ok) { const err = await res.json().catch(() => null); messageApi.error(err?.error ?? "Error."); return; }
        messageApi.success(`Desaprobado.`); fetchData();
      },
    });
  }
  function anular(r: RequerimientoRow) {
    let motivo = "";
    modalApi.confirm({
      title: `Anular ${r.nro_req ?? "requerimiento"}`,
      content: (
        <Input.TextArea rows={3} placeholder="Motivo (opcional)" onChange={(e) => { motivo = e.target.value; }} />
      ),
      okText: "Anular", okButtonProps: { danger: true },
      onOk: async () => {
        const res = await fetch(`/api/requerimientos/${r.id}/anular`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ motivo: motivo || null }),
        });
        if (!res.ok) { const err = await res.json().catch(() => null); messageApi.error(err?.error ?? "Error."); return; }
        messageApi.success(`Anulado.`); fetchData();
      },
    });
  }
  function abrirEditar(r: RequerimientoRow) {
    setEditingRow(r);
    editForm.setFieldsValue({
      descripcion: r.descripcion ?? "",
      cantidad: Number(r.cantidad),
      unidad_medida: r.unidad_medida ?? undefined,
      material_codigo: r.material_codigo ?? undefined,
      fabricante_codigo: undefined, // OTRepuesto no tiene fabricante directo
      fecha_requerida: r.fecha_requerida ? dayjs(r.fecha_requerida) : null,
      observaciones: undefined,
    });
    setEditOpen(true);
  }
  async function onSaveEdit() {
    if (!editingRow) return;
    const values = await editForm.validateFields().catch(() => null);
    if (!values) return;
    setEditSaving(true);
    try {
      const payload = {
        ...values,
        fecha_requerida: values.fecha_requerida ? values.fecha_requerida.format("YYYY-MM-DD") : null,
      };
      const res = await fetch(`/api/requerimientos/${editingRow.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        messageApi.error(err?.error ?? "Error al guardar.");
        return;
      }
      messageApi.success("Actualizado.");
      setEditOpen(false);
      fetchData();
    } finally {
      setEditSaving(false);
    }
  }

  // ── Stats ──
  const stats = useMemo(() => {
    let aprob = 0, sinAprob = 0, conOC = 0, anul = 0;
    for (const r of rows) {
      const sr = r.status_requerimiento_codigo;
      if (sr === "APROBADO") aprob++;
      else if (sr === "SIN_APROBACION") sinAprob++;
      else if (sr === "ANULADO") anul++;
      if (r.po_id) conOC++;
    }
    return { aprob, sinAprob, conOC, anul };
  }, [rows]);

  const columns: ColumnsType<RequerimientoRow> = [
    {
      title: "OT", key: "ot", width: 110, fixed: "left",
      render: (_, r) => r.orden_trabajo?.ot ? (
        <a onClick={() => router.push(`/ordenes-trabajo/${r.ot_id}`)} style={{ fontSize: 11 }}>
          <Tag color={brand.navy} style={{ margin: 0 }}>{r.orden_trabajo.ot}</Tag>
        </a>
      ) : <Tag>#{r.ot_id}</Tag>,
    },
    {
      title: "Nro Req / Item", key: "nro", width: 120,
      render: (_, r) => (
        <Space size={4} direction="vertical" style={{ lineHeight: 1.1 }}>
          <Text strong style={{ fontSize: 11 }}>{r.nro_req ?? "—"}</Text>
          <Text type="secondary" style={{ fontSize: 10 }}>Item {r.item_req}</Text>
          {r.es_adicional && <Tag color="gold" style={{ fontSize: 9, margin: 0 }}>ADIC</Tag>}
        </Space>
      ),
    },
    {
      title: "Cliente / Cod. Rep.", key: "cliente", width: 180, ellipsis: true,
      render: (_, r) => (
        <div style={{ lineHeight: 1.2 }}>
          <div style={{ fontSize: 11 }}>{r.orden_trabajo?.cliente?.nombre_comercial ?? r.orden_trabajo?.cliente?.razon_social ?? "—"}</div>
          {r.orden_trabajo?.codigo_reparacion?.codigo && (
            <Text type="secondary" style={{ fontSize: 10 }}>{r.orden_trabajo.codigo_reparacion.codigo}</Text>
          )}
        </div>
      ),
    },
    {
      title: "Tipo", dataIndex: "tipo_codigo", width: 60, align: "center",
      render: (v: string) => <Tag color={TIPO_COLOR[v] ?? "default"} style={{ margin: 0 }}>{v}</Tag>,
    },
    {
      title: "Material / Descripción", key: "desc", ellipsis: true,
      render: (_, r) => (
        <div style={{ lineHeight: 1.2 }}>
          <div style={{ fontSize: 12 }}>
            {r.material_codigo && <Tag style={{ fontSize: 10, marginRight: 4 }}>{r.material_codigo}</Tag>}
            {r.descripcion}
          </div>
        </div>
      ),
    },
    {
      title: "Qty", key: "qty", width: 80, align: "right",
      render: (_, r) => `${Number(r.cantidad).toLocaleString()} ${r.unidad_medida ?? ""}`,
    },
    {
      title: "Precio", key: "precio", width: 100, align: "right",
      render: (_, r) => r.precio_unitario != null
        ? `${Number(r.precio_unitario).toFixed(2)} ${r.moneda ?? ""}`
        : <Text type="secondary">—</Text>,
    },
    {
      title: "Proveedor", key: "prov", width: 140, ellipsis: true,
      render: (_, r) => r.proveedor?.razon_social ?? <Text type="secondary">—</Text>,
    },
    {
      title: "REQ", key: "req", width: 100, align: "center",
      render: (_, r) => r.status_requerimiento ? (
        <Tag color={REQ_COLOR[r.status_requerimiento.codigo] ?? "default"} style={{ margin: 0, fontSize: 10 }}>
          {r.status_requerimiento.nombre}
        </Tag>
      ) : "—",
    },
    {
      title: "COT", key: "cot", width: 100, align: "center",
      render: (_, r) => r.status_cotizacion ? (
        <Tag color={COT_COLOR[r.status_cotizacion.codigo] ?? "default"} style={{ margin: 0, fontSize: 10 }}>
          {r.status_cotizacion.nombre}
        </Tag>
      ) : "—",
    },
    {
      title: "OC", key: "oc", width: 130, align: "center",
      render: (_, r) => (
        <Space direction="vertical" size={2} style={{ lineHeight: 1 }}>
          {r.status_oc ? (
            <Tag color={OC_COLOR[r.status_oc.codigo] ?? "default"} style={{ margin: 0, fontSize: 10 }}>
              {r.status_oc.nombre}
            </Tag>
          ) : "—"}
          {r.compra?.numero_po && (
            <a onClick={() => router.push(`/compras`)} style={{ fontSize: 10 }} title="Ver compras">
              <Text code style={{ fontSize: 10 }}>{r.compra.numero_po}</Text>
            </a>
          )}
        </Space>
      ),
    },
    {
      title: "Solicitud", dataIndex: "fecha_solicitud", width: 90,
      render: (v: string) => v ? <Text style={{ fontSize: 11 }}>{dayjs(v).format("DD/MM/YY")}</Text> : "—",
    },
    {
      title: "", key: "actions", width: 150, fixed: "right",
      render: (_, r) => {
        const sr = r.status_requerimiento_codigo;
        const tieneOC = r.po_id != null;
        // Editar: admin, no terminal, no anulado, no con OC en cantidad/material
        const canEdit = isAdmin && sr !== "ANULADO" && sr !== "DESAPROBADO" && !tieneOC;
        const canApprove = isAdmin && sr === "SIN_APROBACION";
        const canAnular = isAdmin && !tieneOC && sr !== "ANULADO";
        return (
          <Space size={0}>
            {canApprove && (
              <Tooltip title="Aprobar">
                <Popconfirm title={`Aprobar ${r.nro_req}?`} onConfirm={() => aprobar(r)} okText="Aprobar" cancelText="Cancelar">
                  <Button type="text" size="small" icon={<CheckOutlined style={{ color: brand.success }} />} />
                </Popconfirm>
              </Tooltip>
            )}
            {canApprove && (
              <Tooltip title="Desaprobar">
                <Button type="text" size="small" icon={<CloseOutlined style={{ color: brand.error }} />} onClick={() => desaprobar(r)} />
              </Tooltip>
            )}
            {canEdit && (
              <Tooltip title="Editar">
                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => abrirEditar(r)} />
              </Tooltip>
            )}
            {canAnular && (
              <Tooltip title="Anular">
                <Button type="text" size="small" icon={<StopOutlined />} onClick={() => anular(r)} />
              </Tooltip>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      {contextHolder}
      {modalCtx}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
        <Title level={3} style={{ margin: 0 }}>
          <InboxOutlined style={{ marginRight: 8 }} />
          Requerimientos
        </Title>
        <Space>
          <Tag color={brand.navy}>Total: {total}</Tag>
          <Tag>Sin aprob: {stats.sinAprob}</Tag>
          <Tag color="success">Aprobados: {stats.aprob}</Tag>
          <Tag color="processing">Con OC: {stats.conOC}</Tag>
          {stats.anul > 0 && <Tag>Anulados: {stats.anul}</Tag>}
        </Space>
      </div>

      {/* Filtros */}
      <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: 12 } }}>
        <Row gutter={[8, 8]}>
          <Col xs={24} md={6}>
            <Input
              placeholder="Buscar (descripción, nro req, OC, material)…"
              prefix={<SearchOutlined />}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              allowClear
            />
          </Col>
          <Col xs={12} md={4}>
            <Input
              placeholder="OT"
              value={filterOt}
              onChange={(e) => { setFilterOt(e.target.value); setPage(1); }}
              allowClear
            />
          </Col>
          <Col xs={12} md={4}>
            <Select
              placeholder="Estado REQ"
              value={filterStatusReq}
              onChange={(v) => { setFilterStatusReq(v); setPage(1); }}
              options={statusReqOpts}
              allowClear style={{ width: "100%" }}
            />
          </Col>
          <Col xs={12} md={4}>
            <Select
              placeholder="Estado COT"
              value={filterStatusCot}
              onChange={(v) => { setFilterStatusCot(v); setPage(1); }}
              options={statusCotOpts}
              allowClear style={{ width: "100%" }}
            />
          </Col>
          <Col xs={12} md={3}>
            <Select
              placeholder="Estado OC"
              value={filterStatusOc}
              onChange={(v) => { setFilterStatusOc(v); setPage(1); }}
              options={statusOcOpts}
              allowClear style={{ width: "100%" }}
            />
          </Col>
          <Col xs={12} md={3}>
            <Select
              placeholder="Tipo"
              value={filterTipo}
              onChange={(v) => { setFilterTipo(v); setPage(1); }}
              options={[
                { value: "MAC", label: "MAC" },
                { value: "CAD", label: "CAD" },
                { value: "SER", label: "SER" },
              ]}
              allowClear style={{ width: "100%" }}
            />
          </Col>
          <Col xs={24} md={6}>
            <Select
              placeholder="Proveedor"
              value={filterProveedor}
              onChange={(v) => { setFilterProveedor(v); setPage(1); }}
              options={proveedoresOpts}
              allowClear showSearch
              optionFilterProp="label"
              style={{ width: "100%" }}
            />
          </Col>
          <Col xs={24} md={6}>
            <DatePicker.RangePicker
              value={filterFechas as [dayjs.Dayjs, dayjs.Dayjs] | null}
              onChange={(v) => { setFilterFechas(v as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null); setPage(1); }}
              placeholder={["Desde", "Hasta"]}
              format="DD/MM/YYYY"
              style={{ width: "100%" }}
            />
          </Col>
          <Col xs={24} md={6}>
            <Space>
              <Tooltip title="Filtra solo items APROBADOS aún sin OC, listos para crear orden de compra">
                <Button
                  type={soloAprobadosSinOC ? "primary" : "default"}
                  onClick={() => { setSoloAprobadosSinOC((v) => !v); setPage(1); }}
                  icon={<FileAddOutlined />}
                >
                  Listos para OC
                </Button>
              </Tooltip>
              <Button icon={<ReloadOutlined />} onClick={clearFilters}>Limpiar</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Bulk toolbar */}
      {selectedKeys.length > 0 && (
        <Card
          size="small"
          styles={{ body: { padding: 10 } }}
          style={{ marginBottom: 12, borderColor: brand.cyan, background: "#E6FFFB" }}
        >
          <Row align="middle" gutter={12}>
            <Col flex="auto">
              <Space>
                <Tag color={brand.cyan} style={{ fontWeight: 600 }}>{selectedKeys.length} seleccionado(s)</Tag>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Aprobables: {elegiblesAprobar.length} · Listos para OC: {elegiblesOC.length}
                </Text>
              </Space>
            </Col>
            <Col>
              <Space>
                {isAdmin && elegiblesAprobar.length > 0 && (
                  <Popconfirm
                    title={`Aprobar ${elegiblesAprobar.length} requerimiento(s)`}
                    onConfirm={aprobarBulk}
                    okText="Aprobar" cancelText="Cancelar"
                  >
                    <Button type="primary" icon={<CheckOutlined />}>
                      Aprobar ({elegiblesAprobar.length})
                    </Button>
                  </Popconfirm>
                )}
                <Button
                  icon={<FileAddOutlined />}
                  type="primary"
                  disabled={elegiblesOC.length === 0}
                  onClick={abrirOcModal}
                >
                  Generar OC ({elegiblesOC.length})
                </Button>
                <Button onClick={() => setSelectedKeys([])}>Cancelar</Button>
              </Space>
            </Col>
          </Row>
        </Card>
      )}

      {!isAdmin && (
        <Alert
          type="info" showIcon style={{ marginBottom: 12 }}
          title="Modo lectura para aprobar"
          description="Solo administradores pueden aprobar/desaprobar/anular requerimientos. Vos podés ver, filtrar y generar OC desde aprobados."
        />
      )}

      {rows.length === 0 && !loading ? (
        <Empty description="No hay requerimientos con esos filtros." />
      ) : (
        <Table
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={loading}
          size="small"
          pagination={{ current: page, pageSize: limit, total, onChange: setPage, showTotal: (t) => `${t} requerimientos` }}
          scroll={{ x: 1500 }}
          rowSelection={{
            selectedRowKeys: selectedKeys,
            onChange: (keys) => setSelectedKeys(keys as number[]),
            getCheckboxProps: (r) => ({ disabled: r.status_requerimiento_codigo === "ANULADO" }),
          }}
        />
      )}

      {/* Modal Generar OC */}
      <Modal
        title={`Generar OC con ${elegiblesOC.length} item(s)`}
        open={ocOpen}
        onCancel={() => setOcOpen(false)}
        onOk={onCrearOC}
        confirmLoading={ocSaving}
        okText="Generar OC"
        cancelText="Cancelar"
        width={620}
        destroyOnHidden
      >
        <Alert
          type="info" showIcon style={{ marginBottom: 12 }}
          title="Items elegibles"
          description={`Solo se incluyen items APROBADOS sin OC: ${elegiblesOC.length} de los ${selectedKeys.length} seleccionados.`}
        />
        <Form form={ocForm} layout="vertical">
          <Form.Item name="proveedor_id" label="Proveedor" rules={[{ required: true, message: "Proveedor requerido" }]}>
            <Select
              showSearch optionFilterProp="label"
              placeholder="Buscá por nombre o RUC…"
              options={proveedoresOpts}
            />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="ubicacion_codigo" label="Ubicación de entrega">
                <Select
                  showSearch optionFilterProp="label" allowClear
                  options={ubicacionesOpts}
                  placeholder="Opcional"
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="moneda" label="Moneda" rules={[{ required: true }]}>
                <Select options={[
                  { value: "USD", label: "USD" },
                  { value: "SOL", label: "SOL" },
                ]} />
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

      {/* Modal Editar (admin) */}
      <Modal
        title={`Editar ${editingRow?.nro_req ?? ""}`}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={onSaveEdit}
        confirmLoading={editSaving}
        okText="Guardar" cancelText="Cancelar"
        width={620}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical">
          {editingRow?.tipo_codigo === "MAC" && (
            <Form.Item name="material_codigo" label="Material">
              <Select
                showSearch optionFilterProp="label" allowClear
                options={materiales.map((m) => ({
                  value: m.codigo,
                  label: `${m.codigo} — ${m.descripcion}${m.fabricante_codigo ? ` [${m.fabricante_codigo}]` : ""}`,
                }))}
              />
            </Form.Item>
          )}
          <Form.Item name="descripcion" label="Descripción" rules={[{ required: true, max: 500 }]}>
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="cantidad" label="Cantidad" rules={[{ required: true }]}>
                <InputNumber min={0.01} step={1} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="unidad_medida" label="Unidad">
                <Input placeholder="UNIDAD" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="fabricante_codigo" label="Fabricante">
                <Select
                  showSearch allowClear optionFilterProp="label"
                  options={fabricantes.map((f) => ({ value: f.codigo, label: `${f.codigo} — ${f.nombre}` }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="fecha_requerida" label="Fecha requerida">
                <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="observaciones" label="Observaciones">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
