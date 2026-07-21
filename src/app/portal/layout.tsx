"use client";

// Layout del PORTAL DE CLIENTES: mundo aparte del ERP — sin sidebar ni menú
// interno. Header mínimo con marca, empresa y salir. Mobile-first (los
// contactos de mina lo van a abrir desde el celular).

import { Button, Layout, Space, Typography } from "antd";
import { LogoutOutlined } from "@ant-design/icons";
import { signOut, useSession } from "next-auth/react";
import { brand } from "@/lib/theme";

const { Header, Content } = Layout;
const { Text } = Typography;

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
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
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <Space size={10}>
          <span style={{ color: "#FFFFFF", fontWeight: 700, fontSize: 16, letterSpacing: 0.5 }}>
            HP&K
          </span>
          <span style={{ color: "rgba(255,255,255,0.75)", fontSize: 12 }}>
            Portal de clientes · Seguimiento de componentes
          </span>
        </Space>
        <Space size={8}>
          {nombre && (
            <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 12, maxWidth: 160 }} ellipsis>
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
