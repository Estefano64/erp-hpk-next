// Middleware de auth: bloquea todo lo que no sea /login, /api/auth/* y assets
// estáticos cuando no hay sesión.
//
// Importante: hay que pasar `pages.signIn: "/login"` explícitamente a withAuth.
// Si re-exportamos el default sin config, next-auth usa "/api/auth/signin"
// (su UI por defecto) que no existe en esta app — y la redirección se rompe.
import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/login" },
});

export const config = {
  matcher: [
    // Excluye assets de Next, imágenes públicas, endpoints de auth y la página de login.
    "/((?!api/auth|login|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|css|js)).*)",
  ],
};
