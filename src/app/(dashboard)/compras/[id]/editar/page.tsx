"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Typography, Card, Button, Space, Table, Input, InputNumber, DatePicker, Alert,
  Popconfirm, message, Tag, Row, Col, Statistic, Spin, Empty,
} from "antd";
import {
  SaveOutlined, PlusOutlined, DeleteOutlined, RollbackOutlined,
  EditOutlined, FileTextOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import { brand } from "@/lib/theme";
import { useUnsavedChangesWarning, confirmLeave } from "@/lib/unsaved-changes";
import { useColumnasRedimensionables, STICKY_HEADER } from "@/lib/tables";

const { Title, Text } = Typography;

interface ItemRow {
  // Identificador local (siempre presente para tracking en la tabla)
  _localId: string;
  // id en BD: null = nuevo, presente = existente
  id: number | null;
  material_id: number | null;
  material_codigo: string | null;
  descripcion: string | null;
  texto: string | null;
  unidad_medida: string;
  cantidad: number;
  precio_unitario: number;
  moneda: string | null;
  fabricante_codigo: string | null;
  fecha_entrega_esperada: string | null;
  _deleted?: boolean;
}

interface CompraData {
  id: number;
  numero_po: string;
  numero_req: string | null;
  nombre: string | null;
  proveedor_nombre: string | null;
  moneda: string;
  status_oc_codigo: string | null;
  estado: string;
  fecha_entrega_esperada: string | null;
  descuento: number | string | null;
  otros: number | string | null;
  ot_repuestos: Array<{
    id: number;
    material_id: number | null;
    material_codigo: string | null;
    descripcion: string | null;
    texto: string | null;
    unidad_medida: string | null;
    cantidad: number;
    precio_unitario: number | null;
    moneda: string | null;
    fabricante_codigo: string | null;
  }>;
}

function genLocalId() {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function EditarOCPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const compraId = Number(params.id);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [compra, setCompra] = useState<CompraData | null>(null);
  const [rows, setRows] = useState<ItemRow[]>([]);
  const [originalRowsHash, setOriginalRowsHash] = useState<string>("");
  const [descuento, setDescuento] = useState<number>(0);
  const [otros, setOtros] = useState<number>(0);
  const [originalDescuento, setOriginalDescuento] = useState<number>(0);
  const [originalOtros, setOriginalOtros] = useState<number>(0);
  const [numeroReq, setNumeroReq] = useState<string>("");
  const [originalNumeroReq, setOriginalNumeroReq] = useState<string>("");
  const [messageApi, contextHolder] = message.useMessage();

  const fetchCompra = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/compras/${compraId}`);
      if (!res.ok) throw new Error("No se pudo cargar la OC");
      const json = await res.json();
      const c: CompraData = json.data;
      setCompra(c);
      const mapped: ItemRow[] = (c.ot_repuestos ?? []).map((it) => ({
        _localId: `db-${it.id}`,
        id: it.id,
        material_id: it.material_id,
        material_codigo: it.material_codigo,
        descripcion: it.descripcion,
        texto: it.texto,
        unidad_medida: it.unidad_medida ?? "UNIDAD",
        cantidad: Number(it.cantidad ?? 0),
        precio_unitario: it.precio_unitario != null ? Number(it.precio_unitario) : 0,
        moneda: it.moneda ?? c.moneda,
        fabricante_codigo: it.fabricante_codigo,
        fecha_entrega_esperada: null,
      }));
      setRows(mapped);
      setOriginalRowsHash(JSON.stringify(mapped));
      const desc = Number(c.descuento ?? 0);
      const otr = Number(c.otros ?? 0);
      setDescuento(desc);
      setOtros(otr);
      setOriginalDescuento(desc);
      setOriginalOtros(otr);
      const ref = c.numero_req ?? "";
      setNumeroReq(ref);
      setOriginalNumeroReq(ref);
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [compraId, messageApi]);

  useEffect(() => { fetchCompra(); }, [fetchCompra]);

  const updateRow = (localId: string, patch: Partial<ItemRow>) => {
    setRows((prev) => prev.map((r) => r._localId === localId ? { ...r, ...patch } : r));
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        _localId: genLocalId(),
        id: null,
        material_id: null,
        material_codigo: null,
        descripcion: "",
        texto: null,
        unidad_medida: "UNIDAD",
        cantidad: 1,
        precio_unitario: 0,
        moneda: compra?.moneda ?? "USD",
        fabricante_codigo: null,
        fecha_entrega_esperada: null,
      },
    ]);
  };

  const deleteRow = (localId: string) => {
    setRows((prev) => prev.map((r) => {
      if (r._localId !== localId) return r;
      // Si es nuevo (sin id en BD), removerlo de la lista
      if (r.id == null) return { ...r, _deleted: true };
      return { ...r, _deleted: true };
    }).filter((r) => !(r.id == null && r._deleted)));
  };

  const visibleRows = useMemo(() => rows.filter((r) => !r._deleted), [rows]);
  const hayCambios = useMemo(() =>
    JSON.stringify(visibleRows) !== originalRowsHash
    || rows.some((r) => r._deleted && r.id != null)
    || descuento !== originalDescuento
    || otros !== originalOtros
    || numeroReq !== originalNumeroReq,
  [visibleRows, originalRowsHash, rows, descuento, originalDescuento, otros, originalOtros, numeroReq, originalNumeroReq]);

  useUnsavedChangesWarning(hayCambios, "Hay cambios sin guardar en la OC.", `compra-editar-${params?.id ?? "?"}`);

  const totales = useMemo(() => {
    const subtotal = visibleRows.reduce((s, r) => s + r.cantidad * r.precio_unitario, 0);
    // Convención HP&K: descuento aplica al subtotal, IGV se calcula sobre la base
    // ya descontada, "otros" se suma al final.
    const baseImponible = Math.max(0, subtotal - descuento);
    const igv = baseImponible * 0.18;
    const total = baseImponible + igv + otros;
    return { subtotal, descuento, igv, otros, total };
  }, [visibleRows, descuento, otros]);

  const handleGuardar = async () => {
    if (!compra) return;
    setSaving(true);
    try {
      const payload = {
        items: visibleRows.map((r) => ({
          id: r.id,
          material_id: r.material_id,
          material_codigo: r.material_codigo,
          descripcion: r.descripcion,
          texto: r.texto,
          unidad_medida: r.unidad_medida,
          cantidad: r.cantidad,
          precio_unitario: r.precio_unitario,
          moneda: r.moneda,
          fabricante_codigo: r.fabricante_codigo,
          fecha_entrega_esperada: r.fecha_entrega_esperada,
        })),
        deleteIds: rows.filter((r) => r._deleted && r.id != null).map((r) => r.id),
        descuento,
        otros,
        numero_req: numeroReq.trim() || null,
      };
      const res = await fetch(`/api/compras/${compraId}/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al guardar");
      messageApi.success("Items guardados");
      await fetchCompra();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<ItemRow> = [
    {
      title: "#", key: "n", width: 50, align: "center",
      render: (_v, _r, idx) => <Text strong>{idx + 1}</Text>,
    },
    {
      title: "Código", key: "codigo", dataIndex: "material_codigo", width: 130, align: "left",
      render: (v: string | null, r) => (
        <Input
          size="small"
          value={v ?? ""}
          placeholder="—"
          onChange={(e) => updateRow(r._localId, { material_codigo: e.target.value || null })}
        />
      ),
    },
    {
      title: "Descripción", key: "desc", dataIndex: "descripcion", width: 320, align: "left",
      render: (v: string | null, r) => (
        <Input.TextArea
          size="small"
          value={v ?? ""}
          placeholder="Descripción del item"
          autoSize={{ minRows: 1, maxRows: 3 }}
          onChange={(e) => updateRow(r._localId, { descripcion: e.target.value || null })}
        />
      ),
    },
    {
      title: "UM", key: "um", dataIndex: "unidad_medida", width: 90, align: "center",
      render: (v: string, r) => (
        <Input
          size="small"
          value={v ?? "UNIDAD"}
          onChange={(e) => updateRow(r._localId, { unidad_medida: e.target.value || "UNIDAD" })}
          style={{ textAlign: "center" }}
        />
      ),
    },
    {
      title: "Cantidad", key: "cant", dataIndex: "cantidad", width: 100, align: "right",
      render: (v: number, r) => (
        <InputNumber
          size="small"
          value={v}
          min={0}
          step={1}
          precision={2}
          style={{ width: "100%" }}
          onChange={(val) => updateRow(r._localId, { cantidad: val == null ? 0 : Number(val) })}
        />
      ),
    },
    {
      title: "Precio Unit.", key: "precio", dataIndex: "precio_unitario", width: 120, align: "right",
      render: (v: number, r) => (
        <InputNumber
          size="small"
          value={v}
          min={0}
          step={0.01}
          precision={2}
          style={{ width: "100%" }}
          onChange={(val) => updateRow(r._localId, { precio_unitario: val == null ? 0 : Number(val) })}
        />
      ),
    },
    {
      title: "Total", key: "total", width: 110, align: "right",
      render: (_v, r) => {
        const t = r.cantidad * r.precio_unitario;
        return <Text strong style={{ color: brand.navy }}>{t.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>;
      },
    },
    {
      title: "F. Entrega", key: "fent", width: 130, align: "center",
      render: (_v, r) => (
        <DatePicker
          size="small"
          value={r.fecha_entrega_esperada ? dayjs(r.fecha_entrega_esperada) : null}
          format="DD/MM/YY"
          style={{ width: "100%" }}
          onChange={(d: Dayjs | null) => updateRow(r._localId, { fecha_entrega_esperada: d ? d.toISOString() : null })}
          allowClear
        />
      ),
    },
    {
      title: "Acciones", key: "acc", width: 80, align: "center", fixed: "right",
      render: (_v, r) => (
        <Popconfirm title="¿Eliminar este item?" onConfirm={() => deleteRow(r._localId)} okType="danger" okText="Eliminar">
          <Button type="text" danger icon={<DeleteOutlined />} size="small" />
        </Popconfirm>
      ),
    },
  ];

  if (loading) {
    return <div style={{ textAlign: "center", padding: 60 }}><Spin size="large" /></div>;
  }
  if (!compra) {
    return <Empty description="OC no encontrada" />;
  }

  return (
    <div>
      {contextHolder}
      <Card style={{ marginBottom: 12, background: `linear-gradient(135deg, ${brand.navy}, ${brand.cyan})` }} styles={{ body: { padding: 16 } }}>
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Title level={4} style={{ color: brand.white, margin: 0 }}>
              <EditOutlined style={{ marginRight: 8 }} />
              Editar items de OC — {compra.numero_po}
            </Title>
            <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 12 }}>
              {compra.proveedor_nombre ?? "—"} · {compra.moneda}
              {compra.nombre && <> · <i>{compra.nombre}</i></>}
            </Text>
          </Col>
          <Col>
            <Space>
              <Button icon={<RollbackOutlined />} onClick={() => { if (confirmLeave()) router.back(); }}>Volver</Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleGuardar}
                loading={saving}
                disabled={!hayCambios}
                style={{ background: brand.success ?? "#52c41a", borderColor: brand.success ?? "#52c41a" }}
              >
                Guardar cambios
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Alert
        type="info"
        showIcon
        icon={<FileTextOutlined />}
        title="Editor tipo Excel: edita las celdas directamente, agrega filas libres y borra las que no necesites. Al guardar se recalcula el total de la OC."
        style={{ marginBottom: 12 }}
        banner
      />

      <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: 10 } }}>
        <Row gutter={12} align="middle">
          <Col xs={24} md={12}>
            <div style={{ fontSize: 12, color: brand.textSecondary, marginBottom: 2 }}>
              Ref. Pedido
            </div>
            <Input
              size="middle"
              value={numeroReq}
              maxLength={50}
              placeholder="Ej: REQ-2026-001 (aparece en la cabecera del PDF de la OC)"
              onChange={(e) => setNumeroReq(e.target.value)}
              allowClear
            />
          </Col>
        </Row>
      </Card>

      <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: 10 } }}>
        <Row gutter={12} align="middle">
          <Col xs={12} md={4}>
            <Statistic title="Items" value={visibleRows.length} />
          </Col>
          <Col xs={12} md={4}>
            <Statistic title="Subtotal" value={totales.subtotal} precision={2} prefix={compra.moneda} />
          </Col>
          <Col xs={12} md={4}>
            <div style={{ fontSize: 12, color: brand.textSecondary, marginBottom: 2 }}>Descuento</div>
            <InputNumber
              value={descuento}
              min={0}
              step={0.01}
              precision={2}
              style={{ width: "100%" }}
              prefix={compra.moneda}
              onChange={(v) => setDescuento(v == null ? 0 : Number(v))}
            />
          </Col>
          <Col xs={12} md={4}>
            <Statistic title="IGV (18%)" value={totales.igv} precision={2} prefix={compra.moneda} />
          </Col>
          <Col xs={12} md={4}>
            <div style={{ fontSize: 12, color: brand.textSecondary, marginBottom: 2 }}>Otros</div>
            <InputNumber
              value={otros}
              min={0}
              step={0.01}
              precision={2}
              style={{ width: "100%" }}
              prefix={compra.moneda}
              onChange={(v) => setOtros(v == null ? 0 : Number(v))}
            />
          </Col>
          <Col xs={12} md={4}>
            <Statistic title="TOTAL" value={totales.total} precision={2} prefix={compra.moneda} styles={{ content: { color: brand.navy, fontWeight: 700 } }} />
          </Col>
        </Row>
      </Card>

      <TablaItems columns={columns} rows={visibleRows} onAdd={addRow} />

      <div style={{ marginTop: 16, padding: 12, background: "#f6f6f6", borderRadius: 4, fontSize: 11, color: brand.textSecondary }}>
        <Tag color="orange">Tip</Tag>
        Las filas que agregás se guardan como items libres (sin material del catálogo) y se vinculan a la primera OT existente de la OC.
        Si la OC no tiene ninguna OT asociada, no podrás agregar items libres — primero tenés que generar la OC normal y luego ajustar acá.
      </div>
    </div>
  );
}

function TablaItems({
  columns, rows, onAdd,
}: { columns: ColumnsType<ItemRow>; rows: ItemRow[]; onAdd: () => void }) {
  const { columnas, components, TableDragWrapper } = useColumnasRedimensionables<ItemRow>(
    columns, "compras-editar-items-v1",
  );
  return (
    <TableDragWrapper>
      <Table<ItemRow>
        rowKey="_localId"
        size="small"
        columns={columnas}
        components={components}
        dataSource={rows}
        pagination={false}
        scroll={{ x: "max-content" }}
        sticky={STICKY_HEADER}
        bordered
        footer={() => (
          <Button type="dashed" block icon={<PlusOutlined />} onClick={onAdd}>
            Agregar fila (item libre)
          </Button>
        )}
      />
    </TableDragWrapper>
  );
}
