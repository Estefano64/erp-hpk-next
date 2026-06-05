"use client";

// Lista (solo lectura) de adjuntos de una tarea de planificación. Carga al
// montar desde /api/planificacion/[id]/adjuntos y muestra cada archivo como un
// link que abre la presigned URL. Se usa en el detalle del técnico y del planner.
import { useEffect, useState } from "react";
import { Spin, Typography, Space } from "antd";
import { FileImageOutlined, PaperClipOutlined } from "@ant-design/icons";
import { R2FileLink } from "@/components/R2FileLink";
import { brand } from "@/lib/theme";

const { Text } = Typography;

interface Adjunto {
  id: number;
  nombre_archivo: string;
  r2_key: string;
  tipo_mime: string;
  tamano: number;
}

export default function TareaAdjuntosLista({ taskId }: { taskId: number }) {
  const [data, setData] = useState<Adjunto[] | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/planificacion/${taskId}/adjuntos`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => { if (vivo) setData(j.data ?? []); })
      .catch(() => { if (vivo) setData([]); });
    return () => { vivo = false; };
  }, [taskId]);

  if (data === null) return <Spin size="small" />;
  if (data.length === 0) return null;

  return (
    <div>
      <Text type="secondary" style={{ fontSize: 11 }}>Adjuntos del técnico:</Text>
      <Space direction="vertical" size={2} style={{ width: "100%", marginTop: 2 }}>
        {data.map((a) => {
          const esImg = a.tipo_mime.startsWith("image/");
          return (
            <div key={a.id} style={{ fontSize: 12 }}>
              {esImg
                ? <FileImageOutlined style={{ color: brand.cyan, marginRight: 6 }} />
                : <PaperClipOutlined style={{ color: brand.textSecondary, marginRight: 6 }} />}
              <R2FileLink resource="plan-adjunto" resourceId={a.id} r2Key={a.r2_key}>
                {a.nombre_archivo}
              </R2FileLink>
            </div>
          );
        })}
      </Space>
    </div>
  );
}
