import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

export const authOptions: AuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        identifier: { label: "Email, DNI o código de empleado", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.identifier || !credentials?.password) return null;

        const input = credentials.identifier.trim();
        const isEmail = input.includes("@");

        // Si trae @ → email. Si es solo dígitos → DNI. Si no, código de empleado.
        // Email/DNI/codigoEmpleado son @unique cada uno; un mismo input no debería
        // matchear más de uno, pero por las dudas usamos findUnique en orden.
        let user = null;
        if (isEmail) {
          user = await prisma.usuario.findUnique({ where: { email: input } });
        } else if (/^\d{6,12}$/.test(input)) {
          user = await prisma.usuario.findUnique({ where: { dni: input } });
        } else {
          user = await prisma.usuario.findUnique({ where: { codigoEmpleado: input } });
        }

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
