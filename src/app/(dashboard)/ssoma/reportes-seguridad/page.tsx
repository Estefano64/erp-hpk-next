"use client";

// Reportes de Seguridad (formato HPK-S-F-03).
// Flujo: cualquier personal crea (Parte A + fotos) → el encargado de
// seguridad (rol "ssoma") revisa y aprueba → llena el plan de acción
// (Parte B) → cierra con foto + comentario obligatorios.
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Typography, Table, Button, Input, Select, Space, Tag, Modal, Form,
  Row, Col, Card, App, Popconfirm, Tooltip, Drawer, DatePicker, Radio,
  Checkbox, Upload, Divider,
} from "antd";
import {
  SafetyOutlined, PlusOutlined, ReloadOutlined, SearchOutlined,
  EditOutlined, EyeOutlined, DeleteOutlined, CheckCircleOutlined,
  LockOutlined, CameraOutlined, MinusCircleOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useResponsive, modalWidth } from "@/lib/responsive";
import {
  numeracionColumn,
  paginacionEstandar,
  PAGINATION_PAGE_SIZE,
  useColumnasOcultas,
  ColumnasToggleButton,
  visibleColumns,
  useColumnasRedimensionables,
  filtroPorColumna,
  usePersistedState,
  useTablaFiltrada,
  useAbortableFetch,
} from "@/lib/tables";
import { ExportarExcelButton } from "@/components/ExportarExcelButton";
import { dateOnlyLocal, formatDateOnly } from "@/lib/dates";
import {
  RS_ESTADOS, RS_TIPOS, RS_DANOS_POTENCIALES, labelDe,
  formatReporteSeguridadCodigo,
} from "@/lib/ssoma";
import { uploadToR2 } from "@/lib/r2-client";
import {
  SsomaFotosUpload, SsomaFotosGaleria, type FotoPendiente,
} from "@/components/modules/ssoma/SsomaFotos";
import { R2Image } from "@/components/R2Image";

const { Title, Text } = Typography;
const { TextArea } = Input;

const UPLOAD_URL = "/api/ssoma/reportes-seguridad/upload-url";

interface AccionRow {
  id: number;
  orden: number;
  descripcion: string;
  responsable: string | null;
  fecha_cumplimiento: string | null;
}

interface FotoRow {
  id: number;
  r2_key: string;
  nombre_archivo: string;
}

interface ReporteRow {
  id: number;
  numero: number | null;
  anio: number | null;
  lugar: string | null;
  fecha: string;
  hora: string | null;
  tipo: string | null;
  reportado_por: string | null;
  cargo: string | null;
  danos_potenciales: string[];
  descripcion: string | null;
  supervisor_ssoma: string | null;
  estado: string;
  aprobado_por: string | null;
  fecha_aprobacion: string | null;
  comentario_aprobacion: string | null;
  cerrado_por: string | null;
  fecha_cierre: string | null;
  comentario_cierre: string | null;
  cierre_foto_key: string | null;
  cierre_foto_nombre: string | null;
  activo: boolean;
  usuario_crea: string | null;
  created_at: string;
  acciones: AccionRow[];
  fotos: FotoRow[];
}

