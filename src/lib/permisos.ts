// Helpers para chequear roles de un usuario en la sesión NextAuth.
//
// Esquema multi-rol: cada Usuario tiene un array `roles` (ej. ["admin", "tecnico"]).
// Una cuenta tiene un rol si su array CONTIENE ese código.
//
// Reglas de comodidad:
//   - hasRole(session, "admin") devuelve true si "admin" está en roles.
//   - hasAnyRole(session, "admin", "planner") devuelve true si tiene cualquiera.
//   - El rol "admin" NO implica automáticamente los demás — si querés permitir
//     acceso a admins en una verificación, agregalos explícitamente:
//        hasAnyRole(session, "admin", "evaluador").

import type { Session } from "next-auth";

type SessionUserConRoles = { roles?: string[] };

export function getRoles(session: Session | null | undefined): string[] {
  const u = session?.user as SessionUserConRoles | undefined;
  return Array.isArray(u?.roles) ? (u!.roles as string[]) : [];
}

export function hasRole(session: Session | null | undefined, rol: string): boolean {
  return getRoles(session).includes(rol);
}

export function hasAnyRole(
  session: Session | null | undefined,
  ...roles: string[]
): boolean {
  const userRoles = getRoles(session);
  return roles.some((r) => userRoles.includes(r));
}

// Helper para el cliente: extrae los roles del objeto session.user. Útil en
// componentes "use client" donde no tenemos el Session completo.
export function rolesDesdeUser(user: { roles?: string[] } | null | undefined): string[] {
  return Array.isArray(user?.roles) ? user!.roles as string[] : [];
}
