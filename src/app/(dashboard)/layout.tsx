"use client";

import { useState, useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Layout, Menu, Button, Dropdown, Spin, Typography, Tag } from "antd";
import {
  DashboardOutlined,
  ToolOutlined,
  AppstoreOutlined,
  ShoppingCartOutlined,
  BarChartOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
  LogoutOutlined,
  SettingOutlined,
  FileProtectOutlined,
  ControlOutlined,
  DatabaseOutlined,
} from "@ant-design/icons";
import type { MenuProps } from "antd";
import { brand } from "@/lib/theme";

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

function buildMenuItems(_rol: string | null): MenuProps["items"] {
  const configChildren: NonNullable<MenuProps["items"]> = [
    { key: "/configuracion-cotizacion", label: "Configuración cotización" },
    { key: "/catalogos", label: "Catálogos maestros" },
  ];
  return [
    { key: "/dashboard", icon: <DashboardOutlined />, label: "Dashboard" },
    { key: "/aceptaciones", icon: <FileProtectOutlined />, label: "Aceptaciones" },
    {
      key: "operaciones",
      icon: <ToolOutlined />,
      label: "Operaciones",
      children: [
        { key: "/ordenes-trabajo", label: "Órdenes de Trabajo" },
        { key: "/evaluaciones", label: "Hojas de Evaluación" },
        { key: "/codigos-reparacion", label: "Cod. Reparables" },
        { key: "/contratos", label: "Contratos" },
        { key: "/operaciones/planificacion", label: "Planificación" },
        { key: "/operaciones/programacion-semanal", label: "Programación semanal" },
        { key: "/operaciones/programacion-dashboard", label: "Dashboard Programación" },
      ],
    },
    {
      key: "mantenimiento",
      icon: <ControlOutlined />,
      label: "Mantenimiento",
      children: [
        { key: "/mantenimiento/equipos", label: "Equipos" },
      ],
    },
    {
      key: "logistica",
      icon: <ShoppingCartOutlined />,
      label: "Logística",
      children: [
        { key: "/clientes", label: "Clientes" },
        { key: "/materiales", label: "Materiales" },
        { key: "/proveedores", label: "Proveedores" },
        { key: "/requerimientos", label: "Requerimientos" },
        { key: "/compras", label: "Compras" },
        { key: "/compras/historico", label: "Histórico de Compras" },
        { key: "/compras/contabilidad", label: "Contabilidad (Guías/Facturas)" },
        { key: "/stock", label: "Stock" },
        { key: "/stock/no-catalogados", label: "Inventario no catalogado" },
        { key: "/movimientos", label: "Movimientos" },
        { key: "/despachos", label: "Despachos por OT" },
        { key: "/herramientas", label: "Herramientas" },
      ],
    },
    { key: "/reportes", icon: <BarChartOutlined />, label: "Reportes" },
    {
      key: "configuracion",
      icon: <SettingOutlined />,
      label: "Configuración",
      children: configChildren,
    },
  ];
}

const rolLabels: Record<string, { label: string; color: string }> = {
  admin: { label: "Admin", color: brand.navy },
  supervisor: { label: "Supervisor", color: brand.cyan },
  tecnico: { label: "Técnico", color: brand.success },
  logistica: { label: "Logística", color: brand.warning },
  viewer: { label: "Viewer", color: brand.textSecondary },
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const pathname = usePathname();
  const router = useRouter();
  const [userName, setUserName] = useState<string | null>(null);
  const [rol, setRol] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.user) {
          setUserName(data.user.name);
          setRol(data.user.rol);
        }
      })
      .catch(() => { /* ignore */ });
  }, []);

  const rolInfo = rol ? (rolLabels[rol] ?? rolLabels.viewer) : null;

  const menuItems = useMemo(() => buildMenuItems(rol), [rol]);

  // Determina qué item y submenú están activos
  const selectedKey = (menuItems ?? []).reduce<string>((best, item) => {
    if (!item) return best;
    if ("children" in item && item.children) {
      for (const child of item.children) {
        if (child && "key" in child && pathname.startsWith(child.key as string)) {
          return child.key as string;
        }
      }
    }
    if ("key" in item && pathname.startsWith(item.key as string) && !["operaciones", "logistica", "mantenimiento", "configuracion"].includes(item.key as string)) {
      return item.key as string;
    }
    return best;
  }, "/dashboard");

  // Sincroniza submenús abiertos con la ruta actual
  useEffect(() => {
    const parentKey = (menuItems ?? []).reduce<string | undefined>((found, item) => {
      if (found || !item || !("children" in item) || !item.children) return found;
      for (const child of item.children) {
        if (child && "key" in child && pathname.startsWith(child.key as string)) {
          return item.key as string;
        }
      }
      return found;
    }, undefined);
    if (parentKey && !openKeys.includes(parentKey)) {
      setOpenKeys((prev) => [...prev, parentKey]);
    }
  }, [pathname, menuItems]);

  const userMenuItems: MenuProps["items"] = [
    {
      key: "profile",
      icon: <SettingOutlined />,
      label: "Mi perfil",
      disabled: true,
    },
    { type: "divider" },
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "Cerrar sesión",
      danger: true,
      onClick: () => signOut({ callbackUrl: "/login" }),
    },
  ];

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        width={240}
        collapsedWidth={64}
        style={{
          borderRight: `1px solid ${brand.border}`,
          position: "fixed",
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 100,
          overflow: "auto",
        }}
      >
        {/* Logo */}
        <div
          style={{
            height: 56,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            padding: "0 16px",
            borderBottom: `1px solid ${brand.border}`,
          }}
        >
          {/* Coloca tu logo en public/logo.png */}
          <img
            src="/logo.png"
            alt="Logo"
            width={collapsed ? 36 : 100}
            height={collapsed ? 36 : 40}
            style={{ objectFit: "contain" }}
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        </div>

        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          openKeys={openKeys}
          onOpenChange={(keys) => setOpenKeys(keys)}
          items={menuItems}
          onClick={({ key }) => router.push(key)}
          style={{ borderRight: 0, marginTop: 4 }}
        />
      </Sider>

      <Layout style={{ marginLeft: collapsed ? 64 : 240, transition: "margin-left 0.2s" }}>
        <Header
          style={{
            padding: "0 24px",
            background: brand.white,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: `1px solid ${brand.border}`,
            position: "sticky",
            top: 0,
            zIndex: 99,
            height: 56,
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{ fontSize: 16, color: brand.textPrimary }}
          />

          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={["click"]}>
            <Button
              type="text"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                height: 40,
                padding: "0 12px",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: brand.navy,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <UserOutlined style={{ color: brand.white, fontSize: 14 }} />
              </div>
              {userName && (
                <div style={{ textAlign: "left", lineHeight: 1.3 }}>
                  <Text strong style={{ fontSize: 13, display: "block" }}>
                    {userName}
                  </Text>
                  {rolInfo && (
                    <Tag
                      color={rolInfo.color}
                      style={{ fontSize: 10, lineHeight: "16px", margin: 0, padding: "0 4px" }}
                    >
                      {rolInfo.label}
                    </Tag>
                  )}
                </div>
              )}
            </Button>
          </Dropdown>
        </Header>

        <Content style={{ margin: 20, minHeight: "calc(100vh - 96px)" }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
