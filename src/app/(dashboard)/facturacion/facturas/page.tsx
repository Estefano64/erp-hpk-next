"use client";

// /facturacion/facturas — consulta de lo YA facturado (pedido 2026-08-28).
//
// Solo lectura: la cola de trabajo (pendientes de facturar) vive en
// /facturacion/ot; acá se consulta el histórico con filtros por fecha de
// FACTURACIÓN (años/meses multi + rango de fechas) y export a Excel.
// Reusa GET /api/facturacion/ot con estado=facturadas&por=facturacion.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Typography, Card, Table, Tag, Space, Button, Row, Col, Statistic, Empty,
  App, Tooltip, Select, DatePicker,
} from "antd";
import {
  FileDoneOutlined, ReloadOutlined, EyeOutlined, DownloadOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import { brand } from "@/lib/theme";
import { formatDateOnly, dateOnlyLocal } from "@/lib/dates";
import { useColumnasRedimensionables, STICKY_HEADER, paginacionEstandar } from "@/lib/tables";
import { openR2File } from "@/lib/r2-client";
import { ExportarExcelButton } from "@/components/ExportarExcelButton";

const { Title, Text } = Typography;

interface FacturaRow {
  id: number;
  ot: string | null;
  cliente: string | null;
  codigo_reparacion: string | null;
  ns: string | null;
  wo_cliente: string | null;
  po_cliente: string | null;
  guia_entrega_salida: string | null;
  fecha_despacho: string | null;
  fecha_facturacion: string | null;
  nro_factura: string | null;
  // Número leído del nombre del PDF — fallback visual cuando nadie registró
  // el nro_factura en la OT (el circuito histórico solo subía el PDF).
  nro_factura_pdf: string | null;
  monto_cotizacion: number | string | null;
  pdfs: { facturacion: Array<{ id: number; r2_key: string; nombre_archivo: string }> };
}

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
].map((label, i) => ({ value: i + 1, label }));

