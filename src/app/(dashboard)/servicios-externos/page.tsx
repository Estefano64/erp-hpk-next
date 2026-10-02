"use client";

// Logística › Servicios externos — VISOR (solo lectura).
// Todos los requerimientos SER aprobados con el estado de su ciclo (salida a
// proveedor → cotización → devolución | llegada) y el estado documental
// (guía de salida, cotización, guía de llegada, informe, OC, factura).
// Las acciones (registrar salida/cotización/llegada, subir PDFs) viven en
// Requerimientos (pestaña de la OT y pantalla global); acá solo se mira.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Col, Input, Row, Select, Space, Statistic, Table, Tag, Tooltip, Typography } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { brand, space } from "@/lib/theme";
import { useResponsive } from "@/lib/responsive";
import { paginacionEstandar } from "@/lib/tables";
import { ExportarExcelButton } from "@/components/ExportarExcelButton";
import { formatDateOnly, dateOnlyLocal, hoyEnLima } from "@/lib/dates";
import {
  SERVICIO_ESTADOS, SERVICIO_ESTADO_COLORS, SERVICIO_ESTADO_LABELS, type ServicioEstado,
} from "@/lib/servicios-externos";
import {
  DocsSemaforo, ServicioSeguimientoDrawer, type ServicioSer, type Envio,
} from "@/components/modules/servicios/ServicioSeguimiento";

const { Title, Text } = Typography;

const ENDPOINT = "/api/servicios-externos?solo_aprobados=1";

const ESTADOS_VISIBLES: ServicioEstado[] = SERVICIO_ESTADOS.filter((e) => e !== "NO_APLICA");

function ultimoEnvio(s: ServicioSer): Envio | null {
  return s.envios.length ? s.envios[s.envios.length - 1] : null;
}
function envioAceptado(s: ServicioSer): Envio | null {
  return s.envios.find((e) => e.id === s.envio_aceptado_id) ?? null;
}
function diasAfuera(s: ServicioSer, hoy: Date): number | null {
  const u = ultimoEnvio(s);
  if (!u || u.fecha_llegada || u.fecha_devolucion) return null;
  const f = dateOnlyLocal(u.fecha_salida);
  if (!f) return null;
  return Math.max(0, Math.round((hoy.getTime() - f.getTime()) / 86400000));
}

