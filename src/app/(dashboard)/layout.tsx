"use client";

import { useState, useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Layout, Menu, Button, Dropdown, Spin, Typography, Tag } from "antd";
import {
  DashboardOutlined,
  ToolOutlined,
  AppstoreOutlined,
  BugOutlined,
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
  TeamOutlined,
} from "@ant-design/icons";
import type { MenuProps } from "antd";
import { brand } from "@/lib/theme";
import { useResponsive } from "@/lib/responsive";
import IdleLogout from "@/components/IdleLogout";
import BfcacheGuard from "@/components/BfcacheGuard";
import { confirmLeave } from "@/lib/unsaved-changes";
import { esTecnicoRestringido, rutaPermitidaTecnico } from "@/lib/tecnico-acceso";

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

// Envolver el label de una hoja del menú en un <a href> hace que el browser
// trate la entrada como link real: middle-click / Ctrl+click / "Abrir en
// nueva pestaña" desde el menú contextual funcionan de forma nativa. El
// onClick previene la navegación full-page del browser SOLO en click
// izquierdo simple — la navegación real la sigue manejando el `onClick`
// del Menu (vía router.push) para conservar el chequeo de unsaved-changes
// y el cierre del drawer en mobile.
function linkLabel(href: string, label: React.ReactNode): React.ReactNode {
  return (
    <a
      href={href}
      onClick={(e) => {
        // Middle/ctrl/meta/shift-click → no llega acá (browser lo maneja).
        // En click normal, prevenimos el full-page reload y dejamos que
        // el onClick del Menu haga la navegación cliente.
        if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
          e.preventDefault();
        }
      }}
      // color "heredado" para que no se vea como link azul subrayado.
      style={{ color: "inherit", display: "block" }}
    >
      {label}
    </a>
  );
}

