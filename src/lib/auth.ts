import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

// Nombre vigente del usuario según la BD, con caché corta (60 s) para no
// consultar en cada request. null si no existe o falla la consulta.
const cacheNombre = new Map<string, { nombre: string | null; vence: number }>();
export async function nombreUsuarioActual(sub: string | undefined | null): Promise<string | null> {
  const id = Number(sub);
  if (!sub || !Number.isInteger(id)) return null;
  const hit = cacheNombre.get(sub);
  if (hit && hit.vence > Date.now()) return hit.nombre;
  try {
    const u = await prisma.usuario.findUnique({ where: { id }, select: { nombre: true } });
    const nombre = u?.nombre ?? null;
    cacheNombre.set(sub, { nombre, vence: Date.now() + 60_000 });
    return nombre;
  } catch {
    return null;
  }
}

export const authOptions: AuthOptions = {
  session: {
    strategy: "jwt",
    // Sesión máxima absoluta: 8 horas. Tras este tiempo el JWT vence aunque el
    // usuario haya estado activo (forzamos re-login periódico por frescura).
    maxAge: 8 * 60 * 60,
    // Cada hora refresca el token (extiende su validez si sigue activo, dentro
    // del límite de maxAge). Sin esto el token podría vencer en medio de uso.
    updateAge: 60 * 60,
  },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        identifier: { label: "Email o código de empleado", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.identifier || !credentials?.password) return null;

        const input = credentials.identifier.trim();
        const isEmail = input.includes("@");

        // El codigoEmpleado es el DNI (con la excepción de algunos USR-XXX
        // huérfanos que no tienen DNI cargado). No hace falta una rama DNI
        // aparte: si te logueás con el DNI matchea por codigoEmpleado.
        const user = isEmail
          ? await prisma.usuario.findUnique({ where: { email: input } })
          : await prisma.usuario.findUnique({ where: { codigoEmpleado: input } });

        if (!user || !user.activo) return null;

        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) return null;

        return {
          id: String(user.id),
          email: user.email ?? user.codigoEmpleado,
          name: user.nombre,
          roles: user.roles,
          // Portal de clientes: empresa a la que pertenece la cuenta (rol
          // "cliente"). Viaja en el JWT para que el API del portal filtre
          // SIEMPRE por este valor de sesión, nunca por parámetros.
          clienteId: user.clienteId ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.roles = (user as unknown as { roles: string[] }).roles;
        token.clienteId = (user as unknown as { clienteId: number | null }).clienteId ?? null;
      } else if (token.sub) {
        // Refresca el NOMBRE desde la BD (2026-11-12): si el admin renombra a
        // un usuario, sin esto la sesión seguía firmando operaciones con el
        // nombre viejo hasta re-loguearse (hasta 8 h). Los roles NO se tocan
        // acá a propósito (siguen aplicando al re-loguear).
        const actual = await nombreUsuarioActual(token.sub);
        if (actual) token.name = actual;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.sub;
        (session.user as { roles?: string[] }).roles = (token.roles as string[] | undefined) ?? [];
        (session.user as { clienteId?: number | null }).clienteId = (token.clienteId as number | null | undefined) ?? null;
      }
      return session;
    },
  },
};
