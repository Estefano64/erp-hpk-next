"use client";

// Reportes de Salida No Conforme (formato HPK-SIG-F-05).
// Cualquier personal crea; se edita mientras está abierta; se cierra con
// observaciones (foto + comentario opcionales). El encargado de seguridad
// puede generarle una SAC (SIG-G-F-10).
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Typography, Table, Button, Input, Select, Space, Tag, Modal, Form,
  Row, Col, Card, App, Popconfirm, Tooltip, Drawer, DatePicker, Checkbox,
  Upload,
} from "antd";
import {
  WarningOutlined, PlusOutlined, ReloadOutlined, SearchOutlined,
  EditOutlined, EyeOutlined, DeleteOutlined, LockOutlined,
  FileAddOutlined, CameraOutlined,
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
  SNC_ESTADOS, formatSalidaNoConformeCodigo, formatSacCodigo,
} from "@/lib/ssoma";
import { uploadToR2 } from "@/lib/r2-client";
import {
  SsomaFotosUpload, SsomaFotosGaleria, type FotoPendiente,
} from "@/components/modules/ssoma/SsomaFotos";
import { R2Image } from "@/components/R2Image";

const { Title, Text } = Typography;
const { TextArea } = Input;

const UPLOAD_URL = "/api/ssoma/salidas-no-conformes/upload-url";

interface FotoRow {
  id: number;
  r2_key: string;
  nombre_archivo: string;
}

interface SacResumen {
  id: number;
  numero: number | null;
  anio: number | null;
  estado: string;
  activo: boolean;
}

interface SncRow {
  id: number;
  numero: number | null;
  anio: number | null;
  fecha: string;
  area: string | null;
  descripcion: string | null;
  reportado_por: string | null;
  area_reportante: string | null;
  accion_tomada: string | null;
  generado_por: string | null;
  responsable_salida: string | null;
  requiere_sac: boolean;
  observaciones: string | null;
  estado: string;
  cerrado_por: string | null;
  fecha_cierre: string | null;
  comentario_cierre: string | null;
  cierre_foto_key: string | null;
  cierre_foto_nombre: string | null;
  activo: boolean;
  created_at: string;
  fotos: FotoRow[];
  sacs: SacResumen[];
}

function sacActiva(r: SncRow): SacResumen | undefined {
  return r.sacs.find((s) => s.activo);
}

