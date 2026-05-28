"use client";

import { Typography, Spin } from "antd";
import { useSession } from "next-auth/react";
import TecnicoPanel from "@/components/modules/tecnico/TecnicoPanel";

const { Title, Text } = Typography;

export default function DashboardPage() {
  const { data: session, status } = useSession();
  if (status === "loading") {
    return <Spin />;
  }

  const rol = (session?.user as { rol?: string } | undefined)?.rol ?? "viewer";

  // El técnico tiene un panel propio con sus tareas, ranking y rendimiento.
  // Los demás roles ven la bienvenida genérica por ahora (los dashboards de
  // operaciones, planificación, etc. ya viven en sus propias rutas).
  if (rol === "tecnico") {
    return <TecnicoPanel />;
  }

  return (
    <div>
      <Title level={2}>Dashboard</Title>
      <Text type="secondary">
        Bienvenido al ERP de Mantenimiento Industrial.
      </Text>
    </div>
  );
}
