"use client";

import { Typography } from "antd";

const { Title, Text } = Typography;

export default function DashboardPage() {
  return (
    <div>
      <Title level={2}>Dashboard</Title>
      <Text type="secondary">
        Bienvenido al ERP de Mantenimiento Industrial.
      </Text>
    </div>
  );
}
