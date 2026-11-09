"use client";

// Logística › Servicios externos.
// Dos vistas:
//   - Por guía: cada envío (o envío conjunto de varios SER con la misma guía
//     de salida) con el estado de cada servicio. Desde acá logística registra
//     la cotización (qué servicios acepta el proveedor y cuáles devuelve), la
//     llegada y los PDFs, abriendo el seguimiento del envío.
//   - Por servicio: todos los SER aprobados con su ciclo y su documentación.
//     Se pueden seleccionar varios Incompletos (aunque sean de guías
//     distintas) y registrar su llegada de una vez, como "Crear OC" en
//     Requerimientos.
// La salida (generar seguimiento) y la OC se siguen haciendo desde
// Requerimientos.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Card, Col, Input, Row, Segmented, Select, Space, Statistic, Table, Tag, Tooltip, Typography } from "antd";
import { InboxOutlined, ReloadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { brand, space } from "@/lib/theme";
import { useResponsive } from "@/lib/responsive";
import { paginacionEstandar, useColumnasRedimensionables } from "@/lib/tables";
import { ExportarExcelButton } from "@/components/ExportarExcelButton";
import { formatDateOnly, dateOnlyLocal, hoyEnLima } from "@/lib/dates";
import {
  SERVICIO_ESTADOS, SERVICIO_ESTADO_COLORS, SERVICIO_ESTADO_LABELS, estadoDeEnvio, puedeLlegadaDirecta, type ServicioEstado,
} from "@/lib/servicios-externos";
import { puedeEscribirApi } from "@/lib/acceso-rutas";
import {
  DocsSemaforo, ServicioLlegadaModal, ServicioSeguimientoDrawer, type ServicioSer, type Envio,
} from "@/components/modules/servicios/ServicioSeguimiento";

const { Title, Text } = Typography;

// Solo servicios con seguimiento: un SER aparece acá cuando se le generó el
// seguimiento (salida) o la OC desde Requerimientos (pedido 2026-10-23). Los
// aprobados que todavía no salieron se gestionan en Requerimientos.
// Excepción (2026-11-04): los SER con OC abierta sin seguimiento (OCs viejas)
// también vienen, para registrarles la llegada desde la vista "Por servicio".
const ENDPOINT = "/api/servicios-externos?solo_aprobados=1&con_seguimiento=1";

// RECHAZADO quedó en desuso (una cotización rechazada ya es DEVUELTO);
// PENDIENTE_ENVIO no aplica acá (sin seguimiento no se lista).
const ESTADOS_VISIBLES: ServicioEstado[] = SERVICIO_ESTADOS.filter((e) => e !== "NO_APLICA" && e !== "RECHAZADO" && e !== "PENDIENTE_ENVIO");

// Marca de tiempo (created_at) en hora de Lima: "09/11/2026 14:30".
function fechaHoraLima(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}
function CreadoCell({ fecha, usuario }: { fecha: string | Date | null | undefined; usuario: string | null | undefined }) {
  return (
    <div style={{ lineHeight: 1.2, fontSize: 11 }}>
      {fechaHoraLima(fecha)}
      <div><Text type="secondary" style={{ fontSize: 10 }}>{usuario ?? "—"}</Text></div>
    </div>
  );
}

function ultimoEnvio(s: ServicioSer): Envio | null {
  return s.envios.length ? s.envios[s.envios.length - 1] : null;
}
function envioAceptado(s: ServicioSer): Envio | null {
  return s.envios.find((e) => e.id === s.envio_aceptado_id) ?? null;
}
// Quién y cuándo: el seguimiento (primer envío) si existe; si no, el requerimiento.
function creadoDe(s: ServicioSer): { fecha: string; usuario: string | null } {
  const e = s.envios[0];
  return e ? { fecha: e.created_at, usuario: e.usuario_crea } : { fecha: s.creado_en, usuario: s.creado_por };
}
// Guía de ingreso (llegada): la del envío, o la cargada en la OC en Compras.
function guiaLlegadaDe(s: ServicioSer): string | null {
  const e = [...s.envios].reverse().find((x) => x.guia_llegada);
  return e?.guia_llegada ?? s.oc_docs?.nro_guia ?? null;
}
function diasAfuera(s: ServicioSer, hoy: Date): number | null {
  const u = ultimoEnvio(s);
  if (!u || u.fecha_llegada || u.fecha_devolucion) return null;
  const f = dateOnlyLocal(u.fecha_salida);
  if (!f) return null;
  return Math.max(0, Math.round((hoy.getTime() - f.getTime()) / 86400000));
}

// ── Vista por guía ───────────────────────────────────────────────────
// Un grupo = un envío individual o un envío conjunto (lote_id). Incluye los
// envíos históricos: un servicio devuelto y reenviado aparece en la guía
// original (Devuelto) y en la nueva.
interface GuiaMiembro { ser: ServicioSer; envio: Envio; estado: ServicioEstado }
interface Guia {
  key: string;
  guia_salida: string | null;
  fecha_salida: string;
  proveedor: string | null;
  proveedor_id: number | null;
  miembros: GuiaMiembro[];
}
const ORDEN_ESTADO: ServicioEstado[] = ["EN_COTIZACION", "EN_TRABAJO", "RECIBIDO", "DEVUELTO"];

function armarGuias(rows: ServicioSer[]): Guia[] {
  const map = new Map<string, Guia>();
  for (const ser of rows) {
    for (const envio of ser.envios) {
      const key = envio.lote_id ?? `e${envio.id}`;
      let g = map.get(key);
      if (!g) {
        g = {
          key, guia_salida: envio.guia_salida, fecha_salida: envio.fecha_salida,
          proveedor: envio.proveedor?.razon_social ?? null, proveedor_id: envio.proveedor_id, miembros: [],
        };
        map.set(key, g);
      }
      g.miembros.push({ ser, envio, estado: estadoDeEnvio(envio) });
    }
  }
  for (const g of map.values()) g.miembros.sort((a, b) => a.envio.id - b.envio.id);
  return [...map.values()].sort((a, b) => b.fecha_salida.localeCompare(a.fecha_salida) || b.key.localeCompare(a.key));
}

// Enlaces a la OT (externa o interna) y a la OC del servicio.
function OtLink({ ser }: { ser: ServicioSer }) {
  const href = ser.ot_id != null ? `/ordenes-trabajo/${ser.ot_id}`
    : ser.orden_trabajo_interna_id != null ? `/ordenes-trabajo-internas/${ser.orden_trabajo_interna_id}` : null;
  const label = `OT ${ser.ot_codigo ?? "—"}`;
  return href ? <Link href={href} style={{ fontSize: 12, fontWeight: 600 }}>{label}</Link> : <Text style={{ fontSize: 12 }}>{label}</Text>;
}
function OcLink({ ser }: { ser: ServicioSer }) {
  if (ser.po_id == null) return <Text type="secondary" style={{ fontSize: 11 }}>sin OC</Text>;
  return <Link href={`/compras/${ser.po_id}/editar`} style={{ fontSize: 12 }}>OC {ser.nro_oc ?? ser.oc_docs?.numero_po ?? ser.po_id}</Link>;
}

/** Guía abierta = algún servicio sigue en cotización o en trabajo. */
const guiaAbierta = (g: Guia) => g.miembros.some((m) => m.estado === "EN_COTIZACION" || m.estado === "EN_TRABAJO");

/** ¿Se le puede registrar la llegada? Incompleto, o con OC sin seguimiento (la OC ya es la cotización aceptada). */
const admiteLlegada = (s: ServicioSer) => s.estado === "EN_TRABAJO" || puedeLlegadaDirecta(s.estado, s.po_id);

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
  // Se guarda el id (no el objeto) para que el drawer se refresque con los
  // datos nuevos después de cada acción.
  const [selId, setSelId] = useState<number | null>(null);
  const sel = useMemo(() => rows.find((r) => r.id === selId) ?? null, [rows, selId]);
  const [vista, setVista] = useState<"guias" | "servicios">("guias");
  const [soloAbiertas, setSoloAbiertas] = useState(true);
  // Vista por servicio: selección múltiple para "Registrar llegada (N)".
  const [selIds, setSelIds] = useState<number[]>([]);
  const [llegadaSers, setLlegadaSers] = useState<ServicioSer[] | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (Array.isArray(d?.user?.roles)) setRoles(d.user.roles); })
      .catch(() => { /* noop */ });
  }, []);
  // Logística/admin registran cotización, llegada y PDFs desde acá.
  const puedeOperar = roles.includes("admin") || puedeEscribirApi(roles, "/api/servicios-externos/envios", "POST");
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
        // Guías/cotización/factura de TODOS los envíos (no solo el último).
        const hay = [r.ot_codigo, r.cliente, r.nro_req, r.descripcion, r.nro_oc, r.oc_docs?.numero_po, r.oc_docs?.nro_factura,
          ...r.envios.flatMap((e) => [e.guia_salida, e.guia_llegada, e.guia_devolucion, e.nro_cotizacion, e.nro_factura, e.proveedor?.razon_social])]
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

  // Seleccionados que admiten llegada (con los datos frescos de `rows`): si
  // tras recargar alguno dejó de aplicar, se descarta solo.
  const seleccionados = useMemo(
    () => rows.filter((r) => selIds.includes(r.id) && admiteLlegada(r)),
    [rows, selIds],
  );

  const guias = useMemo(() => {
    const t = q.trim().toLowerCase();
    return armarGuias(rows).filter((g) => {
      if (soloAbiertas && !guiaAbierta(g)) return false;
      if (proveedorId != null && g.proveedor_id !== proveedorId) return false;
      if (estados.length && !g.miembros.some((m) => estados.includes(m.estado))) return false;
      if (t) {
        const hay = [g.guia_salida, g.proveedor, ...g.miembros.flatMap((m) => [
          m.ser.ot_codigo, m.ser.cliente, m.ser.nro_req, m.ser.descripcion, m.ser.nro_oc, m.ser.oc_docs?.numero_po,
          m.envio.guia_salida, m.envio.guia_llegada, m.envio.guia_devolucion, m.envio.nro_cotizacion, m.envio.nro_factura,
        ])].some((v) => (v ?? "").toString().toLowerCase().includes(t));
        if (!hay) return false;
      }
      return true;
    });
  }, [rows, q, proveedorId, estados, soloAbiertas]);

  const columnsGuiasBase: ColumnsType<Guia> = [
    {
      title: "Guía de salida", key: "guia", width: 150,
      render: (_, g) => (
        <div style={{ lineHeight: 1.3 }}>
          <Text strong style={{ fontSize: 12 }}>{g.guia_salida ?? "Sin N° de guía"}</Text>
          <div><Text type="secondary" style={{ fontSize: 11 }}>{formatDateOnly(g.fecha_salida)}</Text></div>
          {g.miembros.length > 1 && <Tag style={{ margin: 0, fontSize: 10 }}>Conjunto ({g.miembros.length})</Tag>}
        </div>
      ),
    },
    { title: "Proveedor", key: "prov", width: 180, ellipsis: true, render: (_, g) => g.proveedor ?? <Text type="secondary">—</Text> },
    {
      title: "Servicios (estado · OT · servicio · OC)", key: "servicios",
      render: (_, g) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {g.miembros.map((m) => (
            <div key={m.envio.id} style={{ display: "grid", gridTemplateColumns: "96px 110px 1fr 110px", alignItems: "center", gap: space.xs, fontSize: 12 }}>
              <Tag color={SERVICIO_ESTADO_COLORS[m.estado]} style={{ margin: 0, fontSize: 10, textAlign: "center" }}>{SERVICIO_ESTADO_LABELS[m.estado]}</Tag>
              <OtLink ser={m.ser} />
              <Text style={{ fontSize: 12 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>{m.ser.nro_req ?? "—"}/{m.ser.item_req ?? "—"} · </Text>
                {m.ser.descripcion ?? "—"}
              </Text>
              <OcLink ser={m.ser} />
            </div>
          ))}
        </div>
      ),
    },
    {
      title: "Creado", key: "creado", width: 130,
      sorter: (a, b) => (a.miembros[0]?.envio.created_at ?? "").localeCompare(b.miembros[0]?.envio.created_at ?? ""),
      render: (_, g) => <CreadoCell fecha={g.miembros[0]?.envio.created_at} usuario={g.miembros[0]?.envio.usuario_crea} />,
    },
    {
      title: "Resumen", key: "resumen", width: 170,
      render: (_, g) => {
        const c = new Map<ServicioEstado, number>();
        for (const m of g.miembros) c.set(m.estado, (c.get(m.estado) ?? 0) + 1);
        const f = dateOnlyLocal(g.fecha_salida);
        const dias = guiaAbierta(g) && f ? Math.max(0, Math.round((hoy.getTime() - f.getTime()) / 86400000)) : null;
        return (
          <Space orientation="vertical" size={2}>
            {ORDEN_ESTADO.filter((e) => c.has(e)).map((e) => (
              <Text key={e} style={{ fontSize: 11 }}>{c.get(e)} {SERVICIO_ESTADO_LABELS[e].toLowerCase()}</Text>
            ))}
            {dias != null && <Text type="secondary" style={{ fontSize: 10 }}>{dias} día(s) afuera</Text>}
          </Space>
        );
      },
    },
    {
      title: "", key: "acc", width: 100, fixed: "right",
      render: (_, g) => {
        // Abre el seguimiento de un servicio de la guía con algo pendiente
        // (en cotización, luego incompleto); las acciones del envío conjunto
        // están en cualquiera de ellos. Si no, el primero (solo historial).
        const m = g.miembros.find((x) => x.estado === "EN_COTIZACION")
          ?? g.miembros.find((x) => x.estado === "EN_TRABAJO")
          ?? g.miembros[0];
        return (
          <Button size="small" type={puedeOperar && guiaAbierta(g) ? "primary" : "default"} onClick={() => setSelId(m.ser.id)}>
            {puedeOperar && guiaAbierta(g) ? "Gestionar" : "Ver"}
          </Button>
        );
      },
    },
  ];

  const columnsBase: ColumnsType<ServicioSer> = [
    {
      title: "OT", key: "ot", width: 110, fixed: screens.md ? "left" : undefined,
      render: (_, r) => (
        <div style={{ lineHeight: 1.2 }}>
          <OtLink ser={r} />
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
      title: "Guía de ingreso", key: "guia_ing", width: 130,
      render: (_, r) => { const g = guiaLlegadaDe(r); return g ? <Text style={{ fontSize: 11 }}>{g}</Text> : <Text type="secondary">—</Text>; },
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
      title: "Creado", key: "creado", width: 130,
      sorter: (a, b) => creadoDe(a).fecha.localeCompare(creadoDe(b).fecha),
      render: (_, r) => { const c = creadoDe(r); return <CreadoCell fecha={c.fecha} usuario={c.usuario} />; },
    },
    {
      title: "OC", key: "oc", width: 110,
      render: (_, r) => <OcLink ser={r} />,
    },
    {
      title: "Factura", key: "fac", width: 110,
      render: (_, r) => r.oc_docs?.nro_factura ?? envioAceptado(r)?.nro_factura ?? <Text type="secondary">—</Text>,
    },
    {
      title: "", key: "ver", width: 90, fixed: "right",
      render: (_, r) => <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setSelId(r.id)}>{puedeOperar ? "Gestionar" : "Ver"}</Button>,
    },
  ];

  // Anchos ajustables arrastrando el borde de la cabecera (doble clic = restablecer).
  const { columnas: columnsGuias, components: componentsGuias } =
    useColumnasRedimensionables<Guia>(columnsGuiasBase, "servicios-externos-guias-cols-v1");
  const { columnas: columns, components: componentsServ } =
    useColumnasRedimensionables<ServicioSer>(columnsBase, "servicios-externos-servicios-cols-v1");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.lg }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: space.sm }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>Servicios externos</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Seguimiento de servicios tercerizados (cromado, NDT, rectificado…) por guía: qué servicios aceptó el proveedor, cuáles devolvió y cuáles ya llegaron.
            Un servicio aparece acá cuando se le genera el seguimiento (salida) o la OC desde Requerimientos.
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
              { key: "guia_llegada", label: "Guía llegada", value: (r) => guiaLlegadaDe(r) ?? "" },
              { key: "oc", label: "OC", value: (r) => r.nro_oc ?? "" },
              { key: "factura", label: "Factura", value: (r) => r.oc_docs?.nro_factura ?? envioAceptado(r)?.nro_factura ?? "" },
              { key: "docs", label: "Documentación", value: (r) => (r.docs_completa ? "Completa" : "Incompleta") },
              { key: "docs_faltan", label: "Docs faltantes", value: (r) => r.docs.filter((d) => d.estado === "falta").map((d) => d.label).join(", ") },
              { key: "creado_en", label: "Creado", value: (r) => fechaHoraLima(creadoDe(r).fecha) },
              { key: "creado_por", label: "Creado por", value: (r) => creadoDe(r).usuario ?? "" },
              { key: "dias", label: "Días afuera", value: (r) => diasAfuera(r, hoy) },
            ]}
          />
        </Space>
      </div>

      <Row gutter={[space.sm, space.sm]}>
        {ESTADOS_VISIBLES.map((e) => (
          <Col key={e} xs={12} sm={6} md={6}>
            <Card size="small" hoverable onClick={() => setEstados((prev) => prev.length === 1 && prev[0] === e ? [] : [e])}
              style={{ borderColor: estados.length === 1 && estados[0] === e ? brand.cyan : undefined }}>
              <Statistic title={<Text style={{ fontSize: 11 }}>{SERVICIO_ESTADO_LABELS[e]}</Text>} value={conteo[e] ?? 0} styles={{ content: { fontSize: 20 } }} />
            </Card>
          </Col>
        ))}
      </Row>

      <Space wrap>
        <Input.Search allowClear placeholder="OC, OT, guía de salida/llegada, descripción, cliente, cotización…" style={{ width: screens.md ? 420 : "100%" }} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <Select mode="multiple" allowClear placeholder="Estado" style={{ minWidth: 200 }} value={estados} onChange={(v) => { setEstados(v); setPage(1); }}
          options={ESTADOS_VISIBLES.map((e) => ({ value: e, label: SERVICIO_ESTADO_LABELS[e] }))} />
        <Select allowClear showSearch optionFilterProp="label" placeholder="Proveedor" style={{ minWidth: 220 }} value={proveedorId ?? undefined} onChange={(v) => { setProveedorId(v ?? null); setPage(1); }} options={proveedores} />
        {vista === "servicios" ? (
          <Select style={{ minWidth: 190 }} value={soloDocsIncompleta ? "falta" : "todas"} onChange={(v) => { setSoloDocsIncompleta(v === "falta"); setPage(1); }}
            options={[{ value: "todas", label: "Toda la documentación" }, { value: "falta", label: "Solo documentación incompleta" }]} />
        ) : (
          <Select style={{ minWidth: 190 }} value={soloAbiertas ? "abiertas" : "todas"} onChange={(v) => { setSoloAbiertas(v === "abiertas"); setPage(1); }}
            options={[{ value: "abiertas", label: "Guías abiertas (en cotización / incompletas)" }, { value: "todas", label: "Todas las guías" }]} />
        )}
      </Space>

      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: space.sm }}>
        <Segmented
          value={vista}
          onChange={(v) => { setVista(v as "guias" | "servicios"); setPage(1); setSelIds([]); }}
          options={[{ value: "guias", label: "Por guía" }, { value: "servicios", label: "Por servicio" }]}
        />
        {vista === "servicios" && puedeOperar && (
          seleccionados.length > 0 ? (
            <Tooltip title={`Registra la llegada (recepción) de ${seleccionados.length} servicio(s) con la misma guía, aunque hayan salido en guías distintas; quedan Completos.`}>
              <Button type="primary" icon={<InboxOutlined />} onClick={() => setLlegadaSers(seleccionados)}>
                Registrar llegada ({seleccionados.length})
              </Button>
            </Tooltip>
          ) : (
            <Text type="secondary" style={{ fontSize: 11 }}>
              Seleccioná servicios Incompletos para registrar su llegada en conjunto.
            </Text>
          )
        )}
      </div>

      {vista === "guias" ? (
        <Table<Guia>
          rowKey="key"
          size="small"
          loading={loading}
          dataSource={guias}
          columns={columnsGuias}
          components={componentsGuias}
          scroll={{ x: 1130 }}
          pagination={paginacionEstandar({ current: page, pageSize, total: guias.length, onChange: (p, s) => { setPage(p); setPageSize(s); }, label: "guías" })}
        />
      ) : (
        <Table<ServicioSer>
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={filtradas}
          columns={columns}
          components={componentsServ}
          rowSelection={puedeOperar ? {
            selectedRowKeys: selIds,
            onChange: (keys) => setSelIds(keys.map(Number)),
            preserveSelectedRowKeys: true,
            getCheckboxProps: (r) => ({ disabled: !admiteLlegada(r) }),
          } : undefined}
          scroll={{ x: 1960 }}
          pagination={paginacionEstandar({ current: page, pageSize, total: filtradas.length, onChange: (p, s) => { setPage(p); setPageSize(s); }, label: "servicios" })}
        />
      )}

      <ServicioSeguimientoDrawer
        ser={sel}
        open={sel != null}
        onClose={() => setSelId(null)}
        puedeOperar={puedeOperar}
        onChanged={load}
      />
      <ServicioLlegadaModal
        open={llegadaSers != null}
        sers={llegadaSers ?? []}
        onClose={() => setLlegadaSers(null)}
        onDone={async () => { setLlegadaSers(null); setSelIds([]); await load(); }}
      />
    </div>
  );
}
