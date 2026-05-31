"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Modal,
  Descriptions,
  Tag,
  Table,
  Spin,
  Typography,
  Row,
  Col,
  Statistic,
  Card,
  Space,
  Select,
  Button,
  Input,
  DatePicker,
  Popconfirm,
  Upload,
  App,
} from "antd";
import { EditOutlined, SaveOutlined, CloseOutlined, PrinterOutlined, CheckOutlined, UploadOutlined, DeleteOutlined, FileTextOutlined } from "@ant-design/icons";
import { brand } from "@/lib/theme";
import { uploadToR2 } from "@/lib/r2-client";
import { R2FileLink } from "@/components/R2FileLink";
import { useResponsive } from "@/lib/responsive";
import dayjs, { Dayjs } from "dayjs";
import type { ColumnsType } from "antd/es/table";
import { formatDateOnly } from "@/lib/dates";
import {
  useColumnasOcultas,
  ColumnasToggleButton,
  visibleColumns,
  filtroPorColumna,
  useColumnasRedimensionables,
} from "@/lib/tables";

const { Text } = Typography;

interface Props {
  compraId: number | null;
  open: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}

interface CompraDetalle {
  id: number;
  numero_po: string;
  proveedor: { id: number; razonSocial: string; ruc: string | null } | null;
  almacen: { id: number; nombre: string } | null;
  orden_trabajo: { id: number; ot: string; descripcion: string | null } | null;
  fecha_solicitud: string;
  fecha_entrega_esperada: string | null;
  fecha_entrega_real: string | null;
  estado: string;
  subtotal: number;
  impuesto: number;
  total: number;
  moneda: string;
  nro_factura: string | null;
  nro_guia: string | null;
  guia_key: string | null;
  guia_nombre: string | null;
  factura_key: string | null;
  factura_nombre: string | null;
  observaciones: string | null;
  usuario_solicita: string;
  usuario_aprueba: string | null;
  detalles: Array<{
    id: number;
    material_id: number;
    material: { codigo: string; descripcion: string } | null;
    cantidad: number;
    precio_unitario: number;
    subtotal: number;
    impuesto: number;
    total: number;
  }>;
  ot_repuestos: Array<{
    id: number;
    nro_req: string | null;
    item_req: number | null;
    descripcion: string | null;
    cantidad: number;
    precio_unitario: number | null;
    estado: string;
    material: { codigo: string; descripcion: string } | null;
    orden_trabajo: { id: number; ot: string } | null;
  }>;
}

const estadoColor: Record<string, string> = {
  Pendiente: "gold",
  Aprobado: "blue",
  "En Proceso": "cyan",
  Recibido: "green",
  Cancelado: "red",
};

