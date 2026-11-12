"use client";

// Dashboard "Pendientes" (pedido 2026-11-10): todo lo que está esperando
// acción, en números y con antigüedad, con enlace a la pantalla donde se
// resuelve. Datos de /api/dashboard/pendientes.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, Col, Empty, Row, Spin, Statistic, Table, Tag, Tooltip, Typography } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { brand, space } from "@/lib/theme";

const { Title, Text } = Typography;

interface Tope { id: number; titulo: string; detalle: string | null; dias: number; href: string }
interface Bloque { total: number; edad: number[]; href: string; top?: Tope[]; atrasadas?: number }
interface Datos {
  generado: string;
  requerimientos: { sinAprobar: Bloque; observados: Bloque; listosParaOC: Bloque };
  ocs: { porAprobar: Bloque; sinRecibir: Bloque };
  servicios: { PENDIENTE_ENVIO: number; EN_COTIZACION: number; EN_TRABAJO: number; incompletosEdad: number[]; top: Tope[]; href: string };
  ots: { total: number; edad: number[]; porEstado: { estado: string; n: number }[]; top: Tope[]; href: string };
  porFacturar?: Bloque;
  otsInternas?: {
    total: number; edad: number[]; top: Tope[]; href: string;
    porUsuario: { usuario: string; n: number; edad: number[]; maxDias: number }[];
  };
}

const TRAMOS = ["0-3 d", "4-7 d", "8-15 d", "+15 d"];
// Semáforo por tramo de antigüedad (tokens del tema, sin hex).
const COLOR_TRAMO = ["default", "gold", "orange", "red"] as const;

function Edad({ edad }: { edad: number[] }) {
  return (
    <div style={{ display: "flex", gap: space.xs, flexWrap: "wrap", marginTop: space.xs }}>
      {edad.map((n, i) => (
        <Tooltip key={TRAMOS[i]} title={`${n} con ${TRAMOS[i]} de antigüedad`}>
          <Tag color={n > 0 ? COLOR_TRAMO[i] : "default"} style={{ margin: 0, fontSize: 11, opacity: n > 0 ? 1 : 0.5 }}>
            {TRAMOS[i]}: {n}
          </Tag>
        </Tooltip>
      ))}
    </div>
  );
}

function Kpi({ titulo, valor, href, edad, nota, alerta }: {
  titulo: string; valor: number; href: string; edad?: number[]; nota?: string; alerta?: boolean;
}) {
  return (
    <Card size="small" hoverable style={{ height: "100%", borderColor: alerta && valor > 0 ? brand.error : undefined }}>
      <Link href={href} style={{ color: "inherit" }}>
        <Statistic
          title={<Text style={{ fontSize: 12 }}>{titulo}</Text>}
          value={valor}
          styles={{ content: { fontSize: 28, color: alerta && valor > 0 ? brand.error : undefined } }}
        />
        {edad && <Edad edad={edad} />}
        {nota && <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: space.xs }}>{nota}</Text>}
      </Link>
    </Card>
  );
}

function ListaTop({ titulo, filas }: { titulo: string; filas: Tope[] | undefined }) {
  if (!filas || filas.length === 0) return null;
  return (
    <Card size="small" title={<Text strong style={{ fontSize: 13 }}>{titulo}</Text>} style={{ height: "100%" }}>
      <Table<Tope>
        rowKey={(r) => `${r.href}-${r.id}`}
        size="small"
        pagination={false}
        dataSource={filas}
        scroll={{ x: 420 }}
        showHeader={false}
        columns={[
          {
            key: "t",
            render: (_, r) => (
              <div style={{ lineHeight: 1.25 }}>
                <Link href={r.href} style={{ fontSize: 12, fontWeight: 600 }}>{r.titulo}</Link>
                {r.detalle && <div><Text type="secondary" style={{ fontSize: 11 }} ellipsis>{r.detalle}</Text></div>}
              </div>
            ),
          },
          {
            key: "d", width: 80, align: "right",
            render: (_, r) => (
              <Tag color={r.dias > 15 ? "red" : r.dias > 7 ? "orange" : r.dias > 3 ? "gold" : "default"} style={{ margin: 0 }}>
                {r.dias} d
              </Tag>
            ),
          },
        ]}
      />
    </Card>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: space.lg }}>
      <Title level={5} style={{ margin: `0 0 ${space.sm}px` }}>{titulo}</Title>
      {children}
    </div>
  );
}

