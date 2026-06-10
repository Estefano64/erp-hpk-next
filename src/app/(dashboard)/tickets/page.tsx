"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Typography, Table, Button, Input, Select, Space, Tag, Modal, Form,
  App, Popconfirm, Tooltip, Row, Col,
} from "antd";
import {
  BugOutlined, PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined,
  PaperClipOutlined, CloseCircleOutlined, EyeOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useSession } from "next-auth/react";
import dayjs from "dayjs";
import { brand } from "@/lib/theme";
import { useResponsive, modalWidth } from "@/lib/responsive";
import { uploadToR2 } from "@/lib/r2-client";
import { R2Image } from "@/components/R2Image";
import { numeracionColumn, paginacionEstandar, PAGINATION_PAGE_SIZE, useColumnasRedimensionables } from "@/lib/tables";

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
  const { data: session } = useSession();
  // Solo el admin gestiona tickets (ve todos, cambia estado, asigna, elimina).
  // El resto ve solo los suyos en modo lectura y puede crear nuevos.
  const esAdmin = ((session?.user as { roles?: string[] } | undefined)?.roles ?? []).includes("admin");
  const [formNuevo] = Form.useForm<NuevoForm>();
  const [formEditar] = Form.useForm<EditarForm>();

  const [rows, setRows] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGINATION_PAGE_SIZE);
  const [filterEstado, setFilterEstado] = useState<string | undefined>();

  // Modal "Nuevo" — la captura se acepta vía Ctrl+V (paste del portapapeles).
  // Más práctico que abrir un selector de archivos para screenshots.
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [savingNuevo, setSavingNuevo] = useState(false);
  const [capturaFile, setCapturaFile] = useState<File | null>(null);
  const [capturaPreview, setCapturaPreview] = useState<string | null>(null);
  const pasteAreaRef = useRef<HTMLDivElement>(null);

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
    setCapturaFile(null);
    setCapturaPreview(null);
    setNuevoOpen(true);
    // resetFields debe correr después de que el form esté montado en el modal.
    setTimeout(() => formNuevo.resetFields(), 0);
  }

  function cerrarNuevo() {
    setNuevoOpen(false);
    setCapturaFile(null);
    if (capturaPreview) URL.revokeObjectURL(capturaPreview);
    setCapturaPreview(null);
  }

  // Maneja Ctrl+V dentro del modal: si el portapapeles trae una imagen, la usa
  // como captura. Funciona con screenshots de Windows (Snipping Tool / Print Screen).
  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const blob = item.getAsFile();
        if (!blob) continue;
        e.preventDefault();
        const ext = item.type.split("/")[1] ?? "png";
        const file = new File([blob], `captura-${Date.now()}.${ext}`, { type: item.type });
        setCapturaFile(file);
        if (capturaPreview) URL.revokeObjectURL(capturaPreview);
        setCapturaPreview(URL.createObjectURL(file));
        message.success("Captura pegada");
        return;
      }
    }
  }

  function quitarCaptura() {
    setCapturaFile(null);
    if (capturaPreview) URL.revokeObjectURL(capturaPreview);
    setCapturaPreview(null);
  }

  async function handleCrear() {
    try {
      const values = await formNuevo.validateFields();
      setSavingNuevo(true);

      // Si el usuario pegó una captura, primero sube a R2.
      let captura: { key: string; nombre: string; mime: string; tamano: number } | null = null;
      if (capturaFile) {
        const meta = await uploadToR2({
          file: capturaFile,
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
      cerrarNuevo();
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

  const columns: ColumnsType<Ticket> = useMemo(() => {
    const cols: ColumnsType<Ticket> = [
    numeracionColumn<Ticket>({ current: page, pageSize }),
    {
      key: "id", title: "Nro", dataIndex: "id", width: 70,
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
      key: "acc", title: "", width: esAdmin ? 100 : 60, align: "center", fixed: "right",
      render: (_: unknown, r: Ticket) => (
        <Space size="small">
          <Tooltip title={esAdmin ? "Ver / editar" : "Ver"}>
            <Button size="small" type="text" icon={esAdmin ? <EditOutlined /> : <EyeOutlined />} onClick={() => openEditar(r)} />
          </Tooltip>
          {esAdmin && (
            <Popconfirm title="¿Eliminar ticket?" okText="Eliminar" okButtonProps={{ danger: true }} cancelText="Cancelar" onConfirm={() => handleEliminar(r.id)}>
              <Tooltip title="Eliminar"><Button size="small" type="text" danger icon={<DeleteOutlined />} /></Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
    ];
    // Usuario no-admin: ocultar columnas de gestión (siempre son él / no le competen).
    return esAdmin
      ? cols
      : cols.filter((c) => !["creado_por", "asignado_a"].includes((c as { key?: string }).key ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, esAdmin]);

  const { columnas, components, TableDragWrapper } = useColumnasRedimensionables<Ticket>(
    columns, "tickets-v1", { data: rows },
  );

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
          <Select showSearch optionFilterProp="label"
            placeholder="Filtrar por estado"
            allowClear
            value={filterEstado}
            onChange={(v) => { setFilterEstado(v); setPage(1); }}
            options={Object.entries(ESTADO_TAG).map(([k, v]) => ({ value: k, label: v.label }))}
            style={{ width: "100%" }}
          />
        </Col>
      </Row>

      <TableDragWrapper>
        <Table
          rowKey="id"
          columns={columnas}
          components={components}
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
      </TableDragWrapper>

      {/* Modal: Nuevo ticket */}
      <Modal
        title="Nuevo ticket"
        open={nuevoOpen}
        onCancel={cerrarNuevo}
        onOk={handleCrear}
        confirmLoading={savingNuevo}
        okText="Crear"
        cancelText="Cancelar"
        width={modalWidth(screens, 640)}
        destroyOnHidden
      >
        <div ref={pasteAreaRef} onPaste={handlePaste}>
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
            <Form.Item label="Captura — pegá con Ctrl+V">
              {capturaPreview ? (
                <div style={{ position: "relative", display: "inline-block", maxWidth: "100%" }}>
                  <img
                    src={capturaPreview}
                    alt="Captura pegada"
                    style={{ maxWidth: "100%", maxHeight: 240, borderRadius: 4, border: `1px solid ${brand.border}`, display: "block" }}
                  />
                  <Button
                    size="small"
                    icon={<CloseCircleOutlined />}
                    onClick={quitarCaptura}
                    style={{ position: "absolute", top: 4, right: 4 }}
                    danger
                  >
                    Quitar
                  </Button>
                  {capturaFile && (
                    <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 4 }}>
                      {capturaFile.name} · {(capturaFile.size / 1024).toFixed(1)} KB
                    </Text>
                  )}
                </div>
              ) : (
                <div
                  style={{
                    border: `1px dashed ${brand.border}`,
                    borderRadius: 6,
                    padding: "20px 12px",
                    textAlign: "center",
                    background: brand.bgPage,
                    color: brand.textSecondary,
                  }}
                >
                  <PaperClipOutlined style={{ fontSize: 24, marginBottom: 6 }} />
                  <div style={{ fontSize: 13 }}>
                    Hacé un screenshot (PrtScr / Snipping Tool) y pegalo con <b>Ctrl+V</b> dentro de este modal
                  </div>
                </div>
              )}
            </Form.Item>
          </Form>
        </div>
      </Modal>

      {/* Modal: Ver / editar */}
      <Modal
        title={editar ? `Ticket #${editar.id}` : ""}
        open={!!editar}
        onCancel={() => setEditar(null)}
        onOk={esAdmin ? handleEditar : undefined}
        confirmLoading={savingEditar}
        okText="Guardar"
        okButtonProps={esAdmin ? undefined : { style: { display: "none" } }}
        cancelText={esAdmin ? "Cancelar" : "Cerrar"}
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
            {esAdmin ? (
              <Row gutter={16} style={{ marginTop: 16 }}>
                <Col xs={12}>
                  <Form.Item name="estado" label="Estado" rules={[{ required: true }]}>
                    <Select showSearch optionFilterProp="label" options={Object.entries(ESTADO_TAG).map(([k, v]) => ({ value: k, label: v.label }))} />
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
            ) : (
              // Vista de solo lectura para el creador del ticket.
              <div style={{ marginTop: 16 }}>
                <div style={{ marginBottom: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>Estado:</Text>
                  <Tag color={ESTADO_TAG[editar.estado].color}>{ESTADO_TAG[editar.estado].label}</Tag>
                </div>
                {editar.notas_resolucion && (
                  <div>
                    <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Notas de resolución</Text>
                    <Paragraph style={{ background: brand.bgPage, padding: 12, borderRadius: 4, whiteSpace: "pre-wrap", marginBottom: 0 }}>
                      {editar.notas_resolucion}
                    </Paragraph>
                  </div>
                )}
              </div>
            )}
          </Form>
        )}
      </Modal>
    </div>
  );
}
