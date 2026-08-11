"use client";

// Componentes de fotos del módulo SSOMA - SIG.
//
//   - SsomaFotosUpload: para modales de crear/cerrar. Sube las fotos a R2 vía
//     el upload-url del módulo ANTES de que exista el registro (namespace
//     plano, como tickets) y mantiene la lista en el estado del form padre.
//     El preview usa un object URL local (la key aún no está registrada en BD,
//     así que no se puede firmar un download todavía).
//   - SsomaFotosGaleria: para el drawer de detalle / edición. Muestra las
//     fotos YA registradas con R2Image y permite borrarlas (si editable).
import { useEffect, useRef, useState } from "react";
import { Button, Card, Image, Popconfirm, Space, Typography, Upload, App } from "antd";
import { CameraOutlined, DeleteOutlined, PaperClipOutlined } from "@ant-design/icons";
import { uploadToR2, openR2File, type R2Resource } from "@/lib/r2-client";
import { R2Image } from "@/components/R2Image";
import { space as spc, radius } from "@/lib/theme";

const { Text } = Typography;

export interface FotoPendiente {
  key: string;
  nombre_archivo: string;
  tipo_mime: string;
  tamano: number;
  // Preview local (URL.createObjectURL) — se revoca al desmontar.
  localUrl: string;
}

export function SsomaFotosUpload({
  uploadUrlEndpoint,
  value,
  onChange,
  max,
  label = "Agregar foto",
}: {
  uploadUrlEndpoint: string;
  value: FotoPendiente[];
  onChange: (fotos: FotoPendiente[]) => void;
  max?: number;
  label?: string;
}) {
  const { message } = App.useApp();
  const [subiendo, setSubiendo] = useState(false);
  // Object URLs creados por esta instancia — se revocan al desmontar.
  const urlsRef = useRef<string[]>([]);
  useEffect(() => {
    const urls = urlsRef.current;
    return () => { urls.forEach((u) => URL.revokeObjectURL(u)); };
  }, []);

  async function subir(file: File) {
    setSubiendo(true);
    try {
      const meta = await uploadToR2({ file, uploadUrlEndpoint });
      const localUrl = URL.createObjectURL(file);
      urlsRef.current.push(localUrl);
      const nueva: FotoPendiente = { ...meta, localUrl };
      onChange(max === 1 ? [nueva] : [...value, nueva]);
    } catch (e) {
      message.error((e as Error).message || "Error subiendo la foto");
    } finally {
      setSubiendo(false);
    }
  }

  const llena = max != null && max > 1 && value.length >= max;

  return (
    <div>
      <Upload
        accept="image/*"
        showUploadList={false}
        disabled={subiendo || llena}
        beforeUpload={(file) => {
          void subir(file);
          return false; // no auto-upload de antd: lo manejamos nosotros
        }}
      >
        <Button icon={<CameraOutlined />} loading={subiendo} disabled={llena}>
          {label}
        </Button>
      </Upload>
      {value.length > 0 && (
        <Space wrap style={{ marginTop: spc.sm }}>
          {value.map((f) => (
            <Card
              key={f.key}
              size="small"
              styles={{ body: { padding: spc.xs } }}
              style={{ width: 112 }}
            >
              <Image
                src={f.localUrl}
                alt={f.nombre_archivo}
                width={96}
                height={72}
                style={{ objectFit: "cover", borderRadius: radius.sm }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Text ellipsis style={{ fontSize: 11, flex: 1 }} title={f.nombre_archivo}>
                  {f.nombre_archivo}
                </Text>
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => onChange(value.filter((x) => x.key !== f.key))}
                />
              </div>
            </Card>
          ))}
        </Space>
      )}
    </div>
  );
}

export interface FotoRegistrada {
  id: number;
  r2_key: string;
  nombre_archivo: string;
}

export function SsomaFotosGaleria({
  fotos,
  resource,
  editable = false,
  onDelete,
}: {
  fotos: FotoRegistrada[];
  resource: R2Resource;
  editable?: boolean;
  onDelete?: (fotoId: number) => void;
}) {
  if (fotos.length === 0) {
    return <Text type="secondary">Sin fotos.</Text>;
  }
  return (
    <Space wrap>
      {fotos.map((f) => (
        <Card key={f.id} size="small" styles={{ body: { padding: spc.xs } }} style={{ width: 132 }}>
          <a
            onClick={(e) => {
              e.preventDefault();
              void openR2File({ key: f.r2_key, resource, resourceId: f.id });
            }}
            title="Abrir en tamaño completo"
          >
            <R2Image
              resource={resource}
              resourceId={f.id}
              r2Key={f.r2_key}
              alt={f.nombre_archivo}
              style={{ width: 116, height: 84, objectFit: "cover", borderRadius: radius.sm, cursor: "pointer" }}
            />
          </a>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Text ellipsis style={{ fontSize: 11, flex: 1 }} title={f.nombre_archivo}>
              <PaperClipOutlined /> {f.nombre_archivo}
            </Text>
            {editable && onDelete && (
              <Popconfirm
                title="¿Eliminar esta foto?"
                okText="Eliminar"
                okButtonProps={{ danger: true }}
                cancelText="Cancelar"
                onConfirm={() => onDelete(f.id)}
              >
                <Button size="small" type="text" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            )}
          </div>
        </Card>
      ))}
    </Space>
  );
}
