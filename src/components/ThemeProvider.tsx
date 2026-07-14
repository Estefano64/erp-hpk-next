"use client";

// Provider de tema claro/oscuro por usuario.
//
// Cómo funciona el modo:
//   - La elección se persiste en localStorage ("erp-tema") por navegador.
//   - Un script inline en el layout raíz setea html[data-tema] ANTES de la
//     hidratación (anti-flash): las variables CSS --erp-* ya salen oscuras.
//   - Este provider lee ese atributo al montar y arma el theme de antd del
//     modo correspondiente (erpThemeFor). El primer frame de antd puede salir
//     claro y corregirse al montar — aceptable, el fondo ya viene oscuro.
//
// Consumo: `const { tema, setTema } = useTema()` (el toggle vive en el
// header del dashboard).

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { ConfigProvider, App } from "antd";
import esES from "antd/locale/es_ES";
import { erpThemeFor, type TemaModo } from "@/lib/theme";

const TemaContext = createContext<{ tema: TemaModo; setTema: (t: TemaModo) => void }>({
  tema: "claro",
  setTema: () => {},
});

export function useTema() {
  return useContext(TemaContext);
}

export default function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Inicial: lee la marca que dejó el script anti-flash del layout raíz (en
  // SSR no hay document → claro; el cliente hidrata ya con el modo correcto).
  const [tema, setTemaState] = useState<TemaModo>(() =>
    typeof document !== "undefined" && document.documentElement.dataset.tema === "oscuro"
      ? "oscuro"
      : "claro",
  );

  const setTema = useCallback((t: TemaModo) => {
    setTemaState(t);
    document.documentElement.dataset.tema = t === "oscuro" ? "oscuro" : "claro";
    try { localStorage.setItem("erp-tema", t); } catch { /* ignore */ }
  }, []);

  // Memoizados: sin esto, cada render de este provider crea un theme y un
  // value nuevos → antd regenera TODOS sus estilos y los consumidores del
  // contexto re-renderizan sin necesidad. Solo cambian cuando cambia `tema`.
  const theme = useMemo(() => erpThemeFor(tema), [tema]);
  const ctxValue = useMemo(() => ({ tema, setTema }), [tema, setTema]);

  return (
    <TemaContext.Provider value={ctxValue}>
      <ConfigProvider theme={theme} locale={esES}>
        <App>{children}</App>
      </ConfigProvider>
    </TemaContext.Provider>
  );
}
