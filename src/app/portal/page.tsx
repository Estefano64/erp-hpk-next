"use client";

// Portal de clientes — fase 1: listado de las OTs publicadas de la empresa
// con su línea de tiempo de hitos (Recibido → En evaluación → En reparación
// → Listo → Entregado). Solo timeline: sin costos, sin comentarios internos.

import { useEffect, useMemo, useState } from "react";
import { Card, Empty, Input, Space, Spin, Steps, Tag, Typography, Alert, Segmented, Button, Descriptions } from "antd";
import { SearchOutlined, CheckCircleOutlined, ToolOutlined, DownOutlined, UpOutlined } from "@ant-design/icons";
import { brand } from "@/lib/theme";
import { useResponsive } from "@/lib/responsive";
import { formatDateOnly } from "@/lib/dates";
import { formatOtCodigo } from "@/lib/ot-formato";

const { Title, Text } = Typography;

interface OTPortal {
  id: number;
  ot: number | null;
  tipo_codigo: string | null;
  descripcion: string | null;
  np: string | null;
  equipo: string | null;
  flota: string | null;
  cantidad: number;
  etapaActual: number;
  estadoLabel: string;
  entregada: boolean;
  fecha_recepcion: string | null;
  fecha_evaluacion: string | null;
  fecha_entrega: string | null;
  fecha_requerida: string | null;
  actualizado: string | null;
  dias_taller: number | null;
  dias_en_curso: boolean;
  // Ficha completa (2026-08-24) — datos descriptivos, sin montos.
  estado_taller: string | null;
  prioridad: string | null;
  fabricante: string | null;
  tipo_atencion: string | null;
  tipo_reparacion: string | null;
  garantia: string | null;
  base_metalica: string | null;
  wo_cliente: string | null;
  po_cliente: string | null;
  po_item: string | null;
  id_viajero: string | null;
  guia_remision: string | null;
  nro_cotizacion: string | null;
  fecha_cotizacion: string | null;
  fecha_aprobacion_cotizacion: string | null;
  // Monto cotizado al cliente (es SU precio cotizado, no un costo interno).
  monto_cotizacion: number | null;
  moneda_cotizacion: string | null;
}

