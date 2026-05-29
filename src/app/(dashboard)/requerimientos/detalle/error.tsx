"use client";

// Error boundary específico para /requerimientos/detalle.
// Convierte crashes silenciosos del navegador ("This page couldn't load")
// en una pantalla que muestra el mensaje + stack + botón Reintentar, para
// que el usuario nos pueda compartir el error real desde la UI.

import { useEffect } from "react";
import { Button, Result, Typography } from "antd";

const { Paragraph, Text } = Typography;

export default function RequerimientosDetalleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Loguea a consola — si el user abre DevTools puede copiarnos el stack.
    console.error("/requerimientos/detalle crash:", error);
  }, [error]);

  return (
    <div style={{ padding: 24 }}>
      <Result
        status="error"
        title="No se pudo cargar el detalle de requerimientos"
        subTitle="Algo inesperado pasó al renderizar esta página. Reintentá o avisanos con la info de abajo."
        extra={[
          <Button key="retry" type="primary" onClick={reset}>Reintentar</Button>,
          <Button key="back" onClick={() => window.history.back()}>Volver</Button>,
        ]}
      />
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <Paragraph>
          <Text strong>Mensaje:</Text> <code>{error.message || "(sin mensaje)"}</code>
        </Paragraph>
        {error.digest && (
          <Paragraph>
            <Text strong>Digest:</Text> <code>{error.digest}</code>
          </Paragraph>
        )}
        {error.stack && (
          <details>
            <summary style={{ cursor: "pointer", marginBottom: 8 }}>
              <Text type="secondary">Stack trace</Text>
            </summary>
            <pre style={{
              background: "#fafafa",
              border: "1px solid #eee",
              padding: 12,
              fontSize: 11,
              overflow: "auto",
              maxHeight: 320,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}>{error.stack}</pre>
          </details>
        )}
      </div>
    </div>
  );
}