export default function SalidasNoConformesPage() {
  const { message, modal } = App.useApp();
  const screens = useResponsive();
  const router = useRouter();

  const [rows, setRows] = useState<SncRow[]>([]);
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

  const [search, setSearch] = usePersistedState<string>("snc-search", "");
  const [estadoFiltro, setEstadoFiltro] = usePersistedState<string>("snc-estado", "");
  const [, setColumnFilters] = usePersistedState<Record<string, (string | number | boolean | null)[] | null>>(
    "snc-col-filters",
    {},
  );

  // ?search=SNC-0001-26 al llegar desde el listado de SACs.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("search");
    if (q) setSearch(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [crearOpen, setCrearOpen] = useState(false);
  const [formCrear] = Form.useForm();
  const [fotosNuevas, setFotosNuevas] = useState<FotoPendiente[]>([]);

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SncRow | null>(null);
  const [formEdit] = Form.useForm();
  const [subiendoFotoEdit, setSubiendoFotoEdit] = useState(false);

  const [cerrarOpen, setCerrarOpen] = useState(false);
  const [cerrarTarget, setCerrarTarget] = useState<SncRow | null>(null);
  const [formCerrar] = Form.useForm();
  const [fotoCierre, setFotoCierre] = useState<FotoPendiente[]>([]);

  const [verOpen, setVerOpen] = useState(false);
  const [verTarget, setVerTarget] = useState<SncRow | null>(null);

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
      const res = await fetch(`/api/ssoma/salidas-no-conformes?${qs}`, { signal: controller.signal });
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
      const res = await fetch("/api/ssoma/salidas-no-conformes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha: values.fecha ? values.fecha.format("YYYY-MM-DD") : null,
          area: values.area || null,
          descripcion: values.descripcion,
          reportado_por: values.reportado_por || null,
          area_reportante: values.area_reportante || null,
          accion_tomada: values.accion_tomada || null,
          responsable_salida: values.responsable_salida || null,
          requiere_sac: values.requiere_sac === true,
          observaciones: values.observaciones || null,
          fotos: fotosNuevas.map(({ key, nombre_archivo, tipo_mime, tamano }) => ({
            key, nombre_archivo, tipo_mime, tamano,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al crear");
      message.success(`Salida no conforme ${formatSalidaNoConformeCodigo(json.data.numero, json.data.anio)} creada.`);
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

  function openEdit(row: SncRow) {
    setEditTarget(row);
    formEdit.setFieldsValue({
      fecha: row.fecha ? dayjs(formatDateOnly(row.fecha), "DD/MM/YYYY") : null,
      area: row.area ?? "",
      descripcion: row.descripcion ?? "",
      reportado_por: row.reportado_por ?? "",
      area_reportante: row.area_reportante ?? "",
      accion_tomada: row.accion_tomada ?? "",
      responsable_salida: row.responsable_salida ?? "",
      requiere_sac: row.requiere_sac,
      observaciones: row.observaciones ?? "",
    });
    setEditOpen(true);
  }

  async function handleEdit() {
    if (!editTarget) return;
    try {
      const values = await formEdit.validateFields();
      const res = await fetch(`/api/ssoma/salidas-no-conformes/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha: values.fecha ? values.fecha.format("YYYY-MM-DD") : null,
          area: values.area || null,
          descripcion: values.descripcion,
          reportado_por: values.reportado_por || null,
          area_reportante: values.area_reportante || null,
          accion_tomada: values.accion_tomada || null,
          responsable_salida: values.responsable_salida || null,
          requiere_sac: values.requiere_sac === true,
          observaciones: values.observaciones || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      message.success("Salida no conforme actualizada.");
      setEditOpen(false);
      setEditTarget(null);
      fetchData();
    } catch (e) {
      const err = e as { errorFields?: unknown; message?: string };
      if (err.errorFields) return;
      message.error(err.message || "Error");
    }
  }

  async function subirFotoEdit(file: File) {
    if (!editTarget) return;
    setSubiendoFotoEdit(true);
    try {
      const meta = await uploadToR2({ file, uploadUrlEndpoint: UPLOAD_URL });
      const res = await fetch(`/api/ssoma/salidas-no-conformes/${editTarget.id}/fotos`, {
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
      const res = await fetch(`/api/ssoma/salidas-no-conformes/${editTarget.id}/fotos/${fotoId}`, { method: "DELETE" });
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

  function openCerrar(row: SncRow) {
    setCerrarTarget(row);
    formCerrar.setFieldsValue({ observaciones: row.observaciones ?? "", comentario: "" });
    setCerrarOpen(true);
  }

  async function handleCerrar() {
    if (!cerrarTarget) return;
    try {
      const values = await formCerrar.validateFields();
      const foto = fotoCierre[0];
      const res = await fetch(`/api/ssoma/salidas-no-conformes/${cerrarTarget.id}/cerrar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          observaciones: values.observaciones || null,
          comentario: values.comentario || null,
          ...(foto
            ? {
                foto: {
                  key: foto.key,
                  nombre_archivo: foto.nombre_archivo,
                  tipo_mime: foto.tipo_mime,
                  tamano: foto.tamano,
                },
              }
            : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      message.success("Salida no conforme cerrada.");
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

  function confirmarGenerarSac(row: SncRow) {
    modal.confirm({
      title: `Generar SAC para ${formatSalidaNoConformeCodigo(row.numero, row.anio)}`,
      content: "Se creará una Solicitud de Acciones Correctivas (SIG-G-F-10) vinculada a esta salida no conforme, pre-cargada con su descripción.",
      okText: "Generar SAC",
      cancelText: "Cancelar",
      onOk: async () => {
        try {
          const res = await fetch(`/api/ssoma/salidas-no-conformes/${row.id}/generar-sac`, { method: "POST" });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "Error");
          message.success(`SAC ${formatSacCodigo(json.data.numero, json.data.anio)} generada.`);
          fetchData();
          router.push(`/ssoma/sacs?search=${formatSacCodigo(json.data.numero, json.data.anio)}`);
        } catch (e) {
          message.error((e as Error).message);
        }
      },
    });
  }

  async function handleAnular(id: number) {
    try {
      const res = await fetch(`/api/ssoma/salidas-no-conformes/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Error");
      }
      message.success("Registro anulado.");
      fetchData();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  // ── Tabla ────────────────────────────────────────────────
  const allColumns: ColumnsType<SncRow> = useMemo(
    () => [
      numeracionColumn<SncRow>(),
      {
        key: "codigo",
        title: "SNC N°",
        dataIndex: "numero",
        width: 120,
        fixed: "left",
        render: (_: unknown, r) => <Text strong>{formatSalidaNoConformeCodigo(r.numero, r.anio)}</Text>,
      },
      {
        key: "estado",
        title: "Estado",
        dataIndex: "estado",
        width: 110,
        ...filtroPorColumna<SncRow>(rows, "estado"),
        render: (e: string) => {
          const m = SNC_ESTADOS[e];
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
      {
        key: "area",
        title: "Área",
        dataIndex: "area",
        width: 140,
        ...filtroPorColumna<SncRow>(rows, "area"),
        render: (v: string | null) => v || "—",
      },
      {
        key: "descripcion",
        title: "Descripción de la salida no conforme",
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
        key: "reportado_por",
        title: "Reportado por",
        dataIndex: "reportado_por",
        width: 160,
        render: (v: string | null) => v || <Text type="secondary">—</Text>,
      },
      {
        key: "accion_tomada",
        title: "Acción tomada",
        dataIndex: "accion_tomada",
        width: 240,
        render: (v: string | null) =>
          v ? (
            <Tooltip title={v} styles={{ root: { maxWidth: 420 } }}>
              <Text style={{ display: "block", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {v}
              </Text>
            </Tooltip>
          ) : "—",
      },
      {
        key: "requiere_sac",
        title: "¿Requiere SAC?",
        dataIndex: "requiere_sac",
        width: 120,
        render: (v: boolean) => (v ? <Tag color="red">Sí</Tag> : <Tag>No</Tag>),
      },
      {
        key: "sac",
        title: "SAC",
        width: 130,
        render: (_: unknown, r) => {
          const sac = sacActiva(r);
          return sac ? (
            <a
              onClick={(e) => {
                e.preventDefault();
                router.push(`/ssoma/sacs?search=${formatSacCodigo(sac.numero, sac.anio)}`);
              }}
            >
              {formatSacCodigo(sac.numero, sac.anio)}
            </a>
          ) : (
            <Text type="secondary">—</Text>
          );
        },
      },
      {
        key: "fotos",
        title: "Fotos",
        width: 80,
        render: (_: unknown, r) => (r.fotos.length > 0 ? <Tag icon={<CameraOutlined />}>{r.fotos.length}</Tag> : "—"),
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
        width: 230,
        fixed: "right",
        render: (_: unknown, r) => (
          <Space size={4} wrap>
            <Tooltip title="Ver detalle">
              <Button size="small" icon={<EyeOutlined />} onClick={() => { setVerTarget(r); setVerOpen(true); }} />
            </Tooltip>
            {r.estado === "ABIERTO" && (
              <>
                <Tooltip title="Editar">
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
                </Tooltip>
                <Tooltip title="Cerrar con observaciones">
                  <Button size="small" type="primary" icon={<LockOutlined />} onClick={() => openCerrar(r)}>
                    Cerrar
                  </Button>
                </Tooltip>
              </>
            )}
            {esSsoma && !sacActiva(r) && (
              <Tooltip title="Generar SAC (SIG-G-F-10)">
                <Button size="small" icon={<FileAddOutlined />} onClick={() => confirmarGenerarSac(r)}>
                  SAC
                </Button>
              </Tooltip>
            )}
            {esSsoma && (
              <Popconfirm
                title="¿Anular este registro?"
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
  const { ocultas, setOcultas } = useColumnasOcultas("snc-cols-ocultas", []);
  const { columnas, components, TableDragWrapper } = useColumnasRedimensionables(
    allColumns,
    "snc-tabla",
    { data: rows },
  );
  const visibles = visibleColumns(columnas, ocultas);

  // ── Render ───────────────────────────────────────────────
  return (
    <div style={{ padding: 16 }}>
      <Title level={3} style={{ marginTop: 0 }}>
        <WarningOutlined /> Reportes de Salida No Conforme
      </Title>
      <Text type="secondary">
        Formato HPK-SIG-F-05. Cualquier personal reporta una salida no conforme; se edita mientras está abierta y se
        cierra con observaciones (foto y comentario opcionales). El encargado de seguridad puede generarle una SAC.
      </Text>

      <Card size="small" style={{ marginTop: 16, marginBottom: 8 }}>
        <Row gutter={[8, 8]} align="middle">
          <Col xs={24} md={8}>
            <Input
              allowClear
              placeholder="Buscar (SNC-XXXX-YY, área, descripción, reportador)"
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
              options={Object.entries(SNC_ESTADOS).map(([value, m]) => ({ value, label: m.label }))}
            />
          </Col>
          <Col xs={24} md={11}>
            <Space wrap>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCrearOpen(true)}>
                Nueva salida no conforme
              </Button>
              <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
                Refrescar
              </Button>
              <ColumnasToggleButton columns={allColumns} ocultas={ocultas} setOcultas={setOcultas} />
              <ExportarExcelButton<SncRow>
                endpoint="/api/ssoma/salidas-no-conformes"
                filename="SalidasNoConformes"
                currentRows={filtradas}
                tablaLayout={{ ocultas }}
                columns={[
                  { key: "codigo", label: "SNC N°", value: (r) => formatSalidaNoConformeCodigo(r.numero, r.anio) },
                  { key: "estado", label: "Estado", value: (r) => SNC_ESTADOS[r.estado]?.label ?? r.estado },
                  { key: "fecha", label: "Fecha", value: (r) => dateOnlyLocal(r.fecha) },
                  { key: "area", label: "Área", value: (r) => r.area ?? "" },
                  { key: "descripcion", label: "Descripción", value: (r) => r.descripcion ?? "" },
                  { key: "reportado_por", label: "Reportado por", value: (r) => r.reportado_por ?? "" },
                  { key: "area_reportante", label: "Área reportante", value: (r) => r.area_reportante ?? "" },
                  { key: "accion_tomada", label: "Acción tomada", value: (r) => r.accion_tomada ?? "" },
                  { key: "generado_por", label: "Generado por", value: (r) => r.generado_por ?? "" },
                  { key: "responsable_salida", label: "Responsable de salida", value: (r) => r.responsable_salida ?? "" },
                  { key: "requiere_sac", label: "¿Requiere SAC?", value: (r) => (r.requiere_sac ? "Sí" : "No") },
                  {
                    key: "sac", label: "SAC",
                    value: (r) => {
                      const sac = sacActiva(r);
                      return sac ? formatSacCodigo(sac.numero, sac.anio) : "";
                    },
                  },
                  { key: "observaciones", label: "Observaciones", value: (r) => r.observaciones ?? "" },
                  { key: "fecha_cierre", label: "Fecha cierre", value: (r) => dateOnlyLocal(r.fecha_cierre) },
                  { key: "comentario_cierre", label: "Comentario cierre", value: (r) => r.comentario_cierre ?? "" },
                ]}
              />
            </Space>
          </Col>
        </Row>
      </Card>

      <TableDragWrapper>
        <Table<SncRow>
          rowKey="id"
          size="small"
          loading={loading}
          columns={visibles}
          components={components}
          dataSource={rows}
          scroll={{ x: 2000 }}
          pagination={paginacionEstandar({
            current: page,
            pageSize,
            total: rows.length,
            onChange: (p, s) => { setPage(p); setPageSize(s); },
            label: "salidas",
          })}
          onChange={(_p, filters, _s, extra) => {
            captureFilteredRows(extra);
            setColumnFilters(filters as Record<string, (string | number | boolean | null)[] | null>);
          }}
        />
      </TableDragWrapper>

      {/* ── Modal Crear ─────────────────────────────── */}
      <Modal
        open={crearOpen}
        title="Nueva Salida No Conforme (HPK-SIG-F-05)"
        onCancel={() => { setCrearOpen(false); setFotosNuevas([]); }}
        onOk={handleCrear}
        okText="Crear registro"
        width={modalWidth(screens.screens, 720)}
        destroyOnHidden
      >
        <Form form={formCrear} layout="vertical" initialValues={{ fecha: dayjs(), requiere_sac: false }}>
          <Row gutter={12}>
            <Col xs={12} md={6}>
              <Form.Item name="fecha" label="Fecha" rules={[{ required: true, message: "Requerida" }]}>
                <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={9}>
              <Form.Item name="area" label="Área">
                <Input placeholder="Área donde se detectó" maxLength={100} />
              </Form.Item>
            </Col>
            <Col xs={24} md={9}>
              <Form.Item name="responsable_salida" label="Responsable de salida">
                <Input placeholder="Firma y nombre del responsable" maxLength={150} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="descripcion"
            label="Descripción de la salida no conforme"
            rules={[{ required: true, message: "Describí la salida no conforme" }]}
          >
            <TextArea rows={4} maxLength={3000} showCount />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item name="reportado_por" label="Reportado por" tooltip="Si lo dejás vacío, se usa tu usuario.">
                <Input maxLength={150} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="area_reportante" label="Área (del reportante)">
                <Input maxLength={100} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="accion_tomada" label="Acción tomada">
            <TextArea rows={3} maxLength={2000} showCount placeholder="Corrección / disposición inmediata sobre la salida" />
          </Form.Item>
          <Form.Item name="observaciones" label="Observaciones">
            <TextArea rows={2} maxLength={2000} showCount />
          </Form.Item>
          <Form.Item name="requiere_sac" valuePropName="checked">
            <Checkbox>¿Requiere solicitud de acción correctiva / preventiva (SAC)?</Checkbox>
          </Form.Item>
          <Form.Item label="Fotos de evidencia">
            <SsomaFotosUpload uploadUrlEndpoint={UPLOAD_URL} value={fotosNuevas} onChange={setFotosNuevas} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Modal Editar ────────────────────────────── */}
      <Modal
        open={editOpen}
        title={
          <>
            Editar —{" "}
            <Text strong>{editTarget ? formatSalidaNoConformeCodigo(editTarget.numero, editTarget.anio) : ""}</Text>
          </>
        }
        onCancel={() => { setEditOpen(false); setEditTarget(null); }}
        onOk={handleEdit}
        okText="Guardar cambios"
        width={modalWidth(screens.screens, 720)}
        destroyOnHidden
      >
        {editTarget && (
          <Form form={formEdit} layout="vertical">
            <Row gutter={12}>
              <Col xs={12} md={6}>
                <Form.Item name="fecha" label="Fecha">
                  <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={12} md={9}>
                <Form.Item name="area" label="Área">
                  <Input maxLength={100} />
                </Form.Item>
              </Col>
              <Col xs={24} md={9}>
                <Form.Item name="responsable_salida" label="Responsable de salida">
                  <Input maxLength={150} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="descripcion" label="Descripción" rules={[{ required: true, message: "Requerida" }]}>
              <TextArea rows={4} maxLength={3000} showCount />
            </Form.Item>
            <Row gutter={12}>
              <Col xs={24} md={12}>
                <Form.Item name="reportado_por" label="Reportado por">
                  <Input maxLength={150} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="area_reportante" label="Área (del reportante)">
                  <Input maxLength={100} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="accion_tomada" label="Acción tomada">
              <TextArea rows={3} maxLength={2000} showCount />
            </Form.Item>
            <Form.Item name="observaciones" label="Observaciones">
              <TextArea rows={2} maxLength={2000} showCount />
            </Form.Item>
            <Form.Item name="requiere_sac" valuePropName="checked">
              <Checkbox>¿Requiere solicitud de acción correctiva / preventiva (SAC)?</Checkbox>
            </Form.Item>
            <Form.Item label="Fotos de evidencia">
              <SsomaFotosGaleria fotos={editTarget.fotos} resource="snc-foto" editable onDelete={borrarFotoEdit} />
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
          </Form>
        )}
      </Modal>

      {/* ── Modal Cerrar (todo opcional salvo confirmar) ── */}
      <Modal
        open={cerrarOpen}
        title={
          <>
            Cerrar —{" "}
            <Text strong>{cerrarTarget ? formatSalidaNoConformeCodigo(cerrarTarget.numero, cerrarTarget.anio) : ""}</Text>
          </>
        }
        onCancel={() => { setCerrarOpen(false); setCerrarTarget(null); setFotoCierre([]); }}
        onOk={handleCerrar}
        okText="Cerrar registro"
        width={modalWidth(screens.screens, 560)}
        destroyOnHidden
      >
        <Form form={formCerrar} layout="vertical">
          <Form.Item name="observaciones" label="Observaciones">
            <TextArea rows={3} maxLength={2000} showCount />
          </Form.Item>
          <Form.Item name="comentario" label="Comentario de cierre (opcional)">
            <TextArea rows={3} maxLength={2000} showCount />
          </Form.Item>
          <Form.Item label="Foto de cierre (opcional)">
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
        title={verTarget ? formatSalidaNoConformeCodigo(verTarget.numero, verTarget.anio) : ""}
        size={screens.isMobile ? "default" : "large"}
      >
        {verTarget && (
          <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
            <div>
              <Text type="secondary">Estado:</Text>{" "}
              <Tag color={SNC_ESTADOS[verTarget.estado]?.color}>{SNC_ESTADOS[verTarget.estado]?.label ?? verTarget.estado}</Tag>
              {verTarget.requiere_sac && <Tag color="red">Requiere SAC</Tag>}
            </div>
            <div>
              <Text type="secondary">Fecha:</Text> {formatDateOnly(verTarget.fecha)}
              {" · "}
              <Text type="secondary">Área:</Text> {verTarget.area || "—"}
            </div>
            <div>
              <Text type="secondary">Reportado por:</Text> {verTarget.reportado_por || "—"}
              {verTarget.area_reportante ? ` (${verTarget.area_reportante})` : ""}
            </div>
            <div>
              <Text type="secondary">Generado por:</Text> {verTarget.generado_por || "—"}
              {" · "}
              <Text type="secondary">Responsable de salida:</Text> {verTarget.responsable_salida || "—"}
            </div>
            <Card size="small" title="Descripción de la salida no conforme">
              <Text style={{ whiteSpace: "pre-wrap" }}>{verTarget.descripcion || "—"}</Text>
            </Card>
            <Card size="small" title="Acción tomada">
              <Text style={{ whiteSpace: "pre-wrap" }}>{verTarget.accion_tomada || "—"}</Text>
            </Card>
            <Card size="small" title="Observaciones">
              <Text style={{ whiteSpace: "pre-wrap" }}>{verTarget.observaciones || "—"}</Text>
            </Card>
            <Card size="small" title="Fotos de evidencia">
              <SsomaFotosGaleria fotos={verTarget.fotos} resource="snc-foto" />
            </Card>
            <div>
              <Text type="secondary">SAC vinculada:</Text>{" "}
              {(() => {
                const sac = sacActiva(verTarget);
                return sac ? (
                  <a
                    onClick={(e) => {
                      e.preventDefault();
                      router.push(`/ssoma/sacs?search=${formatSacCodigo(sac.numero, sac.anio)}`);
                    }}
                  >
                    {formatSacCodigo(sac.numero, sac.anio)}
                  </a>
                ) : "—";
              })()}
            </div>
            {verTarget.estado === "CERRADO" && (
              <Card size="small" title="Cierre">
                <div>
                  <Text type="secondary">Cerrado por:</Text> {verTarget.cerrado_por || "—"}
                  {verTarget.fecha_cierre ? ` — ${new Date(verTarget.fecha_cierre).toLocaleString("es-PE")}` : ""}
                </div>
                {verTarget.comentario_cierre && (
                  <div style={{ marginTop: 6 }}>
                    <Text type="secondary">Comentario:</Text>{" "}
                    <Text style={{ whiteSpace: "pre-wrap" }}>{verTarget.comentario_cierre}</Text>
                  </div>
                )}
                {verTarget.cierre_foto_key && (
                  <div style={{ marginTop: 8 }}>
                    <R2Image
                      resource="snc-cierre"
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
