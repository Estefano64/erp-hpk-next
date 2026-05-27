"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Typography, Table, Button, Input, Select, Space, Tag, Modal, Form,
  Upload, App, Popconfirm, Tooltip, Row, Col,
} from "antd";
import {
  BugOutlined, PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined,
  PaperClipOutlined, EyeOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { UploadFile, RcFile } from "antd/es/upload";
import dayjs from "dayjs";
import { brand } from "@/lib/theme";
import { useResponsive, modalWidth } from "@/lib/responsive";
import { uploadToR2 } from "@/lib/r2-client";
import { R2Image } from "@/components/R2Image";
import { numeracionColumn, paginacionEstandar, PAGINATION_PAGE_SIZE } from "@/lib/tables";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

interface Ticket {
  id: number;
  descripcion: string;
  estado: "ABIERTO" | "EN_PROCESO" | "RESUELTO" | "CERRADO";
  captura_key: string | null;
  captura_nombre: string | null;
  captura_mime: string | null;
  captura_tamano: number | null;
  creado_por: string;
  asignado_a: string | null;
  notas_resolucion: string | null;
  resuelto_por: string | null;
  fecha_resolucion: string | null;
  created_at: string;
  updated_at: string;
}

const ESTADO_TAG: Record<Ticket["estado"], { color: string; label: string }> = {
  ABIERTO:     { color: "blue",     label: "Abierto" },
  EN_PROCESO:  { color: "orange",   label: "En proceso" },
  RESUELTO:    { color: "green",    label: "Resuelto" },
  CERRADO:     { color: "default",  label: "Cerrado" },
};

interface NuevoForm {
  descripcion: string;
}

interface EditarForm {
  estado: Ticket["estado"];
  asignado_a: string;
  notas_resolucion: string;
}

export default function TicketsPage() {
  const { message } = App.useApp();
  const { screens } = useResponsive();
  const [formNuevo] = Form.useForm<NuevoForm>();
  const [formEditar] = Form.useForm<EditarForm>();

  const [rows, setRows] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGINATION_PAGE_SIZE);
  const [filterEstado, setFilterEstado] = useState<string | undefined>();

  // Modal "Nuevo"
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [savingNuevo, setSavingNuevo] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  // Modal "Editar / Ver detalle"
  const [editar, setEditar] = useState<Ticket | null>(null);
  const [savingEditar, setSavingEditar] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filterEstado ? `?estado=${filterEstado}` : "";
      const res = await fetch(`/api/tickets${qs}`);
      if (res.ok) {
        const j = await res.json();
        setRows(j.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [filterEstado]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function openNuevo() {
    formNuevo.resetFields();
    setFileList([]);
    setNuevoOpen(true);
  }

  async function handleCrear() {
    try {
      const values = await formNuevo.validateFields();
      setSavingNuevo(true);

      // Si el usuario subió una captura, primero sube a R2.
      let captura: { key: string; nombre: string; mime: string; tamano: number } | null = null;
      const fileRaw = fileList[0]?.originFileObj;
      if (fileRaw) {
        const meta = await uploadToR2({
          file: fileRaw as RcFile,
          uploadUrlEndpoint: "/api/tickets/upload-url",
        });
        captura = { key: meta.key, nombre: meta.nombre_archivo, mime: meta.tipo_mime, tamano: meta.tamano };
      }

      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descripcion: values.descripcion, captura }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error" }));
        throw new Error(err.error || "No se pudo crear el ticket");
      }
      message.success("Ticket creado. Gracias por reportar.");
      setNuevoOpen(false);
      setFileList([]);
      fetchData();
    } catch (e) {
      if (e instanceof Error) message.error(e.message);
    } finally {
      setSavingNuevo(false);
    }
  }

  function openEditar(row: Ticket) {
    setEditar(row);
    formEditar.setFieldsValue({
      estado: row.estado,
      asignado_a: row.asignado_a ?? "",
      notas_resolucion: row.notas_resolucion ?? "",
    });
  }

  async function handleEditar() {
    if (!editar) return;
    try {
      const values = await formEditar.validateFields();
      setSavingEditar(true);
      const res = await fetch(`/api/tickets/${editar.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estado: values.estado,
          asignado_a: values.asignado_a || null,
          notas_resolucion: values.notas_resolucion || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error" }));
        throw new Error(err.error || "No se pudo actualizar");
      }
      message.success("Ticket actualizado");
      setEditar(null);
      fetchData();
    } catch (e) {
      if (e instanceof Error) message.error(e.message);
    } finally {
      setSavingEditar(false);
    }
  }

  async function handleEliminar(id: number) {
    const res = await fetch(`/api/tickets/${id}`, { method: "DELETE" });
    if (res.ok) {
      message.success("Ticket eliminado");
      fetchData();
    } else {
      message.error("No se pudo eliminar");
    }
  }

  const columns: ColumnsType<Ticket> = useMemo(() => [
    numeracionColumn<Ticket>({ current: page, pageSize }),
    {
      key: "id", title: "Nro", dataIndex: "id", width: 70, fixed: "left",
      render: (v: number) => <Tag style={{ background: brand.navy, color: brand.white, border: "none", fontFamily: "monospace" }}>#{v}</Tag>,
    },
    {
      key: "estado", title: "Estado", dataIndex: "estado", width: 120,
      filters: Object.entries(ESTADO_TAG).map(([k, v]) => ({ text: v.label, value: k })),
      onFilter: (value, r) => r.estado === value,
      render: (v: Ticket["estado"]) => <Tag color={ESTADO_TAG[v].color}>{ESTADO_TAG[v].label}</Tag>,
    },
    {
      key: "descripcion", title: "Descripción", dataIndex: "descripcion", width: 360, ellipsis: true,
      render: (v: string) => <Tooltip title={v}><span>{v}</span></Tooltip>,
    },
    {
      key: "captura", title: "Captura", width: 90, align: "center",
      render: (_: unknown, r: Ticket) => r.captura_key
        ? <PaperClipOutlined style={{ color: brand.cyan, fontSize: 16 }} />
        : <Text type="secondary">—</Text>,
    },
    {
      key: "creado_por", title: "Creado por", dataIndex: "creado_por", width: 160,
    },
    {
      key: "asignado_a", title: "Asignado a", dataIndex: "asignado_a", width: 160,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      key: "created_at", title: "Creado", dataIndex: "created_at", width: 140,
      render: (v: string) => dayjs(v).format("DD/MM/YY HH:mm"),
    },
    {
      key: "fecha_resolucion", title: "Resuelto", dataIndex: "fecha_resolucion", width: 140,
      render: (v: string | null) => v ? dayjs(v).format("DD/MM/YY HH:mm") : <Text type="secondary">—</Text>,
    },
    {
      key: "acc", title: "", width: 100, align: "center", fixed: "right",
      render: (_: unknown, r: Ticket) => (
        <Space size="small">
          <Tooltip title="Ver / editar"><Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEditar(r)} /></Tooltip>
          <Popconfirm title="¿Eliminar ticket?" okText="Eliminar" okButtonProps={{ danger: true }} cancelText="Cancelar" onConfirm={() => handleEliminar(r.id)}>
            <Tooltip title="Eliminar"><Button size="small" type="text" danger icon={<DeleteOutlined />} /></Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [page, pageSize]);

  return (
    <div>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            <BugOutlined style={{ marginRight: 8, color: brand.cyan }} />
            Tickets
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Reportá bugs, mejoras o consultas del ERP. Adjuntá una captura si ayuda a explicar el problema.
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData} />
          <Button type="primary" icon={<PlusOutlined />} onClick={openNuevo}>
            Nuevo ticket
          </Button>
        </Space>
      </div>

      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col xs={24} md={6}>
          <Select
            placeholder="Filtrar por estado"
            allowClear
            value={filterEstado}
            onChange={(v) => { setFilterEstado(v); setPage(1); }}
            options={Object.entries(ESTADO_TAG).map(([k, v]) => ({ value: k, label: v.label }))}
            style={{ width: "100%" }}
          />
        </Col>
      </Row>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={loading}
        size="small"
        scroll={{ x: 1400 }}
        sticky={{ offsetHeader: 56, offsetScroll: 0 }}
        pagination={paginacionEstandar({
          current: page, pageSize, total: rows.length,
          onChange: (p, s) => { setPage(p); setPageSize(s); },
          label: "tickets",
        })}
      />

      {/* Modal: Nuevo ticket */}
      <Modal
        title="Nuevo ticket"
        open={nuevoOpen}
        onCancel={() => { setNuevoOpen(false); setFileList([]); }}
        onOk={handleCrear}
        confirmLoading={savingNuevo}
        okText="Crear"
        cancelText="Cancelar"
        width={modalWidth(screens, 640)}
        destroyOnHidden
      >
        <Form form={formNuevo} layout="vertical">
          <Form.Item
            name="descripcion"
            label="Descripción"
            rules={[{ required: true, message: "Requerido" }, { max: 5000, message: "Máx 5000 caracteres" }]}
          >
            <TextArea
              rows={5}
              maxLength={5000}
              showCount
              placeholder="Explicá el bug, mejora o consulta. ¿Qué pasó? ¿Qué esperabas que pase?"
            />
          </Form.Item>
          <Form.Item label="Captura (opcional)">
            <Upload
              accept="image/*"
              listType="picture"
              maxCount={1}
              fileList={fileList}
              onChange={({ fileList: fl }) => setFileList(fl)}
              beforeUpload={() => false}
            >
              <Button icon={<PaperClipOutlined />}>Seleccionar imagen</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal: Ver / editar */}
      <Modal
        title={editar ? `Ticket #${editar.id}` : ""}
        open={!!editar}
        onCancel={() => setEditar(null)}
        onOk={handleEditar}
        confirmLoading={savingEditar}
        okText="Guardar"
        cancelText="Cerrar"
        width={modalWidth(screens, 720)}
        destroyOnHidden
      >
        {editar && (
          <Form form={formEditar} layout="vertical">
            <Paragraph style={{ background: brand.bgPage, padding: 12, borderRadius: 4, marginBottom: 16, whiteSpace: "pre-wrap" }}>
              {editar.descripcion}
            </Paragraph>
            {editar.captura_key && (
              <div style={{ marginBottom: 16 }}>
                <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Captura adjunta</Text>
                <R2Image
                  resource="ticket-captura"
                  resourceId={editar.id}
                  r2Key={editar.captura_key}
                  alt={editar.captura_nombre ?? "Captura"}
                  style={{ maxWidth: "100%", maxHeight: 400, border: `1px solid ${brand.border}`, borderRadius: 4 }}
                />
              </div>
            )}
            <Text type="secondary" style={{ fontSize: 12 }}>
              Creado por <b>{editar.creado_por}</b> · {dayjs(editar.created_at).format("DD/MM/YY HH:mm")}
              {editar.fecha_resolucion && (
                <> · Resuelto por <b>{editar.resuelto_por}</b> el {dayjs(editar.fecha_resolucion).format("DD/MM/YY HH:mm")}</>
              )}
            </Text>
            <Row gutter={16} style={{ marginTop: 16 }}>
              <Col xs={12}>
                <Form.Item name="estado" label="Estado" rules={[{ required: true }]}>
                  <Select options={Object.entries(ESTADO_TAG).map(([k, v]) => ({ value: k, label: v.label }))} />
                </Form.Item>
              </Col>
              <Col xs={12}>
                <Form.Item name="asignado_a" label="Asignado a">
                  <Input placeholder="Nombre o área" maxLength={100} />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item name="notas_resolucion" label="Notas de resolución">
                  <TextArea rows={3} maxLength={2000} placeholder="Qué se hizo, link a commit, etc." />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        )}
      </Modal>
    </div>
  );
}
