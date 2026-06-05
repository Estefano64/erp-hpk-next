"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Typography, Table, Button, Input, Select, Space, Tag, Modal, Form,
  Row, Col, Card, App, Popconfirm, Tooltip, Drawer,
} from "antd";
import {
  ToolOutlined, PlusOutlined, ReloadOutlined, SearchOutlined,
  EditOutlined, EyeOutlined, FilePdfOutlined, DeleteOutlined,
  CheckCircleOutlined, PlayCircleOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
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
} from "@/lib/tables";
import { formatReporteCorrectivoCodigo, formatOtInternaCodigo } from "@/lib/ot-formato";
import { areasTallerGrouped } from "@/lib/areas-taller";

const { Title, Text } = Typography;
const { TextArea } = Input;

interface EquipoOption {
  codigo: string;
  descripcion: string;
  area_codigo?: string;
}

interface OTInternaResumen {
  id: number;
  ot: number | null;
  ot_status?: { nombre: string } | null;
}

interface CorrectivoRow {
  id: number;
  numero: number | null;
  anio: number | null;
  equipo_codigo: string;
  area_codigo: string;
  fecha: string;
  detalle_falla: string | null;
  reportado_por: string | null;
  fecha_reporte: string | null;
  orden_trabajo_interna_id: number | null;
  descripcion_correctivo: string | null;
  realizado_por: string | null;
  fecha_correctivo: string | null;
  responsable_area: string | null;
  estado: "REPORTADO" | "EN_PROCESO" | "COMPLETADO";
  activo: boolean;
  created_at: string;
  equipo?: { codigo: string; descripcion: string; tipo_codigo?: string };
  area?: { codigo: string; nombre: string };
  ot_interna?: OTInternaResumen | null;
}

const ESTADOS: Record<CorrectivoRow["estado"], { label: string; color: string }> = {
  REPORTADO: { label: "Reportado", color: "orange" },
  EN_PROCESO: { label: "En proceso", color: "blue" },
  COMPLETADO: { label: "Completado", color: "green" },
};

