"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Typography, Card, Table, Tag, Space, Button, Input, Empty, Row, Col, Statistic,
  Modal, Form, InputNumber, Select, App, Drawer, Popconfirm,
} from "antd";
import {
  ReloadOutlined, SearchOutlined, PlusOutlined, SwapOutlined,
  ArrowUpOutlined, ArrowDownOutlined, HistoryOutlined, InboxOutlined,
  TagsOutlined, StopOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { brand } from "@/lib/theme";
import { useResponsive, modalWidth } from "@/lib/responsive";
import {
  numeracionColumn, paginacionEstandar, PAGINATION_PAGE_SIZE,
  useColumnasOcultas, ColumnasToggleButton, visibleColumns,
  filtroPorColumna, useColumnasRedimensionables, STICKY_HEADER,
  useTablaFiltrada,
} from "@/lib/tables";
import { ExportarExcelButton } from "@/components/ExportarExcelButton";

const { Title, Text } = Typography;

interface MatRow {
  id: number;
  codigo: string;
  descripcion: string;
  unidad_medida: string;
  stock_actual: number;
  ubicacion_codigo: string | null;
  ubicacion_nombre: string | null;
  observaciones: string | null;
  movimientos_count: number;
}
interface Kpis {
  total: number; sinStock: number;
  totalEntradas: number; totalSalidas: number; totalAjustes: number; balance: number;
}
interface Movimiento {
  id: number; tipo_movimiento: string; cantidad: number | string;
  motivo: string | null; documento_referencia: string | null;
  usuario: string; fecha_movimiento: string;
}

export default function NoCatalogadosPage() {
  const { message } = App.useApp();
  const { screens } = useResponsive();
  const [rows, setRows] = useState<MatRow[]>([]);
  const [kpis, setKpis] = useState<Kpis>({ total: 0, sinStock: 0, totalEntradas: 0, totalSalidas: 0, totalAjustes: 0, balance: 0 });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGINATION_PAGE_SIZE);
  const { ocultas, setOcultas } = useColumnasOcultas("no-catalogados-cols-v1");
  const [ubicaciones, setUbicaciones] = useState<{ codigo: string; nombre: string }[]>([]);

  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [formNuevo] = Form.useForm();
  const [savingNuevo, setSavingNuevo] = useState(false);

  const [movOpen, setMovOpen] = useState<MatRow | null>(null);
  const [formMov] = Form.useForm();
  const [savingMov, setSavingMov] = useState(false);

  const [histOpen, setHistOpen] = useState<MatRow | null>(null);
  const [histData, setHistData] = useState<Movimiento[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  const [catOpen, setCatOpen] = useState<MatRow | null>(null);
  const [formCat] = Form.useForm();
  const [savingCat, setSavingCat] = useState(false);
  const [cat, setCat] = useState<{
    planta: { codigo: string; nombre: string }[];
    area: { codigo: string; nombre: string }[];
    categoria: { codigo: string; nombre: string }[];
    clasificacion: { codigo: string; nombre: string }[];
    unidadMedida: { codigo: string; nombre: string }[];
    moneda: { codigo: string; nombre: string }[];
  }>({ planta: [], area: [], categoria: [], clasificacion: [], unidadMedida: [], moneda: [] });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/no-catalogados");
      if (res.ok) {
        const j = await res.json();
        setRows(j.data ?? []);
        setKpis(j.kpis ?? kpis);
      }
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    fetch("/api/almacenes").then((r) => r.ok ? r.json() : { data: [] })
      .then((j) => setUbicaciones((j.data ?? []).map((u: { codigo: string; nombre: string }) => ({ codigo: u.codigo, nombre: u.nombre }))))
      .catch(() => { /* ignore */ });
    const tablas: (keyof typeof cat)[] = ["planta", "area", "categoria", "clasificacion", "unidadMedida", "moneda"];
    Promise.all(tablas.map((t) =>
      fetch(`/api/catalogos?tabla=${t}`).then((r) => r.ok ? r.json() : { data: [] }).then((j) => [t, j.data ?? []] as const).catch(() => [t, []] as const),
    )).then((res) => {
      const next = { ...cat };
      for (const [t, data] of res) {
        (next as Record<string, { codigo: string; nombre: string }[]>)[t] = (data as { codigo: string; nombre: string }[]).map((x) => ({ codigo: x.codigo, nombre: x.nombre }));
      }
      setCat(next);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const catalogar = async () => {
    if (!catOpen) return;
    try {
      const v = await formCat.validateFields();
      setSavingCat(true);
      const res = await fetch(`/api/no-catalogados/${catOpen.id}/catalogar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...v, usuario: "Logistica" }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Error");
      message.success(j.message || "Material catalogado");
      setCatOpen(null); formCat.resetFields();
      fetchData();
    } catch (e) {
      if (e instanceof Error) message.error(e.message);
    } finally { setSavingCat(false); }
  };

  const filtradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.codigo.toLowerCase().includes(q) ||
      r.descripcion.toLowerCase().includes(q));
  }, [rows, search]);

  // Filas visibles después de búsqueda + filtros de columna de AntD — para
  // que el export respete exactamente lo que el usuario ve.
  const { filtradas: filasExport, onChange: onTablaChange } = useTablaFiltrada(filtradas);

  const crearMaterial = async () => {
    try {
      const v = await formNuevo.validateFields();
      setSavingNuevo(true);
      const res = await fetch("/api/no-catalogados", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...v, usuario: "Almacenero" }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Error");
      message.success("Material no catalogado creado");
      setNuevoOpen(false); formNuevo.resetFields();
      fetchData();
    } catch (e) {
      if (e instanceof Error) message.error(e.message);
    } finally { setSavingNuevo(false); }
  };

  const registrarMov = async () => {
    if (!movOpen) return;
    try {
      const v = await formMov.validateFields();
      setSavingMov(true);
      const res = await fetch(`/api/no-catalogados/${movOpen.id}/movimiento`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...v, usuario: "Almacenero" }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Error");
      message.success("Movimiento registrado");
      setMovOpen(null); formMov.resetFields();
      fetchData();
    } catch (e) {
      if (e instanceof Error) message.error(e.message);
    } finally { setSavingMov(false); }
  };

  const verHistorial = async (r: MatRow) => {
    setHistOpen(r); setHistLoading(true); setHistData([]);
    try {
      const res = await fetch(`/api/no-catalogados/${r.id}/movimiento`);
      if (res.ok) { const j = await res.json(); setHistData(j.data ?? []); }
    } finally { setHistLoading(false); }
  };

  const columns: ColumnsType<MatRow> = [
    numeracionColumn<MatRow>({ current: page, pageSize }),
    {
      key: "codigo", title: "Código", dataIndex: "codigo", width: 130, align: "left",
      sorter: (a, b) => a.codigo.localeCompare(b.codigo),
      ...filtroPorColumna(filtradas, "codigo"),
      render: (v: string) => <Text strong style={{ color: brand.navy }}>{v}</Text>,
    },
    {
      key: "descripcion", title: "Descripción", dataIndex: "descripcion", align: "left", ellipsis: true,
      sorter: (a, b) => a.descripcion.localeCompare(b.descripcion),
      ...filtroPorColumna(filtradas, "descripcion"),
    },
    {
      key: "unidad_medida", title: "UM", dataIndex: "unidad_medida", width: 90, align: "center",
      ...filtroPorColumna(filtradas, "unidad_medida"),
    },
    {
      key: "stock_actual", title: "Stock", dataIndex: "stock_actual", width: 100, align: "right",
      sorter: (a, b) => a.stock_actual - b.stock_actual,
      render: (v: number) => <Tag color={v <= 0 ? "red" : "green"}>{v.toLocaleString("es-PE")}</Tag>,
    },
    {
      key: "ubicacion_nombre", title: "Ubicación", dataIndex: "ubicacion_nombre", width: 160, align: "left",
      ...filtroPorColumna(filtradas, "ubicacion_nombre"),
      render: (v: string | null) => v ? <Tag color="purple">{v}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      key: "acciones", title: "Acciones", width: 290, align: "center", fixed: "right",
      render: (_v, r) => (
        <Space size={4}>
          <Button size="small" icon={<SwapOutlined />} onClick={() => { setMovOpen(r); formMov.resetFields(); }}>
            Movimiento
          </Button>
          <Button size="small" type="primary" icon={<TagsOutlined />} onClick={() => { setCatOpen(r); formCat.resetFields(); }}>
            Catalogar
          </Button>
          <Button size="small" type="text" icon={<HistoryOutlined />} title="Historial" onClick={() => verHistorial(r)} />
          <Popconfirm
            title="¿Dar de baja este material?"
            description="Se ocultará de la lista (baja lógica). Sus movimientos se conservan."
            okType="danger" okText="Dar de baja"
            onConfirm={async () => {
              try {
                const res = await fetch(`/api/no-catalogados/${r.id}`, { method: "DELETE" });
                const j = await res.json();
                if (!res.ok) throw new Error(j.error || "Error");
                message.success(j.message || "Dado de baja");
                fetchData();
              } catch (e) {
                if (e instanceof Error) message.error(e.message);
              }
            }}
          >
            <Button size="small" type="text" danger icon={<StopOutlined />} title="Dar de baja" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const { columnas: columnsResizable, components: tableComponents } =
    useColumnasRedimensionables<MatRow>(columns, "no-catalogados-cols-widths-v1");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <Title level={4} style={{ margin: 0, color: brand.navy }}>
          <InboxOutlined style={{ marginRight: 8 }} />
          Inventario — Materiales no catalogados
        </Title>
        <Space wrap>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setNuevoOpen(true); formNuevo.resetFields(); }}>
            Nuevo material
          </Button>
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>Refrescar</Button>
        </Space>
      </div>
      <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
        Registro manual de materiales que NO están en el catálogo, con control de stock (entradas / salidas / ajustes).
      </Text>

      <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: 10 } }}>
        <Space wrap>
          <Input placeholder="Buscar código o descripción…" prefix={<SearchOutlined />} allowClear value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 320, maxWidth: "100%" }} />
          <ColumnasToggleButton<MatRow> columns={columns} ocultas={ocultas} setOcultas={setOcultas} obligatorias={["codigo", "stock_actual", "acciones"]} />
          <ExportarExcelButton<MatRow>
            endpoint="/api/no-catalogados"
            // El endpoint no pagina (devuelve todo de una): limit alto para
            // que el fetch corte en la primera página.
            limit={50000}
            filename="MaterialesNoCatalogados"
            sheetName="No catalogados"
            currentRows={filasExport}
            tablaLayout={{ ocultas }}
            columns={[
              { key: "codigo", label: "Código", value: (r) => r.codigo },
              { key: "descripcion", label: "Descripción", value: (r) => r.descripcion },
              { key: "unidad_medida", label: "UM", value: (r) => r.unidad_medida },
              { key: "stock_actual", label: "Stock", value: (r) => r.stock_actual },
              { key: "ubicacion_nombre", label: "Ubicación", value: (r) => r.ubicacion_nombre ?? "" },
              { key: "observaciones", label: "Observaciones", value: (r) => r.observaciones ?? "" },
              { key: "movimientos_count", label: "Movimientos", value: (r) => r.movimientos_count },
            ]}
          />
        </Space>
      </Card>

      {filtradas.length === 0 && !loading ? (
        <Empty description="Aún no hay materiales no catalogados. Agregá uno con 'Nuevo material'." />
      ) : (
        <Table<MatRow>
          rowKey="id" size="small"
          columns={visibleColumns(columnsResizable, ocultas)}
          components={tableComponents}
          dataSource={filtradas}
          loading={loading}
          sticky={STICKY_HEADER}
          scroll={{ x: "max-content" }}
          onChange={onTablaChange}
          pagination={paginacionEstandar({ current: page, pageSize, total: filtradas.length, onChange: (p, s) => { setPage(p); setPageSize(s); }, label: "materiales" })}
        />
      )}

      {/* Modal nuevo material */}
      <Modal
        title="Nuevo material no catalogado"
        open={nuevoOpen}
        onCancel={() => setNuevoOpen(false)}
        onOk={crearMaterial}
        confirmLoading={savingNuevo}
        okText="Crear"
        width={modalWidth(screens, 520)}
      >
        <Form form={formNuevo} layout="vertical">
          <Form.Item name="codigo" label="Código" rules={[{ required: true, max: 50 }]}>
            <Input placeholder="Ej. NC-001" />
          </Form.Item>
          <Form.Item name="descripcion" label="Descripción" rules={[{ required: true, max: 300 }]}>
            <Input placeholder="Descripción del material" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="unidad_medida" label="Unidad de medida" initialValue="UNIDAD">
                <Input placeholder="UNIDAD" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="stock_inicial" label="Stock inicial">
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="ubicacion_codigo" label="Ubicación">
            <Select allowClear showSearch optionFilterProp="label" placeholder="Opcional"
              options={ubicaciones.map((u) => ({ value: u.codigo, label: `${u.codigo} — ${u.nombre}` }))} />
          </Form.Item>
          <Form.Item name="observaciones" label="Observaciones">
            <Input.TextArea rows={2} maxLength={300} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal movimiento */}
      <Modal
        title={movOpen ? `Movimiento — ${movOpen.codigo} (stock: ${movOpen.stock_actual})` : ""}
        open={!!movOpen}
        onCancel={() => setMovOpen(null)}
        onOk={registrarMov}
        confirmLoading={savingMov}
        okText="Registrar"
        width={modalWidth(screens, 520)}
      >
        <Form form={formMov} layout="vertical">
          <Form.Item name="tipo_movimiento" label="Tipo" rules={[{ required: true }]} initialValue="ENTRADA">
            <Select showSearch optionFilterProp="label" options={[
              { value: "ENTRADA", label: "ENTRADA (sumar al stock)" },
              { value: "SALIDA", label: "SALIDA (restar del stock)" },
              { value: "AJUSTE", label: "AJUSTE (fijar stock absoluto)" },
            ]} />
          </Form.Item>
          <Form.Item name="cantidad" label="Cantidad" rules={[{ required: true }]}>
            <InputNumber min={0.01} step={1} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="motivo" label="Motivo">
            <Input placeholder="Ej. Compra directa, consumo en OT, conteo físico…" maxLength={300} />
          </Form.Item>
          <Form.Item name="documento_referencia" label="Documento de referencia">
            <Input placeholder="Ej. Factura F001-123, OT-2026-0014…" maxLength={100} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal catalogar */}
      <Modal
        title={catOpen ? `Catalogar — ${catOpen.codigo} (${catOpen.descripcion})` : ""}
        open={!!catOpen}
        onCancel={() => setCatOpen(null)}
        onOk={catalogar}
        confirmLoading={savingCat}
        okText="Catalogar"
        width={modalWidth(screens, 620)}
      >
        <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
          Se creará un material del catálogo con un código nuevo. El stock actual ({catOpen?.stock_actual ?? 0}) se transfiere como ENTRADA y este registro no catalogado se desactiva.
        </Text>
        <Form form={formCat} layout="vertical">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="planta_codigo" label="Planta" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="label" options={cat.planta.map((x) => ({ value: x.codigo, label: `${x.codigo} — ${x.nombre}` }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="area_codigo" label="Área" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="label" options={cat.area.map((x) => ({ value: x.codigo, label: `${x.codigo} — ${x.nombre}` }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="categoria_codigo" label="Categoría" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="label" options={cat.categoria.map((x) => ({ value: x.codigo, label: `${x.codigo} — ${x.nombre}` }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="clasificacion_codigo" label="Clasificación" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="label" options={cat.clasificacion.map((x) => ({ value: x.codigo, label: `${x.codigo} — ${x.nombre}` }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="unidad_medida_codigo" label="Unidad de medida" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="label" options={cat.unidadMedida.map((x) => ({ value: x.codigo, label: `${x.codigo} — ${x.nombre}` }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="moneda_codigo" label="Moneda">
                <Select allowClear showSearch optionFilterProp="label" options={cat.moneda.map((x) => ({ value: x.codigo, label: `${x.codigo} — ${x.nombre}` }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="precio" label="Precio referencia">
                <InputNumber min={0} step={0.01} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="punto_reposicion" label="Pto. reposición">
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="stock_maximo" label="Stock máximo">
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="np" label="N/P (número de parte)">
                <Input maxLength={100} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Drawer historial */}
      <Drawer
        title={histOpen ? `Historial — ${histOpen.codigo}` : ""}
        open={!!histOpen}
        onClose={() => setHistOpen(null)}
        width={screens.md ? 520 : "100%"}
      >
        {histLoading ? (
          <div style={{ textAlign: "center", padding: 20, color: brand.textSecondary }}>Cargando…</div>
        ) : histData.length === 0 ? (
          <Empty description="Sin movimientos." />
        ) : (
          <Table<Movimiento>
            rowKey="id" size="small" pagination={false}
            scroll={{ x: 500 }}
            dataSource={histData}
            columns={[
              { key: "fecha", title: "Fecha", dataIndex: "fecha_movimiento", render: (v: string) => dayjs(v).format("DD/MM/YY HH:mm") },
              { key: "tipo", title: "Tipo", dataIndex: "tipo_movimiento", render: (v: string) => <Tag color={v === "ENTRADA" ? "green" : v === "SALIDA" ? "red" : "purple"}>{v}</Tag> },
              { key: "cant", title: "Cant.", dataIndex: "cantidad", align: "right", render: (v: number | string) => Number(v).toLocaleString("es-PE") },
              { key: "motivo", title: "Motivo", dataIndex: "motivo", render: (v: string | null) => v ?? "—" },
              { key: "usuario", title: "Usuario", dataIndex: "usuario" },
            ]}
          />
        )}
      </Drawer>
    </div>
  );
}
