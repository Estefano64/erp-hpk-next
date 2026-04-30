"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
} from "@ant-design/icons";
import type { ColumnsType, TableRowSelection } from "antd/es/table/interface";
import { Popover, InputNumber, Divider, Checkbox } from "antd";
import { brand } from "@/lib/theme";
import dayjs, { Dayjs } from "dayjs";

const { Title, Text } = Typography;
const { TextArea } = Input;

interface Requerimiento {
  id: number;
  ot_id: number;
  numero_ot: string | null;
  material_id: number | null;
  material_codigo: string | null;
  material_nombre: string | null;
  stock_actual: number;
  nro_req: string | null;
  item_req: number | null;
  tipo_codigo: string | null;
  cantidad: number;
  descripcion: string | null;
  fabricante_codigo: string | null;
  unidad_medida: string | null;
  fecha_solicitud: string | null;
  fecha_requerida: string | null;
  estado: string | null;
  estado_cot: string | null;
  nro_oc: string | null;
  numero_po: string | null;
  proveedor_nombre: string | null;
  precio_unitario: number | null;
  moneda: string | null;
  cliente_nombre: string | null;
  observaciones?: string | null;
}

interface CatalogoItem {
  id: number;
  razonSocial?: string;
  nombre?: string;
}

const estadoReqColor: Record<string, string> = {
  Pendiente: "gold",
  REV: "gold",
  Aprobado: "green",
  APR: "green",
  "En PO": "blue",
  COM: "default",
  ANU: "red",
};

const estadoCotColor: Record<string, string> = {
  PDT_COT: "gold",
  PDT_APR: "orange",
  APR: "green",
  ANU: "red",
  DES: "red",
};

