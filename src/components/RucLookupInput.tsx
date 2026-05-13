"use client";

import { useState } from "react";
import { Input, Button, Tag, Space, message } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import type { FormInstance } from "antd";

interface SunatData {
  ruc: string;
  razon_social: string | null;
  direccion: string | null;
  estado: string | null;
  condicion: string | null;
}

interface Props {
  form: FormInstance;
  fieldName: string;
  targets: { razonSocial: string; direccion?: string };
  disabled?: boolean;
  placeholder?: string;
}

export function RucLookupInput({ form, fieldName, targets, disabled, placeholder }: Props) {
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<SunatData | null>(null);
  const [messageApi, contextHolder] = message.useMessage();

  async function lookup() {
    const ruc = String(form.getFieldValue(fieldName) ?? "").trim();
    if (!/^\d{11}$/.test(ruc)) {
      messageApi.warning("Ingresa un RUC válido de 11 dígitos");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/sunat/ruc/${ruc}`);
      const json = await res.json();
      if (!res.ok) {
        messageApi.error(json.error ?? "Error consultando SUNAT");
        setInfo(null);
        return;
      }
      const updates: Record<string, string> = {};
      if (json.razon_social) updates[targets.razonSocial] = json.razon_social;
      if (targets.direccion && json.direccion) updates[targets.direccion] = json.direccion;
      form.setFieldsValue(updates);
      setInfo(json);
      messageApi.success("Datos cargados desde SUNAT");
    } catch (e) {
      console.error(e);
      messageApi.error("No se pudo consultar SUNAT");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {contextHolder}
      <Space.Compact style={{ width: "100%" }}>
        <Input
          maxLength={11}
          disabled={disabled}
          placeholder={placeholder ?? "11 dígitos"}
          value={form.getFieldValue(fieldName)}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "");
            form.setFieldValue(fieldName, v);
            if (info) setInfo(null);
          }}
          onPressEnter={(e) => {
            e.preventDefault();
            lookup();
          }}
        />
        <Button icon={<SearchOutlined />} loading={loading} onClick={lookup} disabled={disabled}>
          SUNAT
        </Button>
      </Space.Compact>
      {info && (
        <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
          <Tag color={info.estado === "ACTIVO" ? "green" : "orange"}>{info.estado}</Tag>
          <Tag color={info.condicion === "HABIDO" ? "blue" : "orange"}>{info.condicion}</Tag>
        </div>
      )}
    </>
  );
}
