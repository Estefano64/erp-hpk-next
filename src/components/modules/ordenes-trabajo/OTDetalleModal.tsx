"use client";

import { useState } from "react";
import { Modal, Button } from "antd";
import { CloseOutlined, ExclamationCircleOutlined } from "@ant-design/icons";
import { brand } from "@/lib/theme";
import OTDetalleContent from "./OTDetalleContent";

interface Props {
  otId: number | null;
  open: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}

export default function OTDetalleModal({ otId, open, onClose, onUpdated }: Props) {
  const [dirty, setDirty] = useState(false);
  const [confirmModal, contextHolder] = Modal.useModal();

  function attemptClose() {
    if (!dirty) {
      onClose();
      return;
    }
    confirmModal.confirm({
      title: "¿Cerrar sin guardar?",
      icon: <ExclamationCircleOutlined />,
      content: "Tenés cambios sin guardar. Si cerrás ahora se perderán.",
      okText: "Cerrar igual",
      okButtonProps: { danger: true },
      cancelText: "Volver a editar",
      onOk: onClose,
    });
  }

  return (
    <Modal
      open={open}
      onCancel={attemptClose}
      footer={null}
      width="90vw"
      style={{ top: 20 }}
      styles={{
        body: { padding: 0 },
        header: { display: "none" },
      }}
      destroyOnHidden
    >
      {contextHolder}
      <OTDetalleContent
        otId={otId}
        onUpdated={onUpdated}
        roundedHeader
        onDirtyChange={setDirty}
        headerActions={
          <Button
            icon={<CloseOutlined />}
            onClick={attemptClose}
            size="small"
            style={{ background: "rgba(255,255,255,0.12)", border: "none", color: brand.white }}
          >
            Cerrar
          </Button>
        }
      />
    </Modal>
  );
}
