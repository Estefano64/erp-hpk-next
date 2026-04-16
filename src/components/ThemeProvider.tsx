"use client";

import { ConfigProvider, App } from "antd";
import esES from "antd/locale/es_ES";
import { erpTheme } from "@/lib/theme";

export default function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConfigProvider theme={erpTheme} locale={esES}>
      <App>{children}</App>
    </ConfigProvider>
  );
}
