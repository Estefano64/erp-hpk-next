"use client";

import { Grid } from "antd";
import type { Breakpoint } from "antd/es/_util/responsiveObserver";

const { useBreakpoint } = Grid;

export type Screens = Partial<Record<Breakpoint, boolean>>;

/**
 * Hook único de responsive para toda la app. Envuelve `Grid.useBreakpoint()`
 * de antd v6 y expone booleanos semánticos para los tres tamaños que importan:
 * mobile (< md / 768), tablet (md → lg / 768–991), desktop (≥ lg / 992).
 *
 *   const { isMobile, isDesktop, screens } = useResponsive();
 *   <Modal width={modalWidth(screens)} ... />
 *
 * IMPORTANTE: en SSR `screens` viene vacío y todos los booleanos son false.
 * No tomar decisiones de layout antes del primer render del cliente.
 */
export function useResponsive() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const isTablet = !!screens.md && !screens.lg;
  const isDesktop = !!screens.lg;
  return { screens, isMobile, isTablet, isDesktop };
}

/**
 * Ancho recomendado para un `<Modal>` según viewport:
 *   - mobile  → 100vw (pantalla completa)
 *   - tablet  → 90vw
 *   - desktop → `desktopWidth` (por defecto 720)
 *
 * Uso: `<Modal width={modalWidth(screens, 900)} ... />`.
 */
export function modalWidth(screens: Screens, desktopWidth: number = 720): number | string {
  if (!screens.md) return "100vw";
  if (!screens.lg) return "90vw";
  return desktopWidth;
}
