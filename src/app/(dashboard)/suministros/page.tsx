"use client";

// Página /suministros — gestión de consumibles (trapos, pintura, pernos, etc.).
//
// Tabs:
//   - Catálogo:    muestra el stock actual de suministros (vista filtrada de /stock).
//   - Entregas:    historial + formulario para entregar suministros a un
//                  trabajador o a una OT. Usa /api/movimientos con SALIDA;
//                  el OT/trabajador se guardan en documento_referencia y
//                  persona_recibe respectivamente.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Typography, Card, Table, Tag, Space, Button, Row, Col, Statistic, Empty,
  Input, App, Tooltip, Alert, Tabs, Modal, Form, Select, InputNumber, DatePicker,
} from "antd";
import {
  InboxOutlined, ReloadOutlined, SearchOutlined, ArrowDownOutlined,
  CheckCircleOutlined, WarningOutlined, PlusOutlined, SendOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import { useSession } from "next-auth/react";
import { brand } from "@/lib/theme";
import { useResponsive, modalWidth } from "@/lib/responsive";
import { EditableCell } from "@/components/EditableCell";
import { ExportarExcelButton } from "@/components/ExportarExcelButton";
import { filtroPorColumna, useColumnasRedimensionables, STICKY_HEADER, paginacionEstandar, useTablaFiltrada } from "@/lib/tables";
import { formatDateOnly } from "@/lib/dates";

const { Title, Text } = Typography;

interface StockItem {
  material_id: number;
  codigo: string;
  descripcion: string;
  np: string | null;
  stock_actual: number;
  punto_reposicion: number;
  stock_maximo: number;
  unidad_medida: string | null;
  ubicacion: string | null;
  precio: number | null;
  moneda: string | null;
  fabricante: string | null;
  categoria: string | null;
  categoria_nombre: string | null;
  clasificacion: string | null;
  alerta: "OK" | "BAJO" | "SIN" | "EXCESO";
}

// SOLO los materiales catalogados cuya categoría sea exactamente
// "Suministros" o "Consumibles" (por nombre, case-insensitive). Antes el
// filtro también matcheaba palabras en la descripción ("trapo", "lija", etc.)
// pero eso producía falsos positivos — el user pidió SOLO por categoría.
const NOMBRES_CATEGORIA_PERMITIDOS = ["suministros", "consumibles"];
// Códigos cortos legacy que también valen (por si la BD tiene la categoría
// con código antiguo pero nombre nuevo, o viceversa).
const CODIGOS_CATEGORIA_PERMITIDOS = ["SUM", "SUMI", "CONS", "CONSUMIBLE"];

function esSuministro(item: StockItem): boolean {
  const nombre = (item.categoria_nombre ?? "").trim().toLowerCase();
  if (NOMBRES_CATEGORIA_PERMITIDOS.includes(nombre)) return true;
  const codigo = (item.categoria ?? "").trim().toUpperCase();
  return CODIGOS_CATEGORIA_PERMITIDOS.includes(codigo);
}

export default function SuministrosPage() {
  return (
    <div>
      <Title level={3} style={{ marginTop: 0 }}>
        <InboxOutlined style={{ marginRight: 8 }} />
        Suministros
      </Title>
      <Tabs
        defaultActiveKey="catalogo"
        items={[
          { key: "catalogo", label: <span><InboxOutlined /> Catálogo</span>, children: <TabCatalogo /> },
          { key: "entregas", label: <span><SendOutlined /> Entregar suministros</span>, children: <TabEntregas /> },
        ]}
      />
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// TAB 1 — Catálogo (vista de stock filtrada)
// ════════════════════════════════════════════════════════════
function TabCatalogo() {
  const { message } = App.useApp();
  const router = useRouter();
  const [data, setData] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stock");
      const json = await res.json();
      setData(json.data ?? []);
    } catch {
      message.error("Error al cargar suministros");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const suministros = useMemo(() => data.filter(esSuministro), [data]);
  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suministros;
    return suministros.filter((s) =>
      s.codigo.toLowerCase().includes(q) ||
      (s.descripcion || "").toLowerCase().includes(q) ||
      (s.np ?? "").toLowerCase().includes(q),
    );
  }, [suministros, search]);
  // Filas visibles después de filtros de columna del Table (para el export Excel).
  const { filtradas: vistaTabla, onChange: capturarFiltros } = useTablaFiltrada(filtrados);

  const guardarUbicacion = async (materialId: number, nueva: string | null) => {
    const res = await fetch(`/api/materiales/${materialId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ubicacion: nueva ?? "" }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      message.error(j.error ?? "Error");
      throw new Error(j.error ?? "Error");
    }
    setData((prev) => prev.map((r) => (r.material_id === materialId ? { ...r, ubicacion: nueva } : r)));
    message.success("Ubicación actualizada");
  };

  const totalItems = filtrados.length;
  const sinStock = filtrados.filter((s) => s.stock_actual <= 0).length;
  const bajoStock = filtrados.filter((s) => s.punto_reposicion > 0 && s.stock_actual > 0 && s.stock_actual <= s.punto_reposicion).length;
  const conMinMax = filtrados.filter((s) => s.punto_reposicion > 0 && s.stock_maximo > 0).length;

  const columns: ColumnsType<StockItem> = [
    {
      key: "alerta", title: "Estado", width: 90, align: "center",
      render: (_, r) => {
        if (r.alerta === "SIN") return <Tag icon={<WarningOutlined />} color="error">Sin stock</Tag>;
        if (r.alerta === "BAJO") return <Tag icon={<WarningOutlined />} color="warning">Bajo</Tag>;
        if (r.alerta === "EXCESO") return <Tag color="purple">Exceso</Tag>;
        return <Tag icon={<CheckCircleOutlined />} color="success">OK</Tag>;
      },
    },
    {
      key: "codigo", title: "Código", dataIndex: "codigo", width: 110,
      render: (v: string) => <Text strong style={{ fontSize: 11, color: brand.navy }}>{v}</Text>,
    },
    { key: "descripcion", title: "Descripción", dataIndex: "descripcion", ellipsis: true, ...filtroPorColumna(filtrados, "descripcion") },
    { key: "np", title: "N/P", dataIndex: "np", width: 100, ...filtroPorColumna(filtrados, "np") },
    {
      key: "stock_actual", title: "Stock", dataIndex: "stock_actual", width: 90, align: "right",
      sorter: (a, b) => a.stock_actual - b.stock_actual,
      render: (v: number, r) => (
        <span style={{ fontWeight: 600, color: r.alerta === "SIN" ? "#cf1322" : r.alerta === "BAJO" ? "#faad14" : "#52c41a" }}>
          {v}
        </span>
      ),
    },
    { key: "um", title: "UM", dataIndex: "unidad_medida", width: 60, align: "center" },
    {
      key: "pto_repo", title: "Pto. Repo", dataIndex: "punto_reposicion", width: 90, align: "right",
      render: (v: number) => v > 0 ? v : <Text type="secondary">—</Text>,
    },
    {
      key: "stock_max", title: "Máximo", dataIndex: "stock_maximo", width: 90, align: "right",
      render: (v: number) => v > 0 ? v : <Text type="secondary">—</Text>,
    },
    {
      key: "ubicacion", title: "Ubicación", dataIndex: "ubicacion", width: 130,
      render: (v: string | null, r) => (
        <EditableCell
          value={v} type="string" emptyPlaceholder="+ ubicar"
          onSave={async (next) => {
            const txt = (next == null || next === "") ? null : String(next).trim() || null;
            await guardarUbicacion(r.material_id, txt);
          }}
        />
      ),
    },
    {
      key: "fabricante", title: "Fabricante", dataIndex: "fabricante", width: 100,
      render: (v: string | null) => v ? <Tag>{v}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      key: "precio", title: "Precio Último", dataIndex: "precio", width: 110, align: "right",
      render: (v: number | null, r) => v != null ? `${r.moneda || ""} ${v.toFixed(2)}` : <Text type="secondary">—</Text>,
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
        <ExportarExcelButton<StockItem>
          // OJO: /api/stock devuelve TODO el stock (no solo suministros) y no
          // pagina; con el checkbox "usar filtros de la tabla" (default) se
          // exporta lo visible (solo suministros + búsqueda + filtros de columna).
          endpoint="/api/stock"
          limit={50000}
          filename="Suministros"
          currentRows={vistaTabla}
          columns={[
            { label: "Estado", value: (r) => r.alerta === "SIN" ? "Sin stock" : r.alerta === "BAJO" ? "Bajo" : r.alerta === "EXCESO" ? "Exceso" : "OK" },
            { label: "Código", value: (r) => r.codigo },
            { label: "Descripción", value: (r) => r.descripcion },
            { label: "N/P", value: (r) => r.np ?? "" },
            { label: "Stock", value: (r) => r.stock_actual },
            { label: "UM", value: (r) => r.unidad_medida ?? "" },
            { label: "Pto. Repo", value: (r) => r.punto_reposicion > 0 ? r.punto_reposicion : "" },
            { label: "Máximo", value: (r) => r.stock_maximo > 0 ? r.stock_maximo : "" },
            { label: "Ubicación", value: (r) => r.ubicacion ?? "" },
            { label: "Fabricante", value: (r) => r.fabricante ?? "" },
            { label: "Precio Último", value: (r) => r.precio != null ? Number(r.precio) : "" },
            { label: "Moneda", value: (r) => r.moneda ?? "" },
          ]}
        />
        <Tooltip title="Ir a movimientos para registrar entrada/salida con más opciones">
          <Button icon={<ArrowDownOutlined />} onClick={() => router.push("/movimientos")}>
            Movimientos
          </Button>
        </Tooltip>
        <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>Actualizar</Button>
      </div>

      <Alert
        type="info" showIcon style={{ marginBottom: 12 }}
        title="Consumibles que se entregan a una OT (trapos, pintura, pernos, disolventes, etc.)"
        description={
          <div style={{ fontSize: 12 }}>
            Esta vista muestra solo los materiales catalogados cuya categoría sea
            <b> Suministros</b> o <b>Consumibles</b>. Si un material no aparece, revisá
            su categoría en /materiales o /catalogos.
            Para entregar suministros a un trabajador / OT, usá la pestaña <b>Entregar suministros</b>.
          </div>
        }
      />

      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Total suministros" value={totalItems} prefix={<InboxOutlined style={{ color: brand.navy }} />} styles={{ content: { color: brand.navy, fontSize: 22 } }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Sin stock" value={sinStock} prefix={<WarningOutlined style={{ color: "#ff4d4f" }} />} styles={{ content: { color: "#ff4d4f", fontSize: 22 } }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Bajo stock" value={bajoStock} prefix={<WarningOutlined style={{ color: "#faad14" }} />} styles={{ content: { color: "#faad14", fontSize: 22 } }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Con mín/máx" value={conMinMax} prefix={<CheckCircleOutlined style={{ color: "#13c2c2" }} />} styles={{ content: { color: "#13c2c2", fontSize: 22 } }} />
          </Card>
        </Col>
      </Row>

      <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: 10 } }}>
        <Input
          placeholder="Buscar código, descripción, N/P..."
          prefix={<SearchOutlined />}
          allowClear value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ width: 360, maxWidth: "100%" }}
        />
      </Card>

      {filtrados.length === 0 && !loading ? (
        <Empty
          description={
            <div>
              <p>No hay materiales clasificados como suministro.</p>
              <p style={{ fontSize: 12, color: "#888" }}>
                Para que un material aparezca acá, asigná categoría <b>SUM</b> en el catálogo de materiales,
                o nombrá su descripción con palabras como “trapo”, “pintura”, “pernos”, etc.
              </p>
            </div>
          }
        />
      ) : (
        <Card>
          <TablaSuministros
            columns={columns} data={filtrados} loading={loading}
            page={page} pageSize={pageSize}
            onPageChange={(p, s) => { setPage(p); setPageSize(s); }}
            onTableChange={capturarFiltros}
          />
        </Card>
      )}
    </div>
  );
}

function TablaSuministros({
  columns, data, loading, page, pageSize, onPageChange, onTableChange,
}: {
  columns: ColumnsType<StockItem>; data: StockItem[]; loading: boolean;
  page: number; pageSize: number; onPageChange: (p: number, s: number) => void;
  /** Captura las filas visibles tras filtros de columna (export Excel). */
  onTableChange?: (p: unknown, f: unknown, s: unknown, ext: { currentDataSource: StockItem[] }) => void;
}) {
  const { columnas, components, TableDragWrapper } = useColumnasRedimensionables<StockItem>(
    columns, "suministros-v1", { data },
  );
  return (
    <TableDragWrapper>
      <Table<StockItem>
        rowKey="material_id" size="small" columns={columnas} components={components}
        dataSource={data} loading={loading}
        pagination={paginacionEstandar({
          current: page, pageSize, total: data.length,
          onChange: onPageChange, label: "suministro(s)",
        })}
        scroll={{ x: 1200 }} sticky={STICKY_HEADER}
        onChange={onTableChange}
      />
    </TableDragWrapper>
  );
}

// ════════════════════════════════════════════════════════════
// TAB 2 — Entregar suministros
// ════════════════════════════════════════════════════════════
interface EntregaRow {
  id: number;
  material_id: number;
  material_codigo: string | null;
  material_nombre: string | null;
  unidad_medida: string | null;
  cantidad: string | number;
  persona_recibe: string | null;
  documento_referencia: string | null;
  observacion: string | null;
  usuario: string;
  fecha_movimiento: string;
}

interface TrabajadorOpt {
  trabajador_id: number;
  nombre: string;
  dni: string | null;
  area: string | null;
  puesto: string | null;
}

interface OTLookup {
  id: number;
  ot: number | null;
  descripcion: string | null;
  cliente: string | null;
}

interface MaterialDispo {
  material_id: number;
  codigo: string;
  descripcion: string;
  stock_actual: number;
  unidad_medida: string | null;
}

function TabEntregas() {
  const { message } = App.useApp();
  const { data: session } = useSession();
  const { screens } = useResponsive();
  const usuarioActual = session?.user?.name ?? session?.user?.email ?? "usuario";

  const [rows, setRows] = useState<EntregaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [trabajadores, setTrabajadores] = useState<TrabajadorOpt[]>([]);
  const [suministros, setSuministros] = useState<MaterialDispo[]>([]);
  const [otOpts, setOtOpts] = useState<OTLookup[]>([]);
  const [otSearchTimer, setOtSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  // Cargar entregas (filtramos por tipo=SALIDA en el server) + catálogos.
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [movRes, trabRes, stockRes] = await Promise.all([
        fetch("/api/movimientos?tipo=SALIDA"),
        fetch("/api/trabajadores?limit=10000&activos=true"),
        fetch("/api/stock"),
      ]);
      const movJ = await movRes.json();
      const trabJ = await trabRes.json();
      const stockJ = await stockRes.json();
      // Solo SALIDAs cuya material sea un suministro.
      const stockItems: StockItem[] = stockJ.data ?? [];
      const suministroIds = new Set(stockItems.filter(esSuministro).map((s) => s.material_id));
      const entregas: EntregaRow[] = (movJ.data ?? []).filter((m: EntregaRow) => suministroIds.has(m.material_id));
      setRows(entregas);
      setTrabajadores(trabJ.data ?? []);
      setSuministros(
        stockItems.filter(esSuministro).filter((s) => s.stock_actual > 0).map((s) => ({
          material_id: s.material_id, codigo: s.codigo, descripcion: s.descripcion,
          stock_actual: s.stock_actual, unidad_medida: s.unidad_medida,
        })),
      );
    } catch {
      message.error("Error al cargar entregas");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Búsqueda de OTs con debounce.
  const buscarOTs = useCallback((q: string) => {
    if (otSearchTimer) clearTimeout(otSearchTimer);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ordenes-trabajo/lookup?q=${encodeURIComponent(q)}&limit=50`);
        if (!res.ok) return;
        const j = await res.json();
        setOtOpts(j.data ?? []);
      } catch { /* ignore */ }
    }, 250);
    setOtSearchTimer(t);
  }, [otSearchTimer]);

  // Precarga inicial de algunas OTs (al abrir modal).
  const precargarOTs = useCallback(async () => {
    try {
      const res = await fetch("/api/ordenes-trabajo/lookup?limit=50");
      if (!res.ok) return;
      const j = await res.json();
      setOtOpts(j.data ?? []);
    } catch { /* ignore */ }
  }, []);

  const openNuevo = () => {
    form.resetFields();
    form.setFieldsValue({ cantidad: 1, fecha: dayjs() });
    precargarOTs();
    setModalOpen(true);
  };

  const handleCrear = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const trab = trabajadores.find((t) => t.trabajador_id === values.trabajador_id);
      const personaRecibe = trab ? trab.nombre : "—";
      // Si vino OT, guardamos su número (string) en documento_referencia.
      const otSel = otOpts.find((o) => o.id === values.ot_id);
      const docRef = otSel?.ot != null ? `OT ${otSel.ot}` : (values.ot_libre || null);
      const payload = {
        material_id: values.material_id,
        tipo_movimiento: "SALIDA",
        cantidad: values.cantidad,
        persona_recibe: personaRecibe,
        documento_referencia: docRef,
        observacion: values.observaciones ?? null,
        usuario: usuarioActual,
        fecha_movimiento: (values.fecha as Dayjs).format("YYYY-MM-DD"),
      };
      const res = await fetch("/api/movimientos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      message.success("Entrega registrada");
      setModalOpen(false);
      fetchData();
    } catch (err: unknown) {
      if (err instanceof Error) message.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<EntregaRow> = [
    {
      key: "fecha", title: "Fecha", dataIndex: "fecha_movimiento", width: 110,
      render: (v: string) => v ? dayjs(v).format("DD/MM/YYYY") : "—",
      sorter: (a, b) => (a.fecha_movimiento || "").localeCompare(b.fecha_movimiento || ""),
    },
    {
      key: "codigo", title: "Código", dataIndex: "material_codigo", width: 110,
      render: (v: string | null) => v ? <Text strong style={{ fontSize: 11, color: brand.navy }}>{v}</Text> : "—",
    },
    { key: "material", title: "Suministro", dataIndex: "material_nombre", ellipsis: true },
    {
      key: "cantidad", title: "Cant.", dataIndex: "cantidad", width: 80, align: "right",
      render: (v: string | number, r: EntregaRow) =>
        <span><b>{Number(v)}</b> <Text type="secondary" style={{ fontSize: 10 }}>{r.unidad_medida ?? ""}</Text></span>,
    },
    { key: "persona", title: "Entregado a", dataIndex: "persona_recibe", width: 200 },
    {
      key: "doc", title: "OT / Documento", dataIndex: "documento_referencia", width: 130,
      render: (v: string | null) => v ? <Tag color="geekblue">{v}</Tag> : <Text type="secondary">—</Text>,
    },
    { key: "obs", title: "Observaciones", dataIndex: "observacion", ellipsis: true },
    { key: "usuario", title: "Registró", dataIndex: "usuario", width: 140, ellipsis: true },
  ];

  const { columnas, components, TableDragWrapper } = useColumnasRedimensionables<EntregaRow>(
    columns, "suministros-entregas-v1", { data: rows },
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
        <Text type="secondary">
          {rows.length} entrega(s) registrada(s)
        </Text>
        <Space wrap>
          <ExportarExcelButton<EntregaRow>
            // OJO: el endpoint devuelve todas las SALIDAs (no solo suministros);
            // con el checkbox "usar filtros de la tabla" (default) se exportan
            // las entregas visibles (ya filtradas a suministros en el cliente).
            endpoint="/api/movimientos?tipo=SALIDA"
            filename="Entregas-suministros"
            sheetName="Entregas"
            currentRows={rows}
            columns={[
              { label: "Fecha", value: (r) => r.fecha_movimiento ? formatDateOnly(r.fecha_movimiento) : "" },
              { label: "Código", value: (r) => r.material_codigo ?? "" },
              { label: "Suministro", value: (r) => r.material_nombre ?? "" },
              { label: "Cant.", value: (r) => Number(r.cantidad) },
              { label: "UM", value: (r) => r.unidad_medida ?? "" },
              { label: "Entregado a", value: (r) => r.persona_recibe ?? "" },
              { label: "OT / Documento", value: (r) => r.documento_referencia ?? "" },
              { label: "Observaciones", value: (r) => r.observacion ?? "" },
              { label: "Registró", value: (r) => r.usuario },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>Actualizar</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openNuevo}>Nueva entrega</Button>
        </Space>
      </div>

      <Card>
        <TableDragWrapper>
          <Table<EntregaRow>
            rowKey="id" size="small" columns={columnas} components={components}
            dataSource={rows} loading={loading}
            pagination={paginacionEstandar({
              current: page, pageSize, total: rows.length,
              onChange: (p, s) => { setPage(p); setPageSize(s); },
              label: "entregas",
            })}
            scroll={{ x: 1100 }} sticky={STICKY_HEADER}
          />
        </TableDragWrapper>
      </Card>

      <Modal
        title="Nueva entrega de suministro"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleCrear}
        confirmLoading={saving}
        okText="Registrar entrega"
        cancelText="Cancelar"
        width={modalWidth(screens, 640)}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="material_id" label="Suministro"
            rules={[{ required: true, message: "Seleccioná un suministro" }]}
          >
            <Select
              showSearch optionFilterProp="label"
              placeholder="Buscá por código o descripción"
              options={suministros.map((s) => ({
                value: s.material_id,
                label: `${s.codigo} — ${s.descripcion} (disp: ${s.stock_actual} ${s.unidad_medida ?? ""})`,
              }))}
            />
          </Form.Item>

          <Row gutter={12}>
            <Col xs={24} sm={8}>
              <Form.Item
                name="cantidad" label="Cantidad"
                rules={[{ required: true, message: "Cantidad obligatoria" }]}
              >
                <InputNumber min={1} step={1} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={16}>
              <Form.Item
                name="trabajador_id" label="Entregado a (trabajador)"
                rules={[{ required: true, message: "Seleccioná un trabajador" }]}
              >
                <Select
                  showSearch optionFilterProp="label"
                  placeholder="Buscá por nombre, DNI, puesto o área"
                  options={trabajadores.map((t) => ({
                    value: t.trabajador_id,
                    label: `${t.nombre}${t.dni ? ` · DNI ${t.dni}` : ""}${t.area ? ` · ${t.area}` : ""}${t.puesto ? ` · ${t.puesto}` : ""}`,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="ot_id" label="OT asociada" extra="Aceptá un número de OT o buscá por cliente / descripción.">
            <Select
              showSearch allowClear
              placeholder="Buscar OT por número, cliente o descripción..."
              optionFilterProp="label"
              filterOption={false}
              onSearch={(q) => { if (q) buscarOTs(q); }}
              options={otOpts.map((o) => ({
                value: o.id,
                label: `${o.ot ?? "?"} — ${o.cliente ?? "—"} — ${o.descripcion ?? ""}`.slice(0, 90),
              }))}
              notFoundContent="Escribí para buscar"
            />
          </Form.Item>
          {/* Fallback libre — si el usuario quiere asociar a una OT que no aparece, puede escribirla manualmente. */}
          <Form.Item name="ot_libre" label="OT libre (si no está en el listado)">
            <Input placeholder="Ej: 245024 o REQ-2026-XX" maxLength={50} />
          </Form.Item>

          <Form.Item name="fecha" label="Fecha de entrega" rules={[{ required: true }]}>
            <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item name="observaciones" label="Observaciones">
            <Input.TextArea rows={2} placeholder="Notas adicionales (lote, motivo, etc.)" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