function buildMenuItems(tecnicoRestringido: boolean): MenuProps["items"] {
  // El técnico (rol "tecnico" sin "admin") solo ve su panel, sus tareas y los
  // tickets. El resto de apartados ni aparecen. Ver lib/tecnico-acceso.ts.
  if (tecnicoRestringido) {
    return [
      { key: "/dashboard", icon: <DashboardOutlined />, label: linkLabel("/dashboard", "Dashboard") },
      { key: "/mis-tareas", icon: <ToolOutlined />, label: linkLabel("/mis-tareas", "Mis Tareas") },
      { key: "/tickets", icon: <BugOutlined />, label: linkLabel("/tickets", "Tickets") },
    ];
  }
  const configChildren: NonNullable<MenuProps["items"]> = [
    { key: "/configuracion-cotizacion", label: linkLabel("/configuracion-cotizacion", "Configuración cotización") },
    { key: "/catalogos", label: linkLabel("/catalogos", "Catálogos maestros") },
    { key: "/configuracion/checklist", label: linkLabel("/configuracion/checklist", "Checklist de funcionalidades") },
  ];
  return [
    { key: "/dashboard", icon: <DashboardOutlined />, label: linkLabel("/dashboard", "Dashboard") },
    { key: "/aprobaciones", icon: <FileProtectOutlined />, label: linkLabel("/aprobaciones", "Aprobaciones") },
    { key: "/tickets", icon: <BugOutlined />, label: linkLabel("/tickets", "Tickets") },
    {
      key: "operaciones",
      icon: <ToolOutlined />,
      label: "Operaciones",
      children: [
        { key: "/ordenes-trabajo", label: linkLabel("/ordenes-trabajo", "OTs Externas") },
        { key: "/ordenes-trabajo-internas", label: linkLabel("/ordenes-trabajo-internas", "OTs Internas") },
        { key: "/evaluaciones", label: linkLabel("/evaluaciones", "Hojas de Evaluación") },
        { key: "/codigos-reparacion", label: linkLabel("/codigos-reparacion", "Cod. Estratégicos") },
        { key: "/contratos", label: linkLabel("/contratos", "Contratos") },
        {
          key: "ops-planificacion",
          label: "Planificación de tareas",
          children: [
            { key: "/operaciones/planificacion", label: linkLabel("/operaciones/planificacion", "Planificación") },
            { key: "/operaciones/programacion-semanal", label: linkLabel("/operaciones/programacion-semanal", "Programación semanal") },
            { key: "/operaciones/programacion-dashboard", label: linkLabel("/operaciones/programacion-dashboard", "Dashboard Planificación") },
          ],
        },
      ],
    },
    {
      key: "rrhh",
      icon: <TeamOutlined />,
      label: "RR/HH",
      children: [
        { key: "/rrhh/trabajadores", label: linkLabel("/rrhh/trabajadores", "Trabajadores") },
      ],
    },
    {
      key: "mantenimiento",
      icon: <ControlOutlined />,
      label: "Mantenimiento",
      children: [
        { key: "/mantenimiento/equipos", label: linkLabel("/mantenimiento/equipos", "Equipos") },
        { key: "/mantenimiento/vehiculos", label: linkLabel("/mantenimiento/vehiculos", "Vehículos") },
        { key: "/mantenimiento/task-lists", label: linkLabel("/mantenimiento/task-lists", "Task Lists") },
      ],
    },
    {
      key: "logistica",
      icon: <ShoppingCartOutlined />,
      label: "Logística",
      children: [
        {
          key: "log-maestros",
          label: "Maestros",
          children: [
            { key: "/clientes", label: linkLabel("/clientes", "Clientes") },
            { key: "/proveedores", label: linkLabel("/proveedores", "Proveedores") },
            { key: "/materiales", label: linkLabel("/materiales", "Materiales") },
          ],
        },
        {
          key: "log-ciclo-compras",
          label: "Ciclo de compras",
          children: [
            { key: "/requerimientos", label: linkLabel("/requerimientos", "Requerimientos") },
            { key: "/compras/historico", label: linkLabel("/compras/historico", "Cotizaciones (precios históricos)") },
            { key: "/compras", label: linkLabel("/compras", "Órdenes de compra") },
            // "OCs Abiertas" se movió como tab dentro de /compras. La ruta
            // /compras/oc-abiertas sigue funcionando por URL directa.
          ],
        },
        {
          key: "log-almacen-repuestos",
          label: "Almacén de repuestos",
          children: [
            { key: "/movimientos", label: linkLabel("/movimientos", "Movimiento de repuestos") },
            { key: "/stock", label: linkLabel("/stock", "Inventario de stock") },
            // "Inventario no catalogado" se removió del menú: la misma vista
            // se accede desde /stock con el filtro "No catalogado". La ruta
            // /stock/no-catalogados sigue funcionando por URL directa.
            { key: "/despachos", label: linkLabel("/despachos", "Inventario por OT") },
          ],
        },
        {
          key: "log-herramientas-suministros",
          label: "Almacén de herramientas y suministros",
          children: [
            { key: "/herramientas", label: linkLabel("/herramientas", "Herramientas") },
            { key: "/suministros", label: linkLabel("/suministros", "Suministros") },
          ],
        },
        {
          key: "log-despacho-facturacion",
          label: "Despacho y facturación",
          children: [
            { key: "/despachos/mina", label: linkLabel("/despachos/mina", "Despacho a mina (Guía de remisión)") },
            { key: "/facturacion/ot", label: linkLabel("/facturacion/ot", "Facturación de OT (mina)") },
            // "Guía y factura de OC" se removió del menú: la misma funcionalidad
            // (Nro Guía/Nro Factura editables + subir archivos) ya está en la
            // tabla principal de /compras. La ruta /compras/contabilidad sigue
            // existiendo por si se quiere acceder directo, pero no se enlaza.
          ],
        },
      ],
    },
    { key: "/reportes", icon: <BarChartOutlined />, label: linkLabel("/reportes", "Reportes") },
    {
      key: "configuracion",
      icon: <SettingOutlined />,
      label: "Configuración",
      children: configChildren,
    },
  ];
}

// Aplana el árbol de menú (soporta submenús y grupos anidados) → lista de
// hojas navegables con la cadena de submenús ancestros (para abrirlos todos).
type MenuLeaf = { key: string; parents: string[] };
function flattenMenuLeaves(
  items: MenuProps["items"],
  parents: string[] = [],
): MenuLeaf[] {
  const out: MenuLeaf[] = [];
  for (const item of items ?? []) {
    if (!item) continue;
    const hasChildren = "children" in item && Array.isArray(item.children);
    const hasKey = "key" in item && typeof item.key === "string";
    if (hasChildren) {
      // Un submenú colapsable (con key propia) agrega su key a la cadena de
      // ancestros; un grupo (type: "group", sin key) no aporta apertura.
      const nextParents = hasKey ? [...parents, item.key as string] : parents;
      out.push(...flattenMenuLeaves(item.children, nextParents));
    } else if (hasKey) {
      out.push({ key: item.key as string, parents });
    }
  }
  return out;
}

