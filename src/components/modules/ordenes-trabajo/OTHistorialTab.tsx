"use client";

import { useEffect, useState } from "react";
import { Table, Tag, Empty, Typography, Spin } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { brand } from "@/lib/theme";

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
      title: "Cuándo", dataIndex: "createdAt", width: 160,
      render: (v: string) => (
        <div style={{ fontSize: 12, fontWeight: 500 }}>{dayjs(v).format("DD/MM/YY HH:mm")}</div>
      ),
    },
    {
      title: "Operación", dataIndex: "tipo_operacion", width: 150,
      render: (v: string) => <Tag color={tipoColor[v] ?? "default"}>{v.replace(/_/g, " ")}</Tag>,
    },
    {
      title: "Descripción", dataIndex: "descripcion",
      render: (v: string) => <span style={{ fontSize: 13 }}>{v}</span>,
    },
    {
      title: "Usuario", dataIndex: "usuario", width: 140,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text>,
    },
  ];

  if (loading && data.length === 0) {
    return <div style={{ textAlign: "center", padding: 40 }}><Spin /></div>;
  }
  if (data.length === 0) {
    return <Empty description="Sin movimientos registrados todavía." />;
  }

  return (
    <div>
      <div style={{ marginBottom: 12, fontSize: 12, color: brand.textSecondary }}>
        Últimos <strong>{data.length}</strong> movimientos (más reciente primero).
      </div>
      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={data}
        pagination={{ pageSize: 20, showTotal: (t) => `${t} eventos` }}
        loading={loading}
      />
    </div>
  );
}
