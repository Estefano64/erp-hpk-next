"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  Typography,
  Table,
  Button,
  Input,
  Select,
  Space,
  Tag,
  Modal,
  Form,
  InputNumber,
  message,
  Popconfirm,
  Row,
  Col,
  Card,
  Drawer,
  Descriptions,
  Statistic,
  Empty,
} from "antd";
import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  StopOutlined,
  ReloadOutlined,
  ImportOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { ColumnsType } from "antd/es/table";
import { brand } from "@/lib/theme";
import { useResponsive, modalWidth } from "@/lib/responsive";
import {
  numeracionColumn,
  paginacionEstandar,
  PAGINATION_PAGE_SIZE,
  useColumnasOcultas,
  ColumnasToggleButton,
  visibleColumns,
  filtroPorColumna,
  useColumnasRedimensionables,
  usePersistedState,
} from "@/lib/tables";
import { ImportarExcelModal } from "@/components/ImportarExcelModal";
import { EmptyState } from "@/components/EmptyState";
import { EditableCell, EditableSelectCell } from "@/components/EditableCell";
import { ExportarExcelButton } from "@/components/ExportarExcelButton";

const { Title } = Typography;

interface MaterialRecord {
  material_id: number;
  codigo: string;
  descripcion: string;
  planta_codigo: string;
  area_codigo: string;
  categoria_codigo: string;
  clasificacion_codigo: string;
  punto_reposicion: number | null;
  stock_maximo: number | null;
  unidad_medida_codigo: string;
  plazo_entrega: number | null;
  precio: number | null;
  moneda_codigo: string | null;
  fabricante_codigo: string | null;
  np: string | null;
  modelo: string | null;
  caja: string | null;
  stock_actual: number | null;
  ubicacion: string | null;
  planta: { nombre: string };
  area: { nombre: string };
  categoria: { nombre: string };
  clasificacion: { nombre: string };
  unidad_medida: { nombre: string; abreviatura?: string };
  moneda: { simbolo: string } | null;
  fabricante: { nombre: string } | null;
}

interface Option {
  codigo: string;
  nombre: string;
}

interface HistoricoRow {
  key: string;
  proveedor_id: number;
  proveedor_razon_social: string;
  precio_unitario: number;
  moneda: string | null;
  cantidad: number;
  fecha: string | null;
  numero_po: string;
}

