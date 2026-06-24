"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Typography,
  Table,
  Button,
  Input,
  Tag,
  Row,
  Col,
  Card,
  Space,
  Tooltip,
  App,
  Statistic,
  Popconfirm,
  Segmented,
  Tabs,
  Badge,
} from "antd";
import RequerimientosAprobadosTab from "@/components/modules/compras/RequerimientosAprobadosTab";
import {
  SearchOutlined,
  ReloadOutlined,
  EyeOutlined,
  EditOutlined,
  DeleteOutlined,
  UnorderedListOutlined,
  ShoppingCartOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  HourglassOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  FilePdfOutlined,
  MessageOutlined,
  CheckOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import {
  numeracionColumn,
  paginacionEstandar,
  PAGINATION_PAGE_SIZE,
  useColumnasOcultas,
  ColumnasToggleButton,
  visibleColumns,
  filtroPorColumna,
  RangoFechasFiltro,
  dentroDeRango,
  useColumnasRedimensionables,
  usePersistedState,
  useRangoFechasPersistente,
} from "@/lib/tables";
import { Popover, Divider } from "antd";
import { brand } from "@/lib/theme";
import dayjs from "dayjs";
import CompraDetalleModal from "@/components/modules/compras/CompraDetalleModal";
import { ExportarExcelButton } from "@/components/ExportarExcelButton";

import { formatDateOnly, formatDateOnlyShort } from "@/lib/dates";
const { Title, Text } = Typography;

interface Compra {
  id: number;
  numero_po: string;
  nombre: string | null;
  numero_req: string | null;
  ot_id: number | null;
  ot_numero: string | null;
  proveedor_id: number;
  proveedor_nombre: string | null;
  almacen_nombre: string | null;
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
  observaciones: string | null;
  cantidad_items: number;
  usuario_solicita: string;
  fecha_oc_creacion: string | null;
  fecha_req_creacion: string | null;
}

const estadoColor: Record<string, string> = {
  Pendiente: "gold",
  Aprobado: "blue",
  "En Proceso": "cyan",
  Recibido: "green",
  Cancelado: "red",
};

export default function ComprasPage() {
  const router = useRouter();
  const { message, modal } = App.useApp();

  const [data, setData] = useState<Compra[]>([]);
  const [loading, setLoading] = useState(false);
  // Filtros persistidos por usuario.
  const [search, setSearch] = usePersistedState<string>("compras-list-search", "");
  const [estado, setEstado] = usePersistedState<string>("compras-list-estado", "");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGINATION_PAGE_SIZE);

  const [modalId, setModalId] = useState<number | null>(null);
  const { ocultas, setOcultas } = useColumnasOcultas("compras-list-cols-v2", [
    "numero_req", "ot_numero", "fecha_entrega_real", "impuesto", "moneda",
  ]);
  const { rango: rangoSolicitud, setRango: setRangoSolicitud } = useRangoFechasPersistente("compras-list-rango-solicitud");
  const { rango: rangoEntrega, setRango: setRangoEntrega } = useRangoFechasPersistente("compras-list-rango-entrega");
  // Filas después de TODOS los filtros (búsqueda + rangos de fecha + filtros de
  // columna). La setea el Table.onChange. Si está null, el export cae a
  // `data` filtrada solo por los rangos de fecha (sin filtros de columna).
  const [vistaActual, setVistaActual] = useState<Compra[] | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (estado) params.set("estado", estado);
      const res = await fetch(`/api/compras?${params}`);
      const json = await res.json();
      setData(json.data ?? []);
    } catch {
      message.error("Error al cargar compras");
    } finally {
      setLoading(false);
    }
  }, [search, estado, message]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function handleDelete(id: number) {
    // Pre-check del estado de la OC. El endpoint DELETE solo permite borrar
    // OCs en estado Pendiente (PEND_OC). Si está aceptada / en proceso /
    // recibida, hay que usar "Anular" desde /aprobaciones (que marca
    // status_oc = ANULADO sin perder la traza). Antes el user clickeaba
    // Eliminar, recibía un error breve y no sabía qué hacer.
    const compra = data.find((c) => c.id === id);
    if (compra && compra.estado !== "Pendiente") {
      modal.error({
        title: "Esta OC no se puede eliminar",
        content: (
          <div style={{ marginTop: 8 }}>
            <Text>
              La OC <b>{compra.numero_po}</b> está en estado <b>{compra.estado}</b>.
            </Text>
            <Text style={{ display: "block", marginTop: 8 }}>
              Solo las OCs en estado <b>Pendiente</b> se pueden eliminar (porque aún no se
              recibieron ni se procesaron). Para esta OC corresponde
              <b> Anular</b>, que la marca como cancelada sin perder la traza
              en el historial.
            </Text>
            <Text type="secondary" style={{ display: "block", marginTop: 8, fontSize: 12 }}>
              Andá a <b>Aprobaciones</b> y usá el botón <b>Rechazar</b> en la OC,
              o entrá al detalle de la OC y elegí <b>Anular</b>.
            </Text>
          </div>
        ),
        okText: "Entendido",
        width: 480,
      });
      return;
    }

    let motivo = "";
    modal.confirm({
      title: "Eliminar compra",
      content: (
        <div style={{ marginTop: 8 }}>
          <Text style={{ fontSize: 12 }}>Motivo</Text>
          <Input.TextArea
            rows={3}
            maxLength={500}
            showCount
            placeholder="Ej. cancelación del cliente, error de proveedor"
            onChange={(e) => { motivo = e.target.value; }}
            style={{ marginTop: 8 }}
          />
        </div>
      ),
      okText: "Eliminar",
      okButtonProps: { danger: true },
      cancelText: "Cancelar",
      width: 460,
      onOk: async () => {
        const txt = motivo.trim();
        try {
          const res = await fetch(`/api/compras/${id}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ motivo: txt || null }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "Error al eliminar");
          message.success("Compra eliminada");
          fetchData();
        } catch (err: unknown) {
          message.error(err instanceof Error ? err.message : "Error");
          throw err;
        }
      },
    });
  }

  function handleAceptar(id: number) {
    // Tres campos opcionales (mismo patrón que /aprobaciones):
    //   descripcion → resumen corto (etiqueta en listados, ≤300)
    //   detalle     → texto largo (motivo, contexto)
    //   comentario  → nota libre (≤500)
    let descripcion = "";
    let detalle = "";
    let comentario = "";
    modal.confirm({
      title: "Aceptar OC",
      content: (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <Text style={{ fontSize: 12 }}>
              Descripción <Text type="secondary" style={{ fontWeight: 400 }}>(opcional, ≤300)</Text>
            </Text>
            <Input
              maxLength={300}
              placeholder="Resumen breve de la decisión"
              onChange={(e) => { descripcion = e.target.value; }}
              style={{ marginTop: 4 }}
            />
          </div>
          <div>
            <Text style={{ fontSize: 12 }}>
              Detalle            </Text>
            <Input.TextArea
              rows={3}
              placeholder="Motivo, contexto, instrucciones…"
              onChange={(e) => { detalle = e.target.value; }}
              style={{ marginTop: 4 }}
            />
          </div>
          <div>
            <Text style={{ fontSize: 12 }}>
              Comentario            </Text>
            <Input.TextArea
              rows={2}
              maxLength={500}
              showCount
              placeholder="Ej. aprobada después de revisar precios"
              onChange={(e) => { comentario = e.target.value; }}
              style={{ marginTop: 4 }}
            />
          </div>
        </div>
      ),
      okText: "Aceptar OC",
      cancelText: "Cancelar",
      width: 520,
      onOk: async () => {
        try {
          const res = await fetch(`/api/compras/${id}/aceptar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              comentario: comentario.trim() || null,
              descripcion: descripcion.trim() || null,
              detalle: detalle.trim() || null,
            }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "Error al aceptar OC");
          message.success("OC aceptada");
          fetchData();
        } catch (err: unknown) {
          message.error(err instanceof Error ? err.message : "Error");
          throw err;
        }
      },
    });
  }

  // KPIs
  const pendientes = data.filter((c) => c.estado === "Pendiente").length;
  const enProceso = data.filter((c) => c.estado === "En Proceso" || c.estado === "Aprobado").length;
  // "Faltan por llegar": cualquier OC que NO esté recibida ni anulada (es decir,
  // toda OC con material en camino o esperando aprobación). Cubre Pendiente,
  // En Proceso, Aprobado, Incompleto.
  const ESTADOS_LLEGADOS = new Set(["Recibido", "Completo", "Anulado"]);
  const faltanLlegar = data.filter((c) => !ESTADOS_LLEGADOS.has(c.estado)).length;
  // "Próximos a llegar": OC no recibida con fecha de entrega esperada dentro
  // de los próximos 7 días (incluye hoy). Para que aparezca, la fecha debe
  // existir y no estar vencida.
  const hoy = dayjs().startOf("day");
  const limiteProximo = hoy.add(7, "day").endOf("day");
  const proximosLlegar = data.filter((c) => {
    if (ESTADOS_LLEGADOS.has(c.estado)) return false;
    if (!c.fecha_entrega_esperada) return false;
    const f = dayjs(c.fecha_entrega_esperada);
    if (!f.isValid()) return false;
    return !f.isBefore(hoy) && !f.isAfter(limiteProximo);
  }).length;
  // "Vencidos": OC no recibida cuya fecha de entrega esperada ya pasó (anterior
  // a hoy). Estos son los que generan alerta — el proveedor se demoró.
  const vencidos = data.filter((c) => {
    if (ESTADOS_LLEGADOS.has(c.estado)) return false;
    if (!c.fecha_entrega_esperada) return false;
    const f = dayjs(c.fecha_entrega_esperada);
    if (!f.isValid()) return false;
    return f.isBefore(hoy);
  }).length;
  // Suma del valor total sin IGV (= subtotal). El usuario pidió ver montos
  // sin IGV en este listado.
  const totalValor = data.reduce((s, c) => s + Number(c.subtotal || 0), 0);

  // Filas que efectivamente se muestran en la tabla (rangos aplicados).
  // El Table.onChange aplica encima los filtros de columna y lo persistimos
  // en `vistaActual` para que el export respete esos filtros también.
  const filasMostradas = useMemo(
    () => data.filter((r) =>
      dentroDeRango(r, "fecha_solicitud", rangoSolicitud) &&
      dentroDeRango(r, "fecha_entrega_esperada", rangoEntrega)),
    [data, rangoSolicitud, rangoEntrega],
  );

  // Reset cuando cambian datos o rangos: el Table reaplica filtros sobre el
  // nuevo dataset y vuelve a avisarnos vía onChange.
  useEffect(() => { setVistaActual(null); }, [filasMostradas]);

  // Valores unicos para filtros
  const valoresUnicos = (campo: keyof Compra) => {
    const set = new Set<string>();
    data.forEach((r) => {
      const v = r[campo];
      if (v !== null && v !== undefined && v !== "") set.add(String(v));
    });
    return [...set].sort().map((v) => ({ text: v, value: v }));
  };

  const popoverContent = (r: Compra) => (
    <div style={{ maxWidth: 340, fontSize: 12 }}>
      <div style={{ fontWeight: 600, color: brand.navy, marginBottom: 6 }}>OC: {r.numero_po}</div>
      <Row gutter={[8, 4]}>
        <Col span={12}><span style={{ color: "#888" }}>Proveedor:</span> <b>{r.proveedor_nombre || "-"}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>Almacén:</span> <b>{r.almacen_nombre || "-"}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>Items:</span> <b>{r.cantidad_items}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>Moneda:</span> <b>{r.moneda}</b></Col>
        <Col span={24}><span style={{ color: "#888" }}>F. Solicitud:</span> <b>{formatDateOnly(r.fecha_solicitud)}</b></Col>
        <Col span={24}><span style={{ color: "#888" }}>F. Entrega Esp:</span> <b>{r.fecha_entrega_esperada ? formatDateOnly(r.fecha_entrega_esperada) : "-"}</b></Col>
        <Col span={24}><span style={{ color: "#888" }}>F. Entrega Real:</span> <b>{r.fecha_entrega_real ? formatDateOnly(r.fecha_entrega_real) : "-"}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>Subtotal:</span> <b>{Number(r.subtotal).toFixed(2)}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>IGV:</span> <b>{Number(r.impuesto).toFixed(2)}</b></Col>
        <Col span={24}><span style={{ color: "#888" }}>Total:</span> <b style={{ color: brand.navy }}>{r.moneda} {Number(r.total).toFixed(2)}</b></Col>
        {r.nro_factura && <Col span={24}><span style={{ color: "#888" }}>Factura:</span> <b>{r.nro_factura}</b></Col>}
        {r.usuario_solicita && <Col span={24}><span style={{ color: "#888" }}>Usuario:</span> <b>{r.usuario_solicita}</b></Col>}
      </Row>
      <Divider style={{ margin: "8px 0" }} />
      <Tag color={estadoColor[r.estado] || "default"}>{r.estado}</Tag>
      {r.observaciones && <div style={{ marginTop: 6, fontSize: 11, fontStyle: "italic" }}>{r.observaciones}</div>}
    </div>
  );

  const columns: ColumnsType<Compra> = [
    numeracionColumn<Compra>({ current: page, pageSize }),
    {
      key: "numero_po",
      title: "Nro OC",
      dataIndex: "numero_po",
      width: 130,
      filters: valoresUnicos("numero_po"),
      filterSearch: true,
      onFilter: (value, r) => r.numero_po === value,
      sorter: (a, b) => a.numero_po.localeCompare(b.numero_po),
      render: (v, r) => (
        <Popover content={popoverContent(r)} placement="right" mouseEnterDelay={0.3} trigger="hover">
          <div style={{ cursor: "help", display: "flex", alignItems: "center", gap: 4 }}>
            <InfoCircleOutlined style={{ color: brand.cyan, fontSize: 11 }} />
            <Tag color={brand.navy}>{v}</Tag>
          </div>
        </Popover>
      ),
    },
    {
      key: "nombre",
      title: "Nombre OC",
      dataIndex: "nombre",
      width: 240,
      sorter: (a, b) => (a.nombre || "").localeCompare(b.nombre || ""),
      render: (v: string | null) => v ? (
        <span style={{ fontSize: 12, color: "#1C2B5B" }}>{v}</span>
      ) : (
        <span style={{ fontSize: 11, color: "#bbb", fontStyle: "italic" }}>—</span>
      ),
    },
    {
      key: "estado",
      title: "Estado",
      dataIndex: "estado",
      width: 110,
      filters: [
        { text: "Pendiente", value: "Pendiente" },
        { text: "Aprobado", value: "Aprobado" },
        { text: "En Proceso", value: "En Proceso" },
        { text: "Recibido", value: "Recibido" },
        { text: "Cancelado", value: "Cancelado" },
      ],
      onFilter: (value, r) => r.estado === value,
      render: (v: string) => <Tag color={estadoColor[v] || "default"}>{v}</Tag>,
    },
    {
      key: "proveedor_nombre",
      title: "Proveedor",
      dataIndex: "proveedor_nombre",
      width: 200,
      ellipsis: true,
      filters: valoresUnicos("proveedor_nombre"),
      filterSearch: true,
      onFilter: (value, r) => r.proveedor_nombre === value,
      sorter: (a, b) => (a.proveedor_nombre ?? "").localeCompare(b.proveedor_nombre ?? ""),
    },
    {
      key: "almacen_nombre",
      title: "Almacén",
      dataIndex: "almacen_nombre",
      width: 140,
      ellipsis: true,
      filters: valoresUnicos("almacen_nombre"),
      filterSearch: true,
      onFilter: (value, r) => r.almacen_nombre === value,
    },
    {
      key: "fecha_solicitud",
      title: "F. Solicitud",
      dataIndex: "fecha_solicitud",
      width: 110,
      render: (v: string) => formatDateOnly(v),
      sorter: (a, b) => (a.fecha_solicitud ?? "").localeCompare(b.fecha_solicitud ?? ""),
    },
    {
      key: "fecha_req_creacion",
      title: "Creación REQ",
      dataIndex: "fecha_req_creacion",
      width: 120,
      align: "center",
      sorter: (a, b) => (a.fecha_req_creacion ?? "").localeCompare(b.fecha_req_creacion ?? ""),
      render: (v: string | null) => v ? dayjs(v).format("DD/MM/YY") : <span style={{ color: "#bbb" }}>—</span>,
    },
    {
      key: "fecha_oc_creacion",
      title: "Creación OC",
      dataIndex: "fecha_oc_creacion",
      width: 130,
      align: "center",
      sorter: (a, b) => (a.fecha_oc_creacion ?? "").localeCompare(b.fecha_oc_creacion ?? ""),
      render: (v: string | null) => v ? dayjs(v).format("DD/MM/YY HH:mm") : <span style={{ color: "#bbb" }}>—</span>,
    },
    {
      key: "fecha_entrega_esperada",
      title: "F. Entrega Esp.",
      dataIndex: "fecha_entrega_esperada",
      width: 120,
      sorter: (a, b) => (a.fecha_entrega_esperada ?? "").localeCompare(b.fecha_entrega_esperada ?? ""),
      filters: [...new Set(data.map((r) => r.fecha_entrega_esperada).filter(Boolean) as string[])]
        .sort().map((v) => ({ text: formatDateOnly(v), value: v })),
      filterSearch: true,
      onFilter: (value, r) => r.fecha_entrega_esperada === value,
      render: (v: string | null) => (v ? formatDateOnly(v) : "-"),
    },
    {
      key: "cantidad_items",
      title: "Items",
      dataIndex: "cantidad_items",
      width: 70,
      align: "center",
      sorter: (a, b) => a.cantidad_items - b.cantidad_items,
      filters: [...new Set(data.map((r) => r.cantidad_items))].sort((a, b) => a - b)
        .map((v) => ({ text: String(v), value: String(v) })),
      filterSearch: true,
      onFilter: (value, r) => String(r.cantidad_items) === value,
    },
    {
      // "PU (sin igv)" = precio unitario promedio sin IGV = subtotal / cantidad_items.
      // Para OCs de un único item equivale al precio unitario exacto; para OCs
      // multi-item es el promedio. Útil como referencia.
      key: "pu_sin_igv",
      title: "PU (sin IGV)",
      width: 110,
      align: "right",
      sorter: (a, b) => {
        const puA = a.cantidad_items > 0 ? Number(a.subtotal) / a.cantidad_items : 0;
        const puB = b.cantidad_items > 0 ? Number(b.subtotal) / b.cantidad_items : 0;
        return puA - puB;
      },
      render: (_: unknown, r: Compra) => {
        const pu = r.cantidad_items > 0 ? Number(r.subtotal) / r.cantidad_items : 0;
        return pu.toFixed(2);
      },
    },
    {
      // "Total (sin IGV) = PU × CANT" — es el subtotal del modelo (sin IGV).
      // Antes acá se mostraba `total` que SÍ incluye IGV; el usuario pidió ver
      // el total sin IGV en este listado.
      key: "total_sin_igv",
      title: "Total (sin IGV)",
      dataIndex: "subtotal",
      width: 130,
      align: "right",
      render: (v: number, r: Compra) => (
        <span style={{ fontWeight: 600, color: brand.navy }}>
          {r.moneda} {Number(v).toFixed(2)}
        </span>
      ),
      sorter: (a, b) => Number(a.subtotal) - Number(b.subtotal),
    },
    {
      key: "nro_guia",
      title: "Guía",
      dataIndex: "nro_guia",
      width: 110,
      ...filtroPorColumna(data, "nro_guia"),
      render: (v: string | null) =>
        v ? <Tag color="cyan">{v}</Tag> : <span style={{ color: "#bbb" }}>—</span>,
    },
    {
      key: "nro_factura",
      title: "Factura",
      dataIndex: "nro_factura",
      width: 130,
      ...filtroPorColumna(data, "nro_factura"),
      render: (v: string | null) =>
        v ? <Tag color="purple">{v}</Tag> : <span style={{ color: "#bbb" }}>—</span>,
    },
    {
      key: "observaciones",
      title: "Comentarios",
      dataIndex: "observaciones",
      width: 220,
      ellipsis: true,
      render: (v: string | null) =>
        v ? (
          <Tooltip title={v}>
            <Space size={4}>
              <MessageOutlined style={{ color: brand.cyan }} />
              <span style={{ fontSize: 12 }}>{v}</span>
            </Space>
          </Tooltip>
        ) : (
          <span style={{ color: "#bbb" }}>—</span>
        ),
    },
    {
      key: "usuario_solicita",
      title: "Usuario",
      dataIndex: "usuario_solicita",
      width: 120,
      ...filtroPorColumna(data, "usuario_solicita"),
    },
    // ── Columnas opcionales (ocultas por default) ──
    {
      key: "numero_req", title: "Nro Req.", dataIndex: "numero_req", width: 120,
      ...filtroPorColumna(data, "numero_req"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "ot_numero", title: "OT", dataIndex: "ot_numero", width: 120,
      ...filtroPorColumna(data, "ot_numero"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "fecha_entrega_real", title: "F. Entrega real", dataIndex: "fecha_entrega_real", width: 130,
      sorter: (a, b) => (a.fecha_entrega_real ?? "").localeCompare(b.fecha_entrega_real ?? ""),
      render: (v: string | null) => formatDateOnly(v),
    },
    {
      key: "impuesto", title: "Impuesto", dataIndex: "impuesto", width: 100, align: "right",
      sorter: (a, b) => (a.impuesto ?? 0) - (b.impuesto ?? 0),
      render: (v: number | null) => v != null ? Number(v).toLocaleString() : "-",
    },
    {
      key: "moneda", title: "Moneda", dataIndex: "moneda", width: 80, align: "center",
      filters: [...new Set(data.map((r) => r.moneda).filter(Boolean) as string[])].sort().map((v) => ({ text: v, value: v })),
      onFilter: (value, r) => r.moneda === value,
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "acciones",
      title: "Acciones",
      width: 130,
      align: "center",
      fixed: "right",
      render: (_: unknown, r: Compra) => (
        <Space size={0}>
          <Tooltip title="Ver detalle">
            <Button type="text" icon={<EyeOutlined />} onClick={() => setModalId(r.id)} />
          </Tooltip>
          <Tooltip title="Editar items (tipo Excel)">
            <Button type="text" icon={<EditOutlined style={{ color: brand.cyan }} />} onClick={() => router.push(`/compras/${r.id}/editar`)} />
          </Tooltip>
          <Tooltip title="Generar PDF (OC)">
            <Button type="text" icon={<FilePdfOutlined style={{ color: "#cf1322" }} />} onClick={() => window.open(`/api/compras/${r.id}/pdf`, "_blank")} />
          </Tooltip>
          {r.estado === "Pendiente" && (
            <Tooltip title="Aceptar OC (pasa a En Proceso)">
              <Popconfirm
                title={`¿Aceptar la OC ${r.numero_po}?`}
                description="La OC quedará en estado En Proceso y registrará tu usuario como aprobador."
                onConfirm={() => handleAceptar(r.id)}
                okText="Aceptar"
                cancelText="Cancelar"
              >
                <Button type="text" icon={<CheckOutlined style={{ color: "#52c41a" }} />} />
              </Popconfirm>
            </Tooltip>
          )}
          {r.estado === "Pendiente" && (
            <Tooltip title="Eliminar">
              <Popconfirm
                title="¿Eliminar esta OC?"
                description="Solo se pueden eliminar OCs Pendientes"
                onConfirm={() => handleDelete(r.id)}
                okText="Eliminar"
                cancelText="Cancelar"
              >
                <Button type="text" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const { columnas: columnsResizable, components: tableComponents, resetAnchos, TableDragWrapper } =
    useColumnasRedimensionables<Compra>(columns, "compras-list-cols-widths-v1", { data });

  const ocsContent = (
    <>
      {/* Selector de vista por estado */}
      <Card styles={{ body: { padding: 12 } }} style={{ marginBottom: 12 }}>
        <Segmented
          block
          value={estado || "__all"}
          onChange={(v) => { setEstado(v === "__all" ? "" : (v as string)); setPage(1); }}
          options={[
            { value: "__all", label: "Todos" },
            { value: "Pendiente", label: "Pendiente" },
            { value: "Aprobado", label: "Aprobado" },
            { value: "En Proceso", label: "En Proceso" },
            { value: "Recibido", label: "Recibido" },
            { value: "Cancelado", label: "Cancelado" },
          ]}
        />
      </Card>

      {/* Filtros */}
      <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={16} md={10}>
            <Input
              placeholder="Buscar por OC, factura..."
              prefix={<SearchOutlined />}
              allowClear
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Button icon={<ReloadOutlined />} onClick={fetchData} block>
              Actualizar
            </Button>
          </Col>
          <Col xs={24} md={12}>
            <RangoFechasFiltro label="Fecha solicitud" value={rangoSolicitud} onChange={setRangoSolicitud} />
          </Col>
          <Col xs={24} md={12}>
            <RangoFechasFiltro label="Fecha entrega esperada" value={rangoEntrega} onChange={setRangoEntrega} />
          </Col>
        </Row>
      </Card>

      <TableDragWrapper>
              <Table
          rowKey="id"
          columns={visibleColumns(columnsResizable, ocultas)}
          components={tableComponents}
          dataSource={filasMostradas}
          loading={loading}
          pagination={paginacionEstandar({
            current: page,
            pageSize,
            total: data.length,
            onChange: (p, s) => { setPage(p); setPageSize(s); },
            label: "órdenes de compra",
          })}
          scroll={{ x: 1500 }}
          sticky={{ offsetHeader: 56, offsetScroll: 0 }}
          size="small"
          onChange={(_p, _f, _s, extra) => setVistaActual(extra.currentDataSource)}
        />
      </TableDragWrapper>
    </>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <Title level={3} style={{ margin: 0 }}>
          Compras
        </Title>
        <Space wrap>
          <ColumnasToggleButton<Compra>
            columns={columns}
            ocultas={ocultas}
            setOcultas={setOcultas}
            obligatorias={["__num", "numero_po", "acciones"]}
          />
          <Button onClick={resetAnchos}>Restablecer anchos</Button>
          <ExportarExcelButton<Compra>
            endpoint="/api/compras"
            // El endpoint no pagina (devuelve todo de una): con limit alto el
            // loop de descarga corta en la primera respuesta.
            limit={50000}
            filename="Compras"
            // Respeta TODOS los filtros activos: búsqueda + estado (ya vienen
            // aplicados server-side en `data`), rangos de fecha y filtros de
            // columna (capturados en vistaActual por el Table.onChange).
            currentRows={vistaActual ?? filasMostradas}
            tablaLayout={{ ocultas }}
            columns={[
              { key: "numero_po", label: "Nro OC", value: (r) => r.numero_po },
              { key: "nombre", label: "Nombre OC", value: (r) => r.nombre ?? "" },
              { key: "estado", label: "Estado", value: (r) => r.estado },
              { key: "proveedor_nombre", label: "Proveedor", value: (r) => r.proveedor_nombre ?? "" },
              { key: "almacen_nombre", label: "Almacén", value: (r) => r.almacen_nombre ?? "" },
              { key: "fecha_solicitud", label: "F. Solicitud", value: (r) => r.fecha_solicitud ? formatDateOnly(r.fecha_solicitud) : "" },
              { key: "fecha_req_creacion", label: "Creación REQ", value: (r) => r.fecha_req_creacion ? formatDateOnlyShort(r.fecha_req_creacion) : "" },
              { key: "fecha_oc_creacion", label: "Creación OC", value: (r) => r.fecha_oc_creacion ? dayjs(r.fecha_oc_creacion).format("DD/MM/YY HH:mm") : "" },
              { key: "fecha_entrega_esperada", label: "F. Entrega Esp.", value: (r) => r.fecha_entrega_esperada ? formatDateOnly(r.fecha_entrega_esperada) : "" },
              { key: "cantidad_items", label: "Items", value: (r) => r.cantidad_items },
              { key: "pu_sin_igv", label: "PU (sin IGV)", value: (r) => r.cantidad_items > 0 ? Number((Number(r.subtotal) / r.cantidad_items).toFixed(2)) : 0 },
              { key: "total_sin_igv", label: "Total (sin IGV)", value: (r) => Number(r.subtotal) },
              { key: "nro_guia", label: "Guía", value: (r) => r.nro_guia ?? "" },
              { key: "nro_factura", label: "Factura", value: (r) => r.nro_factura ?? "" },
              { key: "observaciones", label: "Comentarios", value: (r) => r.observaciones ?? "" },
              { key: "usuario_solicita", label: "Usuario", value: (r) => r.usuario_solicita ?? "" },
              { key: "numero_req", label: "Nro Req.", value: (r) => r.numero_req ?? "" },
              { key: "ot_numero", label: "OT", value: (r) => r.ot_numero ?? "" },
              { key: "fecha_entrega_real", label: "F. Entrega real", value: (r) => r.fecha_entrega_real ? formatDateOnly(r.fecha_entrega_real) : "" },
              { key: "impuesto", label: "Impuesto", value: (r) => r.impuesto != null ? Number(r.impuesto) : "" },
              { key: "moneda", label: "Moneda", value: (r) => r.moneda ?? "" },
              // No es columna de la tabla, pero el export anterior la incluía.
              { key: "total_con_igv", label: "Total (con IGV)", value: (r) => Number(r.total), defaultSelected: false },
            ]}
          />
          <Button
            icon={<UnorderedListOutlined />}
            onClick={() => router.push("/requerimientos")}
          >
            Ir a Requerimientos
          </Button>
        </Space>
      </div>

      <Tabs
        defaultActiveKey="ocs"
        items={[
          {
            key: "ocs",
            label: (
              <span>
                <ShoppingCartOutlined /> Órdenes de Compra
                <Badge count={data.length} style={{ background: brand.navy, marginLeft: 8 }} showZero />
              </span>
            ),
            children: ocsContent,
          },
          {
            key: "aprobados",
            label: (
              <span>
                <InfoCircleOutlined /> Requerimientos aprobados
              </span>
            ),
            children: <RequerimientosAprobadosTab onOCCreated={fetchData} />,
          },
        ]}
      />

      <CompraDetalleModal
        compraId={modalId}
        open={!!modalId}
        onClose={() => setModalId(null)}
        onUpdated={fetchData}
      />
    </div>
  );
}
