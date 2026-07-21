"use client";

// Portal de clientes — fase 1: listado de las OTs publicadas de la empresa
// con su línea de tiempo de hitos (Recibido → En evaluación → En reparación
// → Listo → Entregado). Solo timeline: sin costos, sin comentarios internos.

import { useEffect, useMemo, useState } from "react";
import { Card, Empty, Input, Space, Spin, Steps, Tag, Typography, Alert, Segmented } from "antd";
import { SearchOutlined, CheckCircleOutlined, ToolOutlined } from "@ant-design/icons";
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
  etapaActual: number;
  estadoLabel: string;
  entregada: boolean;
  fecha_recepcion: string | null;
  fecha_evaluacion: string | null;
  fecha_entrega: string | null;
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
        [String(o.ot ?? ""), o.descripcion, o.np, o.equipo, o.flota]
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
                    </Text>
                  </div>
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
