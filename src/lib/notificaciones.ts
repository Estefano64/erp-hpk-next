// Notificaciones in-app — constantes compartidas (client-safe).
// El buzón por usuario vive en la tabla `notificacion` y lo muestra la
// campanita del header (src/components/NotificacionesBell.tsx).
// Los helpers de escritura (server-only, Prisma) están en notificaciones-server.ts.

export const TIPOS_NOTIFICACION = {
  // SSOMA: te asignaron una acción correctiva/inmediata.
  SSOMA_ACCION_REPORTE: "SSOMA_ACCION_REPORTE",
  SSOMA_ACCION_SAC: "SSOMA_ACCION_SAC",
} as const;

export type TipoNotificacion = (typeof TIPOS_NOTIFICACION)[keyof typeof TIPOS_NOTIFICACION];

// Color del punto/tag por tipo. Cae en "default" si el tipo es desconocido
// (una notificación vieja no rompe la campanita).
export const NOTIFICACION_META: Record<string, { label: string; color: string }> = {
  SSOMA_ACCION_REPORTE: { label: "Reporte de seguridad", color: "orange" },
  SSOMA_ACCION_SAC: { label: "SAC", color: "volcano" },
};

export function metaNotificacion(tipo: string): { label: string; color: string } {
  return NOTIFICACION_META[tipo] ?? { label: "Aviso", color: "default" };
}
