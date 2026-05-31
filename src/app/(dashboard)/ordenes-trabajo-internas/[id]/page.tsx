"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Alert, Button, Card, Tag, Space, Spin, Tabs, Row, Col, Form, Input, Select,
  DatePicker, App, Typography, Descriptions,
} from "antd";
import { useEditLock } from "@/lib/useEditLock";
import { useUnsavedChangesWarning } from "@/lib/unsaved-changes";
import {
  ArrowLeftOutlined, EditOutlined, SaveOutlined, CloseOutlined, ToolOutlined,
} from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { brand } from "@/lib/theme";
import { areasTallerGrouped, areaTallerLabel } from "@/lib/areas-taller";
import OTInternaAdjuntosTab from "@/components/modules/ordenes-trabajo-internas/OTInternaAdjuntosTab";
import OTInternaRequerimientosTab from "@/components/modules/ordenes-trabajo-internas/OTInternaRequerimientosTab";
import OTInternaHistorialTab from "@/components/modules/ordenes-trabajo-internas/OTInternaHistorialTab";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

interface CatalogOption { codigo: string; nombre: string }
interface EquipoOption { codigo: string; descripcion: string }
interface EstrategiaOption { estrategia_id: number; codigo: string; descripcion: string }
interface TrabajadorOpt { nombre: string; area: string; puesto: string }

interface OTInternaDetalle {
  id: number;
  ot: string | null;
  descripcion: string | null;
  planta_codigo: string | null;
  equipo_codigo: string | null;
  area_taller: string | null;
  semana_revision: string | null;
  task_list: string | null;
  estrategia_id: number | null;
  asignado_a: string | null;
  comentarios: string | null;
  fecha_creacion: string | null;
  fecha_inicio_plan: string | null;
  fecha_fin_plan: string | null;
  fecha_inicio_real: string | null;
  fecha_fin_real: string | null;
  fecha_cierre: string | null;
  usuario_crea: string | null;
  version: number;
  equipo: { codigo: string; descripcion: string } | null;
  planta: { codigo: string; nombre: string } | null;
  tipo_ot_interna: { codigo: string; nombre: string } | null;
  prioridad_atencion: { codigo: string; nombre: string } | null;
  estrategia: { estrategia_id: number; codigo: string; descripcion: string } | null;
  user_status: { codigo: string; nombre: string } | null;
  ot_status: { codigo: string; nombre: string } | null;
  recursos_status: { codigo: string; nombre: string } | null;
}

interface EditValues {
  tipo_ot_interna_codigo?: string;
  equipo_codigo?: string;
  area_taller?: string;
  descripcion?: string;
  planta_codigo?: string;
  prioridad_atencion_codigo?: string;
  semana_revision?: string;
  estrategia_id?: number;
  task_list?: string;
  user_status_codigo?: string;
  ot_status_codigo?: string;
  recursos_status_codigo?: string;
  asignado_a?: string;
  comentarios?: string;
  fecha_inicio_plan?: Dayjs | null;
  fecha_fin_plan?: Dayjs | null;
  fecha_inicio_real?: Dayjs | null;
  fecha_fin_real?: Dayjs | null;
  fecha_cierre?: Dayjs | null;
}

const PRIORIDAD_COLOR: Record<string, string> = {
  "1": "red", "2": "orange", "3": "default", "E": "volcano",
};

