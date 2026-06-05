"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";

// IMPORTANTE: la sesión usa JWT con maxAge 8h y updateAge 1h (ver lib/auth.ts).
// El refresco "deslizante" del token (que evita que venza en medio de uso) SOLO
// ocurre cuando el cliente vuelve a pedir /api/auth/session. Por eso acá hay que
// refrescar periódicamente: sin esto el token nunca se renovaba y el usuario
// activo era expulsado al login al llegar al maxAge.
//   - refetchInterval: re-consulta la sesión cada 5 min (renueva el token una vez
//     que pasa el updateAge de 1h, deslizando el vencimiento).
//   - refetchOnWindowFocus: al volver a la pestaña, refresca enseguida (los timers
//     de fondo se throttlean, así que el foco cubre el caso de "volví y cliqueé").
export default function SessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <NextAuthSessionProvider
      basePath="/api/auth"
      refetchInterval={5 * 60}
      refetchOnWindowFocus={true}
    >
      {children}
    </NextAuthSessionProvider>
  );
}