export default function ReportesSeguridadPage() {
  const { message } = App.useApp();
  const screens = useResponsive();

  const [rows, setRows] = useState<ReporteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGINATION_PAGE_SIZE);

  // Rol del usuario: el flujo aprobar/cerrar/anular es del encargado SSOMA.
  const [esSsoma, setEsSsoma] = useState(false);
  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const roles: string[] = Array.isArray(data?.user?.roles) ? data.user.roles : [];
        setEsSsoma(roles.includes("admin") || roles.includes("ssoma"));
      })
      .catch(() => { /* ignore */ });
  }, []);

  // Filtros persistidos
  const [search, setSearch] = usePersistedState<string>("rs-search", "");
  const [estadoFiltro, setEstadoFiltro] = usePersistedState<string>("rs-estado", "");
  const [, setColumnFilters] = usePersistedState<Record<string, (string | number | boolean | null)[] | null>>(
    "rs-col-filters",
    {},
  );

  // Modales
  const [crearOpen, setCrearOpen] = useState(false);
  const [formCrear] = Form.useForm();
  const [fotosNuevas, setFotosNuevas] = useState<FotoPendiente[]>([]);

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ReporteRow | null>(null);
  const [formEdit] = Form.useForm();
  const [subiendoFotoEdit, setSubiendoFotoEdit] = useState(false);

  const [aprobarOpen, setAprobarOpen] = useState(false);
  const [aprobarTarget, setAprobarTarget] = useState<ReporteRow | null>(null);
  const [formAprobar] = Form.useForm();

  const [cerrarOpen, setCerrarOpen] = useState(false);
  const [cerrarTarget, setCerrarTarget] = useState<ReporteRow | null>(null);
  const [formCerrar] = Form.useForm();
  const [fotoCierre, setFotoCierre] = useState<FotoPendiente[]>([]);

  const [verOpen, setVerOpen] = useState(false);
  const [verTarget, setVerTarget] = useState<ReporteRow | null>(null);

  // ── Fetch ────────────────────────────────────────────────
  const abortable = useAbortableFetch();
  const fetchData = useCallback(async () => {
    const controller = abortable.start();
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", "500");
      if (search.trim()) qs.set("search", search.trim());
      if (estadoFiltro) qs.set("estado", estadoFiltro);
      const res = await fetch(`/api/ssoma/reportes-seguridad?${qs}`, { signal: controller.signal });
      if (!res.ok) throw new Error("Error al cargar");
      const json = await res.json();
      if (controller.signal.aborted) return;
      setRows(json.data || []);
    } catch (e) {
      if (abortable.isAbort(e)) return;
      message.error((e as Error).message);
    } finally {
      if (abortable.isCurrent(controller)) setLoading(false);
    }
  }, [search, estadoFiltro, message, abortable]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Acciones ─────────────────────────────────────────────
  async function handleCrear() {
    try {
      const values = await formCrear.validateFields();
      const res = await fetch("/api/ssoma/reportes-seguridad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lugar: values.lugar || null,
          fecha: values.fecha ? values.fecha.format("YYYY-MM-DD") : null,
          hora: values.hora || null,
          tipo: values.tipo || null,
          reportado_por: values.reportado_por || null,
          cargo: values.cargo || null,
          danos_potenciales: values.danos_potenciales || [],
          descripcion: values.descripcion,
          fotos: fotosNuevas.map(({ key, nombre_archivo, tipo_mime, tamano }) => ({
            key, nombre_archivo, tipo_mime, tamano,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al crear");
      message.success(`Reporte ${formatReporteSeguridadCodigo(json.data.numero, json.data.anio)} creado.`);
      setCrearOpen(false);
      formCrear.resetFields();
      setFotosNuevas([]);
      fetchData();
    } catch (e) {
      const err = e as { errorFields?: unknown; message?: string };
      if (err.errorFields) return;
      message.error(err.message || "Error");
    }
  }

  function openEdit(row: ReporteRow) {
    setEditTarget(row);
    formEdit.setFieldsValue({
      lugar: row.lugar ?? "",
      fecha: row.fecha ? dayjs(formatDateOnly(row.fecha), "DD/MM/YYYY") : null,
      hora: row.hora ?? "",
      tipo: row.tipo ?? undefined,
      reportado_por: row.reportado_por ?? "",
      cargo: row.cargo ?? "",
      danos_potenciales: row.danos_potenciales ?? [],
      descripcion: row.descripcion ?? "",
      supervisor_ssoma: row.supervisor_ssoma ?? "",
      acciones: (row.acciones ?? []).map((a) => ({
        descripcion: a.descripcion,
        responsable: a.responsable ?? "",
        fecha_cumplimiento: a.fecha_cumplimiento ? dayjs(formatDateOnly(a.fecha_cumplimiento), "DD/MM/YYYY") : null,
      })),
    });
    setEditOpen(true);
  }

  async function handleEdit() {
    if (!editTarget) return;
    try {
      const values = await formEdit.validateFields();
      const res = await fetch(`/api/ssoma/reportes-seguridad/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lugar: values.lugar || null,
          fecha: values.fecha ? values.fecha.format("YYYY-MM-DD") : null,
          hora: values.hora || null,
          tipo: values.tipo || null,
          reportado_por: values.reportado_por || null,
          cargo: values.cargo || null,
          danos_potenciales: values.danos_potenciales || [],
          descripcion: values.descripcion,
          supervisor_ssoma: values.supervisor_ssoma || null,
          acciones: (values.acciones || []).map(
            (a: { descripcion?: string; responsable?: string; fecha_cumplimiento?: dayjs.Dayjs | null }) => ({
              descripcion: a.descripcion || "",
              responsable: a.responsable || null,
              fecha_cumplimiento: a.fecha_cumplimiento ? a.fecha_cumplimiento.format("YYYY-MM-DD") : null,
            }),
          ),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      message.success("Reporte actualizado.");
      setEditOpen(false);
      setEditTarget(null);
      fetchData();
    } catch (e) {
      const err = e as { errorFields?: unknown; message?: string };
      if (err.errorFields) return;
      message.error(err.message || "Error");
    }
  }

  // Fotos del modal de edición: se registran al toque (el reporte ya existe).
  async function subirFotoEdit(file: File) {
    if (!editTarget) return;
    setSubiendoFotoEdit(true);
    try {
      const meta = await uploadToR2({ file, uploadUrlEndpoint: UPLOAD_URL });
      const res = await fetch(`/api/ssoma/reportes-seguridad/${editTarget.id}/fotos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(meta),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error registrando la foto");
      const nueva: FotoRow = json.data;
      setEditTarget({ ...editTarget, fotos: [...editTarget.fotos, nueva] });
      fetchData();
    } catch (e) {
      message.error((e as Error).message || "Error subiendo la foto");
    } finally {
      setSubiendoFotoEdit(false);
    }
  }

  async function borrarFotoEdit(fotoId: number) {
    if (!editTarget) return;
    try {
      const res = await fetch(`/api/ssoma/reportes-seguridad/${editTarget.id}/fotos/${fotoId}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Error");
      }
      setEditTarget({ ...editTarget, fotos: editTarget.fotos.filter((f) => f.id !== fotoId) });
      fetchData();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function handleAprobar() {
    if (!aprobarTarget) return;
    try {
      const values = await formAprobar.validateFields();
      const res = await fetch(`/api/ssoma/reportes-seguridad/${aprobarTarget.id}/aprobar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comentario: values.comentario || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      message.success("Reporte aprobado.");
      setAprobarOpen(false);
      setAprobarTarget(null);
      formAprobar.resetFields();
      fetchData();
    } catch (e) {
      const err = e as { errorFields?: unknown; message?: string };
      if (err.errorFields) return;
      message.error(err.message || "Error");
    }
  }

  async function handleCerrar() {
    if (!cerrarTarget) return;
    try {
      const values = await formCerrar.validateFields();
      if (fotoCierre.length === 0) {
        message.error("La foto de cierre es obligatoria.");
        return;
      }
      const { key, nombre_archivo, tipo_mime, tamano } = fotoCierre[0];
      const res = await fetch(`/api/ssoma/reportes-seguridad/${cerrarTarget.id}/cerrar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comentario: values.comentario,
          foto: { key, nombre_archivo, tipo_mime, tamano },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      message.success("Reporte cerrado.");
      setCerrarOpen(false);
      setCerrarTarget(null);
      formCerrar.resetFields();
      setFotoCierre([]);
      fetchData();
    } catch (e) {
      const err = e as { errorFields?: unknown; message?: string };
      if (err.errorFields) return;
      message.error(err.message || "Error");
    }
  }

  async function handleAnular(id: number) {
    try {
      const res = await fetch(`/api/ssoma/reportes-seguridad/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Error");
      }
      message.success("Reporte anulado.");
      fetchData();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  // ── Tabla ────────────────────────────────────────────────
  const allColumns: ColumnsType<ReporteRow> = useMemo(
    () => [
      numeracionColumn<ReporteRow>(),
      {
        key: "codigo",
        title: "Reporte",
        dataIndex: "numero",
        width: 120,
        fixed: "left",
        render: (_: unknown, r) => <Text strong>{formatReporteSeguridadCodigo(r.numero, r.anio)}</Text>,
      },
      {
        key: "estado",
        title: "Estado",
        dataIndex: "estado",
        width: 110,
        ...filtroPorColumna<ReporteRow>(rows, "estado"),
        render: (e: string) => {
          const m = RS_ESTADOS[e];
          return <Tag color={m?.color}>{m?.label ?? e}</Tag>;
        },
      },
      {
        key: "fecha",
        title: "Fecha",
        dataIndex: "fecha",
        width: 105,
        render: (v: string) => formatDateOnly(v),
      },
      { key: "hora", title: "Hora", dataIndex: "hora", width: 80, render: (v: string | null) => v || "—" },
      {
        key: "tipo",
        title: "Tipo",
        dataIndex: "tipo",
        width: 160,
        ...filtroPorColumna<ReporteRow>(rows, "tipo"),
        render: (v: string | null) =>
          v ? <Tag color={v === "ACTO_INSEGURO" ? "volcano" : "gold"}>{labelDe(RS_TIPOS, v)}</Tag> : "—",
      },
      { key: "lugar", title: "Lugar", dataIndex: "lugar", width: 180, render: (v: string | null) => v || "—" },
      {
        key: "reportado_por",
        title: "Reportado por",
        dataIndex: "reportado_por",
        width: 160,
        render: (v: string | null) => v || <Text type="secondary">—</Text>,
      },
      { key: "cargo", title: "Cargo", dataIndex: "cargo", width: 130, render: (v: string | null) => v || "—" },
      {
        key: "danos",
        title: "Daños potenciales",
        dataIndex: "danos_potenciales",
        width: 220,
        render: (v: string[]) =>
          v?.length ? (
            <Space size={4} wrap>
              {v.map((d) => <Tag key={d}>{labelDe(RS_DANOS_POTENCIALES, d)}</Tag>)}
            </Space>
          ) : "—",
      },
      {
        key: "descripcion",
        title: "Descripción",
        dataIndex: "descripcion",
        width: 280,
        render: (v: string | null) =>
          v ? (
            <Tooltip title={v} styles={{ root: { maxWidth: 420 } }}>
              <Text style={{ display: "block", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {v}
              </Text>
            </Tooltip>
          ) : "—",
      },
      {
        key: "fotos",
        title: "Fotos",
        width: 80,
        render: (_: unknown, r) => (r.fotos.length > 0 ? <Tag icon={<CameraOutlined />}>{r.fotos.length}</Tag> : "—"),
      },
      {
        key: "plan",
        title: "Plan de acción",
        width: 120,
        render: (_: unknown, r) =>
          r.acciones.length > 0 ? `${r.acciones.length} acción(es)` : <Text type="secondary">—</Text>,
      },
      {
        key: "aprobado_por",
        title: "Aprobado por",
        dataIndex: "aprobado_por",
        width: 150,
        render: (v: string | null) => v || <Text type="secondary">—</Text>,
      },
      {
        key: "fecha_cierre",
        title: "Cierre",
        dataIndex: "fecha_cierre",
        width: 105,
        render: (v: string | null) => (v ? new Date(v).toLocaleDateString("es-PE") : "—"),
      },
      {
        key: "acciones_btn",
        title: "Acciones",
        width: 210,
        fixed: "right",
        render: (_: unknown, r) => (
          <Space size={4} wrap>
            <Tooltip title="Ver detalle">
              <Button size="small" icon={<EyeOutlined />} onClick={() => { setVerTarget(r); setVerOpen(true); }} />
            </Tooltip>
            {r.estado !== "CERRADO" && (
              <Tooltip title="Editar">
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
              </Tooltip>
            )}
            {esSsoma && r.estado === "ABIERTO" && (
              <Tooltip title="Revisar y aprobar">
                <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => { setAprobarTarget(r); setAprobarOpen(true); }}>
                  Aprobar
                </Button>
              </Tooltip>
            )}
            {esSsoma && r.estado === "APROBADO" && (
              <Tooltip title="Cerrar (requiere foto + comentario)">
                <Button size="small" type="primary" icon={<LockOutlined />} onClick={() => { setCerrarTarget(r); setCerrarOpen(true); }}>
                  Cerrar
                </Button>
              </Tooltip>
            )}
            {esSsoma && (
              <Popconfirm
                title="¿Anular este reporte?"
                description="Se ocultará del listado."
                okText="Anular"
                okButtonProps={{ danger: true }}
                cancelText="Cancelar"
                onConfirm={() => handleAnular(r.id)}
              >
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            )}
          </Space>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, esSsoma],
  );

  const { filtradas, captureFilteredRows } = useTablaFiltrada(rows);
  const { ocultas, setOcultas } = useColumnasOcultas("rs-cols-ocultas", []);
  const { columnas, components, TableDragWrapper } = useColumnasRedimensionables(
    allColumns,
    "rs-tabla",
    { data: rows },
  );
  const visibles = visibleColumns(columnas, ocultas);

  // ── Render ───────────────────────────────────────────────
  return (
    <div style={{ padding: 16 }}>
      <Title level={3} style={{ marginTop: 0 }}>
        <SafetyOutlined /> Reportes de Seguridad
      </Title>
      <Text type="secondary">
        Formato HPK-S-F-03. <strong>1)</strong> Cualquier personal reporta un acto o condición insegura (con fotos).{" "}
        <strong>2)</strong> El encargado de seguridad revisa, aprueba y registra el plan de acción.{" "}
        <strong>3)</strong> Se cierra con foto y comentario de evidencia.
      </Text>

      <Card size="small" style={{ marginTop: 16, marginBottom: 8 }}>
        <Row gutter={[8, 8]} align="middle">
          <Col xs={24} md={8}>
            <Input
              allowClear
              placeholder="Buscar (RS-XXXX-YY, lugar, descripción, reportador)"
              prefix={<SearchOutlined />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Col>
          <Col xs={24} md={5}>
            <Select
              allowClear
              placeholder="Estado"
              style={{ width: "100%" }}
              value={estadoFiltro || undefined}
              onChange={(v) => setEstadoFiltro(v || "")}
              options={Object.entries(RS_ESTADOS).map(([value, m]) => ({ value, label: m.label }))}
            />
          </Col>
          <Col xs={24} md={11}>
            <Space wrap>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCrearOpen(true)}>
                Nuevo reporte
              </Button>
              <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
                Refrescar
              </Button>
              <ColumnasToggleButton columns={allColumns} ocultas={ocultas} setOcultas={setOcultas} />
              <ExportarExcelButton<ReporteRow>
                endpoint="/api/ssoma/reportes-seguridad"
                filename="ReportesSeguridad"
                currentRows={filtradas}
                tablaLayout={{ ocultas }}
                columns={[
                  { key: "codigo", label: "Reporte", value: (r) => formatReporteSeguridadCodigo(r.numero, r.anio) },
                  { key: "estado", label: "Estado", value: (r) => RS_ESTADOS[r.estado]?.label ?? r.estado },
                  { key: "fecha", label: "Fecha", value: (r) => dateOnlyLocal(r.fecha) },
                  { key: "hora", label: "Hora", value: (r) => r.hora ?? "" },
                  { key: "tipo", label: "Tipo", value: (r) => labelDe(RS_TIPOS, r.tipo, "") },
                  { key: "lugar", label: "Lugar", value: (r) => r.lugar ?? "" },
                  { key: "reportado_por", label: "Reportado por", value: (r) => r.reportado_por ?? "" },
                  { key: "cargo", label: "Cargo", value: (r) => r.cargo ?? "" },
                  {
                    key: "danos", label: "Daños potenciales",
                    value: (r) => (r.danos_potenciales ?? []).map((d) => labelDe(RS_DANOS_POTENCIALES, d)).join(", "),
                  },
                  { key: "descripcion", label: "Descripción", value: (r) => r.descripcion ?? "" },
                  { key: "fotos", label: "Nº fotos", value: (r) => r.fotos.length },
                  {
                    key: "plan", label: "Plan de acción",
                    value: (r) => r.acciones.map((a) => `${a.orden}) ${a.descripcion}`).join(" | "),
                  },
                  { key: "supervisor", label: "Superv. SSOMA", value: (r) => r.supervisor_ssoma ?? "" },
                  { key: "aprobado_por", label: "Aprobado por", value: (r) => r.aprobado_por ?? "" },
                  { key: "fecha_cierre", label: "Fecha cierre", value: (r) => dateOnlyLocal(r.fecha_cierre) },
                  { key: "comentario_cierre", label: "Comentario cierre", value: (r) => r.comentario_cierre ?? "" },
                ]}
              />
            </Space>
          </Col>
        </Row>
      </Card>

      <TableDragWrapper>
        <Table<ReporteRow>
          rowKey="id"
          size="small"
          loading={loading}
          columns={visibles}
          components={components}
          dataSource={rows}
          scroll={{ x: 2100 }}
          pagination={paginacionEstandar({
            current: page,
            pageSize,
            total: rows.length,
            onChange: (p, s) => { setPage(p); setPageSize(s); },
            label: "reportes",
          })}
          onChange={(_p, filters, _s, extra) => {
            captureFilteredRows(extra);
            setColumnFilters(filters as Record<string, (string | number | boolean | null)[] | null>);
          }}
        />
      </TableDragWrapper>

      {/* ── Modal Crear (Parte A) ───────────────────── */}
      <Modal
        open={crearOpen}
        title="Nuevo Reporte de Seguridad (HPK-S-F-03)"
        onCancel={() => { setCrearOpen(false); setFotosNuevas([]); }}
        onOk={handleCrear}
        okText="Crear reporte"
        width={modalWidth(screens.screens, 720)}
        destroyOnHidden
      >
        <Form form={formCrear} layout="vertical" initialValues={{ fecha: dayjs(), danos_potenciales: [] }}>
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item name="lugar" label="Lugar específico">
                <Input placeholder="¿Dónde se observó?" maxLength={200} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="fecha" label="Fecha" rules={[{ required: true, message: "Requerida" }]}>
                <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="hora" label="Hora">
                <Input placeholder="HH:MM" maxLength={10} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="tipo" label="Tipo" rules={[{ required: true, message: "Elegí el tipo" }]}>
            <Radio.Group options={RS_TIPOS.map((t) => ({ value: t.value, label: t.label }))} />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item name="reportado_por" label="Reportado por" tooltip="Si lo dejás vacío, se usa tu usuario.">
                <Input placeholder="Apellidos y nombres" maxLength={150} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="cargo" label="Cargo">
                <Input placeholder="Cargo del trabajador" maxLength={100} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="danos_potenciales" label="Daños potenciales">
            <Checkbox.Group options={RS_DANOS_POTENCIALES.map((d) => ({ value: d.value, label: d.label }))} />
          </Form.Item>
          <Form.Item
            name="descripcion"
            label="Descripción"
            rules={[{ required: true, message: "Describí el acto / condición insegura" }]}
          >
            <TextArea rows={4} maxLength={3000} showCount placeholder="¿Qué se observó? Detalle del acto o condición insegura." />
          </Form.Item>
          <Form.Item label="Fotos de evidencia">
            <SsomaFotosUpload
              uploadUrlEndpoint={UPLOAD_URL}
              value={fotosNuevas}
              onChange={setFotosNuevas}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Modal Editar (Parte A + Parte B) ────────── */}
      <Modal
        open={editOpen}
        title={
          <>
            Editar reporte —{" "}
            <Text strong>{editTarget ? formatReporteSeguridadCodigo(editTarget.numero, editTarget.anio) : ""}</Text>
          </>
        }
        onCancel={() => { setEditOpen(false); setEditTarget(null); }}
        onOk={handleEdit}
        okText="Guardar cambios"
        width={modalWidth(screens.screens, 820)}
        destroyOnHidden
      >
        {editTarget && (
          <Form form={formEdit} layout="vertical">
            <Divider titlePlacement="start" plain>Parte A — Reporte del trabajador</Divider>
            <Row gutter={12}>
              <Col xs={24} md={12}>
                <Form.Item name="lugar" label="Lugar específico">
                  <Input maxLength={200} />
                </Form.Item>
              </Col>
              <Col xs={12} md={6}>
                <Form.Item name="fecha" label="Fecha">
                  <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={12} md={6}>
                <Form.Item name="hora" label="Hora">
                  <Input maxLength={10} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="tipo" label="Tipo">
              <Radio.Group options={RS_TIPOS.map((t) => ({ value: t.value, label: t.label }))} />
            </Form.Item>
            <Row gutter={12}>
              <Col xs={24} md={12}>
                <Form.Item name="reportado_por" label="Reportado por">
                  <Input maxLength={150} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="cargo" label="Cargo">
                  <Input maxLength={100} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="danos_potenciales" label="Daños potenciales">
              <Checkbox.Group options={RS_DANOS_POTENCIALES.map((d) => ({ value: d.value, label: d.label }))} />
            </Form.Item>
            <Form.Item name="descripcion" label="Descripción" rules={[{ required: true, message: "Requerida" }]}>
              <TextArea rows={3} maxLength={3000} showCount />
            </Form.Item>
            <Form.Item label="Fotos de evidencia">
              <SsomaFotosGaleria
                fotos={editTarget.fotos}
                resource="reporte-seguridad-foto"
                editable
                onDelete={borrarFotoEdit}
              />
              <div style={{ marginTop: 8 }}>
                <Upload
                  accept="image/*"
                  showUploadList={false}
                  disabled={subiendoFotoEdit}
                  beforeUpload={(file) => { void subirFotoEdit(file); return false; }}
                >
                  <Button icon={<CameraOutlined />} loading={subiendoFotoEdit}>Agregar foto</Button>
                </Upload>
              </div>
            </Form.Item>

            <Divider titlePlacement="start" plain>Parte B — Plan de acción y seguimiento (supervisor)</Divider>
            <Form.List name="acciones">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name, ...rest }) => (
                    <Row key={key} gutter={8} align="middle">
                      <Col xs={24} md={12}>
                        <Form.Item
                          {...rest}
                          name={[name, "descripcion"]}
                          rules={[{ required: true, message: "Describí la acción" }]}
                        >
                          <Input placeholder={`Acción inmediata ${name + 1} (preventiva / correctiva / de mejora)`} maxLength={500} />
                        </Form.Item>
                      </Col>
                      <Col xs={12} md={6}>
                        <Form.Item {...rest} name={[name, "responsable"]}>
                          <Input placeholder="Responsable" maxLength={150} />
                        </Form.Item>
                      </Col>
                      <Col xs={10} md={5}>
                        <Form.Item {...rest} name={[name, "fecha_cumplimiento"]}>
                          <DatePicker format="DD/MM/YYYY" placeholder="F. cumplimiento" style={{ width: "100%" }} />
                        </Form.Item>
                      </Col>
                      <Col xs={2} md={1}>
                        <Form.Item>
                          <Button type="text" danger icon={<MinusCircleOutlined />} onClick={() => remove(name)} />
                        </Form.Item>
                      </Col>
                    </Row>
                  ))}
                  <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add()}>
                    Agregar acción inmediata
                  </Button>
                </>
              )}
            </Form.List>
            <Form.Item name="supervisor_ssoma" label="Superv. SSOMA / Encargado (apellidos y nombres)" style={{ marginTop: 16 }}>
              <Input maxLength={150} />
            </Form.Item>
          </Form>
        )}
      </Modal>

      {/* ── Modal Aprobar ───────────────────────────── */}
      <Modal
        open={aprobarOpen}
        title={
          <>
            Revisar y aprobar —{" "}
            <Text strong>{aprobarTarget ? formatReporteSeguridadCodigo(aprobarTarget.numero, aprobarTarget.anio) : ""}</Text>
          </>
        }
        onCancel={() => { setAprobarOpen(false); setAprobarTarget(null); }}
        onOk={handleAprobar}
        okText="Aprobar reporte"
        width={modalWidth(screens.screens, 560)}
        destroyOnHidden
      >
        {aprobarTarget && (
          <>
            <Card size="small" style={{ marginBottom: 12 }}>
              <Text type="secondary">Descripción:</Text>{" "}
              <Text>{aprobarTarget.descripcion}</Text>
            </Card>
            <Form form={formAprobar} layout="vertical">
              <Form.Item name="comentario" label="Comentario de revisión (opcional)">
                <TextArea rows={3} maxLength={1000} showCount />
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>

      {/* ── Modal Cerrar (foto + comentario obligatorios) ── */}
      <Modal
        open={cerrarOpen}
        title={
          <>
            Cerrar reporte —{" "}
            <Text strong>{cerrarTarget ? formatReporteSeguridadCodigo(cerrarTarget.numero, cerrarTarget.anio) : ""}</Text>
          </>
        }
        onCancel={() => { setCerrarOpen(false); setCerrarTarget(null); setFotoCierre([]); }}
        onOk={handleCerrar}
        okText="Cerrar reporte"
        width={modalWidth(screens.screens, 560)}
        destroyOnHidden
      >
        <Form form={formCerrar} layout="vertical">
          <Form.Item
            name="comentario"
            label="Comentario de cierre"
            rules={[{ required: true, message: "El comentario de cierre es obligatorio" }]}
          >
            <TextArea rows={4} maxLength={2000} showCount placeholder="¿Cómo se levantó la condición / acto inseguro?" />
          </Form.Item>
          <Form.Item label="Foto de evidencia del cierre" required>
            <SsomaFotosUpload
              uploadUrlEndpoint={UPLOAD_URL}
              value={fotoCierre}
              onChange={setFotoCierre}
              max={1}
              label="Subir foto de cierre"
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Drawer Ver detalle ──────────────────────── */}
      <Drawer
        open={verOpen}
        onClose={() => { setVerOpen(false); setVerTarget(null); }}
        title={verTarget ? formatReporteSeguridadCodigo(verTarget.numero, verTarget.anio) : ""}
        size={screens.isMobile ? "default" : "large"}
      >
        {verTarget && (
          <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
            <div>
              <Text type="secondary">Estado:</Text>{" "}
              <Tag color={RS_ESTADOS[verTarget.estado]?.color}>{RS_ESTADOS[verTarget.estado]?.label ?? verTarget.estado}</Tag>
              {verTarget.tipo && (
                <Tag color={verTarget.tipo === "ACTO_INSEGURO" ? "volcano" : "gold"}>
                  {labelDe(RS_TIPOS, verTarget.tipo)}
                </Tag>
              )}
            </div>
            <div>
              <Text type="secondary">Lugar:</Text> {verTarget.lugar || "—"}
              {" · "}
              <Text type="secondary">Fecha:</Text> {formatDateOnly(verTarget.fecha)}
              {verTarget.hora ? ` · ${verTarget.hora}` : ""}
            </div>
            <div>
              <Text type="secondary">Reportado por:</Text> {verTarget.reportado_por || "—"}
              {verTarget.cargo ? ` (${verTarget.cargo})` : ""}
            </div>
            <div>
              <Text type="secondary">Daños potenciales:</Text>{" "}
              {verTarget.danos_potenciales?.length
                ? verTarget.danos_potenciales.map((d) => <Tag key={d}>{labelDe(RS_DANOS_POTENCIALES, d)}</Tag>)
                : "—"}
            </div>
            <Card size="small" title="Descripción">
              <Text style={{ whiteSpace: "pre-wrap" }}>{verTarget.descripcion || "—"}</Text>
            </Card>
            <Card size="small" title="Fotos de evidencia">
              <SsomaFotosGaleria fotos={verTarget.fotos} resource="reporte-seguridad-foto" />
            </Card>
            <Card size="small" title="Parte B — Plan de acción">
              {verTarget.acciones.length === 0 ? (
                <Text type="secondary">Sin acciones registradas.</Text>
              ) : (
                <Table
                  size="small"
                  rowKey="id"
                  pagination={false}
                  dataSource={verTarget.acciones}
                  scroll={{ x: 500 }}
                  columns={[
                    { title: "#", dataIndex: "orden", width: 40 },
                    { title: "Acción inmediata", dataIndex: "descripcion" },
                    { title: "Responsable", dataIndex: "responsable", width: 150, render: (v: string | null) => v || "—" },
                    {
                      title: "F. cumplimiento", dataIndex: "fecha_cumplimiento", width: 120,
                      render: (v: string | null) => (v ? formatDateOnly(v) : "—"),
                    },
                  ]}
                />
              )}
              <div style={{ marginTop: 8 }}>
                <Text type="secondary">Superv. SSOMA:</Text> {verTarget.supervisor_ssoma || "—"}
              </div>
            </Card>
            {verTarget.aprobado_por && (
              <div>
                <Text type="secondary">Aprobado por:</Text> {verTarget.aprobado_por}
                {verTarget.fecha_aprobacion ? ` — ${new Date(verTarget.fecha_aprobacion).toLocaleString("es-PE")}` : ""}
                {verTarget.comentario_aprobacion && (
                  <div><Text type="secondary">Comentario:</Text> {verTarget.comentario_aprobacion}</div>
                )}
              </div>
            )}
            {verTarget.estado === "CERRADO" && (
              <Card size="small" title="Cierre">
                <div>
                  <Text type="secondary">Cerrado por:</Text> {verTarget.cerrado_por || "—"}
                  {verTarget.fecha_cierre ? ` — ${new Date(verTarget.fecha_cierre).toLocaleString("es-PE")}` : ""}
                </div>
                <div style={{ marginTop: 6 }}>
                  <Text type="secondary">Comentario:</Text>{" "}
                  <Text style={{ whiteSpace: "pre-wrap" }}>{verTarget.comentario_cierre || "—"}</Text>
                </div>
                {verTarget.cierre_foto_key && (
                  <div style={{ marginTop: 8 }}>
                    <R2Image
                      resource="reporte-seguridad-cierre"
                      resourceId={verTarget.id}
                      r2Key={verTarget.cierre_foto_key}
                      alt={verTarget.cierre_foto_nombre ?? "Foto de cierre"}
                      style={{ maxWidth: "100%", maxHeight: 260, borderRadius: 6 }}
                    />
                  </div>
                )}
              </Card>
            )}
          </Space>
        )}
      </Drawer>
    </div>
  );
}