// La hoja cuya key es el prefijo más largo de la ruta actual (respeta los
// límites de segmento para no confundir /compras con /compras/historico).
function matchLeaf(leaves: MenuLeaf[], pathname: string): MenuLeaf | undefined {
  let best: MenuLeaf | undefined;
  for (const leaf of leaves) {
    const isMatch = pathname === leaf.key || pathname.startsWith(leaf.key + "/");
    if (isMatch && (!best || leaf.key.length > best.key.length)) best = leaf;
  }
  return best;
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
  const { isMobile } = useResponsive();

  // En celular el sidebar es un cajón superpuesto (no empuja el contenido):
  // arranca colapsado y el contenido va a ancho completo.
  useEffect(() => { setCollapsed(isMobile); }, [isMobile]);
  const [userName, setUserName] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.user) {
          setUserName(data.user.name);
          setRoles(Array.isArray(data.user.roles) ? data.user.roles : []);
        }
      })
      .catch(() => { /* ignore */ });
  }, []);

  // Rol "principal" para el badge del header: el primero según una prioridad
  // visual (admin gana). Para chequeos de acceso se debe usar roles.includes(x).
  const PRIORIDAD_VISIBLE = ["admin", "supervisor", "planner", "tecnico", "evaluador", "aprobador_evaluacion", "aprobador_requerimiento", "logistica", "mantenimiento", "contabilidad", "viewer"];
  const rolPrincipal = PRIORIDAD_VISIBLE.find((r) => roles.includes(r)) ?? null;
  const rolInfo = rolPrincipal ? (rolLabels[rolPrincipal] ?? rolLabels.viewer) : null;

  // Técnico restringido: solo ve panel + tareas + tickets (menú y rutas).
  const tecnicoRestringido = esTecnicoRestringido(roles);
  const menuItems = useMemo(() => buildMenuItems(tecnicoRestringido), [tecnicoRestringido]);

  // Bloqueo de rutas en cliente: si un técnico cae en una pantalla que no le
  // corresponde (p. ej. tipeando la URL), lo devolvemos a su dashboard. El
  // middleware hace el mismo bloqueo server-side; esto cubre la navegación SPA.
  useEffect(() => {
    if (tecnicoRestringido && !rutaPermitidaTecnico(pathname)) {
      router.replace("/dashboard");
    }
  }, [tecnicoRestringido, pathname, router]);

  // Determina qué item y submenú están activos (soporta grupos anidados)
  const menuLeaves = useMemo(() => flattenMenuLeaves(menuItems), [menuItems]);
  const matched = useMemo(() => matchLeaf(menuLeaves, pathname), [menuLeaves, pathname]);
  const selectedKey = matched?.key ?? "/dashboard";

  // Cuando cambia la ruta, abrimos automáticamente los submenús ancestros (sin
  // tocar los que el usuario haya abierto/cerrado por su cuenta). Usar `effective`
  // mergeado en render hace que el usuario no pueda cerrar el submenú activo —
  // lo abríamos siempre. Con este effect, el usuario tiene control total después
  // de la navegación inicial.
  useEffect(() => {
    if (matched?.parents.length) {
      setOpenKeys((prev) => {
        const set = new Set(prev);
        for (const p of matched.parents) set.add(p);
        return Array.from(set);
      });
    }
  }, [matched]);

  const userMenuItems: MenuProps["items"] = [
    {
      key: "profile",
      icon: <UserOutlined />,
      label: "Mi perfil",
      onClick: () => {
        if (confirmLeave()) router.push("/perfil");
      },
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
      <IdleLogout />
      <BfcacheGuard />
      {/* Backdrop en celular: al tocar fuera, cierra el cajón. */}
      {isMobile && !collapsed && (
        <div
          onClick={() => setCollapsed(true)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 99 }}
        />
      )}
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        width={240}
        collapsedWidth={isMobile ? 0 : 64}
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
          onClick={({ key }) => {
            if (confirmLeave()) {
              router.push(key);
              if (isMobile) setCollapsed(true); // cerrar el cajón al navegar
            }
          }}
          style={{ borderRight: 0, marginTop: 4 }}
        />
      </Sider>

      <Layout style={{ marginLeft: isMobile ? 0 : (collapsed ? 64 : 240), transition: "margin-left 0.2s" }}>
        <Header
          style={{
            padding: isMobile ? "0 12px" : "0 24px",
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

        <Content style={{ margin: isMobile ? "12px 8px" : 20, minHeight: "calc(100vh - 96px)" }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