export default function ServiciosExternosPage() {
  const { screens } = useResponsive();
  const [rows, setRows] = useState<ServicioSer[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [estados, setEstados] = useState<ServicioEstado[]>([]);
  const [proveedorId, setProveedorId] = useState<number | null>(null);
  const [soloDocsIncompleta, setSoloDocsIncompleta] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sel, setSel] = useState<ServicioSer | null>(null);
  const hoy = useMemo(() => hoyEnLima(), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(ENDPOINT);
      if (res.ok) setRows(((await res.json()).data ?? []) as ServicioSer[]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const proveedores = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of rows) for (const e of r.envios) if (e.proveedor) m.set(e.proveedor.id, e.proveedor.razon_social);
    return [...m.entries()].map(([id, nombre]) => ({ value: id, label: nombre })).sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (estados.length && !estados.includes(r.estado)) return false;
      if (proveedorId != null && ultimoEnvio(r)?.proveedor_id !== proveedorId) return false;
      if (soloDocsIncompleta && r.docs_completa) return false;
      if (t) {
        const u = ultimoEnvio(r);
        const hay = [r.ot_codigo, r.cliente, r.nro_req, r.descripcion, r.nro_oc, u?.guia_salida, u?.guia_llegada, u?.guia_devolucion, u?.nro_cotizacion, u?.nro_factura, u?.proveedor?.razon_social]
          .some((v) => (v ?? "").toString().toLowerCase().includes(t));
        if (!hay) return false;
      }
      return true;
    });
  }, [rows, q, estados, proveedorId, soloDocsIncompleta]);

  const conteo = useMemo(() => {
    const c: Partial<Record<ServicioEstado, number>> = {};
    for (const r of rows) c[r.estado] = (c[r.estado] ?? 0) + 1;
    return c;
  }, [rows]);

  const columns: ColumnsType<ServicioSer> = [
    {
      title: "OT", key: "ot", width: 110, fixed: screens.md ? "left" : undefined,
      render: (_, r) => (
        <div style={{ lineHeight: 1.2 }}>
          <Text strong style={{ fontSize: 12 }}>{r.ot_codigo ?? "—"}</Text>
          {r.cliente && <div><Text type="secondary" style={{ fontSize: 10 }} ellipsis>{r.cliente}</Text></div>}
        </div>
      ),
    },
    { title: "Req", key: "req", width: 110, render: (_, r) => <Text style={{ fontSize: 11 }}>{r.nro_req ?? "—"}/{r.item_req ?? "—"}</Text> },
    {
      title: "Servicio", key: "desc", width: 240, ellipsis: true,
      render: (_, r) => (
        <div style={{ lineHeight: 1.2 }}>
          <div style={{ fontSize: 12 }}>{r.descripcion ?? "—"}</div>
          {r.items.length > 0 && <Text type="secondary" style={{ fontSize: 10 }}>+ {r.items.length} ítem(s) del proveedor</Text>}
        </div>
      ),
    },
    {
      title: "Estado", key: "estado", width: 150, align: "center",
      filters: ESTADOS_VISIBLES.map((e) => ({ text: SERVICIO_ESTADO_LABELS[e], value: e })),
      onFilter: (v, r) => r.estado === v,
      render: (_, r) => {
        const d = diasAfuera(r, hoy);
        return (
          <Space orientation="vertical" size={2}>
            <Tag color={SERVICIO_ESTADO_COLORS[r.estado]} style={{ margin: 0, fontSize: 10 }}>{SERVICIO_ESTADO_LABELS[r.estado]}</Tag>
            {d != null && <Text type="secondary" style={{ fontSize: 10 }}>{d} día(s) afuera</Text>}
          </Space>
        );
      },
    },
    {
      title: "Proveedor", key: "prov", width: 160, ellipsis: true,
      render: (_, r) => ultimoEnvio(r)?.proveedor?.razon_social ?? <Text type="secondary">—</Text>,
    },
    {
      title: "Salida", key: "salida", width: 130,
      sorter: (a, b) => (ultimoEnvio(a)?.fecha_salida ?? "").localeCompare(ultimoEnvio(b)?.fecha_salida ?? ""),
      render: (_, r) => {
        const u = ultimoEnvio(r);
        if (!u) return <Text type="secondary">—</Text>;
        return <div style={{ lineHeight: 1.2, fontSize: 11 }}>{formatDateOnly(u.fecha_salida)}{u.guia_salida && <div><Text type="secondary" style={{ fontSize: 10 }}>G. {u.guia_salida}</Text></div>}</div>;
      },
    },
    {
      title: "Cotización", key: "cot", width: 150,
      render: (_, r) => {
        const u = ultimoEnvio(r);
        if (!u || !u.cotizacion_resultado) return <Text type="secondary">—</Text>;
        const monto = u.monto_cotizacion != null ? `${u.moneda_cotizacion ?? ""} ${Number(u.monto_cotizacion).toFixed(2)}` : null;
        return (
          <div style={{ lineHeight: 1.2, fontSize: 11 }}>
            <Tag color={u.cotizacion_resultado === "ACEPTADA" ? "success" : "error"} style={{ margin: 0, fontSize: 10 }}>{u.cotizacion_resultado}</Tag>
            {monto && <div>{monto}</div>}
            {u.nro_cotizacion && <Text type="secondary" style={{ fontSize: 10 }}>N° {u.nro_cotizacion}</Text>}
          </div>
        );
      },
    },
    {
      title: "Llegada / Devolución", key: "llegada", width: 140,
      render: (_, r) => {
        const u = ultimoEnvio(r);
        if (!u) return <Text type="secondary">—</Text>;
        if (u.fecha_llegada) return <div style={{ lineHeight: 1.2, fontSize: 11 }}>{formatDateOnly(u.fecha_llegada)}{u.guia_llegada && <div><Text type="secondary" style={{ fontSize: 10 }}>G. {u.guia_llegada}</Text></div>}</div>;
        if (u.fecha_devolucion) return <div style={{ lineHeight: 1.2, fontSize: 11 }}><Text type="warning">Dev. {formatDateOnly(u.fecha_devolucion)}</Text>{u.guia_devolucion && <div><Text type="secondary" style={{ fontSize: 10 }}>G. {u.guia_devolucion}</Text></div>}</div>;
        return <Text type="secondary">—</Text>;
      },
    },
    {
      title: "Documentación", key: "docs", width: 170, align: "center",
      filters: [{ text: "Completa", value: "ok" }, { text: "Incompleta", value: "falta" }],
      onFilter: (v, r) => (v === "ok" ? r.docs_completa : !r.docs_completa),
      render: (_, r) => r.estado === "NO_APLICA" ? <Text type="secondary">—</Text> : (
        <Space orientation="vertical" size={2}>
          <DocsSemaforo docs={r.docs} compact />
          <Text type={r.docs_completa ? "success" : "secondary"} style={{ fontSize: 10 }}>{r.docs_completa ? "completa" : "incompleta"}</Text>
        </Space>
      ),
    },
    {
      title: "OC", key: "oc", width: 110,
      render: (_, r) => r.nro_oc ? <Text code style={{ fontSize: 10 }}>{r.nro_oc}</Text> : <Text type="secondary" style={{ fontSize: 11 }}>sin OC</Text>,
    },
    {
      title: "Factura", key: "fac", width: 110,
      render: (_, r) => envioAceptado(r)?.nro_factura ?? <Text type="secondary">—</Text>,
    },
    {
      title: "", key: "ver", width: 90, fixed: "right",
      render: (_, r) => <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setSel(r)}>Ver</Button>,
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.lg }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: space.sm }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>Servicios externos</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Seguimiento de servicios tercerizados (cromado, NDT, rectificado…): dónde está el componente y qué documentos faltan. Solo lectura — las acciones están en Requerimientos.
          </Text>
        </div>
        <Space wrap>
          <Tooltip title="Actualizar"><Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading} /></Tooltip>
          <ExportarExcelButton<ServicioSer>
            endpoint={ENDPOINT}
            filename="Servicios-externos"
            currentRows={filtradas}
            columns={[
              { key: "ot", label: "OT", value: (r) => r.ot_codigo ?? "" },
              { key: "cliente", label: "Cliente", value: (r) => r.cliente ?? "" },
              { key: "req", label: "Req / Item", value: (r) => `${r.nro_req ?? "—"}/${r.item_req ?? "—"}` },
              { key: "servicio", label: "Servicio", value: (r) => r.descripcion ?? "" },
              { key: "estado", label: "Estado", value: (r) => SERVICIO_ESTADO_LABELS[r.estado] },
              { key: "proveedor", label: "Proveedor", value: (r) => ultimoEnvio(r)?.proveedor?.razon_social ?? "" },
              { key: "fecha_salida", label: "F. Salida", value: (r) => dateOnlyLocal(ultimoEnvio(r)?.fecha_salida) ?? null },
              { key: "guia_salida", label: "Guía salida", value: (r) => ultimoEnvio(r)?.guia_salida ?? "" },
              { key: "cot_resultado", label: "Cotización", value: (r) => ultimoEnvio(r)?.cotizacion_resultado ?? "" },
              { key: "cot_monto", label: "Monto cotizado", value: (r) => ultimoEnvio(r)?.monto_cotizacion ?? null, z: "#,##0.00" },
              { key: "cot_moneda", label: "Moneda", value: (r) => ultimoEnvio(r)?.moneda_cotizacion ?? "" },
              { key: "fecha_devolucion", label: "F. Devolución", value: (r) => dateOnlyLocal(ultimoEnvio(r)?.fecha_devolucion) ?? null },
              { key: "guia_devolucion", label: "Guía devolución", value: (r) => ultimoEnvio(r)?.guia_devolucion ?? "" },
              { key: "fecha_llegada", label: "F. Llegada", value: (r) => dateOnlyLocal(ultimoEnvio(r)?.fecha_llegada) ?? null },
              { key: "guia_llegada", label: "Guía llegada", value: (r) => ultimoEnvio(r)?.guia_llegada ?? "" },
              { key: "oc", label: "OC", value: (r) => r.nro_oc ?? "" },
              { key: "factura", label: "Factura", value: (r) => envioAceptado(r)?.nro_factura ?? "" },
              { key: "docs", label: "Documentación", value: (r) => (r.docs_completa ? "Completa" : "Incompleta") },
              { key: "docs_faltan", label: "Docs faltantes", value: (r) => r.docs.filter((d) => d.estado === "falta").map((d) => d.label).join(", ") },
              { key: "dias", label: "Días afuera", value: (r) => diasAfuera(r, hoy) },
            ]}
          />
        </Space>
      </div>

      <Row gutter={[space.sm, space.sm]}>
        {ESTADOS_VISIBLES.map((e) => (
          <Col key={e} xs={12} sm={8} md={4}>
            <Card size="small" hoverable onClick={() => setEstados((prev) => prev.length === 1 && prev[0] === e ? [] : [e])}
              style={{ borderColor: estados.length === 1 && estados[0] === e ? brand.cyan : undefined }}>
              <Statistic title={<Text style={{ fontSize: 11 }}>{SERVICIO_ESTADO_LABELS[e]}</Text>} value={conteo[e] ?? 0} styles={{ content: { fontSize: 20 } }} />
            </Card>
          </Col>
        ))}
      </Row>

      <Space wrap>
        <Input.Search allowClear placeholder="OT, cliente, servicio, guía, cotización, OC…" style={{ width: screens.md ? 320 : "100%" }} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <Select mode="multiple" allowClear placeholder="Estado" style={{ minWidth: 200 }} value={estados} onChange={(v) => { setEstados(v); setPage(1); }}
          options={ESTADOS_VISIBLES.map((e) => ({ value: e, label: SERVICIO_ESTADO_LABELS[e] }))} />
        <Select allowClear showSearch optionFilterProp="label" placeholder="Proveedor" style={{ minWidth: 220 }} value={proveedorId ?? undefined} onChange={(v) => { setProveedorId(v ?? null); setPage(1); }} options={proveedores} />
        <Select style={{ minWidth: 190 }} value={soloDocsIncompleta ? "falta" : "todas"} onChange={(v) => { setSoloDocsIncompleta(v === "falta"); setPage(1); }}
          options={[{ value: "todas", label: "Toda la documentación" }, { value: "falta", label: "Solo documentación incompleta" }]} />
      </Space>

      <Table<ServicioSer>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={filtradas}
        columns={columns}
        scroll={{ x: 1700 }}
        pagination={paginacionEstandar({ current: page, pageSize, total: filtradas.length, onChange: (p, s) => { setPage(p); setPageSize(s); }, label: "servicios" })}
      />

      <ServicioSeguimientoDrawer
        ser={sel}
        open={sel != null}
        onClose={() => setSel(null)}
        puedeOperar={false}
        onChanged={load}
      />
    </div>
  );
}