export default function FacturasPage() {
  const { message: msg } = App.useApp();
  const router = useRouter();
  const [data, setData] = useState<FacturaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [filtroAnios, setFiltroAnios] = useState<number[]>([]);
  const [filtroMeses, setFiltroMeses] = useState<number[]>([]);
  const [filtroRango, setFiltroRango] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [aniosDisponibles, setAniosDisponibles] = useState<Array<{ anio: number; n: number }>>([]);
  const [aniosHidratado, setAniosHidratado] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("estado", "facturadas");
      // Filtros y orden por fecha de FACTURACIÓN (no de despacho).
      params.set("por", "facturacion");
      if (filtroAnios.length > 0) params.set("anios", filtroAnios.join(","));
      if (filtroMeses.length > 0) params.set("meses", filtroMeses.join(","));
      if (filtroRango?.[0]) params.set("desde", filtroRango[0].format("YYYY-MM-DD"));
      if (filtroRango?.[1]) params.set("hasta", filtroRango[1].format("YYYY-MM-DD"));
      const res = await fetch(`/api/facturacion/ot?${params}`);
      const json = await res.json();
      setData(json.data ?? []);
      const anios = (json.anios_disponibles ?? []) as Array<{ anio: number; n: number }>;
      setAniosDisponibles(anios);
      // Primera carga: preseleccionar el año más reciente para no traer todo
      // el histórico de una.
      if (!aniosHidratado) {
        setAniosHidratado(true);
        if (anios.length > 0) setFiltroAnios([anios[0].anio]);
      }
    } catch {
      msg.error("Error al cargar facturas");
    } finally {
      setLoading(false);
    }
  }, [msg, filtroAnios, filtroMeses, filtroRango, aniosHidratado]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const montoTotal = useMemo(
    () => data.reduce((s, r) => s + (r.monto_cotizacion != null ? Number(r.monto_cotizacion) : 0), 0),
    [data],
  );

  const columns: ColumnsType<FacturaRow> = useMemo(() => [
    {
      key: "ot", title: "OT", width: 110,
      render: (_v, r) => (
        <Tag color={brand.navy} style={{ cursor: "pointer", margin: 0 }} onClick={() => router.push(`/ordenes-trabajo/${r.id}`)}>
          {r.ot ?? `#${r.id}`}
        </Tag>
      ),
    },
    {
      key: "cliente", title: "Cliente", width: 170, ellipsis: true,
      render: (_v, r) => r.cliente ?? "—",
    },
    {
      key: "codrep", title: "Código reparable", ellipsis: true,
      render: (_v, r) => r.codigo_reparacion ?? <Text type="secondary">—</Text>,
    },
    {
      key: "ns", title: "N° Serie", width: 110,
      render: (_v, r) => r.ns ?? <Text type="secondary">—</Text>,
    },
    {
      key: "guia", title: "Guía", width: 130,
      render: (_v, r) => r.guia_entrega_salida
        ? <Tag color="blue" style={{ margin: 0 }}>{r.guia_entrega_salida}</Tag>
        : <Text type="secondary">—</Text>,
    },
    {
      key: "fecha_despacho", title: "F. Despacho", width: 110, align: "center",
      sorter: (a, b) => (a.fecha_despacho ?? "").localeCompare(b.fecha_despacho ?? ""),
      render: (_v, r) => r.fecha_despacho ? formatDateOnly(r.fecha_despacho) : <Text type="secondary">—</Text>,
    },
    {
      key: "nro_factura", title: "N° Factura", width: 160,
      render: (_v, r) => {
        // Registrado en la OT; si no está, mostramos el detectado en el nombre
        // del PDF (el circuito histórico solo subía el archivo).
        const nro = r.nro_factura ?? r.nro_factura_pdf;
        if (!nro) return <Text type="secondary">—</Text>;
        return (
          <Tooltip title={r.nro_factura ? "Número registrado en la OT" : "Número leído del nombre del PDF (no registrado en la OT)"}>
            <Tag color={r.nro_factura ? "green" : "default"} style={{ margin: 0 }}>{nro}</Tag>
          </Tooltip>
        );
      },
    },
    {
      key: "fecha_facturacion", title: "F. Facturación", width: 120, align: "center",
      defaultSortOrder: "descend",
      sorter: (a, b) => (a.fecha_facturacion ?? "").localeCompare(b.fecha_facturacion ?? ""),
      render: (_v, r) => r.fecha_facturacion ? formatDateOnly(r.fecha_facturacion) : <Text type="secondary">—</Text>,
    },
    {
      key: "monto", title: "Monto", width: 120, align: "right",
      sorter: (a, b) => Number(a.monto_cotizacion ?? 0) - Number(b.monto_cotizacion ?? 0),
      render: (_v, r) => r.monto_cotizacion != null
        ? <Text strong style={{ color: brand.navy }}>{Number(r.monto_cotizacion).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      key: "pdf", title: "PDF", width: 90, align: "center",
      render: (_v, r) => {
        const archivos = r.pdfs?.facturacion ?? [];
        if (archivos.length === 0) return <Text type="secondary">—</Text>;
        const primero = archivos[0];
        return (
          <Tooltip title={`Descargar: ${primero.nombre_archivo}${archivos.length > 1 ? ` (+${archivos.length - 1} más)` : ""}`}>
            <Button
              size="small"
              icon={<DownloadOutlined />}
              onClick={() => openR2File({ key: primero.r2_key, resource: "ot-adjunto", resourceId: primero.id })
                .catch((e) => msg.error(e instanceof Error ? e.message : "Error al abrir"))}
            />
          </Tooltip>
        );
      },
    },
    {
      key: "acc", title: "", width: 60, fixed: "right", align: "center",
      render: (_v, r) => (
        <Tooltip title="Ver OT">
          <Button size="small" icon={<EyeOutlined />} onClick={() => router.push(`/ordenes-trabajo/${r.id}`)} />
        </Tooltip>
      ),
    },
  ], [router, msg]);

  const { columnas, components, TableDragWrapper } = useColumnasRedimensionables<FacturaRow>(
    columns, "facturacion-facturas-v1",
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
        <Title level={3} style={{ margin: 0 }}>
          <FileDoneOutlined style={{ marginRight: 8 }} />
          Facturas
        </Title>
        <Space wrap>
          <Select
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Año(s)"
            value={filtroAnios}
            onChange={(v) => setFiltroAnios(v)}
            options={aniosDisponibles.map((a) => ({ value: a.anio, label: `${a.anio} (${a.n})` }))}
            style={{ minWidth: 150, maxWidth: 260 }}
            maxTagCount="responsive"
          />
          <Select
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Mes(es)"
            value={filtroMeses}
            onChange={(v) => setFiltroMeses(v)}
            options={MESES}
            style={{ minWidth: 140, maxWidth: 260 }}
            maxTagCount="responsive"
          />
          {/* Rango por fecha de FACTURACIÓN — se combina (Y) con año/mes. */}
          <DatePicker.RangePicker
            value={filtroRango}
            onChange={(v) => setFiltroRango(v)}
            format="DD/MM/YYYY"
            allowClear
            placeholder={["Fact. desde", "Fact. hasta"]}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>Actualizar</Button>
          <ExportarExcelButton<FacturaRow>
            endpoint="/api/facturacion/ot"
            filename="Facturas"
            currentRows={data}
            columns={[
              { key: "ot", label: "OT", value: (r) => r.ot ?? `#${r.id}` },
              { key: "cliente", label: "Cliente", value: (r) => r.cliente ?? "" },
              { key: "codrep", label: "Código reparable", value: (r) => r.codigo_reparacion ?? "" },
              { key: "ns", label: "N° Serie", value: (r) => r.ns ?? "" },
              { key: "wo", label: "WO Cliente", value: (r) => r.wo_cliente ?? "" },
              { key: "po", label: "PO Cliente", value: (r) => r.po_cliente ?? "" },
              { key: "guia", label: "Guía", value: (r) => r.guia_entrega_salida ?? "" },
              { key: "fecha_despacho", label: "F. Despacho", value: (r) => dateOnlyLocal(r.fecha_despacho) },
              { key: "nro_factura", label: "N° Factura", value: (r) => r.nro_factura ?? r.nro_factura_pdf ?? "" },
              { key: "fecha_facturacion", label: "F. Facturación", value: (r) => dateOnlyLocal(r.fecha_facturacion) },
              { key: "monto", label: "Monto", value: (r) => r.monto_cotizacion != null ? Number(r.monto_cotizacion) : "", z: "#,##0.00" },
              { key: "pdf", label: "PDF factura", value: (r) => ((r.pdfs?.facturacion?.length ?? 0) > 0 ? "Sí" : "No") },
            ]}
          />
        </Space>
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} md={6}>
          <Card styles={{ body: { padding: 12 } }}>
            <Statistic title="Facturas en el período" value={data.length} styles={{ content: { color: brand.navy } }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card styles={{ body: { padding: 12 } }}>
            <Statistic
              title="Monto total (según cotización)"
              value={montoTotal}
              precision={2}
              styles={{ content: { color: "#52c41a" } }}
            />
          </Card>
        </Col>
      </Row>

      {data.length === 0 && !loading ? (
        <Empty description="No hay facturas en el período seleccionado." />
      ) : (
        <TableDragWrapper>
          <Table<FacturaRow>
            rowKey="id"
            size="small"
            columns={columnas}
            components={components}
            dataSource={data}
            loading={loading}
            pagination={paginacionEstandar({
              current: page,
              pageSize,
              total: data.length,
              onChange: (p, s) => { setPage(p); setPageSize(s); },
              label: "factura(s)",
            })}
            scroll={{ x: 1400 }}
            sticky={STICKY_HEADER}
          />
        </TableDragWrapper>
      )}
    </div>
  );
}
