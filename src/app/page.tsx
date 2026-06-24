import { redirect } from "next/navigation";

// La raíz "/" no tiene contenido propio: es solo la puerta de entrada.
// - Sin sesión: el middleware (src/middleware.ts) ya redirige a /login.
// - Con sesión: caemos acá y mandamos al panel principal.
// (Antes quedaba la plantilla starter de Next, que se veía al entrar al dominio.)
export default function Home() {
  redirect("/dashboard");
}
