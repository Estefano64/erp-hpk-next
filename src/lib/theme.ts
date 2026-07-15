import { theme as antdTheme, type ThemeConfig } from "antd";

// ── Modo de tema (claro/oscuro, elegido por usuario) ─────
export type TemaModo = "claro" | "oscuro";

// Paletas REALES (hex) por modo. Las consumen:
//   - erpThemeFor() → ConfigProvider de antd (necesita hex reales para
//     derivar hovers/sombras, NO acepta var()).
//   - globals.css → define las variables --erp-* para cada modo (los
//     valores de acá deben coincidir con los del CSS).
// El objeto `brand` de abajo (el que importan los componentes) apunta a las
// variables CSS, así el modo cambia sin tocar los ~70 archivos que lo usan.
export const PALETAS = {
  claro: {
    navy: "#1C2B5B",
    cyan: "#11A0B6",
    textPrimary: "#333333",
    textSecondary: "#8C8C8C",
    bgPage: "#F4F4F4",
    surface: "#FFFFFF",
    border: "#EBEBEB",
    success: "#28A745",
    warning: "#FFC107",
    error: "#cf1322",
    chartGrid: "rgba(0,0,0,0.07)",
  },
  oscuro: {
    // navy se aclara: en oscuro se usa como texto/ícono sobre fondo oscuro
    // Y como fondo de chips/gradientes con texto blanco — este valor medio
    // funciona aceptablemente en ambos roles (títulos son texto grande).
    navy: "#6B85C8",
    cyan: "#2FB8CC",
    textPrimary: "#E6E6E6",
    textSecondary: "#9E9E9E",
    bgPage: "#121212",
    surface: "#1E1E1E",
    border: "#333333",
    success: "#49AA19",
    warning: "#D89614",
    error: "#E84749",
    chartGrid: "rgba(255,255,255,0.10)",
  },
} as const;

// ── Paleta de marca (la que usan los componentes) ────────
// Variables CSS: el valor real lo decide html[data-tema] en globals.css.
// `white` queda literal a propósito: casi siempre es "texto blanco sobre
// fondo de color" (chips, gradientes), que debe seguir blanco en oscuro.
export const brand = {
  navy: "var(--erp-navy)",
  cyan: "var(--erp-cyan)",
  white: "#FFFFFF",
  textPrimary: "var(--erp-text)",
  textSecondary: "var(--erp-text-sec)",
  bgPage: "var(--erp-bg-page)",
  border: "var(--erp-border)",
  success: "var(--erp-success)",
  warning: "var(--erp-warning)",
  error: "var(--erp-error)",
} as const;

// ── Spacing (múltiplos de 4, alineado con antd) ──────────
// Reemplazar números mágicos en style={{ padding: 12, gap: 8, ... }}
// por estos tokens. Mantiene consistencia entre módulos.
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

// ── Sombras (depth) ──────────────────────────────────────
// `md` coincide con Card.boxShadowTertiary del theme — usarlo por defecto
// para tarjetas y popovers internos. `lg` para flotantes (FAB, tooltips ricos).
export const shadow = {
  sm: "0 1px 2px rgba(0,0,0,0.04)",
  md: "0 1px 4px rgba(0,0,0,0.08)",
  lg: "0 4px 12px rgba(0,0,0,0.12)",
} as const;

// ── Border radius ────────────────────────────────────────
// `md` coincide con el borderRadius global del theme (6).
export const radius = {
  sm: 4,
  md: 6,
  lg: 8,
} as const;

// ── Breakpoints (mismos valores que antd v6, en px) ──────
// Usar con `Grid.useBreakpoint()` o el helper `useResponsive()` de
// `@/lib/responsive`. NO escribir media queries con números mágicos.
export const breakpoints = {
  xs: 0,
  sm: 576,
  md: 768,
  lg: 992,
  xl: 1200,
  xxl: 1600,
} as const;

// ── ConfigProvider theme ─────────────────────────────────
// Construye el theme de antd para un modo. IMPORTANTE: acá van hex REALES
// de PALETAS (antd deriva hovers y no entiende var(--...)).
export function erpThemeFor(modo: TemaModo): ThemeConfig {
  const p = PALETAS[modo];
  const oscuro = modo === "oscuro";
  return {
    algorithm: oscuro ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      // Colores. En oscuro el primary de los botones usa un navy más
      // saturado que el de texto (p.navy es claro para leerse como texto).
      colorPrimary: oscuro ? "#3D5CAD" : p.navy,
      colorLink: p.cyan,
      colorSuccess: p.success,
      colorWarning: p.warning,
      colorError: p.error,
      colorBgLayout: p.bgPage,
      colorBgContainer: p.surface,
      colorText: p.textPrimary,
      colorTextSecondary: p.textSecondary,
      colorBorder: p.border,
      colorBorderSecondary: p.border,

      // Tipografía
      fontFamily: "'Montserrat', sans-serif",
      fontSize: 14,

      // Forma
      borderRadius: 6,
      controlHeight: 36,
    },
    components: {
      Button: {
        primaryShadow: "none",
        colorPrimaryHover: p.cyan,
        colorPrimaryActive: oscuro ? "#3D5CAD" : p.navy,
      },
      Menu: oscuro
        ? {
            itemSelectedBg: "rgba(107,133,200,0.18)",
            itemSelectedColor: "#A9BCE8",
            itemHoverColor: p.cyan,
            itemHoverBg: "rgba(47,184,204,0.08)",
          }
        : {
            itemSelectedBg: `${p.navy}12`,
            itemSelectedColor: p.navy,
            itemHoverColor: p.cyan,
            itemHoverBg: `${p.cyan}0A`,
          },
      Layout: {
        siderBg: p.surface,
        headerBg: p.surface,
      },
      Table: {
        headerBg: oscuro ? "#1A1A1A" : p.bgPage,
        rowHoverBg: oscuro ? "rgba(47,184,204,0.07)" : `${p.cyan}08`,
      },
      Card: {
        boxShadowTertiary: oscuro ? "0 1px 4px rgba(0,0,0,0.4)" : "0 1px 4px rgba(0,0,0,0.08)",
      },
    },
  };
}

// Compat: el theme claro con el nombre histórico.
export const erpTheme: ThemeConfig = erpThemeFor("claro");
