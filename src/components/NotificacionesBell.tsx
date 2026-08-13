"use client";

// Campanita de notificaciones del header. Consulta /api/notificaciones al
// montar y cada minuto; al abrir el panel marca como leídas las que se están
// mostrando. Al hacer clic en una, navega a su `url`.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Popover, List, Typography, Tag, Empty, Spin, Tooltip } from "antd";
import { BellOutlined, CheckOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { brand, space, radius } from "@/lib/theme";
import { metaNotificacion } from "@/lib/notificaciones";

const { Text } = Typography;

const REFRESCO_MS = 60_000;

interface NotificacionRow {
  id: number;
  tipo: string;
  titulo: string;
  mensaje: string | null;
  url: string | null;
  leida: boolean;
  created_at: string;
}

export function NotificacionesBell() {
  const router = useRouter();
  const [items, setItems] = useState<NotificacionRow[]>([]);
  const [noLeidas, setNoLeidas] = useState(0);
  // Arranca "cargando" hasta la primera respuesta (evita el flash de vacío).
  const [loading, setLoading] = useState(true);
  const [abierto, setAbierto] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/notificaciones?limit=20");
      if (!res.ok) return; // 401 (sesión vencida) → la campanita se queda en 0
      const json = await res.json();
      setItems(json.data ?? []);
      setNoLeidas(json.noLeidas ?? 0);
    } catch {
      /* silencioso: la campanita nunca debe romper el header */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, REFRESCO_MS);
    return () => clearInterval(t);
  }, [cargar]);

  async function marcarLeidas(ids?: number[]) {
    try {
      await fetch("/api/notificaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ids ? { ids } : {}),
      });
      await cargar();
    } catch {
      /* ignore */
    }
  }

  function onOpenChange(open: boolean) {
    setAbierto(open);
    if (open) {
      cargar();
      // Marcar leídas las no leídas que el usuario está viendo.
      const pendientes = items.filter((n) => !n.leida).map((n) => n.id);
      if (pendientes.length > 0) void marcarLeidas(pendientes);
    }
  }

  function abrir(n: NotificacionRow) {
    setAbierto(false);
    if (n.url) router.push(n.url);
  }

  const contenido = (
    <div style={{ width: 340, maxHeight: 420, overflowY: "auto" }}>
      {loading && items.length === 0 ? (
        <div style={{ textAlign: "center", padding: space.lg }}><Spin /></div>
      ) : items.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sin notificaciones" />
      ) : (
        <List
          size="small"
          dataSource={items}
          renderItem={(n) => {
            const meta = metaNotificacion(n.tipo);
            return (
              <List.Item
                onClick={() => abrir(n)}
                style={{
                  cursor: n.url ? "pointer" : "default",
                  alignItems: "flex-start",
                  background: n.leida ? undefined : "var(--erp-bg-page)",
                  borderRadius: radius.md,
                  padding: space.sm,
                }}
              >
                <div style={{ width: "100%" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: space.sm }}>
                    <Tag color={meta.color} style={{ margin: 0 }}>{meta.label}</Tag>
                    <Text type="secondary" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                      {dayjs(n.created_at).format("DD/MM HH:mm")}
                    </Text>
                  </div>
                  <div style={{ marginTop: space.xs }}>
                    <Text strong={!n.leida} style={{ fontSize: 13 }}>{n.titulo}</Text>
                  </div>
                  {n.mensaje && (
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>{n.mensaje}</Text>
                    </div>
                  )}
                </div>
              </List.Item>
            );
          }}
        />
      )}
      {noLeidas > 0 && (
        <div style={{ textAlign: "right", paddingTop: space.sm, borderTop: `1px solid ${brand.border}` }}>
          <Button size="small" type="link" icon={<CheckOutlined />} onClick={() => marcarLeidas()}>
            Marcar todas como leídas
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <Popover
      open={abierto}
      onOpenChange={onOpenChange}
      trigger="click"
      placement="bottomRight"
      title="Notificaciones"
      content={contenido}
    >
      <Tooltip title="Notificaciones" open={abierto ? false : undefined}>
        <Badge count={noLeidas} size="small" offset={[-4, 4]}>
          <Button
            type="text"
            icon={<BellOutlined />}
            style={{ fontSize: 16, color: brand.textSecondary }}
          />
        </Badge>
      </Tooltip>
    </Popover>
  );
}
