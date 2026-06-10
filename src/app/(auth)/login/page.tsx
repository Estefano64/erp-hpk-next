"use client";

import { Suspense, useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, Form, Input, Alert } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { brand } from "@/lib/theme";

// Wrapper requerido por Next.js: useSearchParams obliga a estar dentro de
// <Suspense> porque puede pausar el render durante el static prerender.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const expired = searchParams?.get("expired") === "1";
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Si ya está logueado, redirigir a dashboard
  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.user) router.replace("/dashboard");
      })
      .catch(() => { /* ignore */ });
  }, [router]);

  async function onFinish(values: { identifier: string; password: string }) {
    setLoading(true);
    setError(null);

    const res = await signIn("credentials", {
      identifier: values.identifier,
      password: values.password,
      redirect: false,
    });

    setLoading(false);

    if (res?.error) {
      setError("Credenciales inválidas");
      return;
    }

    router.push("/dashboard");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `linear-gradient(135deg, ${brand.navy} 0%, #2a3f7a 100%)`,
      }}
    >
      <Card
        style={{
          width: 420,
          borderRadius: 12,
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          border: "none",
        }}
        styles={{ body: { padding: "40px 32px 32px" } }}
      >
        {/* Coloca tu logo en public/logo.png */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}>
          <img
            src="/logo.png"
            alt="Logo empresa"
            width={180}
            height={65}
            style={{ objectFit: "contain" }}
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        </div>

        {expired && !error && (
          <Alert
            type="warning"
            showIcon
            closable
            style={{ marginBottom: 16 }}
            title="Tu sesión expiró por inactividad"
            description="Volvé a ingresar para continuar."
          />
        )}

        {error && (
          <Alert
            title={error}
            type="error"
            showIcon
            closable
            style={{ marginBottom: 16 }}
            onClose={() => setError(null)}
          />
        )}

        <Form layout="vertical" onFinish={onFinish} autoComplete="off" size="large">
          <Form.Item
            name="identifier"
            label="Email o código de empleado"
            rules={[{ required: true, message: "Ingresá tu email o código" }]}
          >
            <Input
              prefix={<UserOutlined style={{ color: brand.textSecondary }} />}
              placeholder="usuario@empresa.com o código"
            />
          </Form.Item>

          <Form.Item
            name="password"
            label="Contraseña"
            rules={[{ required: true, message: "Ingresa tu contraseña" }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: brand.textSecondary }} />}
              placeholder="Contraseña"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
            <Button type="primary" htmlType="submit" loading={loading} block>
              Iniciar sesión
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
