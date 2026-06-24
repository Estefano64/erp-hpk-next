"use client";

// Listado de OCs marcadas como "almacén abierto" (es_almacen_abierto = true).
// Cada fila es una OC que funciona como stock fijo del que se consume al
// crear requerimientos. El click en una fila abre el editor de detalle donde
// se pueden ajustar header (proveedor, fechas, observaciones) y los items
// (cantidad, precio unitario, NP del material).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Typography, Card, Table, Tag, Space, Button, Input, Empty, Row, Col, Statistic, App,
} from "antd";
import {
  ReloadOutlined, SearchOutlined, FolderOpenOutlined, EditOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { brand } from "@/lib/theme";
import {
  numeracionColumn, paginacionEstandar, PAGINATION_PAGE_SIZE, STICKY_HEADER,
  useColumnasRedimensionables,
} from "@/lib/tables";

const { Title, Text } = Typography;

interface OCAbierta {
  id: number;
  numero_po: string;
  nombre: string | null;
  fuente_display: string;
  moneda: string;
  fecha_solicitud: string;
  fecha_expiracion: string | null;
  status_oc_codigo: string | null;
  observaciones: string | null;
  proveedor: { id: number; razon_social: string; nombre_comercial: string | null } | null;
  items: Array<{
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
  }>;
}

export default function OCAbiertasListPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const [rows, setRows] = useState<OCAbierta[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGINATION_PAGE_SIZE);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/compras/almacen-abierto");
      if (res.ok) {
        const j = await res.json();
        setRows(j.data ?? []);
      } else {
        message.error("Error al cargar OCs abiertas");
      }
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.numero_po.toLowerCase().includes(q)
      || (r.nombre ?? "").toLowerCase().includes(q)
      || r.fuente_display.toLowerCase().includes(q)
      || (r.proveedor?.razon_social ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  // KPIs: total OCs, items totales, items con stock, stock total disponible.
  const kpis = useMemo(() => {
    const totalOCs = rows.length;
    const totalItems = rows.reduce((s, r) => s + r.items.length, 0);
    const itemsConStock = rows.reduce(
      (s, r) => s + r.items.filter((i) => i.stock_disponible > 0).length,
      0,
    );
    const stockTotal = rows.reduce(
      (s, r) => s + r.items.reduce((ss, i) => ss + i.stock_disponible, 0),
      0,
    );
    return { totalOCs, totalItems, itemsConStock, stockTotal };
  }, [rows]);

  const columns: ColumnsType<OCAbierta> = [
    numeracionColumn<OCAbierta>({ current: page, pageSize }),
    {
      key: "numero_po", title: "Nro OC", dataIndex: "numero_po", width: 130,
      sorter: (a, b) => a.numero_po.localeCompare(b.numero_po),
      render: (v: string) => <Tag color={brand.navy}>{v}</Tag>,
    },
    {
      key: "fuente", title: "Fuente / Proveedor", dataIndex: "fuente_display", ellipsis: true,
      sorter: (a, b) => a.fuente_display.localeCompare(b.fuente_display),
      render: (_v, r) => (
        <div style={{ lineHeight: 1.25 }}>
          <Text strong style={{ fontSize: 12 }}>{r.fuente_display}</Text>
          {r.proveedor && (
            <div style={{ fontSize: 11, color: brand.textSecondary }}>
              proveedor BD: {r.proveedor.razon_social}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "items", title: "Ítems (con stock / total)", width: 160, align: "center",
      render: (_v, r) => {
        const conStock = r.items.filter((i) => i.stock_disponible > 0).length;
        const total = r.items.length;
        return (
          <Tag color={conStock === 0 ? "default" : conStock === total ? "green" : "orange"}>
            {conStock} / {total}
          </Tag>
        );
      },
    },
    {
      key: "stock_total", title: "Stock disponible", width: 130, align: "right",
      sorter: (a, b) =>
        a.items.reduce((s, i) => s + i.stock_disponible, 0)
        - b.items.reduce((s, i) => s + i.stock_disponible, 0),
      render: (_v, r) => {
        const total = r.items.reduce((s, i) => s + i.stock_disponible, 0);
        return <Text strong>{total.toLocaleString("es-PE")}</Text>;
      },
    },
    {
      key: "moneda", title: "Moneda", dataIndex: "moneda", width: 80, align: "center",
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      key: "fecha_solicitud", title: "F. emisión", dataIndex: "fecha_solicitud", width: 110, align: "center",
      sorter: (a, b) => a.fecha_solicitud.localeCompare(b.fecha_solicitud),
      render: (v: string) => v ? dayjs(v).format("DD/MM/YY") : <Text type="secondary">—</Text>,
    },
    {
      key: "fecha_expiracion", title: "F. expira", dataIndex: "fecha_expiracion", width: 110, align: "center",
      sorter: (a, b) => (a.fecha_expiracion ?? "").localeCompare(b.fecha_expiracion ?? ""),
      render: (v: string | null) => {
        if (!v) return <Text type="secondary">Sin expiración</Text>;
        const expira = dayjs(v);
        const dias = expira.diff(dayjs(), "day");
        const color = dias < 0 ? "red" : dias < 30 ? "orange" : "default";
        return (
          <Tag color={color} style={{ margin: 0 }}>
            {expira.format("DD/MM/YY")}
            {dias < 0 ? " (vencida)" : dias < 30 ? ` (${dias}d)` : ""}
          </Tag>
        );
      },
    },
    {
      key: "estado", title: "Estado", dataIndex: "status_oc_codigo", width: 110, align: "center",
      render: (v: string | null) => (
        <Tag color={v === "PROCESO" ? "blue" : v === "ENTREGADO" ? "green" : "default"}>
          {v ?? "—"}
        </Tag>
      ),
    },
    {
      key: "acciones", title: "Acciones", width: 110, align: "center", fixed: "right",
      render: (_v, r) => (
        <Button
          size="small"
          icon={<EditOutlined />}
          onClick={() => router.push(`/compras/oc-abiertas/${r.id}`)}
        >
          Editar
        </Button>
      ),
    },
  ];

  const { columnas: columnsResizable, components: tableComponents } =
    useColumnasRedimensionables<OCAbierta>(columns, "oc-abiertas-cols-widths-v1");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <Title level={4} style={{ margin: 0, color: brand.navy }}>
          <FolderOpenOutlined style={{ marginRight: 8 }} />
          OCs Abiertas (Almacén abierto)
        </Title>
        <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
          Refrescar
        </Button>
      </div>

      <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
        OCs marcadas como almacén abierto: stock anual con precios congelados. Los items se
        consumen al crear requerimientos por NP (Número de parte). Click en <b>Editar</b> para
        ajustar header, proveedor, fechas o los items de cada OC.
      </Text>

      <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: 10 } }}>
        <Input
          placeholder="Buscar por nro OC, fuente, proveedor…"
          prefix={<SearchOutlined />}
          allowClear
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 380 }}
        />
      </Card>

      {filtradas.length === 0 && !loading ? (
        <Empty description="No hay OCs abiertas activas." />
      ) : (
        <Table<OCAbierta>
          rowKey="id"
          size="small"
          columns={columnsResizable}
          components={tableComponents}
          dataSource={filtradas}
          loading={loading}
          sticky={STICKY_HEADER}
          scroll={{ x: "max-content" }}
          pagination={paginacionEstandar({
            current: page, pageSize, total: filtradas.length,
            onChange: (p, s) => { setPage(p); setPageSize(s); },
            label: "OCs abiertas",
          })}
          onRow={(r) => ({
            style: { cursor: "pointer" },
            onClick: (e) => {
              // Si el click es sobre un botón, no navegar al detalle.
              const target = e.target as HTMLElement;
              if (target.closest("button")) return;
              router.push(`/compras/oc-abiertas/${r.id}`);
            },
          })}
        />
      )}
    </div>
  );
}
