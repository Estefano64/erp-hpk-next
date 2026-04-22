import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import SessionProvider from "@/components/SessionProvider";
import ThemeProvider from "@/components/ThemeProvider";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-montserrat",
  display: "swap",
});

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
    <html lang="es" className={montserrat.variable} suppressHydrationWarning>
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
