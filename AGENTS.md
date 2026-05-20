<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# UI conventions

This project uses Ant Design 6 + React 19. Do not migrate to another UI library. Keep the existing palette.

- **Colors / spacing / shadows / radius / breakpoints** live in `src/lib/theme.ts`. Use the exported tokens (`brand`, `space`, `shadow`, `radius`, `breakpoints`). Do not hardcode hex values or magic numbers in `style={{ ... }}`.
- **Responsive**: never read `window.innerWidth` or write `@media` queries. Use `useResponsive()` from `src/lib/responsive.ts`, which wraps antd's `Grid.useBreakpoint()`. For modals, use `modalWidth(screens, desktopPx)` so they go full-screen on mobile.
- **Tables**: use the helpers in `src/lib/tables.tsx` (`paginacionEstandar`, `useColumnasOcultas`, `useColumnasRedimensionables`, `RangoFechasFiltro`, etc.). Every `<Table>` must set `scroll={{ x: ... }}` to keep horizontal scroll on narrow viewports.
- **Modals**: pass `width={modalWidth(screens, NN)}`. For forms with many fields, prefer a `<Drawer placement="right">` on desktop and bottom drawer on mobile rather than oversized modals.
- **Production code, be conservative**: keep changes additive; do not refactor features without an agreed plan.
