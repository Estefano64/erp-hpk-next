"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Typography,
  Table,
  Button,
  Input,
  Select,
  AutoComplete,
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
} from "antd";
import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  StopOutlined,
  ReloadOutlined,
  ToolOutlined,
  InboxOutlined,
} from "@ant-design/icons";
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
} from "@/lib/tables";
import { ExportarExcelButton } from "@/components/ExportarExcelButton";

const { Title } = Typography;

interface CodRep {
  cod_rep_id: number;
  codigo: string;
  descripcion: string;
  tipo_codigo: string;
  categoria_codigo: string;
  flota_codigo: string;
  fabricante_codigo: string | null;
  np: string | null;
  posicion_codigo: string | null;
  precio: number | null;
  moneda_codigo: string | null;
  tipo: { nombre: string };
  categoria: { nombre: string };
  flota: { nombre: string };
  fabricante: { nombre: string } | null;
  posicion: { nombre: string } | null;
  moneda: { simbolo: string } | null;
}

interface Option {
  codigo: string;
  nombre: string;
}

export default function CodigosReparacionPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const isAdminUser = ((session?.user as { roles?: string[] } | undefined)?.roles ?? []).includes("admin");
  const [data, setData] = useState<CodRep[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGINATION_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState("");
  const [filterFlota, setFilterFlota] = useState("");
  const [filterFab, setFilterFab] = useState("");
  const { ocultas, setOcultas } = useColumnasOcultas("codigos-reparacion-list-cols-v1");

  // Opciones para selects
  const [tipos, setTipos] = useState<Option[]>([]);
  const [categorias, setCategorias] = useState<Option[]>([]);
  const [flotas, setFlotas] = useState<Option[]>([]);
  const [fabricantes, setFabricantes] = useState<Option[]>([]);
  const [posiciones, setPosiciones] = useState<Option[]>([]);
  const [monedas, setMonedas] = useState<Option[]>([]);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CodRep | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const [messageApi, contextHolder] = message.useMessage();
  const { screens } = useResponsive();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(pageSize),
    });
    if (search) params.set("search", search);
    if (filterTipo) params.set("tipo", filterTipo);
    if (filterFlota) params.set("flota", filterFlota);
    if (filterFab) params.set("fabricante", filterFab);

    const res = await fetch(`/api/codigos-reparacion?${params}`);
    const json = await res.json();
    setData(json.data ?? []);
    setTotal(json.total ?? 0);
    setLoading(false);
  }, [page, pageSize, search, filterTipo, filterFlota, filterFab]);

  // Cargar opciones de selects
  useEffect(() => {
    async function loadOptions() {
      const endpoints = [
        { url: "/api/catalogos?tabla=tipoCodRep", setter: setTipos },
        { url: "/api/catalogos?tabla=categoriaCodRep", setter: setCategorias },
        { url: "/api/catalogos?tabla=flotaEquipo", setter: setFlotas },
        { url: "/api/catalogos?tabla=fabricante", setter: setFabricantes },
        { url: "/api/catalogos?tabla=posicion", setter: setPosiciones },
        { url: "/api/catalogos?tabla=moneda", setter: setMonedas },
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

  function openEdit(record: CodRep) {
    setEditing(record);
    form.setFieldsValue({
      descripcion: record.descripcion,
      tipo_codigo: record.tipo_codigo,
      categoria_codigo: record.categoria_codigo,
      flota_codigo: record.flota_codigo,
      fabricante_codigo: record.fabricante_codigo,
      np: record.np,
      posicion_codigo: record.posicion_codigo,
      precio: record.precio ? Number(record.precio) : null,
      moneda_codigo: record.moneda_codigo,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const url = editing
        ? `/api/codigos-reparacion/${editing.cod_rep_id}`
        : "/api/codigos-reparacion";
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
    const res = await fetch(`/api/codigos-reparacion/${id}`, { method: "DELETE" });
    if (res.ok) {
      messageApi.success("Código desactivado");
      fetchData();
      return;
    }
    const body = await res.json().catch(() => null);
    messageApi.error(body?.detail ?? body?.error ?? "Error al desactivar");
  }

  async function handleEliminarPermanente(id: number) {
    const res = await fetch(`/api/codigos-reparacion/${id}?force=true`, { method: "DELETE" });
    if (res.ok) {
      messageApi.success("Código eliminado permanentemente");
      fetchData();
      return;
    }
    const body = await res.json().catch(() => null);
    messageApi.error(body?.detail ?? body?.error ?? "Error al eliminar");
  }

  const columns: ColumnsType<CodRep> = [
    numeracionColumn<CodRep>({ current: page, pageSize }),
    {
      key: "codigo",
      title: "Código",
      dataIndex: "codigo",
      width: 100,
      sorter: (a, b) => a.codigo.localeCompare(b.codigo),
      ...filtroPorColumna(data, "codigo"),
      render: (v: string) => <Tag color={brand.navy}>{v}</Tag>,
    },
    { key: "descripcion", title: "Descripción", dataIndex: "descripcion", ellipsis: true, sorter: (a: CodRep, b: CodRep) => a.descripcion.localeCompare(b.descripcion), ...filtroPorColumna(data, "descripcion") },
    {
      key: "tipo_codigo",
      title: "Tipo",
      dataIndex: "tipo_codigo",
      width: 80,
      sorter: (a, b) => (a.tipo?.nombre ?? "").localeCompare(b.tipo?.nombre ?? ""),
      filters: [...new Set(data.map((r) => r.tipo?.nombre ?? r.tipo_codigo).filter(Boolean) as string[])]
        .sort().map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, r) => (r.tipo?.nombre ?? r.tipo_codigo) === value,
      render: (_: string, r: CodRep) => r.tipo?.nombre ?? r.tipo_codigo,
    },
    {
      key: "categoria_codigo",
      title: "Categoría",
      dataIndex: "categoria_codigo",
      width: 100,
      sorter: (a, b) => (a.categoria_codigo ?? "").localeCompare(b.categoria_codigo ?? ""),
      ...filtroPorColumna(data, "categoria_codigo"),
      render: (_: string, r: CodRep) => r.categoria_codigo,
    },
    {
      key: "flota_codigo",
      title: "Flota",
      dataIndex: "flota_codigo",
      width: 80,
      sorter: (a, b) => (a.flota?.nombre ?? "").localeCompare(b.flota?.nombre ?? ""),
      filters: [...new Set(data.map((r) => r.flota?.nombre ?? r.flota_codigo).filter(Boolean) as string[])]
        .sort().map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, r) => (r.flota?.nombre ?? r.flota_codigo) === value,
      render: (_: string, r: CodRep) => r.flota?.nombre ?? r.flota_codigo,
    },
    {
      key: "fabricante_codigo",
      title: "Fabricante",
      dataIndex: "fabricante_codigo",
      width: 100,
      sorter: (a, b) => (a.fabricante?.nombre ?? "").localeCompare(b.fabricante?.nombre ?? ""),
      filters: [...new Set(data.map((r) => r.fabricante?.nombre ?? r.fabricante_codigo).filter(Boolean) as string[])]
        .sort().map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, r) => (r.fabricante?.nombre ?? r.fabricante_codigo) === value,
      render: (_: string, r: CodRep) => r.fabricante?.nombre ?? r.fabricante_codigo ?? "-",
    },
    { key: "np", title: "NP", dataIndex: "np", width: 140, ellipsis: true, sorter: (a: CodRep, b: CodRep) => (a.np ?? "").localeCompare(b.np ?? ""), ...filtroPorColumna(data, "np") },
    {
      key: "posicion_codigo",
      title: "Posición",
      dataIndex: "posicion_codigo",
      width: 80,
      sorter: (a, b) => (a.posicion_codigo ?? "").localeCompare(b.posicion_codigo ?? ""),
      ...filtroPorColumna(data, "posicion_codigo"),
      render: (_: string, r: CodRep) => r.posicion_codigo ?? "-",
    },
    {
      key: "precio",
      title: "Precio",
      dataIndex: "precio",
      width: 120,
      align: "right",
      sorter: (a, b) => (Number(a.precio) || 0) - (Number(b.precio) || 0),
      filters: [...new Set(data.map((r) => r.precio).filter((v): v is number => v != null))]
        .sort((a, b) => a - b).map((v) => ({ text: Number(v).toFixed(2), value: String(v) })),
      filterSearch: true,
      onFilter: (value, r) => String(r.precio ?? "") === value,
      render: (v: number | null, r: CodRep) => {
        if (!v) return "-";
        const sym = r.moneda?.simbolo ?? "$";
        return `${sym} ${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
      },
    },
    {
      key: "acciones",
      title: "Acciones",
      width: 130,
      align: "center",
      render: (_: unknown, record: CodRep) => (
        <Space size="small">
          <Button
            type="text"
            icon={<ToolOutlined />}
            title="Operaciones / HH"
            onClick={() => router.push(`/codigos-reparacion/${record.cod_rep_id}/operaciones`)}
          />
          <Button
            type="text"
            icon={<InboxOutlined />}
            title="Template de requerimientos"
            onClick={() => router.push(`/codigos-reparacion/${record.cod_rep_id}/requerimientos-template`)}
          />
          <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm
            title="¿Desactivar este código?"
            description="Se ocultará de las listas pero se conservará en la base de datos."
            onConfirm={() => handleDesactivar(record.cod_rep_id)}
          >
            <Button type="text" icon={<StopOutlined />} title="Desactivar" />
          </Popconfirm>
          {isAdminUser && (
            <Popconfirm
              title="¿Eliminar permanentemente?"
              description="Esta acción no se puede deshacer."
              okType="danger"
              okText="Eliminar"
              onConfirm={() => handleEliminarPermanente(record.cod_rep_id)}
            >
              <Button type="text" danger icon={<DeleteOutlined />} title="Eliminar permanentemente" />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const { columnas: columnsResizable, components: tableComponents, resetAnchos, TableDragWrapper } =
    useColumnasRedimensionables<CodRep>(columns, "codrep-list-cols-widths-v1", { data });

  return (
    <div>
      {contextHolder}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          Códigos Reparables
        </Title>
        <Space>
          <ColumnasToggleButton<CodRep>
            columns={columns}
            ocultas={ocultas}
            setOcultas={setOcultas}
            obligatorias={["__num", "codigo", "acciones"]}
          />
          <Button onClick={resetAnchos}>Restablecer anchos</Button>
          <ExportarExcelButton<CodRep>
            endpoint="/api/codigos-reparacion"
            filename="Codigos-Reparacion"
            categoryFilters={[
              {
                key: "tipo",
                label: "Tipo",
                options: tipos.map((t) => ({ value: t.codigo, label: t.nombre })),
                predicate: (r, sel) => sel.includes(r.tipo_codigo ?? ""),
              },
              {
                key: "categoria",
                label: "Categoría",
                options: categorias.map((c) => ({ value: c.codigo, label: c.nombre })),
                predicate: (r, sel) => sel.includes(r.categoria_codigo ?? ""),
              },
              {
                key: "flota",
                label: "Flota",
                options: flotas.map((f) => ({ value: f.codigo, label: f.nombre })),
                predicate: (r, sel) => sel.includes(r.flota_codigo ?? ""),
              },
              {
                key: "fabricante",
                label: "Fabricante",
                options: fabricantes.map((f) => ({ value: f.codigo, label: f.nombre })),
                predicate: (r, sel) => sel.includes(r.fabricante_codigo ?? ""),
              },
            ]}
            columns={[
              { label: "Código", value: (r) => r.codigo },
              { label: "Descripción", value: (r) => r.descripcion },
              { label: "Tipo", value: (r) => r.tipo?.nombre ?? r.tipo_codigo },
              { label: "Categoría", value: (r) => r.categoria?.nombre ?? r.categoria_codigo },
              { label: "Flota", value: (r) => r.flota?.nombre ?? r.flota_codigo },
              { label: "Fabricante", value: (r) => r.fabricante?.nombre ?? r.fabricante_codigo ?? "" },
              { label: "Nº Parte", value: (r) => r.np ?? "" },
              { label: "Posición", value: (r) => r.posicion?.nombre ?? r.posicion_codigo ?? "" },
              { label: "Precio", value: (r) => r.precio != null ? Number(r.precio) : "" },
              { label: "Moneda", value: (r) => r.moneda_codigo ?? "" },
            ]}
          />
          <ExportarExcelButton<{
            tarea_id: number;
            cod_rep_codigo: string | null;
            item_numero: number;
            tipo_codigo: string;
            actividad_codigo: string;
            material_codigo: string | null;
            fabricante_codigo: string | null;
            descripcion: string;
            requerimiento: number | string;
            np: string | null;
            precio: number | string | null;
            material?: { codigo: string; descripcion: string } | null;
            tipo?: { nombre: string } | null;
            fabricante?: { nombre: string } | null;
          }>
            endpoint="/api/tareas"
            filename="Tareas-Templates"
            columns={[
              { label: "Cod_Rep", value: (r) => r.cod_rep_codigo ?? "" },
              { label: "Item", value: (r) => r.item_numero },
              { label: "Tipo", value: (r) => r.tipo?.nombre ?? r.tipo_codigo },
              { label: "Actividad", value: (r) => r.actividad_codigo },
              { label: "Material", value: (r) => r.material_codigo ?? "" },
              { label: "Material descripción", value: (r) => r.material?.descripcion ?? "" },
              { label: "Fabricante", value: (r) => r.fabricante?.nombre ?? r.fabricante_codigo ?? "" },
              { label: "Descripción tarea", value: (r) => r.descripcion },
              { label: "Cantidad", value: (r) => Number(r.requerimiento) },
              { label: "Nº Parte", value: (r) => r.np ?? "" },
              { label: "Precio", value: (r) => r.precio != null ? Number(r.precio) : "" },
            ]}
          >
            Descargar Tareas
          </ExportarExcelButton>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Nuevo
          </Button>
        </Space>
      </div>

      <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} md={8}>
            <Input
              placeholder="Buscar por código, descripción o NP..."
              prefix={<SearchOutlined />}
              allowClear
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              placeholder="Tipo"
              allowClear showSearch optionFilterProp="label"
              style={{ width: "100%" }}
              value={filterTipo || undefined}
              onChange={(v) => { setFilterTipo(v ?? ""); setPage(1); }}
              options={tipos.map((t) => ({ value: t.codigo, label: t.codigo }))}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              placeholder="Flota"
              allowClear showSearch optionFilterProp="label"
              style={{ width: "100%" }}
              value={filterFlota || undefined}
              onChange={(v) => { setFilterFlota(v ?? ""); setPage(1); }}
              options={flotas.map((f) => ({ value: f.codigo, label: f.nombre }))}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              placeholder="Fabricante"
              allowClear showSearch optionFilterProp="label"
              style={{ width: "100%" }}
              value={filterFab || undefined}
              onChange={(v) => { setFilterFab(v ?? ""); setPage(1); }}
              options={fabricantes.map((f) => ({ value: f.codigo, label: f.nombre }))}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Button icon={<ReloadOutlined />} onClick={() => { setSearch(""); setFilterTipo(""); setFilterFlota(""); setFilterFab(""); setPage(1); }}>
              Limpiar
            </Button>
          </Col>
        </Row>
      </Card>

      <TableDragWrapper>
              <Table
          rowKey="cod_rep_id"
          columns={visibleColumns(columnsResizable, ocultas)}
          components={tableComponents}
          dataSource={data}
          loading={loading}
          pagination={paginacionEstandar({
            current: page,
            pageSize,
            total,
            onChange: (p, s) => { setPage(p); setPageSize(s); },
            label: "registros",
          })}
          scroll={{ x: 1100 }}
          sticky={{ offsetHeader: 56, offsetScroll: 0 }}
          size="small"
        />
      </TableDragWrapper>

      <Modal
        title={editing ? `Editar ${editing.codigo}` : "Nuevo Código Reparable"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        width={modalWidth(screens, 700)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="descripcion" label="Descripción" rules={[{ required: true, message: "Requerido" }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="tipo_codigo" label="Tipo" rules={[{ required: true, message: "Requerido" }]}>
                <Select showSearch optionFilterProp="label" options={tipos.map((t) => ({ value: t.codigo, label: `${t.codigo} - ${t.nombre}` }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="categoria_codigo" label="Categoría" rules={[{ required: true, message: "Requerido" }]}>
                <Select showSearch optionFilterProp="label" options={categorias.map((c) => ({ value: c.codigo, label: `${c.codigo} - ${c.nombre}` }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="flota_codigo" label="Flota" rules={[{ required: true, message: "Requerido" }]}>
                {/* Combobox: se puede elegir una flota existente o escribir una
                    nueva (se crea al vuelo en el catálogo al guardar). */}
                <AutoComplete
                  allowClear
                  placeholder="Elegí o escribí una flota (p.ej. 980E)"
                  options={flotas.map((f) => ({ value: f.codigo, label: `${f.codigo} - ${f.nombre}` }))}
                  filterOption={(input, option) =>
                    String(option?.label ?? "").toLowerCase().includes(input.toLowerCase())
                  }
                />
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
              <Form.Item name="posicion_codigo" label="Posición">
                <Select showSearch optionFilterProp="label" allowClear options={posiciones.map((p) => ({ value: p.codigo, label: `${p.codigo} - ${p.nombre}` }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="precio" label="Precio">
                <InputNumber style={{ width: "100%" }} min={0} precision={2} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="moneda_codigo" label="Moneda">
                <Select showSearch optionFilterProp="label" allowClear options={monedas.map((m) => ({ value: m.codigo, label: m.codigo }))} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
