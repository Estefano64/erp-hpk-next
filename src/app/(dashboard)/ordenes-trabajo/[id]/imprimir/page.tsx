"use client";

// URL directa de impresión de una OT: /ordenes-trabajo/[id]/imprimir?secciones=...&orient=...
// Reusa <OTPrintDoc> (mismo layout que el modal del detalle). Útil para
// compartir un link o imprimir sin abrir el detalle.

import { use, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import OTPrintDoc from "@/components/modules/ordenes-trabajo/OTPrintDoc";

export default function ImprimirOTPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Preparando impresión…</div>}>
      <Contenido params={params} />
    </Suspense>
  );
}

function Contenido({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const sp = useSearchParams();
  const router = useRouter();
  const secciones = (sp.get("secciones") ?? "resumen").split(",").map((s) => s.trim()).filter(Boolean);
  const orient = sp.get("orient") === "horizontal" ? "horizontal" : "vertical";

  return (
    <div style={{ background: "#f5f5f5", minHeight: "100vh" }}>
      <div
        className="no-print"
        style={{ position: "sticky", top: 0, display: "flex", alignItems: "center", gap: 8, background: "#fff", borderBottom: "1px solid #ddd", padding: "10px 16px", zIndex: 10 }}
      >
        <b>Vista de impresión</b>
        <span style={{ flex: 1 }} />
        <button style={{ padding: "6px 14px", cursor: "pointer" }} onClick={() => window.print()}>🖨 Imprimir</button>
        <button style={{ padding: "6px 14px", cursor: "pointer" }} onClick={() => router.back()}>Volver</button>
      </div>
      <div style={{ maxWidth: 900, margin: "16px auto", background: "#fff", padding: 24, boxShadow: "0 1px 6px rgba(0,0,0,.15)" }}>
        <OTPrintDoc otId={Number(id)} secciones={secciones} orient={orient} autoPrint />
      </div>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .ant-layout-sider, .ant-layout-header { display: none !important; }
        }
      `}</style>
    </div>
  );
}