export default function PendientesDashboard() {
  const [d, setD] = useState<Datos | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/pendientes");
      if (!res.ok) throw new Error("No se pudo cargar");
      setD((await res.json()) as Datos);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!d) return loading ? <Spin /> : <Empty description={error ?? "Sin datos"} />;

  const { requerimientos: rq, ocs, servicios: sv, ots, otsInternas: oti, porFacturar: fact } = d;
  const serTotal = sv.PENDIENTE_ENVIO + sv.EN_COTIZACION + sv.EN_TRABAJO;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: space.sm, marginBottom: space.md }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>Pendientes</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Lo que está esperando acción, con su antigüedad. Clic en una tarjeta para ir a resolverlo.
          </Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>Actualizar</Button>
      </div>

      <Seccion titulo="Requerimientos">
        <Row gutter={[space.md, space.md]}>
          <Col xs={24} md={8}>
            <Kpi titulo="Sin aprobar" valor={rq.sinAprobar.total} href={rq.sinAprobar.href} edad={rq.sinAprobar.edad}
              nota="Enviados a aprobación y sin resolver." />
          </Col>
          <Col xs={24} md={8}>
            <Kpi titulo="Aprobados sin OC" valor={rq.listosParaOC.total} href={rq.listosParaOC.href} edad={rq.listosParaOC.edad}
              nota="Listos para generar OC, nadie los atendió." alerta />
          </Col>
          <Col xs={24} md={8}>
            <Kpi titulo="Observados (devueltos a revisión)" valor={rq.observados.total} href={rq.observados.href} edad={rq.observados.edad}
              nota="Esperan corrección del solicitante." />
          </Col>
          <Col xs={24} md={12}><ListaTop titulo="Aprobados sin OC más antiguos" filas={rq.listosParaOC.top} /></Col>
          <Col xs={24} md={12}><ListaTop titulo="Sin aprobar más antiguos" filas={rq.sinAprobar.top} /></Col>
        </Row>
      </Seccion>

      <Seccion titulo="Órdenes de compra">
        <Row gutter={[space.md, space.md]}>
          <Col xs={24} md={8}>
            <Kpi titulo="OCs por aprobar" valor={ocs.porAprobar.total} href={ocs.porAprobar.href} edad={ocs.porAprobar.edad} />
          </Col>
          <Col xs={24} md={8}>
            <Kpi titulo="OCs sin recibir (en proceso / incompletas)" valor={ocs.sinRecibir.total} href={ocs.sinRecibir.href} edad={ocs.sinRecibir.edad}
              nota="Antigüedad desde la aprobación de la OC." />
          </Col>
          <Col xs={24} md={8}>
            <Kpi titulo="OCs atrasadas" valor={ocs.sinRecibir.atrasadas ?? 0} href={ocs.sinRecibir.href} alerta
              nota="Pasó la fecha de entrega esperada y siguen sin recibirse." />
          </Col>
          <Col xs={24}><ListaTop titulo="OCs sin recibir más antiguas" filas={ocs.sinRecibir.top} /></Col>
        </Row>
      </Seccion>

      <Seccion titulo="Servicios externos">
        <Row gutter={[space.md, space.md]}>
          <Col xs={24} md={6}><Kpi titulo="Total pendientes" valor={serTotal} href={sv.href} /></Col>
          <Col xs={24} md={6}><Kpi titulo="Pendientes de envío" valor={sv.PENDIENTE_ENVIO} href={sv.href} /></Col>
          <Col xs={24} md={6}><Kpi titulo="En cotización" valor={sv.EN_COTIZACION} href={sv.href} /></Col>
          <Col xs={24} md={6}><Kpi titulo="Incompletos (en trabajo)" valor={sv.EN_TRABAJO} href={sv.href} edad={sv.incompletosEdad}
            nota="Días desde que salieron." /></Col>
          <Col xs={24}><ListaTop titulo="Servicios pendientes más antiguos" filas={sv.top} /></Col>
        </Row>
      </Seccion>

      <Seccion titulo="Órdenes de trabajo sin cerrar">
        <Row gutter={[space.md, space.md]}>
          <Col xs={24} md={8}>
            <Kpi titulo="OTs abiertas" valor={ots.total} href={ots.href} edad={ots.edad}
              nota="Antigüedad desde la recepción de la OT." />
          </Col>
          <Col xs={24} md={16}>
            <Card size="small" title={<Text strong style={{ fontSize: 13 }}>Por estado</Text>} style={{ height: "100%" }}>
              <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap" }}>
                {ots.porEstado.map((e) => (
                  <Tag key={e.estado} style={{ margin: 0, fontSize: 12 }}>{e.estado}: <b>{e.n}</b></Tag>
                ))}
              </div>
            </Card>
          </Col>
          <Col xs={24}><ListaTop titulo="OTs abiertas más antiguas" filas={ots.top} /></Col>
        </Row>
      </Seccion>

      {fact && (
        <Seccion titulo="OTs por facturar">
          <Row gutter={[space.md, space.md]}>
            <Col xs={24} md={8}>
              <Kpi titulo="OTs despachadas sin factura" valor={fact.total} href={fact.href} edad={fact.edad} alerta
                nota="Solo OTs 2026 en adelante. Antigüedad desde el despacho. Garantía cuenta solo si tiene monto." />
            </Col>
            <Col xs={24} md={16}><ListaTop titulo="OTs por facturar más antiguas" filas={fact.top} /></Col>
          </Row>
        </Seccion>
      )}

      {oti && (
        <Seccion titulo="OTs internas sin cerrar">
          <Row gutter={[space.md, space.md]}>
            <Col xs={24} md={8}>
              <Kpi titulo="OTs internas abiertas" valor={oti.total} href={oti.href} edad={oti.edad}
                nota="Antigüedad desde la creación. Cada usuario cierra las que creó." />
            </Col>
            <Col xs={24} md={16}>
              <Card size="small" title={<Text strong style={{ fontSize: 13 }}>Por usuario que la creó</Text>} style={{ height: "100%" }}>
                <Table
                  rowKey="usuario"
                  size="small"
                  pagination={false}
                  dataSource={oti.porUsuario}
                  scroll={{ x: 520 }}
                  locale={{ emptyText: "Nadie tiene OTs internas pendientes" }}
                  columns={[
                    { key: "u", title: "Usuario", dataIndex: "usuario", render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text> },
                    { key: "n", title: "Sin cerrar", dataIndex: "n", width: 90, align: "right",
                      render: (v: number) => <Text strong>{v}</Text> },
                    { key: "e", title: "Antigüedad", width: 300, render: (_: unknown, r: { edad: number[] }) => <Edad edad={r.edad} /> },
                    { key: "m", title: "Más antigua", dataIndex: "maxDias", width: 100, align: "right",
                      render: (v: number) => (
                        <Tag color={v > 15 ? "red" : v > 7 ? "orange" : v > 3 ? "gold" : "default"} style={{ margin: 0 }}>{v} d</Tag>
                      ) },
                  ]}
                />
              </Card>
            </Col>
            <Col xs={24}><ListaTop titulo="OTs internas abiertas más antiguas" filas={oti.top} /></Col>
          </Row>
        </Seccion>
      )}

      <Text type="secondary" style={{ fontSize: 11 }}>
        Actualizado {new Date(d.generado).toLocaleString("es-PE", { timeZone: "America/Lima" })}. Los requerimientos en borrador no se cuentan.
      </Text>
    </div>
  );
}