export default function CompraDetalleModal({ compraId, open, onClose, onUpdated }: Props) {
  const { message } = App.useApp();
  const { screens } = useResponsive();
  const [compra, setCompra] = useState<CompraDetalle | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [estado, setEstado] = useState<string>("");
  const [fechaEntrega, setFechaEntrega] = useState<Dayjs | null>(null);
  const [fechaEntregaEsp, setFechaEntregaEsp] = useState<Dayjs | null>(null);
  const [nroFactura, setNroFactura] = useState<string>("");
  const [nroGuia, setNroGuia] = useState<string>("");
  const [observaciones, setObservaciones] = useState<string>("");
  const [aceptando, setAceptando] = useState(false);
  const { ocultas: itemsOcultas, setOcultas: setItemsOcultas } = useColumnasOcultas("compra-detalle-items-cols-v1");

  const [roles, setRoles] = useState<string[]>([]);
  const isAdmin = roles.includes("admin");
  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (Array.isArray(d?.user?.roles)) setRoles(d.user.roles); })
      .catch(() => { /* noop */ });
  }, []);

  const cargar = useCallback(async () => {
    if (!compraId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/compras/${compraId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      setCompra(json.data);
      setEstado(json.data.estado);
      setFechaEntrega(json.data.fecha_entrega_real ? dayjs(json.data.fecha_entrega_real) : null);
      setFechaEntregaEsp(json.data.fecha_entrega_esperada ? dayjs(json.data.fecha_entrega_esperada) : null);
      setNroFactura(json.data.nro_factura || "");
      setNroGuia(json.data.nro_guia || "");
      setObservaciones(json.data.observaciones || "");
    } catch {
      message.error("Error al cargar la OC");
    } finally {
      setLoading(false);
    }
  }, [compraId, message]);

  useEffect(() => {
    if (open && compraId) cargar();
    else setCompra(null);
  }, [open, compraId, cargar]);

  const guardar = async () => {
    if (!compra) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/compras/${compra.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estado,
          fecha_entrega_real: fechaEntrega ? fechaEntrega.format("YYYY-MM-DD") : null,
          fecha_entrega_esperada: fechaEntregaEsp ? fechaEntregaEsp.format("YYYY-MM-DD") : null,
          nro_factura: nroFactura,
          nro_guia: nroGuia,
          observaciones,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      message.success("OC actualizada");
      setEditing(false);
      cargar();
      onUpdated?.();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const subirArchivo = async (tipo: "guia" | "factura", file: File) => {
    if (!compra) return;
    try {
      const meta = await uploadToR2({
        file,
        uploadUrlEndpoint: `/api/compras/${compra.id}/guia/upload-url?tipo=${tipo}`,
      });
      const res = await fetch(`/api/compras/${compra.id}/guia?tipo=${tipo}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(meta),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al registrar archivo");
      message.success(`${tipo === "guia" ? "Guía" : "Factura"} subida`);
      cargar();
      onUpdated?.();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Error al subir archivo");
    }
  };

  const eliminarArchivo = async (tipo: "guia" | "factura") => {
    if (!compra) return;
    try {
      const res = await fetch(`/api/compras/${compra.id}/guia?tipo=${tipo}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al eliminar archivo");
      message.success("Archivo eliminado");
      cargar();
      onUpdated?.();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Error al eliminar archivo");
    }
  };

  const aceptarOC = async () => {
    if (!compra) return;
    try {
      setAceptando(true);
      const res = await fetch(`/api/compras/${compra.id}/aceptar`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al aceptar OC");
      message.success("OC aceptada");
      cargar();
      onUpdated?.();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Error al aceptar OC");
    } finally {
      setAceptando(false);
    }
  };

  const items = compra?.ot_repuestos ?? [];
  const columnsItems: ColumnsType<CompraDetalle["ot_repuestos"][0]> = [
    {
      key: "ot",
      title: "OT",
      width: 110,
      filters: [...new Set(items.map((r) => r.orden_trabajo?.ot).filter(Boolean) as string[])]
        .sort()
        .map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, r) => r.orden_trabajo?.ot === value,
      render: (_, r) => (r.orden_trabajo ? <Tag color={brand.navy}>{r.orden_trabajo.ot}</Tag> : "-"),
    },
    { key: "nro_req", title: "Nro REQ", dataIndex: "nro_req", width: 110, ...filtroPorColumna(items, "nro_req") },
    {
      key: "item_req", title: "Item", dataIndex: "item_req", width: 55, align: "center",
      sorter: (a, b) => (a.item_req ?? 0) - (b.item_req ?? 0),
      filters: [...new Set(items.map((r) => r.item_req).filter((v): v is number => v != null))]
        .sort((a, b) => a - b).map((v) => ({ text: String(v), value: String(v) })),
      filterSearch: true,
      onFilter: (value, r) => String(r.item_req) === value,
    },
    {
      key: "codigo",
      title: "Código",
      width: 100,
      filters: [...new Set(items.map((r) => r.material?.codigo).filter(Boolean) as string[])]
        .sort()
        .map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, r) => r.material?.codigo === value,
      render: (_, r) => r.material?.codigo ?? "-",
    },
    {
      key: "descripcion",
      title: "Descripción",
      width: 250,
      ellipsis: true,
      filters: [...new Set(items.map((r) => r.material?.descripcion ?? r.descripcion).filter(Boolean) as string[])]
        .sort().map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, r) => (r.material?.descripcion ?? r.descripcion) === value,
      render: (_, r) => r.material?.descripcion ?? r.descripcion ?? "-",
    },
    {
      key: "cantidad", title: "Cant.", dataIndex: "cantidad", width: 70, align: "center",
      sorter: (a, b) => Number(a.cantidad) - Number(b.cantidad),
      filters: [...new Set(items.map((r) => Number(r.cantidad)))]
        .sort((a, b) => a - b).map((v) => ({ text: String(v), value: String(v) })),
      filterSearch: true,
      onFilter: (value, r) => String(Number(r.cantidad)) === value,
    },
    {
      key: "precio_unitario",
      title: "P. Unit.",
      dataIndex: "precio_unitario",
      width: 90,
      align: "right",
      sorter: (a, b) => Number(a.precio_unitario ?? 0) - Number(b.precio_unitario ?? 0),
      filters: [...new Set(items.map((r) => Number(r.precio_unitario ?? 0)))]
        .sort((a, b) => a - b).map((v) => ({ text: v.toFixed(2), value: String(v) })),
      filterSearch: true,
      onFilter: (value, r) => String(Number(r.precio_unitario ?? 0)) === value,
      render: (v) => (v != null ? Number(v).toFixed(2) : "-"),
    },
    {
      key: "subtotal",
      title: "Subtotal",
      width: 100,
      align: "right",
      sorter: (a, b) => Number(a.precio_unitario ?? 0) * Number(a.cantidad) - Number(b.precio_unitario ?? 0) * Number(b.cantidad),
      filters: [...new Set(items.map((r) =>
        r.precio_unitario != null ? Number((Number(r.precio_unitario) * Number(r.cantidad)).toFixed(2)) : 0
      ))].sort((a, b) => a - b).map((v) => ({ text: v.toFixed(2), value: String(v) })),
      filterSearch: true,
      onFilter: (value, r) => {
        const sub = r.precio_unitario != null ? Number((Number(r.precio_unitario) * Number(r.cantidad)).toFixed(2)) : 0;
        return String(sub) === value;
      },
      render: (_, r) =>
        r.precio_unitario != null
          ? (Number(r.precio_unitario) * Number(r.cantidad)).toFixed(2)
          : "-",
    },
    {
      key: "estado",
      title: "Estado",
      dataIndex: "estado",
      width: 100,
      ...filtroPorColumna(items, "estado"),
      render: (v: string) => <Tag>{v}</Tag>,
    },
  ];

  const { columnas: columnsItemsResizable, components: itemsTableComponents } =
    useColumnasRedimensionables<CompraDetalle["ot_repuestos"][0]>(
      columnsItems,
      "compra-detalle-items-cols-widths-v1",
    );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={screens.md ? "90vw" : "100vw"}
      style={{ top: 20 }}
      styles={{ body: { padding: 0 }, header: { display: "none" } }}
      footer={null}
      destroyOnHidden
    >
      {/* Header */}
      <div
        style={{
          background: brand.navy,
          padding: "16px 24px",
          borderRadius: "8px 8px 0 0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ color: brand.white, fontSize: 18, fontWeight: 700 }}>
            Orden de Compra: {compra?.numero_po ?? "..."}
          </div>
          <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 2 }}>
            Proveedor: {compra?.proveedor?.razonSocial ?? "-"} &nbsp;|&nbsp; Estado:{" "}
            <Tag color={estadoColor[compra?.estado ?? ""] ?? "default"}>{compra?.estado}</Tag>
          </div>
        </div>
        <Space>
          {isAdmin && compra?.estado === "Pendiente" && !editing && (
            <Popconfirm
              title={`¿Aceptar la OC ${compra.numero_po}?`}
              description="La OC pasará a En Proceso y se registrará tu usuario como aprobador."
              onConfirm={aceptarOC}
              okText="Aceptar"
              cancelText="Cancelar"
            >
              <Button
                icon={<CheckOutlined />}
                loading={aceptando}
                size="small"
                style={{ background: "#52c41a", border: "none", color: brand.white }}
              >
                Aceptar OC
              </Button>
            </Popconfirm>
          )}
          {!editing ? (
            <Button
              icon={<EditOutlined />}
              onClick={() => setEditing(true)}
              size="small"
              style={{ background: brand.cyan, border: "none", color: brand.white }}
            >
              Editar
            </Button>
          ) : (
            <Button
              icon={<SaveOutlined />}
              onClick={guardar}
              loading={saving}
              size="small"
              style={{ background: "#52c41a", border: "none", color: brand.white }}
            >
              Guardar
            </Button>
          )}
          <Button
            icon={<PrinterOutlined />}
            onClick={() => compra?.id && window.open(`/api/compras/${compra.id}/pdf`, "_blank")}
            size="small"
            style={{ background: "rgba(255,255,255,0.12)", border: "none", color: brand.white }}
          >
            Imprimir
          </Button>
          <Button
            icon={<CloseOutlined />}
            onClick={onClose}
            size="small"
            style={{ background: "rgba(255,255,255,0.12)", border: "none", color: brand.white }}
          >
            Cerrar
          </Button>
        </Space>
      </div>

      {loading || !compra ? (
        <div style={{ textAlign: "center", padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : (
        <div style={{ padding: 24 }}>
          {/* Totales */}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card size="small" styles={{ body: { padding: 12 } }}>
                <Statistic title="Items" value={compra.ot_repuestos.length || compra.detalles.length} />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small" styles={{ body: { padding: 12 } }}>
                <Statistic title="Subtotal" value={Number(compra.subtotal)} precision={2} prefix="$" />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small" styles={{ body: { padding: 12 } }}>
                <Statistic title="IGV" value={Number(compra.impuesto)} precision={2} prefix="$" />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small" styles={{ body: { padding: 12 } }}>
                <Statistic
                  title="Total"
                  value={Number(compra.total)}
                  precision={2}
                  prefix={compra.moneda + " $"}
                  styles={{ content: { color: brand.navy, fontWeight: 700 } }}
                />
              </Card>
            </Col>
          </Row>

          {/* Datos de la OC */}
          <Card size="small" title="Información de la OC" style={{ marginBottom: 16 }}>
            <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 3 }}>
              <Descriptions.Item label="Proveedor">{compra.proveedor?.razonSocial ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="RUC">{compra.proveedor?.ruc ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="Almacén">{compra.almacen?.nombre ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="F. Solicitud">
                {formatDateOnly(compra.fecha_solicitud)}
              </Descriptions.Item>
              <Descriptions.Item label="F. Entrega Esperada">
                {editing ? (
                  <DatePicker
                    value={fechaEntregaEsp}
                    onChange={setFechaEntregaEsp}
                    format="DD/MM/YYYY"
                    style={{ width: "100%" }}
                    allowClear
                  />
                ) : compra.fecha_entrega_esperada ? (
                  formatDateOnly(compra.fecha_entrega_esperada)
                ) : (
                  "-"
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Moneda">{compra.moneda}</Descriptions.Item>
              <Descriptions.Item label="Estado">
                {editing ? (
                  <Select
                    value={estado}
                    onChange={setEstado}
                    style={{ width: 150 }}
                    options={[
                      { value: "Pendiente", label: "Pendiente" },
                      { value: "Aprobado", label: "Aprobado" },
                      { value: "En Proceso", label: "En Proceso" },
                      { value: "Recibido", label: "Recibido" },
                      { value: "Cancelado", label: "Cancelado" },
                    ]}
                  />
                ) : (
                  <Tag color={estadoColor[compra.estado] || "default"}>{compra.estado}</Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="F. Entrega Real">
                {editing ? (
                  <DatePicker value={fechaEntrega} onChange={setFechaEntrega} format="DD/MM/YYYY" style={{ width: "100%" }} />
                ) : compra.fecha_entrega_real ? (
                  formatDateOnly(compra.fecha_entrega_real)
                ) : (
                  "-"
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Nro Factura">
                {editing ? (
                  <Input value={nroFactura} onChange={(e) => setNroFactura(e.target.value)} />
                ) : (
                  compra.nro_factura ?? "-"
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Nro Guía">
                {editing ? (
                  <Input value={nroGuia} onChange={(e) => setNroGuia(e.target.value)} />
                ) : (
                  compra.nro_guia ?? "-"
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Archivo Guía de Remisión" span={editing ? 1 : 1}>
                <ArchivoSlot
                  tipo="guia"
                  compraId={compra.id}
                  r2Key={compra.guia_key}
                  nombre={compra.guia_nombre}
                  editing={editing}
                  onUpload={(f) => subirArchivo("guia", f)}
                  onDelete={() => eliminarArchivo("guia")}
                />
              </Descriptions.Item>
              <Descriptions.Item label="Archivo Factura">
                <ArchivoSlot
                  tipo="factura"
                  compraId={compra.id}
                  r2Key={compra.factura_key}
                  nombre={compra.factura_nombre}
                  editing={editing}
                  onUpload={(f) => subirArchivo("factura", f)}
                  onDelete={() => eliminarArchivo("factura")}
                />
              </Descriptions.Item>
              <Descriptions.Item label="Usuario Solicita">{compra.usuario_solicita}</Descriptions.Item>
              <Descriptions.Item label="Usuario Aprueba">{compra.usuario_aprueba ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="Observaciones" span={3}>
                {editing ? (
                  <Input.TextArea rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
                ) : (
                  compra.observaciones ?? <Text type="secondary">Sin observaciones</Text>
                )}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          {/* Items de la OC */}
          <Card
            size="small"
            title={`Items de la OC (${compra.ot_repuestos.length})`}
            extra={
              <ColumnasToggleButton<CompraDetalle["ot_repuestos"][0]>
                columns={columnsItems}
                ocultas={itemsOcultas}
                setOcultas={setItemsOcultas}
                obligatorias={["ot", "descripcion"]}
              />
            }
          >
            <Table
              rowKey="id"
              columns={visibleColumns(columnsItemsResizable, itemsOcultas)}
              components={itemsTableComponents}
              dataSource={compra.ot_repuestos}
              pagination={false}
              size="small"
              scroll={{ x: 1100 }}
            />
          </Card>
        </div>
      )}
    </Modal>
  );
}

// Slot reutilizable para Guía de Remisión / Factura: muestra el archivo subido
// (descargar / eliminar) y permite subir uno nuevo cuando se está editando.
// El download usa presigned URL via R2FileLink.
function ArchivoSlot({
  tipo, compraId, r2Key, nombre, editing, onUpload, onDelete,
}: {
  tipo: "guia" | "factura";
  compraId: number;
  r2Key: string | null;
  nombre: string | null;
  editing: boolean;
  onUpload: (f: File) => void;
  onDelete: () => void;
}) {
  const label = tipo === "guia" ? "guía" : "factura";
  const resource = tipo === "guia" ? "compra-guia" : "compra-factura";
  return (
    <Space wrap size={6}>
      {r2Key ? (
        <>
          <R2FileLink
            resource={resource}
            resourceId={compraId}
            r2Key={r2Key}
            style={{ fontSize: 12 }}
          >
            <FileTextOutlined style={{ color: brand.cyan, marginRight: 4 }} />
            {nombre || `Ver ${label}`}
          </R2FileLink>
          {editing && (
            <Popconfirm title={`¿Eliminar ${label}?`} onConfirm={onDelete} okType="danger" okText="Eliminar">
              <Button size="small" type="text" danger icon={<DeleteOutlined />} title="Eliminar" />
            </Popconfirm>
          )}
        </>
      ) : (
        <Text type="secondary" style={{ fontSize: 12 }}>Sin archivo</Text>
      )}
      {editing && (
        <Upload
          showUploadList={false}
          accept=".pdf,image/*"
          beforeUpload={(file) => { onUpload(file as File); return false; }}
        >
          <Button size="small" icon={<UploadOutlined />}>
            {r2Key ? "Reemplazar" : "Subir"}
          </Button>
        </Upload>
      )}
    </Space>
  );
}
