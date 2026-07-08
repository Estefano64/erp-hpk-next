"use client";

import { useMemo, useState } from "react";
import { Typography, Spin, Segmented } from "antd";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import TecnicoPanel from "@/components/modules/tecnico/TecnicoPanel";

// Dinámicos: los dashboards traen recharts (~150 KB). Cada usuario ve uno a la
// vez, así que se cargan como chunk aparte en vez de ir en el bundle inicial.
const PlannerProgramaDashboard = dynamic(
  () => import("@/components/modules/dashboard/PlannerProgramaDashboard"),
  { loading: () => <Spin /> },
);
const LogisticaDashboard = dynamic(
  () => import("@/components/modules/dashboard/LogisticaDashboard"),
  { loading: () => <Spin /> },
);
const ProduccionDashboard = dynamic(
  () => import("@/components/modules/dashboard/ProduccionDashboard"),
  { loading: () => <Spin /> },
);

const { Title, Text } = Typography;

// Decisión 2026-07-08 (rediseño de roles): TODOS los usuarios de oficina ven
// los tres dashboards y alternan con el Segmented. Solo el técnico restringido
// queda afuera (tiene su panel propio).
type DashKey = "logistica" | "planner" | "produccion";
const DASH_LABELS: Record<DashKey, string> = {
  logistica: "Logística",
  planner: "Planeamiento",
  produccion: "Producción",
};
const DASH_ORDEN: DashKey[] = ["logistica", "planner", "produccion"];
const STORAGE_KEY = "dash-preferido-v1";

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const roles = useMemo(
    () => ((session?.user as { roles?: string[] } | undefined)?.roles ?? []),
    [session],
  );

  const disponibles = useMemo<DashKey[]>(
    () => (roles.includes("tecnico") ? [] : DASH_ORDEN),
    [roles],
  );

  // Preferencia del usuario (persistida en localStorage). Si no hay o ya no
  // está disponible para sus roles, cae al primero de la lista.
  const [sel, setSel] = useState<DashKey | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      return s === "logistica" || s === "planner" || s === "produccion" ? s : null;
    } catch { return null; }
  });
  const activo: DashKey | null =
    sel && disponibles.includes(sel) ? sel : disponibles[0] ?? null;
  const cambiar = (v: DashKey) => {
    setSel(v);
    try { localStorage.setItem(STORAGE_KEY, v); } catch { /* ignore */ }
  };

  if (status === "loading") {
    return <Spin />;
  }

  // El técnico tiene un panel propio con sus tareas, ranking y rendimiento.
  if (roles.includes("tecnico")) {
    return <TecnicoPanel />;
  }

  if (!activo) {
    return (
      <div>
        <Title level={2}>Dashboard</Title>
        <Text type="secondary">
          Bienvenido al ERP de Mantenimiento Industrial.
        </Text>
      </div>
    );
  }

  return (
    <div>
      {disponibles.length > 1 && (
        <Segmented
          value={activo}
          onChange={(v) => cambiar(v as DashKey)}
          options={disponibles.map((d) => ({ value: d, label: DASH_LABELS[d] }))}
          style={{ marginBottom: 8 }}
        />
      )}
      {activo === "logistica" && <LogisticaDashboard />}
      {activo === "planner" && <PlannerProgramaDashboard />}
      {activo === "produccion" && <ProduccionDashboard />}
    </div>
  );
}
