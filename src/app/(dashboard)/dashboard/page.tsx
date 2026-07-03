"use client";

import { Typography, Spin } from "antd";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import TecnicoPanel from "@/components/modules/tecnico/TecnicoPanel";

// Dinámicos: ambos dashboards traen recharts (~150 KB). Cada rol ve solo uno,
// así que se cargan como chunk aparte en vez de ir en el bundle inicial.
const PlannerProgramaDashboard = dynamic(
  () => import("@/components/modules/dashboard/PlannerProgramaDashboard"),
  { loading: () => <Spin /> },
);
const LogisticaDashboard = dynamic(
  () => import("@/components/modules/dashboard/LogisticaDashboard"),
  { loading: () => <Spin /> },
);

const { Title, Text } = Typography;

export default function DashboardPage() {
  const { data: session, status } = useSession();
  if (status === "loading") {
    return <Spin />;
  }

  const roles = ((session?.user as { roles?: string[] } | undefined)?.roles ?? []);

  // El técnico tiene un panel propio con sus tareas, ranking y rendimiento.
  // Los demás roles ven la bienvenida genérica por ahora (los dashboards de
  // operaciones, planificación, etc. ya viven en sus propias rutas).
  if (roles.includes("tecnico")) {
    return <TecnicoPanel />;
  }

  // Trabajadores de logística ven el dashboard del área (KPIs de
  // requerimientos, OC, inventario, OT y facturación).
  if (roles.includes("logistica")) {
    return <LogisticaDashboard />;
  }

  // El planner ve su dashboard de programación semanal (gráficos) acá mismo.
  if (roles.includes("planner")) {
    return <PlannerProgramaDashboard />;
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
