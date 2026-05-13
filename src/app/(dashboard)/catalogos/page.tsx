"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Typography, Tag, Input, Empty, Alert } from "antd";
import { DatabaseOutlined, SearchOutlined } from "@ant-design/icons";
import { brand } from "@/lib/theme";
import { catalogosByCategory, catalogosConfig, type CatalogoConfig } from "@/lib/catalogos-config";
import { CatalogosHealthPanel } from "@/components/CatalogosHealthPanel";

const { Title, Text } = Typography;

const categoryColors: Record<string, string> = {
  "Datos maestros": brand.navy,
  "Reparación (OT)": "#FA8C16",
  "Mantenimiento Taller": brand.cyan,
  "Estados / Workflow": "#52C41A",
};

export default function CatalogosIndexPage() {
  const router = useRouter();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const entries = await Promise.all(
        catalogosConfig.map(async (c) => {
          try {
            const res = await fetch(`/api/catalogos?tabla=${c.id}&incluirInactivos=1`);
            if (!res.ok) return [c.id, 0] as const;
            const j = await res.json();
            return [c.id, (j.data ?? []).length] as const;
          } catch {
            return [c.id, 0] as const;
          }
        }),
      );
      if (alive) {
        setCounts(Object.fromEntries(entries));
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Filtro de búsqueda sobre label / id / category
  function matches(c: CatalogoConfig) {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      c.label.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q) ||
      (c.description ?? "").toLowerCase().includes(q)
    );
  }

  const filteredCategories = Object.entries(catalogosByCategory).map(([cat, list]) => ({
    cat,
    list: list.filter(matches),
  })).filter((g) => g.list.length > 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <Title level={3} style={{ margin: 0 }}>
          <DatabaseOutlined style={{ marginRight: 8 }} />
          Catálogos Maestros
        </Title>
        <Input
          placeholder="Buscar catálogo…"
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ maxWidth: 320 }}
        />
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        title="Gestión de catálogos maestros"
        description="Verificá, agregá o eliminá entradas. Las eliminaciones tienen dos modos: 'desactivar' (soft, recomendado si hay datos relacionados) y 'eliminar' (real, solo si no hay FKs). Solo administradores pueden modificar."
      />

      <Title level={4} style={{ marginTop: 8, marginBottom: 12 }}>
        Estado de catálogos críticos
      </Title>
      <CatalogosHealthPanel />

      <Title level={4} style={{ marginTop: 24, marginBottom: 12 }}>
        Todos los catálogos
      </Title>

      {filteredCategories.length === 0 ? (
        <Empty description="No hay catálogos que coincidan con la búsqueda." />
      ) : (
        filteredCategories.map(({ cat, list }) => (
          <div key={cat} style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Tag color={categoryColors[cat] ?? "default"} style={{ fontSize: 13, padding: "4px 12px", fontWeight: 600 }}>
                {cat}
              </Tag>
              <Text type="secondary" style={{ fontSize: 12 }}>{list.length} catálogo{list.length === 1 ? "" : "s"}</Text>
            </div>
            <div style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            }}>
              {list.map((c) => {
                const count = counts[c.id];
                return (
                  <Card
                    key={c.id}
                    hoverable
                    onClick={() => router.push(`/catalogos/${c.id}`)}
                    styles={{ body: { padding: 14 } }}
                    style={{ borderColor: categoryColors[cat] ?? brand.border, borderLeft: `4px solid ${categoryColors[cat] ?? brand.cyan}` }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{c.label}</div>
                    {c.description && (
                      <div style={{ fontSize: 11, color: brand.textSecondary, marginBottom: 8, minHeight: 28, lineHeight: 1.3 }}>
                        {c.description}
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <Tag style={{ margin: 0, fontSize: 11 }}>{c.id}</Tag>
                      <span style={{ fontSize: 13, fontWeight: 600, color: brand.navy }}>
                        {loading ? "…" : count != null ? `${count} regs` : "—"}
                      </span>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
