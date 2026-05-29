// Helpers compartidos para los endpoints iniciar/pausar/finalizar de tareas de
// planificación. Suma duraciones de las sesiones cerradas y devuelve las horas
// reales acumuladas. Convierte ms → horas con 2 decimales.

export function sumarHorasReales(sesiones: { inicio: Date; fin: Date | null }[]): number {
  let ms = 0;
  for (const s of sesiones) {
    if (s.fin) ms += s.fin.getTime() - s.inicio.getTime();
  }
  return Math.round((ms / 36e5) * 100) / 100;
}
