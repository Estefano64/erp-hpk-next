"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Table, Button, Tag, Space, Modal, Form, Input, InputNumber, Select, DatePicker,
  message, Popconfirm, Tooltip, Empty, Alert, Row, Col, Typography, Radio,
} from "antd";
import {
  PlusOutlined, ReloadOutlined,
  EditOutlined, DeleteOutlined, FileSyncOutlined, SendOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { brand } from "@/lib/theme";
import { useCachedFetch } from "@/lib/useCachedFetch";
import {
  useColumnasOcultas,
  ColumnasToggleButton,
  visibleColumns,
  filtroPorColumna,
  useRangoFechas,
  RangoFechasFiltro,
  dentroDeRango,
  useColumnasRedimensionables,
} from "@/lib/tables";

const { Text } = Typography;

interface RequerimientoRow {
  id: number;
  nro_req: string | null;
  item_req: number | null;
  tipo_codigo: string;
  material_id: number | null;
  material_codigo: string | null;
  material: { codigo: string; descripcion: string } | null;
  cantidad: string;
  unidad_medida: string | null;
  descripcion: string | null;
  texto: string | null;
  fabricante_codigo: string | null;
  fecha_solicitud: string;
  fecha_requerida: string | null;
  precio_unitario: string | null;
  moneda: string | null;
  status_requerimiento_codigo: string | null;
  status_cotizacion_codigo: string | null;
  status_oc_codigo: string | null;
  status_requerimiento: { codigo: string; nombre: string } | null;
  status_cotizacion: { codigo: string; nombre: string } | null;
  status_oc: { codigo: string; nombre: string } | null;
  proveedor: { id: number; razon_social: string } | null;
  compra: { id: number; numero_po: string } | null;
  po_id: number | null;
  nro_oc: string | null;
  es_adicional: boolean | null;
  observaciones: string | null;
  usuario_solicita: string;
  usuario_aprueba: string | null;
  fecha_aprobacion: string | null;
}

interface MaterialOpt {
  material_id: number;
  codigo: string;
  descripcion: string;
  fabricante_codigo: string | null;
  unidad_medida_codigo: string | null;
  precio: string | null;
  moneda_codigo: string | null;
}

interface Props {
  otId: number;
  codRepCodigo: string | null;
  onUpdated?: () => void;
}

const TIPO_COLOR: Record<string, string> = { MAC: "blue", CAD: "orange", SER: "purple" };
const REQ_COLOR: Record<string, string> = {
  BORRADOR: "warning",
  SIN_APROBACION: "default",
  APROBADO: "success",
  DESAPROBADO: "error",
  ANULADO: "default",
};
const COT_COLOR: Record<string, string> = {
  PEND_COT: "default",
  PEND_APROB: "processing",
  APROBADO: "success",
  COMPLETO: "success",
  ANULADO: "error",
};
const OC_COLOR: Record<string, string> = {
  PEND_OC: "default",
  PROCESO: "processing",
  ENTREGADO: "success",
  COMPLETO: "success",
  INCOMPLETO: "warning",
  ANULADO: "error",
  DEVOLUCION: "warning",
};

export default function OTRequerimientosTab({ otId, codRepCodigo, onUpdated }: Props) {
  const [rows, setRows] = useState<RequerimientoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [rol, setRol] = useState<string | null>(null);
  const isAdmin = rol === "admin";
  const [messageApi, contextHolder] = message.useMessage();
  const [modalApi, modalCtx] = Modal.useModal();
  const { ocultas, setOcultas } = useColumnasOcultas("ot-requerimientos-cols-v1");
  const { rango: rangoSol, setRango: setRangoSol } = useRangoFechas();
  const { rango: rangoReq, setRango: setRangoReq } = useRangoFechas();

  // Modal crear/editar
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<{
    tipo_codigo: "MAC" | "CAD" | "SER";
    material_codigo?: string;
    cantidad: number;
    descripcion: string;
    unidad_medida?: string;
    fabricante_codigo?: string;
    fecha_requerida?: dayjs.Dayjs | null;
    observaciones?: string;
  }>();
  const tipoSeleccionado = Form.useWatch("tipo_codigo", form);

  // Catálogos cacheados
  type Wrapped<T> = { data: T[] } | null;
  const matsRes = useCachedFetch<Wrapped<MaterialOpt>>("/api/materiales?limit=2000");
  const materiales = matsRes?.data ?? [];
  const fabsRes = useCachedFetch<Wrapped<{ codigo: string; nombre: string }>>("/api/catalogos?tabla=fabricante");
  const fabricantes = fabsRes?.data ?? [];
  const sersRes = useCachedFetch<Wrapped<{ codigo: string; nombre: string; descripcion: string | null }>>("/api/catalogos?tabla=servicioReparacion");
  const servicios = sersRes?.data ?? [];

  // Rol del usuario (para acciones admin)
  useEffect(() => {
    fetch("/api/me").then((r) => r.ok ? r.json() : null).then((d) => {
      if (d?.user) setRol(d.user.rol);
    }).catch(() => { /* noop */ });
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ordenes-trabajo/${otId}/requerimientos`);
      if (res.ok) {
        const j = await res.json();
        setRows(j.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [otId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Aplicar template ──
  async function aplicarTemplate(estrategia: "replace_pending" | "keep_all" | "skip_if_any") {
    try {
      const res = await fetch(`/api/ordenes-trabajo/${otId}/requerimientos/aplicar-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estrategia }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        messageApi.error(err?.error ?? "Error al aplicar template.");
        return;
      }
      const j = await res.json();
      if (j.skipped) {
        messageApi.info(`No se hizo nada: ya hay ${j.existentes} requerimientos.`);
      } else {
        messageApi.success(`Template aplicado: ${j.creados} creados${j.eliminados ? `, ${j.eliminados} reemplazados` : ""}.`);
      }
      fetchData();
      onUpdated?.();
    } catch {
      messageApi.error("Error al aplicar template.");
    }
  }

  function abrirDialogTemplate() {
    if (!codRepCodigo) {
      messageApi.warning("La OT no tiene cod_rep asignado.");
      return;
    }
    if (rows.length === 0) {
      // Sin requerimientos, aplicar directo
      aplicarTemplate("replace_pending");
      return;
    }
    modalApi.confirm({
      title: "Aplicar template de requerimientos",
      content: (
        <div>
          <p>La OT ya tiene <strong>{rows.length}</strong> requerimiento(s). ¿Qué hacemos con los del template del cod_rep <strong>{codRepCodigo}</strong>?</p>
          <ul style={{ marginLeft: 20, marginTop: 8 }}>
            <li><strong>Reemplazar pendientes</strong>: borra los SIN_APROBACION sin OC y aplica el template (los aprobados o con OC se mantienen).</li>
            <li><strong>Sumar todos</strong>: agrega los del template encima sin tocar lo existente (puede generar duplicados).</li>
          </ul>
        </div>
      ),
      okText: "Reemplazar pendientes",
      cancelText: "Cancelar",
      okButtonProps: { type: "primary" },
      onOk: () => aplicarTemplate("replace_pending"),
      // Botón extra: "Sumar todos" — uso footer custom
      footer: (_, { OkBtn, CancelBtn }) => (
        <>
          <CancelBtn />
          <Button onClick={() => { Modal.destroyAll(); aplicarTemplate("keep_all"); }}>
            Sumar todos
          </Button>
          <OkBtn />
        </>
      ),
    });
  }

  // ── Modal crear/editar ──
  function abrirCrear() {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ tipo_codigo: "MAC", cantidad: 1 });
    setModalOpen(true);
  }
  function abrirEditar(r: RequerimientoRow) {
    setEditingId(r.id);
    form.setFieldsValue({
      tipo_codigo: r.tipo_codigo as "MAC" | "CAD" | "SER",
      material_codigo: r.material_codigo ?? undefined,
      cantidad: Number(r.cantidad),
      descripcion: r.descripcion ?? "",
      unidad_medida: r.unidad_medida ?? undefined,
      fabricante_codigo: r.fabricante_codigo ?? undefined,
      fecha_requerida: r.fecha_requerida ? dayjs(r.fecha_requerida) : null,
      observaciones: r.observaciones ?? undefined,
    });
    setModalOpen(true);
  }
  function onMaterialSelect(codigo: string | undefined) {
    if (!codigo) return;
    const m = materiales.find((x) => x.codigo === codigo);
    if (!m) return;
    // autocomplete (sin tocar precio/moneda — se manejan desde Compras)
    form.setFieldsValue({
      descripcion: form.getFieldValue("descripcion") || m.descripcion,
      fabricante_codigo: m.fabricante_codigo ?? undefined,
      unidad_medida: m.unidad_medida_codigo ?? undefined,
    });
  }
  function onServicioSelect(codigo: string | undefined) {
    if (!codigo) return;
    const s = servicios.find((x) => x.codigo === codigo);
    if (!s) return;
    form.setFieldsValue({
      descripcion: s.nombre,
      observaciones: s.descripcion ?? form.getFieldValue("observaciones") ?? undefined,
    });
  }
  async function onSubmit() {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    setSaving(true);
    try {
      const payload = {
        ...values,
        fecha_requerida: values.fecha_requerida ? values.fecha_requerida.format("YYYY-MM-DD") : null,
      };
      const url = editingId
        ? `/api/requerimientos/${editingId}`
        : `/api/ordenes-trabajo/${otId}/requerimientos`;
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        messageApi.error(err?.error ?? "Error al guardar.");
        return;
      }
      messageApi.success(editingId ? "Requerimiento actualizado." : "Requerimiento creado.");
      setModalOpen(false);
      fetchData();
      onUpdated?.();
    } finally {
      setSaving(false);
    }
  }

  // ── Enviar a aprobación (cualquier usuario) ──
  async function enviarAprobacion(r: RequerimientoRow) {
    const res = await fetch(`/api/requerimientos/${r.id}/enviar-a-aprobacion`, { method: "POST" });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      messageApi.error(err?.error ?? "Error al enviar.");
      return;
    }
    messageApi.success(`${r.nro_req ?? "Item"} enviado a aprobación.`);
    fetchData();
    onUpdated?.();
  }
  async function enviarTodosBorrador() {
    const borradores = rows.filter((r) => r.status_requerimiento_codigo === "BORRADOR");
    if (borradores.length === 0) return;
    let ok = 0, errs = 0;
    for (const r of borradores) {
      const res = await fetch(`/api/requerimientos/${r.id}/enviar-a-aprobacion`, { method: "POST" });
      if (res.ok) ok++; else errs++;
    }
    if (ok > 0) messageApi.success(`${ok} requerimiento(s) enviados a aprobación.`);
    if (errs > 0) messageApi.warning(`${errs} con error.`);
    fetchData();
    onUpdated?.();
  }

  // (Las acciones aprobar/desaprobar/anular se gestionan desde el módulo /requerimientos por admin)
  async function eliminar(r: RequerimientoRow) {
    const res = await fetch(`/api/requerimientos/${r.id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      messageApi.error(err?.error ?? "Error al eliminar.");
      return;
    }
    messageApi.success("Eliminado.");
    fetchData();
    onUpdated?.();
  }

  // ── Stats ──
  const stats = useMemo(() => {
    let borrador = 0, aprobados = 0, sinAprob = 0, conOC = 0, anulados = 0;
    for (const r of rows) {
      const sr = r.status_requerimiento_codigo;
      if (sr === "BORRADOR") borrador++;
      else if (sr === "APROBADO") aprobados++;
      else if (sr === "SIN_APROBACION") sinAprob++;
      else if (sr === "ANULADO") anulados++;
      if (r.po_id) conOC++;
    }
    return { borrador, aprobados, sinAprob, conOC, anulados };
  }, [rows]);
  const hayBorradores = stats.borrador > 0;

  // Valores únicos para filtros derivados de relaciones
  const reqStatusValores = [...new Set(rows.map((r) => r.status_requerimiento?.nombre).filter(Boolean) as string[])]
    .sort().map((v) => ({ text: v, value: v }));
  const cotStatusValores = [...new Set(rows.map((r) => r.status_cotizacion?.nombre).filter(Boolean) as string[])]
    .sort().map((v) => ({ text: v, value: v }));
  const ocStatusValores = [...new Set(rows.map((r) => r.status_oc?.nombre).filter(Boolean) as string[])]
    .sort().map((v) => ({ text: v, value: v }));

  // ── Columnas ──
  const columns: ColumnsType<RequerimientoRow> = [
    {
      key: "item_req", title: "#", dataIndex: "item_req", width: 50, align: "center",
      sorter: (a, b) => (a.item_req ?? 0) - (b.item_req ?? 0),
      filters: [...new Set(rows.map((r) => r.item_req).filter((v): v is number => v != null))]
        .sort((a, b) => a - b).map((v) => ({ text: String(v), value: String(v) })),
      filterSearch: true,
      onFilter: (value, r) => String(r.item_req) === value,
    },
    {
      title: "Nro Req", key: "nro", width: 130,
      ...filtroPorColumna(rows, "nro_req"),
      render: (_, r) => (
        <Space size={4} orientation="vertical" style={{ lineHeight: 1.2 }}>
          <Text strong style={{ fontSize: 11 }}>{r.nro_req ?? "—"}</Text>
          {r.es_adicional && <Tag color="gold" style={{ fontSize: 9, margin: 0 }}>ADICIONAL</Tag>}
        </Space>
      ),
    },
    {
      key: "tipo_codigo",
      title: "Tipo", dataIndex: "tipo_codigo", width: 70, align: "center",
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
        <div style={{ lineHeight: 1.3 }}>
          <div style={{ fontSize: 12 }}>
            {r.material_codigo && <Tag style={{ fontSize: 10 }}>{r.material_codigo}</Tag>}
            {r.descripcion}
          </div>
          {r.fabricante_codigo && (
            <Text type="secondary" style={{ fontSize: 10 }}>
              {r.fabricante_codigo}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: "Qty", key: "qty", width: 80, align: "right",
      sorter: (a, b) => Number(a.cantidad) - Number(b.cantidad),
      filters: [...new Set(rows.map((r) => Number(r.cantidad)))]
        .sort((a, b) => a - b).map((v) => ({ text: String(v), value: String(v) })),
      filterSearch: true,
      onFilter: (value, r) => String(Number(r.cantidad)) === value,
      render: (_, r) => `${Number(r.cantidad).toLocaleString()} ${r.unidad_medida ?? ""}`,
    },
    {
      title: "Precio", key: "precio", width: 110, align: "right",
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
      title: "REQ", key: "req", width: 110, align: "center",
      filters: reqStatusValores, filterSearch: true,
      onFilter: (value, r) => r.status_requerimiento?.nombre === value,
      render: (_, r) => r.status_requerimiento ? (
        <Tag color={REQ_COLOR[r.status_requerimiento.codigo] ?? "default"} style={{ margin: 0, fontSize: 10 }}>
          {r.status_requerimiento.nombre}
        </Tag>
      ) : "—",
    },
    {
      title: "COT", key: "cot", width: 110, align: "center",
      filters: cotStatusValores, filterSearch: true,
      onFilter: (value, r) => r.status_cotizacion?.nombre === value,
      render: (_, r) => r.status_cotizacion ? (
        <Tag color={COT_COLOR[r.status_cotizacion.codigo] ?? "default"} style={{ margin: 0, fontSize: 10 }}>
          {r.status_cotizacion.nombre}
        </Tag>
      ) : "—",
    },
    {
      title: "OC", key: "oc", width: 130, align: "center",
      filters: ocStatusValores, filterSearch: true,
      onFilter: (value, r) => r.status_oc?.nombre === value,
      render: (_, r) => (
        <Space orientation="vertical" size={2} style={{ lineHeight: 1 }}>
          {r.status_oc ? (
            <Tag color={OC_COLOR[r.status_oc.codigo] ?? "default"} style={{ margin: 0, fontSize: 10 }}>
              {r.status_oc.nombre}
            </Tag>
          ) : "—"}
          {r.compra?.numero_po && (
            <Text style={{ fontSize: 10 }} code>{r.compra.numero_po}</Text>
          )}
        </Space>
      ),
    },
    {
      title: "", key: "actions", width: 180, fixed: "right",
      render: (_, r) => {
        const sr = r.status_requerimiento_codigo;
        // En el tab OT solo permitimos editar/eliminar/enviar mientras está en BORRADOR.
        // Los demás estados se gestionan desde el módulo /requerimientos por admin.
        const isBorrador = sr === "BORRADOR";
        const canSend = isBorrador;
        const canEdit = isBorrador;
        const canDelete = isBorrador;
        // Aprobar/desaprobar/anular solo desde el módulo global (cuando ya fueron enviados).
        // Acá no los mostramos para evitar confusión.
        return (
          <Space size={0}>
            {canSend && (
              <Tooltip title="Enviar a aprobación">
                <Popconfirm
                  title="Enviar a aprobación"
                  description="Una vez enviado, no se puede editar más desde acá. Solo un admin puede modificarlo desde el módulo Requerimientos."
                  onConfirm={() => enviarAprobacion(r)}
                  okText="Enviar" cancelText="Cancelar"
                >
                  <Button type="text" size="small" icon={<SendOutlined style={{ color: brand.cyan }} />} />
                </Popconfirm>
              </Tooltip>
            )}
            {canEdit && (
              <Tooltip title="Editar">
                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => abrirEditar(r)} />
              </Tooltip>
            )}
            {canDelete && (
              <Popconfirm title="Eliminar permanentemente" onConfirm={() => eliminar(r)} okText="Eliminar" okButtonProps={{ danger: true }} cancelText="Cancelar">
                <Tooltip title="Eliminar">
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                </Tooltip>
              </Popconfirm>
            )}
            {!isBorrador && (
              <Tooltip title="Gestión disponible solo desde Logística → Requerimientos">
                <Text type="secondary" style={{ fontSize: 11 }}>—</Text>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
  ];

  const { columnas: columnsResizable, components: tableComponents, resetAnchos } =
    useColumnasRedimensionables<RequerimientoRow>(columns, "ot-req-cols-widths-v1");

  return (
    <div>
      {contextHolder}
      {modalCtx}
      {/* Toolbar */}
      <Row gutter={12} style={{ marginBottom: 12 }} wrap>
        <Col flex="auto">
          <Space wrap>
            <Tag color={brand.navy}>Total: {rows.length}</Tag>
            {stats.borrador > 0 && <Tag color="warning">Borrador: {stats.borrador}</Tag>}
            <Tag color="default">Sin aprob.: {stats.sinAprob}</Tag>
            <Tag color="success">Aprobados: {stats.aprobados}</Tag>
            <Tag color="processing">Con OC: {stats.conOC}</Tag>
            {stats.anulados > 0 && <Tag>Anulados: {stats.anulados}</Tag>}
          </Space>
        </Col>
        <Col>
          <Space>
            {hayBorradores && (
              <Popconfirm
                title={`Enviar ${stats.borrador} borrador(es) a aprobación`}
                description="Una vez enviados, no podrás editarlos desde acá. Solo un admin desde el módulo Requerimientos."
                onConfirm={enviarTodosBorrador}
                okText="Enviar todos" cancelText="Cancelar"
              >
                <Button type="primary" ghost icon={<SendOutlined />}>
                  Enviar todos a aprobación ({stats.borrador})
                </Button>
              </Popconfirm>
            )}
            <ColumnasToggleButton<RequerimientoRow>
              columns={columns}
              ocultas={ocultas}
              setOcultas={setOcultas}
              obligatorias={["item_req", "desc"]}
            />
          <Button onClick={resetAnchos}>Restablecer anchos</Button>
            <Button icon={<ReloadOutlined />} onClick={fetchData}>Refrescar</Button>
            {codRepCodigo && (
              <Tooltip title={`Copia los items del template del cod_rep ${codRepCodigo}`}>
                <Button icon={<FileSyncOutlined />} onClick={abrirDialogTemplate}>
                  Generar desde template
                </Button>
              </Tooltip>
            )}
            <Button type="primary" icon={<PlusOutlined />} onClick={abrirCrear}>
              Agregar adicional
            </Button>
          </Space>
        </Col>
      </Row>

      {!codRepCodigo && rows.length === 0 && (
        <Alert
          type="info" showIcon style={{ marginBottom: 12 }}
          title="Sin cod_rep asignado"
          description="Esta OT no tiene código de reparación, por lo que no hay template para aplicar. Agregá los items manualmente con el botón 'Agregar adicional'."
        />
      )}

      <Row gutter={[12, 8]} style={{ marginBottom: 12 }}>
        <Col xs={24} md={12}>
          <RangoFechasFiltro label="Fecha solicitud" value={rangoSol} onChange={setRangoSol} />
        </Col>
        <Col xs={24} md={12}>
          <RangoFechasFiltro label="Fecha requerida" value={rangoReq} onChange={setRangoReq} />
        </Col>
      </Row>

      {rows.length === 0 ? (
        <Empty description="Sin requerimientos. Aplicá el template o agregá un adicional manual." />
      ) : (
        <Table
          rowKey="id"
          columns={visibleColumns(columnsResizable, ocultas)}
        components={tableComponents}
          dataSource={rows.filter((r) =>
            dentroDeRango(r, "fecha_solicitud", rangoSol) &&
            dentroDeRango(r, "fecha_requerida", rangoReq)
          )}
          loading={loading}
          size="small"
          pagination={{ pageSize: 50, showTotal: (t) => `${t} items`, placement: ["topEnd", "bottomEnd"] }}
          scroll={{ x: 1300 }}
          sticky={{ offsetHeader: 56, offsetScroll: 0 }}
          rowClassName={(r) => r.status_requerimiento_codigo === "ANULADO" ? "req-anulado" : ""}
        />
      )}

      {/* Modal crear/editar */}
      <Modal
        title={editingId ? "Editar requerimiento" : "Nuevo requerimiento adicional"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={onSubmit}
        confirmLoading={saving}
        okText={editingId ? "Guardar" : "Crear"}
        cancelText="Cancelar"
        width={680}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="tipo_codigo"
            label="Tipo"
            rules={[{ required: true }]}
          >
            <Radio.Group disabled={!!editingId}>
              <Radio.Button value="MAC">MAC (Material catalogado)</Radio.Button>
              <Radio.Button value="CAD">CAD (Cargo directo)</Radio.Button>
              <Radio.Button value="SER">SER (Servicio)</Radio.Button>
            </Radio.Group>
          </Form.Item>

          {tipoSeleccionado === "MAC" && (
            <Form.Item
              name="material_codigo"
              label="Material"
              rules={[{ required: true, message: "Material requerido para tipo MAC" }]}
            >
              <Select
                showSearch
                placeholder="Buscá por código o descripción…"
                optionFilterProp="label"
                onChange={onMaterialSelect}
                options={materiales.map((m) => ({
                  value: m.codigo,
                  label: `${m.codigo} — ${m.descripcion}${m.fabricante_codigo ? ` [${m.fabricante_codigo}]` : ""}`,
                }))}
              />
            </Form.Item>
          )}

          {tipoSeleccionado === "SER" && (
            <Form.Item
              label="Servicio (catálogo)"
              extra="Seleccioná uno del catálogo y se autocompleta la descripción. Podés editar después."
            >
              <Select
                showSearch
                placeholder="Buscar servicio del catálogo…"
                optionFilterProp="label"
                onChange={onServicioSelect}
                allowClear
                options={servicios.map((s) => ({
                  value: s.codigo,
                  label: `${s.codigo} — ${s.nombre}`,
                }))}
              />
            </Form.Item>
          )}

          <Form.Item
            name="descripcion"
            label="Descripción"
            rules={[{ required: true, max: 500 }]}
          >
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
                  showSearch allowClear
                  optionFilterProp="label"
                  placeholder="Elegir fabricante…"
                  options={fabricantes.map((f) => ({ value: f.codigo, label: `${f.codigo} — ${f.nombre}` }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="fecha_requerida" label="Fecha requerida">
            <DatePicker style={{ width: 200 }} format="DD/MM/YYYY" />
          </Form.Item>

          <Form.Item name="observaciones" label="Observaciones">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <style jsx global>{`
        .req-anulado > td { background: #FFF1F0 !important; opacity: 0.7; }
      `}</style>
    </div>
  );
}
