"use client";

import { useEffect, useState } from "react";
import { Table, Tag, Empty, Typography, Spin, Space, Button } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { brand } from "@/lib/theme";
import {
  useColumnasOcultas,
  ColumnasToggleButton,
  visibleColumns,
  filtroPorColumna,
  useRangoFechas,
  RangoFechasFiltro,
  dentroDeRango,
  useColumnasRedimensionables,
} from "@/lib/tables";

const { Text } = Typography;

interface HistorialRecord {
  id: number;
  ot_id: number;
  tipo_operacion: string;
  descripcion: string;
  usuario: string;
  fecha: string;
  datos_adicionales: string | null;
  createdAt: string;
}

const tipoColor: Record<string, string> = {
  CAMBIO_ESTADO: "blue",
  EDICION: "geekblue",
  REPROGRAMACION: "orange",
  CREACION: "green",
  ELIMINACION: "red",
};

export default function OTHistorialTab({ otId }: { otId: number }) {
  const [data, setData] = useState<HistorialRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const { ocultas, setOcultas } = useColumnasOcultas("ot-historial-cols-v1");
  const { rango: rangoFecha, setRango: setRangoFecha } = useRangoFechas();

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/ordenes-trabajo/${otId}/historial`);
        if (res.ok && alive) {
          const json = await res.json();
          setData(json.data ?? []);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [otId]);

  const columns: ColumnsType<HistorialRecord> = [
    {
      key: "createdAt",
      title: "Cuándo", dataIndex: "createdAt", width: 160,
      sorter: (a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""),
      render: (v: string) => (
        <div style={{ fontSize: 12, fontWeight: 500 }}>{dayjs(v).format("DD/MM/YY HH:mm")}</div>
      ),
    },
    {
      key: "tipo_operacion",
      title: "Operación", dataIndex: "tipo_operacion", width: 150,
      ...filtroPorColumna(data, "tipo_operacion"),
      render: (v: string) => <Tag color={tipoColor[v] ?? "default"}>{v.replace(/_/g, " ")}</Tag>,
    },
    {
      key: "descripcion",
      title: "Descripción", dataIndex: "descripcion",
      ...filtroPorColumna(data, "descripcion"),
      render: (v: string) => <span style={{ fontSize: 13 }}>{v}</span>,
    },
    {
      key: "usuario",
      title: "Usuario", dataIndex: "usuario", width: 140,
      ...filtroPorColumna(data, "usuario"),
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text>,
    },
  ];

  const { columnas: columnsResizable, components: tableComponents, resetAnchos } =
    useColumnasRedimensionables<HistorialRecord>(columns, "ot-hist-cols-widths-v1");

  if (loading && data.length === 0) {
    return <div style={{ textAlign: "center", padding: 40 }}><Spin /></div>;
  }
  if (data.length === 0) {
    return <Empty description="Sin movimientos registrados todavía." />;
  }

  const datosFiltrados = data.filter((r) => dentroDeRango(r, "createdAt", rangoFecha));

  return (
    <div>
      <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontSize: 12, color: brand.textSecondary }}>
          Últimos <strong>{datosFiltrados.length}</strong> movimientos (más reciente primero).
        </span>
        <Space wrap>
          <RangoFechasFiltro label="Cuándo" value={rangoFecha} onChange={setRangoFecha} />
          <ColumnasToggleButton<HistorialRecord>
            columns={columns}
            ocultas={ocultas}
            setOcultas={setOcultas}
            obligatorias={["createdAt"]}
          />
          <Button onClick={resetAnchos}>Restablecer anchos</Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        size="small"
        columns={visibleColumns(columnsResizable, ocultas)}
        components={tableComponents}
        dataSource={datosFiltrados}
        pagination={{ pageSize: 20, showTotal: (t) => `${t} eventos`, placement: ["topEnd", "bottomEnd"] }}
        loading={loading}
        sticky={{ offsetHeader: 56, offsetScroll: 0 }}
      />
    </div>
  );
}
