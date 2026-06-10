"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Typography,
  Tabs,
  Table,
  Button,
  Input,
  Select,
  Tag,
  Row,
  Col,
  Card,
  Space,
  App,
  Statistic,
  Modal,
  Form,
  InputNumber,
  DatePicker,
  Popover,
  Divider,
  Alert,
  Tooltip,
  Upload,
  Checkbox,
} from "antd";
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  ToolOutlined,
  DatabaseOutlined,
  InboxOutlined,
  ExportOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  FileDoneOutlined,
  InfoCircleOutlined,
  SwapOutlined,
  UploadOutlined,
  DeleteOutlined,
  PaperClipOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import {
  numeracionColumn,
  useColumnasOcultas,
  ColumnasToggleButton,
  visibleColumns,
  filtroPorColumna,
  useRangoFechas,
  RangoFechasFiltro,
  dentroDeRango,
  useColumnasRedimensionables,
  paginacionEstandar,
} from "@/lib/tables";
import { brand } from "@/lib/theme";
import { useResponsive, modalWidth } from "@/lib/responsive";
import dayjs, { Dayjs } from "dayjs";

import { formatDateOnly } from "@/lib/dates";
import { ExportarExcelButton } from "@/components/ExportarExcelButton";
import { uploadToR2 } from "@/lib/r2-client";
import { R2FileLink } from "@/components/R2FileLink";
const { Title, Text } = Typography;
const { TextArea } = Input;

interface Movimiento {
  id: number;
  material_id: number;
  material_codigo: string | null;
  material_nombre: string | null;
  unidad_medida: string | null;
  stock_actual: number | null;
  tipo_movimiento: "ENTRADA" | "SALIDA" | "AJUSTE";
  cantidad: number;
  precio_unitario: number | null;
  moneda: string | null;
  costo_total: number | null;
  documento_referencia: string | null;
  observacion: string | null;
  usuario: string;
  fecha_movimiento: string;
}

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
  caja: string | null;
  precio: number | null;
  moneda: string | null;
  fabricante: string | null;
  categoria: string | null;
  clasificacion: string | null;
  valor_total: number;
  alerta: "OK" | "BAJO" | "SIN" | "EXCESO";
  cantidad_en_po: number;
  pos_pendientes: string[];
  cantidad_en_req: number;
  reqs_pendientes: string[];
  almacen: string | null;
  stock_proyectado: number;
  por_solicitar: number;
}

interface StockKPIs {
  totalMateriales: number;
  sinStock: number;
  bajoStock: number;
  exceso: number;
  enPO: number;
  enReq: number;
  porSolicitar: number;
  valorTotal: number;
}

interface POPendiente {
  id: number;
  numero_po: string;
  proveedor_nombre: string | null;
  almacen_nombre: string | null;
  fecha_solicitud: string;
  fecha_entrega_esperada: string | null;
  estado: string;
  total: number;
  moneda: string;
  observaciones: string | null;
  nro_guia: string | null;
  nro_factura: string | null;
  guia_key: string | null;
  guia_nombre: string | null;
  factura_key: string | null;
  factura_nombre: string | null;
  // Adjuntos múltiples (compra_adjunto). Una OC puede tener N guías y N
  // facturas — el patrón legacy (guia_key/factura_key) queda para compat.
  adjuntos?: Array<{
    id: number; tipo: string; r2_key: string; nombre_archivo: string;
    tipo_mime: string | null; tamano: number | null; fecha_subida: string;
  }>;
  items: Array<{
    id: number;
    // repuesto_id se setea cuando el item viene de ot_repuestos (item free
    // sin material_id). Para items de compra_detalle es null y la API usa
    // material_id para matchear.
    repuesto_id?: number | null;
    material_id: number | null;
    codigo: string | null;
    descripcion: string | null;
    unidad_medida: string;
    cantidad: number;
    precio_unitario: number | null;
  }>;
}

const tipoColor: Record<string, string> = {
  ENTRADA: "green",
  SALIDA: "red",
  AJUSTE: "blue",
};

const alertaColor: Record<string, string> = {
  OK: "green",
  BAJO: "orange",
  SIN: "red",
  EXCESO: "purple",
};

