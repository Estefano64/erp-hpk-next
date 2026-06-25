"use client";

import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Typography,
  Table,
  Button,
  Input,
  Select,
  Tag,
  Row,
  Col,
  Card,
  Space,
  Modal,
  Form,
  DatePicker,
  App,
  Statistic,
  Tooltip,
  Popconfirm,
  Alert,
  Spin,
  Empty,
  Segmented,
} from "antd";
import {
  ArrowLeftOutlined,
  SearchOutlined,
  ReloadOutlined,
  FileDoneOutlined,
  TagOutlined,
  ShoppingCartOutlined,
  FilterOutlined,
  DollarOutlined,
  ScissorOutlined,
  PlusOutlined,
  MinusOutlined,
  InfoCircleOutlined,
  SettingOutlined,
  InboxOutlined,
  LinkOutlined,
  CopyOutlined,
  DeleteOutlined,
  SendOutlined,
  CheckOutlined,
  CloseOutlined,
  StopOutlined,
  FileAddOutlined,
} from "@ant-design/icons";
import type { ColumnsType, TableRowSelection } from "antd/es/table/interface";
import {
  numeracionColumn,
  useColumnasRedimensionables,
  useRangoFechas,
  RangoFechasFiltro,
  dentroDeRango,
  paginacionEstandar,
} from "@/lib/tables";
import { Popover, InputNumber, Divider, Checkbox, Switch } from "antd";
import { brand } from "@/lib/theme";
import { useResponsive, modalWidth } from "@/lib/responsive";
import dayjs, { Dayjs } from "dayjs";

import { formatDateOnly } from "@/lib/dates";
import { formatOtCodigo, formatOtInternaCodigo } from "@/lib/ot-formato";
import { R2FileLink } from "@/components/R2FileLink";
const { Title, Text } = Typography;
const { TextArea } = Input;

// Shape devuelto por /api/requerimientos (HEAD: anidado)
interface RequerimientoApi {
  id: number;
  // ot_id puede ser null para items pertenecientes a una OT INTERNA
  // (la fuente del id en ese caso es orden_trabajo_interna_id).
  ot_id: number | null;
  orden_trabajo_interna_id?: number | null;
  material_id: number | null;
  material_codigo: string | null;
  nro_req: string | null;
  item_req: number | null;
  tipo_codigo: string | null;
  cantidad: string | number;
  descripcion: string | null;
  fabricante_codigo: string | null;
  unidad_medida: string | null;
  fecha_solicitud: string | null;
  fecha_requerida: string | null;
  precio_unitario: string | number | null;
  moneda: string | null;
  po_id: number | null;
  nro_oc: string | null;
  observaciones?: string | null;
  // Aprobación del REQ (no de la OC). Quien lo aprobó + su comentario opcional.
  usuario_aprueba?: string | null;
  comentario_aprobacion?: string | null;
  status_requerimiento_codigo: string | null;
  status_cotizacion_codigo: string | null;
  status_oc_codigo: string | null;
  orden_trabajo: {
    id: number;
    // En BD, OrdenTrabajo.ot es Int? (no string). Lo declaramos union por defensa.
    ot: number | string | null;
    // Necesario para formatOtCodigo (V/S/REP prefix).
    tipo_codigo: string | null;
    descripcion: string | null;
    cod_rep_flota: string | null;
    cliente: { codigo: string; razon_social: string; nombre_comercial: string | null } | null;
  } | null;
  // Para items pertenecientes a una OT INTERNA, viene en este campo.
  // OrdenTrabajoInterna.ot es INTEGER (NNNNYY) tras migración — el display
  // (OIXXXXYY) lo construye formatOtInternaCodigo en la UI.
  orden_trabajo_interna?: { id: number; ot: number | string | null; descripcion: string | null } | null;
  material: { codigo: string; descripcion: string; unidad_medida_codigo: string | null; stock_actual?: string | number | null; np?: string | null; precio?: string | number | null; moneda_codigo?: string | null } | null;
  proveedor: { id: number; razon_social: string } | null;
  compra: {
    id: number;
    numero_po: string;
    // Datos de la aceptación de la OC (quien la aceptó + comentario opcional).
    // Se muestran en una columna en el detalle para distinguirlos del comentario
    // de aprobación del REQ (que es de OTRepuesto.comentario_aprobacion).
    usuario_aprueba?: string | null;
    comentario_aprobacion?: string | null;
  } | null;
  status_requerimiento: { codigo: string; nombre: string } | null;
  status_cotizacion: { codigo: string; nombre: string } | null;
  status_oc: { codigo: string; nombre: string } | null;
  adjuntos?: { id: number; nombre_archivo: string; r2_key: string; tamano: number }[];
}

// View-model plano para la tabla
interface Requerimiento {
  id: number;
  // ot_id puede ser null si el item pertenece a una OT INTERNA.
  ot_id: number | null;
  // Si el item pertenece a una OT INTERNA, este es su id. Mutuamente
  // exclusivo con ot_id (uno u otro, nunca ambos). Se usa para el filtro
  // ext/int en la cabecera del detalle.
  orden_trabajo_interna_id: number | null;
  numero_ot: string | null;
  // Descripción de la OT (no del material) — proviene de OrdenTrabajo.descripcion.
  descripcion_ot: string | null;
  // Flota de la OT — proviene de OrdenTrabajo.cod_rep_flota.
  flota: string | null;
  material_id: number | null;
  material_codigo: string | null;
  material_nombre: string | null;
  // Número de parte del material (de Material.np). Se muestra al lado de Cant.
  np: string | null;
  nro_req: string | null;
  item_req: number | null;
  tipo_codigo: string | null;
  // Tipo de la OT (BIE/SER/REP). Solo aplica a OT externa — para las internas
  // queda null y el filtro las matchea con la rama INT (orden_trabajo_interna_id).
  ot_tipo_codigo: string | null;
  cantidad: number;
  descripcion: string | null;
  fabricante_codigo: string | null;
  unidad_medida: string | null;
  fecha_solicitud: string | null;
  fecha_requerida: string | null;
  status_req: string | null;       // HEAD codes: SIN_APROBACION/APROBADO/DESAPROBADO/ANULADO
  status_req_label: string | null;
  status_cot: string | null;       // HEAD codes: PEND_COT/PEND_APROB/APROBADO/COMPLETO/ANULADO
  status_cot_label: string | null;
  status_oc: string | null;        // HEAD codes: PEND_OC/PROCESO/ENTREGADO/COMPLETO/INCOMPLETO/ANULADO/DEVOLUCION
  status_oc_label: string | null;
  nro_oc: string | null;
  numero_po: string | null;
  po_id: number | null;
  // Aprobación del REQ: usuario que aprobó + comentario opcional. La mayoría
  // de los comentarios reales viven acá ("CAT", "ALT.", recomendaciones, etc.).
  req_usuario_aprueba: string | null;
  req_comentario_aprobacion: string | null;
  // Aceptación de la OC: usuario que aceptó + comentario opcional. Es distinto
  // del comentario del REQ — son dos pasos diferentes del flujo.
  oc_usuario_aprueba: string | null;
  oc_comentario_aprobacion: string | null;
  proveedor_nombre: string | null;
  precio_unitario: number | null;
  // Precio unitario estimado (catálogo del material). Distinto del precio_unitario,
  // que es el precio efectivo del proveedor cuando ya hay cotización u OC.
  precio_estimado: number | null;
  // Moneda del precio estimado (catálogo). Puede diferir de `moneda`.
  moneda_estimada: string | null;
  moneda: string | null;
  cliente_nombre: string | null;
  observaciones?: string | null;
  stock_actual?: number;
  adjuntos?: { id: number; nombre_archivo: string; r2_key: string; tamano: number }[];
}

function normalize(r: RequerimientoApi): Requerimiento {
  // Si el item pertenece a una OT INTERNA, la info de OT viene en orden_trabajo_interna.
  // Soportamos los dos casos (OT externa y OT interna) acá para que la tabla
  // muestre el número en lugar de un guion.
  const esInterna = r.orden_trabajo == null && r.orden_trabajo_interna != null;
  const descripcionOt = esInterna
    ? r.orden_trabajo_interna?.descripcion ?? null
    : r.orden_trabajo?.descripcion ?? null;
  // numero_ot se formatea según tipo: REP raw, BIE→V######, SER→S######, INT→OI######.
  const numeroOt = esInterna
    ? formatOtInternaCodigo(r.orden_trabajo_interna?.ot ?? null, "")
    : (r.orden_trabajo?.ot != null
        ? formatOtCodigo(r.orden_trabajo.ot, r.orden_trabajo.tipo_codigo, "")
        : "");
  return {
    id: r.id,
    ot_id: r.ot_id,
    orden_trabajo_interna_id: r.orden_trabajo_interna?.id ?? r.orden_trabajo_interna_id ?? null,
    numero_ot: numeroOt || null,
    descripcion_ot: descripcionOt,
    flota: r.orden_trabajo?.cod_rep_flota ?? null,
    material_id: r.material_id,
    material_codigo: r.material?.codigo ?? r.material_codigo ?? null,
    material_nombre: r.material?.descripcion ?? null,
    np: r.material?.np ?? null,
    nro_req: r.nro_req,
    item_req: r.item_req,
    tipo_codigo: r.tipo_codigo,
    ot_tipo_codigo: r.orden_trabajo?.tipo_codigo ?? null,
    cantidad: Number(r.cantidad),
    descripcion: r.descripcion,
    fabricante_codigo: r.fabricante_codigo,
    unidad_medida: r.unidad_medida ?? r.material?.unidad_medida_codigo ?? null,
    fecha_solicitud: r.fecha_solicitud,
    fecha_requerida: r.fecha_requerida,
    status_req: r.status_requerimiento?.codigo ?? r.status_requerimiento_codigo,
    status_req_label: r.status_requerimiento?.nombre ?? null,
    status_cot: r.status_cotizacion?.codigo ?? r.status_cotizacion_codigo,
    status_cot_label: r.status_cotizacion?.nombre ?? null,
    status_oc: r.status_oc?.codigo ?? r.status_oc_codigo,
    status_oc_label: r.status_oc?.nombre ?? null,
    nro_oc: r.nro_oc,
    numero_po: r.compra?.numero_po ?? null,
    po_id: r.po_id,
    req_usuario_aprueba: r.usuario_aprueba ?? null,
    req_comentario_aprobacion: r.comentario_aprobacion ?? null,
    oc_usuario_aprueba: r.compra?.usuario_aprueba ?? null,
    oc_comentario_aprobacion: r.compra?.comentario_aprobacion ?? null,
    proveedor_nombre: r.proveedor?.razon_social ?? null,
    precio_unitario: r.precio_unitario != null ? Number(r.precio_unitario) : null,
    precio_estimado: r.material?.precio != null ? Number(r.material.precio) : null,
    moneda_estimada: r.material?.moneda_codigo ?? null,
    moneda: r.moneda,
    cliente_nombre: r.orden_trabajo?.cliente?.nombre_comercial ?? r.orden_trabajo?.cliente?.razon_social ?? null,
    observaciones: r.observaciones,
    stock_actual: r.material?.stock_actual != null ? Number(r.material.stock_actual) : undefined,
    adjuntos: r.adjuntos,
  };
}

interface ProveedorApi { id: number; razon_social: string }

const reqColor: Record<string, string> = {
  SIN_APROBACION: "default",
  APROBADO: "success",
  DESAPROBADO: "error",
  ANULADO: "default",
};
const cotColor: Record<string, string> = {
  PEND_COT: "default",
  PEND_APROB: "processing",
  APROBADO: "success",
  COMPLETO: "success",
  ANULADO: "error",
};
const ocColor: Record<string, string> = {
  PEND_OC: "default",
  PROCESO: "processing",
  ENTREGADO: "success",
  COMPLETO: "success",
  INCOMPLETO: "warning",
  ANULADO: "error",
  DEVOLUCION: "warning",
};

// useSearchParams requiere Suspense en Next 15+ para que el build no falle
// al prerenderizar. Wrapper exportado abajo.
export default function RequerimientosDetallePage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Cargando…</div>}>
      <RequerimientosDetalleInner />
    </Suspense>
  );
}

function RequerimientosDetalleInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { message } = App.useApp();
  const { screens } = useResponsive();

  const [allData, setAllData] = useState<Requerimiento[]>([]);
  const [loading, setLoading] = useState(false);
  // Paginación controlada — el user puede elegir 10/20/50/100/500.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const { rango: rangoSol, setRango: setRangoSol } = useRangoFechas();
  const { rango: rangoReq, setRango: setRangoReq } = useRangoFechas();
  const [search, setSearch] = useState("");
  const [filtroOt, setFiltroOt] = useState<string | undefined>(undefined);
  const [filtroEstado, setFiltroEstado] = useState<string | undefined>(undefined);
  const [filtroRapido, setFiltroRapido] = useState<string>("todos");
  // Filtro por tipo de material/repuesto: MAC (material catálogo), CAD
  // (cargo directo / item libre sin catálogo), SER (servicio externo).
  const [filtroTipoMat, setFiltroTipoMat] = useState<"todos" | "MAC" | "CAD" | "SER">("todos");
  // Filtro general por tipo de OT — granular:
  //   "todas"   → sin filtro
  //   "BIE"     → OT externa de tipo Bien/Venta (prefijo V)
  //   "SER"     → OT externa de tipo Servicio (prefijo S)
  //   "REP"     → OT externa de tipo Reparación (sin prefijo)
  //   "INT"     → OT interna (prefijo OI)
  //   "externa" → cualquier OT externa (BIE+SER+REP) — para compat con vistas viejas
  // Persistido en localStorage para que el user no tenga que volver a seleccionarlo.
  type FiltroTipoOT = "todas" | "BIE" | "SER" | "REP" | "INT" | "externa";
  const [filtroTipoOT, setFiltroTipoOT] = useState<FiltroTipoOT>("todas");
  const [filtroNroReq, setFiltroNroReq] = useState<string | undefined>(undefined);
  const [selectedRows, setSelectedRows] = useState<number[]>([]);

  // Modal de Crear OC
  const [modalOpen, setModalOpen] = useState(false);
  const [ocForm] = Form.useForm();
  // Reactivo al cambio de moneda en el form, para que el subtotal del header
  // del modal se redibuje con el símbolo correcto.
  const monedaModal = Form.useWatch("moneda", ocForm) as string | undefined;
  const [proveedores, setProveedores] = useState<ProveedorApi[]>([]);
  const [creatingOC, setCreatingOC] = useState(false);
  // Precios editados dentro del modal (id_requerimiento → precio). Se persisten
  // al confirmar "Generar OC" vía PATCH /api/requerimientos/[id]/precio.
  const [preciosModal, setPreciosModal] = useState<Record<number, number>>({});
  // Cantidades editadas (id_requerimiento → cantidad). Si no hay entrada,
  // se usa la cantidad original del requerimiento. Permite ajustar al alza
  // (ej: comprar más para stock) o a la baja sin tocar el req base.
  const [cantidadesModal, setCantidadesModal] = useState<Record<number, number>>({});
  // Fechas de entrega por item (id_requerimiento → Dayjs). Permite override
  // a la fecha global. Al abrir el modal se inicializa con fecha_requerida
  // del req. Hay un botón "Aplicar a todos" para pisar todas con la fecha
  // global del header.
  const [fechasItemsModal, setFechasItemsModal] = useState<Record<number, Dayjs | null>>({});
  // Items libres del modal: filas que NO vienen de un OTRepuesto existente —
  // el user las agrega directamente en el editor. Se crean en BD como
  // OTRepuesto con solo_para_oc=true al confirmar la OC (no aparecen en
  // ningún otro listado de reqs, solo en el PDF/editor de OC).
  interface ItemLibreModal {
    id: string;            // local UUID
    codigo?: string;
    descripcion: string;
    unidad_medida: string;
    cantidad: number;
    precio_unitario: number;
    fecha_entrega?: Dayjs | null;
  }
  const [itemsLibresModal, setItemsLibresModal] = useState<ItemLibreModal[]>([]);
  const genIdLibre = () => `lib-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // Sub-modal "Importar desde otra OC".
  const [modalImportarOC, setModalImportarOC] = useState(false);
  const [ocsImportables, setOcsImportables] = useState<Array<{ id: number; numero_po: string; proveedor_nombre: string | null; nombre: string | null; fecha_solicitud: string; n_items: number }>>([]);
  const [ocImportarSel, setOcImportarSel] = useState<number | null>(null);
  const [cargandoImportar, setCargandoImportar] = useState(false);
  // Campos extra del modal Crear OC — equivalentes al editor /compras/[id]/editar:
  // ref. pedido (texto libre que va en la cabecera del PDF de la OC),
  // tipo de pago / días crédito, flag IGV, descuento y "otros" (cargo extra
  // como flete, manipuleo, etc. con signo +/-).
  const [refPedidoModal, setRefPedidoModal] = useState<string>("");
  const [tipoPagoModal, setTipoPagoModal] = useState<string | null>(null);
  const [diasCreditoModal, setDiasCreditoModal] = useState<number | null>(null);
  const [aplicaIgvModal, setAplicaIgvModal] = useState<boolean>(true);
  const [descuentoModal, setDescuentoModal] = useState<number>(0);
  const [otrosModal, setOtrosModal] = useState<number>(0);
  const [otrosSignoModal, setOtrosSignoModal] = useState<"+" | "-">("+");

  // Modal de Dividir
  const [modalDividir, setModalDividir] = useState<Requerimiento | null>(null);
  const [partesDividir, setPartesDividir] = useState<number[]>([]);
  const [dividiendo, setDividiendo] = useState(false);

  // ── Modal "Consumir de Almacén Abierto" (BC Bering PO 4504281587, etc.) ─
  // Permite descontar items de los reqs seleccionados desde el stock fijo
  // de una OC marcada como `es_almacen_abierto`. Mostrá las OCs activas, el
  // user elige una, y el modal matchea cada req seleccionado contra los
  // detalles disponibles de esa OC. Si matchea (mismo material + stock OK),
  // permite confirmar. Cada item incluye el NP (Número de parte) del
  // material — es la referencia que usa logística para identificar qué se
  // está sacando del almacén abierto.
  interface OCAbiertaItem {
    detalle_id: number;
    material_id: number | null;
    material_codigo: string | null;
    descripcion: string | null;
    np: string | null;
    um: string | null;
    cantidad_total: number;
    cantidad_consumida: number;
    stock_disponible: number;
    precio_unitario: number;
  }
  interface OCAbierta {
    id: number;
    numero_po: string;
    // `nombre` = label de display (ej. "BC BEARING — OC Abierta M260033"),
    // setea en la compra. Si está cargado se prioriza sobre el proveedor.
    nombre: string | null;
    fuente_display: string;
    moneda: string;
    fecha_solicitud: string;
    fecha_expiracion: string | null;
    proveedor: { id: number; razon_social: string; nombre_comercial: string | null } | null;
    items: OCAbiertaItem[];
  }
  const [modalAbiertaOpen, setModalAbiertaOpen] = useState(false);
  const [ocsAbiertas, setOcsAbiertas] = useState<OCAbierta[]>([]);
  const [loadingAbiertas, setLoadingAbiertas] = useState(false);
  const [ocAbiertaSel, setOcAbiertaSel] = useState<number | null>(null);
  const [consumiendoAbierta, setConsumiendoAbierta] = useState(false);
  const [comentariosAbierta, setComentariosAbierta] = useState("");

  // Modal de Consumir de Almacén — requiere elegir zona + posición física.
  const [modalConsumir, setModalConsumir] = useState<Requerimiento | null>(null);
  const [consumirZonaId, setConsumirZonaId] = useState<number | null>(null);
  const [consumirPosicionId, setConsumirPosicionId] = useState<number | null>(null);
  const [consumirCantidad, setConsumirCantidad] = useState<number | null>(null);
  const [consumirObs, setConsumirObs] = useState("");
  const [consumiendo, setConsumiendo] = useState(false);

  // Modal de "Caja chica" — paga el item con efectivo del fondo fijo y cierra
  // el req inmediatamente (no pasa por OC ni por despacho).
  const [modalCajaChica, setModalCajaChica] = useState<Requerimiento | null>(null);
  // Modal "Vincular material" para reqs que se crearon como CAD o sin
  // material catalogado (material_id = null). Permite asociar el req a un
  // Material del catálogo para poder consumirlo desde stock.
  const [modalVincular, setModalVincular] = useState<Requerimiento | null>(null);
  const [materialesVincular, setMaterialesVincular] = useState<{ material_id: number; codigo: string; descripcion: string; np: string | null }[]>([]);
  const [materialIdAVincular, setMaterialIdAVincular] = useState<number | null>(null);
  const [vinculando, setVinculando] = useState(false);
  const [cajaMonto, setCajaMonto] = useState<number | null>(null);
  const [cajaMoneda, setCajaMoneda] = useState<string>("PEN");
  const [cajaProveedor, setCajaProveedor] = useState<string>("");
  const [cajaComprobante, setCajaComprobante] = useState<string>("");
  const [cajaObs, setCajaObs] = useState<string>("");
  const [pagandoCaja, setPagandoCaja] = useState(false);
  interface AlmacenZonaOpt {
    id: number;
    codigo: string;
    nombre: string;
    posiciones: { id: number; codigo: string; nombre: string | null }[];
  }
  const [zonas, setZonas] = useState<AlmacenZonaOpt[]>([]);
  useEffect(() => {
    fetch("/api/almacen-zonas")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (Array.isArray(d?.data)) setZonas(d.data); })
      .catch(() => { /* noop */ });
  }, []);
  const posicionesDeZona = useMemo(() => {
    if (consumirZonaId == null) return [];
    return zonas.find((z) => z.id === consumirZonaId)?.posiciones ?? [];
  }, [consumirZonaId, zonas]);

  // Roles (para mostrar acciones admin/aprobador de aprobar/desaprobar/anular)
  const [roles, setRoles] = useState<string[]>([]);
  const isAdmin = roles.includes("admin");

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (Array.isArray(d?.user?.roles)) setRoles(d.user.roles); })
      .catch(() => { /* noop */ });
  }, []);

  // Columnas ocultas (persistidas en localStorage)
  const COLS_STORAGE_KEY = "req-detalle-cols-v1";
  const [columnasOcultas, setColumnasOcultas] = useState<string[]>([]);
  const [columnasHidratadas, setColumnasHidratadas] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(COLS_STORAGE_KEY);
      if (stored) setColumnasOcultas(JSON.parse(stored));
    } catch { /* ignore */ }
    setColumnasHidratadas(true);
  }, []);

  useEffect(() => {
    if (!columnasHidratadas) return;
    try {
      localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(columnasOcultas));
    } catch { /* ignore */ }
  }, [columnasOcultas, columnasHidratadas]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/requerimientos?limit=10000");
      const json = await res.json();
      const raw = (json.data ?? []) as RequerimientoApi[];
      setAllData(raw.map(normalize));
    } catch {
      message.error("Error al cargar requerimientos");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    fetchData();
    // Pre-filtrar por OT y/o nro_req si vienen en la URL
    const otId = params.get("ot_id");
    if (otId) setFiltroOt(otId);
    const nroReq = params.get("nro_req");
    if (nroReq) setFiltroNroReq(nroReq);
    // Hidratar filtro tipoOT desde localStorage
    try {
      const stored = localStorage.getItem("req-detalle-tipo-ot");
      const VALORES: FiltroTipoOT[] = ["todas", "BIE", "SER", "REP", "INT", "externa"];
      if (stored && (VALORES as string[]).includes(stored)) {
        setFiltroTipoOT(stored as FiltroTipoOT);
      }
    } catch { /* ignore */ }
  }, [fetchData, params]);

  // Persistir filtro tipoOT en localStorage cada vez que cambia
  useEffect(() => {
    try { localStorage.setItem("req-detalle-tipo-ot", filtroTipoOT); } catch { /* ignore */ }
  }, [filtroTipoOT]);

  useEffect(() => {
    fetch("/api/proveedores?limit=10000")
      .then(async (pr) => {
        if (pr.ok) setProveedores((await pr.json()).data ?? []);
      })
      .catch(() => {});
  }, []);

  // Filtros rapidos
  const filteredData = useMemo(() => {
    let rows = [...allData];

    // Por tipo de OT — granular.
    //   "externa"   → cualquier OT externa (ot_id != null y no interna)
    //   "INT"       → interna (orden_trabajo_interna_id != null)
    //   "BIE/SER/REP" → externa filtrada por r.tipo_codigo
    if (filtroTipoOT === "externa") {
      rows = rows.filter((r) => !r.orden_trabajo_interna_id);
    } else if (filtroTipoOT === "INT") {
      rows = rows.filter((r) => !!r.orden_trabajo_interna_id);
    } else if (filtroTipoOT === "BIE" || filtroTipoOT === "SER" || filtroTipoOT === "REP") {
      rows = rows.filter(
        (r) => !r.orden_trabajo_interna_id && (r.ot_tipo_codigo ?? "").toUpperCase() === filtroTipoOT,
      );
    }

    // Por OT
    if (filtroOt) rows = rows.filter((r) => String(r.ot_id) === String(filtroOt));

    // Por nro_req (cuando se llega desde el listado vía ojito)
    if (filtroNroReq) rows = rows.filter((r) => (r.nro_req ?? "") === filtroNroReq);

    // Filtro rapido
    if (filtroRapido === "listos_oc") {
      // Items APROBADOS aún sin OC, listos para crear orden de compra.
      // Excluye items que ya fueron consumidos (de almacén o de OC abierta) —
      // esos ya están resueltos, no necesitan una nueva OC. También excluye
      // los que tienen observación de consumo aunque el status_oc todavía
      // no se haya actualizado (caso defensivo para consumos parciales o
      // legacy donde status_oc quedó null pero la observación lo registra).
      rows = rows.filter((r) => {
        if (r.status_req !== "APROBADO") return false;
        if (r.po_id != null) return false;
        // Cualquier item ya resuelto (consumido, entregado, pagado por caja
        // chica) NO debe seguir apareciendo en "Listos para OC".
        if (
          r.status_oc === "CONSUMIDO_ALMACEN"
          || r.status_oc === "CONSUMIDO_OC_ABIERTA"
          || r.status_oc === "ENTREGADO"
          || r.status_oc === "ANULADO"
        ) return false;
        // Defensa por si el status_oc no se actualizó pero la observación
        // sí registra el cierre (consumos parciales, caja chica, legacy).
        if (
          r.observaciones
          && /(consumi(do|d.{0,3})\s+(de|del)\s+(almac[eé]n|oc\s+abierta)|pagado\s+con\s+caja\s+chica)/i.test(r.observaciones)
        ) return false;
        // Si hay STOCK suficiente del material en inventario, el item no
        // requiere OC — debe consumirse de almacén. La fuente de verdad es
        // Material.stock_actual del catálogo (no la cant. del req asignada a
        // OTs). El user puede igual ver estos items con el filtro "Con stock".
        if (
          r.material_id != null
          && (r.stock_actual ?? 0) >= Number(r.cantidad ?? 0)
          && (r.stock_actual ?? 0) > 0
        ) return false;
        return true;
      });
    } else if (filtroRapido === "en_oc") {
      rows = rows.filter((r) => r.po_id != null);
    }

    // Tipo de material — defalt MAC para items sin tipo declarado, igual que
    // en otras vistas. CAD = item libre, SER = servicio externo.
    if (filtroTipoMat !== "todos") {
      rows = rows.filter((r) => (r.tipo_codigo ?? "MAC").toUpperCase() === filtroTipoMat);
    }

    // Estado REQ
    if (filtroEstado) rows = rows.filter((r) => (r.status_req ?? "SIN_APROBACION") === filtroEstado);

    // Rango de fechas
    rows = rows.filter((r) =>
      dentroDeRango(r, "fecha_solicitud", rangoSol) &&
      dentroDeRango(r, "fecha_requerida", rangoReq)
    );

    // Buscar
    if (search) {
      const lc = search.toLowerCase();
      rows = rows.filter((r) =>
        Object.values(r).some((v) => v && String(v).toLowerCase().includes(lc))
      );
    }

    return rows;
  }, [allData, filtroTipoOT, filtroTipoMat, filtroOt, filtroNroReq, filtroRapido, filtroEstado, search, rangoSol, rangoReq]);

  const otOptions = useMemo(() => {
    const map = new Map<number, string>();
    allData.forEach((r) => {
      if (r.ot_id && !map.has(r.ot_id)) {
        map.set(r.ot_id, r.numero_ot || `OT-${r.ot_id}`);
      }
    });
    return [...map.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, label]) => ({ value: String(id), label }));
  }, [allData]);

  // Derivar selectedRecords desde allData + selectedRows. Esto evita que se
  // pierdan los seleccionados cuando cambian los filtros (antd's onChange solo
  // pasa los `records` visibles en la página/filtro actual). También garantiza
  // que los KPIs reflejen TODOS los items seleccionados aunque algunos no estén
  // en la vista por filtros.
  const selectedRecords = useMemo(
    () => {
      const set = new Set(selectedRows);
      return allData.filter((r) => set.has(r.id));
    },
    [allData, selectedRows],
  );

  // Totales seleccion
  const totalSub = selectedRecords.reduce(
    (s, r) => s + (parseFloat(String(r.precio_unitario || 0)) * parseFloat(String(r.cantidad || 0))),
    0
  );
  const totalIGV = totalSub * 0.18;
  const totalFinal = totalSub + totalIGV;

  const rowSelection: TableRowSelection<Requerimiento> = {
    selectedRowKeys: selectedRows,
    // Solo guardamos las keys; selectedRecords se deriva arriba.
    onChange: (keys) => {
      setSelectedRows(keys as number[]);
    },
    // Mostrar checkboxes para items de TODAS las páginas (no perder selección al paginar).
    preserveSelectedRowKeys: true,
    getCheckboxProps: (r) => ({
      disabled: r.po_id != null || r.status_req === "ANULADO" || r.status_req === "DESAPROBADO",
    }),
  };

  const abrirModalOC = () => {
    if (!selectedRecords.length) {
      message.warning("Selecciona al menos un requerimiento");
      return;
    }
    // Inicializa precios editables con el precio actual de cada requerimiento
    // (0 si no tiene) y cantidades con la cantidad original. La tabla del
    // modal permite ajustar ambos antes de generar la OC.
    const precios: Record<number, number> = {};
    const cantidades: Record<number, number> = {};
    const fechas: Record<number, Dayjs | null> = {};
    for (const r of selectedRecords) {
      const p = Number(r.precio_unitario ?? 0);
      precios[r.id] = Number.isFinite(p) && p > 0 ? p : 0;
      const c = Number(r.cantidad ?? 0);
      cantidades[r.id] = Number.isFinite(c) ? c : 0;
      fechas[r.id] = r.fecha_requerida ? dayjs(r.fecha_requerida) : null;
    }
    setPreciosModal(precios);
    setCantidadesModal(cantidades);
    setFechasItemsModal(fechas);
    setItemsLibresModal([]);
    // Reset de los campos extra al abrir un modal nuevo.
    setRefPedidoModal("");
    setTipoPagoModal(null);
    setDiasCreditoModal(null);
    setAplicaIgvModal(true);
    setDescuentoModal(0);
    setOtrosModal(0);
    setOtrosSignoModal("+");
    ocForm.setFieldsValue({
      moneda: "USD",
      fecha_entrega_esperada: dayjs().add(15, "day"),
    });
    setModalOpen(true);
  };

  const generarOC = async () => {
    try {
      const values = await ocForm.validateFields();

      // Validar precios del modal (todos deben ser > 0).
      const sinPrecio = selectedRecords.filter((r) => {
        const p = preciosModal[r.id] ?? 0;
        return !Number.isFinite(p) || p <= 0;
      });
      if (sinPrecio.length > 0) {
        const labels = sinPrecio.map((r) => `${r.nro_req ?? `#${r.id}`}/${r.item_req ?? "-"}`).join(", ");
        message.error(`Falta precio en ${sinPrecio.length} item(s): ${labels}`);
        return;
      }

      setCreatingOC(true);

      // Persistir cambios de precio antes de crear la OC. Solo se PATCHean los
      // items cuyo precio del modal difiere del precio original.
      const cambios = selectedRecords.filter((r) => {
        const local = preciosModal[r.id];
        const orig = Number(r.precio_unitario ?? 0);
        return Math.abs(local - orig) > 0.0001;
      });
      for (const r of cambios) {
        const resP = await fetch(`/api/requerimientos/${r.id}/precio`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            precio_unitario: preciosModal[r.id],
            moneda: values.moneda ?? "USD",
            proveedor_id: values.proveedor_id ?? undefined,
          }),
        });
        if (!resP.ok) {
          const j = await resP.json().catch(() => ({}));
          throw new Error(j.error ?? `Error guardando precio del item ${r.nro_req ?? r.id}`);
        }
      }

      // Cantidades override: solo enviamos las que difieren de la cantidad
      // original del requerimiento (para no inflar el payload).
      const cantidadesOverride: Record<string, number> = {};
      for (const r of selectedRecords) {
        const local = cantidadesModal[r.id];
        const orig = Number(r.cantidad ?? 0);
        if (local != null && Math.abs(local - orig) > 0.0001) {
          cantidadesOverride[String(r.id)] = local;
        }
      }
      // Fechas de entrega por item: solo enviamos las que existen (no nulas).
      // El endpoint las usa para sobreescribir fecha_entrega_esperada por item.
      const fechasOverride: Record<string, string> = {};
      for (const r of selectedRecords) {
        const f = fechasItemsModal[r.id];
        if (f) fechasOverride[String(r.id)] = f.format("YYYY-MM-DD");
      }

      const res = await fetch("/api/compras/crear-oc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repuesto_ids: selectedRows,
          proveedor_id: values.proveedor_id,
          moneda: values.moneda,
          fecha_entrega_esperada: values.fecha_entrega_esperada
            ? (values.fecha_entrega_esperada as Dayjs).format("YYYY-MM-DD")
            : null,
          observaciones: values.observaciones,
          nombre: null,
          usuario: "Logistica",
          // Campos extra del editor de OC (Fase 2 del refactor del modal):
          ref_pedido: refPedidoModal || null,
          tipo_pago: tipoPagoModal,
          dias_credito: tipoPagoModal === "CONTADO" ? 0 : diasCreditoModal,
          aplica_igv: aplicaIgvModal,
          descuento: descuentoModal || 0,
          otros: otrosModal || 0,
          otros_signo: otrosSignoModal,
          cantidades_override: cantidadesOverride,
          fechas_override: fechasOverride,
          // Items libres del editor — se persisten como OTRepuesto
          // solo_para_oc=true (no aparecen en otros listados de reqs).
          items_libres: itemsLibresModal
            .filter((i) => i.descripcion.trim() && i.cantidad > 0)
            .map((i) => ({
              codigo: i.codigo?.trim() || null,
              descripcion: i.descripcion.trim(),
              unidad_medida: i.unidad_medida || "UNIDAD",
              cantidad: i.cantidad,
              precio_unitario: i.precio_unitario,
              fecha_entrega: i.fecha_entrega ? i.fecha_entrega.format("YYYY-MM-DD") : null,
            })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al crear OC");
      message.success(`OC ${json.compra?.numero_po} creada con éxito`);
      setModalOpen(false);
      setSelectedRows([]);
      setSelectedRows([]);
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      if (!msg.includes("validation")) message.error(msg);
    } finally {
      setCreatingOC(false);
    }
  };

  // ── Consumir de OC Almacén Abierto ─────────────────────────────────
  // Abre el modal y carga las OCs activas. Pre-selecciona la primera (si hay).
  const abrirModalAbierta = async () => {
    if (selectedRows.length === 0) {
      message.warning("Seleccioná items primero.");
      return;
    }
    setModalAbiertaOpen(true);
    setLoadingAbiertas(true);
    setOcAbiertaSel(null);
    setComentariosAbierta("");
    try {
      const res = await fetch("/api/compras/almacen-abierto");
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Error al cargar OCs abiertas");
      const list: OCAbierta[] = j.data ?? [];
      setOcsAbiertas(list);
      if (list.length === 1) setOcAbiertaSel(list[0].id);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Error");
    } finally {
      setLoadingAbiertas(false);
    }
  };

  // Para cada req seleccionado, calcula su match contra la OC abierta elegida.
  // Devuelve { req, detalle, stockOk, error? } por cada item.
  const matchReqsConOCAbierta = (oc: OCAbierta | undefined) => {
    if (!oc) return [];
    const seleccionados = selectedRecords;
    // Stock pendiente por detalle (mutado a medida que asignamos para que
    // múltiples reqs del mismo material no compitan por el mismo stock).
    const stockRestante = new Map<number, number>();
    for (const it of oc.items) stockRestante.set(it.detalle_id, it.stock_disponible);

    return seleccionados.map((r) => {
      // Skip si el req no tiene material o ya está en OC o anulado
      if (r.po_id != null) {
        return { req: r, detalle: null, error: "Ya tiene OC asignada", cantidadAConsumir: 0 };
      }
      if (r.status_req === "ANULADO" || r.status_req === "DESAPROBADO") {
        return { req: r, detalle: null, error: `Status ${r.status_req}`, cantidadAConsumir: 0 };
      }
      if (r.material_id == null && !r.np) {
        return { req: r, detalle: null, error: "Item free (sin material ni NP) — no aplica", cantidadAConsumir: 0 };
      }
      // Match por NP (Número de parte) — el usuario solo ve el NP en el
      // sistema. Los material_id pueden no coincidir porque la OC abierta
      // suele importarse con materiales nuevos. Como fallback aceptamos
      // match por material_id (si ambos lados tienen el mismo).
      //
      // Normalización LAXA: case-insensitive, colapsa cualquier separador
      // (guión, punto, slash, underscore, espacio múltiple) a un único
      // espacio. Así "58B-32-00919" ≡ "58B 32 00919" ≡ "58b.32.00919".
      // Los DÍGITOS sí importan — no tratamos similares (00910 vs 00919)
      // como iguales para no encubrir typos de materiales distintos.
      const normalizaNp = (s: string | null | undefined) =>
        (s ?? "")
          .trim()
          .toLowerCase()
          .replace(/[-_./\\]+/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      const npReq = normalizaNp(r.np);
      const det = oc.items.find((it) => {
        const npDet = normalizaNp(it.np);
        if (npReq && npDet && npReq === npDet) return true;
        if (r.material_id != null && it.material_id === r.material_id) return true;
        return false;
      });
      if (!det) {
        // Cuando no hay match, buscamos el NP más parecido del OC vía
        // Levenshtein y lo sugerimos en el error. Si la distancia es ≤4,
        // probablemente es un typo (ej. un dígito mal) y el user puede
        // corregir el material del req o el del OC en lugar de adivinar.
        const dist = (a: string, b: string): number => {
          if (a.length === 0) return b.length;
          if (b.length === 0) return a.length;
          const m: number[][] = Array.from({ length: a.length + 1 }, () =>
            new Array(b.length + 1).fill(0),
          );
          for (let i = 0; i <= a.length; i++) m[i][0] = i;
          for (let j = 0; j <= b.length; j++) m[0][j] = j;
          for (let i = 1; i <= a.length; i++) {
            for (let j = 1; j <= b.length; j++) {
              m[i][j] = a[i - 1] === b[j - 1]
                ? m[i - 1][j - 1]
                : 1 + Math.min(m[i - 1][j - 1], m[i - 1][j], m[i][j - 1]);
            }
          }
          return m[a.length][b.length];
        };
        let mejor: { np: string | null; d: number } | null = null;
        if (npReq) {
          for (const it of oc.items) {
            const npDet = normalizaNp(it.np);
            if (!npDet) continue;
            const d = dist(npReq, npDet);
            if (mejor == null || d < mejor.d) mejor = { np: it.np, d };
          }
        }
        const sugerencia =
          mejor && mejor.np && mejor.d > 0 && mejor.d <= 4
            ? ` — el más parecido es "${mejor.np}" (revisá si hay un typo)`
            : "";
        return {
          req: r,
          detalle: null,
          error: `NP "${r.np ?? "—"}" no figura en esta OC abierta${sugerencia}`,
          cantidadAConsumir: 0,
        };
      }
      const pedido = Number(r.cantidad);
      const disponible = stockRestante.get(det.detalle_id) ?? 0;
      const aConsumir = Math.min(pedido, disponible);
      stockRestante.set(det.detalle_id, disponible - aConsumir);
      if (aConsumir < pedido) {
        return {
          req: r,
          detalle: det,
          error: `Stock insuficiente: ${disponible} disponible, ${pedido} pedido`,
          cantidadAConsumir: aConsumir,
        };
      }
      return { req: r, detalle: det, error: null, cantidadAConsumir: aConsumir };
    });
  };

  const confirmarConsumirAbierta = async () => {
    if (!ocAbiertaSel) {
      message.warning("Elegí una OC abierta.");
      return;
    }
    const oc = ocsAbiertas.find((o) => o.id === ocAbiertaSel);
    if (!oc) return;
    const matches = matchReqsConOCAbierta(oc);
    const validos = matches.filter((m) => m.detalle && m.cantidadAConsumir > 0 && !m.error);
    if (validos.length === 0) {
      message.warning("Ningún item seleccionado puede consumirse de esta OC.");
      return;
    }
    setConsumiendoAbierta(true);
    try {
      const res = await fetch(`/api/compras/${ocAbiertaSel}/consumir-almacen-abierto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: validos.map((m) => ({
            requerimiento_id: m.req.id,
            detalle_compra_id: m.detalle!.detalle_id,
            cantidad: m.cantidadAConsumir,
          })),
          comentarios: comentariosAbierta || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Error al consumir");
      const partes: string[] = [];
      if (j.ok?.length) partes.push(`${j.ok.length} item(s) consumido(s)`);
      if (j.errores?.length) partes.push(`${j.errores.length} error(es)`);
      message[j.errores?.length ? "warning" : "success"](partes.join(", "));
      setModalAbiertaOpen(false);
      setSelectedRows([]);
      await fetchData();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Error");
    } finally {
      setConsumiendoAbierta(false);
    }
  };

  // ── Dividir requerimiento ──
  const abrirModalDividir = (r: Requerimiento) => {
    const cant = Number(r.cantidad);
    if (cant < 2) {
      message.warning("Solo se pueden dividir items con cantidad >= 2");
      return;
    }
    if (r.po_id != null) {
      message.warning("No se puede dividir un item con OC asignada");
      return;
    }
    // Dividir por defecto en dos partes iguales (o 1-resto si no divide exacto)
    const p1 = Math.floor(cant / 2);
    const p2 = cant - p1;
    setPartesDividir([p1, p2]);
    setModalDividir(r);
  };

  const cerrarModalDividir = () => {
    setModalDividir(null);
    setPartesDividir([]);
  };

  // ── Consumir de almacén ──
  // Abre un modal para que el operario elija la zona + posición física del
  // almacén donde se ubica el material. La SALIDA y el cambio de estado del
  // req (a CONSUMIDO_ALMACEN) se ejecutan en la confirmación del modal.
  const abrirModalConsumir = (r: Requerimiento) => {
    setModalConsumir(r);
    setConsumirZonaId(null);
    setConsumirPosicionId(null);
    setConsumirCantidad(r.cantidad);
    setConsumirObs("");
  };
  const confirmarConsumirDeAlmacen = async () => {
    if (!modalConsumir || consumirZonaId == null) return;
    setConsumiendo(true);
    try {
      const res = await fetch(`/api/requerimientos/${modalConsumir.id}/consumir-de-almacen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          almacen_zona_id: consumirZonaId,
          almacen_posicion_id: consumirPosicionId ?? undefined,
          cantidad: consumirCantidad ?? undefined,
          observacion: consumirObs.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al consumir de almacén");
      message.success(json.message || "Consumido de almacén");
      setModalConsumir(null);
      await fetchData();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Error al consumir de almacén");
    } finally {
      setConsumiendo(false);
    }
  };

  // ── Vincular material a un req que se creó como CAD o sin material ──
  const abrirModalVincular = async (r: Requerimiento) => {
    setModalVincular(r);
    setMaterialIdAVincular(null);
    // Fetch del catálogo bajo demanda. /api/materiales devuelve la lista
    // paginada — usamos limit alto porque el Select hace búsqueda client-side.
    try {
      const res = await fetch("/api/materiales?limit=10000");
      const j = await res.json();
      setMaterialesVincular(
        (j.data ?? []).map((m: { material_id: number; codigo: string; descripcion?: string | null; np?: string | null }) => ({
          material_id: m.material_id,
          codigo: m.codigo,
          descripcion: m.descripcion ?? "",
          np: m.np ?? null,
        })),
      );
    } catch {
      message.error("Error cargando catálogo de materiales");
    }
  };
  const confirmarVincular = async () => {
    if (!modalVincular || materialIdAVincular == null) return;
    setVinculando(true);
    try {
      const res = await fetch(`/api/requerimientos/${modalVincular.id}/vincular-material`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ material_id: materialIdAVincular }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al vincular");
      message.success(json.message || "Material vinculado");
      setModalVincular(null);
      await fetchData();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Error al vincular");
    } finally {
      setVinculando(false);
    }
  };

  // ── Caja chica ──
  // Cierra el req como pagado con efectivo del fondo fijo. NO crea OC, NO
  // toca stock, NO pasa por despacho — marca ENTREGADO inmediatamente.
  const abrirModalCajaChica = (r: Requerimiento) => {
    setModalCajaChica(r);
    setCajaMonto(typeof r.precio_unitario === "number" ? r.precio_unitario : (r.precio_unitario != null ? Number(r.precio_unitario) : null));
    setCajaMoneda(r.moneda || "PEN");
    setCajaProveedor("");
    setCajaComprobante("");
    setCajaObs("");
  };
  const confirmarCajaChica = async () => {
    if (!modalCajaChica) return;
    // Monto obligatorio: caja chica registra un gasto real con efectivo —
    // sin precio no hay forma de cuadrar la liquidación. Validación dura
    // antes de llamar al backend (el botón también está deshabilitado pero
    // doble guard por si acaso).
    if (cajaMonto == null || !(cajaMonto > 0)) {
      message.error("El monto unitario es obligatorio y debe ser mayor a 0.");
      return;
    }
    setPagandoCaja(true);
    try {
      const res = await fetch(`/api/requerimientos/${modalCajaChica.id}/consumir-caja-chica`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monto_unitario: cajaMonto,
          moneda: cajaMoneda || undefined,
          proveedor: cajaProveedor.trim() || undefined,
          comprobante: cajaComprobante.trim() || undefined,
          observacion: cajaObs.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al pagar con caja chica");
      message.success(json.message || "Pagado con caja chica");
      setModalCajaChica(null);
      await fetchData();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Error al pagar con caja chica");
    } finally {
      setPagandoCaja(false);
    }
  };

  // ── Acciones del flujo de aprobación ──
  const enviarAAprobacion = async (r: Requerimiento) => {
    try {
      const res = await fetch(`/api/requerimientos/${r.id}/enviar-a-aprobacion`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Error al enviar a aprobación");
      message.success(`${r.nro_req ?? "Item"} enviado a aprobación`);
      await fetchData();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Error");
    }
  };

  // Helper genérico: pide texto OPCIONAL en un modal y ejecuta la acción.
  // Reduce duplicación entre aprobar / desaprobar / anular. El user puede
  // dejar el campo vacío y la acción se ejecuta igual.
  function pedirMotivoYEjecutar(opts: {
    titulo: string;
    okText: string;
    danger?: boolean;
    campoLabel: string;
    placeholder: string;
    bodyKey: "comentario" | "motivo";
    url: string;
    successMsg: string;
  }) {
    let texto = "";
    Modal.confirm({
      title: opts.titulo,
      content: (
        <div style={{ marginTop: 8 }}>
          <Text style={{ fontSize: 12 }}>
            {opts.campoLabel}{" "}

          </Text>
          <Input.TextArea
            rows={3}
            placeholder={opts.placeholder}
            onChange={(e) => { texto = e.target.value; }}
            style={{ marginTop: 8 }}
            maxLength={500}
            showCount
          />
        </div>
      ),
      okText: opts.okText,
      okButtonProps: opts.danger ? { danger: true } : undefined,
      cancelText: "Cancelar",
      width: modalWidth(screens, 460),
      onOk: async () => {
        const txt = texto.trim();
        try {
          const res = await fetch(opts.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ [opts.bodyKey]: txt || null }),
          });
          const json = await res.json().catch(() => null);
          if (!res.ok) throw new Error(json?.error || "Error");
          message.success(opts.successMsg);
          await fetchData();
        } catch (err: unknown) {
          message.error(err instanceof Error ? err.message : "Error");
          throw err;
        }
      },
    });
  }

  const aprobarItem = (r: Requerimiento) => pedirMotivoYEjecutar({
    titulo: `Aprobar ${r.nro_req ?? "requerimiento"}`,
    okText: "Aprobar",
    campoLabel: "Comentario / recomendación",
    placeholder: "Ej. priorizar compra antes del 15",
    bodyKey: "comentario",
    url: `/api/requerimientos/${r.id}/aprobar`,
    successMsg: `${r.nro_req ?? "Item"} aprobado`,
  });

  const desaprobarItem = (r: Requerimiento) => pedirMotivoYEjecutar({
    titulo: `Desaprobar ${r.nro_req ?? "requerimiento"}`,
    okText: "Desaprobar",
    danger: true,
    campoLabel: "Motivo",
    placeholder: "Ej. falta cotización del proveedor",
    bodyKey: "motivo",
    url: `/api/requerimientos/${r.id}/desaprobar`,
    successMsg: `${r.nro_req ?? "Item"} desaprobado`,
  });

  const anularItem = (r: Requerimiento) => pedirMotivoYEjecutar({
    titulo: `Anular ${r.nro_req ?? "requerimiento"}`,
    okText: "Anular",
    danger: true,
    campoLabel: "Motivo",
    placeholder: "Ej. ya no aplica, cambio de scope",
    bodyKey: "motivo",
    url: `/api/requerimientos/${r.id}/anular`,
    successMsg: `${r.nro_req ?? "Item"} anulado`,
  });

  const sugerenciaDividir = (cantidad: number): number[][] => {
    // Ej para 4: [[1,1,1,1], [1,3], [2,2]]
    const sugs: number[][] = [];
    const c = Math.floor(cantidad);
    if (c < 2) return [];
    // 1+1+...+1
    sugs.push(Array(c).fill(1));
    // Mitad-mitad si es par
    if (c % 2 === 0 && c >= 4) sugs.push([c / 2, c / 2]);
    // 1 vs resto
    if (c >= 3) sugs.push([1, c - 1]);
    // 2 vs resto
    if (c >= 4) sugs.push([2, c - 2]);
    // Eliminar duplicados
    const unique: number[][] = [];
    const seen = new Set<string>();
    for (const s of sugs) {
      const k = [...s].sort((a, b) => a - b).join(",");
      if (!seen.has(k)) { seen.add(k); unique.push(s); }
    }
    return unique;
  };

  const ejecutarDividir = async () => {
    if (!modalDividir) return;
    const cantOriginal = Number(modalDividir.cantidad);
    const suma = partesDividir.reduce((s, p) => s + Number(p || 0), 0);
    if (suma > cantOriginal) {
      message.error(`La suma (${suma}) no puede superar la cantidad original (${cantOriginal})`);
      return;
    }
    if (partesDividir.some((p) => !p || p <= 0)) {
      message.error("Todas las partes deben ser mayores a 0");
      return;
    }
    if (partesDividir.length < 2) {
      message.error("Debes tener al menos 2 partes");
      return;
    }
    try {
      setDividiendo(true);
      const res = await fetch(`/api/requerimientos/${modalDividir.id}/dividir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partes: partesDividir }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al dividir");
      message.success(json.message || "Requerimiento dividido");
      cerrarModalDividir();
      await fetchData();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setDividiendo(false);
    }
  };

  // ── Helpers para filtros tipo Excel ──
  const obtenerValoresUnicos = (campo: keyof Requerimiento): Array<{ text: string; value: string }> => {
    const set = new Set<string>();
    allData.forEach((r) => {
      const v = r[campo];
      if (v !== null && v !== undefined && v !== "") set.add(String(v));
    });
    return [...set].sort().map((v) => ({ text: v, value: v }));
  };

  // Popover con info detallada de la fila
  const popoverContent = (r: Requerimiento) => (
    <div style={{ maxWidth: 380, fontSize: 12 }}>
      <div style={{ fontWeight: 600, color: brand.navy, marginBottom: 6 }}>
        {r.material_nombre || r.descripcion || "Sin descripcion"}
      </div>
      <Row gutter={[8, 4]}>
        <Col span={12}><Text type="secondary">OT:</Text> <b>{r.numero_ot || "-"}</b></Col>
        <Col span={12}><Text type="secondary">REQ/Item:</Text> <b>{r.nro_req}/{r.item_req}</b></Col>
        <Col span={12}><Text type="secondary">Código:</Text> <b>{r.material_codigo || "-"}</b></Col>
        <Col span={12}><Text type="secondary">Tipo:</Text> <b>{r.tipo_codigo || "MAC"}</b></Col>
        <Col span={12}><Text type="secondary">Cant:</Text> <b>{r.cantidad} {r.unidad_medida || ""}</b></Col>
        <Col span={12}><Text type="secondary">Fabricante:</Text> <b>{r.fabricante_codigo || "-"}</b></Col>
        <Col span={12}><Text type="secondary">Moneda:</Text> <b>{r.moneda || "USD"}</b></Col>
        <Col span={12}><Text type="secondary">P. Unit:</Text> <b>{r.precio_unitario != null ? r.precio_unitario.toFixed(2) : "-"}</b></Col>
        <Col span={12}><Text type="secondary">Subtotal:</Text> <b>{r.precio_unitario ? (r.precio_unitario * r.cantidad).toFixed(2) : "-"}</b></Col>
        <Col span={24}><Text type="secondary">Cliente:</Text> {r.cliente_nombre || "-"}</Col>
        <Col span={24}><Text type="secondary">Proveedor:</Text> {r.proveedor_nombre || "-"}</Col>
        <Col span={12}><Text type="secondary">F. Solicitud:</Text> {r.fecha_solicitud ? formatDateOnly(r.fecha_solicitud) : "-"}</Col>
        <Col span={12}><Text type="secondary">F. Requerida:</Text> {r.fecha_requerida ? formatDateOnly(r.fecha_requerida) : "-"}</Col>
      </Row>
      {r.observaciones && (
        <>
          <Divider style={{ margin: "8px 0" }} />
          <Text type="secondary" style={{ fontSize: 11 }}>Observaciones:</Text>
          <div style={{ fontSize: 11 }}>{r.observaciones}</div>
        </>
      )}
      {r.adjuntos && r.adjuntos.length > 0 && (
        <>
          <Divider style={{ margin: "8px 0" }} />
          <Text type="secondary" style={{ fontSize: 11 }}>Adjuntos ({r.adjuntos.length}):</Text>
          <div style={{ marginTop: 4 }}>
            <Space size={4} wrap>
              {r.adjuntos.map((a) => (
                <Tag key={a.id} style={{ fontSize: 10, margin: 0 }}>
                  <R2FileLink resource="req-adjunto" resourceId={a.id} r2Key={a.r2_key}>
                    📎 {a.nombre_archivo} ({(a.tamano / 1024).toFixed(1)} KB)
                  </R2FileLink>
                </Tag>
              ))}
            </Space>
          </div>
        </>
      )}
      <Divider style={{ margin: "8px 0" }} />
      <Space size={4} wrap>
        {r.numero_po && <Tag color="blue">OC: {r.numero_po}</Tag>}
        {r.status_oc && <Tag color={ocColor[r.status_oc] || "default"}>OC: {r.status_oc_label || r.status_oc}</Tag>}
        {r.status_req && <Tag color={reqColor[r.status_req] || "default"}>{r.status_req_label || r.status_req}</Tag>}
      </Space>
    </div>
  );

  const columns: ColumnsType<Requerimiento> = [
    numeracionColumn<Requerimiento>(),
    {
      key: "numero_ot",
      title: "OT",
      dataIndex: "numero_ot",
      width: 120,
      filters: obtenerValoresUnicos("numero_ot"),
      filterSearch: true,
      onFilter: (value, r) => r.numero_ot === value,
      render: (v) => (v ? <Tag color={brand.navy}>{v}</Tag> : "-"),
    },
    {
      // Cliente de la OT — el user pidió tenerlo visible y poder fijarlo en
      // la lista de columnas. Lo movimos junto a OT para que aparezca arriba
      // del dropdown y sea fácil de pinear/visualizar.
      key: "cliente_nombre",
      title: "Cliente",
      dataIndex: "cliente_nombre",
      width: 160,
      ellipsis: true,
      filters: obtenerValoresUnicos("cliente_nombre"),
      filterSearch: true,
      onFilter: (value, r) => r.cliente_nombre === value,
      render: (v: string | null) =>
        v ? <Tag color="purple" style={{ margin: 0, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis" }}>📍 {v}</Tag>
          : <Text type="secondary">—</Text>,
    },
    {
      key: "descripcion_ot",
      title: "Descripción OT",
      dataIndex: "descripcion_ot",
      width: 220,
      ellipsis: true,
      filters: obtenerValoresUnicos("descripcion_ot"),
      filterSearch: true,
      onFilter: (value, r) => r.descripcion_ot === value,
      sorter: (a, b) => (a.descripcion_ot ?? "").localeCompare(b.descripcion_ot ?? ""),
      render: (v: string | null) => v ?? <span style={{ color: "#bbb" }}>—</span>,
    },
    {
      key: "flota",
      title: "Flota",
      dataIndex: "flota",
      width: 130,
      ellipsis: true,
      filters: obtenerValoresUnicos("flota"),
      filterSearch: true,
      onFilter: (value, r) => r.flota === value,
      sorter: (a, b) => (a.flota ?? "").localeCompare(b.flota ?? ""),
      render: (v: string | null) => v
        ? <Tag color="geekblue" style={{ margin: 0 }}>{v}</Tag>
        : <span style={{ color: "#bbb" }}>—</span>,
    },
    {
      key: "status_req",
      title: "Estado REQ",
      dataIndex: "status_req",
      width: 120,
      filters: [
        { text: "Sin aprobación", value: "SIN_APROBACION" },
        { text: "Aprobado", value: "APROBADO" },
        { text: "Desaprobado", value: "DESAPROBADO" },
        { text: "Anulado", value: "ANULADO" },
      ],
      onFilter: (value, r) => (r.status_req ?? "SIN_APROBACION") === value,
      render: (_: unknown, r: Requerimiento) => {
        const code = r.status_req ?? "SIN_APROBACION";
        return <Tag color={reqColor[code] || "default"}>{r.status_req_label || code}</Tag>;
      },
    },
    {
      key: "nro_oc",
      title: "Nro OC",
      dataIndex: "numero_po",
      width: 120,
      filters: obtenerValoresUnicos("numero_po"),
      filterSearch: true,
      onFilter: (value, r) => r.numero_po === value,
      // El tag muestra el número de OC y al hover se ve quién la aceptó +
      // comentario (si dejó alguno al aceptar).
      render: (v: string | null, r: Requerimiento) => {
        if (!v) return "-";
        const hay = r.oc_usuario_aprueba || r.oc_comentario_aprobacion;
        if (!hay) return <Tag color="blue">{v}</Tag>;
        return (
          <Tooltip
            title={
              <div style={{ maxWidth: 320 }}>
                {r.oc_usuario_aprueba && <div><b>Aceptada por:</b> {r.oc_usuario_aprueba}</div>}
                {r.oc_comentario_aprobacion && (
                  <div style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid rgba(255,255,255,0.2)", whiteSpace: "pre-wrap" }}>
                    <b>Comentario:</b> {r.oc_comentario_aprobacion}
                  </div>
                )}
              </div>
            }
          >
            <Tag color="blue" style={{ cursor: "help" }}>{v}</Tag>
          </Tooltip>
        );
      },
    },
    {
      key: "comentario_aprob_req",
      title: "Coment. aprob. REQ",
      dataIndex: "req_comentario_aprobacion",
      width: 180,
      ellipsis: true,
      // Comentario / recomendación que dejó quien APROBÓ EL REQ (ej. "CAT",
      // "ALT.", "negociar precio con proveedor", etc.). El tooltip muestra
      // también quién lo aprobó.
      render: (_: unknown, r: Requerimiento) => {
        const c = r.req_comentario_aprobacion;
        if (!c) return <Text type="secondary" style={{ fontSize: 11 }}>—</Text>;
        return (
          <Tooltip
            title={
              <div style={{ maxWidth: 320, whiteSpace: "pre-wrap" }}>
                {r.req_usuario_aprueba && <div><b>Por:</b> {r.req_usuario_aprueba}</div>}
                <div style={{ marginTop: r.req_usuario_aprueba ? 4 : 0 }}>{c}</div>
              </div>
            }
          >
            <Text style={{ fontSize: 12 }} ellipsis>{c}</Text>
          </Tooltip>
        );
      },
    },
    {
      key: "comentario_aprob_oc",
      title: "Coment. aprob. OC",
      dataIndex: "oc_comentario_aprobacion",
      width: 180,
      ellipsis: true,
      // Comentario que dejó quien ACEPTÓ LA OC (paso posterior, distinto del
      // comentario del REQ). Sigue siendo opcional al aceptar.
      render: (_: unknown, r: Requerimiento) => {
        const c = r.oc_comentario_aprobacion;
        if (!c) return <Text type="secondary" style={{ fontSize: 11 }}>—</Text>;
        return (
          <Tooltip title={<div style={{ maxWidth: 320, whiteSpace: "pre-wrap" }}>{c}</div>}>
            <Text style={{ fontSize: 12 }} ellipsis>{c}</Text>
          </Tooltip>
        );
      },
    },
    {
      key: "nro_req",
      title: "Nro REQ",
      dataIndex: "nro_req",
      width: 110,
      filters: obtenerValoresUnicos("nro_req"),
      filterSearch: true,
      onFilter: (value, r) => r.nro_req === value,
    },
    {
      key: "item_req", title: "Item", dataIndex: "item_req", width: 55, align: "center",
      sorter: (a, b) => (a.item_req || 0) - (b.item_req || 0),
      filters: obtenerValoresUnicos("item_req"),
      filterSearch: true,
      onFilter: (value, r) => String(r.item_req ?? "") === String(value),
    },
    {
      key: "tipo_codigo",
      title: "Tipo",
      dataIndex: "tipo_codigo",
      width: 60,
      align: "center",
      filters: [
        { text: "MAC", value: "MAC" },
        { text: "SER", value: "SER" },
        { text: "CAD", value: "CAD" },
      ],
      onFilter: (value, r) => (r.tipo_codigo || "MAC") === value,
      render: (v) => <Tag>{v || "MAC"}</Tag>,
    },
    {
      key: "material_codigo",
      title: "Código",
      dataIndex: "material_codigo",
      width: 110,
      filters: obtenerValoresUnicos("material_codigo"),
      filterSearch: true,
      onFilter: (value, r) => r.material_codigo === value,
    },
    {
      key: "descripcion",
      title: "Descripción",
      width: 260,
      ellipsis: true,
      filters: obtenerValoresUnicos("material_nombre"),
      filterSearch: true,
      onFilter: (value, r) => (r.material_nombre ?? r.descripcion ?? "") === value,
      sorter: (a, b) => (a.material_nombre ?? a.descripcion ?? "").localeCompare(b.material_nombre ?? b.descripcion ?? ""),
      render: (_: unknown, r: Requerimiento) => (
        <Popover content={popoverContent(r)} placement="right" mouseEnterDelay={0.3} trigger="hover">
          <div style={{ lineHeight: 1.2, cursor: "help" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <InfoCircleOutlined style={{ color: brand.cyan, fontSize: 11 }} />
              <span>{r.material_nombre || r.descripcion || "-"}</span>
            </div>
            {r.observaciones && (
              <div style={{ fontSize: 10, color: "#888", fontStyle: "italic", marginTop: 2 }}>
                {r.observaciones}
              </div>
            )}
            {r.adjuntos && r.adjuntos.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <Space size={4} wrap>
                  {r.adjuntos.map((a) => (
                    <Tooltip key={a.id} title={`${a.nombre_archivo} (${(a.tamano / 1024).toFixed(1)} KB)`}>
                      <Tag style={{ fontSize: 10, margin: 0 }}>
                        <R2FileLink resource="req-adjunto" resourceId={a.id} r2Key={a.r2_key}>
                          📎 {a.nombre_archivo.length > 18 ? `${a.nombre_archivo.slice(0, 15)}...` : a.nombre_archivo}
                        </R2FileLink>
                      </Tag>
                    </Tooltip>
                  ))}
                </Space>
              </div>
            )}
          </div>
        </Popover>
      ),
    },
    {
      key: "cantidad",
      title: "Cant.",
      dataIndex: "cantidad",
      width: 70,
      align: "center",
      sorter: (a, b) => Number(a.cantidad) - Number(b.cantidad),
      filters: obtenerValoresUnicos("cantidad"),
      filterSearch: true,
      onFilter: (value, r) => String(r.cantidad) === String(value),
      render: (v: number, r: Requerimiento) => {
        const canSplit = Number(v) >= 2 && r.po_id == null;
        return (
          <Space size={4}>
            <span style={{ fontWeight: 600 }}>{v}</span>
            {canSplit && (
              <Tooltip title="Dividir cantidad">
                <Button
                  size="small"
                  type="text"
                  icon={<ScissorOutlined style={{ color: brand.cyan }} />}
                  onClick={() => abrirModalDividir(r)}
                />
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      key: "np",
      title: "N° de Parte",
      dataIndex: "np",
      width: 130,
      filters: obtenerValoresUnicos("np"),
      filterSearch: true,
      onFilter: (value, r) => r.np === value,
      render: (v: string | null) => v ?? <span style={{ color: "#bbb" }}>—</span>,
    },
    {
      key: "unidad_medida", title: "UM", dataIndex: "unidad_medida", width: 55, align: "center",
      filters: obtenerValoresUnicos("unidad_medida"),
      filterSearch: true,
      onFilter: (value, r) => r.unidad_medida === value,
    },
    {
      key: "fabricante_codigo",
      title: "Fabricante",
      dataIndex: "fabricante_codigo",
      width: 90,
      align: "center",
      filters: obtenerValoresUnicos("fabricante_codigo"),
      filterSearch: true,
      onFilter: (value, r) => r.fabricante_codigo === value,
    },
    {
      key: "proveedor_nombre",
      title: "Proveedor",
      dataIndex: "proveedor_nombre",
      width: 140,
      ellipsis: true,
      filters: obtenerValoresUnicos("proveedor_nombre"),
      filterSearch: true,
      onFilter: (value, r) => r.proveedor_nombre === value,
    },
    {
      key: "precio_estimado",
      title: "P. Estimado",
      dataIndex: "precio_estimado",
      width: 100,
      align: "right",
      sorter: (a, b) => Number(a.precio_estimado || 0) - Number(b.precio_estimado || 0),
      filters: obtenerValoresUnicos("precio_estimado"),
      filterSearch: true,
      onFilter: (value, r) => String(r.precio_estimado ?? "") === String(value),
      render: (v: number | null, r: Requerimiento) => v != null
        ? <Text style={{ fontSize: 11 }}>{Number(v).toFixed(2)} <Text type="secondary" style={{ fontSize: 9 }}>{r.moneda_estimada ?? "USD"}</Text></Text>
        : <Text type="secondary">—</Text>,
    },
    {
      key: "precio_unitario",
      title: "P. Unit.",
      dataIndex: "precio_unitario",
      width: 80,
      align: "right",
      sorter: (a, b) => Number(a.precio_unitario || 0) - Number(b.precio_unitario || 0),
      filters: obtenerValoresUnicos("precio_unitario"),
      filterSearch: true,
      onFilter: (value, r) => String(r.precio_unitario ?? "") === String(value),
      render: (v: number | null) => (v != null ? Number(v).toFixed(2) : "-"),
    },
    {
      key: "moneda",
      title: "Moneda",
      dataIndex: "moneda",
      width: 65,
      align: "center",
      filters: [{ text: "USD", value: "USD" }, { text: "PEN", value: "PEN" }],
      onFilter: (value, r) => r.moneda === value,
    },
    {
      key: "fecha_solicitud",
      title: "F. Solicitud",
      dataIndex: "fecha_solicitud",
      width: 105,
      sorter: (a, b) => (a.fecha_solicitud || "").localeCompare(b.fecha_solicitud || ""),
      filters: [...new Set(allData.map((r) => r.fecha_solicitud ? formatDateOnly(r.fecha_solicitud) : null).filter(Boolean) as string[])]
        .sort().map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, r) => (r.fecha_solicitud ? formatDateOnly(r.fecha_solicitud) : "") === value,
      render: (v: string | null) => (v ? formatDateOnly(v) : "-"),
    },
    {
      key: "fecha_requerida",
      title: "F. Requerida",
      dataIndex: "fecha_requerida",
      width: 105,
      sorter: (a, b) => (a.fecha_requerida || "").localeCompare(b.fecha_requerida || ""),
      filters: [...new Set(allData.map((r) => r.fecha_requerida ? formatDateOnly(r.fecha_requerida) : null).filter(Boolean) as string[])]
        .sort().map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, r) => (r.fecha_requerida ? formatDateOnly(r.fecha_requerida) : "") === value,
      render: (v: string | null) => (v ? formatDateOnly(v) : "-"),
    },
    {
      key: "acciones",
      title: "Acciones",
      width: 150,
      fixed: "right",
      align: "center",
      render: (_: unknown, r: Requerimiento) => {
        // Estados:
        //   - BORRADOR: técnico puede enviar a aprobación.
        //   - SIN_APROBACION: admin puede aprobar / desaprobar.
        //   - APROBADO sin OC: admin puede anular; cualquier rol puede consumir de almacén.
        //   - ANULADO / DESAPROBADO / con OC: solo lectura.
        const sr = r.status_req;
        const sinOC = r.po_id == null && !r.nro_oc;
        const noAnulado = sr !== "ANULADO" && sr !== "DESAPROBADO";
        const noStockEstado = r.status_oc !== "ANULADO" && r.status_oc !== "DEVOLUCION";

        const puedeEnviar = sr === "BORRADOR" && sinOC;
        const puedeAprobar = isAdmin && sr === "SIN_APROBACION" && sinOC;
        const puedeDesaprobar = isAdmin && sr === "SIN_APROBACION" && sinOC;
        const puedeAnular = isAdmin && noAnulado && sinOC;

        // Consumir de almacén: requiere material, sin OC, no anulado, stock suficiente.
        const hayMaterial = r.material_id != null;
        const stockOk = (r.stock_actual ?? 0) >= Number(r.cantidad);
        const puedeConsumir = hayMaterial && sinOC && noStockEstado && stockOk && noAnulado;
        const motivoDeshab = !hayMaterial
          ? "Sin material vinculado"
          : !sinOC
          ? "Ya está asignado a una OC"
          : !noStockEstado || !noAnulado
          ? `Estado ${sr ?? r.status_oc} no permite consumir`
          : !stockOk
          ? `Stock insuficiente (${r.stock_actual ?? 0} / ${r.cantidad})`
          : "";

        return (
          <Space size={4} wrap>
            {puedeEnviar && (
              <Tooltip title="Enviar a aprobación">
                <Popconfirm
                  title="Enviar a aprobación"
                  description="El item pasará a estado SIN_APROBACION y quedará pendiente de revisión."
                  okText="Enviar"
                  cancelText="Cancelar"
                  onConfirm={() => enviarAAprobacion(r)}
                >
                  <Button size="small" icon={<SendOutlined />} />
                </Popconfirm>
              </Tooltip>
            )}
            {puedeAprobar && (
              <Tooltip title="Aprobar (podés dejar un comentario opcional)">
                <Button
                  size="small"
                  type="primary"
                  icon={<CheckOutlined />}
                  onClick={() => aprobarItem(r)}
                />
              </Tooltip>
            )}
            {puedeDesaprobar && (
              <Tooltip title="Desaprobar">
                <Button
                  size="small"
                  danger
                  icon={<CloseOutlined />}
                  onClick={() => desaprobarItem(r)}
                />
              </Tooltip>
            )}
            {puedeAnular && (
              <Tooltip title="Anular">
                <Button
                  size="small"
                  icon={<StopOutlined />}
                  onClick={() => anularItem(r)}
                />
              </Tooltip>
            )}
            <Tooltip title={puedeConsumir ? "Consumir esta cantidad del stock interno (elige zona + posición)" : motivoDeshab}>
              <Button
                size="small"
                icon={<InboxOutlined />}
                disabled={!puedeConsumir}
                onClick={() => abrirModalConsumir(r)}
              />
            </Tooltip>
            {!hayMaterial && sinOC && noAnulado && noStockEstado && (
              <Tooltip title="Vincular este req a un material del catálogo (cambia a tipo MAC). Útil para reqs creados como CAD por error.">
                <Button
                  size="small"
                  icon={<LinkOutlined />}
                  onClick={() => abrirModalVincular(r)}
                />
              </Tooltip>
            )}
            {(() => {
              // Caja chica: cierra el req con efectivo. Aplica si NO tiene OC
              // y NO está anulado. No requiere material catálogo (puede ser
              // cargo directo).
              const puedeCajaChica = sinOC && noStockEstado && noAnulado && r.status_oc !== "ENTREGADO";
              const motivoCaja = !sinOC
                ? "Ya tiene OC asignada"
                : !noAnulado || r.status_oc === "ENTREGADO"
                ? `Estado ${r.status_oc ?? sr} no permite caja chica`
                : "";
              return (
                <Tooltip title={puedeCajaChica ? "Pagar con caja chica (cierra el req inmediatamente)" : motivoCaja}>
                  <Button
                    size="small"
                    icon={<DollarOutlined />}
                    disabled={!puedeCajaChica}
                    onClick={() => abrirModalCajaChica(r)}
                  />
                </Tooltip>
              );
            })()}
          </Space>
        );
      },
    },
  ];

  // Hacer las columnas redimensionables (drag horizontal en el borde derecho del header).
  const { columnas: columnasResizable, components: tableComponents , TableDragWrapper } =
    useColumnasRedimensionables<Requerimiento>(columns, "req-detalle-cols-widths-v1", { data: filteredData });

  // Filtrar columnas visibles (respetando orden)
  const columnasVisibles = columnasResizable.filter((c) => !columnasOcultas.includes(String(c.key)));
  const clavesTotales = columns.map((c) => String(c.key));
  const clavesVisibles = clavesTotales.filter((k) => !columnasOcultas.includes(k));

  // Popover selección de columnas
  const contenidoColumnas = (
    <div style={{ minWidth: 240, maxHeight: 420, overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <Button
          size="small"
          type="link"
          onClick={() => setColumnasOcultas([])}
          disabled={columnasOcultas.length === 0}
        >
          Mostrar todas
        </Button>
        <Button
          size="small"
          type="link"
          danger
          onClick={() => setColumnasOcultas(clavesTotales.filter((k) => k !== "numero_ot"))}
        >
          Ocultar todas
        </Button>
      </div>
      <Divider style={{ margin: "4px 0 8px" }} />
      <Checkbox.Group
        value={clavesVisibles}
        onChange={(checkedValues) => {
          const checked = checkedValues as string[];
          const obligatorias = ["numero_ot"];
          const ocultas = clavesTotales.filter(
            (k) => !checked.includes(k) && !obligatorias.includes(k)
          );
          setColumnasOcultas(ocultas);
        }}
        style={{ width: "100%" }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {columns.map((c) => {
            const k = String(c.key);
            const obligatoria = k === "numero_ot";
            return (
              <Checkbox key={k} value={k} disabled={obligatoria}>
                <span style={{ fontSize: 13 }}>
                  {typeof c.title === "string" ? c.title : k}
                  {obligatoria && (
                    <span style={{ color: "#999", fontSize: 11, marginLeft: 6 }}>(fija)</span>
                  )}
                </span>
              </Checkbox>
            );
          })}
        </div>
      </Checkbox.Group>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push("/requerimientos")} style={{ marginBottom: 8 }}>
        Volver a Requerimientos
      </Button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Detalle de Requerimientos
          </Title>
          <Text type="secondary">
            {filteredData.length} items de {new Set(filteredData.map((r) => r.ot_id)).size} OT(s)
          </Text>
        </div>
        <Space wrap>
          <Popover
            content={contenidoColumnas}
            title={
              <Space>
                <SettingOutlined style={{ color: brand.navy }} />
                <span>Columnas visibles ({clavesVisibles.length}/{clavesTotales.length})</span>
              </Space>
            }
            trigger="click"
            placement="bottomRight"
          >
            <Button icon={<SettingOutlined />}>Columnas</Button>
          </Popover>
          {selectedRows.length > 0 && (
            <>
              <Tooltip title="Descuenta los items seleccionados del stock de una OC marcada como 'almacén abierto' (ej. BC Bering PO 4504281587). No genera OC nueva.">
                <Button
                  size="large"
                  icon={<InboxOutlined />}
                  onClick={abrirModalAbierta}
                  style={{ background: brand.cyan, borderColor: brand.cyan, color: "#fff" }}
                >
                  Consumir de Almacén Abierto ({selectedRows.length})
                </Button>
              </Tooltip>
              <Button type="primary" size="large" icon={<FileDoneOutlined />} onClick={abrirModalOC}>
                Crear OC ({selectedRows.length})
              </Button>
            </>
          )}
        </Space>
      </div>

      {/* KPI Cards */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card styles={{ body: { padding: 12 } }}>
            <Statistic title="Items visibles" value={filteredData.length} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card styles={{ body: { padding: 12 } }}>
            <Statistic title="Seleccionados" value={selectedRows.length} styles={{ content: { color: brand.cyan } }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card styles={{ body: { padding: 12 } }}>
            <Statistic
              title="Subtotal Seleccion"
              value={totalSub}
              precision={2}
              prefix="$"
              styles={{ content: { color: brand.navy } }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card styles={{ body: { padding: 12 } }}>
            <Statistic
              title="Total + IGV 18%"
              value={totalFinal}
              precision={2}
              prefix="$"
              styles={{ content: { color: "#722ed1" } }}
            />
          </Card>
        </Col>
      </Row>

      {/* Filtros */}
      <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={8} md={6}>
            <Input
              placeholder="Buscar..."
              prefix={<SearchOutlined />}
              allowClear
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              placeholder="Filtrar por OT"
              allowClear
              style={{ width: "100%" }}
              showSearch
              optionFilterProp="label"
              value={filtroOt}
              onChange={setFiltroOt}
              options={otOptions}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select showSearch optionFilterProp="label"
              placeholder="Estado REQ"
              allowClear
              style={{ width: "100%" }}
              value={filtroEstado}
              onChange={setFiltroEstado}
              options={[
                { value: "SIN_APROBACION", label: "Sin aprobación" },
                { value: "APROBADO", label: "Aprobado" },
                { value: "DESAPROBADO", label: "Desaprobado" },
                { value: "ANULADO", label: "Anulado" },
              ]}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                setSearch("");
                setFiltroOt(undefined);
                setFiltroEstado(undefined);
                setFiltroRapido("todos");
                setFiltroNroReq(undefined);
              }}
              block
            >
              Limpiar
            </Button>
          </Col>
        </Row>

        {/* Filtro por tipo de OT (externa/interna/todas) — persistido en localStorage */}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${brand.border}` }}>
          <Space wrap size={8} align="center">
            <Text type="secondary" style={{ fontSize: 12 }}>
              <FilterOutlined /> Tipo de OT:
            </Text>
            {(() => {
              // Conteos en vivo derivados del dataset SIN aplicar el filtro tipoOT
              // (así el badge muestra cuántos hay de cada tipo independientemente
              // de qué esté seleccionado actualmente).
              const externas = allData.filter((r) => !r.orden_trabajo_interna_id);
              const totalBIE = externas.filter((r) => (r.ot_tipo_codigo ?? "").toUpperCase() === "BIE").length;
              const totalSER = externas.filter((r) => (r.ot_tipo_codigo ?? "").toUpperCase() === "SER").length;
              const totalREP = externas.filter((r) => (r.ot_tipo_codigo ?? "").toUpperCase() === "REP").length;
              const totalInt = allData.filter((r) => !!r.orden_trabajo_interna_id).length;
              return (
                <Segmented
                  size="small"
                  value={filtroTipoOT}
                  onChange={(v) => setFiltroTipoOT(v as FiltroTipoOT)}
                  options={[
                    { label: `Todas (${allData.length})`, value: "todas" },
                    { label: `Venta · V (${totalBIE})`, value: "BIE" },
                    { label: `Servicio · S (${totalSER})`, value: "SER" },
                    { label: `Reparación (${totalREP})`, value: "REP" },
                    { label: `Interna · OI (${totalInt})`, value: "INT" },
                  ]}
                />
              );
            })()}
          </Space>
          {/* Filtro por tipo de material/repuesto */}
          <Space wrap size={8} align="center" style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              <FilterOutlined /> Tipo de material:
            </Text>
            {(() => {
              const totalMAC = allData.filter((r) => (r.tipo_codigo ?? "MAC").toUpperCase() === "MAC").length;
              const totalCAD = allData.filter((r) => (r.tipo_codigo ?? "").toUpperCase() === "CAD").length;
              const totalSER_mat = allData.filter((r) => (r.tipo_codigo ?? "").toUpperCase() === "SER").length;
              return (
                <Segmented
                  size="small"
                  value={filtroTipoMat}
                  onChange={(v) => setFiltroTipoMat(v as "todos" | "MAC" | "CAD" | "SER")}
                  options={[
                    { label: `Todos (${allData.length})`, value: "todos" },
                    { label: `MAC · catálogo (${totalMAC})`, value: "MAC" },
                    { label: `CAD · libre (${totalCAD})`, value: "CAD" },
                    { label: `SER · servicio (${totalSER_mat})`, value: "SER" },
                  ]}
                />
              );
            })()}
          </Space>
        </div>

        {/* Filtros rapidos */}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${brand.border}` }}>
          <Space wrap>
            <Text type="secondary" style={{ fontSize: 12 }}>
              <FilterOutlined /> Filtro rápido:
            </Text>
            <Tooltip title="Filtra solo items APROBADOS aún sin OC, listos para crear orden de compra">
              <Button
                size="small"
                type={filtroRapido === "listos_oc" ? "primary" : "default"}
                icon={<FileAddOutlined />}
                onClick={() => setFiltroRapido(filtroRapido === "listos_oc" ? "todos" : "listos_oc")}
              >
                Listos para OC
              </Button>
            </Tooltip>
            <Button
              size="small"
              type={filtroRapido === "en_oc" ? "primary" : "default"}
              icon={<FileDoneOutlined />}
              onClick={() => setFiltroRapido(filtroRapido === "en_oc" ? "todos" : "en_oc")}
            >
              En OC
            </Button>
          </Space>
        </div>
      </Card>

      {/* Filtros por rango de fecha */}
      <Row gutter={[12, 8]} style={{ marginBottom: 12 }}>
        <Col xs={24} md={12}>
          <RangoFechasFiltro label="Fecha solicitud" value={rangoSol} onChange={setRangoSol} />
        </Col>
        <Col xs={24} md={12}>
          <RangoFechasFiltro label="Fecha requerida" value={rangoReq} onChange={setRangoReq} />
        </Col>
      </Row>

      {/* Aviso del resaltado por stock */}
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 12 }}
        title="Las filas en amarillo indican items con stock disponible en almacén — se pueden entregar sin generar OC."
      />

      {/* Tabla */}
      <TableDragWrapper>
              <Table
          rowKey="id"
          rowSelection={rowSelection}
          columns={columnasVisibles}
          components={tableComponents}
          dataSource={filteredData}
          loading={loading}
          pagination={paginacionEstandar({
            current: page,
            pageSize,
            total: filteredData.length,
            onChange: (p, s) => { setPage(p); setPageSize(s); },
          })}
          scroll={{ x: 2000 }}
          sticky={{ offsetHeader: 56, offsetScroll: 0 }}
          size="small"
          rowClassName={(r) => {
            const tieneStock = r.material_id != null
              && r.po_id == null
              && r.status_req !== "ANULADO"
              && r.status_req !== "DESAPROBADO"
              && (r.stock_actual ?? 0) >= Number(r.cantidad ?? 0)
              && (r.stock_actual ?? 0) > 0;
            return tieneStock ? "req-row-stock" : "";
          }}
        />
      </TableDragWrapper>

      <style dangerouslySetInnerHTML={{ __html: `
        .req-row-stock > td { background: #FFFBE6 !important; }
        .req-row-stock:hover > td { background: #FFF1B8 !important; }
      ` }} />

      {/* Modal Crear OC */}
      <Modal
        title={
          <Space>
            <FileDoneOutlined style={{ color: brand.navy }} />
            Crear Orden de Compra ({selectedRows.length} item{selectedRows.length !== 1 ? "s" : ""})
          </Space>
        }
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        width={modalWidth(screens, 900)}
        footer={null}
      >
        {(() => {
          // Subtotal recalculado en vivo sobre `preciosModal` y `cantidadesModal`
          // para reflejar los precios + cantidades editados antes de generar
          // la OC. IGV opcional según `aplicaIgvModal`. Descuento se resta
          // del subtotal; "otros" se suma o resta según su signo.
          // Subtotal = items vinculados a req + items libres del editor.
          const subReqs = selectedRecords.reduce(
            (s, r) => s + (preciosModal[r.id] ?? 0) * (cantidadesModal[r.id] ?? Number(r.cantidad ?? 0)),
            0,
          );
          const subLibres = itemsLibresModal.reduce(
            (s, i) => s + (i.precio_unitario || 0) * (i.cantidad || 0),
            0,
          );
          const totalSubModal = subReqs + subLibres;
          const itemsCount = selectedRows.length + itemsLibresModal.length;
          const baseImponible = Math.max(0, totalSubModal - (descuentoModal || 0));
          const igvModal = aplicaIgvModal ? baseImponible * 0.18 : 0;
          const otrosAplicados = otrosSignoModal === "-" ? -(otrosModal || 0) : (otrosModal || 0);
          const totalFinal = baseImponible + igvModal + otrosAplicados;
          const simbolo = monedaModal === "SOL" || monedaModal === "PEN" ? "S/ " : "$ ";
          return (
            <div style={{ marginBottom: 16 }}>
              <Card size="small" style={{ background: brand.bgPage }}>
                <Row gutter={[12, 8]}>
                  <Col xs={12} md={4}>
                    <Statistic title="Items" value={itemsCount} />
                  </Col>
                  <Col xs={12} md={4}>
                    <Statistic
                      title="Subtotal"
                      value={totalSubModal}
                      precision={2}
                      prefix={simbolo}
                      styles={{ content: { color: brand.textSecondary, fontWeight: 500, fontSize: 16 } }}
                    />
                  </Col>
                  <Col xs={12} md={4}>
                    <div style={{ fontSize: 12, color: brand.textSecondary, marginBottom: 4 }}>Descuento</div>
                    <InputNumber
                      size="small"
                      value={descuentoModal || null}
                      min={0}
                      step={0.01}
                      precision={2}
                      prefix={simbolo}
                      placeholder="0.00"
                      style={{ width: "100%" }}
                      onChange={(v) => setDescuentoModal(v == null ? 0 : Number(v))}
                    />
                  </Col>
                  <Col xs={12} md={4}>
                    <Statistic
                      title={aplicaIgvModal ? "IGV (18%)" : "Sin IGV"}
                      value={igvModal}
                      precision={2}
                      prefix={simbolo}
                      styles={{ content: { color: aplicaIgvModal ? brand.textSecondary : "#aaa", fontWeight: 500, fontSize: 16 } }}
                    />
                  </Col>
                  <Col xs={12} md={4}>
                    <div style={{ fontSize: 12, color: brand.textSecondary, marginBottom: 4 }}>
                      Otros
                      <Tooltip title="Cargo extra (flete, manipuleo, etc.). El signo +/- determina si suma o resta del total.">
                        <InfoCircleOutlined style={{ fontSize: 10, marginLeft: 4, color: brand.textSecondary }} />
                      </Tooltip>
                    </div>
                    <Space.Compact size="small" style={{ width: "100%" }}>
                      <Select
                        size="small"
                        value={otrosSignoModal}
                        onChange={(v) => setOtrosSignoModal(v)}
                        options={[{ value: "+", label: "+" }, { value: "-", label: "−" }]}
                        style={{ width: 55 }}
                      />
                      <InputNumber
                        size="small"
                        value={otrosModal || null}
                        min={0}
                        step={0.01}
                        precision={2}
                        prefix={simbolo}
                        placeholder="0.00"
                        style={{ width: "100%" }}
                        onChange={(v) => setOtrosModal(v == null ? 0 : Number(v))}
                      />
                    </Space.Compact>
                  </Col>
                  <Col xs={24} md={4} style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, color: brand.textSecondary, marginBottom: 4 }}>TOTAL</div>
                    <div style={{ color: brand.navy, fontWeight: 700, fontSize: 22, lineHeight: 1.1 }}>
                      {simbolo}{totalFinal.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </Col>
                </Row>
              </Card>
            </div>
          );
        })()}

        {/* Tabla editable de items — el usuario ajusta precio, cantidad y
            fecha de entrega antes de generar la OC. */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
            <Text strong style={{ fontSize: 13 }}>Items de la OC</Text>
            <Text type="secondary" style={{ fontSize: 11 }}>
              (editá precio, cantidad y fecha de entrega de cada ítem)
            </Text>
            <Button
              size="small"
              onClick={() => {
                const fGlobal = ocForm.getFieldValue("fecha_entrega_esperada") as Dayjs | null | undefined;
                if (!fGlobal) {
                  message.warning("Definí primero la 'Fecha entrega esperada' del header.");
                  return;
                }
                const nuevas: Record<number, Dayjs | null> = {};
                for (const r of selectedRecords) nuevas[r.id] = fGlobal;
                setFechasItemsModal(nuevas);
                message.success(`Fecha aplicada a ${selectedRecords.length} item(s).`);
              }}
              style={{ marginLeft: "auto" }}
            >
              Aplicar F. Entrega global a todos los items
            </Button>
          </div>
          <Table
            size="small"
            rowKey="id"
            dataSource={selectedRecords}
            pagination={false}
            scroll={{ x: 600 }}
            style={{ marginTop: 6 }}
            columns={[
              {
                title: "Req / Item", key: "ref", width: 110,
                render: (_, r: Requerimiento) => (
                  <Text style={{ fontSize: 11 }}>
                    {r.nro_req ?? `#${r.id}`}<Text type="secondary"> / {r.item_req ?? "-"}</Text>
                  </Text>
                ),
              },
              {
                title: "Descripción", key: "desc", ellipsis: true,
                render: (_, r: Requerimiento) => (
                  <Text style={{ fontSize: 12 }}>
                    {r.material_codigo ? `${r.material_codigo} — ` : ""}{r.descripcion ?? "—"}
                  </Text>
                ),
              },
              {
                title: "Cant.", key: "cant", width: 110, align: "right",
                render: (_, r: Requerimiento) => {
                  const cant = cantidadesModal[r.id] ?? Number(r.cantidad ?? 0);
                  return (
                    <Space.Compact size="small" style={{ width: "100%" }}>
                      <InputNumber
                        size="small"
                        value={cant || null}
                        min={0.0001}
                        step={1}
                        precision={2}
                        style={{ width: "100%" }}
                        onChange={(v) =>
                          setCantidadesModal((prev) => ({ ...prev, [r.id]: v == null ? 0 : Number(v) }))
                        }
                      />
                    </Space.Compact>
                  );
                },
              },
              {
                title: "Precio unit.", key: "precio", width: 130, align: "right",
                render: (_, r: Requerimiento) => {
                  const val = preciosModal[r.id] ?? 0;
                  const invalido = !Number.isFinite(val) || val <= 0;
                  return (
                    <InputNumber
                      size="small"
                      value={val || null}
                      min={0}
                      step={0.01}
                      precision={2}
                      style={{
                        width: "100%",
                        borderColor: invalido ? "#ff4d4f" : undefined,
                        background: invalido ? "#fff1f0" : undefined,
                      }}
                      placeholder="0.00"
                      onChange={(v) =>
                        setPreciosModal((prev) => ({ ...prev, [r.id]: v == null ? 0 : Number(v) }))
                      }
                    />
                  );
                },
              },
              {
                title: "Subtotal", key: "sub", width: 110, align: "right",
                render: (_, r: Requerimiento) => {
                  const p = preciosModal[r.id] ?? 0;
                  const c = cantidadesModal[r.id] ?? Number(r.cantidad ?? 0);
                  return (
                    <Text strong style={{ fontSize: 12, color: brand.navy }}>
                      {(p * c).toFixed(2)}
                    </Text>
                  );
                },
              },
              {
                // Fecha de entrega esperada por item — editable. Inicializada
                // con fecha_requerida del req. El botón "Aplicar a todos" del
                // header de la tabla pisa todas con la fecha de cabecera.
                title: "F. Entrega", key: "fent", width: 150, align: "center",
                render: (_, r: Requerimiento) => (
                  <DatePicker
                    size="small"
                    value={fechasItemsModal[r.id] ?? null}
                    onChange={(d) => setFechasItemsModal((prev) => ({ ...prev, [r.id]: d }))}
                    format="DD/MM/YYYY"
                    style={{ width: "100%" }}
                    placeholder="Seleccionar fecha"
                  />
                ),
              },
            ]}
          />

          {/* Items libres del editor — filas que el user agrega sin venir de
              un req. Se persisten como OTRepuesto con solo_para_oc=true. */}
          {itemsLibresModal.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <Text strong style={{ fontSize: 12 }}>Items libres (agregados en el editor)</Text>
              <Table<ItemLibreModal>
                size="small"
                rowKey="id"
                dataSource={itemsLibresModal}
                pagination={false}
                style={{ marginTop: 4 }}
                columns={[
                  {
                    title: "Código", key: "codigo", width: 120,
                    render: (_, r) => (
                      <Input
                        size="small"
                        value={r.codigo ?? ""}
                        onChange={(e) => setItemsLibresModal((prev) => prev.map((x) => x.id === r.id ? { ...x, codigo: e.target.value } : x))}
                        placeholder="(opcional)"
                      />
                    ),
                  },
                  {
                    title: "Descripción *", key: "descripcion",
                    render: (_, r) => (
                      <Input
                        size="small"
                        value={r.descripcion}
                        onChange={(e) => setItemsLibresModal((prev) => prev.map((x) => x.id === r.id ? { ...x, descripcion: e.target.value } : x))}
                        placeholder="Descripción del item"
                      />
                    ),
                  },
                  {
                    title: "UM", key: "um", width: 80,
                    render: (_, r) => (
                      <Input
                        size="small"
                        value={r.unidad_medida}
                        onChange={(e) => setItemsLibresModal((prev) => prev.map((x) => x.id === r.id ? { ...x, unidad_medida: e.target.value } : x))}
                      />
                    ),
                  },
                  {
                    title: "Cant.", key: "cant", width: 90, align: "right",
                    render: (_, r) => (
                      <InputNumber
                        size="small"
                        value={r.cantidad || null}
                        min={0.0001}
                        step={1}
                        precision={2}
                        style={{ width: "100%" }}
                        onChange={(v) => setItemsLibresModal((prev) => prev.map((x) => x.id === r.id ? { ...x, cantidad: v == null ? 0 : Number(v) } : x))}
                      />
                    ),
                  },
                  {
                    title: "Precio unit.", key: "precio", width: 110, align: "right",
                    render: (_, r) => (
                      <InputNumber
                        size="small"
                        value={r.precio_unitario || null}
                        min={0}
                        step={0.01}
                        precision={2}
                        style={{ width: "100%" }}
                        onChange={(v) => setItemsLibresModal((prev) => prev.map((x) => x.id === r.id ? { ...x, precio_unitario: v == null ? 0 : Number(v) } : x))}
                      />
                    ),
                  },
                  {
                    title: "Subtotal", key: "sub", width: 100, align: "right",
                    render: (_, r) => (
                      <Text strong style={{ fontSize: 12, color: brand.navy }}>
                        {((r.cantidad || 0) * (r.precio_unitario || 0)).toFixed(2)}
                      </Text>
                    ),
                  },
                  {
                    title: "F. Entrega", key: "fent", width: 140, align: "center",
                    render: (_, r) => (
                      <DatePicker
                        size="small"
                        value={r.fecha_entrega ?? null}
                        onChange={(d) => setItemsLibresModal((prev) => prev.map((x) => x.id === r.id ? { ...x, fecha_entrega: d } : x))}
                        format="DD/MM/YYYY"
                        style={{ width: "100%" }}
                      />
                    ),
                  },
                  {
                    title: "", key: "acc", width: 50, align: "center",
                    render: (_, r) => (
                      <Tooltip title="Eliminar fila">
                        <Button
                          size="small"
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => setItemsLibresModal((prev) => prev.filter((x) => x.id !== r.id))}
                        />
                      </Tooltip>
                    ),
                  },
                ]}
              />
            </div>
          )}

          {/* Acciones de tabla: agregar fila libre + importar desde otra OC */}
          <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 8, padding: "8px 0", borderTop: `1px dashed ${brand.border}` }}>
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              onClick={() => setItemsLibresModal((prev) => [...prev, {
                id: genIdLibre(),
                descripcion: "",
                unidad_medida: "UNIDAD",
                cantidad: 1,
                precio_unitario: 0,
                fecha_entrega: null,
              }])}
            >
              Agregar fila (item libre)
            </Button>
            <Button
              type="dashed"
              icon={<CopyOutlined />}
              onClick={async () => {
                setModalImportarOC(true);
                setOcImportarSel(null);
                setCargandoImportar(true);
                try {
                  const res = await fetch("/api/compras?limit=50");
                  const j = await res.json();
                  setOcsImportables((j.data ?? []).map((c: { id: number; numero_po: string; proveedor_nombre: string | null; nombre: string | null; fecha_solicitud: string; cantidad_items: number }) => ({
                    id: c.id, numero_po: c.numero_po, proveedor_nombre: c.proveedor_nombre,
                    nombre: c.nombre, fecha_solicitud: c.fecha_solicitud, n_items: c.cantidad_items,
                  })));
                } finally {
                  setCargandoImportar(false);
                }
              }}
            >
              Importar desde otra OC (usar como plantilla)
            </Button>
          </div>
        </div>

        <Form form={ocForm} layout="vertical">
          <Row gutter={16}>
            <Col xs={24} md={16}>
              <Form.Item
                label={
                  <Space size={4}>
                    <span>Ref. Pedido</span>
                    <Tooltip title="Texto que aparece en la cabecera del PDF de la OC. Ej: REQ-2026-001">
                      <InfoCircleOutlined style={{ color: brand.textSecondary, fontSize: 11 }} />
                    </Tooltip>
                  </Space>
                }
              >
                <Input
                  value={refPedidoModal}
                  onChange={(e) => setRefPedidoModal(e.target.value)}
                  placeholder="Ej: REQ-2026-001 (aparece en la cabecera del PDF)"
                  maxLength={300}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <div style={{ fontSize: 14, marginBottom: 8 }}>Aplicar IGV a esta OC</div>
              <Space>
                <Switch
                  checked={aplicaIgvModal}
                  onChange={setAplicaIgvModal}
                  checkedChildren="Con IGV"
                  unCheckedChildren="Sin IGV"
                />
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {aplicaIgvModal ? "Estándar: IGV 18% se suma al total" : "IGV no aplica (exonerado)"}
                </Text>
              </Space>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Proveedor"
                name="proveedor_id"
                rules={[{ required: true, message: "Selecciona un proveedor" }]}
              >
                <Select
                  placeholder="Seleccionar proveedor"
                  showSearch
                  optionFilterProp="label"
                  options={proveedores.map((p) => ({ value: p.id, label: p.razon_social }))}
                  onChange={async (provId) => {
                    // Al elegir proveedor: fetch a /api/proveedores/[id]/defaults-oc
                    // y pre-rellenar moneda, tipo_pago, dias_credito, fecha_entrega
                    // y observaciones. El user puede editar después.
                    if (!provId) return;
                    try {
                      const res = await fetch(`/api/proveedores/${provId}/defaults-oc`);
                      if (!res.ok) return;
                      const j = await res.json();
                      const d = j.defaults ?? {};
                      // Solo pisar si el campo está vacío — no destruir lo que
                      // el user ya editó manualmente.
                      const cur = ocForm.getFieldsValue();
                      const patch: Record<string, unknown> = {};
                      if (d.moneda && !cur.moneda) patch.moneda = d.moneda === "SOL" || d.moneda === "PEN" ? "PEN" : "USD";
                      if (d.tipo_pago && tipoPagoModal == null) setTipoPagoModal(d.tipo_pago);
                      if (d.dias_credito != null && diasCreditoModal == null) setDiasCreditoModal(d.dias_credito);
                      if (d.tiempo_entrega_dias != null && !cur.fecha_entrega_esperada) {
                        patch.fecha_entrega_esperada = dayjs().add(d.tiempo_entrega_dias, "day");
                      }
                      if (d.observaciones_sugeridas && !cur.observaciones) {
                        patch.observaciones = d.observaciones_sugeridas;
                      }
                      if (Object.keys(patch).length > 0) ocForm.setFieldsValue(patch);
                    } catch {
                      // silencioso — el form sigue funcionando sin defaults
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item label="Moneda" name="moneda">
                <Select showSearch optionFilterProp="label"
                  options={[
                    { value: "USD", label: "USD" },
                    { value: "PEN", label: "PEN" },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item label="Fecha entrega esperada" name="fecha_entrega_esperada">
                <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={12} md={6}>
              <div style={{ fontSize: 14, marginBottom: 8 }}>Tipo de pago</div>
              <Select
                value={tipoPagoModal ?? undefined}
                onChange={(v) => {
                  setTipoPagoModal(v);
                  if (v === "CONTADO") setDiasCreditoModal(0);
                }}
                placeholder="Elegí (opcional)"
                allowClear
                options={[
                  { value: "CONTADO", label: "Contado" },
                  { value: "CREDITO", label: "Crédito" },
                  { value: "CHEQUE_FECHADO", label: "Cheque fechado" },
                  { value: "TRANSFERENCIA", label: "Transferencia" },
                  { value: "ADELANTO", label: "Adelanto" },
                ]}
                style={{ width: "100%" }}
              />
            </Col>
            <Col xs={12} md={6}>
              <div style={{ fontSize: 14, marginBottom: 8 }}>Días de crédito</div>
              <Select
                value={diasCreditoModal ?? undefined}
                onChange={(v) => setDiasCreditoModal(v == null ? null : Number(v))}
                placeholder="—"
                allowClear
                disabled={tipoPagoModal !== "CREDITO" && tipoPagoModal !== "CHEQUE_FECHADO"}
                options={[15, 30, 45, 60, 90, 120].map((d) => ({ value: d, label: `${d} días` }))}
                style={{ width: "100%" }}
              />
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Observaciones" name="observaciones" style={{ marginBottom: 0 }}>
                <TextArea rows={2} placeholder="Notas adicionales..." />
              </Form.Item>
            </Col>
          </Row>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
            <Button onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button
              type="primary"
              icon={<DollarOutlined />}
              loading={creatingOC}
              onClick={generarOC}
            >
              Generar OC
            </Button>
          </div>
        </Form>
      </Modal>

      {/* ── Modal "Consumir de Almacén Abierto" (BC Bering, etc.) ───── */}
      <Modal
        title={
          <Space>
            <InboxOutlined style={{ color: brand.cyan }} />
            <span>Consumir de Almacén Abierto ({selectedRows.length} item{selectedRows.length !== 1 ? "s" : ""} seleccionado{selectedRows.length !== 1 ? "s" : ""})</span>
          </Space>
        }
        open={modalAbiertaOpen}
        onCancel={() => setModalAbiertaOpen(false)}
        width={modalWidth(screens, 900)}
        confirmLoading={consumiendoAbierta}
        okText={`Consumir ${matchReqsConOCAbierta(ocsAbiertas.find((o) => o.id === ocAbiertaSel)).filter((m) => m.detalle && m.cantidadAConsumir > 0 && !m.error).length} item(s)`}
        cancelText="Cancelar"
        okButtonProps={{
          disabled: !ocAbiertaSel
            || matchReqsConOCAbierta(ocsAbiertas.find((o) => o.id === ocAbiertaSel)).filter((m) => m.detalle && m.cantidadAConsumir > 0 && !m.error).length === 0,
        }}
        onOk={confirmarConsumirAbierta}
        destroyOnHidden
      >
        {loadingAbiertas ? (
          <div style={{ textAlign: "center", padding: 40 }}>
            <Spin tip="Cargando OCs abiertas..." />
          </div>
        ) : ocsAbiertas.length === 0 ? (
          <Empty
            description={
              <span>
                No hay OCs marcadas como <b>almacén abierto</b> con stock disponible.
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Importá un PDF (ej. BC Bering 4504281587) con el script para crear una.
                </Text>
              </span>
            }
          />
        ) : (
          <>
            <Form.Item label="OC Almacén Abierto" style={{ marginBottom: 12 }}>
              <Select
                value={ocAbiertaSel ?? undefined}
                onChange={(v) => setOcAbiertaSel(v ?? null)}
                placeholder="Elegí una OC"
                style={{ width: "100%" }}
                options={ocsAbiertas.map((oc) => ({
                  value: oc.id,
                  // Display: priorizamos `fuente_display` (que sale de
                  // compra.nombre — "BC BEARING — OC Abierta M260033") sobre
                  // el nombre del proveedor de la tabla. Decisión del user:
                  // la fuente real (BC Bearing) NO está en la tabla de
                  // proveedores; solo en la compra.
                  label: `${oc.numero_po} — ${oc.fuente_display} · ${oc.items.filter((i) => i.stock_disponible > 0).length}/${oc.items.length} items con stock`,
                }))}
              />
            </Form.Item>

            {ocAbiertaSel && (() => {
              const oc = ocsAbiertas.find((o) => o.id === ocAbiertaSel)!;
              const matches = matchReqsConOCAbierta(oc);
              const validos = matches.filter((m) => m.detalle && m.cantidadAConsumir > 0 && !m.error);
              const inválidos = matches.filter((m) => !m.detalle || m.error || m.cantidadAConsumir === 0);
              return (
                <>
                  <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 12 }}
                    title={`${validos.length} item(s) se pueden consumir · ${inválidos.length} no aplican`}
                    description={
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Stock disponible total en la OC: {oc.items.reduce((s, i) => s + i.stock_disponible, 0)} unidades. Los items inválidos abajo no se procesarán.
                      </Text>
                    }
                  />

                  <Table
                    size="small"
                    rowKey={(r) => r.req.id}
                    dataSource={matches}
                    pagination={false}
                    scroll={{ x: 700, y: 320 }}
                    columns={[
                      {
                        title: "Req", key: "req", width: 90,
                        render: (_v, m) => <Tag color={brand.navy}>{m.req.nro_req ?? `#${m.req.id}`}/{m.req.item_req ?? "-"}</Tag>,
                      },
                      {
                        title: "Material", key: "mat", width: 260,
                        render: (_v, m) => (
                          <div>
                            <div style={{ fontSize: 12 }}><b>{m.req.material_codigo ?? "(sin código)"}</b></div>
                            <div style={{ fontSize: 11, color: brand.textSecondary }}>{m.req.descripcion?.slice(0, 60)}</div>
                          </div>
                        ),
                      },
                      {
                        // NP del material en la OC abierta — es la referencia
                        // que usa logística para identificar qué item está
                        // saliendo del stock fijo.
                        title: "NP (OC abierta)", key: "np", width: 130,
                        render: (_v, m) => m.detalle?.np
                          ? <Tag style={{ margin: 0, fontFamily: "monospace" }}>{m.detalle.np}</Tag>
                          : <Text type="secondary" style={{ fontSize: 11 }}>—</Text>,
                      },
                      {
                        title: "Pedido", key: "ped", width: 70, align: "right",
                        render: (_v, m) => Number(m.req.cantidad),
                      },
                      {
                        title: "Stock OC", key: "stock", width: 80, align: "right",
                        render: (_v, m) => m.detalle ? m.detalle.stock_disponible : "—",
                      },
                      {
                        title: "A consumir", key: "consumir", width: 90, align: "right",
                        render: (_v, m) => m.error
                          ? <Text type="secondary">—</Text>
                          : <b style={{ color: brand.success ?? "#52c41a" }}>{m.cantidadAConsumir}</b>,
                      },
                      {
                        title: "Precio fijo OC", key: "precio", width: 110, align: "right",
                        render: (_v, m) => m.detalle ? `${oc.moneda} ${m.detalle.precio_unitario.toFixed(2)}` : "—",
                      },
                      {
                        title: "Estado", key: "estado", width: 200,
                        render: (_v, m) => m.error
                          ? <Tag color="orange" style={{ whiteSpace: "normal" }}>{m.error}</Tag>
                          : <Tag color="green">OK</Tag>,
                      },
                    ]}
                  />

                  <Form.Item label="Comentarios" style={{ marginTop: 12, marginBottom: 0 }}>
                    <Input.TextArea
                      rows={2}
                      placeholder="Ej. Salida de stock para mantenimiento del 10/06"
                      value={comentariosAbierta}
                      onChange={(e) => setComentariosAbierta(e.target.value)}
                      maxLength={500}
                    />
                  </Form.Item>
                </>
              );
            })()}
          </>
        )}
      </Modal>

      {/* Modal Dividir Cantidad */}
      <Modal
        title={
          <Space>
            <ScissorOutlined style={{ color: brand.cyan }} />
            Dividir Cantidad — {modalDividir?.material_codigo || "Item"}
          </Space>
        }
        open={!!modalDividir}
        onCancel={cerrarModalDividir}
        width={modalWidth(screens, 600)}
        footer={null}
      >
        {modalDividir && (
          <div>
            <Card size="small" style={{ background: brand.bgPage, marginBottom: 12 }}>
              <Row gutter={[16, 8]}>
                <Col xs={24} sm={12}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Descripción</Text>
                  <div style={{ fontWeight: 600 }}>{modalDividir.material_nombre || modalDividir.descripcion}</div>
                </Col>
                <Col xs={12} sm={6}>
                  <Statistic title="Cantidad Original" value={Number(modalDividir.cantidad)} />
                </Col>
                <Col xs={12} sm={6}>
                  <Statistic
                    title="Suma Actual"
                    value={partesDividir.reduce((s, p) => s + Number(p || 0), 0)}
                    styles={{
                      content: {
                        color: partesDividir.reduce((s, p) => s + Number(p || 0), 0) === Number(modalDividir.cantidad)
                          ? "#52c41a"
                          : "#faad14",
                      },
                    }}
                  />
                </Col>
              </Row>
            </Card>

            <Text strong>Partes (suma debe igualar la cantidad original):</Text>
            <div style={{ marginTop: 8, marginBottom: 12 }}>
              <Space wrap>
                {partesDividir.map((p, i) => (
                  <Space key={i} size={4}>
                    <InputNumber
                      min={1}
                      max={Number(modalDividir.cantidad)}
                      value={p}
                      onChange={(val) => {
                        const nuevas = [...partesDividir];
                        nuevas[i] = Number(val) || 1;
                        setPartesDividir(nuevas);
                      }}
                      style={{ width: 80 }}
                    />
                    {partesDividir.length > 2 && (
                      <Button
                        icon={<MinusOutlined />}
                        size="small"
                        onClick={() => setPartesDividir(partesDividir.filter((_, idx) => idx !== i))}
                      />
                    )}
                  </Space>
                ))}
                <Button
                  icon={<PlusOutlined />}
                  size="small"
                  onClick={() => setPartesDividir([...partesDividir, 1])}
                  disabled={partesDividir.length >= Number(modalDividir.cantidad)}
                >
                  Agregar parte
                </Button>
              </Space>
            </div>

            <Divider style={{ margin: "12px 0" }} />

            <Text strong>Sugerencias rápidas:</Text>
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {sugerenciaDividir(Number(modalDividir.cantidad)).map((sug, idx) => (
                <Button key={idx} size="small" onClick={() => setPartesDividir(sug)}>
                  {sug.join(" + ")}
                </Button>
              ))}
            </div>

            <Card size="small" style={{ marginTop: 16, background: "#fffbe6", border: "1px solid #ffe58f" }}>
              <Text style={{ fontSize: 12 }}>
                <InfoCircleOutlined /> Después de dividir, cada parte quedará como un requerimiento independiente
                y podrás asignarlas a diferentes proveedores o seleccionarlas por separado al crear OCs.
              </Text>
            </Card>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <Button onClick={cerrarModalDividir}>Cancelar</Button>
              <Button
                type="primary"
                icon={<ScissorOutlined />}
                loading={dividiendo}
                onClick={ejecutarDividir}
              >
                Dividir en {partesDividir.length} partes
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal Importar desde otra OC (sub-modal del Crear OC) ──────── */}
      <Modal
        title={
          <Space>
            <CopyOutlined style={{ color: brand.cyan }} />
            Importar items desde otra OC
          </Space>
        }
        open={modalImportarOC}
        onCancel={() => setModalImportarOC(false)}
        okText="Importar"
        cancelText="Cancelar"
        okButtonProps={{ disabled: ocImportarSel == null }}
        confirmLoading={cargandoImportar}
        onOk={async () => {
          if (ocImportarSel == null) return;
          setCargandoImportar(true);
          try {
            const res = await fetch(`/api/compras/${ocImportarSel}`);
            const j = await res.json();
            const items = j.data?.detalles ?? [];
            // Cada CompraDetalle (catalogado) o repuesto se convierte en item libre.
            const nuevos: ItemLibreModal[] = items.map((det: { material?: { codigo?: string; descripcion?: string } | null; cantidad: number | string; precio_unitario: number | string }) => ({
              id: genIdLibre(),
              codigo: det.material?.codigo ?? "",
              descripcion: det.material?.descripcion ?? "",
              unidad_medida: "UNIDAD",
              cantidad: Number(det.cantidad ?? 0),
              precio_unitario: Number(det.precio_unitario ?? 0),
              fecha_entrega: null,
            }));
            if (nuevos.length === 0) {
              message.warning("Esa OC no tiene items para importar");
              return;
            }
            setItemsLibresModal((prev) => [...prev, ...nuevos]);
            message.success(`${nuevos.length} item(s) importados como filas libres. Podés editarlos antes de generar la OC.`);
            setModalImportarOC(false);
          } catch (e) {
            message.error(e instanceof Error ? e.message : "Error al importar");
          } finally {
            setCargandoImportar(false);
          }
        }}
        width={modalWidth(screens, 640)}
        destroyOnHidden
      >
        <Text type="secondary" style={{ fontSize: 12 }}>
          Selecciona una OC de plantilla. Sus items se copiarán como filas
          libres editables. No se vinculan a ningún req — son nuevos items
          de esta OC.
        </Text>
        <div style={{ marginTop: 12 }}>
          <Select
            showSearch
            placeholder="Buscar OC por número, proveedor o nombre…"
            optionFilterProp="label"
            value={ocImportarSel ?? undefined}
            onChange={setOcImportarSel}
            loading={cargandoImportar}
            style={{ width: "100%" }}
            options={ocsImportables.map((o) => ({
              value: o.id,
              label: `${o.numero_po}${o.proveedor_nombre ? " · " + o.proveedor_nombre : ""}${o.nombre ? " — " + o.nombre : ""} (${o.n_items} items)`,
            }))}
          />
        </div>
      </Modal>

      {/* ── Modal Consumir de Almacén ─────────────────────────────────── */}
      {/* Modal "Vincular material" — para reqs sin material_id (creados como CAD
          o sin vincular). Permite asociarlos a un Material del catálogo. */}
      <Modal
        title={
          <Space>
            <LinkOutlined style={{ color: brand.cyan }} />
            Vincular material — {modalVincular?.nro_req ?? `#${modalVincular?.id ?? ""}`}/{modalVincular?.item_req ?? ""}
          </Space>
        }
        open={!!modalVincular}
        onCancel={() => setModalVincular(null)}
        onOk={confirmarVincular}
        confirmLoading={vinculando}
        okText="Vincular"
        okButtonProps={{ disabled: materialIdAVincular == null }}
        cancelText="Cancelar"
        width={modalWidth(screens, 620)}
        destroyOnHidden
      >
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Descripción actual del req: <b>{modalVincular?.descripcion ?? "—"}</b>
          </Text>
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>Material del catálogo</div>
          <Select
            showSearch
            placeholder="Buscar por código, descripción o N/P..."
            optionFilterProp="label"
            value={materialIdAVincular ?? undefined}
            onChange={(v) => setMaterialIdAVincular(v)}
            options={materialesVincular.map((m) => ({
              value: m.material_id,
              label: `${m.codigo} — ${m.descripcion}${m.np ? ` · NP ${m.np}` : ""}`,
            }))}
            style={{ width: "100%" }}
            virtual
          />
        </div>
        <Text type="secondary" style={{ fontSize: 11 }}>
          Al vincular: el tipo del req cambia a <b>MAC</b>, se asigna el material
          y se hereda unidad/fabricante. Si el req no tenía precio, se copia el
          del catálogo.
        </Text>
      </Modal>

      <Modal
        title={
          <Space>
            <InboxOutlined style={{ color: brand.cyan }} />
            Consumir de Almacén — {modalConsumir?.material_codigo || "Item"}
          </Space>
        }
        open={!!modalConsumir}
        onCancel={() => setModalConsumir(null)}
        onOk={confirmarConsumirDeAlmacen}
        confirmLoading={consumiendo}
        okText="Consumir"
        okButtonProps={{ disabled: consumirZonaId == null }}
        cancelText="Cancelar"
        width={modalWidth(screens, 560)}
        destroyOnHidden
      >
        {modalConsumir && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, color: brand.textSecondary }}>
              <div>
                <b>{modalConsumir.material_codigo}</b> · {modalConsumir.material_nombre ?? modalConsumir.descripcion ?? ""}
              </div>
              <div style={{ marginTop: 4 }}>
                Pedido: <b>{modalConsumir.cantidad} {modalConsumir.unidad_medida ?? ""}</b>
                {modalConsumir.numero_ot && (
                  <> · OT: <Tag color={brand.navy}>{modalConsumir.numero_ot}</Tag></>
                )}
              </div>
            </div>

            <Row gutter={12}>
              <Col span={12}>
                <Text strong style={{ display: "block", marginBottom: 4 }}>
                  Zona del almacén <Text type="danger">*</Text>
                </Text>
                <Select
                  value={consumirZonaId ?? undefined}
                  onChange={(v) => { setConsumirZonaId(v); setConsumirPosicionId(null); }}
                  placeholder="Elegir zona"
                  style={{ width: "100%" }}
                  options={zonas.map((z) => ({ value: z.id, label: `${z.codigo} — ${z.nombre}` }))}
                />
              </Col>
              <Col span={12}>
                <Text strong style={{ display: "block", marginBottom: 4 }}>
                  Posición                </Text>
                <Select
                  value={consumirPosicionId ?? undefined}
                  onChange={(v) => setConsumirPosicionId(v ?? null)}
                  placeholder={consumirZonaId == null ? "Elegí zona primero" : "Ej. A1"}
                  disabled={consumirZonaId == null}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  style={{ width: "100%" }}
                  options={posicionesDeZona.map((p) => ({
                    value: p.id,
                    label: p.nombre ? `${p.codigo} — ${p.nombre}` : p.codigo,
                  }))}
                />
              </Col>
            </Row>

            <Row gutter={12}>
              <Col span={12}>
                <Text strong style={{ display: "block", marginBottom: 4 }}>
                  Cantidad a consumir
                </Text>
                <InputNumber
                  style={{ width: "100%" }}
                  min={0.01}
                  max={modalConsumir.cantidad}
                  value={consumirCantidad ?? undefined}
                  onChange={(v) => setConsumirCantidad(typeof v === "number" ? v : null)}
                  placeholder={String(modalConsumir.cantidad)}
                />
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Si dejás vacío usa la cantidad pedida ({modalConsumir.cantidad}).
                </Text>
              </Col>
              <Col span={12}>
                <Text strong style={{ display: "block", marginBottom: 4 }}>
                  Observación                </Text>
                <Input
                  value={consumirObs}
                  onChange={(e) => setConsumirObs(e.target.value)}
                  placeholder="Ej. entregado a técnico Juan"
                  maxLength={300}
                />
              </Col>
            </Row>

            <Alert
              type="info"
              showIcon
              title="El requerimiento pasará a estado CONSUMIDO_ALMACEN y ya no podrá volver a sacarse de stock."
            />
          </div>
        )}
      </Modal>

      {/* ── Modal Caja Chica ── */}
      <Modal
        title={
          <Space>
            <DollarOutlined style={{ color: brand.success }} />
            <span>Pagar con Caja Chica — {modalCajaChica?.material_codigo || modalCajaChica?.descripcion?.slice(0, 30) || "Item"}</span>
          </Space>
        }
        open={!!modalCajaChica}
        onCancel={() => setModalCajaChica(null)}
        onOk={confirmarCajaChica}
        confirmLoading={pagandoCaja}
        okText="Marcar como pagado"
        // Botón deshabilitado mientras el monto no sea válido. La validación
        // dura está en confirmarCajaChica + backend (defensa en profundidad).
        okButtonProps={{ type: "primary", disabled: cajaMonto == null || !(cajaMonto > 0) }}
        cancelText="Cancelar"
        destroyOnHidden
        width={520}
      >
        {modalCajaChica && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: "#fafafa", padding: 10, borderRadius: 4, fontSize: 12 }}>
              <div>
                <b>{modalCajaChica.material_codigo ?? "—"}</b> · {modalCajaChica.material_nombre ?? modalCajaChica.descripcion ?? ""}
              </div>
              <div style={{ color: brand.textSecondary, marginTop: 4 }}>
                Cantidad: <b>{modalCajaChica.cantidad} {modalCajaChica.unidad_medida ?? ""}</b>
                {modalCajaChica.numero_ot && (
                  <> · OT: <Tag color={brand.navy}>{modalCajaChica.numero_ot}</Tag></>
                )}
              </div>
            </div>

            <Row gutter={8}>
              <Col span={14}>
                <div style={{ fontSize: 12, color: brand.textSecondary, marginBottom: 2 }}>
                  Monto unitario pagado <span style={{ color: "#cf1322" }}>*</span>
                </div>
                <InputNumber
                  value={cajaMonto}
                  onChange={(v) => setCajaMonto(v == null ? null : Number(v))}
                  min={0.01}
                  step={0.01}
                  precision={2}
                  style={{ width: "100%" }}
                  placeholder="0.00"
                  status={cajaMonto == null || !(cajaMonto > 0) ? "error" : undefined}
                />
              </Col>
              <Col span={10}>
                <div style={{ fontSize: 12, color: brand.textSecondary, marginBottom: 2 }}>Moneda</div>
                <Select
                  value={cajaMoneda}
                  onChange={setCajaMoneda}
                  style={{ width: "100%" }}
                  options={[
                    { value: "PEN", label: "PEN (S/)" },
                    { value: "USD", label: "USD (US$)" },
                  ]}
                />
              </Col>
            </Row>

            <div>
              <div style={{ fontSize: 12, color: brand.textSecondary, marginBottom: 2 }}>Proveedor (opcional)</div>
              <Input
                value={cajaProveedor}
                onChange={(e) => setCajaProveedor(e.target.value)}
                placeholder="Ej. Ferretería La Esquina"
                maxLength={200}
              />
            </div>

            <div>
              <div style={{ fontSize: 12, color: brand.textSecondary, marginBottom: 2 }}>N° comprobante / boleta (opcional)</div>
              <Input
                value={cajaComprobante}
                onChange={(e) => setCajaComprobante(e.target.value)}
                placeholder="Ej. B001-12345"
                maxLength={100}
              />
            </div>

            <div>
              <div style={{ fontSize: 12, color: brand.textSecondary, marginBottom: 2 }}>Observación (opcional)</div>
              <Input.TextArea
                value={cajaObs}
                onChange={(e) => setCajaObs(e.target.value)}
                rows={2}
                maxLength={500}
                showCount
              />
            </div>

            <Alert
              type="success"
              showIcon
              title="Se marcará como ENTREGADO inmediatamente. No pasa por OC ni por despacho — el técnico ya recibió el material."
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
