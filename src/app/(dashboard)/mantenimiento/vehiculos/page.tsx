"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
  DatePicker,
  Tooltip,
} from "antd";
import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  CarOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { brand } from "@/lib/theme";
import { useResponsive, modalWidth } from "@/lib/responsive";
import dayjs, { Dayjs } from "dayjs";
import { formatDateOnly } from "@/lib/dates";
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

const { Title, Text } = Typography;
const { TextArea } = Input;

interface Vehiculo {
  id: number;
  item: number;
  tipo: string;
  marca: string;
  modelo: string;
  serie: string;
  placa: string;
  anio: number | null;
  revision_tecnica_vencimiento: string | null;
  empresa_soat: string | null;
  soat_vencimiento: string | null;
  empresa_poliza: string | null;
  poliza_vencimiento: string | null;
  monto_poliza: number | null;
  almacen: string | null;
  observaciones: string | null;
  activo: boolean;
  usuario_crea: string | null;
  usuario_actualiza: string | null;
  created_at: string;
  updated_at: string;
}

// Estado de una fecha de vencimiento.
//   ok      → vence en > 30 días
//   pronto  → 0..30 días (warning)
//   vencido → ya pasó
type EstadoFecha = "ok" | "pronto" | "vencido" | "vacio";

function estadoFecha(fechaISO: string | null): EstadoFecha {
  if (!fechaISO) return "vacio";
  const f = dayjs(fechaISO);
  if (!f.isValid()) return "vacio";
  const hoy = dayjs().startOf("day");
  const diff = f.diff(hoy, "day");
  if (diff < 0) return "vencido";
  if (diff <= 30) return "pronto";
  return "ok";
}

function TagFecha({ fechaISO, label }: { fechaISO: string | null; label: string }) {
  const e = estadoFecha(fechaISO);
  if (e === "vacio") {
    return <Tag style={{ margin: 0, fontSize: 11 }}>—</Tag>;
  }
  const color = e === "vencido" ? "red" : e === "pronto" ? "orange" : "green";
  const icon = e === "vencido" ? <WarningOutlined /> : e === "pronto" ? <ClockCircleOutlined /> : <CheckCircleOutlined />;
  const txt = formatDateOnly(fechaISO!);
  const diff = dayjs(fechaISO!).diff(dayjs().startOf("day"), "day");
  const subt = e === "vencido"
    ? `Vencido hace ${Math.abs(diff)} día(s)`
    : e === "pronto"
    ? `Vence en ${diff} día(s)`
    : `Vigente (${diff} días restantes)`;
  return (
    <Tooltip title={`${label}: ${subt}`}>
      <Tag color={color} icon={icon} style={{ margin: 0, fontSize: 11 }}>
        {txt}
      </Tag>
    </Tooltip>
  );
}