export default function MaterialesPage() {
  const { data: session } = useSession();
  const isAdminUser = ((session?.user as { roles?: string[] } | undefined)?.roles ?? []).includes("admin");
  const [data, setData] = useState<MaterialRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGINATION_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  // Filtros persistidos por usuario.
  const [search, setSearch] = usePersistedState<string>("mat-list-search", "");
  const [filterPlanta, setFilterPlanta] = usePersistedState<string>("mat-list-planta", "");
  const [filterArea, setFilterArea] = usePersistedState<string>("mat-list-area", "");
  const [filterCategoria, setFilterCategoria] = usePersistedState<string>("mat-list-categoria", "");
  const [filterClasificacion, setFilterClasificacion] = usePersistedState<string>("mat-list-clasificacion", "");
  const [filterFab, setFilterFab] = usePersistedState<string>("mat-list-fab", "");
  const { ocultas, setOcultas } = useColumnasOcultas("materiales-list-cols-v2", [
    "stock_actual", "stock_maximo", "punto_reposicion", "ubicacion", "caja", "modelo", "plazo_entrega",
  ]);
  const [detalle, setDetalle] = useState<MaterialRecord | null>(null);
  const [historicoMaterial, setHistoricoMaterial] = useState<HistoricoRow[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  // Opciones para selects
  const [plantas, setPlantas] = useState<Option[]>([]);
  const [areas, setAreas] = useState<Option[]>([]);
  const [categorias, setCategorias] = useState<Option[]>([]);
  const [clasificaciones, setClasificaciones] = useState<Option[]>([]);
  const [unidades, setUnidades] = useState<Option[]>([]);
  const [monedas, setMonedas] = useState<Option[]>([]);
  const [fabricantes, setFabricantes] = useState<Option[]>([]);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MaterialRecord | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const [messageApi, contextHolder] = message.useMessage();
  const { screens } = useResponsive();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(pageSize),
      // Esta tabla muestra SOLO catalogados formales (código numérico).
      // Excluye entries auto-creados desde flujos como ingreso de OCs
      // abiertas (ej. "BC-PB8931") — esos se ven en /stock/no-catalogados.
      solo_catalogados: "true",
    });
    if (search) params.set("search", search);
    if (filterPlanta) params.set("planta", filterPlanta);
    if (filterArea) params.set("area", filterArea);
    if (filterCategoria) params.set("categoria", filterCategoria);
    if (filterClasificacion) params.set("clasificacion", filterClasificacion);
    if (filterFab) params.set("fabricante", filterFab);

    const res = await fetch(`/api/materiales?${params}`);
    const json = await res.json();
    setData(json.data ?? []);
    setTotal(json.total ?? 0);
    setLoading(false);
  }, [page, pageSize, search, filterPlanta, filterArea, filterCategoria, filterClasificacion, filterFab]);

  useEffect(() => {
    async function loadOptions() {
      const endpoints = [
        { url: "/api/catalogos?tabla=planta", setter: setPlantas },
        { url: "/api/catalogos?tabla=area", setter: setAreas },
        { url: "/api/catalogos?tabla=categoria", setter: setCategorias },
        { url: "/api/catalogos?tabla=clasificacion", setter: setClasificaciones },
        { url: "/api/catalogos?tabla=unidadMedida", setter: setUnidades },
        { url: "/api/catalogos?tabla=moneda", setter: setMonedas },
        { url: "/api/catalogos?tabla=fabricante", setter: setFabricantes },
      ];
      await Promise.all(
        endpoints.map(async ({ url, setter }) => {
          const res = await fetch(url);
          if (res.ok) {
            const json = await res.json();
            setter(json.data ?? []);
          }
        })
      );
    }
    loadOptions();
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function openCreate() {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  }

  async function openDetalle(record: MaterialRecord) {
    setDetalle(record);
    setHistoricoMaterial([]);
    setLoadingHistorico(true);
    try {
      const res = await fetch("/api/compras/historico");
      if (res.ok) {
        const json = await res.json();
        const filas = (json.data ?? []).filter((r: { material_id: number }) => r.material_id === record.material_id);
        setHistoricoMaterial(filas);
      }
    } finally {
      setLoadingHistorico(false);
    }
  }

  function openEdit(record: MaterialRecord) {
    setEditing(record);
    form.setFieldsValue({
      descripcion: record.descripcion,
      planta_codigo: record.planta_codigo,
      area_codigo: record.area_codigo,
      categoria_codigo: record.categoria_codigo,
      clasificacion_codigo: record.clasificacion_codigo,
      unidad_medida_codigo: record.unidad_medida_codigo,
      plazo_entrega: record.plazo_entrega,
      precio: record.precio ? Number(record.precio) : null,
      moneda_codigo: record.moneda_codigo,
      fabricante_codigo: record.fabricante_codigo,
      np: record.np,
      punto_reposicion: record.punto_reposicion ? Number(record.punto_reposicion) : null,
      stock_maximo: record.stock_maximo ? Number(record.stock_maximo) : null,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const url = editing
        ? `/api/materiales/${editing.material_id}`
        : "/api/materiales";
      const method = editing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!res.ok) throw new Error();

      messageApi.success(editing ? "Actualizado correctamente" : "Creado correctamente");
      setModalOpen(false);
      fetchData();
    } catch {
      messageApi.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDesactivar(id: number) {
    const res = await fetch(`/api/materiales/${id}`, { method: "DELETE" });
    if (res.ok) {
      messageApi.success("Material desactivado");
      fetchData();
      return;
    }
    const body = await res.json().catch(() => null);
    messageApi.error(body?.detail ?? body?.error ?? "Error al desactivar");
  }

  async function handleEliminarPermanente(id: number) {
    const res = await fetch(`/api/materiales/${id}?force=true`, { method: "DELETE" });
    if (res.ok) {
      messageApi.success("Material eliminado permanentemente");
      fetchData();
      return;
    }
    const body = await res.json().catch(() => null);
    messageApi.error(body?.detail ?? body?.error ?? "Error al eliminar");
  }

  // Update parcial usado por las celdas inline
  async function patchMaterial(id: number, patch: Record<string, unknown>) {
    const res = await fetch(`/api/materiales/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      messageApi.error(body?.error ?? "Error al actualizar");
      throw new Error(body?.error ?? "patch error");
    }
    messageApi.success("Actualizado");
    fetchData();
  }

  const columns: ColumnsType<MaterialRecord> = [
    numeracionColumn<MaterialRecord>({ current: page, pageSize }),
    {
      key: "codigo",
      title: "Código",
      dataIndex: "codigo",
      width: 110,
      sorter: (a, b) => a.codigo.localeCompare(b.codigo),
      ...filtroPorColumna(data, "codigo"),
      render: (v: string) => <Tag color={brand.navy}>{v}</Tag>,
    },
    {
      key: "descripcion",
      title: "Descripción",
      dataIndex: "descripcion",
      width: 280,
      ellipsis: true,
      sorter: (a: MaterialRecord, b: MaterialRecord) => a.descripcion.localeCompare(b.descripcion),
      ...filtroPorColumna(data, "descripcion"),
    },
    {
      key: "planta_codigo",
      title: "Planta",
      dataIndex: "planta_codigo",
      width: 110,
      sorter: (a, b) => (a.planta_codigo ?? "").localeCompare(b.planta_codigo ?? ""),
      ...filtroPorColumna(data, "planta_codigo"),
      render: (v: string, r: MaterialRecord) => (
        <span title={r.planta?.nombre ?? ""}>{v ?? "-"}</span>
      ),
    },
    {
      key: "area_codigo",
      title: "Área",
      dataIndex: "area_codigo",
      width: 100,
      sorter: (a, b) => (a.area?.nombre ?? "").localeCompare(b.area?.nombre ?? ""),
      ...filtroPorColumna(data, "area_codigo"),
      render: (_: string, r: MaterialRecord) => r.area?.nombre ?? r.area_codigo,
    },
    {
      key: "categoria_codigo",
      title: "Categoría",
      dataIndex: "categoria_codigo",
      width: 140,
      sorter: (a, b) => (a.categoria?.nombre ?? "").localeCompare(b.categoria?.nombre ?? ""),
      ...filtroPorColumna(data, "categoria_codigo"),
      render: (_: string, r: MaterialRecord) => r.categoria?.nombre ?? r.categoria_codigo,
    },
    {
      key: "clasificacion_codigo",
      title: "Clasificación",
      dataIndex: "clasificacion_codigo",
      width: 170,
      sorter: (a, b) => (a.clasificacion?.nombre ?? "").localeCompare(b.clasificacion?.nombre ?? ""),
      ...filtroPorColumna(data, "clasificacion_codigo"),
      render: (_: string, r: MaterialRecord) => r.clasificacion?.nombre ?? r.clasificacion_codigo,
    },
    {
      key: "unidad_medida_codigo",
      title: "Und. Med.",
      dataIndex: "unidad_medida_codigo",
      width: 110,
      ...filtroPorColumna(data, "unidad_medida_codigo"),
      render: (_: string, r: MaterialRecord) =>
        r.unidad_medida?.abreviatura ?? r.unidad_medida?.nombre ?? r.unidad_medida_codigo,
    },
    {
      key: "fabricante_codigo",
      title: "Fabricante",
      dataIndex: "fabricante_codigo",
      width: 140,
      sorter: (a, b) => (a.fabricante?.nombre ?? "").localeCompare(b.fabricante?.nombre ?? ""),
      ...filtroPorColumna(data, "fabricante_codigo"),
      render: (v: string | null, r: MaterialRecord) => (
        <EditableSelectCell
          value={v}
          options={fabricantes.map((f) => ({ value: f.codigo, label: f.nombre }))}
          onSave={(next) => patchMaterial(r.material_id, { fabricante_codigo: next })}
          disabled={!isAdminUser}
        />
      ),
    },
    {
      key: "np",
      title: "NP",
      dataIndex: "np",
      width: 140,
      ellipsis: true,
      sorter: (a: MaterialRecord, b: MaterialRecord) => (a.np ?? "").localeCompare(b.np ?? ""),
      ...filtroPorColumna(data, "np"),
      render: (v: string | null, r: MaterialRecord) => (
        <EditableCell
          value={v} type="string"
          onSave={(next) => patchMaterial(r.material_id, { np: next })}
          disabled={!isAdminUser}
        />
      ),
    },
    {
      key: "precio",
      title: "Precio",
      dataIndex: "precio",
      width: 130,
      align: "right",
      sorter: (a, b) => (Number(a.precio) || 0) - (Number(b.precio) || 0),
      render: (v: number | null, r: MaterialRecord) => {
        const sym = r.moneda?.simbolo ?? "$";
        const display = v != null
          ? <span>{sym} {Number(v).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
          : undefined;
        return (
          <EditableCell
            value={v ?? null} type="number"
            display={display}
            onSave={(next) => patchMaterial(r.material_id, { precio: next })}
            disabled={!isAdminUser}
          />
        );
      },
    },
    // ── Columnas opcionales (ocultas por default) ──
    {
      key: "stock_actual", title: "Stock", dataIndex: "stock_actual", width: 90, align: "right",
      sorter: (a, b) => (a.stock_actual ?? 0) - (b.stock_actual ?? 0),
      render: (v: number | null) => v != null ? Number(v).toLocaleString() : "-",
    },
    {
      key: "stock_maximo", title: "Stock máx.", dataIndex: "stock_maximo", width: 100, align: "right",
      sorter: (a, b) => (a.stock_maximo ?? 0) - (b.stock_maximo ?? 0),
      render: (v: number | null) => v != null ? Number(v).toLocaleString() : "-",
    },
    {
      key: "punto_reposicion", title: "Punto reposición", dataIndex: "punto_reposicion", width: 130, align: "right",
      sorter: (a, b) => (a.punto_reposicion ?? 0) - (b.punto_reposicion ?? 0),
      render: (v: number | null) => v != null ? Number(v).toLocaleString() : "-",
    },
    {
      key: "ubicacion", title: "Ubicación", dataIndex: "ubicacion", width: 120,
      ...filtroPorColumna(data, "ubicacion"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "caja", title: "Caja", dataIndex: "caja", width: 100,
      ...filtroPorColumna(data, "caja"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "modelo", title: "Modelo", dataIndex: "modelo", width: 120,
      ...filtroPorColumna(data, "modelo"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "plazo_entrega", title: "Plazo entrega (días)", dataIndex: "plazo_entrega", width: 130, align: "right",
      sorter: (a, b) => (a.plazo_entrega ?? 0) - (b.plazo_entrega ?? 0),
      render: (v: number | null) => v != null ? `${v} d` : "-",
    },
    {
      key: "acciones",
      title: "Acciones",
      width: 130,
      align: "center",
      render: (_: unknown, record: MaterialRecord) => (
        <Space size="small">
          <Button type="text" icon={<EyeOutlined />} title="Ver detalle" onClick={() => openDetalle(record)} />
          <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm
            title="¿Desactivar este material?"
            description="Se ocultará de las listas pero se conservará en la base de datos."
            onConfirm={() => handleDesactivar(record.material_id)}
          >
            <Button type="text" icon={<StopOutlined />} title="Desactivar" />
          </Popconfirm>
          {isAdminUser && (
            <Popconfirm
              title="¿Eliminar permanentemente?"
              description="Esta acción no se puede deshacer."
              okType="danger"
              okText="Eliminar"
              onConfirm={() => handleEliminarPermanente(record.material_id)}
            >
              <Button type="text" danger icon={<DeleteOutlined />} title="Eliminar permanentemente" />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const { columnas: columnsResizable, components: tableComponents, resetAnchos, TableDragWrapper } =
    useColumnasRedimensionables<MaterialRecord>(columns, "materiales-list-cols-widths-v1", { data });

  return (
    <div>
      {contextHolder}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          Materiales
        </Title>
        <Space>
          <ColumnasToggleButton<MaterialRecord>
            columns={columns}
            ocultas={ocultas}
            setOcultas={setOcultas}
            obligatorias={["__num", "codigo", "acciones"]}
          />
          <Button onClick={resetAnchos} title="Restablecer anchos de columna al diseño original">
            Restablecer anchos
          </Button>
          <ExportarExcelButton<MaterialRecord>
            endpoint="/api/materiales"
            filename="Materiales"
            // Respeta los filtros server-side activos en la tabla cuando el
            // usuario marca "Usar filtros actuales de la tabla" en el modal.
            endpointParams={{
              search,
              planta: filterPlanta,
              area: filterArea,
              categoria: filterCategoria,
              clasificacion: filterClasificacion,
              fabricante: filterFab,
            }}
            categoryFilters={[
              {
                key: "categoria",
                label: "Categoría",
                options: categorias.map((c) => ({ value: c.codigo, label: c.nombre })),
                predicate: (r, sel) => sel.includes(r.categoria_codigo ?? ""),
              },
              {
                key: "clasificacion",
                label: "Clasificación",
                options: clasificaciones.map((c) => ({ value: c.codigo, label: c.nombre })),
                predicate: (r, sel) => sel.includes(r.clasificacion_codigo ?? ""),
              },
              {
                key: "fabricante",
                label: "Fabricante",
                options: fabricantes.map((f) => ({ value: f.codigo, label: f.nombre })),
                predicate: (r, sel) => sel.includes(r.fabricante_codigo ?? ""),
              },
              {
                key: "planta",
                label: "Planta",
                options: plantas.map((p) => ({ value: p.codigo, label: p.nombre })),
                predicate: (r, sel) => sel.includes(r.planta_codigo ?? ""),
              },
              {
                key: "area",
                label: "Área",
                options: areas.map((a) => ({ value: a.codigo, label: a.nombre })),
                predicate: (r, sel) => sel.includes(r.area_codigo ?? ""),
              },
            ]}
            columns={[
              { label: "Código", value: (r) => r.codigo },
              { label: "Descripción", value: (r) => r.descripcion },
              { label: "Planta", value: (r) => r.planta_codigo },
              { label: "Área", value: (r) => r.area_codigo },
              { label: "Categoría", value: (r) => r.categoria_codigo },
              { label: "Clasificación", value: (r) => r.clasificacion_codigo },
              { label: "Unidad medida", value: (r) => r.unidad_medida_codigo },
              { label: "Precio", value: (r) => r.precio != null ? Number(r.precio) : "" },
              { label: "Moneda", value: (r) => r.moneda_codigo ?? "" },
              { label: "Fabricante", value: (r) => r.fabricante_codigo ?? "" },
              { label: "Nº Parte", value: (r) => r.np ?? "" },
              { label: "Modelo", value: (r) => r.modelo ?? "" },
              { label: "Punto reposición", value: (r) => r.punto_reposicion != null ? Number(r.punto_reposicion) : "" },
              { label: "Stock máximo", value: (r) => r.stock_maximo != null ? Number(r.stock_maximo) : "" },
              { label: "Stock actual", value: (r) => r.stock_actual != null ? Number(r.stock_actual) : "" },
              { label: "Plazo entrega (días)", value: (r) => r.plazo_entrega ?? "" },
              { label: "Ubicación", value: (r) => r.ubicacion ?? "" },
            ]}
          />
          {isAdminUser && (
            <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>
              Importar Excel
            </Button>
          )}
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Nuevo
          </Button>
        </Space>
      </div>

      <ImportarExcelModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={() => fetchData()}
        title="Importar materiales desde Excel"
        endpoint="/api/materiales/bulk"
        fields={[
          { key: "codigo", label: "Código", required: true },
          { key: "descripcion", label: "Descripción", required: true, aliases: ["nombre"] },
          { key: "planta_codigo", label: "Planta", required: true, aliases: ["planta"] },
          { key: "area_codigo", label: "Área", required: true, aliases: ["area"] },
          { key: "categoria_codigo", label: "Categoría", required: true, aliases: ["categoria"] },
          { key: "clasificacion_codigo", label: "Clasificación", required: true, aliases: ["clasificacion"] },
          { key: "unidad_medida_codigo", label: "Unidad medida", required: true, aliases: ["um", "unidad"] },
          { key: "precio", label: "Precio", type: "number" },
          { key: "moneda_codigo", label: "Moneda", aliases: ["moneda"] },
          { key: "fabricante_codigo", label: "Fabricante", aliases: ["fabricante"] },
          { key: "np", label: "Nº Parte", aliases: ["numero_parte", "np"] },
          { key: "modelo", label: "Modelo" },
          { key: "punto_reposicion", label: "Punto reposición", type: "number" },
          { key: "stock_maximo", label: "Stock máximo", type: "number" },
          { key: "plazo_entrega", label: "Plazo entrega (días)", type: "number" },
          { key: "ubicacion", label: "Ubicación física" },
        ]}
        templateRows={[
          ["MAT001", "Sello hidráulico 100mm", "P01", "MEC", "REP", "STK", "UN", 25.50, "USD", "PARKER", "P-100-S", "MOD-A", 5, 50, 14, "A1-B2"],
        ]}
      />

      <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} md={6}>
            <Input
              placeholder="Buscar por código, descripción o NP..."
              prefix={<SearchOutlined />}
              allowClear
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Select showSearch optionFilterProp="label"
              placeholder="Planta"
              allowClear
              style={{ width: "100%" }}
              value={filterPlanta || undefined}
              onChange={(v) => { setFilterPlanta(v ?? ""); setPage(1); }}
              options={plantas.map((p) => ({ value: p.codigo, label: p.nombre }))}
            />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Select showSearch optionFilterProp="label"
              placeholder="Área"
              allowClear
              style={{ width: "100%" }}
              value={filterArea || undefined}
              onChange={(v) => { setFilterArea(v ?? ""); setPage(1); }}
              options={areas.map((a) => ({ value: a.codigo, label: a.nombre }))}
            />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Select showSearch optionFilterProp="label"
              placeholder="Categoría"
              allowClear
              style={{ width: "100%" }}
              value={filterCategoria || undefined}
              onChange={(v) => { setFilterCategoria(v ?? ""); setPage(1); }}
              options={categorias.map((c) => ({ value: c.codigo, label: c.nombre }))}
            />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Select showSearch optionFilterProp="label"
              placeholder="Clasificación"
              allowClear
              style={{ width: "100%" }}
              value={filterClasificacion || undefined}
              onChange={(v) => { setFilterClasificacion(v ?? ""); setPage(1); }}
              options={clasificaciones.map((c) => ({ value: c.codigo, label: c.nombre }))}
            />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Select showSearch optionFilterProp="label"
              placeholder="Fabricante"
              allowClear
              style={{ width: "100%" }}
              value={filterFab || undefined}
              onChange={(v) => { setFilterFab(v ?? ""); setPage(1); }}
              options={fabricantes.map((f) => ({ value: f.codigo, label: f.nombre }))}
            />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                setSearch("");
                setFilterPlanta("");
                setFilterArea("");
                setFilterCategoria("");
                setFilterClasificacion("");
                setFilterFab("");
                setPage(1);
              }}
            >
              Limpiar
            </Button>
          </Col>
        </Row>
      </Card>

      <TableDragWrapper>
              <Table
          rowKey="material_id"
          columns={visibleColumns(columnsResizable, ocultas)}
          components={tableComponents}
          dataSource={data}
          loading={loading}
          locale={{
            emptyText: !loading && total === 0 && !search && !filterPlanta && !filterArea && !filterCategoria && !filterClasificacion ? (
              <EmptyState
                title="Aún no hay materiales cargados"
                description="Importá masivamente desde Excel (código, descripción, planta, área, UM, precio…) o creá uno manualmente."
                primaryAction={isAdminUser ? {
                  label: "Importar desde Excel",
                  icon: <ImportOutlined />,
                  onClick: () => setImportOpen(true),
                } : undefined}
                secondaryAction={{
                  label: "Crear manualmente",
                  icon: <PlusOutlined />,
                  onClick: openCreate,
                }}
              />
            ) : undefined,
          }}
          pagination={paginacionEstandar({
            current: page,
            pageSize,
            total,
            onChange: (p, s) => { setPage(p); setPageSize(s); },
            label: "materiales",
          })}
          scroll={{ x: 1200 }}
          sticky={{ offsetHeader: 56, offsetScroll: 0 }}
          size="small"
        />
      </TableDragWrapper>

      <Modal
        title={editing ? `Editar ${editing.codigo}` : "Nuevo Material"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        width={modalWidth(screens, 800)}
        destroyOnHidden
      >
        <div style={{ fontSize: 12, color: brand.textSecondary, marginTop: 12 }}>
          Los campos con <span style={{ color: brand.error }}>*</span> son obligatorios.
        </div>
        <Form
          form={form} layout="vertical" style={{ marginTop: 8 }}
          validateTrigger={["onChange", "onBlur"]}
          requiredMark
        >
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="descripcion" label="Descripción" rules={[{ required: true, message: "Campo obligatorio" }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="planta_codigo" label="Planta" rules={[{ required: true, message: "Campo obligatorio" }]}>
                <Select showSearch optionFilterProp="label" options={plantas.map((p) => ({ value: p.codigo, label: `${p.codigo} - ${p.nombre}` }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="area_codigo" label="Área" rules={[{ required: true, message: "Campo obligatorio" }]}>
                <Select showSearch optionFilterProp="label" options={areas.map((a) => ({ value: a.codigo, label: `${a.codigo} - ${a.nombre}` }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="categoria_codigo" label="Categoría" rules={[{ required: true, message: "Campo obligatorio" }]}>
                <Select showSearch optionFilterProp="label" options={categorias.map((c) => ({ value: c.codigo, label: `${c.codigo} - ${c.nombre}` }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="clasificacion_codigo" label="Clasificación" rules={[{ required: true, message: "Campo obligatorio" }]}>
                <Select showSearch optionFilterProp="label" options={clasificaciones.map((c) => ({ value: c.codigo, label: `${c.codigo} - ${c.nombre}` }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="unidad_medida_codigo" label="Und. Medida" rules={[{ required: true, message: "Campo obligatorio" }]}>
                <Select showSearch optionFilterProp="label" options={unidades.map((u) => ({ value: u.codigo, label: `${u.codigo} - ${u.nombre}` }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="fabricante_codigo" label="Fabricante">
                <Select showSearch optionFilterProp="label" allowClear options={fabricantes.map((f) => ({ value: f.codigo, label: f.nombre }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="np" label="Número de Parte">
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="plazo_entrega" label="Plazo Entrega (días)">
                <InputNumber style={{ width: "100%" }} min={0} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="precio" label="Precio">
                <InputNumber style={{ width: "100%" }} min={0} precision={2} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="moneda_codigo" label="Moneda">
                <Select showSearch optionFilterProp="label" allowClear options={monedas.map((m) => ({ value: m.codigo, label: m.codigo }))} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="punto_reposicion" label="Pto. Reposición">
                <InputNumber style={{ width: "100%" }} min={0} precision={2} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="stock_maximo" label="Stock Máximo">
                <InputNumber style={{ width: "100%" }} min={0} precision={2} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Drawer
        title={detalle ? `${detalle.codigo} — ${detalle.descripcion}` : ""}
        open={!!detalle}
        onClose={() => setDetalle(null)}
        size={620}
      >
        {detalle && (
          <div>
            <Row gutter={12} style={{ marginBottom: 16 }}>
              <Col span={8}>
                <Statistic
                  title="Stock actual"
                  value={detalle.stock_actual != null ? Number(detalle.stock_actual) : 0}
                  suffix={detalle.unidad_medida?.abreviatura ?? detalle.unidad_medida_codigo}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="Pto. reposición"
                  value={detalle.punto_reposicion != null ? Number(detalle.punto_reposicion) : "—"}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="Stock máximo"
                  value={detalle.stock_maximo != null ? Number(detalle.stock_maximo) : "—"}
                />
              </Col>
            </Row>

            <Descriptions size="small" column={2} bordered styles={{ label: { fontWeight: 600, width: 140 } }}>
              <Descriptions.Item label="Código">{detalle.codigo}</Descriptions.Item>
              <Descriptions.Item label="NP">{detalle.np ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Descripción" span={2}>{detalle.descripcion}</Descriptions.Item>
              <Descriptions.Item label="Planta">{detalle.planta?.nombre ?? detalle.planta_codigo}</Descriptions.Item>
              <Descriptions.Item label="Área">{detalle.area?.nombre ?? detalle.area_codigo}</Descriptions.Item>
              <Descriptions.Item label="Categoría">{detalle.categoria?.nombre ?? detalle.categoria_codigo}</Descriptions.Item>
              <Descriptions.Item label="Clasificación">{detalle.clasificacion?.nombre ?? detalle.clasificacion_codigo}</Descriptions.Item>
              <Descriptions.Item label="Unidad medida">{detalle.unidad_medida?.nombre ?? detalle.unidad_medida_codigo}</Descriptions.Item>
              <Descriptions.Item label="Fabricante">{detalle.fabricante?.nombre ?? detalle.fabricante_codigo ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Modelo">{detalle.modelo ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Caja">{detalle.caja ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Ubicación">{detalle.ubicacion ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Plazo entrega">{detalle.plazo_entrega != null ? `${detalle.plazo_entrega} días` : "—"}</Descriptions.Item>
              <Descriptions.Item label="Precio referencia" span={2}>
                {detalle.precio != null
                  ? `${detalle.moneda?.simbolo ?? detalle.moneda_codigo ?? ""} ${Number(detalle.precio).toLocaleString("es-PE", { minimumFractionDigits: 2 })}`
                  : "—"}
              </Descriptions.Item>
            </Descriptions>

            <Title level={5} style={{ marginTop: 20, color: brand.navy }}>Histórico de compras por proveedor</Title>
            {loadingHistorico ? (
              <div style={{ padding: 16, textAlign: "center", color: brand.textSecondary }}>Cargando…</div>
            ) : historicoMaterial.length === 0 ? (
              <Empty description="Sin compras registradas para este material." />
            ) : (
              <Table<HistoricoRow>
                rowKey="key"
                size="small"
                pagination={false}
                dataSource={historicoMaterial}
                columns={[
                  { key: "proveedor", title: "Proveedor", dataIndex: "proveedor_razon_social", render: (v: string) => <span style={{ fontSize: 12, fontWeight: 500 }}>{v}</span> },
                  {
                    key: "precio", title: "Último precio", dataIndex: "precio_unitario", align: "right",
                    render: (v: number, r) => {
                      const sym = r.moneda === "USD" ? "$" : r.moneda === "PEN" || r.moneda === "SOL" ? "S/" : "";
                      return <span style={{ fontWeight: 600 }}>{sym} {v.toLocaleString("es-PE", { minimumFractionDigits: 2 })}</span>;
                    },
                  },
                  { key: "cantidad", title: "Cant.", dataIndex: "cantidad", align: "right", render: (v: number) => v.toLocaleString("es-PE") },
                  { key: "fecha", title: "Fecha", dataIndex: "fecha", render: (v: string | null) => v ? dayjs(v).format("DD/MM/YY") : "—" },
                  { key: "po", title: "PO", dataIndex: "numero_po", render: (v: string) => <Tag>{v}</Tag> },
                ]}
              />
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
