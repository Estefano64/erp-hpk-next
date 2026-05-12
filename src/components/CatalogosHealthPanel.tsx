"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Col, Progress, Row, Skeleton, Space, Tag, Typography, Tooltip } from "antd";
import { CheckCircleOutlined, WarningOutlined, RightOutlined } from "@ant-design/icons";
import { brand } from "@/lib/theme";

const { Text } = Typography;

interface Gap {
  key: string;
  label: string;
  count: number;
  href?: string;
}
interface CatalogHealth {
  key: string;
  label: string;
  href: string;
  total: number;
  gaps: Gap[];
}

export function CatalogosHealthPanel() {
  const [data, setData] = useState<CatalogHealth[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/catalogs-health")
      .then((r) => r.ok ? r.json() : Promise.reject(r.statusText))
      .then((j) => setData(j.data))
      .catch((e) => setError(typeof e === "string" ? e : "Error al cargar"));
  }, []);

  const completitud = (c: CatalogHealth) => {
    if (c.total === 0) return 0;
    if (c.gaps.length === 0) return 100;
    const totalGaps = c.gaps.reduce((s, g) => s + g.count, 0);
    const max = c.total * c.gaps.length;
    return Math.round(((max - totalGaps) / max) * 100);
  };

  if (error) {
    return (
      <Card style={{ marginBottom: 16, borderColor: brand.error }}>
        <Text type="danger">{error}</Text>
      </Card>
    );
  }

  if (!data) {
    return (
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {[1, 2, 3].map((i) => (
          <Col key={i} xs={24} sm={12} lg={8}>
            <Card><Skeleton active paragraph={{ rows: 2 }} /></Card>
          </Col>
        ))}
      </Row>
    );
  }

  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
      {data.map((c) => {
        const score = completitud(c);
        const gapsConItems = c.gaps.filter((g) => g.count > 0);
        const status: "success" | "exception" | "active" =
          score === 100 ? "success" : score < 70 ? "exception" : "active";
        return (
          <Col key={c.key} xs={24} sm={12} lg={8}>
            <Card
              hoverable
              styles={{ body: { padding: 16 } }}
              title={
                <Link href={c.href} style={{ color: brand.navy, fontWeight: 600 }}>
                  {c.label} <RightOutlined style={{ fontSize: 11 }} />
                </Link>
              }
              extra={
                gapsConItems.length === 0 ? (
                  <Tag color="success" icon={<CheckCircleOutlined />}>OK</Tag>
                ) : (
                  <Tag color="warning" icon={<WarningOutlined />}>{gapsConItems.length} gap(s)</Tag>
                )
              }
            >
              <div style={{ marginBottom: 8 }}>
                <Text style={{ fontSize: 26, fontWeight: 700, color: brand.navy }}>
                  {c.total.toLocaleString()}
                </Text>
                <Text type="secondary" style={{ marginLeft: 6 }}>registros</Text>
              </div>

              {c.gaps.length > 0 && (
                <Tooltip title="100% = ningún gap. Promedio sobre todos los criterios.">
                  <Progress percent={score} status={status} size="small" style={{ marginBottom: 12 }} />
                </Tooltip>
              )}

              {gapsConItems.length === 0 ? (
                c.gaps.length > 0 && (
                  <Text type="success" style={{ fontSize: 12 }}>
                    <CheckCircleOutlined /> Todos los registros completos
                  </Text>
                )
              ) : (
                <Space orientation="vertical" size={4} style={{ width: "100%" }}>
                  {gapsConItems.map((g) => {
                    const pct = c.total > 0 ? Math.round((g.count / c.total) * 100) : 0;
                    const inner = (
                      <div style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "4px 8px", borderRadius: 4, background: "#FFF7E6",
                      }}>
                        <Text style={{ fontSize: 12 }}>{g.label}</Text>
                        <Text strong style={{ fontSize: 12, color: "#D46B08" }}>
                          {g.count.toLocaleString()} <Text type="secondary" style={{ fontSize: 10 }}>({pct}%)</Text>
                        </Text>
                      </div>
                    );
                    return g.href ? (
                      <Link key={g.key} href={g.href} style={{ display: "block" }}>{inner}</Link>
                    ) : (
                      <div key={g.key}>{inner}</div>
                    );
                  })}
                </Space>
              )}
            </Card>
          </Col>
        );
      })}
    </Row>
  );
}
