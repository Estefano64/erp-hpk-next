"use client";

// Solicitudes de Acciones Correctivas — SAC (formato SIG-G-F-10).
// Las gestiona el encargado de seguridad (rol "ssoma"). Pueden nacer desde
// una Salida No Conforme (botón "SAC" en ese listado) o crearse standalone.
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Typography, Table, Button, Input, Select, Space, Tag, Modal, Form,
  Row, Col, Card, App, Popconfirm, Tooltip, Drawer, DatePicker, Checkbox,
  Radio, Divider,
} from "antd";
import {
  FileProtectOutlined, PlusOutlined, ReloadOutlined, SearchOutlined,
  EditOutlined, EyeOutlined, DeleteOutlined, LockOutlined,
  MinusCircleOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useRouter } from "next/navigation";
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
  SAC_ESTADOS, SAC_TIPOS_DESVIACION, SAC_FUENTES, SAC_SISTEMAS, labelDe,
  formatSacCodigo, formatSalidaNoConformeCodigo,
} from "@/lib/ssoma";

const { Title, Text } = Typography;
const { TextArea } = Input;

interface AccionRow {
  id: number;
  orden: number;
  descripcion: string;
  responsable: string | null;
  fecha: string | null;
}

interface SncResumen {
  id: number;
  numero: number | null;
  anio: number | null;
}

interface SacRow {
  id: number;
  numero: number | null;
  anio: number | null;
  salida_no_conforme_id: number | null;
  tipo_desviacion: string | null;
  fuente: string | null;
  fuente_otros: string | null;
  sistemas: string[];
  descripcion: string | null;
  norma_requisito: string | null;
  documento_referencia: string | null;
  proceso_responsable: string | null;
  identificado_por: string | null;
  fecha_identificacion: string | null;
  correccion_inmediata: string | null;
  analisis_causa_raiz: string | null;
  responsable_cierre: string | null;
  fecha_cierre_programada: string | null;
  verificacion_eficacia: string | null;
  verificado_por: string | null;
  fecha_verificacion: string | null;
  genera_riesgo: boolean | null;
  riesgo_identificado: string | null;
  proceso_afectado: string | null;
  accion_riesgo: string | null;
  estado: string;
  cerrado_por: string | null;
  fecha_cierre: string | null;
  activo: boolean;
  created_at: string;
  acciones: AccionRow[];
  salida_no_conforme: SncResumen | null;
}

function dayjsDesdeFechaOnly(v: string | null): dayjs.Dayjs | null {
  return v ? dayjs(formatDateOnly(v), "DD/MM/YYYY") : null;
}

