import type { ThemeConfig } from "antd";

// ── Paleta de marca ──────────────────────────────────────
export const brand = {
  navy: "#1C2B5B",       // Azul Marino — marca principal, autoridad
  cyan: "#11A0B6",       // Turquesa  — acción, acento, hover
  white: "#FFFFFF",      // Fondo limpio
  textPrimary: "#333333",   // Texto principal (nunca negro puro)
  textSecondary: "#8C8C8C", // Texto secundario
  bgPage: "#F4F4F4",        // Fondo general de la página
  border: "#EBEBEB",        // Bordes y divisores
  success: "#28A745",
  warning: "#FFC107",
  error: "#cf1322",
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
export const erpTheme: ThemeConfig = {
  token: {
    // Colores
    colorPrimary: brand.navy,
    colorLink: brand.cyan,
    colorSuccess: brand.success,
    colorWarning: brand.warning,
    colorError: brand.error,
    colorBgLayout: brand.bgPage,
    colorBgContainer: brand.white,
    colorText: brand.textPrimary,
    colorTextSecondary: brand.textSecondary,
    colorBorder: brand.border,
    colorBorderSecondary: brand.border,

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
      colorPrimaryHover: brand.cyan,
      colorPrimaryActive: brand.navy,
    },
    Menu: {
      itemSelectedBg: `${brand.navy}12`,
      itemSelectedColor: brand.navy,
      itemHoverColor: brand.cyan,
      itemHoverBg: `${brand.cyan}0A`,
    },
    Layout: {
      siderBg: brand.white,
      headerBg: brand.white,
    },
    Table: {
      headerBg: brand.bgPage,
      rowHoverBg: `${brand.cyan}08`,
    },
    Card: {
      boxShadowTertiary: "0 1px 4px rgba(0,0,0,0.08)",
    },
  },
};