export default function VehiculosPage() {
  const { data: session } = useSession();
  const { screens } = useResponsive();
  const usuario = session?.user?.name || session?.user?.email || "Sistema";

  const [data, setData] = useState<Vehiculo[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<string | undefined>(undefined);
  const [filtroEstado, setFiltroEstado] = useState<"todos" | "vencidos" | "pronto" | "ok">("todos");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGINATION_PAGE_SIZE);

  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<Vehiculo | null>(null);
  const [form] = Form.useForm();
  const [guardando, setGuardando] = useState(false);

  const { ocultas, setOcultas } = useColumnasOcultas("vehiculos-cols-v1", [
    "serie", "observaciones",
  ]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/vehiculos");
      const json = await res.json();
      setData(json.data ?? []);
    } catch {
      message.error("Error al cargar vehículos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filasMostradas = useMemo(() => {
    const lc = search.trim().toLowerCase();
    return data.filter((v) => {
      if (!v.activo) return false;
      if (filtroTipo && v.tipo !== filtroTipo) return false;
      if (filtroEstado !== "todos") {
        const peor = [v.soat_vencimiento, v.revision_tecnica_vencimiento, v.poliza_vencimiento]
          .map(estadoFecha);
        if (filtroEstado === "vencidos" && !peor.includes("vencido")) return false;
        if (filtroEstado === "pronto" && !peor.includes("pronto") && !peor.includes("vencido")) return false;
        if (filtroEstado === "ok") {
          if (peor.includes("vencido") || peor.includes("pronto")) return false;
        }
      }
      if (!lc) return true;
      return (
        v.placa.toLowerCase().includes(lc) ||
        v.serie.toLowerCase().includes(lc) ||
        v.marca.toLowerCase().includes(lc) ||
        v.modelo.toLowerCase().includes(lc) ||
        v.tipo.toLowerCase().includes(lc)
      );
    });
  }, [data, search, filtroTipo, filtroEstado]);

  const tipos = useMemo(
    () => Array.from(new Set(data.map((v) => v.tipo).filter(Boolean))).sort(),
    [data],
  );

  const conteos = useMemo(() => {
    const c = { vencidos: 0, pronto: 0, ok: 0 };
    for (const v of data.filter((x) => x.activo)) {
      const estados = [v.soat_vencimiento, v.revision_tecnica_vencimiento, v.poliza_vencimiento]
        .map(estadoFecha);
      if (estados.includes("vencido")) c.vencidos += 1;
      else if (estados.includes("pronto")) c.pronto += 1;
      else c.ok += 1;
    }
    return c;
  }, [data]);

  const abrirCrear = () => {
    setEditando(null);
    form.resetFields();
    form.setFieldsValue({
      tipo: "CAMIONETA",
      almacen: "HPK AREQUIPA",
    });
    setModalOpen(true);
  };

  const abrirEditar = (v: Vehiculo) => {
    setEditando(v);
    form.setFieldsValue({
      tipo: v.tipo,
      marca: v.marca,
      modelo: v.modelo,
      serie: v.serie,
      placa: v.placa,
      anio: v.anio,
      revision_tecnica_vencimiento: v.revision_tecnica_vencimiento ? dayjs(v.revision_tecnica_vencimiento) : null,
      empresa_soat: v.empresa_soat,
      soat_vencimiento: v.soat_vencimiento ? dayjs(v.soat_vencimiento) : null,
      empresa_poliza: v.empresa_poliza,
      poliza_vencimiento: v.poliza_vencimiento ? dayjs(v.poliza_vencimiento) : null,
      monto_poliza: v.monto_poliza,
      almacen: v.almacen,
      observaciones: v.observaciones,
    });
    setModalOpen(true);
  };

  const guardar = async () => {
    try {
      const values = await form.validateFields();
      setGuardando(true);
      const payload = {
        ...values,
        revision_tecnica_vencimiento: values.revision_tecnica_vencimiento
          ? (values.revision_tecnica_vencimiento as Dayjs).toISOString() : null,
        soat_vencimiento: values.soat_vencimiento
          ? (values.soat_vencimiento as Dayjs).toISOString() : null,
        poliza_vencimiento: values.poliza_vencimiento
          ? (values.poliza_vencimiento as Dayjs).toISOString() : null,
        ...(editando ? { usuario_actualiza: usuario } : { usuario_crea: usuario }),
      };
      const res = editando
        ? await fetch(`/api/vehiculos/${editando.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/vehiculos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al guardar");
      message.success(editando ? "Vehículo actualizado" : "Vehículo creado");
      setModalOpen(false);
      await fetchData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      if (!msg.includes("validation")) message.error(msg);
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (id: number) => {
    try {
      const res = await fetch(`/api/vehiculos/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al eliminar");
      message.success("Vehículo desactivado");
      await fetchData();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Error desconocido");
    }
  };

  const columns: ColumnsType<Vehiculo> = [
    numeracionColumn<Vehiculo>(),
    {
      key: "item", title: "#", dataIndex: "item", width: 50, align: "center",
      sorter: (a, b) => a.item - b.item,
    },
    {
      key: "tipo", title: "Unidad", dataIndex: "tipo", width: 110,
      ...filtroPorColumna(data, "tipo"),
      render: (v: string) => <Tag color={brand.navy} style={{ margin: 0 }}>{v}</Tag>,
    },
    {
      key: "marca", title: "Marca", dataIndex: "marca", width: 110,
      ...filtroPorColumna(data, "marca"),
    },
    {
      key: "modelo", title: "Modelo", dataIndex: "modelo", width: 160,
      ...filtroPorColumna(data, "modelo"),
      render: (v: string) => <Text strong>{v}</Text>,
    },
    {
      key: "placa", title: "Placa", dataIndex: "placa", width: 100,
      ...filtroPorColumna(data, "placa"),
      render: (v: string) => <Tag style={{ margin: 0, fontFamily: "monospace", fontSize: 12 }}>{v}</Tag>,
    },
    {
      key: "anio", title: "Año", dataIndex: "anio", width: 70, align: "center",
      sorter: (a, b) => (a.anio ?? 0) - (b.anio ?? 0),
      render: (v: number | null) => v ?? "—",
    },
    {
      key: "revision_tecnica_vencimiento", title: "Revisión Téc.", dataIndex: "revision_tecnica_vencimiento", width: 130, align: "center",
      sorter: (a, b) => (a.revision_tecnica_vencimiento ?? "").localeCompare(b.revision_tecnica_vencimiento ?? ""),
      render: (v: string | null) => <TagFecha fechaISO={v} label="Revisión técnica" />,
    },
    {
      key: "empresa_soat", title: "Empresa SOAT", dataIndex: "empresa_soat", width: 130,
      ...filtroPorColumna(data, "empresa_soat"),
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      key: "soat_vencimiento", title: "SOAT", dataIndex: "soat_vencimiento", width: 120, align: "center",
      sorter: (a, b) => (a.soat_vencimiento ?? "").localeCompare(b.soat_vencimiento ?? ""),
      render: (v: string | null) => <TagFecha fechaISO={v} label="SOAT" />,
    },
    {
      key: "empresa_poliza", title: "Empresa Póliza", dataIndex: "empresa_poliza", width: 140,
      ...filtroPorColumna(data, "empresa_poliza"),
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      key: "poliza_vencimiento", title: "Póliza", dataIndex: "poliza_vencimiento", width: 120, align: "center",
      sorter: (a, b) => (a.poliza_vencimiento ?? "").localeCompare(b.poliza_vencimiento ?? ""),
      render: (v: string | null) => <TagFecha fechaISO={v} label="Póliza" />,
    },
    {
      key: "monto_poliza", title: "Monto Póliza", dataIndex: "monto_poliza", width: 110, align: "right",
      render: (v: number | null) => v != null ? <Text>S/ {Number(v).toLocaleString("es-PE", { minimumFractionDigits: 2 })}</Text> : <Text type="secondary">—</Text>,
    },
    {
      key: "serie", title: "Serie (VIN)", dataIndex: "serie", width: 180,
      render: (v: string) => <Text style={{ fontFamily: "monospace", fontSize: 11 }}>{v}</Text>,
    },
    {
      key: "observaciones", title: "Observaciones", dataIndex: "observaciones", width: 200, ellipsis: true,
      render: (v: string | null) => v || <Text type="secondary">—</Text>,
    },
    {
      key: "acciones", title: "", width: 100, fixed: "right", align: "center",
      render: (_: unknown, r: Vehiculo) => (
        <Space size={0}>
          <Tooltip title="Editar">
            <Button type="text" size="small" icon={<EditOutlined style={{ color: brand.cyan }} />} onClick={() => abrirEditar(r)} />
          </Tooltip>
          <Popconfirm
            title="¿Desactivar este vehículo?"
            description="Se ocultará del listado pero se preserva el historial."
            onConfirm={() => eliminar(r.id)}
            okText="Desactivar"
            cancelText="Cancelar"
          >
            <Tooltip title="Desactivar">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const { columnas: columnsResizable, components: tableComponents, resetAnchos, TableDragWrapper } =
    useColumnasRedimensionables<Vehiculo>(columns, "vehiculos-cols-widths-v1", { data });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            <CarOutlined style={{ color: brand.navy, marginRight: 8 }} />
            Vehículos
          </Title>
          <Text type="secondary">Unidades de transporte HP&amp;K — control de SOAT, revisión técnica y póliza</Text>
        </div>
        <Space wrap>
          <ColumnasToggleButton<Vehiculo>
            columns={columns}
            ocultas={ocultas}
            setOcultas={setOcultas}
            obligatorias={["__num", "placa", "acciones"]}
          />
          <Button onClick={resetAnchos}>Restablecer anchos</Button>
          <ExportarExcelButton<Vehiculo>
            endpoint="/api/vehiculos"
            filename="Vehiculos"
            currentRows={filasMostradas}
            tablaLayout={{ ocultas }}
            columns={[
              { key: "item", label: "#", value: (r) => r.item },
              { key: "tipo", label: "Unidad", value: (r) => r.tipo },
              { key: "marca", label: "Marca", value: (r) => r.marca },
              { key: "modelo", label: "Modelo", value: (r) => r.modelo },
              { key: "serie", label: "Serie", value: (r) => r.serie },
              { key: "placa", label: "Placa", value: (r) => r.placa },
              { key: "anio", label: "Año", value: (r) => r.anio ?? "" },
              { key: "revision_tecnica_vencimiento", label: "Revisión Téc.", value: (r) => r.revision_tecnica_vencimiento ? formatDateOnly(r.revision_tecnica_vencimiento) : "" },
              { key: "empresa_soat", label: "Empresa SOAT", value: (r) => r.empresa_soat ?? "" },
              { key: "soat_vencimiento", label: "SOAT", value: (r) => r.soat_vencimiento ? formatDateOnly(r.soat_vencimiento) : "" },
              { key: "empresa_poliza", label: "Empresa Póliza", value: (r) => r.empresa_poliza ?? "" },
              { key: "poliza_vencimiento", label: "Póliza", value: (r) => r.poliza_vencimiento ? formatDateOnly(r.poliza_vencimiento) : "" },
              { key: "monto_poliza", label: "Monto Póliza", value: (r) => r.monto_poliza ?? "" },
              { key: "observaciones", label: "Observaciones", value: (r) => r.observaciones ?? "" },
            ]}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={abrirCrear}>
            Nuevo vehículo
          </Button>
        </Space>
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card styles={{ body: { padding: 12 } }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Total activos</Text>
            <div style={{ fontSize: 22, fontWeight: 600, color: brand.navy }}>
              {data.filter((v) => v.activo).length}
            </div>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card styles={{ body: { padding: 12 } }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Documentación OK</Text>
            <div style={{ fontSize: 22, fontWeight: 600, color: "#52c41a" }}>
              <CheckCircleOutlined /> {conteos.ok}
            </div>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card styles={{ body: { padding: 12 } }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Vence pronto (&le; 30d)</Text>
            <div style={{ fontSize: 22, fontWeight: 600, color: "#faad14" }}>
              <ClockCircleOutlined /> {conteos.pronto}
            </div>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card styles={{ body: { padding: 12 } }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Vencidos</Text>
            <div style={{ fontSize: 22, fontWeight: 600, color: "#cf1322" }}>
              <WarningOutlined /> {conteos.vencidos}
            </div>
          </Card>
        </Col>
      </Row>

      <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} md={8}>
            <Input
              placeholder="Buscar por placa, marca, modelo, serie…"
              prefix={<SearchOutlined />}
              allowClear
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              placeholder="Tipo"
              allowClear
              value={filtroTipo}
              onChange={setFiltroTipo}
              options={tipos.map((t) => ({ value: t, label: t }))}
              style={{ width: "100%" }}
            />
          </Col>
          <Col xs={12} sm={6} md={6}>
            <Select
              value={filtroEstado}
              onChange={setFiltroEstado}
              options={[
                { value: "todos", label: "Todos" },
                { value: "vencidos", label: "Con documento vencido" },
                { value: "pronto", label: "Vence en ≤ 30 días" },
                { value: "ok", label: "Documentación OK" },
              ]}
              style={{ width: "100%" }}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Button icon={<ReloadOutlined />} onClick={fetchData} block>
              Actualizar
            </Button>
          </Col>
        </Row>
      </Card>

      <TableDragWrapper>
        <Table<Vehiculo>
          rowKey="id"
          columns={visibleColumns(columnsResizable, ocultas)}
          components={tableComponents}
          dataSource={filasMostradas}
          loading={loading}
          pagination={paginacionEstandar({
            current: page,
            pageSize,
            total: filasMostradas.length,
            onChange: (p, s) => { setPage(p); setPageSize(s); },
            label: "vehículos",
          })}
          scroll={{ x: 1400 }}
          sticky={{ offsetHeader: 56, offsetScroll: 0 }}
          size="small"
        />
      </TableDragWrapper>

      <Modal
        title={editando ? `Editar vehículo · ${editando.placa}` : "Nuevo vehículo"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={guardar}
        confirmLoading={guardando}
        okText={editando ? "Guardar cambios" : "Crear vehículo"}
        cancelText="Cancelar"
        width={modalWidth(screens, 760)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Row gutter={12}>
            <Col xs={12} md={6}>
              <Form.Item label="Tipo" name="tipo" rules={[{ required: true, message: "Requerido" }]}>
                <Select
                  showSearch
                  options={[
                    { value: "CAMIONETA", label: "Camioneta" },
                    { value: "CAMION", label: "Camión" },
                    { value: "AUTO", label: "Auto" },
                  ]}
                  placeholder="Seleccionar"
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item label="Año" name="anio">
                <InputNumber min={1900} max={2100} style={{ width: "100%" }} placeholder="Ej. 2024" />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item label="Marca" name="marca" rules={[{ required: true, message: "Requerido" }]}>
                <Input placeholder="Ej. TOYOTA" />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item label="Modelo" name="modelo" rules={[{ required: true, message: "Requerido" }]}>
                <Input placeholder="Ej. FORTUNER" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col xs={12} md={8}>
              <Form.Item label="Placa" name="placa" rules={[{ required: true, message: "Requerido" }]}>
                <Input placeholder="Ej. V9M-357" style={{ fontFamily: "monospace" }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Serie (VIN)" name="serie" rules={[{ required: true, message: "Requerido" }]}>
                <Input placeholder="Ej. 8AJDA3FS0J0501267" style={{ fontFamily: "monospace" }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={4}>
              <Form.Item label="Almacén" name="almacen">
                <Input placeholder="HPK AREQUIPA" />
              </Form.Item>
            </Col>
          </Row>

          <Title level={5} style={{ marginTop: 8, marginBottom: 12, color: brand.navy }}>
            Revisión técnica
          </Title>
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item label="Vencimiento" name="revision_tecnica_vencimiento">
                <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>

          <Title level={5} style={{ marginTop: 8, marginBottom: 12, color: brand.navy }}>
            SOAT
          </Title>
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item label="Empresa" name="empresa_soat">
                <Input placeholder="Ej. La Positiva" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Vencimiento" name="soat_vencimiento">
                <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>

          <Title level={5} style={{ marginTop: 8, marginBottom: 12, color: brand.navy }}>
            Póliza de seguro
          </Title>
          <Row gutter={12}>
            <Col xs={24} md={8}>
              <Form.Item label="Empresa" name="empresa_poliza">
                <Input placeholder="Ej. Mapfre" />
              </Form.Item>
            </Col>
            <Col xs={12} md={8}>
              <Form.Item label="Vencimiento" name="poliza_vencimiento">
                <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={12} md={8}>
              <Form.Item label="Monto póliza (S/)" name="monto_poliza">
                <InputNumber min={0} step={0.01} precision={2} style={{ width: "100%" }} placeholder="0.00" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Observaciones" name="observaciones">
            <TextArea rows={2} placeholder="Notas adicionales…" maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