export default function CorrectivosPage() {
  const { message, modal } = App.useApp();
  const router = useRouter();
  const screens = useResponsive();

  const [rows, setRows] = useState<CorrectivoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGINATION_PAGE_SIZE);

  // Filtros persistidos por usuario
  const [search, setSearch] = usePersistedState<string>("correctivos-search", "");
  const [estadoFiltro, setEstadoFiltro] = usePersistedState<string>("correctivos-estado", "");
  const [columnFilters, setColumnFilters] = usePersistedState<Record<string, (string | number | boolean | null)[] | null>>(
    "correctivos-col-filters",
    {},
  );

  // Selector de equipo (carga remota con search)
  const [equipos, setEquipos] = useState<EquipoOption[]>([]);
  const [equipoSearch, setEquipoSearch] = useState("");

  // Modales
  const [crearOpen, setCrearOpen] = useState(false);
  const [formCrear] = Form.useForm();

  const [generarOpen, setGenerarOpen] = useState(false);
  const [generarTarget, setGenerarTarget] = useState<CorrectivoRow | null>(null);
  const [formGenerar] = Form.useForm();

  const [cerrarOpen, setCerrarOpen] = useState(false);
  const [cerrarTarget, setCerrarTarget] = useState<CorrectivoRow | null>(null);
  const [formCerrar] = Form.useForm();

  const [verOpen, setVerOpen] = useState(false);
  const [verTarget, setVerTarget] = useState<CorrectivoRow | null>(null);

  // ── Fetchers ────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", "500");
      if (search.trim()) qs.set("search", search.trim());
      if (estadoFiltro) qs.set("estado", estadoFiltro);
      const res = await fetch(`/api/mantenimiento/correctivos?${qs}`);
      if (!res.ok) throw new Error("Error al cargar");
      const json = await res.json();
      setRows(json.data || []);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [search, estadoFiltro, message]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Equipos para los selects — recarga al cambiar el texto de búsqueda.
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const qs = new URLSearchParams();
        qs.set("limit", "300");
        if (equipoSearch.trim()) qs.set("search", equipoSearch.trim());
        const res = await fetch(`/api/equipos?${qs}`, { signal: ctrl.signal });
        if (!res.ok) return;
        const json = await res.json();
        setEquipos(
          (json.data || []).map((e: { codigo: string; descripcion: string; area_codigo: string }) => ({
            codigo: e.codigo,
            descripcion: e.descripcion,
            area_codigo: e.area_codigo,
          })),
        );
      } catch {
        // abortado
      }
    })();
    return () => ctrl.abort();
  }, [equipoSearch]);

  // ── Acciones ────────────────────────────────────────────
  async function handleCrear() {
    try {
      const values = await formCrear.validateFields();
      const res = await fetch("/api/mantenimiento/correctivos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          equipo_codigo: values.equipo_codigo,
          detalle_falla: values.detalle_falla,
          reportado_por: values.reportado_por || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al crear");
      message.success(`Reporte ${formatReporteCorrectivoCodigo(json.data.numero, json.data.anio)} creado.`);
      setCrearOpen(false);
      formCrear.resetFields();
      fetchData();
    } catch (e) {
      const err = e as { errorFields?: unknown; message?: string };
      if (err.errorFields) return;
      message.error(err.message || "Error");
    }
  }

  function openGenerar(row: CorrectivoRow) {
    setGenerarTarget(row);
    setGenerarOpen(true);
  }

  async function handleGenerar() {
    if (!generarTarget) return;
    try {
      const values = await formGenerar.validateFields();
      const res = await fetch(`/api/mantenimiento/correctivos/${generarTarget.id}/generar-ot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          descripcion: values.descripcion,
          area_taller: values.area_taller || null,
          prioridad_atencion_codigo: values.prioridad_atencion_codigo || null,
          asignado_a: values.asignado_a || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      message.success(`OT interna ${formatOtInternaCodigo(json.data.ot.ot)} generada y vinculada.`);
      setGenerarOpen(false);
      setGenerarTarget(null);
      fetchData();
    } catch (e) {
      const err = e as { errorFields?: unknown; message?: string };
      if (err.errorFields) return;
      message.error(err.message || "Error");
    }
  }

  function openCerrar(row: CorrectivoRow) {
    setCerrarTarget(row);
    setCerrarOpen(true);
  }

  async function handleCerrar() {
    if (!cerrarTarget) return;
    try {
      const values = await formCerrar.validateFields();
      const res = await fetch(`/api/mantenimiento/correctivos/${cerrarTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          descripcion_correctivo: values.descripcion_correctivo,
          realizado_por: values.realizado_por || null,
          responsable_area: values.responsable_area || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      message.success("Correctivo cerrado.");
      setCerrarOpen(false);
      setCerrarTarget(null);
      fetchData();
    } catch (e) {
      const err = e as { errorFields?: unknown; message?: string };
      if (err.errorFields) return;
      message.error(err.message || "Error");
    }
  }

  async function handleAnular(id: number) {
    try {
      const res = await fetch(`/api/mantenimiento/correctivos/${id}`, { method: "DELETE" });
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

  function abrirPDF(id: number) {
    window.open(`/api/mantenimiento/correctivos/${id}/pdf`, "_blank");
  }

  // ── Tabla ────────────────────────────────────────────────
  const allColumns: ColumnsType<CorrectivoRow> = useMemo(
    () => [
      numeracionColumn<CorrectivoRow>(),
      {
        key: "codigo",
        title: "Reporte",
        dataIndex: "numero",
        width: 130,
        fixed: "left",
        render: (_: unknown, r) => (
          <Text strong>{formatReporteCorrectivoCodigo(r.numero, r.anio)}</Text>
        ),
      },
      {
        key: "estado",
        title: "Estado",
        dataIndex: "estado",
        width: 120,
        ...filtroPorColumna<CorrectivoRow>(rows, "estado"),
        render: (e: CorrectivoRow["estado"]) => {
          const m = ESTADOS[e];
          return <Tag color={m?.color}>{m?.label ?? e}</Tag>;
        },
      },
      {
        key: "equipo_codigo",
        title: "Cód. Equipo",
        dataIndex: "equipo_codigo",
        width: 130,
      },
      {
        key: "equipo_descripcion",
        title: "Equipo",
        width: 240,
        render: (_: unknown, r) => r.equipo?.descripcion ?? "—",
      },
      {
        key: "area_codigo",
        title: "Área",
        width: 160,
        ...filtroPorColumna<CorrectivoRow>(rows, "area_codigo"),
        render: (_: unknown, r) => r.area?.nombre ?? r.area_codigo,
      },
      {
        key: "detalle_falla",
        title: "Detalle de Falla",
        dataIndex: "detalle_falla",
        width: 280,
        render: (v: string | null) =>
          v ? (
            <Tooltip title={v} styles={{ root: { maxWidth: 420 } }}>
              <Text style={{ display: "block", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {v}
              </Text>
            </Tooltip>
          ) : (
            "—"
          ),
      },
      {
        key: "ot_interna",
        title: "OT Interna",
        width: 140,
        render: (_: unknown, r) =>
          r.ot_interna?.ot ? (
            <a onClick={(e) => { e.preventDefault(); router.push(`/ordenes-trabajo-internas?search=${formatOtInternaCodigo(r.ot_interna!.ot)}`); }}>
              {formatOtInternaCodigo(r.ot_interna.ot)}
            </a>
          ) : (
            <Text type="secondary">—</Text>
          ),
      },
      {
        key: "ot_estado",
        title: "Estado OT",
        width: 130,
        render: (_: unknown, r) =>
          r.ot_interna?.ot_status?.nombre ? <Tag>{r.ot_interna.ot_status.nombre}</Tag> : <Text type="secondary">—</Text>,
      },
      {
        key: "reportado_por",
        title: "Reportado por",
        dataIndex: "reportado_por",
        width: 150,
        render: (v: string | null) => v || <Text type="secondary">—</Text>,
      },
      {
        key: "fecha",
        title: "Fecha",
        dataIndex: "fecha",
        width: 110,
        render: (v: string) => (v ? new Date(v).toLocaleDateString("es-PE") : "—"),
      },
      {
        key: "realizado_por",
        title: "Realizado por",
        dataIndex: "realizado_por",
        width: 150,
        render: (v: string | null) => v || <Text type="secondary">—</Text>,
      },
      {
        key: "fecha_correctivo",
        title: "Fecha cierre",
        dataIndex: "fecha_correctivo",
        width: 110,
        render: (v: string | null) => (v ? new Date(v).toLocaleDateString("es-PE") : "—"),
      },
      {
        key: "acciones",
        title: "Acciones",
        width: 230,
        fixed: "right",
        render: (_: unknown, r) => (
          <Space size={4} wrap>
            <Tooltip title="Ver detalle">
              <Button size="small" icon={<EyeOutlined />} onClick={() => { setVerTarget(r); setVerOpen(true); }} />
            </Tooltip>
            <Tooltip title="Descargar PDF (HPK-M-F-07)">
              <Button size="small" icon={<FilePdfOutlined />} onClick={() => abrirPDF(r.id)} />
            </Tooltip>
            {r.estado === "REPORTADO" && (
              <Tooltip title="Generar OT interna correctiva">
                <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={() => openGenerar(r)}>
                  Generar OT
                </Button>
              </Tooltip>
            )}
            {(r.estado === "EN_PROCESO" || r.estado === "COMPLETADO") && (
              <Tooltip title={r.estado === "COMPLETADO" ? "Editar correctivo" : "Registrar correctivo realizado"}>
                <Button
                  size="small"
                  type={r.estado === "EN_PROCESO" ? "primary" : "default"}
                  icon={r.estado === "EN_PROCESO" ? <CheckCircleOutlined /> : <EditOutlined />}
                  onClick={() => openCerrar(r)}
                >
                  {r.estado === "EN_PROCESO" ? "Cerrar" : "Editar"}
                </Button>
              </Tooltip>
            )}
            <Popconfirm
              title="¿Anular este reporte?"
              description="Se ocultará del listado. La OT interna asociada no se modifica."
              okText="Anular"
              okButtonProps={{ danger: true }}
              cancelText="Cancelar"
              onConfirm={() => handleAnular(r.id)}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [rows, columnFilters, router],
  );

  const { ocultas, setOcultas } = useColumnasOcultas("correctivos-cols-ocultas", []);
  const { columnas, components, TableDragWrapper } = useColumnasRedimensionables(
    allColumns,
    "correctivos-tabla",
    { data: rows },
  );
  const visibles = visibleColumns(columnas, ocultas);

  // ── Render ───────────────────────────────────────────────
  return (
    <div style={{ padding: 16 }}>
      <Title level={3} style={{ marginTop: 0 }}>
        <ToolOutlined /> Reportes de Mantenimiento Correctivo
      </Title>
      <Text type="secondary">
        Flujo: <strong>1)</strong> Alguien reporta la falla. <strong>2)</strong> El encargado genera la OT interna correctiva (pide
        requerimientos por el flujo normal). <strong>3)</strong> Al terminar, se registra la descripción del correctivo realizado.
      </Text>

      <Card size="small" style={{ marginTop: 16, marginBottom: 8 }}>
        <Row gutter={[8, 8]} align="middle">
          <Col xs={24} md={8}>
            <Input
              allowClear
              placeholder="Buscar (RC-XXXX-YY, equipo, falla, reportador)"
              prefix={<SearchOutlined />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Col>
          <Col xs={24} md={6}>
            <Select
              allowClear
              placeholder="Estado"
              style={{ width: "100%" }}
              value={estadoFiltro || undefined}
              onChange={(v) => setEstadoFiltro(v || "")}
              options={[
                { value: "REPORTADO", label: "Reportado" },
                { value: "EN_PROCESO", label: "En proceso" },
                { value: "COMPLETADO", label: "Completado" },
              ]}
            />
          </Col>
          <Col xs={24} md={10}>
            <Space wrap>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCrearOpen(true)}>
                Nuevo reporte de falla
              </Button>
              <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
                Refrescar
              </Button>
              <ColumnasToggleButton
                columns={allColumns}
                ocultas={ocultas}
                setOcultas={setOcultas}
              />
            </Space>
          </Col>
        </Row>
      </Card>

      <TableDragWrapper>
        <Table<CorrectivoRow>
          rowKey="id"
          size="small"
          loading={loading}
          columns={visibles}
          components={components}
          dataSource={rows}
          scroll={{ x: 1700 }}
          pagination={paginacionEstandar({
            current: page,
            pageSize,
            total: rows.length,
            onChange: (p, s) => { setPage(p); setPageSize(s); },
            label: "reportes",
          })}
          onChange={(_p, filters) =>
            setColumnFilters(filters as Record<string, (string | number | boolean | null)[] | null>)
          }
        />
      </TableDragWrapper>

      {/* ── Modal Crear ─────────────────────────────── */}
      <Modal
        open={crearOpen}
        title="Nuevo reporte de falla"
        onCancel={() => setCrearOpen(false)}
        onOk={handleCrear}
        okText="Crear reporte"
        width={modalWidth(screens.screens, 640)}
        destroyOnHidden
      >
        <Form form={formCrear} layout="vertical">
          <Form.Item
            name="equipo_codigo"
            label="Equipo"
            rules={[{ required: true, message: "Seleccioná el equipo" }]}
          >
            <Select
              showSearch
              placeholder="Buscar equipo (código o descripción)"
              filterOption={false}
              onSearch={setEquipoSearch}
              options={equipos.map((e) => ({
                value: e.codigo,
                label: `${e.codigo} — ${e.descripcion}`,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="detalle_falla"
            label="Detalle de la falla"
            rules={[{ required: true, message: "Describí la falla" }]}
          >
            <TextArea rows={5} maxLength={2000} showCount placeholder="¿Qué falla presenta el equipo?" />
          </Form.Item>
          <Form.Item
            name="reportado_por"
            label="Reportado por (opcional)"
            tooltip="Si lo dejás vacío, se usa tu usuario."
          >
            <Input placeholder="Nombre del operario que detectó la falla" maxLength={150} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Modal Generar OT ────────────────────────── */}
      <Modal
        open={generarOpen}
        title={
          <>
            Generar OT interna correctiva —{" "}
            <Text strong>{generarTarget ? formatReporteCorrectivoCodigo(generarTarget.numero, generarTarget.anio) : ""}</Text>
          </>
        }
        onCancel={() => { setGenerarOpen(false); setGenerarTarget(null); }}
        onOk={handleGenerar}
        okText="Generar OT"
        width={modalWidth(screens.screens, 700)}
        destroyOnHidden
      >
        {generarTarget && (
          <>
            <Card size="small" style={{ marginBottom: 12 }}>
              <Text type="secondary">Equipo:</Text>{" "}
              <Text strong>{generarTarget.equipo_codigo}</Text>{" — "}
              <Text>{generarTarget.equipo?.descripcion}</Text>
              <br />
              <Text type="secondary">Falla:</Text>{" "}
              <Text>{generarTarget.detalle_falla}</Text>
            </Card>
            <Form
              key={generarTarget.id}
              form={formGenerar}
              layout="vertical"
              initialValues={{ descripcion: generarTarget.detalle_falla ?? "" }}
            >
              <Form.Item
                name="descripcion"
                label="Descripción de la OT"
                rules={[{ required: true, message: "Requerido" }]}
                tooltip="Default: el detalle de la falla. Podés ajustarlo."
              >
                <TextArea rows={3} maxLength={500} showCount />
              </Form.Item>
              <Row gutter={12}>
                <Col xs={24} md={12}>
                  <Form.Item name="area_taller" label="Área del taller (opcional)">
                    <Select
                      placeholder="Elegí un área o sub-área"
                      showSearch
                      allowClear
                      optionFilterProp="label"
                      options={areasTallerGrouped()}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="asignado_a" label="Asignado a (opcional)">
                    <Input placeholder="Operario responsable" />
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          </>
        )}
      </Modal>

      {/* ── Modal Cerrar / Editar correctivo ───────── */}
      <Modal
        open={cerrarOpen}
        title={
          <>
            {cerrarTarget?.estado === "COMPLETADO" ? "Editar" : "Registrar"} mantenimiento correctivo —{" "}
            <Text strong>{cerrarTarget ? formatReporteCorrectivoCodigo(cerrarTarget.numero, cerrarTarget.anio) : ""}</Text>
          </>
        }
        onCancel={() => { setCerrarOpen(false); setCerrarTarget(null); }}
        onOk={handleCerrar}
        okText={cerrarTarget?.estado === "COMPLETADO" ? "Guardar cambios" : "Cerrar correctivo"}
        width={modalWidth(screens.screens, 720)}
        destroyOnHidden
      >
        {cerrarTarget && (
          <>
            <Card size="small" style={{ marginBottom: 12 }}>
              <Row gutter={12}>
                <Col span={12}>
                  <Text type="secondary">Equipo:</Text>{" "}
                  <Text strong>{cerrarTarget.equipo_codigo}</Text>
                </Col>
                <Col span={12}>
                  <Text type="secondary">OT vinculada:</Text>{" "}
                  {cerrarTarget.ot_interna?.ot ? (
                    <Tag color="blue">{formatOtInternaCodigo(cerrarTarget.ot_interna.ot)}</Tag>
                  ) : (
                    <Tag>Sin OT</Tag>
                  )}
                </Col>
              </Row>
              <div style={{ marginTop: 6 }}>
                <Text type="secondary">Detalle de falla:</Text>{" "}
                <Text>{cerrarTarget.detalle_falla}</Text>
              </div>
            </Card>
            <Form
              key={cerrarTarget.id}
              form={formCerrar}
              layout="vertical"
              initialValues={{
                descripcion_correctivo: cerrarTarget.descripcion_correctivo ?? "",
                realizado_por: cerrarTarget.realizado_por ?? "",
                responsable_area: cerrarTarget.responsable_area ?? "",
              }}
            >
              <Form.Item
                name="descripcion_correctivo"
                label="Descripción del correctivo realizado"
                rules={[{ required: true, message: "Describí cómo se realizó el correctivo" }]}
                tooltip="Detalle el trabajo de reparación. Esto cierra el reporte."
              >
                <TextArea rows={6} maxLength={3000} showCount placeholder="¿Cómo se reparó la falla? Repuestos usados, procedimiento, etc." />
              </Form.Item>
              <Row gutter={12}>
                <Col xs={24} md={12}>
                  <Form.Item name="realizado_por" label="Realizado por">
                    <Input placeholder="Nombre del técnico" maxLength={150} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="responsable_area" label="Responsable de área">
                    <Input placeholder="Nombre del responsable" maxLength={150} />
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          </>
        )}
      </Modal>

      {/* ── Drawer Ver detalle ─────────────────────── */}
      <Drawer
        open={verOpen}
        onClose={() => { setVerOpen(false); setVerTarget(null); }}
        title={verTarget ? formatReporteCorrectivoCodigo(verTarget.numero, verTarget.anio) : ""}
        size={screens.isMobile ? "default" : "large"}
      >
        {verTarget && (
          <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
            <div>
              <Text type="secondary">Estado:</Text>{" "}
              <Tag color={ESTADOS[verTarget.estado].color}>{ESTADOS[verTarget.estado].label}</Tag>
            </div>
            <div>
              <Text type="secondary">Equipo:</Text>{" "}
              <Text strong>{verTarget.equipo_codigo}</Text> — {verTarget.equipo?.descripcion}
            </div>
            <div>
              <Text type="secondary">Área:</Text> {verTarget.area?.nombre}
            </div>
            <div>
              <Text type="secondary">Fecha del reporte:</Text>{" "}
              {verTarget.fecha ? new Date(verTarget.fecha).toLocaleDateString("es-PE") : "—"}
            </div>
            <div>
              <Text type="secondary">Reportado por:</Text> {verTarget.reportado_por || "—"}
            </div>
            <Card size="small" title="Detalle de Falla">
              <Text style={{ whiteSpace: "pre-wrap" }}>{verTarget.detalle_falla || "—"}</Text>
            </Card>
            <div>
              <Text type="secondary">OT Interna:</Text>{" "}
              {verTarget.ot_interna?.ot ? (
                <a onClick={(e) => { e.preventDefault(); router.push(`/ordenes-trabajo-internas?search=${formatOtInternaCodigo(verTarget.ot_interna!.ot)}`); }}>
                  {formatOtInternaCodigo(verTarget.ot_interna.ot)}
                </a>
              ) : "—"}
              {verTarget.ot_interna?.ot_status?.nombre && (
                <Tag style={{ marginLeft: 6 }}>{verTarget.ot_interna.ot_status.nombre}</Tag>
              )}
            </div>
            <Card size="small" title="Descripción del Correctivo">
              <Text style={{ whiteSpace: "pre-wrap" }}>{verTarget.descripcion_correctivo || "(Pendiente)"}</Text>
            </Card>
            <div>
              <Text type="secondary">Realizado por:</Text> {verTarget.realizado_por || "—"}
            </div>
            <div>
              <Text type="secondary">Fecha cierre:</Text>{" "}
              {verTarget.fecha_correctivo ? new Date(verTarget.fecha_correctivo).toLocaleDateString("es-PE") : "—"}
            </div>
            <div>
              <Text type="secondary">Responsable de área:</Text> {verTarget.responsable_area || "—"}
            </div>
            <Button block icon={<FilePdfOutlined />} onClick={() => abrirPDF(verTarget.id)}>
              Descargar PDF (HPK-M-F-07)
            </Button>
          </Space>
        )}
      </Drawer>
    </div>
  );
}