// ════════════════════════════════════════════════════════════
// TAB 1: MOVIMIENTOS (historial)
// ════════════════════════════════════════════════════════════
function TabMovimientos({ onRefresh }: { onRefresh: () => void }) {
  const { message } = App.useApp();
  const [data, setData] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [tipo, setTipo] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [desde, setDesde] = useState<Dayjs | null>(null);
  const [hasta, setHasta] = useState<Dayjs | null>(null);
  const { ocultas, setOcultas } = useColumnasOcultas("movimientos-historial-cols-v1");
  // Filas después de TODOS los filtros (search + tipo/rango + filtros de
  // columna). La setea Table.onChange; el export la usa para respetar todo.
  const [vistaActual, setVistaActual] = useState<Movimiento[] | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tipo) params.set("tipo", tipo);
      if (desde) params.set("desde", desde.format("YYYY-MM-DD"));
      if (hasta) params.set("hasta", hasta.format("YYYY-MM-DD"));
      const res = await fetch(`/api/movimientos?${params}`);
      const json = await res.json();
      setData(json.data ?? []);
    } catch {
      message.error("Error al cargar movimientos");
    } finally {
      setLoading(false);
    }
  }, [tipo, desde, hasta, message]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = data.filter((m) => {
    if (!search) return true;
    const lc = search.toLowerCase();
    return (
      (m.material_codigo || "").toLowerCase().includes(lc) ||
      (m.material_nombre || "").toLowerCase().includes(lc) ||
      (m.documento_referencia || "").toLowerCase().includes(lc) ||
      (m.observacion || "").toLowerCase().includes(lc)
    );
  });

  // Reset vistaActual cuando cambia el dataset visible — el Table reaplica
  // sus filtros de columna sobre el nuevo data y vuelve a llamar onChange.
  useEffect(() => { setVistaActual(null); }, [data, search]);

  const columns: ColumnsType<Movimiento> = [
    numeracionColumn<Movimiento>(),
    {
      key: "fecha_movimiento",
      title: "Fecha",
      dataIndex: "fecha_movimiento",
      width: 110,
      sorter: (a, b) => (a.fecha_movimiento || "").localeCompare(b.fecha_movimiento || ""),
      filters: [...new Set(filtered.map((r) => r.fecha_movimiento ? dayjs(r.fecha_movimiento).format("YYYY-MM-DD") : "").filter(Boolean))]
        .sort().map((v) => ({ text: formatDateOnly(v), value: v })),
      filterSearch: true,
      onFilter: (value, r) => (r.fecha_movimiento ? dayjs(r.fecha_movimiento).format("YYYY-MM-DD") : "") === value,
      render: (v: string) => formatDateOnly(v),
    },
    {
      key: "tipo_movimiento",
      title: "Tipo",
      dataIndex: "tipo_movimiento",
      width: 100,
      filters: [
        { text: "ENTRADA", value: "ENTRADA" },
        { text: "SALIDA", value: "SALIDA" },
        { text: "AJUSTE", value: "AJUSTE" },
      ],
      onFilter: (value, r) => r.tipo_movimiento === value,
      render: (v: string) => (
        <Tag color={tipoColor[v] || "default"} icon={v === "ENTRADA" ? <ArrowDownOutlined /> : v === "SALIDA" ? <ArrowUpOutlined /> : <SwapOutlined />}>
          {v}
        </Tag>
      ),
    },
    { key: "material_codigo", title: "Código", dataIndex: "material_codigo", width: 110, ...filtroPorColumna(filtered, "material_codigo") },
    {
      key: "material_nombre",
      title: "Material",
      dataIndex: "material_nombre",
      width: 280,
      ellipsis: true,
      ...filtroPorColumna(filtered, "material_nombre"),
    },
    {
      key: "cantidad",
      title: "Cantidad",
      dataIndex: "cantidad",
      width: 110,
      align: "right",
      sorter: (a, b) => Number(a.cantidad) - Number(b.cantidad),
      filters: [...new Set(filtered.map((r) => Number(r.cantidad)))]
        .sort((a, b) => a - b).map((v) => ({ text: String(v), value: String(v) })),
      filterSearch: true,
      onFilter: (value, r) => String(Number(r.cantidad)) === value,
      render: (v: number, r: Movimiento) => (
        <span style={{ fontWeight: 600, color: r.tipo_movimiento === "SALIDA" ? "#cf1322" : "#389e0d" }}>
          {r.tipo_movimiento === "SALIDA" ? "-" : "+"}
          {Number(v).toLocaleString("en", { maximumFractionDigits: 2 })}{" "}
          {r.unidad_medida}
        </span>
      ),
    },
    {
      key: "precio_unitario",
      title: "Precio Unit.",
      dataIndex: "precio_unitario",
      width: 120,
      align: "right",
      sorter: (a, b) => (a.precio_unitario ?? 0) - (b.precio_unitario ?? 0),
      render: (v: number | null, r: Movimiento) => {
        if (v == null) {
          return r.tipo_movimiento === "SALIDA"
            ? <Tooltip title="No se pudo resolver precio (sin catálogo ni OC previa)"><Text type="secondary">—</Text></Tooltip>
            : <Text type="secondary">—</Text>;
        }
        return (
          <Text style={{ fontSize: 12 }}>
            {(r.moneda ?? "USD")} {Number(v).toFixed(2)}
          </Text>
        );
      },
    },
    {
      key: "costo_total",
      title: "Costo Total",
      dataIndex: "costo_total",
      width: 120,
      align: "right",
      sorter: (a, b) => (a.costo_total ?? 0) - (b.costo_total ?? 0),
      render: (v: number | null, r: Movimiento) => {
        if (v == null) return <Text type="secondary">—</Text>;
        const color = r.tipo_movimiento === "SALIDA" ? "#cf1322" : brand.navy;
        return (
          <Text style={{ fontSize: 12, fontWeight: 600, color }}>
            {(r.moneda ?? "USD")} {Number(v).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
        );
      },
    },
    {
      key: "stock_actual",
      title: "Stock Final",
      dataIndex: "stock_actual",
      width: 110,
      align: "right",
      sorter: (a, b) => Number(a.stock_actual ?? 0) - Number(b.stock_actual ?? 0),
      filters: [...new Set(filtered.map((r) => r.stock_actual).filter((v): v is number => v != null))]
        .sort((a, b) => a - b).map((v) => ({ text: String(v), value: String(v) })),
      filterSearch: true,
      onFilter: (value, r) => String(r.stock_actual ?? "") === value,
      render: (v: number | null) => (v != null ? Number(v).toLocaleString() : "-"),
    },
    { key: "documento_referencia", title: "Documento Ref.", dataIndex: "documento_referencia", width: 150, ...filtroPorColumna(filtered, "documento_referencia") },
    { key: "usuario", title: "Usuario", dataIndex: "usuario", width: 110, ...filtroPorColumna(filtered, "usuario") },
    {
      key: "observacion",
      title: "Observación",
      dataIndex: "observacion",
      ellipsis: true,
      ...filtroPorColumna(filtered, "observacion"),
    },
  ];

  const { columnas: columnsResizable, components: tableComponents, resetAnchos, TableDragWrapper } =
    useColumnasRedimensionables<Movimiento>(columns, "movimientos-list-cols-widths-v1");

  return (
    <div>
      <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 12 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={8} md={5}>
            <Input
              placeholder="Buscar material..."
              prefix={<SearchOutlined />}
              allowClear
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select showSearch optionFilterProp="label"
              placeholder="Tipo"
              allowClear
              style={{ width: "100%" }}
              value={tipo}
              onChange={setTipo}
              options={[
                { value: "ENTRADA", label: "Entrada" },
                { value: "SALIDA", label: "Salida" },
                { value: "AJUSTE", label: "Ajuste" },
              ]}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <DatePicker placeholder="Desde" value={desde} onChange={setDesde} style={{ width: "100%" }} format="DD/MM/YYYY" />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <DatePicker placeholder="Hasta" value={hasta} onChange={setHasta} style={{ width: "100%" }} format="DD/MM/YYYY" />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Button icon={<ReloadOutlined />} onClick={fetchData} block>
              Actualizar
            </Button>
          </Col>
          <Col xs={12} sm={6} md={4}>
            <ExportarExcelButton<Movimiento>
              endpoint="/api/movimientos"
              // El endpoint no pagina (devuelve hasta 500 de una): limit alto
              // para que el fetch corte en la primera página.
              limit={50000}
              filename="Movimientos"
              sheetName="Movimientos"
              // Respeta búsqueda + tipo/rango + filtros de columna de la tabla.
              currentRows={vistaActual ?? filtered}
              tablaLayout={{ ocultas }}
              // Filtros del modal (cuando NO se usan los de la tabla): el
              // endpoint acepta tipo/desde/hasta como query params.
              dateFilter={{ paramNameDesde: "desde", paramNameHasta: "hasta" }}
              categoryFilters={[{
                key: "tipo",
                label: "Tipo de movimiento",
                // Client-side: el endpoint solo acepta UN tipo exacto (no CSV),
                // así que el multi-select se aplica sobre lo descargado.
                predicate: (r, sel) => sel.includes(r.tipo_movimiento),
                options: [
                  { value: "ENTRADA", label: "Entrada" },
                  { value: "SALIDA", label: "Salida" },
                  { value: "AJUSTE", label: "Ajuste" },
                ],
              }]}
              columns={[
                { key: "fecha_movimiento", label: "Fecha", value: (r) => formatDateOnly(r.fecha_movimiento) },
                { key: "tipo_movimiento", label: "Tipo", value: (r) => r.tipo_movimiento },
                { key: "material_codigo", label: "Código", value: (r) => r.material_codigo ?? "" },
                { key: "material_nombre", label: "Material", value: (r) => r.material_nombre ?? "" },
                { key: "cantidad", label: "Cantidad", value: (r) => Number(r.cantidad) },
                { key: "unidad_medida", label: "UM", value: (r) => r.unidad_medida ?? "" },
                { key: "precio_unitario", label: "Precio Unit.", value: (r) => r.precio_unitario ?? "" },
                { key: "costo_total", label: "Costo Total", value: (r) => r.costo_total ?? "" },
                { key: "moneda", label: "Moneda", value: (r) => r.moneda ?? "" },
                { key: "stock_actual", label: "Stock Final", value: (r) => r.stock_actual ?? "" },
                { key: "documento_referencia", label: "Documento Ref.", value: (r) => r.documento_referencia ?? "" },
                { key: "usuario", label: "Usuario", value: (r) => r.usuario },
                { key: "observacion", label: "Observación", value: (r) => r.observacion ?? "" },
              ]}
            />
          </Col>
        </Row>
      </Card>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <ColumnasToggleButton<Movimiento>
          columns={columns}
          ocultas={ocultas}
          setOcultas={setOcultas}
          obligatorias={["__num", "fecha_movimiento", "tipo_movimiento"]}
        />
        <Button onClick={resetAnchos}>Restablecer anchos</Button>
      </div>

      <TableDragWrapper>
              <Table
          rowKey="id"
          columns={visibleColumns(columnsResizable, ocultas)}
          components={tableComponents}
          dataSource={filtered}
          loading={loading}
          pagination={paginacionEstandar({
            current: page,
            pageSize,
            total: filtered.length,
            onChange: (p, s) => { setPage(p); setPageSize(s); },
            label: "movimientos",
          })}
          size="small"
          scroll={{ x: 1200 }}
          sticky={{ offsetHeader: 56, offsetScroll: 0 }}
          onChange={(_p, _f, _s, extra) => setVistaActual(extra.currentDataSource)}
        />
      </TableDragWrapper>
    </div>
  );
}


