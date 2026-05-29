// Middleware de auth: bloquea todo lo que no sea /login, /api/auth/* y assets
// estáticos cuando no hay sesión.
//
// Importante: hay que pasar `pages.signIn: "/login"` explícitamente a withAuth.
// Si re-exportamos el default sin config, next-auth usa "/api/auth/signin"
// (su UI por defecto) que no existe en esta app — y la redirección se rompe.
//
// Además: bloqueo de rutas para el rol "técnico". Un técnico restringido (rol
// "tecnico" sin "admin") solo puede abrir su panel, sus tareas y los tickets;
// si tipea cualquier otra URL de página, lo devolvemos a /dashboard. Las APIs
// no se bloquean acá (cada endpoint valida sus permisos). Ver tecnico-acceso.ts.
//
// (El bug del botón "atrás" mostrando una captura cacheada tras cerrar sesión
// NO se arregla acá: Next 16 sobreescribe el Cache-Control de las páginas
// dinámicas. Se resuelve en el cliente con BfcacheGuard.tsx.)
import { withAuth } from "next-auth/middleware";
import type { NextRequestWithAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { esTecnicoRestringido, rutaPermitidaTecnico } from "@/lib/tecnico-acceso";

export default withAuth(
  function middleware(req: NextRequestWithAuth) {
    const roles = (req.nextauth?.token?.roles as string[] | undefined) ?? [];
    const path = req.nextUrl.pathname;
    if (!path.startsWith("/api/") && esTecnicoRestringido(roles) && !rutaPermitidaTecnico(path)) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  },
  {
    pages: { signIn: "/login" },
  },
);

export const config = {
  matcher: [
    // Excluye assets de Next, imágenes públicas, endpoints de auth y la página de login.
    "/((?!api/auth|login|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|css|js)).*)",
  ],
};
