"use client";

// Link/botón para abrir un archivo guardado en R2.
// Pide una presigned URL on-click (no la conserva en memoria) y abre en pestaña nueva.
import { useState } from "react";
import { message } from "antd";
import { openR2File, type R2Resource } from "@/lib/r2-client";

interface Props {
  resource: R2Resource;
  resourceId: number;
  r2Key: string;
  children?: React.ReactNode;
  // Si se pasa, se renderiza un nombre de archivo. Si no, usa children.
  fileName?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function R2FileLink({
  resource,
  resourceId,
  r2Key,
  children,
  fileName,
  className,
  style,
}: Props) {
  const [loading, setLoading] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    try {
      await openR2File({ key: r2Key, resource, resourceId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error abriendo archivo";
      message.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <a
      href="#"
      onClick={handleClick}
      className={className}
      style={{ cursor: loading ? "wait" : "pointer", ...style }}
      aria-busy={loading}
    >
      {children ?? fileName ?? "Abrir"}
    </a>
  );
}
