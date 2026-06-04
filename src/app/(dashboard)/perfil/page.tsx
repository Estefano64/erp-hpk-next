"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Typography, Card, Form, Input, Button, App, Space, Tag, Descriptions,
  Divider, Select, Alert, Modal,
} from "antd";
import {
  UserOutlined, LockOutlined, SafetyOutlined, KeyOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { brand, space as spc } from "@/lib/theme";

const { Title, Text } = Typography;

type Me = {
  id: string;
  name: string | null;
  email: string | null;
  roles: string[];
};

type UsuarioMin = {
  id: number;
  codigoEmpleado: string;
  email: string | null;
  nombre: string;
  roles: string[];
  activo: boolean;
};

// Etiquetas de rol con color (mismo criterio que el resto de la app).
const ROL_TAG: Record<string, { label: string; color: string }> = {
  admin: { label: "Admin", color: "magenta" },
  viewer: { label: "Viewer", color: "default" },
  tecnico: { label: "Técnico", color: "cyan" },
  evaluador: { label: "Evaluador", color: "geekblue" },
  aprobador_evaluacion: { label: "Aprobador hojas", color: "purple" },
  aprobador_requerimiento: { label: "Aprobador requerimientos", color: "volcano" },
  planner: { label: "Planner", color: "blue" },
  supervisor: { label: "Supervisor", color: "blue" },
  logistica: { label: "Logística", color: "orange" },
  mantenimiento: { label: "Mantenimiento", color: "green" },
  contabilidad: { label: "Contabilidad", color: "gold" },
};

export default function PerfilPage() {
  const { message, modal } = App.useApp();
  const [me, setMe] = useState<Me | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);

  // Form de cambio propio
  const [form] = Form.useForm<{ actual: string; nueva: string; confirmacion: string }>();
  const [saving, setSaving] = useState(false);

  // Sección admin
  const esAdmin = useMemo(() => (me?.roles ?? []).includes("admin"), [me]);
  const [usuarios, setUsuarios] = useState<UsuarioMin[]>([]);
  const [usuariosLoading, setUsuariosLoading] = useState(false);
  const [usuarioSel, setUsuarioSel] = useState<number | null>(null);
  const [adminForm] = Form.useForm<{ nueva: string; confirmacion: string }>();
  const [adminSaving, setAdminSaving] = useState(false);

  const cargarMe = useCallback(async () => {
    setLoadingMe(true);
    try {
      const res = await fetch("/api/me");
      if (!res.ok) {
        setMe(null);
        return;
      }
      const data = await res.json();
      setMe(data?.user ?? null);
    } finally {
      setLoadingMe(false);
    }
  }, []);

  const cargarUsuarios = useCallback(async () => {
    setUsuariosLoading(true);
    try {
      const res = await fetch("/api/usuarios");
      if (!res.ok) return;
      const json = await res.json();
      setUsuarios(Array.isArray(json?.data) ? json.data : []);
    } finally {
      setUsuariosLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargarMe();
  }, [cargarMe]);

  useEffect(() => {
    if (esAdmin) void cargarUsuarios();
  }, [esAdmin, cargarUsuarios]);

  async function onSubmitPropio() {
    try {
      const v = await form.validateFields();
      setSaving(true);
      const res = await fetch("/api/me/cambiar-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(json?.error ?? "No se pudo cambiar la contraseña");
        return;
      }
      message.success("Contraseña actualizada");
      form.resetFields();
    } catch {
      /* validateFields ya muestra los errores en el form */
    } finally {
      setSaving(false);
    }
  }

  async function onSubmitAdmin() {
    if (!usuarioSel) {
      message.warning("Elegí un usuario primero");
      return;
    }
    const target = usuarios.find((u) => u.id === usuarioSel);
    if (!target) return;
    try {
      const v = await adminForm.validateFields();
      modal.confirm({
        title: `¿Resetear la contraseña de ${target.nombre}?`,
        content: (
          <div>
            <p>
              La nueva contraseña reemplaza la actual. El usuario podrá
              entrar inmediatamente con ella.
            </p>
            <p style={{ color: brand.textSecondary, marginTop: spc.sm }}>
              Recordá comunicársela por un canal seguro y pedirle que la
              cambie desde su propio perfil.
            </p>
          </div>
        ),
        okText: "Resetear",
        okButtonProps: { danger: true },
        cancelText: "Cancelar",
        onOk: async () => {
          setAdminSaving(true);
          try {
            const res = await fetch(`/api/usuarios/${target.id}/cambiar-password`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(v),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
              message.error(json?.error ?? "No se pudo resetear");
              return;
            }
            message.success(json?.message ?? "Contraseña reseteada");
            adminForm.resetFields();
            setUsuarioSel(null);
          } finally {
            setAdminSaving(false);
          }
        },
      });
    } catch {
      /* validateFields */
    }
  }

  const usuarioSelObj = usuarios.find((u) => u.id === usuarioSel) ?? null;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <Title level={3} style={{ marginBottom: spc.lg }}>
        <UserOutlined style={{ marginRight: spc.sm, color: brand.navy }} />
        Mi perfil
      </Title>

      <Card
        loading={loadingMe}
        style={{ marginBottom: spc.lg }}
        title={
          <Space>
            <UserOutlined />
            <span>Datos de mi cuenta</span>
          </Space>
        }
        extra={
          <Button
            icon={<ReloadOutlined />}
            size="small"
            onClick={() => void cargarMe()}
          >
            Recargar
          </Button>
        }
      >
        {me ? (
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Nombre">
              <Text strong>{me.name ?? "—"}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Email / Código">{me.email ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="Roles">
              {(me.roles ?? []).length === 0 ? (
                <Text type="secondary">Sin roles</Text>
              ) : (
                <Space size={[4, 4]} wrap>
                  {me.roles.map((r) => {
                    const info = ROL_TAG[r] ?? { label: r, color: "default" };
                    return (
                      <Tag key={r} color={info.color}>
                        {info.label}
                      </Tag>
                    );
                  })}
                </Space>
              )}
            </Descriptions.Item>
          </Descriptions>
        ) : (
          <Alert type="warning" message="No se pudo cargar tu información" showIcon />
        )}
      </Card>

      <Card
        title={
          <Space>
            <LockOutlined />
            <span>Cambiar mi contraseña</span>
          </Space>
        }
        style={{ marginBottom: spc.lg }}
      >
        <Form
          form={form}
          layout="vertical"
          autoComplete="off"
          onFinish={onSubmitPropio}
          requiredMark
        >
          <Form.Item
            label="Contraseña actual"
            name="actual"
            rules={[{ required: true, message: "Ingresá tu contraseña actual" }]}
          >
            <Input.Password
              prefix={<KeyOutlined />}
              placeholder="Tu contraseña actual"
              autoComplete="current-password"
            />
          </Form.Item>

          <Form.Item
            label="Nueva contraseña"
            name="nueva"
            rules={[
              { required: true, message: "Ingresá la nueva contraseña" },
              { min: 6, message: "Mínimo 6 caracteres" },
              { max: 100, message: "Máximo 100 caracteres" },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="Mínimo 6 caracteres"
              autoComplete="new-password"
            />
          </Form.Item>

          <Form.Item
            label="Confirmá la nueva contraseña"
            name="confirmacion"
            dependencies={["nueva"]}
            rules={[
              { required: true, message: "Repetí la nueva contraseña" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("nueva") === value) return Promise.resolve();
                  return Promise.reject(new Error("Las contraseñas no coinciden"));
                },
              }),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="Repetí la nueva contraseña"
              autoComplete="new-password"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={saving} icon={<SafetyOutlined />}>
              Cambiar contraseña
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {esAdmin && (
        <>
          <Divider titlePlacement="start">Administración</Divider>
          <Card
            title={
              <Space>
                <SafetyOutlined />
                <span>Resetear contraseña de otro usuario</span>
              </Space>
            }
          >
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: spc.md }}
              message="Reseteo de soporte (sin contraseña actual)"
              description="Esta acción NO requiere la contraseña previa del usuario. Es para casos en que la olvidó. El nuevo valor reemplaza al anterior; comunicalo por un canal seguro y pedile que lo cambie desde su propio perfil."
            />

            <Form
              form={adminForm}
              layout="vertical"
              autoComplete="off"
              onFinish={onSubmitAdmin}
              requiredMark
            >
              <Form.Item label="Usuario" required>
                <Select
                  showSearch
                  loading={usuariosLoading}
                  placeholder="Buscá por nombre, código o email"
                  value={usuarioSel ?? undefined}
                  onChange={(v) => setUsuarioSel(v)}
                  optionFilterProp="label"
                  options={usuarios.map((u) => ({
                    value: u.id,
                    label: `${u.nombre} — ${u.codigoEmpleado}${u.email ? ` (${u.email})` : ""}${
                      u.activo ? "" : " [inactivo]"
                    }`,
                  }))}
                  notFoundContent={
                    usuariosLoading ? "Cargando..." : "Sin resultados"
                  }
                  allowClear
                  onClear={() => setUsuarioSel(null)}
                />
              </Form.Item>

              {usuarioSelObj && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: spc.md }}
                  message={
                    <span>
                      Vas a resetear la contraseña de{" "}
                      <Text strong>{usuarioSelObj.nombre}</Text> (
                      {usuarioSelObj.codigoEmpleado})
                    </span>
                  }
                />
              )}

              <Form.Item
                label="Nueva contraseña"
                name="nueva"
                rules={[
                  { required: true, message: "Ingresá la nueva contraseña" },
                  { min: 6, message: "Mínimo 6 caracteres" },
                  { max: 100, message: "Máximo 100 caracteres" },
                ]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
                />
              </Form.Item>

              <Form.Item
                label="Confirmá la nueva contraseña"
                name="confirmacion"
                dependencies={["nueva"]}
                rules={[
                  { required: true, message: "Repetí la nueva contraseña" },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue("nueva") === value) return Promise.resolve();
                      return Promise.reject(new Error("Las contraseñas no coinciden"));
                    },
                  }),
                ]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="Repetí la nueva contraseña"
                  autoComplete="new-password"
                />
              </Form.Item>

              <Form.Item style={{ marginBottom: 0 }}>
                <Button
                  type="primary"
                  danger
                  htmlType="submit"
                  loading={adminSaving}
                  disabled={!usuarioSel}
                  icon={<KeyOutlined />}
                >
                  Resetear contraseña
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </>
      )}
    </div>
  );
}
