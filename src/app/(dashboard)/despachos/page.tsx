"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Typography, Card, Table, Tag, Space, Button, Row, Col, Statistic, Empty,
  App, Tooltip, Alert, Modal, Form, Input, DatePicker,
} from "antd";
import {
  ExportOutlined, ReloadOutlined, CheckCircleOutlined, WarningOutlined,
  InboxOutlined, EyeOutlined, SearchOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import { brand } from "@/lib/theme";
import { useResponsive, modalWidth } from "@/lib/responsive";
import {
  numeracionColumn, useColumnasOcultas, ColumnasToggleButton, visibleColumns,
  filtroPorColumna, STICKY_HEADER, useColumnasRedimensionables,
} from "@/lib/tables";
import { ExportarExcelButton } from "@/components/ExportarExcelButton";

const { Title, Text } = Typography;

interface Item {
  id: number;
  ot_id: number;
  nro_req: string | null;
  item_req: number | null;
  descripcion: string | null;
  cantidad: number | string;
  cantidad_recibida: number | string | null;
  unidad_medida: string | null;
  material_id: number | null;
  po_id: number | null;
  status_oc_codigo: string | null;
  material: { codigo: string; descripcion: string; stock_actual: number | string | null; ubicacion: string | null } | null;
  almacen_zona: { codigo: string; nombre: string } | null;
  almacen_posicion: { id: number; codigo: string } | null;
  compra: { numero_po: string; status_oc_codigo: string | null } | null;
  orden_trabajo: {
    id: number; ot: string | null;
    cliente: { codigo: string; razon_social: string; nombre_comercial: string | null } | null;
    codigo_reparacion: { codigo: string; descripcion: string } | null;
  } | null;
  _cant_pendiente: number;
  _puede_despachar: boolean;
  _po_status: string | null;
  _po_recibida: boolean;
  // Item ya consumido de almacén — el stock salió en `consumir-de-almacen`
  // y queda solo entregar al técnico (no se vuelve a tocar stock).
  _es_consumido_almacen?: boolean;
}

interface GrupoOT {
  ot_id: number;
  ot: string | null;
  cliente: string | null;
  codigo_reparacion: string | null;
  recursos_status: string | null;
  ubicacion: string | null;
  items: Item[];
  con_stock: number;
  sin_stock: number;
  estado_ot: "completa" | "incompleta";
}

export default function DespachosPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const { screens } = useResponsive();
  const [grupos, setGrupos] = useState<GrupoOT[]>([]);
  const [loading, setLoading] = useState(false);
  const [seleccionados, setSeleccionados] = useState<Record<number, number[]>>({}); // otId -> reqIds
  const [submitting, setSubmitting] = useState<number | null>(null);
  // Búsqueda libre — filtra por OT, cliente, código reparación, código material,
  // N° de parte (np en descripción) o descripción del item.
  const [filtro, setFiltro] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/despachos/ot");
      const json = await res.json();
      setGrupos(json.data ?? []);
    } catch {
      message.error("Error al cargar despachos pendientes");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Modal de "Datos del despacho" antes de confirmar.
  const [modalDespacho, setModalDespacho] = useState<{ otId: number; otLabel: string } | null>(null);
  const [formDespacho] = Form.useForm<{
    fecha_despacho: Dayjs;
    persona_recibe?: string;
    comentarios?: string;
  }>();

  const abrirModalDespacho = (otId: number, otLabel: string) => {
    const ids = seleccionados[otId] ?? [];
    if (ids.length === 0) {
      message.warning("Seleccioná al menos un item.");
      return;
    }
    formDespacho.resetFields();
    formDespacho.setFieldsValue({ fecha_despacho: dayjs() });
    setModalDespacho({ otId, otLabel });
  };

  const confirmarDespacho = async () => {
    if (!modalDespacho) return;
    const otId = modalDespacho.otId;
    const ids = seleccionados[otId] ?? [];
    if (ids.length === 0) return;
    const values = await formDespacho.validateFields().catch(() => null);
    if (!values) return;
    try {
      setSubmitting(otId);
      const res = await fetch(`/api/despachos/ot/${otId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requerimiento_ids: ids,
          fecha_despacho: values.fecha_despacho.format("YYYY-MM-DD"),
          persona_recibe: values.persona_recibe ?? null,
          comentarios: values.comentarios ?? null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      message.success(json.message || "Despachado");
      if (json.errores?.length) {
        message.warning(`${json.errores.length} item(s) con error: ${json.errores.map((e: { error: string }) => e.error).join(", ")}`);
      }
      setSeleccionados((prev) => ({ ...prev, [otId]: [] }));
      setModalDespacho(null);
      fetchData();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(null);
    }
  };

  // Filtrado client-side por el input de búsqueda. Si la OT matchea (por OT
  // número o cliente), se conserva tal cual. Si solo matchean algunos items
  // (código/np/descripción), conservamos la OT pero recortamos sus items.
  const gruposFiltrados = (() => {
    const term = filtro.trim().toLowerCase();
    if (!term) return grupos;
    return grupos
      .map((g) => {
        const otStr = `${g.ot ?? g.ot_id}`.toLowerCase();
        const clienteStr = (g.cliente ?? "").toLowerCase();
        const codRepStr = (g.codigo_reparacion ?? "").toLowerCase();
        const otMatch =
          otStr.includes(term) || clienteStr.includes(term) || codRepStr.includes(term);
        const itemsMatch = g.items.filter((it) => {
          const m = it.material;
          const haystacks = [
            m?.codigo ?? "",
            m?.descripcion ?? "",
            it.descripcion ?? "",
            it.nro_req ?? "",
          ].map((x) => x.toLowerCase());
          return haystacks.some((h) => h.includes(term));
        });
        if (otMatch) return g;
        if (itemsMatch.length === 0) return null;
        return { ...g, items: itemsMatch };
      })
      .filter((x): x is GrupoOT => x != null);
  })();

  // Items planos de los grupos ya filtrados — para la exportación a Excel
  // (cada item trae su orden_trabajo con cliente/código reparación).
  const itemsFiltrados = gruposFiltrados.flatMap((g) => g.items);

  const totalConStock = gruposFiltrados.reduce((s, g) => s + g.con_stock, 0);
  const totalSinStock = gruposFiltrados.reduce((s, g) => s + g.sin_stock, 0);
  const otsCompletas = gruposFiltrados.filter((g) => g.estado_ot === "completa").length;
  const otsIncompletas = gruposFiltrados.filter((g) => g.estado_ot === "incompleta").length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
        <Title level={3} style={{ margin: 0 }}>
          <ExportOutlined style={{ marginRight: 8 }} />
          Despachos por OT
        </Title>
        <Space wrap>
          <Input
            placeholder="Buscar OT, cliente, código o N° parte..."
            prefix={<SearchOutlined />}
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            allowClear
            style={{ width: 320, maxWidth: "100%" }}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>Actualizar</Button>
          {/* El endpoint agrupa por OT (no devuelve items planos), así que la
              descarga usa las filas planas ya filtradas por la búsqueda. */}
          <ExportarExcelButton<Item>
            endpoint="/api/despachos/ot"
            filename="Despachos-pendientes"
            currentRows={itemsFiltrados}
            columns={[
              { key: "ot", label: "OT", value: (r) => r.orden_trabajo?.ot ?? `#${r.ot_id}` },
              { key: "cliente", label: "Cliente", value: (r) => r.orden_trabajo?.cliente?.nombre_comercial ?? r.orden_trabajo?.cliente?.razon_social ?? "" },
              { key: "codrep", label: "Código reparación", value: (r) => r.orden_trabajo?.codigo_reparacion?.codigo ?? "" },
              { key: "nro_req", label: "Req / Item", value: (r) => `${r.nro_req ?? "—"}/${r.item_req ?? "—"}` },
              { key: "codigo", label: "Código", value: (r) => r.material?.codigo ?? "" },
              { key: "desc", label: "Descripción", value: (r) => r.material?.descripcion ?? r.descripcion ?? "" },
              { key: "cantidad", label: "Pedido", value: (r) => Number(r.cantidad) },
              { key: "unidad", label: "Unidad", value: (r) => r.unidad_medida ?? "" },
              { key: "pendiente", label: "Pendiente", value: (r) => r._cant_pendiente },
              { key: "stock", label: "Stock alm.", value: (r) => Number(r.material?.stock_actual ?? 0) },
              {
                key: "origen", label: "Origen / PO",
                value: (r) => !r.po_id
                  ? "Stock directo"
                  : `${r.compra?.numero_po ?? `PO#${r.po_id}`} ${r._po_recibida ? "(recibida)" : "(por llegar)"}`,
              },
              {
                key: "ubicacion", label: "Ubicación",
                value: (r) => r.almacen_zona
                  ? `${r.almacen_zona.codigo}${r.almacen_posicion ? ` · ${r.almacen_posicion.codigo}` : ""}`
                  : (r.material?.ubicacion ?? ""),
              },
              { key: "puede", label: "Puede despachar", value: (r) => r._puede_despachar ? "Sí" : "No" },
            ]}
          />
        </Space>
      </div>

      <Alert
        type="info" showIcon style={{ marginBottom: 12 }}
        title="¿Qué es esto?"
        description="OTs con requerimientos APROBADOS pendientes de entrega. Incluye items con OC ya recibida (material llegó al almacén) e items que ya estaban en stock. Una OT 'completa' tiene todos sus items con stock listo; 'incompleta' espera que llegue parte del material. Podés despachar parcial o completo: descuenta stock + marca ENTREGADO/INCOMPLETO + deja traza en historial."
      />

      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} md={4}><Card><Statistic title="OTs pendientes" value={gruposFiltrados.length} prefix={<InboxOutlined style={{ color: brand.navy }} />} /></Card></Col>
        <Col xs={12} md={5}><Card><Statistic title="OTs completas" value={otsCompletas} styles={{ content: { color: "#52c41a" } }} prefix={<CheckCircleOutlined style={{ color: "#52c41a" }} />} /></Card></Col>
        <Col xs={12} md={5}><Card><Statistic title="OTs incompletas" value={otsIncompletas} styles={{ content: { color: otsIncompletas > 0 ? "#fa8c16" : "#bfbfbf" } }} prefix={<WarningOutlined style={{ color: otsIncompletas > 0 ? "#fa8c16" : "#bfbfbf" }} />} /></Card></Col>
        <Col xs={12} md={5}><Card><Statistic title="Items listos" value={totalConStock} styles={{ content: { color: "#52c41a" } }} /></Card></Col>
        <Col xs={12} md={5}><Card><Statistic title="Items sin stock" value={totalSinStock} styles={{ content: { color: totalSinStock > 0 ? "#cf1322" : "#bfbfbf" } }} /></Card></Col>
      </Row>

      {gruposFiltrados.length === 0 && !loading ? (
        <Empty description={filtro ? `Sin resultados para "${filtro}".` : "No hay despachos pendientes."} />
      ) : (
        gruposFiltrados.map((g) => <GrupoCard
          key={g.ot_id}
          grupo={g}
          seleccionados={seleccionados[g.ot_id] ?? []}
          onSelectChange={(ids) => setSeleccionados((prev) => ({ ...prev, [g.ot_id]: ids }))}
          onDespachar={() => abrirModalDespacho(g.ot_id, g.ot ?? `OT #${g.ot_id}`)}
          submitting={submitting === g.ot_id}
          router={router}
        />)
      )}

      {/* Modal de datos del despacho */}
      <Modal
        title={modalDespacho ? `Despachar — ${modalDespacho.otLabel}` : ""}
        open={!!modalDespacho}
        onCancel={() => setModalDespacho(null)}
        onOk={confirmarDespacho}
        confirmLoading={modalDespacho ? submitting === modalDespacho.otId : false}
        okText={`Despachar ${modalDespacho ? (seleccionados[modalDespacho.otId] ?? []).length : 0} item(s)`}
        cancelText="Cancelar"
        width={modalWidth(screens, 520)}
      >
        <Form form={formDespacho} layout="vertical" preserve={false}>
          <Form.Item
            name="fecha_despacho"
            label="Fecha de despacho"
            rules={[{ required: true, message: "Fecha requerida" }]}
          >
            <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item
            name="persona_recibe"
            label="Persona que recibe"
            tooltip="Nombre de quien retira el material en la planta del cliente"
          >
            <Input placeholder="Nombre de la persona" maxLength={150} />
          </Form.Item>
          <Form.Item name="comentarios" label="Comentarios">
            <Input.TextArea rows={3} placeholder="Observaciones del despacho..." maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function GrupoCard({
  grupo, seleccionados, onSelectChange, onDespachar, submitting, router,
}: {
  grupo: GrupoOT;
  seleccionados: number[];
  onSelectChange: (ids: number[]) => void;
  onDespachar: () => void;
  submitting: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  const { ocultas, setOcultas } = useColumnasOcultas(`despachos-ot-${grupo.ot_id}-cols-v1`);

  const columns: ColumnsType<Item> = [
    numeracionColumn<Item>(),
    {
      key: "nro_req", title: "Req / Item", width: 130,
      ...filtroPorColumna(grupo.items, "nro_req"),
      render: (_, r) => <Text strong style={{ fontSize: 12 }}>{r.nro_req ?? "—"}/{r.item_req ?? "—"}</Text>,
    },
    {
      key: "codigo", title: "Código", width: 110,
      render: (_, r) => r.material?.codigo ?? "—",
    },
    {
      key: "desc", title: "Descripción", ellipsis: true,
      render: (_, r) => r.material?.descripcion ?? r.descripcion ?? "—",
    },
    {
      key: "cantidad", title: "Pedido", width: 100, align: "right",
      render: (_, r) => `${Number(r.cantidad).toLocaleString()} ${r.unidad_medida ?? ""}`,
    },
    {
      key: "pendiente", title: "Pendiente", width: 100, align: "right",
      render: (_, r) => <span style={{ fontWeight: 600 }}>{r._cant_pendiente.toLocaleString()}</span>,
    },
    {
      key: "stock", title: "Stock alm.", width: 90, align: "right",
      render: (_, r) => {
        // Para items ya consumidos de almacén el stock ya salió — no aplica.
        if (r._es_consumido_almacen) return <Text type="secondary">—</Text>;
        const st = Number(r.material?.stock_actual ?? 0);
        return <span style={{ color: r._puede_despachar ? "#52c41a" : "#cf1322", fontWeight: 600 }}>{st}</span>;
      },
    },
    {
      key: "origen", title: "Origen / PO", width: 170, align: "center",
      render: (_, r) => {
        if (r._es_consumido_almacen) {
          return <Tag color="cyan">📦 De almacén</Tag>;
        }
        if (!r.po_id) return <Tag color="default">Stock directo</Tag>;
        const recibida = r._po_recibida;
        return (
          <Tooltip title={`PO ${r.compra?.numero_po ?? r.po_id} — ${r._po_status ?? "—"}`}>
            <Tag color={recibida ? "green" : "orange"}>
              {r.compra?.numero_po ?? `PO#${r.po_id}`} {recibida ? "✓ recibida" : "⏳ por llegar"}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      key: "ubicacion", title: "Ubicación", width: 140,
      render: (_, r) => {
        // Prioridad: zona/posición física (asignada al recepcionar la PO)
        // > campo libre legacy en Material.ubicacion.
        if (r.almacen_zona) {
          const pos = r.almacen_posicion?.codigo;
          return (
            <Tag color="purple" style={{ margin: 0 }}>
              {r.almacen_zona.codigo}{pos ? ` · ${pos}` : ""}
            </Tag>
          );
        }
        if (r.material?.ubicacion) return <Tag>{r.material.ubicacion}</Tag>;
        return <Text type="secondary">—</Text>;
      },
    },
    {
      key: "puede", title: "Puede despachar", width: 150, align: "center",
      render: (_, r) => {
        if (r._es_consumido_almacen) {
          return <Tag color="green">✓ Listo (de almacén)</Tag>;
        }
        return r._puede_despachar
          ? <Tag color="green">✓ Sí</Tag>
          : <Tag color="red">✗ Sin stock</Tag>;
      },
    },
  ];

  const { columnas: columnsResizable, components: tableComponents } =
    useColumnasRedimensionables<Item>(columns, "despachos-list-cols-widths-v1");

  // Solo items que pueden despacharse (stock suficiente para lo pendiente)
  const itemsConStock = grupo.items.filter((i) => i._puede_despachar);

  return (
    <Card
      size="small"
      style={{ marginBottom: 12 }}
      title={
        <Space wrap>
          <Tag color={brand.navy} style={{ fontSize: 14, padding: "4px 8px" }}>{grupo.ot ?? `OT #${grupo.ot_id}`}</Tag>
          <Text>{grupo.cliente ?? "—"}</Text>
          {grupo.codigo_reparacion && <Text type="secondary">| {grupo.codigo_reparacion}</Text>}
          {grupo.estado_ot === "completa"
            ? <Tag color="green" style={{ fontWeight: 600 }}>OT COMPLETA — lista para despachar</Tag>
            : <Tag color="orange" style={{ fontWeight: 600 }}>OT INCOMPLETA — falta material</Tag>}
          {grupo.recursos_status && <Tag color="blue">{grupo.recursos_status}</Tag>}
          {grupo.ubicacion
            ? <Tag color="purple">📍 {grupo.ubicacion}</Tag>
            : <Tag>📍 Sin ubicación (asignar al recibir PO)</Tag>}
          <Tag color="green">{grupo.con_stock} listo(s)</Tag>
          {grupo.sin_stock > 0 && <Tag color="red">{grupo.sin_stock} sin stock</Tag>}
        </Space>
      }
      extra={
        <Space wrap>
          <Tooltip title="Ver OT">
            <Button size="small" icon={<EyeOutlined />} onClick={() => router.push(`/ordenes-trabajo/${grupo.ot_id}`)} />
          </Tooltip>
          <ColumnasToggleButton<Item>
            columns={columns}
            ocultas={ocultas}
            setOcultas={setOcultas}
            obligatorias={["nro_req", "desc", "cantidad", "puede"]}
          />
          <Button
            type="primary"
            icon={<ExportOutlined />}
            disabled={seleccionados.length === 0}
            loading={submitting}
            onClick={onDespachar}
          >
            Despachar seleccionados ({seleccionados.length})
          </Button>
        </Space>
      }
    >
      <Table<Item>
        rowKey="id"
        size="small"
        columns={visibleColumns(columnsResizable, ocultas)}
        components={tableComponents}
        dataSource={grupo.items}
        sticky={STICKY_HEADER}
        scroll={{ x: 1200 }}
        pagination={false}
        rowSelection={{
          selectedRowKeys: seleccionados,
          onChange: (keys) => onSelectChange(keys as number[]),
          getCheckboxProps: (r) => ({ disabled: !r._puede_despachar }),
        }}
        footer={() => (
          <Space>
            <Button size="small" onClick={() => onSelectChange(itemsConStock.map((i) => i.id))} disabled={itemsConStock.length === 0}>
              Seleccionar todos con stock ({itemsConStock.length})
            </Button>
            <Button size="small" onClick={() => onSelectChange([])} disabled={seleccionados.length === 0}>
              Limpiar selección
            </Button>
          </Space>
        )}
      />
    </Card>
  );
}
