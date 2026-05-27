// Redirect del path legacy /aceptaciones → /aprobaciones.
// El módulo se renombró pero mantenemos la URL vieja redirigiendo para no
// romper bookmarks, links en docs o historial del navegador.
import { redirect } from "next/navigation";

export default function AceptacionesRedirect() {
  redirect("/aprobaciones");
}
