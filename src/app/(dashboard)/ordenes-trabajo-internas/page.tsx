"use client";

import { Card, Typography, Space, Tag } from "antd";
import { ToolOutlined, ClockCircleOutlined } from "@ant-design/icons";
import { brand } from "@/lib/theme";

const { Title, Paragraph, Text } = Typography;

export default function OrdenesTrabajoInternasPage() {
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          <ToolOutlined style={{ marginRight: 8, color: brand.cyan }} />
          OTs Internas
        </Title>
        <Text type="secondary">
          Órdenes de trabajo de mantenimiento del taller HP&amp;K (equipos propios, no cilindros de cliente).
        </Text>
      </div>

      <Card>
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Tag icon={<ClockCircleOutlined />} color="processing" style={{ fontSize: 13, padding: "4px 12px" }}>
            Próximamente — Fase D2
          </Tag>

          <Paragraph style={{ marginBottom: 0 }}>
            Esta sección está reservada para las órdenes de trabajo internas que HP&amp;K se asigna a sí
            misma (mantenimiento correctivo o preventivo de tornos, bancos de pruebas, infraestructura del
            taller, etc.). El catálogo de tipos (Correctiva / Preventiva) y los User Status ya están listos.
          </Paragraph>

          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            Roadmap:
          </Paragraph>
          <ul style={{ paddingLeft: 20, marginTop: 0 }}>
            <li>
              <Text strong>D2</Text> — modelo <code>OrdenTrabajoInterna</code>, CRUD básico y formulario
              vinculado a Equipo del taller.
            </li>
            <li>
              <Text strong>D3</Text> — integración con Estrategia de mantenimiento preventivo (scheduler
              automático).
            </li>
            <li>
              <Text strong>D4</Text> — listado unificado con tabs y reportes por tipo.
            </li>
          </ul>
        </Space>
      </Card>
    </div>
  );
}
