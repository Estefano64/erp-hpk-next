// Middleware de auth: bloquea todo lo que no sea /login, /api/auth/* y assets
// estáticos cuando no hay sesión. Lo que esté fuera del matcher (favicon, _next,
// imágenes públicas) ni siquiera pasa por acá.
//
// Si el usuario no tiene sesión y entra a una ruta protegida, NextAuth lo manda
// a /login con ?callbackUrl=... para volver al destino tras loguearse.
export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    // Excluye assets de Next, imágenes públicas, endpoints de auth y la página de login.
    "/((?!api/auth|login|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|css|js)).*)",
  ],
};
