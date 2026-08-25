// Convierte la respuesta de error de la API en un mensaje legible.
//
// Los endpoints con zod devuelven { error: "Validación", detail: flatten() }
// y varias pantallas mostraban solo "Validación" — imposible saber qué campo
// falló (reporte OC 260261, 2026-08-25). Este helper arma
// "Validación — campo: mensaje" con los primeros errores del detail.
export function mensajeErrorApi(json: unknown, fallback = "Error"): string {
  const j = json as {
    error?: string;
    detail?: { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
  } | null;
  if (!j?.error) return fallback;
  const fe = j.detail?.fieldErrors ?? {};
  const partes = Object.entries(fe)
    .filter(([, msgs]) => msgs && msgs.length > 0)
    .slice(0, 3)
    .map(([campo, msgs]) => `${campo}: ${msgs[0]}`);
  if (partes.length > 0) return `${j.error} — ${partes.join(" · ")}`;
  const forms = j.detail?.formErrors ?? [];
  if (forms.length > 0) return `${j.error} — ${forms[0]}`;
  return j.error;
}
