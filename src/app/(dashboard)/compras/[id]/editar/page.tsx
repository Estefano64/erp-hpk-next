"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Typography, Card, Button, Space, Table, Input, InputNumber, DatePicker, Alert,
  Popconfirm, message, Tag, Row, Col, Statistic, Spin, Empty, Switch, Tooltip, Select,
  Modal,
} from "antd";
import {
  SaveOutlined, PlusOutlined, DeleteOutlined, RollbackOutlined,
  EditOutlined, FileTextOutlined, ImportOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import { brand } from "@/lib/theme";
import { useUnsavedChangesWarning, confirmLeave } from "@/lib/unsaved-changes";
import { useColumnasRedimensionables, STICKY_HEADER } from "@/lib/tables";
import { formatOtCodigo, formatOtInternaCodigo } from "@/lib/ot-formato";

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
  // OT derivada (read-only): código formateado de la OT externa o interna a
  // la que pertenece el req. Si el item es nuevo (sin id en BD), se hereda
  // de la OT default de la OC (la primera existente). El user lo veía vacío
  // antes y lo llenaba a mano en "Código" — ahora aparece automático.
  _ot_codigo: string | null;
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
  tipo_pago: string | null;
  dias_credito: number | null;
  aplica_igv: boolean;
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
    // Override por OC — si están seteados, prevalecen sobre los originales
    // del req al renderizar este editor y el PDF de OC.
    oc_descripcion?: string | null;
    oc_cantidad?: number | string | null;
    oc_precio_unitario?: number | string | null;
    oc_unidad_medida?: string | null;
    orden_trabajo?: { id: number; ot: number | string | null; tipo_codigo: string | null } | null;
    orden_trabajo_interna?: { id: number; ot: number | string | null } | null;
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
  // "Otros" se guarda como Decimal signado en BD. El input UI maneja el
  // valor absoluto + un toggle de signo (+/−) para que sea explícito si el
  // monto suma o resta del total. Persistimos signed → en BD `otros` puede
  // ser negativo (descuento extra) o positivo (cargo extra).
  const [otros, setOtros] = useState<number>(0);
  const [otrosSigno, setOtrosSigno] = useState<"+" | "-">("+");
  const [originalDescuento, setOriginalDescuento] = useState<number>(0);
  // El "original" se compara con valor SIGNED (otros × signo) — así un cambio
  // de signo cuenta como cambio aunque el valor absoluto no cambie.
  const [originalOtros, setOriginalOtros] = useState<number>(0);
  const [originalOtrosSigno, setOriginalOtrosSigno] = useState<"+" | "-">("+");
  const [numeroReq, setNumeroReq] = useState<string>("");
  const [tipoPago, setTipoPago] = useState<string | null>(null);
  const [diasCredito, setDiasCredito] = useState<number | null>(null);
  const [originalTipoPago, setOriginalTipoPago] = useState<string | null>(null);
  const [originalDiasCredito, setOriginalDiasCredito] = useState<number | null>(null);
  const [originalNumeroReq, setOriginalNumeroReq] = useState<string>("");
  // Toggle de captura: si está ON, los precios que el usuario ingresa en la
  // tabla incluyen IGV. Al guardar se dividen por 1.18 para que en la BD
  // queden como precios sin IGV (formato esperado por la plantilla PDF de OC).
  // No persiste — es solo un helper de captura por sesión de edición.
  const [preciosConIgv, setPreciosConIgv] = useState<boolean>(false);
  // Flag por-OC: cuando false, la OC es exonerada de IGV. SÍ persiste (campo
  // aplica_igv en la BD) y afecta el cálculo del total y el render del PDF.
  const [aplicaIgv, setAplicaIgv] = useState<boolean>(true);
  const [originalAplicaIgv, setOriginalAplicaIgv] = useState<boolean>(true);
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
        // Mostramos el override de OC si está seteado; si no, el original
        // del req. Así el editor refleja "el contenido de la OC", no el del req.
        descripcion: it.oc_descripcion ?? it.descripcion,
        texto: it.texto,
        unidad_medida: it.oc_unidad_medida ?? it.unidad_medida ?? "UNIDAD",
        cantidad: Number(it.oc_cantidad ?? it.cantidad ?? 0),
        precio_unitario:
          it.oc_precio_unitario != null ? Number(it.oc_precio_unitario)
          : it.precio_unitario != null ? Number(it.precio_unitario)
          : 0,
        moneda: it.moneda ?? c.moneda,
        fabricante_codigo: it.fabricante_codigo,
        fecha_entrega_esperada: null,
        // Código formateado de la OT (externa → V/S/REP) o interna (OIxxxxYY).
        _ot_codigo: it.orden_trabajo?.ot != null
          ? formatOtCodigo(it.orden_trabajo.ot as number | string | null, it.orden_trabajo.tipo_codigo, "")
          : it.orden_trabajo_interna?.ot != null
          ? formatOtInternaCodigo(it.orden_trabajo_interna.ot as number | string | null, "")
          : null,
      }));
      setRows(mapped);
      setOriginalRowsHash(JSON.stringify(mapped));
      const desc = Number(c.descuento ?? 0);
      // Recuperamos signo desde el valor signed: si es < 0, mostramos
      // "−" con el valor absoluto; si ≥ 0, "+" con el valor tal cual.
      const otrRaw = Number(c.otros ?? 0);
      const otr = Math.abs(otrRaw);
      const signo: "+" | "-" = otrRaw < 0 ? "-" : "+";
      setOtrosSigno(signo);
      setOriginalOtrosSigno(signo);
      setDescuento(desc);
      setOtros(otr);
      setOriginalDescuento(desc);
      setOriginalOtros(otr);
      const ref = c.numero_req ?? "";
      setNumeroReq(ref);
      setOriginalNumeroReq(ref);
      setTipoPago(c.tipo_pago ?? null);
      setDiasCredito(c.dias_credito ?? null);
      setOriginalTipoPago(c.tipo_pago ?? null);
      setOriginalDiasCredito(c.dias_credito ?? null);
      // aplica_igv puede ser undefined si la respuesta es de antes de la
      // migración → asumimos true (comportamiento histórico).
      const aig = c.aplica_igv ?? true;
      setAplicaIgv(aig);
      setOriginalAplicaIgv(aig);
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
    // Items libres heredan la OT del primer item existente que tenga código.
    // Replica el comportamiento del backend (que asigna ot_id = primer ot_id
    // de la OC al crear un OTRepuesto nuevo desde acá).
    const otHeredada = rows.find((r) => r._ot_codigo)?._ot_codigo ?? null;
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
        _ot_codigo: otHeredada,
      },
    ]);
  };

  // ─── Importar items desde otra OC (usar como plantilla) ────────────
  // Permite cargar items de otra OC como filas nuevas en esta OC. Útil
  // cuando se repite una compra similar (ej. service kit estándar). Los
  // items importados se agregan como NUEVOS (id=null, es_adicional=true al
  // guardar) — heredan descripción/cantidad/precio/UM de la OC fuente
  // (con override oc_* si lo tienen), pero la OT y la OC destino son las
  // de la OC actual.
  const [importOpen, setImportOpen] = useState(false);
  const [ocOpciones, setOcOpciones] = useState<Array<{ value: number; label: string; numero_po: string }>>([]);
  const [ocLoading, setOcLoading] = useState(false);
  const [ocSelectedId, setOcSelectedId] = useState<number | null>(null);
  const [ocSelectedItems, setOcSelectedItems] = useState<Array<{
    id: number; material_id: number | null; material_codigo: string | null;
    descripcion: string | null; texto: string | null; unidad_medida: string | null;
    cantidad: number; precio_unitario: number; moneda: string | null;
    fabricante_codigo: string | null;
  }>>([]);
  const [ocItemsLoading, setOcItemsLoading] = useState(false);
  const [importSelectedKeys, setImportSelectedKeys] = useState<number[]>([]);

  const abrirImport = async () => {
    setImportOpen(true);
    setOcSelectedId(null); setOcSelectedItems([]); setImportSelectedKeys([]);
    // Cargar lista de OCs (limit grande — el Select hace search local).
    setOcLoading(true);
    try {
      const res = await fetch("/api/compras?limit=5000");
      if (res.ok) {
        const j = await res.json();
        type OCBrief = { id: number; numero_po: string; proveedor_nombre: string | null; nombre: string | null };
        const opts = (j.data as OCBrief[])
          .filter((o) => o.id !== compraId) // excluir la OC actual
          .map((o) => ({
            value: o.id,
            numero_po: o.numero_po,
            label: `${o.numero_po}${o.proveedor_nombre ? " · " + o.proveedor_nombre : ""}${o.nombre ? " — " + o.nombre : ""}`,
          }));
        setOcOpciones(opts);
      }
    } finally { setOcLoading(false); }
  };

  // Cuando el user elige una OC en el Select, traemos sus items.
  const cargarItemsDeOC = async (ocId: number) => {
    setOcSelectedId(ocId);
    setImportSelectedKeys([]);
    setOcItemsLoading(true);
    try {
      const res = await fetch(`/api/compras/${ocId}`);
      if (!res.ok) throw new Error("No se pudo cargar la OC fuente");
      const j = await res.json();
      type SourceItem = {
        id: number;
        material_id: number | null;
        material_codigo: string | null;
        descripcion: string | null;
        texto: string | null;
        unidad_medida: string | null;
        cantidad: number | string;
        precio_unitario: number | string | null;
        moneda: string | null;
        fabricante_codigo: string | null;
        oc_descripcion?: string | null;
        oc_cantidad?: number | string | null;
        oc_precio_unitario?: number | string | null;
        oc_unidad_medida?: string | null;
      };
      const items = (j.data.ot_repuestos as SourceItem[]).map((it) => ({
        id: it.id,
        material_id: it.material_id,
        material_codigo: it.material_codigo,
        // Override de OC tiene precedencia — refleja lo que el user editó en esa OC.
        descripcion: it.oc_descripcion ?? it.descripcion,
        texto: it.texto,
        unidad_medida: it.oc_unidad_medida ?? it.unidad_medida ?? "UNIDAD",
        cantidad: Number(it.oc_cantidad ?? it.cantidad ?? 0),
        precio_unitario: Number(it.oc_precio_unitario ?? it.precio_unitario ?? 0),
        moneda: it.moneda,
        fabricante_codigo: it.fabricante_codigo,
      }));
      setOcSelectedItems(items);
      // Por defecto preseleccionamos todo — el caso común es "copiar toda la OC".
      setImportSelectedKeys(items.map((it) => it.id));
    } catch (e) {
      if (e instanceof Error) message.error(e.message);
      setOcSelectedItems([]);
    } finally { setOcItemsLoading(false); }
  };

  const confirmarImport = () => {
    const aImportar = ocSelectedItems.filter((it) => importSelectedKeys.includes(it.id));
    if (aImportar.length === 0) { message.warning("Seleccioná al menos un item"); return; }
    const otHeredada = rows.find((r) => r._ot_codigo)?._ot_codigo ?? null;
    setRows((prev) => [
      ...prev,
      ...aImportar.map((it) => ({
        _localId: genLocalId(),
        id: null,
        material_id: it.material_id,
        material_codigo: it.material_codigo,
        descripcion: it.descripcion,
        texto: it.texto,
        unidad_medida: it.unidad_medida ?? "UNIDAD",
        cantidad: it.cantidad,
        precio_unitario: it.precio_unitario,
        moneda: it.moneda ?? compra?.moneda ?? "USD",
        fabricante_codigo: it.fabricante_codigo,
        fecha_entrega_esperada: null,
        _ot_codigo: otHeredada,
      })),
    ]);
    message.success(`${aImportar.length} item(s) importado(s)`);
    setImportOpen(false);
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
    tipoPago !== originalTipoPago ||
    diasCredito !== originalDiasCredito ||
    aplicaIgv !== originalAplicaIgv ||
    JSON.stringify(visibleRows) !== originalRowsHash
    || rows.some((r) => r._deleted && r.id != null)
    || descuento !== originalDescuento
    || otros !== originalOtros
    || otrosSigno !== originalOtrosSigno
    || numeroReq !== originalNumeroReq,
  [visibleRows, originalRowsHash, rows, descuento, originalDescuento, otros, originalOtros, otrosSigno, originalOtrosSigno, numeroReq, originalNumeroReq, tipoPago, originalTipoPago, diasCredito, originalDiasCredito, aplicaIgv, originalAplicaIgv]);

  useUnsavedChangesWarning(hayCambios, "Hay cambios sin guardar en la OC.", `compra-editar-${params?.id ?? "?"}`);

  const totales = useMemo(() => {
    const sumaIngresada = visibleRows.reduce((s, r) => s + r.cantidad * r.precio_unitario, 0);
    // Si los precios ingresados ya incluyen IGV, derivamos el subtotal sin IGV.
    // De lo contrario, la suma es directamente el subtotal sin IGV (comportamiento histórico).
    const subtotal = preciosConIgv ? sumaIngresada / 1.18 : sumaIngresada;
    // Convención HP&K: descuento aplica al subtotal, IGV se calcula sobre la base
    // ya descontada, "otros" se suma al final.
    // Si la OC está marcada como "Sin IGV" (aplicaIgv=false) el impuesto es 0.
    const baseImponible = Math.max(0, subtotal - descuento);
    const igv = aplicaIgv ? baseImponible * 0.18 : 0;
    // El signo decide si "otros" suma o resta del total.
    const otrosSignado = otrosSigno === "-" ? -otros : otros;
    const total = baseImponible + igv + otrosSignado;
    return { sumaIngresada, subtotal, descuento, igv, otros: otrosSignado, total };
  }, [visibleRows, descuento, otros, otrosSigno, preciosConIgv, aplicaIgv]);

  const handleGuardar = async () => {
    if (!compra) return;
    setSaving(true);
    try {
      // Si el toggle "Precios incluyen IGV" está ON, dividimos cada precio
      // por 1.18 antes de enviarlo a la API — la BD y el PDF esperan precios
      // sin IGV. Redondeamos a 4 decimales (mismo Decimal(15,4) que el schema).
      const normalizarPrecio = (p: number): number => preciosConIgv
        ? Number((p / 1.18).toFixed(4))
        : p;
      const payload = {
        items: visibleRows.map((r) => ({
          id: r.id,
          material_id: r.material_id,
          material_codigo: r.material_codigo,
          descripcion: r.descripcion,
          texto: r.texto,
          unidad_medida: r.unidad_medida,
          cantidad: r.cantidad,
          precio_unitario: normalizarPrecio(r.precio_unitario),
          moneda: r.moneda,
          fabricante_codigo: r.fabricante_codigo,
          fecha_entrega_esperada: r.fecha_entrega_esperada,
        })),
        deleteIds: rows.filter((r) => r._deleted && r.id != null).map((r) => r.id),
        descuento,
        otros: otrosSigno === "-" ? -otros : otros,
        numero_req: numeroReq.trim() || null,
        tipo_pago: tipoPago,
        dias_credito: tipoPago === "CONTADO" ? 0 : (diasCredito ?? null),
        aplica_igv: aplicaIgv,
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
      // Columna NUEVA (read-only): muestra automáticamente la OT a la que
      // pertenece cada item. Antes el user tenía que tipearla en "Código"
      // a mano — ahora se deriva del ot_id del repuesto.
      title: "OT", key: "ot_auto", width: 90, align: "center",
      render: (_v, r) => r._ot_codigo
        ? <Tag color={brand.navy}>{r._ot_codigo}</Tag>
        : <Text type="secondary" style={{ fontSize: 11 }}>—</Text>,
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
          <Col xs={24} md={12}>
            <div style={{ fontSize: 12, color: brand.textSecondary, marginBottom: 2 }}>
              <Tooltip title="Si está activado, los precios que ingresas en la tabla incluyen IGV. Al guardar se dividen por 1.18 para almacenarlos sin IGV (como espera la plantilla de OC); el TOTAL final queda igual al monto con IGV que ingresaste.">
                Precios ingresados incluyen IGV
              </Tooltip>
            </div>
            <Space>
              <Switch
                checked={preciosConIgv}
                onChange={(v) => setPreciosConIgv(v)}
                checkedChildren="Con IGV"
                unCheckedChildren="Sin IGV"
              />
              <Text type="secondary" style={{ fontSize: 11 }}>
                {preciosConIgv
                  ? "Suma ingresada: " + totales.sumaIngresada.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " (= Subtotal × 1.18)"
                  : "Modo estándar: el IGV se suma al final"}
              </Text>
            </Space>
          </Col>
        </Row>
        {/* Fila 2: flag "Aplicar IGV" (persiste por-OC). Cuando está OFF, la
            OC es exonerada: el cálculo del total no suma el 18% y el PDF
            omite la línea de IGV. */}
        <Row gutter={12} align="middle" style={{ marginTop: 10 }}>
          <Col xs={24} md={12}>
            <div style={{ fontSize: 12, color: brand.textSecondary, marginBottom: 2 }}>
              <Tooltip title="Cuando está ACTIVADO, el total incluye IGV (18%) — comportamiento estándar. Cuando está DESACTIVADO, la OC es EXONERADA de IGV: el cálculo no suma el 18% y la plantilla PDF omite la línea de IGV. Útil para importaciones, servicios sin IGV o proveedores no domiciliados.">
                Aplicar IGV a esta OC
              </Tooltip>
            </div>
            <Space>
              <Switch
                checked={aplicaIgv}
                onChange={(v) => setAplicaIgv(v)}
                checkedChildren="Con IGV"
                unCheckedChildren="Sin IGV"
              />
              <Text type={aplicaIgv ? "secondary" : "warning"} style={{ fontSize: 11 }}>
                {aplicaIgv
                  ? "Estándar: IGV 18% se suma al total"
                  : "EXONERADA: sin IGV — el total NO incluye el 18%"}
              </Text>
            </Space>
          </Col>
        </Row>

        {/* Fila 3: forma de pago. Misma lógica que el modal de detalle:
            Días solo aplica cuando tipo_pago = CREDITO. */}
        <Row gutter={12} align="middle" style={{ marginTop: 10 }}>
          <Col xs={24} md={8}>
            <div style={{ fontSize: 12, color: brand.textSecondary, marginBottom: 2 }}>
              Tipo de pago
            </div>
            <Select
              value={tipoPago ?? undefined}
              onChange={(v) => {
                setTipoPago(v ?? null);
                if (v === "CONTADO") setDiasCredito(null);
              }}
              allowClear
              placeholder="Elegí (opcional)"
              style={{ width: "100%" }}
              options={[
                { value: "CONTADO", label: "Contado" },
                { value: "CREDITO", label: "Crédito" },
                { value: "TRANSFERENCIA", label: "Transferencia" },
              ]}
            />
          </Col>
          <Col xs={24} md={8}>
            <div style={{ fontSize: 12, color: brand.textSecondary, marginBottom: 2 }}>
              Días de crédito
            </div>
            <Select
              value={diasCredito ?? undefined}
              onChange={(v) => setDiasCredito(v ?? null)}
              disabled={tipoPago !== "CREDITO"}
              allowClear
              placeholder={tipoPago === "CREDITO" ? "Elegí plazo" : "—"}
              style={{ width: "100%" }}
              options={[
                { value: 15, label: "15 días" },
                { value: 30, label: "30 días" },
                { value: 45, label: "45 días" },
                { value: 60, label: "60 días" },
                { value: 90, label: "90 días" },
                { value: 120, label: "120 días" },
              ]}
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
            <Statistic
              title={aplicaIgv ? "IGV (18%)" : "IGV"}
              value={totales.igv}
              precision={2}
              prefix={compra.moneda}
              suffix={aplicaIgv ? undefined : <Tag color="orange" style={{ marginLeft: 4 }}>Exonerado</Tag>}
            />
          </Col>
          <Col xs={12} md={4}>
            <div style={{ fontSize: 12, color: brand.textSecondary, marginBottom: 2 }}>
              Otros{" "}
              <Tooltip title="Cargo o descuento adicional aplicado al total">
                <span style={{ color: brand.textSecondary, fontSize: 11 }}>ⓘ</span>
              </Tooltip>
            </div>
            <Space.Compact style={{ width: "100%" }}>
              <Select
                value={otrosSigno}
                onChange={(v) => setOtrosSigno(v)}
                style={{ width: 70 }}
                options={[
                  { value: "+", label: "+ Sumar" },
                  { value: "-", label: "− Restar" },
                ]}
              />
              <InputNumber
                value={otros}
                min={0}
                step={0.01}
                precision={2}
                style={{ width: "100%" }}
                prefix={compra.moneda}
                onChange={(v) => setOtros(v == null ? 0 : Number(v))}
              />
            </Space.Compact>
          </Col>
          <Col xs={12} md={4}>
            <Statistic title="TOTAL" value={totales.total} precision={2} prefix={compra.moneda} styles={{ content: { color: brand.navy, fontWeight: 700 } }} />
          </Col>
        </Row>
      </Card>

      <TablaItems columns={columns} rows={visibleRows} onAdd={addRow} onImport={abrirImport} />

      <div style={{ marginTop: 16, padding: 12, background: "#f6f6f6", borderRadius: 4, fontSize: 11, color: brand.textSecondary }}>
        <Tag color="orange">Tip</Tag>
        Las filas que agregás se guardan como items libres (sin material del catálogo) y se vinculan a la primera OT existente de la OC.
        Si la OC no tiene ninguna OT asociada, no podrás agregar items libres — primero tenés que generar la OC normal y luego ajustar acá.
      </div>

      <Modal
        title={<Space><ImportOutlined style={{ color: brand.navy }} /><span>Importar items desde otra OC</span></Space>}
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        onOk={confirmarImport}
        okText={`Importar ${importSelectedKeys.length || ""} items`.trim()}
        okButtonProps={{ disabled: importSelectedKeys.length === 0, type: "primary" }}
        cancelText="Cancelar"
        width={780}
        destroyOnHidden
      >
        <Text type="secondary" style={{ display: "block", marginBottom: 12, fontSize: 12 }}>
          Elegí una OC fuente y copiá sus items como filas nuevas (libres) en esta OC. Cantidad, precio, descripción y UM se traen desde la OC fuente — podés ajustar después acá.
        </Text>
        <Space direction="vertical" style={{ width: "100%" }} size={12}>
          <Select
            showSearch
            placeholder="Buscá OC por número, proveedor o nombre…"
            value={ocSelectedId ?? undefined}
            onChange={(v) => v && cargarItemsDeOC(v)}
            options={ocOpciones}
            optionFilterProp="label"
            loading={ocLoading}
            style={{ width: "100%" }}
            notFoundContent={ocLoading ? "Cargando…" : "Sin OCs"}
          />
          {ocSelectedId && (
            <Table
              size="small"
              rowKey="id"
              loading={ocItemsLoading}
              dataSource={ocSelectedItems}
              pagination={false}
              scroll={{ y: 360 }}
              rowSelection={{
                selectedRowKeys: importSelectedKeys,
                onChange: (keys) => setImportSelectedKeys(keys as number[]),
              }}
              columns={[
                { title: "Código", dataIndex: "material_codigo", width: 100, render: (v: string | null) => v ?? <Text type="secondary">—</Text> },
                { title: "Descripción", dataIndex: "descripcion", render: (v: string | null) => v ?? <Text type="secondary">—</Text> },
                { title: "UM", dataIndex: "unidad_medida", width: 70 },
                { title: "Cant.", dataIndex: "cantidad", width: 80, align: "right" as const, render: (v: number) => v.toLocaleString("es-PE") },
                {
                  title: "P. Unit.", dataIndex: "precio_unitario", width: 100, align: "right" as const,
                  render: (v: number, r: { moneda: string | null }) =>
                    `${r.moneda ?? ""} ${Number(v).toLocaleString("es-PE", { minimumFractionDigits: 2 })}`,
                },
              ]}
            />
          )}
        </Space>
      </Modal>
    </div>
  );
}

function TablaItems({
  columns, rows, onAdd, onImport,
}: { columns: ColumnsType<ItemRow>; rows: ItemRow[]; onAdd: () => void; onImport: () => void }) {
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
          <Space direction="vertical" style={{ width: "100%" }} size={6}>
            <Button type="dashed" block icon={<PlusOutlined />} onClick={onAdd}>
              Agregar fila (item libre)
            </Button>
            <Button type="dashed" block icon={<ImportOutlined />} onClick={onImport}>
              Importar desde otra OC (usar como plantilla)
            </Button>
          </Space>
        )}
      />
    </TableDragWrapper>
  );
}
