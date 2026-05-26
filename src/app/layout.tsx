import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import SessionProvider from "@/components/SessionProvider";
import ThemeProvider from "@/components/ThemeProvider";
// Montserrat se sirve desde @fontsource (bundled en el build) en vez de
// next/font/google. Esto elimina la dependencia de red a fonts.googleapis.com
// durante el build — un punto de falla frecuente en CI/Vercel/Railway.
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/500.css";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "ERP Mantenimiento Industrial",
  description: "Sistema de gestión de mantenimiento industrial",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body suppressHydrationWarning>
        <SessionProvider>
          <AntdRegistry>
            <ThemeProvider>{children}</ThemeProvider>
          </AntdRegistry>
        </SessionProvider>
      </body>
    </html>
  );
}