export default function SacsPage() {
  const { message } = App.useApp();
  const screens = useResponsive();
  const router = useRouter();

  const [rows, setRows] = useState<SacRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGINATION_PAGE_SIZE);

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

  const [search, setSearch] = usePersistedState<string>("sac-search", "");
  const [estadoFiltro, setEstadoFiltro] = usePersistedState<string>("sac-estado", "");
  const [, setColumnFilters] = usePersistedState<Record<string, (string | number | boolean | null)[] | null>>(
    "sac-col-filters",
    {},
  );

  // ?search=SAC-0001-26 al llegar desde el listado de salidas no conformes.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("search");
    if (q) setSearch(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drawer de crear/editar (formulario largo → drawer, no modal)
  const [formOpen, setFormOpen] = useState(false);
  const [formTarget, setFormTarget] = useState<SacRow | null>(null); // null = crear
  const [form] = Form.useForm();

  const [cerrarOpen, setCerrarOpen] = useState(false);
  const [cerrarTarget, setCerrarTarget] = useState<SacRow | null>(null);
  const [formCerrar] = Form.useForm();

  const [verOpen, setVerOpen] = useState(false);
  const [verTarget, setVerTarget] = useState<SacRow | null>(null);

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
      const res = await fetch(`/api/ssoma/sacs?${qs}`, { signal: controller.signal });
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

  // ── Crear / Editar ───────────────────────────────────────
  function openCrear() {
    setFormTarget(null);
    form.resetFields();
    form.setFieldsValue({ fecha_identificacion: dayjs(), sistemas: [], acciones: [] });
    setFormOpen(true);
  }

  function openEditar(row: SacRow) {
    setFormTarget(row);
    form.setFieldsValue({
      tipo_desviacion: row.tipo_desviacion ?? undefined,
      fuente: row.fuente ?? undefined,
      fuente_otros: row.fuente_otros ?? "",
      sistemas: row.sistemas ?? [],
      descripcion: row.descripcion ?? "",
      norma_requisito: row.norma_requisito ?? "",
      documento_referencia: row.documento_referencia ?? "",
      proceso_responsable: row.proceso_responsable ?? "",
      identificado_por: row.identificado_por ?? "",
      fecha_identificacion: dayjsDesdeFechaOnly(row.fecha_identificacion),
      correccion_inmediata: row.correccion_inmediata ?? "",
      analisis_causa_raiz: row.analisis_causa_raiz ?? "",
      responsable_cierre: row.responsable_cierre ?? "",
      fecha_cierre_programada: dayjsDesdeFechaOnly(row.fecha_cierre_programada),
      genera_riesgo: row.genera_riesgo,
      riesgo_identificado: row.riesgo_identificado ?? "",
      proceso_afectado: row.proceso_afectado ?? "",
      accion_riesgo: row.accion_riesgo ?? "",
      acciones: (row.acciones ?? []).map((a) => ({
        descripcion: a.descripcion,
        responsable: a.responsable ?? "",
        fecha: dayjsDesdeFechaOnly(a.fecha),
      })),
    });
    setFormOpen(true);
  }

  async function handleGuardar() {
    try {
      const values = await form.validateFields();
      const payload = {
        tipo_desviacion: values.tipo_desviacion || null,
        fuente: values.fuente || null,
        fuente_otros: values.fuente_otros || null,
        sistemas: values.sistemas || [],
        descripcion: values.descripcion,
        norma_requisito: values.norma_requisito || null,
        documento_referencia: values.documento_referencia || null,
        proceso_responsable: values.proceso_responsable || null,
        identificado_por: values.identificado_por || null,
        fecha_identificacion: values.fecha_identificacion ? values.fecha_identificacion.format("YYYY-MM-DD") : null,
        correccion_inmediata: values.correccion_inmediata || null,
        analisis_causa_raiz: values.analisis_causa_raiz || null,
        responsable_cierre: values.responsable_cierre || null,
        fecha_cierre_programada: values.fecha_cierre_programada ? values.fecha_cierre_programada.format("YYYY-MM-DD") : null,
        genera_riesgo: values.genera_riesgo ?? null,
        riesgo_identificado: values.riesgo_identificado || null,
        proceso_afectado: values.proceso_afectado || null,
        accion_riesgo: values.accion_riesgo || null,
        acciones: (values.acciones || []).map(
          (a: { descripcion?: string; responsable?: string; fecha?: dayjs.Dayjs | null }) => ({
            descripcion: a.descripcion || "",
            responsable: a.responsable || null,
            fecha: a.fecha ? a.fecha.format("YYYY-MM-DD") : null,
          }),
        ),
      };
      const url = formTarget ? `/api/ssoma/sacs/${formTarget.id}` : "/api/ssoma/sacs";
      const res = await fetch(url, {
        method: formTarget ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      message.success(
        formTarget
          ? "SAC actualizada."
          : `SAC ${formatSacCodigo(json.data.numero, json.data.anio)} creada.`,
      );
      setFormOpen(false);
      setFormTarget(null);
      form.resetFields();
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
      const res = await fetch(`/api/ssoma/sacs/${cerrarTarget.id}/cerrar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verificacion_eficacia: values.verificacion_eficacia || null,
          verificado_por: values.verificado_por || null,
          fecha_verificacion: values.fecha_verificacion ? values.fecha_verificacion.format("YYYY-MM-DD") : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      message.success("SAC cerrada.");
      setCerrarOpen(false);
      setCerrarTarget(null);
      formCerrar.resetFields();
      fetchData();
    } catch (e) {
      const err = e as { errorFields?: unknown; message?: string };
      if (err.errorFields) return;
      message.error(err.message || "Error");
    }
  }

  async function handleAnular(id: number) {
    try {
      const res = await fetch(`/api/ssoma/sacs/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Error");
      }
      message.success("SAC anulada.");
      fetchData();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  // ── Tabla ────────────────────────────────────────────────
  const allColumns: ColumnsType<SacRow> = useMemo(
    () => [
      numeracionColumn<SacRow>(),
      {
        key: "codigo",
        title: "SAC N°",
        dataIndex: "numero",
        width: 120,
        fixed: "left",
        render: (_: unknown, r) => <Text strong>{formatSacCodigo(r.numero, r.anio)}</Text>,
      },
      {
        key: "estado",
        title: "Estado",
        dataIndex: "estado",
        width: 105,
        ...filtroPorColumna<SacRow>(rows, "estado"),
        render: (e: string) => {
          const m = SAC_ESTADOS[e];
          return <Tag color={m?.color}>{m?.label ?? e}</Tag>;
        },
      },
      {
        key: "tipo_desviacion",
        title: "Tipo de desviación",
        dataIndex: "tipo_desviacion",
        width: 180,
        ...filtroPorColumna<SacRow>(rows, "tipo_desviacion"),
        render: (v: string | null) => (v ? labelDe(SAC_TIPOS_DESVIACION, v) : "—"),
      },
      {
        key: "fuente",
        title: "Fuente",
        dataIndex: "fuente",
        width: 170,
        ...filtroPorColumna<SacRow>(rows, "fuente"),
        render: (v: string | null, r) =>
          v ? (v === "OTROS" && r.fuente_otros ? `Otros: ${r.fuente_otros}` : labelDe(SAC_FUENTES, v)) : "—",
      },
      {
        key: "sistemas",
        title: "Sistema involucrado",
        dataIndex: "sistemas",
        width: 200,
        render: (v: string[]) =>
          v?.length ? (
            <Space size={4} wrap>
              {v.map((s) => <Tag key={s}>{labelDe(SAC_SISTEMAS, s)}</Tag>)}
            </Space>
          ) : "—",
      },
      {
        key: "descripcion",
        title: "Descripción",
        dataIndex: "descripcion",
        width: 300,
        render: (v: string | null) =>
          v ? (
            <Tooltip title={v} styles={{ root: { maxWidth: 420 } }}>
              <Text style={{ display: "block", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {v}
              </Text>
            </Tooltip>
          ) : "—",
      },
      {
        key: "snc",
        title: "Salida No Conforme",
        width: 150,
        render: (_: unknown, r) =>
          r.salida_no_conforme ? (
            <a
              onClick={(e) => {
                e.preventDefault();
                router.push(
                  `/ssoma/salidas-no-conformes?search=${formatSalidaNoConformeCodigo(r.salida_no_conforme!.numero, r.salida_no_conforme!.anio)}`,
                );
              }}
            >
              {formatSalidaNoConformeCodigo(r.salida_no_conforme.numero, r.salida_no_conforme.anio)}
            </a>
          ) : (
            <Text type="secondary">Standalone</Text>
          ),
      },
      {
        key: "proceso_responsable",
        title: "Proceso / Responsable",
        dataIndex: "proceso_responsable",
        width: 180,
        render: (v: string | null) => v || "—",
      },
      {
        key: "identificado_por",
        title: "Identificado por",
        dataIndex: "identificado_por",
        width: 160,
        render: (v: string | null) => v || "—",
      },
      {
        key: "fecha_identificacion",
        title: "F. identificación",
        dataIndex: "fecha_identificacion",
        width: 125,
        render: (v: string | null) => (v ? formatDateOnly(v) : "—"),
      },
      {
        key: "acciones_count",
        title: "Acciones",
        width: 100,
        render: (_: unknown, r) =>
          r.acciones.length > 0 ? `${r.acciones.length} acción(es)` : <Text type="secondary">—</Text>,
      },
      {
        key: "fecha_cierre_programada",
        title: "Cierre programado",
        dataIndex: "fecha_cierre_programada",
        width: 130,
        render: (v: string | null) => (v ? formatDateOnly(v) : "—"),
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
        width: 190,
        fixed: "right",
        render: (_: unknown, r) => (
          <Space size={4} wrap>
            <Tooltip title="Ver detalle">
              <Button size="small" icon={<EyeOutlined />} onClick={() => { setVerTarget(r); setVerOpen(true); }} />
            </Tooltip>
            {esSsoma && r.estado === "ABIERTA" && (
              <>
                <Tooltip title="Editar">
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEditar(r)} />
                </Tooltip>
                <Tooltip title="Cerrar SAC">
                  <Button size="small" type="primary" icon={<LockOutlined />} onClick={() => { setCerrarTarget(r); setCerrarOpen(true); }}>
                    Cerrar
                  </Button>
                </Tooltip>
              </>
            )}
            {esSsoma && (
              <Popconfirm
                title="¿Anular esta SAC?"
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
    [rows, esSsoma, router],
  );

  const { filtradas, captureFilteredRows } = useTablaFiltrada(rows);
  const { ocultas, setOcultas } = useColumnasOcultas("sac-cols-ocultas", []);
  const { columnas, components, TableDragWrapper } = useColumnasRedimensionables(
    allColumns,
    "sac-tabla",
    { data: rows },
  );
  const visibles = visibleColumns(columnas, ocultas);

  // ── Render ───────────────────────────────────────────────
  return (
    <div style={{ padding: 16 }}>
      <Title level={3} style={{ marginTop: 0 }}>
        <FileProtectOutlined /> Solicitudes de Acciones Correctivas (SAC)
      </Title>
      <Text type="secondary">
        Formato SIG-G-F-10. Las gestiona el encargado de seguridad: pueden nacer de una Salida No Conforme o crearse
        directamente (auditorías, inspecciones, quejas, etc.).
      </Text>

      <Card size="small" style={{ marginTop: 16, marginBottom: 8 }}>
        <Row gutter={[8, 8]} align="middle">
          <Col xs={24} md={8}>
            <Input
              allowClear
              placeholder="Buscar (SAC-XXXX-YY, descripción, proceso, norma)"
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
              options={Object.entries(SAC_ESTADOS).map(([value, m]) => ({ value, label: m.label }))}
            />
          </Col>
          <Col xs={24} md={11}>
            <Space wrap>
              {esSsoma && (
                <Button type="primary" icon={<PlusOutlined />} onClick={openCrear}>
                  Nueva SAC
                </Button>
              )}
              <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
                Refrescar
              </Button>
              <ColumnasToggleButton columns={allColumns} ocultas={ocultas} setOcultas={setOcultas} />
              <ExportarExcelButton<SacRow>
                endpoint="/api/ssoma/sacs"
                filename="SACs"
                currentRows={filtradas}
                tablaLayout={{ ocultas }}
                columns={[
                  { key: "codigo", label: "SAC N°", value: (r) => formatSacCodigo(r.numero, r.anio) },
                  { key: "estado", label: "Estado", value: (r) => SAC_ESTADOS[r.estado]?.label ?? r.estado },
                  { key: "tipo_desviacion", label: "Tipo de desviación", value: (r) => labelDe(SAC_TIPOS_DESVIACION, r.tipo_desviacion, "") },
                  {
                    key: "fuente", label: "Fuente",
                    value: (r) => (r.fuente === "OTROS" && r.fuente_otros ? `Otros: ${r.fuente_otros}` : labelDe(SAC_FUENTES, r.fuente, "")),
                  },
                  { key: "sistemas", label: "Sistema involucrado", value: (r) => (r.sistemas ?? []).map((s) => labelDe(SAC_SISTEMAS, s)).join(", ") },
                  { key: "descripcion", label: "Descripción", value: (r) => r.descripcion ?? "" },
                  {
                    key: "snc", label: "Salida No Conforme",
                    value: (r) => (r.salida_no_conforme ? formatSalidaNoConformeCodigo(r.salida_no_conforme.numero, r.salida_no_conforme.anio) : ""),
                  },
                  { key: "norma", label: "Norma / Requisito", value: (r) => r.norma_requisito ?? "" },
                  { key: "documento", label: "Doc. referencia", value: (r) => r.documento_referencia ?? "" },
                  { key: "proceso", label: "Proceso / Responsable", value: (r) => r.proceso_responsable ?? "" },
                  { key: "identificado_por", label: "Identificado por", value: (r) => r.identificado_por ?? "" },
                  { key: "fecha_identificacion", label: "F. identificación", value: (r) => dateOnlyLocal(r.fecha_identificacion) },
                  { key: "correccion", label: "Corrección inmediata", value: (r) => r.correccion_inmediata ?? "" },
                  { key: "causa_raiz", label: "Análisis causa raíz", value: (r) => r.analisis_causa_raiz ?? "" },
                  {
                    key: "acciones", label: "Acciones a tomar",
                    value: (r) => r.acciones.map((a) => `${a.orden}) ${a.descripcion}`).join(" | "),
                  },
                  { key: "responsable_cierre", label: "Responsable", value: (r) => r.responsable_cierre ?? "" },
                  { key: "fecha_cierre_prog", label: "Cierre programado", value: (r) => dateOnlyLocal(r.fecha_cierre_programada) },
                  { key: "verificacion", label: "Verificación de eficacia", value: (r) => r.verificacion_eficacia ?? "" },
                  { key: "verificado_por", label: "Verificado por", value: (r) => r.verificado_por ?? "" },
                  { key: "fecha_verificacion", label: "F. verificación", value: (r) => dateOnlyLocal(r.fecha_verificacion) },
                  { key: "genera_riesgo", label: "¿Genera riesgo?", value: (r) => (r.genera_riesgo == null ? "" : r.genera_riesgo ? "Sí" : "No") },
                  { key: "fecha_cierre", label: "Fecha cierre", value: (r) => dateOnlyLocal(r.fecha_cierre) },
                ]}
              />
            </Space>
          </Col>
        </Row>
      </Card>

      <TableDragWrapper>
        <Table<SacRow>
          rowKey="id"
          size="small"
          loading={loading}
          columns={visibles}
          components={components}
          dataSource={rows}
          scroll={{ x: 2200 }}
          pagination={paginacionEstandar({
            current: page,
            pageSize,
            total: rows.length,
            onChange: (p, s) => { setPage(p); setPageSize(s); },
            label: "SACs",
          })}
          onChange={(_p, filters, _s, extra) => {
            captureFilteredRows(extra);
            setColumnFilters(filters as Record<string, (string | number | boolean | null)[] | null>);
          }}
        />
      </TableDragWrapper>

      {/* ── Drawer Crear / Editar ───────────────────── */}
      <Drawer
        open={formOpen}
        onClose={() => { setFormOpen(false); setFormTarget(null); }}
        title={
          formTarget
            ? `Editar SAC — ${formatSacCodigo(formTarget.numero, formTarget.anio)}`
            : "Nueva SAC (SIG-G-F-10)"
        }
        placement={screens.isMobile ? "bottom" : "right"}
        size={screens.isMobile ? "default" : "large"}
        extra={
          <Space>
            <Button onClick={() => { setFormOpen(false); setFormTarget(null); }}>Cancelar</Button>
            <Button type="primary" onClick={handleGuardar}>
              {formTarget ? "Guardar cambios" : "Crear SAC"}
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          {formTarget?.salida_no_conforme && (
            <Card size="small" style={{ marginBottom: 12 }}>
              <Text type="secondary">Vinculada a:</Text>{" "}
              <Text strong>
                {formatSalidaNoConformeCodigo(formTarget.salida_no_conforme.numero, formTarget.salida_no_conforme.anio)}
              </Text>
            </Card>
          )}
          <Form.Item name="tipo_desviacion" label="Tipo de desviación">
            <Select
              allowClear
              placeholder="Elegí el tipo"
              options={SAC_TIPOS_DESVIACION.map((t) => ({ value: t.value, label: t.label }))}
            />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} md={14}>
              <Form.Item name="fuente" label="Fuente de la desviación">
                <Select
                  allowClear
                  placeholder="¿De dónde surge?"
                  options={SAC_FUENTES.map((f) => ({ value: f.value, label: f.label }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={10}>
              <Form.Item
                noStyle
                shouldUpdate={(prev, cur) => prev.fuente !== cur.fuente}
              >
                {({ getFieldValue }) =>
                  getFieldValue("fuente") === "OTROS" ? (
                    <Form.Item name="fuente_otros" label="Otros (especificar)">
                      <Input maxLength={200} />
                    </Form.Item>
                  ) : null
                }
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="sistemas" label="Sistema involucrado">
            <Checkbox.Group options={SAC_SISTEMAS.map((s) => ({ value: s.value, label: s.label }))} />
          </Form.Item>

          <Divider titlePlacement="start" plain>Descripción</Divider>
          <Form.Item name="descripcion" label="Descripción" rules={[{ required: true, message: "Describí la desviación" }]}>
            <TextArea rows={4} maxLength={3000} showCount />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item name="norma_requisito" label="Norma / Requisito">
                <Input maxLength={300} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="documento_referencia" label="Documento de referencia / Revisión">
                <Input maxLength={300} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} md={10}>
              <Form.Item name="proceso_responsable" label="Proceso / Responsable">
                <Input maxLength={200} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="identificado_por" label="Identificado por">
                <Input maxLength={150} />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="fecha_identificacion" label="Fecha">
                <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>

          <Divider titlePlacement="start" plain>Corrección inmediata (solo cuando aplique)</Divider>
          <Form.Item
            name="correccion_inmediata"
            tooltip="Si la corrección inmediata no requiere análisis causa raíz, se procede al cierre de la desviación."
          >
            <TextArea rows={3} maxLength={3000} showCount />
          </Form.Item>

          <Divider titlePlacement="start" plain>Análisis causa raíz</Divider>
          <Form.Item name="analisis_causa_raiz">
            <TextArea rows={4} maxLength={5000} showCount />
          </Form.Item>

          <Divider titlePlacement="start" plain>Acciones a tomar</Divider>
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
                        <Input placeholder={`Acción / actividad ${name + 1}`} maxLength={500} />
                      </Form.Item>
                    </Col>
                    <Col xs={12} md={6}>
                      <Form.Item {...rest} name={[name, "responsable"]}>
                        <Input placeholder="Responsable" maxLength={150} />
                      </Form.Item>
                    </Col>
                    <Col xs={10} md={5}>
                      <Form.Item {...rest} name={[name, "fecha"]}>
                        <DatePicker format="DD/MM/YYYY" placeholder="Fecha" style={{ width: "100%" }} />
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
                  Agregar acción
                </Button>
              </>
            )}
          </Form.List>
          <Row gutter={12} style={{ marginTop: 16 }}>
            <Col xs={24} md={14}>
              <Form.Item name="responsable_cierre" label="Responsable">
                <Input maxLength={150} />
              </Form.Item>
            </Col>
            <Col xs={24} md={10}>
              <Form.Item name="fecha_cierre_programada" label="Fecha de cierre programada">
                <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>

          <Divider titlePlacement="start" plain>Riesgos (implementación de las acciones)</Divider>
          <Form.Item name="genera_riesgo" label="¿La no conformidad genera un nuevo riesgo?">
            <Radio.Group
              options={[
                { value: true, label: "Sí" },
                { value: false, label: "No" },
              ]}
            />
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.genera_riesgo !== cur.genera_riesgo}
          >
            {({ getFieldValue }) =>
              getFieldValue("genera_riesgo") === true ? (
                <>
                  <Form.Item name="riesgo_identificado" label="Riesgo identificado">
                    <TextArea rows={2} maxLength={2000} showCount />
                  </Form.Item>
                  <Row gutter={12}>
                    <Col xs={24} md={12}>
                      <Form.Item name="proceso_afectado" label="Proceso afectado">
                        <Input maxLength={200} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item name="accion_riesgo" label="Acción sobre el riesgo">
                        <Input maxLength={500} />
                      </Form.Item>
                    </Col>
                  </Row>
                </>
              ) : null
            }
          </Form.Item>
        </Form>
      </Drawer>

      {/* ── Modal Cerrar (verificación de eficacia) ─── */}
      <Modal
        open={cerrarOpen}
        title={
          <>
            Cerrar SAC —{" "}
            <Text strong>{cerrarTarget ? formatSacCodigo(cerrarTarget.numero, cerrarTarget.anio) : ""}</Text>
          </>
        }
        onCancel={() => { setCerrarOpen(false); setCerrarTarget(null); }}
        onOk={handleCerrar}
        okText="Cerrar SAC"
        width={modalWidth(screens.screens, 560)}
        destroyOnHidden
      >
        <Form form={formCerrar} layout="vertical" initialValues={{ fecha_verificacion: dayjs() }}>
          <Form.Item name="verificacion_eficacia" label="Verificación de la eficacia">
            <TextArea rows={4} maxLength={3000} showCount placeholder="¿Las acciones tomadas fueron eficaces?" />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} md={14}>
              <Form.Item name="verificado_por" label="Responsable de la verificación" tooltip="Si lo dejás vacío, se usa tu usuario.">
                <Input maxLength={150} />
              </Form.Item>
            </Col>
            <Col xs={24} md={10}>
              <Form.Item name="fecha_verificacion" label="Fecha de verificación">
                <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* ── Drawer Ver detalle ──────────────────────── */}
      <Drawer
        open={verOpen}
        onClose={() => { setVerOpen(false); setVerTarget(null); }}
        title={verTarget ? formatSacCodigo(verTarget.numero, verTarget.anio) : ""}
        size={screens.isMobile ? "default" : "large"}
      >
        {verTarget && (
          <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
            <div>
              <Text type="secondary">Estado:</Text>{" "}
              <Tag color={SAC_ESTADOS[verTarget.estado]?.color}>{SAC_ESTADOS[verTarget.estado]?.label ?? verTarget.estado}</Tag>
              {verTarget.tipo_desviacion && <Tag color="volcano">{labelDe(SAC_TIPOS_DESVIACION, verTarget.tipo_desviacion)}</Tag>}
            </div>
            <div>
              <Text type="secondary">Fuente:</Text>{" "}
              {verTarget.fuente
                ? verTarget.fuente === "OTROS" && verTarget.fuente_otros
                  ? `Otros: ${verTarget.fuente_otros}`
                  : labelDe(SAC_FUENTES, verTarget.fuente)
                : "—"}
              {" · "}
              <Text type="secondary">Sistemas:</Text>{" "}
              {verTarget.sistemas?.length
                ? verTarget.sistemas.map((s) => <Tag key={s}>{labelDe(SAC_SISTEMAS, s)}</Tag>)
                : "—"}
            </div>
            <div>
              <Text type="secondary">Salida No Conforme:</Text>{" "}
              {verTarget.salida_no_conforme ? (
                <a
                  onClick={(e) => {
                    e.preventDefault();
                    router.push(
                      `/ssoma/salidas-no-conformes?search=${formatSalidaNoConformeCodigo(verTarget.salida_no_conforme!.numero, verTarget.salida_no_conforme!.anio)}`,
                    );
                  }}
                >
                  {formatSalidaNoConformeCodigo(verTarget.salida_no_conforme.numero, verTarget.salida_no_conforme.anio)}
                </a>
              ) : (
                "Standalone"
              )}
            </div>
            <Card size="small" title="Descripción">
              <Text style={{ whiteSpace: "pre-wrap" }}>{verTarget.descripcion || "—"}</Text>
              <div style={{ marginTop: 8 }}>
                <Text type="secondary">Norma / Requisito:</Text> {verTarget.norma_requisito || "—"}
              </div>
              <div>
                <Text type="secondary">Doc. referencia:</Text> {verTarget.documento_referencia || "—"}
              </div>
              <div>
                <Text type="secondary">Proceso / Responsable:</Text> {verTarget.proceso_responsable || "—"}
              </div>
              <div>
                <Text type="secondary">Identificado por:</Text> {verTarget.identificado_por || "—"}
                {verTarget.fecha_identificacion ? ` — ${formatDateOnly(verTarget.fecha_identificacion)}` : ""}
              </div>
            </Card>
            <Card size="small" title="Corrección inmediata">
              <Text style={{ whiteSpace: "pre-wrap" }}>{verTarget.correccion_inmediata || "—"}</Text>
            </Card>
            <Card size="small" title="Análisis causa raíz">
              <Text style={{ whiteSpace: "pre-wrap" }}>{verTarget.analisis_causa_raiz || "—"}</Text>
            </Card>
            <Card size="small" title="Acciones a tomar">
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
                    { title: "Acción / Actividad", dataIndex: "descripcion" },
                    { title: "Responsable", dataIndex: "responsable", width: 150, render: (v: string | null) => v || "—" },
                    { title: "Fecha", dataIndex: "fecha", width: 110, render: (v: string | null) => (v ? formatDateOnly(v) : "—") },
                  ]}
                />
              )}
              <div style={{ marginTop: 8 }}>
                <Text type="secondary">Responsable:</Text> {verTarget.responsable_cierre || "—"}
                {" · "}
                <Text type="secondary">Cierre programado:</Text>{" "}
                {verTarget.fecha_cierre_programada ? formatDateOnly(verTarget.fecha_cierre_programada) : "—"}
              </div>
            </Card>
            <Card size="small" title="Verificación de la eficacia">
              <Text style={{ whiteSpace: "pre-wrap" }}>{verTarget.verificacion_eficacia || "—"}</Text>
              <div style={{ marginTop: 6 }}>
                <Text type="secondary">Responsable:</Text> {verTarget.verificado_por || "—"}
                {" · "}
                <Text type="secondary">Fecha:</Text>{" "}
                {verTarget.fecha_verificacion ? formatDateOnly(verTarget.fecha_verificacion) : "—"}
              </div>
            </Card>
            <Card size="small" title="Riesgos">
              <div>
                <Text type="secondary">¿Genera nuevo riesgo?:</Text>{" "}
                {verTarget.genera_riesgo == null ? "—" : verTarget.genera_riesgo ? <Tag color="red">Sí</Tag> : <Tag>No</Tag>}
              </div>
              {verTarget.genera_riesgo && (
                <>
                  <div><Text type="secondary">Riesgo identificado:</Text> {verTarget.riesgo_identificado || "—"}</div>
                  <div><Text type="secondary">Proceso afectado:</Text> {verTarget.proceso_afectado || "—"}</div>
                  <div><Text type="secondary">Acción sobre el riesgo:</Text> {verTarget.accion_riesgo || "—"}</div>
                </>
              )}
            </Card>
            {verTarget.estado === "CERRADA" && (
              <div>
                <Text type="secondary">Cerrada por:</Text> {verTarget.cerrado_por || "—"}
                {verTarget.fecha_cierre ? ` — ${new Date(verTarget.fecha_cierre).toLocaleString("es-PE")}` : ""}
              </div>
            )}
          </Space>
        )}
      </Drawer>
    </div>
  );
}