export default function RequerimientosDetallePage() {
  const router = useRouter();
  const params = useSearchParams();
  const { message } = App.useApp();

  const [allData, setAllData] = useState<Requerimiento[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filtroOt, setFiltroOt] = useState<string | undefined>(undefined);
  const [filtroEstado, setFiltroEstado] = useState<string | undefined>(undefined);
  const [filtroRapido, setFiltroRapido] = useState<string>("todos");
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [selectedRecords, setSelectedRecords] = useState<Requerimiento[]>([]);

  // Modal de Crear OC
  const [modalOpen, setModalOpen] = useState(false);
  const [ocForm] = Form.useForm();
  const [proveedores, setProveedores] = useState<CatalogoItem[]>([]);
  const [almacenes, setAlmacenes] = useState<CatalogoItem[]>([]);
  const [creatingOC, setCreatingOC] = useState(false);

  // Modal de Dividir
  const [modalDividir, setModalDividir] = useState<Requerimiento | null>(null);
  const [partesDividir, setPartesDividir] = useState<number[]>([]);
  const [dividiendo, setDividiendo] = useState(false);

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
      const res = await fetch("/api/requerimientos");
      const json = await res.json();
      setAllData(json.data as Requerimiento[]);
    } catch {
      message.error("Error al cargar requerimientos");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    fetchData();
    // Pre-filtrar por OT si viene en URL
    const otId = params.get("ot_id");
    if (otId) setFiltroOt(otId);
  }, [fetchData, params]);

  useEffect(() => {
    // Cargar catalogos para el modal
    Promise.all([fetch("/api/proveedores"), fetch("/api/almacenes")])
      .then(async ([pr, al]) => {
        if (pr.ok) setProveedores((await pr.json()).data ?? []);
        if (al.ok) setAlmacenes((await al.json()).data ?? []);
      })
      .catch(() => {});
  }, []);

  // Filtros rapidos
  const filteredData = useMemo(() => {
    let rows = [...allData];

    // Por OT
    if (filtroOt) rows = rows.filter((r) => String(r.ot_id) === String(filtroOt));

    // Filtro rapido
    if (filtroRapido === "pdt_cotizar") {
      rows = rows.filter((r) => {
        const est = r.estado || "Pendiente";
        if (["COM", "ANU", "En PO"].includes(est)) return false;
        if (r.nro_oc) return false;
        return !r.precio_unitario || !r.estado_cot || r.estado_cot === "PDT_COT";
      });
    } else if (filtroRapido === "pdt_pedir") {
      rows = rows.filter((r) => {
        const est = r.estado || "Pendiente";
        if (["COM", "ANU"].includes(est)) return false;
        if (r.nro_oc) return false;
        return est === "Aprobado" || est === "APR" || r.estado_cot === "APR";
      });
    } else if (filtroRapido === "en_oc") {
      rows = rows.filter((r) => !!r.nro_oc);
    }

    // Estado
    if (filtroEstado) rows = rows.filter((r) => (r.estado || "Pendiente") === filtroEstado);

    // Buscar
    if (search) {
      const lc = search.toLowerCase();
      rows = rows.filter((r) =>
        Object.values(r).some((v) => v && String(v).toLowerCase().includes(lc))
      );
    }

    return rows;
  }, [allData, filtroOt, filtroRapido, filtroEstado, search]);

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

  // Totales seleccion
  const totalSub = selectedRecords.reduce(
    (s, r) => s + (parseFloat(String(r.precio_unitario || 0)) * parseFloat(String(r.cantidad || 0))),
    0
  );
  const totalIGV = totalSub * 0.18;
  const totalFinal = totalSub + totalIGV;

  const rowSelection: TableRowSelection<Requerimiento> = {
    selectedRowKeys: selectedRows,
    onChange: (keys, records) => {
      setSelectedRows(keys as number[]);
      setSelectedRecords(records);
    },
    getCheckboxProps: (r) => ({
      disabled: !!r.nro_oc || r.estado === "COM" || r.estado === "ANU",
    }),
  };

  const abrirModalOC = () => {
    if (!selectedRecords.length) {
      message.warning("Selecciona al menos un requerimiento");
      return;
    }
    ocForm.setFieldsValue({
      moneda: "USD",
      fecha_entrega_esperada: dayjs().add(15, "day"),
      almacen_id: almacenes[0]?.id,
    });
    setModalOpen(true);
  };

  const generarOC = async () => {
    try {
      const values = await ocForm.validateFields();
      setCreatingOC(true);
      const res = await fetch("/api/compras/crear-oc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repuesto_ids: selectedRows,
          proveedor_id: values.proveedor_id,
          almacen_id: values.almacen_id,
          moneda: values.moneda,
          fecha_entrega_esperada: values.fecha_entrega_esperada
            ? (values.fecha_entrega_esperada as Dayjs).format("YYYY-MM-DD")
            : null,
          observaciones: values.observaciones,
          usuario: "Logistica",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al crear OC");
      message.success(`OC ${json.compra?.numero_po} creada con éxito`);
      setModalOpen(false);
      setSelectedRows([]);
      setSelectedRecords([]);
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      if (!msg.includes("validation")) message.error(msg);
    } finally {
      setCreatingOC(false);
    }
  };

  // ── Dividir requerimiento ──
  const abrirModalDividir = (r: Requerimiento) => {
    const cant = Number(r.cantidad);
    if (cant < 2) {
      message.warning("Solo se pueden dividir items con cantidad >= 2");
      return;
    }
    if (r.nro_oc) {
      message.warning("No se puede dividir un item que ya esta en una OC");
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
        <Col span={12}><Text type="secondary">Stock:</Text> <b style={{ color: r.stock_actual > 0 ? "#52c41a" : "#ff4d4f" }}>{r.stock_actual ?? 0}</b></Col>
        <Col span={12}><Text type="secondary">Fabricante:</Text> <b>{r.fabricante_codigo || "-"}</b></Col>
        <Col span={12}><Text type="secondary">Moneda:</Text> <b>{r.moneda || "USD"}</b></Col>
        <Col span={12}><Text type="secondary">P. Unit:</Text> <b>{r.precio_unitario != null ? Number(r.precio_unitario).toFixed(2) : "-"}</b></Col>
        <Col span={12}><Text type="secondary">Subtotal:</Text> <b>{r.precio_unitario ? (Number(r.precio_unitario) * Number(r.cantidad)).toFixed(2) : "-"}</b></Col>
        <Col span={24}><Text type="secondary">Cliente:</Text> {r.cliente_nombre || "-"}</Col>
        <Col span={24}><Text type="secondary">Proveedor:</Text> {r.proveedor_nombre || "-"}</Col>
        <Col span={12}><Text type="secondary">F. Solicitud:</Text> {r.fecha_solicitud ? dayjs(r.fecha_solicitud).format("DD/MM/YYYY") : "-"}</Col>
        <Col span={12}><Text type="secondary">F. Requerida:</Text> {r.fecha_requerida ? dayjs(r.fecha_requerida).format("DD/MM/YYYY") : "-"}</Col>
      </Row>
      {r.observaciones && (
        <>
          <Divider style={{ margin: "8px 0" }} />
          <Text type="secondary" style={{ fontSize: 11 }}>Observaciones:</Text>
          <div style={{ fontSize: 11 }}>{r.observaciones}</div>
        </>
      )}
      <Divider style={{ margin: "8px 0" }} />
      <Space size={4}>
        {r.nro_oc && <Tag color="blue">En OC: {r.nro_oc}</Tag>}
        {r.estado_cot && <Tag color={estadoCotColor[r.estado_cot] || "default"}>COT: {r.estado_cot}</Tag>}
        <Tag color={estadoReqColor[r.estado || "Pendiente"] || "default"}>{r.estado || "Pendiente"}</Tag>
      </Space>
    </div>
  );

  const columns: ColumnsType<Requerimiento> = [
    {
      key: "numero_ot",
      title: "OT",
      dataIndex: "numero_ot",
      width: 120,
      fixed: "left",
      filters: obtenerValoresUnicos("numero_ot"),
      filterSearch: true,
      onFilter: (value, r) => r.numero_ot === value,
      render: (v) => (v ? <Tag color={brand.navy}>{v}</Tag> : "-"),
    },
    {
      key: "estado",
      title: "Estado REQ",
      dataIndex: "estado",
      width: 110,
      filters: [
        { text: "Pendiente", value: "Pendiente" },
        { text: "Aprobado", value: "Aprobado" },
        { text: "APR", value: "APR" },
        { text: "En PO", value: "En PO" },
        { text: "REV", value: "REV" },
      ],
      onFilter: (value, r) => (r.estado || "Pendiente") === value,
      render: (v: string | null) => {
        const est = v || "Pendiente";
        return <Tag color={estadoReqColor[est] || "default"}>{est}</Tag>;
      },
    },
    {
      key: "estado_cot",
      title: "Estado COT",
      dataIndex: "estado_cot",
      width: 100,
      filters: [
        { text: "PDT_COT", value: "PDT_COT" },
        { text: "PDT_APR", value: "PDT_APR" },
        { text: "APR", value: "APR" },
        { text: "DES", value: "DES" },
      ],
      onFilter: (value, r) => r.estado_cot === value,
      render: (v: string | null) => (v ? <Tag color={estadoCotColor[v] || "default"}>{v}</Tag> : "-"),
    },
    {
      key: "nro_oc",
      title: "Nro OC",
      dataIndex: "nro_oc",
      width: 110,
      filters: obtenerValoresUnicos("nro_oc"),
      filterSearch: true,
      onFilter: (value, r) => r.nro_oc === value,
      render: (v: string | null) => (v ? <Tag color="blue">{v}</Tag> : "-"),
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
    { key: "item_req", title: "Item", dataIndex: "item_req", width: 55, align: "center", sorter: (a, b) => (a.item_req || 0) - (b.item_req || 0) },
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
      render: (_: unknown, r: Requerimiento) => (
        <Popover content={popoverContent(r)} placement="right" mouseEnterDelay={0.3} trigger="hover">
          <div style={{ display: "flex", alignItems: "center", gap: 4, cursor: "help" }}>
            <InfoCircleOutlined style={{ color: brand.cyan, fontSize: 11 }} />
            <span>{r.material_nombre || r.descripcion || "-"}</span>
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
      render: (v: number, r: Requerimiento) => {
        const canSplit = Number(v) >= 2 && !r.nro_oc;
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
    { key: "unidad_medida", title: "UM", dataIndex: "unidad_medida", width: 55, align: "center" },
    {
      key: "cliente_nombre",
      title: "Cliente",
      dataIndex: "cliente_nombre",
      width: 130,
      ellipsis: true,
      filters: obtenerValoresUnicos("cliente_nombre"),
      filterSearch: true,
      onFilter: (value, r) => r.cliente_nombre === value,
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
      key: "precio_unitario",
      title: "P. Unit.",
      dataIndex: "precio_unitario",
      width: 80,
      align: "right",
      sorter: (a, b) => Number(a.precio_unitario || 0) - Number(b.precio_unitario || 0),
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
      render: (v: string | null) => (v ? dayjs(v).format("DD/MM/YYYY") : "-"),
    },
    {
      key: "fecha_requerida",
      title: "F. Requerida",
      dataIndex: "fecha_requerida",
      width: 105,
      sorter: (a, b) => (a.fecha_requerida || "").localeCompare(b.fecha_requerida || ""),
      render: (v: string | null) => (v ? dayjs(v).format("DD/MM/YYYY") : "-"),
    },
  ];

  // Filtrar columnas visibles (respetando orden)
  const columnasVisibles = columns.filter((c) => !columnasOcultas.includes(String(c.key)));
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

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Detalle de Requerimientos
          </Title>
          <Text type="secondary">
            {filteredData.length} items de {new Set(filteredData.map((r) => r.ot_id)).size} OT(s)
          </Text>
        </div>
        <Space>
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
            <Button type="primary" size="large" icon={<FileDoneOutlined />} onClick={abrirModalOC}>
              Crear OC ({selectedRows.length})
            </Button>
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
            <Select
              placeholder="Estado"
              allowClear
              style={{ width: "100%" }}
              value={filtroEstado}
              onChange={setFiltroEstado}
              options={[
                { value: "Pendiente", label: "Pendiente" },
                { value: "Aprobado", label: "Aprobado" },
                { value: "En PO", label: "En OC" },
                { value: "COM", label: "Completado" },
                { value: "ANU", label: "Anulado" },
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
              }}
              block
            >
              Limpiar
            </Button>
          </Col>
        </Row>

        {/* Filtros rapidos */}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${brand.border}` }}>
          <Space wrap>
            <Text type="secondary" style={{ fontSize: 12 }}>
              <FilterOutlined /> Filtro rápido:
            </Text>
            <Button
              size="small"
              type={filtroRapido === "pdt_cotizar" ? "primary" : "default"}
              icon={<TagOutlined />}
              onClick={() => setFiltroRapido(filtroRapido === "pdt_cotizar" ? "todos" : "pdt_cotizar")}
            >
              Pdt Cotizar
            </Button>
            <Button
              size="small"
              type={filtroRapido === "pdt_pedir" ? "primary" : "default"}
              icon={<ShoppingCartOutlined />}
              onClick={() => setFiltroRapido(filtroRapido === "pdt_pedir" ? "todos" : "pdt_pedir")}
            >
              Pdt Pedir (sin OC)
            </Button>
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

      {/* Tabla */}
      <Table
        rowKey="id"
        rowSelection={rowSelection}
        columns={columnasVisibles}
        dataSource={filteredData}
        loading={loading}
        pagination={{ pageSize: 25, showTotal: (t) => `${t} registros` }}
        scroll={{ x: 2000 }}
        size="small"
      />

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
        width={900}
        footer={null}
      >
        <div style={{ marginBottom: 16 }}>
          <Card size="small" style={{ background: brand.bgPage }}>
            <Row gutter={16}>
              <Col span={8}>
                <Statistic title="Items" value={selectedRows.length} />
              </Col>
              <Col span={8}>
                <Statistic title="Subtotal" value={totalSub} precision={2} prefix="$" />
              </Col>
              <Col span={8}>
                <Statistic
                  title="Total + IGV"
                  value={totalFinal}
                  precision={2}
                  prefix="$"
                  styles={{ content: { color: brand.navy, fontWeight: 700 } }}
                />
              </Col>
            </Row>
          </Card>
        </div>

        <Form form={ocForm} layout="vertical">
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
                  options={proveedores.map((p) => ({ value: p.id, label: p.razonSocial }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Almacén destino"
                name="almacen_id"
                rules={[{ required: true, message: "Selecciona un almacén" }]}
              >
                <Select
                  placeholder="Seleccionar almacén"
                  options={almacenes.map((a) => ({ value: a.id, label: a.nombre }))}
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={8}>
              <Form.Item label="Moneda" name="moneda">
                <Select
                  options={[
                    { value: "USD", label: "USD" },
                    { value: "PEN", label: "PEN" },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={8}>
              <Form.Item label="Fecha entrega esperada" name="fecha_entrega_esperada">
                <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Observaciones" name="observaciones">
            <TextArea rows={2} placeholder="Notas adicionales..." />
          </Form.Item>

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
        width={600}
        footer={null}
      >
        {modalDividir && (
          <div>
            <Card size="small" style={{ background: brand.bgPage, marginBottom: 12 }}>
              <Row gutter={16}>
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Descripción</Text>
                  <div style={{ fontWeight: 600 }}>{modalDividir.material_nombre || modalDividir.descripcion}</div>
                </Col>
                <Col span={6}>
                  <Statistic title="Cantidad Original" value={Number(modalDividir.cantidad)} />
                </Col>
                <Col span={6}>
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
    </div>
  );
}
