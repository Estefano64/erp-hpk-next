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
  error: "#DC3545",
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
