"use client";

// Layout del PORTAL DE CLIENTES: mundo aparte del ERP — sin sidebar ni menú
// interno. Header mínimo con marca, empresa y salir. Mobile-first (los
// contactos de mina lo van a abrir desde el celular).

import { Button, Layout, Space, Typography } from "antd";
import { LogoutOutlined } from "@ant-design/icons";
import { signOut, useSession } from "next-auth/react";
import { brand } from "@/lib/theme";
import { useResponsive } from "@/lib/responsive";

const { Header, Content } = Layout;
const { Text } = Typography;

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const { isMobile } = useResponsive();
  const nombre = session?.user?.name ?? "";

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header
        style={{
          background: brand.navy,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          height: 56,
          // El Header de antd trae line-height 64px por default: con height 56
          // el texto salía cortado a la mitad. Lo normalizamos y dejamos que
          // el flex centre verticalmente.
          lineHeight: "normal",
          position: "sticky",
          top: 0,
          zIndex: 10,
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{ color: "#FFFFFF", fontWeight: 700, fontSize: 16, letterSpacing: 0.5, whiteSpace: "nowrap" }}>
            HP&K
          </span>
          {/* En celular el subtítulo largo no entra: versión corta. */}
          <span style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {isMobile ? "Portal de clientes" : "Portal de clientes · Seguimiento de componentes"}
          </span>
        </div>
        <Space size={8} style={{ flexShrink: 0 }}>
          {nombre && !isMobile && (
            <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 12, maxWidth: 180 }} ellipsis>
              {nombre}
            </Text>
          )}
          <Button
            size="small"
            type="text"
            icon={<LogoutOutlined />}
            style={{ color: "rgba(255,255,255,0.85)" }}
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            Salir
          </Button>
        </Space>
      </Header>
      <Content style={{ padding: 16, maxWidth: 980, width: "100%", margin: "0 auto" }}>
        {children}
      </Content>
    </Layout>
  );
}