export default function OTInternaDetallePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { message } = App.useApp();
  const otId = Number(params?.id);
  const [form] = Form.useForm<EditValues>();
  const { data: session } = useSession();
  const currentUser = (session?.user?.name ?? session?.user?.email) ?? null;
  const lock = useEditLock("ot-interna", Number.isFinite(otId) && otId > 0 ? otId : null, currentUser);

  const [ot, setOt] = useState<OTInternaDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  useUnsavedChangesWarning(editing, "Estás editando esta OT interna. ¿Salir sin guardar?", `ot-interna-${otId}`);

  // Catálogos
  const [tipos, setTipos] = useState<CatalogOption[]>([]);
  const [equipos, setEquipos] = useState<EquipoOption[]>([]);
  const [plantas, setPlantas] = useState<CatalogOption[]>([]);
  const [prioridades, setPrioridades] = useState<CatalogOption[]>([]);
  const [userStatuses, setUserStatuses] = useState<CatalogOption[]>([]);
  const [otStatuses, setOtStatuses] = useState<CatalogOption[]>([]);
  const [recursosStatuses, setRecursosStatuses] = useState<CatalogOption[]>([]);
  const [estrategias, setEstrategias] = useState<EstrategiaOption[]>([]);
  const [trabajadores, setTrabajadores] = useState<TrabajadorOpt[]>([]);

  // El dropdown "Asignado a" en OTs internas muestra TODO el personal de
  // Logística (incluyendo jefe/compras/almacén) + Mantenimiento + Limpieza
  // + Software, más Antonio (Antonio Zumaeta Mendoza) por nombre.
  // Decisión del usuario (2026-05-28).
  const AREAS_ASIGNABLES_OT_INTERNA = new Set([
    "LOGISTICA",
    "MANTENIMIENTO",
    "LIMPIEZA",
    "SOFTWARE",
  ]);
  const trabajadoresAsignables = trabajadores.filter(
    (t) =>
      (t.area && AREAS_ASIGNABLES_OT_INTERNA.has(t.area.toUpperCase())) ||
      t.nombre.toLowerCase().includes("antonio"),
  );

  const fetchOt = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ordenes-trabajo-internas/${otId}`);
      if (res.ok) {
        const j = await res.json();
        setOt(j.data);
      } else {
        message.error("OT no encontrada");
      }
    } finally {
      setLoading(false);
    }
  }, [otId, message]);

  useEffect(() => {
    if (!Number.isFinite(otId) || otId <= 0) return;
    fetchOt();
  }, [otId, fetchOt]);

  useEffect(() => {
    (async () => {
      const [tRes, eRes, pRes, prRes, usRes, osRes, rsRes, estRes, trRes] = await Promise.all([
        fetch("/api/catalogos?tabla=tipoOTInterna"),
        fetch("/api/equipos?limit=500"),
        fetch("/api/catalogos?tabla=planta"),
        fetch("/api/catalogos?tabla=prioridadAtencion"),
        fetch("/api/catalogos?tabla=userStatus"),
        fetch("/api/catalogos?tabla=otStatus"),
        fetch("/api/catalogos?tabla=recursosStatus"),
        fetch("/api/catalogos?tabla=estrategia"),
        // No usamos soloOperarios=1 acá: necesitamos incluir JEFE DE LOGISTICA
        // y COMPRAS (que sí pueden ser asignados de OTs internas).
        fetch("/api/trabajadores?limit=200"),
      ]);
      if (tRes.ok) setTipos((await tRes.json()).data ?? []);
      if (eRes.ok) setEquipos((await eRes.json()).data ?? []);
      if (pRes.ok) setPlantas((await pRes.json()).data ?? []);
      if (prRes.ok) setPrioridades((await prRes.json()).data ?? []);
      if (usRes.ok) setUserStatuses((await usRes.json()).data ?? []);
      if (osRes.ok) setOtStatuses((await osRes.json()).data ?? []);
      if (rsRes.ok) setRecursosStatuses((await rsRes.json()).data ?? []);
      if (estRes.ok) setEstrategias((await estRes.json()).data ?? []);
      if (trRes.ok) setTrabajadores((await trRes.json()).data ?? []);
    })();
  }, []);

  async function startEditing() {
    if (!ot) return;
    const ok = await lock.acquire();
    if (!ok) {
      message.warning(
        lock.lockedBy
          ? `${lock.lockedBy} está editando esta OT.`
          : "No se pudo entrar a edición.",
      );
      return;
    }
    form.setFieldsValue({
      tipo_ot_interna_codigo: ot.tipo_ot_interna?.codigo,
      equipo_codigo: ot.equipo?.codigo,
      area_taller: ot.area_taller ?? undefined,
      descripcion: ot.descripcion ?? "",
      planta_codigo: ot.planta?.codigo,
      prioridad_atencion_codigo: ot.prioridad_atencion?.codigo,
      semana_revision: ot.semana_revision ?? undefined,
      estrategia_id: ot.estrategia?.estrategia_id,
      task_list: ot.task_list ?? undefined,
      user_status_codigo: ot.user_status?.codigo,
      ot_status_codigo: ot.ot_status?.codigo,
      recursos_status_codigo: ot.recursos_status?.codigo,
      asignado_a: ot.asignado_a ?? undefined,
      comentarios: ot.comentarios ?? undefined,
      fecha_inicio_plan: ot.fecha_inicio_plan ? dayjs(ot.fecha_inicio_plan) : null,
      fecha_fin_plan: ot.fecha_fin_plan ? dayjs(ot.fecha_fin_plan) : null,
      fecha_inicio_real: ot.fecha_inicio_real ? dayjs(ot.fecha_inicio_real) : null,
      fecha_fin_real: ot.fecha_fin_real ? dayjs(ot.fecha_fin_real) : null,
      fecha_cierre: ot.fecha_cierre ? dayjs(ot.fecha_cierre) : null,
    });
    setEditing(true);
  }

  async function handleSave() {
    if (!ot) return;
    try {
      const values = await form.validateFields();
      setSaving(true);
      const payload = {
        ...values,
        fecha_inicio_plan: values.fecha_inicio_plan ? values.fecha_inicio_plan.toISOString() : null,
        fecha_fin_plan: values.fecha_fin_plan ? values.fecha_fin_plan.toISOString() : null,
        fecha_inicio_real: values.fecha_inicio_real ? values.fecha_inicio_real.toISOString() : null,
        fecha_fin_real: values.fecha_fin_real ? values.fecha_fin_real.toISOString() : null,
        fecha_cierre: values.fecha_cierre ? values.fecha_cierre.toISOString() : null,
        version: ot.version,
      };
      const res = await fetch(`/api/ordenes-trabajo-internas/${otId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error" }));
        throw new Error(err.error ?? "Error al guardar");
      }
      message.success("OT actualizada");
      setEditing(false);
      void lock.release();
      fetchOt();
    } catch (e) {
      if (e instanceof Error) message.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  function cancelEditing() {
    setEditing(false);
    void lock.release();
  }

  if (!Number.isFinite(otId) || otId <= 0) {
    return <Card><div style={{ padding: 40, textAlign: "center" }}>OT inválida</div></Card>;
  }

  if (loading || !ot) {
    return <Card><div style={{ padding: 40, textAlign: "center" }}><Spin /></div></Card>;
  }

  const tipoTag = ot.tipo_ot_interna?.codigo;
  const tipoColor = tipoTag === "PREVENTIVA" ? "blue" : tipoTag === "CORRECTIVA" ? "orange" : "default";

  return (
    <div>
      {/* Header con gradiente */}
      <Card
        styles={{ body: { padding: "20px 24px" } }}
        style={{
          marginBottom: 16,
          background: `linear-gradient(135deg, ${brand.navy}, ${brand.cyan})`,
          color: brand.white,
          border: "none",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <Space size={10}>
              <ToolOutlined style={{ fontSize: 22 }} />
              <Title level={3} style={{ color: brand.white, margin: 0 }}>
                {ot.ot ?? `#${ot.id}`}
              </Title>
              {tipoTag && <Tag color={tipoColor} style={{ fontSize: 12 }}>{ot.tipo_ot_interna?.nombre}</Tag>}
              {ot.ot_status && <Tag color={ot.ot_status.codigo === "Abierta" ? "processing" : "default"}>{ot.ot_status.nombre}</Tag>}
              {ot.prioridad_atencion && (
                <Tag color={PRIORIDAD_COLOR[ot.prioridad_atencion.codigo] ?? "default"}>
                  Prio {ot.prioridad_atencion.codigo}
                </Tag>
              )}
            </Space>
            <div style={{ fontSize: 12, opacity: 0.9, marginTop: 4 }}>
              {ot.equipo ? `${ot.equipo.codigo} — ${ot.equipo.descripcion}` : "Sin equipo asignado"}
            </div>
          </div>
          <Space>
            {!editing ? (
              <Button
                icon={<EditOutlined />}
                onClick={startEditing}
                disabled={!lock.canEdit}
                title={!lock.canEdit && lock.lockedBy ? `Editando: ${lock.lockedBy}` : undefined}
                style={{ background: "rgba(255,255,255,0.18)", border: "none", color: brand.white }}
              >
                Editar
              </Button>
            ) : (
              <>
                <Button icon={<SaveOutlined />} type="primary" onClick={handleSave} loading={saving}>
                  Guardar
                </Button>
                <Button icon={<CloseOutlined />} onClick={cancelEditing}>
                  Cancelar
                </Button>
              </>
            )}
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => router.push("/ordenes-trabajo-internas")}
              style={{ background: "rgba(255,255,255,0.12)", border: "none", color: brand.white }}
            >
              Volver
            </Button>
          </Space>
        </div>
      </Card>

      {!lock.isOwner && lock.lockedBy && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={`${lock.lockedBy} está editando esta OT`}
          description="Solo podés ver hasta que termine. Si se quedó colgado el lock se libera solo a los 3 minutos."
        />
      )}

      <Tabs
        defaultActiveKey="detalle"
        items={[
          {
            key: "detalle",
            label: "Detalle",
            children: (
              <DetalleTab
                ot={ot}
                editing={editing}
                form={form}
                catalogos={{ tipos, equipos, plantas, prioridades, userStatuses, otStatuses, recursosStatuses, estrategias, trabajadores: trabajadoresAsignables }}
              />
            ),
          },
          {
            key: "tareas",
            label: "Tareas",
            children: <TareasTab ot={ot} editing={editing} form={form} />,
          },
          {
            key: "requerimientos",
            label: "Requerimientos",
            children: <OTInternaRequerimientosTab otInternaId={otId} />,
          },
          {
            key: "adjuntos",
            label: "Adjuntos",
            children: <OTInternaAdjuntosTab otId={otId} />,
          },
          {
            key: "historial",
            label: "Historial",
            children: <OTInternaHistorialTab otId={otId} />,
          },
        ]}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Tab Detalle
// ───────────────────────────────────────────────────────────────────────────
function DetalleTab({ ot, editing, form, catalogos }: {
  ot: OTInternaDetalle;
  editing: boolean;
  form: ReturnType<typeof Form.useForm<EditValues>>[0];
  catalogos: {
    tipos: CatalogOption[]; equipos: EquipoOption[]; plantas: CatalogOption[];
    prioridades: CatalogOption[]; userStatuses: CatalogOption[]; otStatuses: CatalogOption[];
    recursosStatuses: CatalogOption[]; estrategias: EstrategiaOption[]; trabajadores: TrabajadorOpt[];
  };
}) {
  if (!editing) {
    return (
      <Card size="small">
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} bordered size="small">
          <Descriptions.Item label="Tipo">{ot.tipo_ot_interna?.nombre ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="Área del taller">
            {ot.area_taller
              ? areaTallerLabel(ot.area_taller)
              : ot.equipo ? `${ot.equipo.codigo} — ${ot.equipo.descripcion}` : "—"}
          </Descriptions.Item>
          <Descriptions.Item label="Planta">{ot.planta?.nombre ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="Prioridad">{ot.prioridad_atencion?.nombre ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="Semana revisión">{ot.semana_revision ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="Asignado a">{ot.asignado_a ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="OT Status">{ot.ot_status?.nombre ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="User Status">{ot.user_status?.nombre ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="Recursos Status">{ot.recursos_status?.nombre ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="Inicio planificado">{ot.fecha_inicio_plan ? dayjs(ot.fecha_inicio_plan).format("DD/MM/YY HH:mm") : "—"}</Descriptions.Item>
          <Descriptions.Item label="Fin planificado">{ot.fecha_fin_plan ? dayjs(ot.fecha_fin_plan).format("DD/MM/YY HH:mm") : "—"}</Descriptions.Item>
          <Descriptions.Item label="Inicio real">{ot.fecha_inicio_real ? dayjs(ot.fecha_inicio_real).format("DD/MM/YY HH:mm") : "—"}</Descriptions.Item>
          <Descriptions.Item label="Fin real">{ot.fecha_fin_real ? dayjs(ot.fecha_fin_real).format("DD/MM/YY HH:mm") : "—"}</Descriptions.Item>
          <Descriptions.Item label="Cierre">{ot.fecha_cierre ? dayjs(ot.fecha_cierre).format("DD/MM/YY HH:mm") : "—"}</Descriptions.Item>
          <Descriptions.Item label="Estrategia">{ot.estrategia ? `${ot.estrategia.codigo}` : "—"}</Descriptions.Item>
          <Descriptions.Item label="Descripción" span={3}>
            <Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>{ot.descripcion ?? "—"}</Paragraph>
          </Descriptions.Item>
          <Descriptions.Item label="Comentarios" span={3}>
            <Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>{ot.comentarios ?? "—"}</Paragraph>
          </Descriptions.Item>
        </Descriptions>
        <div style={{ marginTop: 12, fontSize: 11, color: brand.textSecondary }}>
          Creada por <b>{ot.usuario_crea ?? "—"}</b>
          {ot.fecha_creacion && <> · {dayjs(ot.fecha_creacion).format("DD/MM/YYYY HH:mm")}</>}
          {" · "}v{ot.version}
        </div>
      </Card>
    );
  }

  return (
    <Card size="small">
      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Form.Item name="tipo_ot_interna_codigo" label="Tipo" rules={[{ required: true }]}>
              <Select showSearch optionFilterProp="label" options={catalogos.tipos.map((t) => ({ value: t.codigo, label: t.nombre }))} />
            </Form.Item>
          </Col>
          <Col xs={24} md={16}>
            <Form.Item name="area_taller" label="Área del taller" rules={[{ required: true }]}>
              <Select
                placeholder="Elegí un área o sub-área"
                showSearch
                optionFilterProp="label"
                options={areasTallerGrouped()}
              />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item
              name="equipo_codigo"
              label="Equipo (opcional)"
              tooltip="Si la OT es para un equipo específico del taller, seleccionalo."
            >
              <Select
                placeholder="Buscar equipo (código o descripción)"
                showSearch
                allowClear
                optionFilterProp="label"
                options={catalogos.equipos.map((e) => ({ value: e.codigo, label: `${e.codigo} — ${e.descripcion}` }))}
              />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="descripcion" label="Descripción" rules={[{ required: true }]}>
              <TextArea rows={2} maxLength={500} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="planta_codigo" label="Planta">
              <Select showSearch optionFilterProp="label" allowClear options={catalogos.plantas.map((p) => ({ value: p.codigo, label: p.nombre }))} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="prioridad_atencion_codigo" label="Prioridad">
              <Select showSearch optionFilterProp="label" allowClear options={catalogos.prioridades.map((p) => ({ value: p.codigo, label: p.nombre }))} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="semana_revision" label="Semana revisión">
              <Input placeholder="2026W18" maxLength={10} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="asignado_a" label="Asignado a">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                options={catalogos.trabajadores.map((t) => ({ value: t.nombre, label: `${t.nombre} — ${t.area}` }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="ot_status_codigo" label="OT Status">
              <Select showSearch optionFilterProp="label" options={catalogos.otStatuses.map((s) => ({ value: s.codigo, label: s.nombre }))} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="user_status_codigo" label="User Status">
              <Select showSearch optionFilterProp="label" allowClear options={catalogos.userStatuses.map((s) => ({ value: s.codigo, label: s.nombre }))} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="recursos_status_codigo" label="Recursos Status">
              <Select showSearch optionFilterProp="label" allowClear options={catalogos.recursosStatuses.map((s) => ({ value: s.codigo, label: s.nombre }))} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="fecha_inicio_plan" label="Inicio plan">
              <DatePicker showTime format="DD/MM/YY HH:mm" style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="fecha_fin_plan" label="Fin plan">
              <DatePicker showTime format="DD/MM/YY HH:mm" style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="fecha_inicio_real" label="Inicio real">
              <DatePicker showTime format="DD/MM/YY HH:mm" style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="fecha_fin_real" label="Fin real">
              <DatePicker showTime format="DD/MM/YY HH:mm" style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="fecha_cierre" label="Cierre">
              <DatePicker showTime format="DD/MM/YY HH:mm" style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="estrategia_id" label="Estrategia">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                options={catalogos.estrategias.map((e) => ({ value: e.estrategia_id, label: `${e.codigo} — ${e.descripcion}` }))}
              />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="comentarios" label="Comentarios">
              <TextArea rows={3} maxLength={2000} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Tab Tareas — por ahora solo el campo task_list (texto libre)
// ───────────────────────────────────────────────────────────────────────────
function TareasTab({ ot, editing, form }: {
  ot: OTInternaDetalle;
  editing: boolean;
  form: ReturnType<typeof Form.useForm<EditValues>>[0];
}) {
  if (!editing) {
    return (
      <Card size="small">
        <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
          Lista de tareas / actividades a realizar en esta OT. Referencia libre a tareas del
          catálogo (ej. &quot;MP1 · Cambio aceite trimestral&quot;).
        </Text>
        <Paragraph style={{ whiteSpace: "pre-wrap", minHeight: 80, background: brand.bgPage, padding: 12, borderRadius: 4 }}>
          {ot.task_list || "Sin tareas definidas. Hacé click en Editar para agregar."}
        </Paragraph>
      </Card>
    );
  }

  return (
    <Card size="small">
      <Form form={form} layout="vertical">
        <Form.Item name="task_list" label="Task list (referencia libre)" tooltip="Una tarea por línea. En el futuro se vinculará al catálogo de Tarea.">
          <TextArea rows={10} maxLength={5000} placeholder={"MP1 · Cambio aceite trimestral\nMP2 · Limpieza filtros\n..."} />
        </Form.Item>
      </Form>
    </Card>
  );
}