// ════════════════════════════════════════════════════════════
// TAB 3: INGRESO DE POs (recepción) — vista de tabla plana
// ════════════════════════════════════════════════════════════
interface ItemFila {
  id: number;
  po_id: number;
  numero_po: string;
  proveedor_nombre: string | null;
  almacen_nombre: string | null;
  fecha_entrega_esperada: string | null;
  estado: string;
  observaciones_compra: string | null;
  // material_id puede ser null para items "free" (CAD sin catálogo).
  material_id: number | null;
  codigo: string | null;
  descripcion: string | null;
  cantidad: number;
  unidad_medida: string;
  precio_unitario: number | null;
  moneda: string;
}

function TabIngresoPO({ onRefresh }: { onRefresh: () => void }) {
  const { message } = App.useApp();
  const { screens } = useResponsive();
  const [pos, setPos] = useState<POPendiente[]>([]);
  const [loading, setLoading] = useState(false);
  const [itemsPage, setItemsPage] = useState(1);
  const [itemsPageSize, setItemsPageSize] = useState(25);
  const [poSeleccionada, setPoSeleccionada] = useState<POPendiente | null>(null);
  // Selección por checkbox: el user marca items de UNA OC y luego clickea
  // "Recibir seleccionados" arriba — abre el modal con esos items pre-cargados.
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [cantidadesRecibidas, setCantidadesRecibidas] = useState<Record<number, number>>({});
  const [nroGuia, setNroGuia] = useState("");
  const [nroFactura, setNroFactura] = useState("");
  const [comentariosRec, setComentariosRec] = useState("");
  const [ubicacionRec, setUbicacionRec] = useState<string | undefined>();
  // Zona seleccionada para "Aplicar a todos los items" (botón de atajo arriba).
  // No persiste — solo es un buffer para que el usuario elija una zona y la
  // copie a todos los slots de la tabla con un click.
  const [zonaBulk, setZonaBulk] = useState<number | null>(null);
  const [ubicaciones, setUbicaciones] = useState<{ codigo: string; nombre: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Almacén físico HP&K — zona + posición POR ITEM. Cargados al abrir el modal
  // desde /api/compras/{id}/recepcion-preview. Pre-fill: ubicación actual del
  // req, o sugerida en base a otros reqs de la misma OT, o vacío.
  interface AlmacenZona {
    id: number; codigo: string; nombre: string;
    posiciones: { id: number; codigo: string; nombre: string | null }[];
  }
  interface PreviewItem {
    repuesto_id: number;
    material_id: number;
    ot_codigo: string;
    cantidad_pendiente: number;
    ubicacion_actual: { zona_id: number; posicion_id: number | null } | null;
    ubicacion_sugerida: { zona_id: number; posicion_id: number | null } | null;
  }
  const [zonasAlmacen, setZonasAlmacen] = useState<AlmacenZona[]>([]);
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  // material_id → { zona_id, posicion_id }. Aplica a TODOS los reqs de la OC
  // que tienen ese material — el endpoint hace updateMany por (po_id, material_id).
  const [ubicByMaterial, setUbicByMaterial] = useState<Record<number, { zona_id: number | null; posicion_id: number | null }>>({});
  const [search, setSearch] = useState("");
  const [filtroProv, setFiltroProv] = useState<string | undefined>();
  const [filtroEstado, setFiltroEstado] = useState<string | undefined>();
  const { ocultas: ingresoOcultas, setOcultas: setIngresoOcultas } = useColumnasOcultas("movimientos-ingreso-cols-v1");
  const { rango: rangoEntrega, setRango: setRangoEntrega } = useRangoFechas();

  const fetchPOs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/compras/pendientes-ingreso");
      const json = await res.json();
      setPos(json.data ?? []);
    } catch {
      message.error("Error al cargar POs pendientes");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    fetchPOs();
  }, [fetchPOs]);

  useEffect(() => {
    fetch("/api/almacenes")
      .then((r) => r.ok ? r.json() : { data: [] })
      .then((j) => setUbicaciones((j.data ?? []).map((u: { codigo: string; nombre: string }) => ({ codigo: u.codigo, nombre: u.nombre }))))
      .catch(() => { /* ignore */ });
    // Catálogo de zonas físicas HP&K (HER / SUM / REP / STO) con sus
    // posiciones (A1, A2...). Se carga una vez y se reutiliza por modal.
    fetch("/api/almacen-zonas")
      .then((r) => r.ok ? r.json() : { data: [] })
      .then((j) => setZonasAlmacen(j.data ?? []))
      .catch(() => { /* ignore */ });
  }, []);

  // Aplanar todos los items de todas las POs
  const filasAplanadas: ItemFila[] = pos.flatMap((po) =>
    po.items.map((i) => ({
      id: i.id,
      po_id: po.id,
      numero_po: po.numero_po,
      proveedor_nombre: po.proveedor_nombre,
      almacen_nombre: po.almacen_nombre,
      fecha_entrega_esperada: po.fecha_entrega_esperada,
      estado: po.estado,
      observaciones_compra: (po as POPendiente & { observaciones?: string | null }).observaciones ?? null,
      material_id: i.material_id,
      codigo: i.codigo,
      descripcion: i.descripcion,
      cantidad: Number(i.cantidad),
      unidad_medida: i.unidad_medida,
      precio_unitario: i.precio_unitario != null ? Number(i.precio_unitario) : null,
      moneda: po.moneda,
    }))
  );

  const filasFiltradas = filasAplanadas.filter((r) => {
    if (filtroProv && r.proveedor_nombre !== filtroProv) return false;
    if (filtroEstado && r.estado !== filtroEstado) return false;
    if (search) {
      const lc = search.toLowerCase();
      return (
        (r.codigo || "").toLowerCase().includes(lc) ||
        (r.descripcion || "").toLowerCase().includes(lc) ||
        r.numero_po.toLowerCase().includes(lc) ||
        (r.proveedor_nombre || "").toLowerCase().includes(lc)
      );
    }
    return true;
  });

  const proveedoresUnicos = [...new Set(pos.map((p) => p.proveedor_nombre).filter(Boolean) as string[])];
  const estadosUnicos = [...new Set(pos.map((p) => p.estado))];

  // Si `selectedIds` se pasa, solo esos items se pre-llenan con su cantidad
  // total; el resto quedan en 0 (el user puede activarlos en el modal si quiere).
  // Sin selección → todos arrancan con cantidad completa (comportamiento anterior).
  const abrirRecibir = async (po_id: number, selectedIds?: number[]) => {
    const po = pos.find((p) => p.id === po_id);
    if (!po) return;
    setPoSeleccionada(po);
    const inicial: Record<number, number> = {};
    const conSeleccion = selectedIds && selectedIds.length > 0;
    const selSet = new Set(selectedIds ?? []);
    po.items.forEach((i) => {
      inicial[i.id] = conSeleccion ? (selSet.has(i.id) ? i.cantidad : 0) : i.cantidad;
    });
    setCantidadesRecibidas(inicial);
    setNroGuia("");
    setNroFactura("");
    setComentariosRec("");
    setUbicacionRec(undefined);
    setPreviewItems([]);
    setUbicByMaterial({});
    // Cargamos preview con la sugerencia de ubicación por req (basada en otras
    // ubicaciones de la misma OT). Lo usamos para pre-llenar zona+posición por
    // material en la tabla del modal.
    try {
      const res = await fetch(`/api/compras/${po_id}/recepcion-preview`);
      const json = await res.json();
      if (res.ok && Array.isArray(json.data)) {
        const items = json.data as PreviewItem[];
        setPreviewItems(items);
        const seed: Record<number, { zona_id: number | null; posicion_id: number | null }> = {};
        for (const it of items) {
          const u = it.ubicacion_actual ?? it.ubicacion_sugerida;
          if (!seed[it.material_id]) {
            seed[it.material_id] = {
              zona_id: u?.zona_id ?? null,
              posicion_id: u?.posicion_id ?? null,
            };
          }
        }
        setUbicByMaterial(seed);
      }
    } catch {
      /* si falla el preview seguimos sin sugerencia */
    }
  };

  const confirmarIngreso = async () => {
    if (!poSeleccionada) return;
    const items = poSeleccionada.items
      .filter((i) => cantidadesRecibidas[i.id] > 0)
      .map((i) => {
        // ubicByMaterial usa material_id como key, pero los items free no tienen
        // material_id → usamos id del item como fallback para no perder la zona.
        const matKey = i.material_id ?? i.id;
        const u = ubicByMaterial[matKey];
        return {
          // material_id puede ser null para items free (CAD sin catálogo). El
          // backend usa repuesto_id en ese caso para identificar el item.
          material_id: i.material_id,
          repuesto_id: i.repuesto_id ?? null,
          cantidad: cantidadesRecibidas[i.id],
          almacen_zona_id: u?.zona_id ?? null,
          almacen_posicion_id: u?.posicion_id ?? null,
        };
      });

    if (items.length === 0) {
      message.warning("Ingresa al menos una cantidad");
      return;
    }
    // El campo "Ubicación física" de arriba es OPCIONAL desde que cada item
    // ya guarda su zona del almacén HP&K en `almacen_zona_id`. Si el user
    // no lo llena, simplemente no se setea `ubicacion_codigo` en la OT.
    // Cada material recibido debe tener zona del almacén HP&K asignada
    // (HER / SUM / REP / STO) — la posición es opcional. Solo validamos las
    // zonas de items que efectivamente se están recibiendo (cantidad > 0).
    const sinZona = items.filter((it) => !it.almacen_zona_id);
    if (sinZona.length > 0) {
      message.warning(`Faltan zonas de almacén en ${sinZona.length} item(s) que estás recibiendo. Elegí la zona en cada fila.`);
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/movimientos/ingreso-po", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          po_id: poSeleccionada.id,
          items,
          usuario: "Almacenero",
          nro_guia: nroGuia || undefined,
          nro_factura: nroFactura || undefined,
          comentarios: comentariosRec || undefined,
          ubicacion_codigo: ubicacionRec || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al registrar ingreso");
      message.success(json.message);
      setPoSeleccionada(null);
      setSelectedItemIds([]);
      await fetchPOs();
      onRefresh();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(false);
    }
  };

  // Total resumen
  const totalPOsPendientes = pos.length;
  const totalItemsPendientes = filasAplanadas.length;
  const valorTotalPendiente = pos.reduce((s, p) => s + Number(p.total || 0), 0);

  const columnasItems: ColumnsType<ItemFila> = [
    {
      key: "numero_po",
      title: "OC",
      dataIndex: "numero_po",
      width: 110,
      render: (v: string) => <Tag color={brand.navy}>{v}</Tag>,
      filters: [...new Set(filasAplanadas.map((r) => r.numero_po))].sort().map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, r) => r.numero_po === value,
    },
    {
      key: "estado",
      title: "Estado",
      dataIndex: "estado",
      width: 100,
      filters: estadosUnicos.map((v) => ({ text: v, value: v })),
      onFilter: (value, r) => r.estado === value,
      render: (v: string) => (
        <Tag color={v === "Pendiente" ? "gold" : v === "Aprobado" ? "blue" : "cyan"}>{v}</Tag>
      ),
    },
    {
      key: "proveedor_nombre",
      title: "Proveedor",
      dataIndex: "proveedor_nombre",
      width: 180,
      ellipsis: true,
      filters: proveedoresUnicos.map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, r) => r.proveedor_nombre === value,
      render: (v: string | null) => v || "-",
    },
    { key: "codigo", title: "Código", dataIndex: "codigo", width: 110, ...filtroPorColumna(filasAplanadas, "codigo") },
    {
      key: "descripcion",
      title: "Material",
      dataIndex: "descripcion",
      width: 280,
      ellipsis: true,
      ...filtroPorColumna(filasAplanadas, "descripcion"),
      render: (v: string | null, r) => (
        <Tooltip title={r.observaciones_compra ? `Comentarios OC: ${r.observaciones_compra}` : v}>
          <span>{v || "-"}</span>
        </Tooltip>
      ),
    },
    {
      key: "cantidad",
      title: "Cant.",
      dataIndex: "cantidad",
      width: 80,
      align: "right",
      sorter: (a, b) => a.cantidad - b.cantidad,
      render: (v: number, r) => (
        <span>
          <b>{v}</b> <span style={{ color: "#888" }}>{r.unidad_medida}</span>
        </span>
      ),
    },
    {
      key: "precio_unitario",
      title: "P. Unit.",
      dataIndex: "precio_unitario",
      width: 90,
      align: "right",
      sorter: (a, b) => (a.precio_unitario ?? 0) - (b.precio_unitario ?? 0),
      render: (v: number | null, r) => (v != null ? `${r.moneda} ${v.toFixed(2)}` : "-"),
    },
    {
      key: "subtotal",
      title: "Subtotal",
      width: 110,
      align: "right",
      sorter: (a, b) => (a.precio_unitario ?? 0) * a.cantidad - (b.precio_unitario ?? 0) * b.cantidad,
      filters: [...new Set(filasAplanadas.map((r) =>
        r.precio_unitario != null ? Number((r.precio_unitario * r.cantidad).toFixed(2)) : 0
      ))].sort((a, b) => a - b).map((v) => ({ text: v.toFixed(2), value: String(v) })),
      filterSearch: true,
      onFilter: (value, r) => {
        const sub = r.precio_unitario != null ? Number((r.precio_unitario * r.cantidad).toFixed(2)) : 0;
        return String(sub) === value;
      },
      render: (_, r) =>
        r.precio_unitario != null ? (
          <b style={{ color: brand.navy }}>
            {r.moneda} {(r.precio_unitario * r.cantidad).toFixed(2)}
          </b>
        ) : "-",
    },
    {
      key: "almacen_nombre",
      title: "Almacén",
      dataIndex: "almacen_nombre",
      width: 130,
      ellipsis: true,
      ...filtroPorColumna(filasAplanadas, "almacen_nombre"),
      render: (v: string | null) => v || "-",
    },
    {
      key: "fecha_entrega_esperada",
      title: "F. Entrega",
      dataIndex: "fecha_entrega_esperada",
      width: 110,
      sorter: (a, b) => (a.fecha_entrega_esperada || "").localeCompare(b.fecha_entrega_esperada || ""),
      render: (v: string | null) => (v ? formatDateOnly(v) : "-"),
    },
  ];

  const { columnas: itemsResizable, components: itemsComponents, resetAnchos: resetItemsAnchos, TableDragWrapper: ItemsDragWrapper } =
    useColumnasRedimensionables<ItemFila>(columnasItems, "movimientos-items-cols-widths-v1");

  return (
    <div>
      {/* KPIs */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} md={8}>
          <Card styles={{ body: { padding: 12 } }}>
            <Statistic title="OCs pendientes" value={totalPOsPendientes} prefix={<InboxOutlined style={{ color: brand.cyan }} />} styles={{ content: { color: brand.cyan } }} />
          </Card>
        </Col>
        <Col xs={12} md={8}>
          <Card styles={{ body: { padding: 12 } }}>
            <Statistic title="Items por recibir" value={totalItemsPendientes} prefix={<FileDoneOutlined style={{ color: "#fa8c16" }} />} styles={{ content: { color: "#fa8c16" } }} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card styles={{ body: { padding: 12 } }}>
            <Statistic title="Valor total pendiente" value={valorTotalPendiente} precision={2} prefix="$" styles={{ content: { color: brand.navy } }} />
          </Card>
        </Col>
      </Row>

      {/* Filtros */}
      <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 12 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={10} md={7}>
            <Input
              placeholder="Buscar OC, código, material, proveedor..."
              prefix={<SearchOutlined />}
              allowClear
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Col>
          <Col xs={12} sm={6} md={5}>
            <Select
              placeholder="Proveedor"
              allowClear
              style={{ width: "100%" }}
              showSearch
              optionFilterProp="label"
              value={filtroProv}
              onChange={setFiltroProv}
              options={proveedoresUnicos.map((p) => ({ value: p, label: p }))}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select showSearch optionFilterProp="label"
              placeholder="Estado"
              allowClear
              style={{ width: "100%" }}
              value={filtroEstado}
              onChange={setFiltroEstado}
              options={estadosUnicos.map((e) => ({ value: e, label: e }))}
            />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Button icon={<ReloadOutlined />} onClick={fetchPOs} block>
              Actualizar
            </Button>
          </Col>
        </Row>
      </Card>

      {pos.length === 0 && !loading && (
        <Alert type="info" title="No hay órdenes de compra pendientes de recepción" showIcon />
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <Space wrap>
          <RangoFechasFiltro
            label="Fecha entrega esperada"
            value={rangoEntrega}
            onChange={setRangoEntrega}
          />
          {/* Acción principal: recibir los items seleccionados via checkbox.
              Valida que todos pertenezcan a una sola OC (el modal recibe 1 OC
              por vez con su guía + factura). */}
          <Button
            type="primary"
            icon={<InboxOutlined />}
            disabled={selectedItemIds.length === 0}
            onClick={() => {
              const seleccionadas = filasAplanadas.filter((r) => selectedItemIds.includes(r.id));
              const ocsUnicas = [...new Set(seleccionadas.map((r) => r.po_id))];
              if (ocsUnicas.length === 0) return;
              if (ocsUnicas.length > 1) {
                message.warning("Seleccioná items de UNA sola OC por vez. Cada OC se recibe por separado (lleva su propia guía + factura).");
                return;
              }
              abrirRecibir(ocsUnicas[0], selectedItemIds);
            }}
          >
            Recibir seleccionados ({selectedItemIds.length})
          </Button>
        </Space>
        <Space wrap>
          <ColumnasToggleButton<ItemFila>
            columns={columnasItems}
            ocultas={ingresoOcultas}
            setOcultas={setIngresoOcultas}
            obligatorias={["numero_po", "descripcion"]}
          />
          <Button onClick={resetItemsAnchos}>Restablecer anchos</Button>
        </Space>
      </div>

      <ItemsDragWrapper>
              <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={filasFiltradas.filter((r) => dentroDeRango(r, "fecha_entrega_esperada", rangoEntrega))}
          columns={visibleColumns(itemsResizable, ingresoOcultas)}
          components={itemsComponents}
          // Checkboxes para seleccionar items y recibirlos en lote vía botón
          // "Recibir seleccionados" de arriba (similar a "Generar OC").
          rowSelection={{
            selectedRowKeys: selectedItemIds,
            onChange: (keys) => setSelectedItemIds(keys as number[]),
            // Helper visual: cuando se selecciona, mostrar tip si hay items
            // de distintas OCs (la acción luego lo bloquea de forma dura).
            getCheckboxProps: () => ({}),
          }}
          pagination={paginacionEstandar({
            current: itemsPage,
            pageSize: itemsPageSize,
            total: filasFiltradas.filter((r) => dentroDeRango(r, "fecha_entrega_esperada", rangoEntrega)).length,
            onChange: (p, s) => { setItemsPage(p); setItemsPageSize(s); },
            label: "items",
          })}
          scroll={{ x: 1500 }}
          sticky={{ offsetHeader: 56, offsetScroll: 0 }}
        />
      </ItemsDragWrapper>

      {/* Modal Recibir */}
      <Modal
        title={
          <Space>
            <InboxOutlined style={{ color: brand.cyan }} />
            Recibir OC — {poSeleccionada?.numero_po}
          </Space>
        }
        open={!!poSeleccionada}
        onCancel={() => setPoSeleccionada(null)}
        width={modalWidth(screens, 1000)}
        okText="Confirmar Recepción"
        onOk={confirmarIngreso}
        confirmLoading={submitting}
      >
        {poSeleccionada && (
          <>
            <Card size="small" style={{ background: brand.bgPage, marginBottom: 12 }}>
              <Row gutter={[16, 4]}>
                <Col xs={24} sm={8}><Text type="secondary">Proveedor:</Text> <b>{poSeleccionada.proveedor_nombre}</b></Col>
                <Col xs={24} sm={8}><Text type="secondary">Almacén destino:</Text> <b>{poSeleccionada.almacen_nombre}</b></Col>
                <Col xs={24} sm={8}><Text type="secondary">Total OC:</Text> <b style={{ color: brand.navy }}>{poSeleccionada.moneda} {Number(poSeleccionada.total).toFixed(2)}</b></Col>
              </Row>
            </Card>

            <Alert
              style={{ marginBottom: 12 }}
              type="info"
              showIcon
              title="Ajusta las cantidades si lo recibido no coincide con lo solicitado. Las entradas se crearán automáticamente."
            />

            {/* Datos de la recepción */}
            <Card size="small" title={<Space><FileDoneOutlined />Datos de recepción</Space>} style={{ marginBottom: 12 }}>
              <Row gutter={12} style={{ marginBottom: 12 }}>
                <Col xs={24} sm={8}>
                  <Text strong style={{ fontSize: 12 }}>Nro. Guía de Remisión</Text>
                  <Input
                    placeholder="Ej. G001-12345"
                    value={nroGuia}
                    onChange={(e) => setNroGuia(e.target.value)}
                    prefix={<PaperClipOutlined style={{ color: brand.cyan }} />}
                  />
                </Col>
                <Col xs={24} sm={8}>
                  <Text strong style={{ fontSize: 12 }}>Nro. Factura</Text>
                  <Input
                    placeholder="Ej. F001-98765"
                    value={nroFactura}
                    onChange={(e) => setNroFactura(e.target.value)}
                  />
                </Col>
                <Col xs={24} sm={8}>
                  <Text strong style={{ fontSize: 12 }}>Comentarios de recepción</Text>
                  <Input
                    placeholder="Ej. Recibido conforme, faltó 1 unidad..."
                    value={comentariosRec}
                    onChange={(e) => setComentariosRec(e.target.value)}
                  />
                </Col>
              </Row>
              <Row gutter={12}>
                <Col xs={24} sm={16}>
                  <Text strong style={{ fontSize: 12 }}>
                    Asignar zona a todos los items <Text type="secondary" style={{ fontWeight: 400 }}>(opcional)</Text>
                  </Text>
                  <Space.Compact style={{ width: "100%" }}>
                    <Select
                      placeholder="Elegí una zona y aplicala a todos los items de la tabla"
                      value={zonaBulk ?? undefined}
                      onChange={(v) => setZonaBulk(v ?? null)}
                      options={zonasAlmacen.map((z) => ({ value: z.id, label: `${z.codigo} — ${z.nombre}` }))}
                      showSearch
                      optionFilterProp="label"
                      allowClear
                      style={{ flex: 1 }}
                    />
                    <Button
                      type="primary"
                      disabled={zonaBulk == null}
                      onClick={() => {
                        // Aplica la zona elegida a TODOS los items que estén
                        // siendo recibidos. Limpia las posiciones (cada zona tiene
                        // sus propias posiciones — el usuario las elige por fila si
                        // necesita ser más específico).
                        const next: typeof ubicByMaterial = { ...ubicByMaterial };
                        for (const it of previewItems) {
                          const matKey = it.material_id ?? it.repuesto_id;
                          next[matKey] = { zona_id: zonaBulk, posicion_id: null };
                        }
                        setUbicByMaterial(next);
                        message.success(`Zona aplicada a ${previewItems.length} item(s).`);
                      }}
                    >
                      Aplicar a todos
                    </Button>
                  </Space.Compact>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Atajo para cuando toda la mercadería va al mismo almacén. Después podés ajustar items individuales en la tabla.
                  </Text>
                </Col>
                <Col xs={24} sm={8}>
                  <Text strong style={{ fontSize: 12 }}>
                    Ubicación general (legacy) <Text type="secondary" style={{ fontWeight: 400 }}>(opcional)</Text>
                  </Text>
                  <Select
                    placeholder="Ubicación a nivel OT"
                    value={ubicacionRec}
                    onChange={setUbicacionRec}
                    options={ubicaciones.map((u) => ({ value: u.codigo, label: `${u.codigo} — ${u.nombre}` }))}
                    showSearch
                    optionFilterProp="label"
                    allowClear
                    style={{ width: "100%" }}
                  />
                </Col>
              </Row>

              <Divider style={{ margin: "8px 0", fontSize: 11, color: "#666" }}>Archivos adjuntos (opcional)</Divider>

              <Row gutter={12}>
                <Col xs={24} sm={12}>
                  <Text strong style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
                    📎 Guías de Remisión (podés adjuntar varias)
                  </Text>
                  <AdjuntosMulti
                    compra={poSeleccionada}
                    tipo="guia"
                    onChanged={async () => {
                      // Re-fetch SOLO la lista de adjuntos (no la OC entera) y
                      // mergeamos al state actual. Antes hacíamos fetch a
                      // /api/compras/[id] que devuelve un shape distinto al
                      // de POPendiente — eso pisaba campos y daba la sensación
                      // de "duplicar adjuntos y borrar lo de abajo".
                      try {
                        const r = await fetch(`/api/compras/${poSeleccionada.id}/adjuntos`);
                        if (r.ok) {
                          const j = await r.json();
                          setPoSeleccionada((prev) => prev ? { ...prev, adjuntos: j.data ?? [] } : prev);
                        }
                      } catch { /* refresco best-effort */ }
                      // El listado del grid se refresca por las dudas (otros
                      // campos como nro_guia podrían haber cambiado vía la
                      // metadata del modal de subida).
                      void fetchPOs();
                    }}
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <Text strong style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
                    📎 Facturas (podés adjuntar varias)
                  </Text>
                  <AdjuntosMulti
                    compra={poSeleccionada}
                    tipo="factura"
                    onChanged={async () => {
                      // Re-fetch SOLO la lista de adjuntos (no la OC entera) y
                      // mergeamos al state actual. Antes hacíamos fetch a
                      // /api/compras/[id] que devuelve un shape distinto al
                      // de POPendiente — eso pisaba campos y daba la sensación
                      // de "duplicar adjuntos y borrar lo de abajo".
                      try {
                        const r = await fetch(`/api/compras/${poSeleccionada.id}/adjuntos`);
                        if (r.ok) {
                          const j = await r.json();
                          setPoSeleccionada((prev) => prev ? { ...prev, adjuntos: j.data ?? [] } : prev);
                        }
                      } catch { /* refresco best-effort */ }
                      // El listado del grid se refresca por las dudas (otros
                      // campos como nro_guia podrían haber cambiado vía la
                      // metadata del modal de subida).
                      void fetchPOs();
                    }}
                  />
                </Col>
              </Row>
            </Card>

            <Table
              rowKey="id"
              pagination={false}
              size="small"
              dataSource={poSeleccionada.items}
              scroll={{ x: 1000 }}
              columns={[
                { title: "Código", dataIndex: "codigo", width: 100 },
                { title: "Descripción", dataIndex: "descripcion", ellipsis: true },
                { title: "OT", width: 100, render: (_, r) => {
                    const prev = previewItems.find((p) => p.material_id === r.material_id);
                    return prev?.ot_codigo ? <Tag color={brand.navy}>{prev.ot_codigo}</Tag> : <Text type="secondary">—</Text>;
                  },
                },
                { title: "Pedida", dataIndex: "cantidad", width: 75, align: "right" },
                {
                  title: "Recibida",
                  width: 110,
                  align: "right",
                  render: (_, r) => (
                    <InputNumber
                      min={0}
                      max={r.cantidad}
                      value={cantidadesRecibidas[r.id] ?? 0}
                      onChange={(v) => setCantidadesRecibidas({ ...cantidadesRecibidas, [r.id]: Number(v) || 0 })}
                      style={{ width: "100%" }}
                    />
                  ),
                },
                { title: "UM", dataIndex: "unidad_medida", width: 55, align: "center" },
                {
                  title: <span>Zona almacén <span style={{ color: "#cf1322" }}>*</span></span>,
                  width: 160,
                  render: (_, r) => {
                    // Para items free (material_id null), usamos el id del item
                    // como key — así cada item tiene su propio slot de zona.
                    const matKey = r.material_id ?? r.id;
                    const u = ubicByMaterial[matKey];
                    const esSugerida = u?.zona_id != null && previewItems.find((p) => p.material_id === r.material_id)?.ubicacion_sugerida?.zona_id === u.zona_id;
                    return (
                      <Select
                        value={u?.zona_id ?? undefined}
                        onChange={(v) => setUbicByMaterial({
                          ...ubicByMaterial,
                          [matKey]: { zona_id: v ?? null, posicion_id: null },
                        })}
                        placeholder="Zona"
                        size="small"
                        // allowClear para corregir si el usuario seleccionó por
                        // error. Al limpiar, la zona y la posición vuelven a null
                        // (warning status indica que falta zona si se intenta
                        // recibir el item).
                        allowClear
                        style={{ width: "100%" }}
                        status={!u?.zona_id ? "warning" : undefined}
                        options={zonasAlmacen.map((z) => ({ value: z.id, label: z.codigo }))}
                        suffixIcon={esSugerida ? <Tooltip title="Sugerida por otra ubicación de la misma OT"><Text type="success" style={{ fontSize: 10 }}>✓</Text></Tooltip> : undefined}
                      />
                    );
                  },
                },
                {
                  title: "Posición",
                  width: 130,
                  render: (_, r) => {
                    const matKey = r.material_id ?? r.id;
                    const u = ubicByMaterial[matKey];
                    const zona = zonasAlmacen.find((z) => z.id === u?.zona_id);
                    const posiciones = zona?.posiciones ?? [];
                    return (
                      <Select
                        value={u?.posicion_id ?? undefined}
                        onChange={(v) => setUbicByMaterial({
                          ...ubicByMaterial,
                          [matKey]: { zona_id: u?.zona_id ?? null, posicion_id: v ?? null },
                        })}
                        placeholder={u?.zona_id == null ? "—" : "Ej. A1"}
                        disabled={u?.zona_id == null}
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        size="small"
                        style={{ width: "100%" }}
                        options={posiciones.map((p) => ({ value: p.id, label: p.codigo }))}
                      />
                    );
                  },
                },
              ]}
            />
          </>
        )}
      </Modal>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// TAB 4: SALIDA (manual)
// ════════════════════════════════════════════════════════════
function TabSalida({ onRefresh }: { onRefresh: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [materiales, setMateriales] = useState<StockItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [matSel, setMatSel] = useState<StockItem | null>(null);
  // Modo material NO catalogado.
  const [esNoCat, setEsNoCat] = useState(false);
  const [noCat, setNoCat] = useState<{ id: number; codigo: string; descripcion: string; unidad_medida: string; stock_actual: number; ubicacion_nombre: string | null }[]>([]);
  const [noCatSel, setNoCatSel] = useState<typeof noCat[number] | null>(null);

  const cargarMateriales = useCallback(async () => {
    try {
      const res = await fetch("/api/stock");
      const json = await res.json();
      setMateriales(json.data ?? []);
    } catch {}
  }, []);

  const cargarNoCat = useCallback(async () => {
    try {
      const res = await fetch("/api/no-catalogados");
      const json = await res.json();
      setNoCat(json.data ?? []);
    } catch {}
  }, []);

  useEffect(() => {
    cargarMateriales();
    cargarNoCat();
  }, [cargarMateriales, cargarNoCat]);

  const registrar = async (tipo: "SALIDA" | "ENTRADA" | "AJUSTE") => {
    try {
      const values = await form.validateFields();
      if (tipo === "ENTRADA" && !values.tipo_ingreso) {
        message.warning("Seleccioná el tipo de ingreso (Bien / Servicio / Cargo directo).");
        return;
      }
      setSubmitting(true);
      let res: Response;
      if (esNoCat) {
        // Movimiento sobre material NO catalogado (endpoint dedicado).
        res = await fetch(`/api/no-catalogados/${values.material_id}/movimiento`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo_movimiento: tipo,
            cantidad: values.cantidad,
            motivo: values.observacion,
            documento_referencia: values.documento_referencia,
            usuario: values.usuario || "Almacenero",
          }),
        });
      } else {
        res = await fetch("/api/movimientos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            material_id: values.material_id,
            tipo_movimiento: tipo,
            cantidad: values.cantidad,
            documento_referencia: values.documento_referencia,
            observacion: values.observacion,
            usuario: values.usuario || "Almacenero",
            tipo_ingreso: tipo === "ENTRADA" ? values.tipo_ingreso : undefined,
            persona_recibe: tipo === "SALIDA" ? values.persona_recibe : undefined,
          }),
        });
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      message.success(`Movimiento ${tipo} registrado correctamente`);
      form.resetFields();
      setMatSel(null);
      setNoCatSel(null);
      await Promise.all([cargarMateriales(), cargarNoCat()]);
      onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error";
      if (!msg.includes("validation")) message.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={14}>
        <Card title={<Space><PlusOutlined />Registrar movimiento manual</Space>}>
          <Form form={form} layout="vertical">
            <Checkbox
              checked={esNoCat}
              onChange={(e) => {
                setEsNoCat(e.target.checked);
                form.setFieldsValue({ material_id: undefined });
                setMatSel(null); setNoCatSel(null);
              }}
              style={{ marginBottom: 12 }}
            >
              <b>Material NO catalogado</b> — registrar movimiento de un material fuera del catálogo
            </Checkbox>

            <Form.Item
              label={esNoCat ? "Material no catalogado" : "Material"}
              name="material_id"
              rules={[{ required: true, message: "Selecciona un material" }]}
            >
              <Select
                showSearch
                placeholder="Buscar por código o descripción..."
                optionFilterProp="label"
                onChange={(v) => {
                  if (esNoCat) {
                    setNoCatSel(noCat.find((x) => x.id === v) || null);
                  } else {
                    setMatSel(materiales.find((x) => x.material_id === v) || null);
                  }
                }}
                options={esNoCat
                  ? noCat.map((m) => ({ value: m.id, label: `${m.codigo} — ${m.descripcion}` }))
                  : materiales.map((m) => ({ value: m.material_id, label: `${m.codigo} — ${m.descripcion}` }))}
                notFoundContent={esNoCat && noCat.length === 0 ? "No hay materiales no catalogados. Creá uno en Inventario no catalogado." : undefined}
              />
            </Form.Item>

            {!esNoCat && matSel && (
              <Alert
                style={{ marginBottom: 12 }}
                type={matSel.alerta === "SIN" ? "error" : matSel.alerta === "BAJO" ? "warning" : "success"}
                showIcon
                title={
                  <Space>
                    <span>Stock actual: <b>{matSel.stock_actual}</b> {matSel.unidad_medida}</span>
                    {matSel.punto_reposicion > 0 && <span>| Pto. reposición: <b>{matSel.punto_reposicion}</b></span>}
                    {matSel.ubicacion && <span>| Ubicación: <b>{matSel.ubicacion}</b></span>}
                  </Space>
                }
              />
            )}
            {esNoCat && noCatSel && (
              <Alert
                style={{ marginBottom: 12 }}
                type={noCatSel.stock_actual <= 0 ? "error" : "success"}
                showIcon
                title={
                  <Space>
                    <span>Stock actual: <b>{noCatSel.stock_actual}</b> {noCatSel.unidad_medida}</span>
                    {noCatSel.ubicacion_nombre && <span>| Ubicación: <b>{noCatSel.ubicacion_nombre}</b></span>}
                  </Space>
                }
              />
            )}

            <Row gutter={12}>
              <Col span={12}>
                <Form.Item
                  label="Cantidad"
                  name="cantidad"
                  rules={[{ required: true, message: "Ingresa la cantidad" }]}
                >
                  <InputNumber min={0.01} step={0.01} style={{ width: "100%" }} placeholder="0.00" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Usuario" name="usuario" initialValue="Almacenero">
                  <Input placeholder="Nombre del usuario" />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item label="Documento de referencia" name="documento_referencia">
              <Input placeholder="OT-2026-001, OC-123, ajuste, etc." />
            </Form.Item>

            <Row gutter={12}>
              <Col span={12}>
                <Form.Item
                  label={<span>Tipo de ingreso <Text type="secondary" style={{ fontSize: 11 }}>(solo ENTRADA)</Text></span>}
                  name="tipo_ingreso"
                  tooltip="BIEN: mercadería física. SERVICIO: servicio facturado. CARGO DIRECTO: cargo a OT sin pasar por stock."
                >
                  <Select showSearch optionFilterProp="label"
                    placeholder="Bien / Servicio / Cargo directo"
                    allowClear
                    options={[
                      { value: "BIEN", label: "Bien" },
                      { value: "SERVICIO", label: "Servicio" },
                      { value: "CARGO_DIRECTO", label: "Cargo directo" },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  label={<span>Persona que recibe <Text type="secondary" style={{ fontSize: 11 }}>(solo SALIDA)</Text></span>}
                  name="persona_recibe"
                >
                  <Input placeholder="Nombre de quien retira el material" maxLength={150} />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item label="Observación / Comentarios" name="observacion">
              <TextArea rows={2} placeholder="Motivo del movimiento..." />
            </Form.Item>

            <Space wrap style={{ width: "100%", justifyContent: "flex-end" }}>
              <Tooltip title="Reduce el stock (ej: entrega a taller)">
                <Button
                  danger
                  icon={<ArrowUpOutlined />}
                  loading={submitting}
                  onClick={() => registrar("SALIDA")}
                >
                  Registrar SALIDA
                </Button>
              </Tooltip>
              <Tooltip title="Aumenta el stock (ej: devolución de material)">
                <Button
                  icon={<ArrowDownOutlined />}
                  style={{ background: "#52c41a", color: brand.white, borderColor: "#52c41a" }}
                  loading={submitting}
                  onClick={() => registrar("ENTRADA")}
                >
                  Registrar ENTRADA
                </Button>
              </Tooltip>
              <Tooltip title="Fija el stock al valor indicado (ajuste de inventario)">
                <Button
                  icon={<SwapOutlined />}
                  type="primary"
                  loading={submitting}
                  onClick={() => registrar("AJUSTE")}
                >
                  Registrar AJUSTE
                </Button>
              </Tooltip>
            </Space>
          </Form>
        </Card>
      </Col>

      <Col xs={24} md={10}>
        <Card title={<Space><InfoCircleOutlined />Información</Space>}>
          <Space orientation="vertical" size={12} style={{ width: "100%" }}>
            <div>
              <Text strong style={{ color: "#cf1322" }}>⬆ SALIDA</Text>
              <div style={{ fontSize: 12, color: "#666" }}>
                Usa esta opción para entregar material a un taller, técnico u OT.
                El stock se reducirá en la cantidad indicada.
              </div>
            </div>
            <Divider style={{ margin: 0 }} />
            <div>
              <Text strong style={{ color: "#389e0d" }}>⬇ ENTRADA</Text>
              <div style={{ fontSize: 12, color: "#666" }}>
                Úsala para registrar devoluciones o material recibido manualmente
                (sin una OC). Para recibir una OC completa usa la pestaña &quot;Ingreso de POs&quot;.
              </div>
            </div>
            <Divider style={{ margin: 0 }} />
            <div>
              <Text strong style={{ color: brand.cyan }}>↔ AJUSTE</Text>
              <div style={{ fontSize: 12, color: "#666" }}>
                Fija el stock al valor exacto que indiques (inventario físico).
                Útil cuando el stock del sistema no coincide con lo físico.
              </div>
            </div>
          </Space>
        </Card>
      </Col>
    </Row>
  );
}

// ════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ════════════════════════════════════════════════════════════
export default function MovimientosPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  const tabItems = [
    {
      key: "movimientos",
      label: (
        <Space>
          <FileDoneOutlined />
          Movimientos
        </Space>
      ),
      children: <TabMovimientos key={`mov-${refreshKey}`} onRefresh={() => setRefreshKey((k) => k + 1)} />,
    },
    {
      key: "ingreso",
      label: (
        <Space>
          <InboxOutlined />
          Ingreso de POs
        </Space>
      ),
      children: <TabIngresoPO key={`po-${refreshKey}`} onRefresh={() => setRefreshKey((k) => k + 1)} />,
    },
    {
      key: "salida",
      label: (
        <Space>
          <ExportOutlined />
          Salida / Manual
        </Space>
      ),
      children: <TabSalida key={`salida-${refreshKey}`} onRefresh={() => setRefreshKey((k) => k + 1)} />,
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          <ToolOutlined style={{ color: brand.cyan, marginRight: 8 }} />
          Movimientos de Inventario
        </Title>
      </div>

      <Tabs items={tabItems} defaultActiveKey="movimientos" />
    </div>
  );
}

// Helper: lista N adjuntos (guías o facturas) de una OC, permite eliminar
// uno a uno y subir más. Usa el patrón nuevo `/api/compras/[id]/adjuntos`
// (multi-archivo) y degrada al campo legacy guia_key/factura_key si existe.
function AdjuntosMulti({
  compra, tipo, onChanged,
}: {
  compra: POPendiente;
  tipo: "guia" | "factura";
  onChanged: () => void | Promise<void>;
}) {
  const { message } = App.useApp();
  const [uploading, setUploading] = useState(false);
  const legacyKey = tipo === "guia" ? compra.guia_key : compra.factura_key;
  const legacyNombre = tipo === "guia" ? compra.guia_nombre : compra.factura_nombre;
  const resource: "compra-guia" | "compra-factura" = tipo === "guia" ? "compra-guia" : "compra-factura";
  const labelTipo = tipo === "guia" ? "Guía" : "Factura";
  const multi = (compra.adjuntos ?? []).filter((a) => a.tipo === tipo);
  const filas: Array<{ adjId: number | null; r2Key: string; nombre: string | null }> = [];
  if (legacyKey) filas.push({ adjId: null, r2Key: legacyKey, nombre: legacyNombre });
  for (const a of multi) filas.push({ adjId: a.id, r2Key: a.r2_key, nombre: a.nombre_archivo });

  const eliminar = async (adjId: number | null, _r2Key: string) => {
    try {
      const url = adjId == null
        ? `/api/compras/${compra.id}/guia?tipo=${tipo}`
        : `/api/compras/${compra.id}/adjuntos/${adjId}`;
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Error al eliminar ${labelTipo.toLowerCase()}`);
      }
      message.success(`${labelTipo} eliminada`);
      await onChanged();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Error");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {filas.map((f) => (
        <Card
          key={f.adjId ?? `legacy-${f.r2Key}`}
          size="small"
          style={{ background: "#f6ffed", borderColor: "#b7eb8f" }}
        >
          <Space style={{ width: "100%", justifyContent: "space-between" }}>
            <Space size={6}>
              <CheckCircleOutlined style={{ color: "#52c41a" }} />
              <R2FileLink
                resource={resource}
                resourceId={compra.id}
                r2Key={f.r2Key}
                style={{ fontSize: 12 }}
              >
                {f.nombre || `${labelTipo} adjunta`}
              </R2FileLink>
            </Space>
            <Tooltip title="Eliminar">
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => eliminar(f.adjId, f.r2Key)}
              />
            </Tooltip>
          </Space>
        </Card>
      ))}
      <Upload
        beforeUpload={async (file) => {
          if (file.size > 20 * 1024 * 1024) {
            message.warning("Archivo demasiado grande (max 20 MB)");
            return false;
          }
          setUploading(true);
          try {
            const meta = await uploadToR2({
              file,
              uploadUrlEndpoint: `/api/compras/${compra.id}/guia/upload-url?tipo=${tipo}`,
            });
            const res = await fetch(`/api/compras/${compra.id}/adjuntos`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tipo, ...meta }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Error al registrar");
            message.success(`${labelTipo} subida correctamente`);
            await onChanged();
          } catch (err) {
            message.error(err instanceof Error ? err.message : "Error");
          } finally {
            setUploading(false);
          }
          return false;
        }}
        showUploadList={false}
        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
        disabled={uploading}
      >
        <Button icon={<UploadOutlined />} block style={{ borderStyle: "dashed" }} loading={uploading}>
          {filas.length > 0 ? `Subir otra ${labelTipo}` : `Subir ${labelTipo}`}
        </Button>
      </Upload>
    </div>
  );
}
