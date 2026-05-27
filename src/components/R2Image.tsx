"use client";

// Renderiza una imagen guardada en R2 pidiendo una presigned URL al montar.
import { useEffect, useState } from "react";
import { getDownloadUrl, type R2Resource } from "@/lib/r2-client";

interface Props {
  resource: R2Resource;
  resourceId: number;
  r2Key: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
}

type FetchState =
  | { status: "loading"; r2Key: string }
  | { status: "ready"; r2Key: string; url: string }
  | { status: "error"; r2Key: string; message: string };

export function R2Image({ resource, resourceId, r2Key, alt, className, style }: Props) {
  const [state, setState] = useState<FetchState>({ status: "loading", r2Key });

  // Si la r2Key cambió, ya devolvimos el estado correcto en el render derivando
  // r2Key del state. Solo iniciamos el fetch dentro del effect.
  const needsReset = state.r2Key !== r2Key;
  const effectiveState: FetchState = needsReset ? { status: "loading", r2Key } : state;

  useEffect(() => {
    let cancelled = false;
    getDownloadUrl({ key: r2Key, resource, resourceId })
      .then((url) => {
        if (!cancelled) setState({ status: "ready", r2Key, url });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            r2Key,
            message: err instanceof Error ? err.message : "Error cargando imagen",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [r2Key, resource, resourceId]);

  if (effectiveState.status === "error") {
    return <span style={{ color: "#a8071a", fontSize: 12 }}>{effectiveState.message}</span>;
  }
  if (effectiveState.status === "loading") {
    return <span style={{ color: "#888", fontSize: 12 }}>Cargando…</span>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={effectiveState.url} alt={alt} className={className} style={style} />;
}
