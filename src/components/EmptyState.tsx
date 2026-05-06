"use client";

import { Button, Empty, Space, Typography } from "antd";
import type { ReactNode } from "react";
import { brand } from "@/lib/theme";

const { Text, Title } = Typography;

interface ActionProps {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  type?: "primary" | "default" | "dashed" | "text";
}

interface Props {
  title: string;
  description?: string;
  /** Acción primaria (botón resaltado) */
  primaryAction?: ActionProps;
  /** Acción secundaria (botón normal) */
  secondaryAction?: ActionProps;
  /** Icono custom; si no se pasa, usa el default de antd */
  image?: ReactNode;
}

// Empty state con CTAs claras. Reemplazá <Empty /> con esto cuando una tabla
// esté vacía y querés guiar al usuario a la primera acción.
export function EmptyState({ title, description, primaryAction, secondaryAction, image }: Props) {
  return (
    <Empty
      image={image ?? Empty.PRESENTED_IMAGE_SIMPLE}
      description={
        <div style={{ marginTop: 8 }}>
          <Title level={5} style={{ marginBottom: 4, color: brand.navy }}>{title}</Title>
          {description && (
            <Text type="secondary" style={{ fontSize: 13 }}>{description}</Text>
          )}
          {(primaryAction || secondaryAction) && (
            <div style={{ marginTop: 16 }}>
              <Space>
                {primaryAction && (
                  <Button
                    type={primaryAction.type ?? "primary"}
                    icon={primaryAction.icon}
                    onClick={primaryAction.onClick}
                  >
                    {primaryAction.label}
                  </Button>
                )}
                {secondaryAction && (
                  <Button
                    type={secondaryAction.type ?? "default"}
                    icon={secondaryAction.icon}
                    onClick={secondaryAction.onClick}
                  >
                    {secondaryAction.label}
                  </Button>
                )}
              </Space>
            </div>
          )}
        </div>
      }
      style={{ padding: "40px 20px" }}
    />
  );
}
