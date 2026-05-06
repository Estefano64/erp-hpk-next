"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button, Card, Modal } from "antd";
import { ArrowLeftOutlined, ExclamationCircleOutlined } from "@ant-design/icons";
import { brand } from "@/lib/theme";
import OTDetalleContent from "@/components/modules/ordenes-trabajo/OTDetalleContent";

export default function OTDetallePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const otId = Number(params?.id);
  const [dirty, setDirty] = useState(false);
  const [confirmModal, contextHolder] = Modal.useModal();

  // Advertir antes de cerrar/refrescar la pestaña con cambios pendientes
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirty) return;
      e.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function goBack() {
    if (!dirty) {
      router.push("/ordenes-trabajo");
      return;
    }
    confirmModal.confirm({
      title: "¿Salir sin guardar?",
      icon: <ExclamationCircleOutlined />,
      content: "Tenés cambios sin guardar. Si salís ahora se perderán.",
      okText: "Salir igual",
      okButtonProps: { danger: true },
      cancelText: "Volver a editar",
      onOk: () => router.push("/ordenes-trabajo"),
    });
  }

  if (!Number.isFinite(otId) || otId <= 0) {
    return (
      <Card>
        <div style={{ padding: 40, textAlign: "center" }}>OT no válida.</div>
      </Card>
    );
  }

  return (
    <Card styles={{ body: { padding: 0 } }} style={{ overflow: "hidden" }}>
      {contextHolder}
      <OTDetalleContent
        otId={otId}
        onDirtyChange={setDirty}
        headerActions={
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={goBack}
            size="small"
            style={{ background: "rgba(255,255,255,0.12)", border: "none", color: brand.white }}
          >
            Volver
          </Button>
        }
      />
    </Card>
  );
}