// Monto cotizado con símbolo según moneda (SOL/PEN → S/, resto → $).
function fmtMontoCotizacion(monto: number, moneda: string | null): string {
  const simbolo = moneda === "SOL" || moneda === "PEN" ? "S/" : "$";
  return `${simbolo} ${monto.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface Resp {
  cliente: string;
  etapas: string[];
  ots: OTPortal[];
}

export default function PortalPage() {
  const { isMobile } = useResponsive();
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buscar, setBuscar] = useState("");
  const [filtro, setFiltro] = useState<"proceso" | "entregadas" | "todas">("proceso");
  // Fichas expandidas por OT (id). La ficha completa va colapsada por default
  // para mantener las tarjetas compactas.
  const [fichasAbiertas, setFichasAbiertas] = useState<Set<number>>(new Set());
  const toggleFicha = (id: number) => {
    setFichasAbiertas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/portal/ots");
        const j = await r.json().catch(() => null);
        if (!r.ok) { setError(j?.error ?? "No se pudo cargar la información"); return; }
        setData(j);
      } catch {
        setError("No se pudo cargar la información");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const visibles = useMemo(() => {
    let lista = data?.ots ?? [];
    if (filtro === "proceso") lista = lista.filter((o) => !o.entregada);
    if (filtro === "entregadas") lista = lista.filter((o) => o.entregada);
    const q = buscar.trim().toLowerCase();
    if (q) {
      lista = lista.filter((o) =>
        [String(o.ot ?? ""), o.descripcion, o.np, o.equipo, o.flota,
          o.wo_cliente, o.po_cliente, o.guia_remision, o.nro_cotizacion]
          .some((v) => (v ?? "").toLowerCase().includes(q)),
      );
    }
    return lista;
  }, [data?.ots, buscar, filtro]);

  if (loading) return <div style={{ textAlign: "center", padding: 60 }}><Spin size="large" /></div>;
  if (error) return <Alert type="warning" showIcon message={error} style={{ marginTop: 24 }} />;

  return (
    <div>
      <div style={{ margin: "8px 0 16px" }}>
        <Title level={4} style={{ margin: 0, color: brand.navy }}>
          {data?.cliente || "Mis componentes"}
        </Title>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Estado de sus componentes en el taller HP&K. La información se actualiza con el avance real del taller.
        </Text>
      </div>

      <Space direction={isMobile ? "vertical" : "horizontal"} style={{ width: "100%", marginBottom: 14 }} size={10}>
        <Segmented
          value={filtro}
          onChange={(v) => setFiltro(v as typeof filtro)}
          options={[
            { value: "proceso", label: "En proceso" },
            { value: "entregadas", label: "Entregadas" },
            { value: "todas", label: "Todas" },
          ]}
        />
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Buscar por OT, componente, N/P..."
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          style={{ width: isMobile ? "100%" : 300 }}
        />
      </Space>

      {visibles.length === 0 ? (
        <Empty description="No hay componentes para mostrar en esta vista" style={{ marginTop: 48 }} />
      ) : (
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          {visibles.map((o) => {
            const codigo = o.ot != null ? formatOtCodigo(o.ot, o.tipo_codigo, "") : `#${o.id}`;
            const fechas: (string | null)[] = [
              o.fecha_recepcion, o.fecha_evaluacion, null, null, o.fecha_entrega,
            ];
            return (
              <Card key={o.id} size="small" styles={{ body: { padding: 14 } }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                  <div>
                    <Space size={8} wrap>
                      <Text strong style={{ fontSize: 15, color: brand.navy }}>OT {codigo}</Text>
                      {o.entregada
                        ? <Tag color="success" icon={<CheckCircleOutlined />}>Entregado</Tag>
                        : <Tag color="processing" icon={<ToolOutlined />}>{o.estadoLabel}</Tag>}
                    </Space>
                    <div style={{ fontSize: 13 }}>{o.descripcion ?? "—"}</div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {o.np ? `N/P ${o.np}` : ""}{o.flota ? ` · Flota ${o.flota}` : ""}{o.equipo ? ` · Equipo ${o.equipo}` : ""}
                      {o.cantidad > 1 ? ` · Cantidad: ${o.cantidad}` : ""}
                    </Text>
                  </div>
                </div>
                {/* Datos del avance: días en taller, fecha requerida, últ. novedad */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", marginBottom: 10, fontSize: 12, color: brand.textSecondary }}>
                  {o.dias_taller != null && (
                    <span>
                      ⏱ {o.dias_en_curso
                        ? <>Lleva <b>{o.dias_taller}</b> día{o.dias_taller === 1 ? "" : "s"} en taller</>
                        : <>Tiempo total en taller: <b>{o.dias_taller}</b> día{o.dias_taller === 1 ? "" : "s"}</>}
                    </span>
                  )}
                  {o.fecha_requerida && <span>📅 Fecha requerida: <b>{formatDateOnly(o.fecha_requerida)}</b></span>}
                  {o.actualizado && !o.entregada && <span>🔄 Última novedad: {formatDateOnly(o.actualizado)}</span>}
                </div>
                <Steps
                  size="small"
                  direction={isMobile ? "vertical" : "horizontal"}
                  current={o.etapaActual}
                  status={o.entregada ? "finish" : "process"}
                  items={(data?.etapas ?? []).map((etapa, i) => ({
                    title: <span style={{ fontSize: 12 }}>{etapa}</span>,
                    description: fechas[i]
                      ? <span style={{ fontSize: 11 }}>{formatDateOnly(fechas[i])}</span>
                      : undefined,
                  }))}
                />
                {/* Ficha completa (2026-08-24): datos descriptivos de la OT —
                    documentos del cliente, cotización, catálogos. Sin montos. */}
                <div style={{ marginTop: 8 }}>
                  <Button
                    type="link"
                    size="small"
                    style={{ paddingLeft: 0, fontSize: 12 }}
                    icon={fichasAbiertas.has(o.id) ? <UpOutlined /> : <DownOutlined />}
                    onClick={() => toggleFicha(o.id)}
                  >
                    {fichasAbiertas.has(o.id) ? "Ocultar ficha" : "Ver ficha completa"}
                  </Button>
                  {fichasAbiertas.has(o.id) && (
                    <Descriptions
                      size="small"
                      bordered
                      column={isMobile ? 1 : 3}
                      style={{ marginTop: 6 }}
                      styles={{ label: { fontSize: 11, width: 130 }, content: { fontSize: 12 } }}
                      items={[
                        { key: "ot", label: "N° OT", children: codigo },
                        { key: "cliente", label: "Cliente", children: data?.cliente || "—" },
                        { key: "desc", label: "Descripción", children: o.descripcion ?? "—" },
                        { key: "estado_taller", label: "Estado taller", children: o.estado_taller ?? "—" },
                        { key: "prioridad", label: "Prioridad", children: o.prioridad ?? "—" },
                        { key: "fecha_req", label: "F. requerimiento cliente", children: o.fecha_requerida ? formatDateOnly(o.fecha_requerida) : "—" },
                        { key: "fabricante", label: "Fabricante", children: o.fabricante ?? "—" },
                        { key: "flota", label: "Flota equipo", children: o.flota ?? "—" },
                        { key: "fecha_recepcion", label: "F. recepción", children: o.fecha_recepcion ? formatDateOnly(o.fecha_recepcion) : "—" },
                        { key: "wo", label: "WO cliente", children: o.wo_cliente ?? "—" },
                        { key: "po", label: "PO cliente", children: o.po_cliente ?? "—" },
                        { key: "po_item", label: "PO item", children: o.po_item ?? "—" },
                        { key: "viajero", label: "ID viajero", children: o.id_viajero ?? "—" },
                        { key: "guia", label: "Guía remisión", children: o.guia_remision ?? "—" },
                        { key: "cotizacion", label: "Cotización", children: o.nro_cotizacion ?? "—" },
                        { key: "monto_cot", label: "Monto cotizado", children: o.monto_cotizacion != null ? fmtMontoCotizacion(o.monto_cotizacion, o.moneda_cotizacion) : "—" },
                        { key: "f_cot", label: "F. envío cotización", children: o.fecha_cotizacion ? formatDateOnly(o.fecha_cotizacion) : "—" },
                        { key: "f_aprob_cot", label: "F. aprobación cotización", children: o.fecha_aprobacion_cotizacion ? formatDateOnly(o.fecha_aprobacion_cotizacion) : "—" },
                        { key: "tipo_atencion", label: "Tipo atención", children: o.tipo_atencion ?? "—" },
                        { key: "tipo_rep", label: "Tipo reparación", children: o.tipo_reparacion ?? "—" },
                        { key: "garantia", label: "Garantía", children: o.garantia ?? "—" },
                        { key: "base", label: "Base metálica", children: o.base_metalica ?? "—" },
                      ]}
                    />
                  )}
                </div>
              </Card>
            );
          })}
        </Space>
      )}

      <div style={{ textAlign: "center", marginTop: 28, marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 11 }}>
          ¿Consultas sobre un componente? Contacte a su representante HP&K.
        </Text>
      </div>
    </div>
  );
}
