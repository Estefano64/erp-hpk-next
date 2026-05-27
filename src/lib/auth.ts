import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

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
          rol: user.rol,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.rol = (user as unknown as { rol: string }).rol;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.sub;
        (session.user as { rol?: string }).rol = token.rol as string;
      }
      return session;
    },
  },
};
