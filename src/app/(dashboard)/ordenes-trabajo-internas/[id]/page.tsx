"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Alert, Button, Card, Tag, Space, Spin, Tabs, Row, Col, Form, Input, Select,
  DatePicker, App, Typography, Tooltip, Modal, Table, Empty,
} from "antd";
import type { FormInstance } from "antd";
import { useEditLock } from "@/lib/useEditLock";
import { useUnsavedChangesWarning } from "@/lib/unsaved-changes";
import {
  ArrowLeftOutlined, EditOutlined, SaveOutlined, CloseOutlined, ToolOutlined,
  FilePdfOutlined,
} from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { brand } from "@/lib/theme";
import { areasTallerGrouped, areaTallerLabel } from "@/lib/areas-taller";
import { formatOtInternaCodigo } from "@/lib/ot-formato";
import OTInternaAdjuntosTab from "@/components/modules/ordenes-trabajo-internas/OTInternaAdjuntosTab";
import OTInternaRequerimientosTab from "@/components/modules/ordenes-trabajo-internas/OTInternaRequerimientosTab";
import OTInternaHistorialTab from "@/components/modules/ordenes-trabajo-internas/OTInternaHistorialTab";
import OTCostosTab from "@/components/modules/ordenes-trabajo/OTCostosTab";
import { DescargarOTExcelButton } from "@/components/DescargarOTExcelButton";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

interface CatalogOption { codigo: string; nombre: string }
interface EquipoOption { codigo: string; descripcion: string }
interface EstrategiaOption { estrategia_id: number; codigo: string; descripcion: string; equipo_codigo: string | null; actividad_codigo: string | null }
interface TrabajadorOpt { nombre: string; area: string; puesto: string }

interface OTInternaDetalle {
  id: number;
  // ot ahora es INTEGER (NNNNYY); el display OIXXXXYY lo construye
  // formatOtInternaCodigo.
  ot: number | string | null;
  descripcion: string | null;
  planta_codigo: string | null;
  equipo_codigo: string | null;
  area_taller: string | null;
  semana_revision: string | null;
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
  // Flag: la OT nació de una solicitud de mantenimiento operativa (no de
  // planificación). Default false.
  solicitud_mantenimiento: boolean;
  // Aprobación manual de la OT (flujo BORRADOR → SIN_APROBACION → APROBADA/RECHAZADA).
  aprobacion_status_codigo: string | null;
  fecha_envio_aprobacion: string | null;
  usuario_envia_aprobacion: string | null;
  fecha_aprobacion: string | null;
  usuario_aprueba: string | null;
  comentario_aprobacion: string | null;
  equipo: { codigo: string; descripcion: string } | null;
  planta: { codigo: string; nombre: string } | null;
  tipo_ot_interna: { codigo: string; nombre: string } | null;
  prioridad_atencion: { codigo: string; nombre: string } | null;
  estrategia: { estrategia_id: number; codigo: string; descripcion: string; actividad_codigo?: string | null } | null;
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

// Mapeo del aprobacion_status_codigo a color/label para el Tag del header.
const APROBACION_META: Record<string, { color: string; label: string }> = {
  BORRADOR: { color: "default", label: "Borrador" },
  SIN_APROBACION: { color: "orange", label: "Pendiente aprobación" },
  APROBADA: { color: "green", label: "Aprobada" },
  RECHAZADA: { color: "red", label: "Rechazada" },
};

const ACCION_META: Record<
  "enviar" | "aprobar" | "rechazar" | "reabrir",
  { titulo: string; ok: string; comentarioRequerido: boolean; danger?: boolean }
> = {
  enviar: { titulo: "Enviar OT a aprobación", ok: "Enviar", comentarioRequerido: false },
  aprobar: { titulo: "Aprobar OT", ok: "Aprobar", comentarioRequerido: false },
  rechazar: { titulo: "Rechazar OT", ok: "Rechazar", comentarioRequerido: true, danger: true },
  reabrir: { titulo: "Reabrir OT a borrador", ok: "Reabrir", comentarioRequerido: false },
};

export default function OTInternaDetallePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  // Tab inicial: lee `?tab=` del URL — permite linkear directo a un tab
  // (ej. desde la columna "Reqs" de la tabla principal → ?tab=requerimientos).
  const searchParams = useSearchParams();
  const tabInicial = (() => {
    const t = searchParams.get("tab");
    const validos = new Set(["detalle", "tareas", "requerimientos", "costos", "adjuntos", "historial"]);
    return t && validos.has(t) ? t : "detalle";
  })();
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
  // Flujo de aprobación: modal abierto + acción objetivo + textarea de comentario.
  // Mantenemos un único modal y cambiamos el copy/severidad según la acción.
  const [aprobacionModal, setAprobacionModal] = useState<{
    accion: "enviar" | "aprobar" | "rechazar" | "reabrir";
  } | null>(null);
  const [aprobacionComentario, setAprobacionComentario] = useState("");
  const [aprobacionSaving, setAprobacionSaving] = useState(false);
  // Resumen de costos (real + estimado) para mostrar en el header. Se llena
  // con una llamada al endpoint /costos en mount — el cálculo es liviano
  // porque OT interna no tiene HH ni OCs joinables pesadas.
  const [costosResumen, setCostosResumen] = useState<{
    real: Record<string, number>;
    estimado: Record<string, number>;
  } | null>(null);
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

  // Cargar costos en mount — solo lectura para mostrar en el header.
  // El tab Costos hace su propia carga, no compartimos estado para no
  // acoplar. Si el costo cambia mientras se está editando otra cosa, el
  // header puede quedar desactualizado hasta refresh (aceptable).
  useEffect(() => {
    if (!Number.isFinite(otId) || otId <= 0) return;
    fetch(`/api/ordenes-trabajo-internas/${otId}/costos`)
      .then(async (r) => {
        if (!r.ok) return;
        const j = await r.json();
        const d = j.data;
        if (!d) return;
        setCostosResumen({
          real: d.ejecutado?.total_por_moneda ?? {},
          estimado: d.proyectado?.total_por_moneda ?? {},
        });
      })
      .catch(() => { /* sin costos no rompemos el detalle */ });
  }, [otId]);

  useEffect(() => {
    (async () => {
      const [tRes, eRes, pRes, prRes, usRes, osRes, rsRes, estRes, trRes] = await Promise.all([
        fetch("/api/catalogos?tabla=tipoOTInterna"),
        fetch("/api/equipos?limit=10000"),
        fetch("/api/catalogos?tabla=planta"),
        fetch("/api/catalogos?tabla=prioridadAtencion"),
        fetch("/api/catalogos?tabla=userStatus"),
        fetch("/api/catalogos?tabla=otStatus"),
        fetch("/api/catalogos?tabla=recursosStatus"),
        fetch("/api/catalogos?tabla=estrategia"),
        // No usamos soloOperarios=1 acá: necesitamos incluir JEFE DE LOGISTICA
        // y COMPRAS (que sí pueden ser asignados de OTs internas).
        fetch("/api/trabajadores?limit=10000"),
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
      const payload: Record<string, unknown> = {
        ...values,
        fecha_inicio_plan: values.fecha_inicio_plan ? values.fecha_inicio_plan.toISOString() : null,
        fecha_fin_plan: values.fecha_fin_plan ? values.fecha_fin_plan.toISOString() : null,
        fecha_inicio_real: values.fecha_inicio_real ? values.fecha_inicio_real.toISOString() : null,
        fecha_fin_real: values.fecha_fin_real ? values.fecha_fin_real.toISOString() : null,
        fecha_cierre: values.fecha_cierre ? values.fecha_cierre.toISOString() : null,
        version: ot.version,
      };
      // Defensa explícita: `usuario_crea` es inmutable. Si por cualquier razón
      // futura el form llegara a tener un input con ese name (no debería), lo
      // descartamos acá antes de enviar. El backend ya lo borra también — esto
      // es defensa en profundidad.
      delete payload.usuario_crea;
      delete payload.fecha_creacion;
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

  function abrirAprobacion(accion: "enviar" | "aprobar" | "rechazar" | "reabrir") {
    setAprobacionComentario("");
    setAprobacionModal({ accion });
  }

  async function confirmarAprobacion() {
    if (!aprobacionModal) return;
    const meta = ACCION_META[aprobacionModal.accion];
    const comentario = aprobacionComentario.trim();
    if (meta.comentarioRequerido && !comentario) {
      message.error("El comentario es obligatorio para rechazar.");
      return;
    }
    setAprobacionSaving(true);
    try {
      const res = await fetch(`/api/ordenes-trabajo-internas/${otId}/aprobacion`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: aprobacionModal.accion, comentario }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Error en la transición");
      message.success(`${meta.titulo} — ok`);
      setAprobacionModal(null);
      fetchOt();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Error");
    } finally {
      setAprobacionSaving(false);
    }
  }

  if (!Number.isFinite(otId) || otId <= 0) {
    return <Card><div style={{ padding: 40, textAlign: "center" }}>OT inválida</div></Card>;
  }

  if (loading || !ot) {
    return <Card><div style={{ padding: 40, textAlign: "center" }}><Spin /></div></Card>;
  }

  const tipoTag = ot.tipo_ot_interna?.codigo;
  // Aceptamos códigos viejos por compat:
  //   ESTRATEGICA / PREVENTIVA → azul (con estrategia + task_list)
  //   NO_ESTRATEGICA / CORRECTIVA → naranja (sin estrategia, improvisada)
  const tipoColor = tipoTag === "ESTRATEGICA" || tipoTag === "PREVENTIVA"
    ? "blue"
    : tipoTag === "NO_ESTRATEGICA" || tipoTag === "CORRECTIVA" ? "orange" : "default";

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
            <Space size={10} wrap>
              <ToolOutlined style={{ fontSize: 22 }} />
              <Title level={3} style={{ color: brand.white, margin: 0 }}>
                {formatOtInternaCodigo(ot.ot, `#${ot.id}`)}
              </Title>
              {tipoTag && <Tag color={tipoColor} style={{ fontSize: 12 }}>{ot.tipo_ot_interna?.nombre}</Tag>}
              {ot.ot_status && <Tag color={ot.ot_status.codigo === "Abierta" ? "processing" : "default"}>{ot.ot_status.nombre}</Tag>}
              {ot.prioridad_atencion && (
                <Tag color={PRIORIDAD_COLOR[ot.prioridad_atencion.codigo] ?? "default"}>
                  Prio {ot.prioridad_atencion.codigo}
                </Tag>
              )}
              {(() => {
                const code = ot.aprobacion_status_codigo ?? "BORRADOR";
                const meta = APROBACION_META[code] ?? APROBACION_META.BORRADOR;
                return <Tag color={meta.color}>{meta.label}</Tag>;
              })()}
            </Space>
            <div style={{ fontSize: 12, opacity: 0.9, marginTop: 4 }}>
              {ot.equipo ? `${ot.equipo.codigo} — ${ot.equipo.descripcion}` : "Sin equipo asignado"}
            </div>
            {costosResumen && (() => {
              // Resumen de costos en el header. Si todo es 0 no mostramos
              // nada para no agregar ruido visual.
              const fmtMonedas = (m: Record<string, number>) => {
                const e = Object.entries(m).filter(([, n]) => n > 0);
                if (e.length === 0) return null;
                return e
                  .map(([cur, n]) => `${cur} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
                  .join(" · ");
              };
              const real = fmtMonedas(costosResumen.real);
              const estimado = fmtMonedas(costosResumen.estimado);
              if (!real && !estimado) return null;
              return (
                <div style={{ fontSize: 12, opacity: 0.95, marginTop: 6 }}>
                  {real && (
                    <Tag color="success" style={{ marginRight: 6 }}>
                      Costo real: {real}
                    </Tag>
                  )}
                  {estimado && (
                    <Tag color="processing" style={{ marginRight: 6 }}>
                      Costo estimado: {estimado}
                    </Tag>
                  )}
                </div>
              );
            })()}
          </div>
          <Space wrap>
            {(() => {
              const code = ot.aprobacion_status_codigo ?? "BORRADOR";
              const btnStyle = { background: "rgba(255,255,255,0.18)", border: "none", color: brand.white };
              if (code === "BORRADOR" || code === "RECHAZADA") {
                return (
                  <Button onClick={() => abrirAprobacion("enviar")} style={btnStyle}>
                    Enviar a aprobación
                  </Button>
                );
              }
              if (code === "SIN_APROBACION") {
                return (
                  <>
                    <Button type="primary" onClick={() => abrirAprobacion("aprobar")}>
                      Aprobar
                    </Button>
                    <Button danger onClick={() => abrirAprobacion("rechazar")}>
                      Rechazar
                    </Button>
                  </>
                );
              }
              if (code === "APROBADA") {
                return (
                  <Button onClick={() => abrirAprobacion("reabrir")} style={btnStyle}>
                    Reabrir
                  </Button>
                );
              }
              return null;
            })()}
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
            <DescargarOTExcelButton otId={ot.id} tipo="interna" />
            <Tooltip title="Descarga el PDF en formato HPK-M-F-07 (Reporte de Mantenimiento Correctivo) con los datos de esta OT interna. Los adjuntos se listan por nombre.">
              <Button
                icon={<FilePdfOutlined />}
                onClick={() => window.open(`/api/ordenes-trabajo-internas/${ot.id}/reporte-correctivo/pdf`, "_blank")}
                style={{ background: "#cf1322", color: "#fff", borderColor: "#cf1322" }}
              >
                Reporte Correctivo (PDF)
              </Button>
            </Tooltip>
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
          title={`${lock.lockedBy} está editando esta OT`}
          description="Solo podés ver hasta que termine. Si se quedó colgado el lock se libera solo a los 3 minutos."
        />
      )}

      <Tabs
        defaultActiveKey={tabInicial}
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
            key: "costos",
            label: "Costos",
            children: <OTCostosTab otId={otId} kind="interna" />,
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

      <Modal
        title={aprobacionModal ? ACCION_META[aprobacionModal.accion].titulo : ""}
        open={!!aprobacionModal}
        onCancel={() => (aprobacionSaving ? null : setAprobacionModal(null))}
        onOk={confirmarAprobacion}
        confirmLoading={aprobacionSaving}
        okText={aprobacionModal ? ACCION_META[aprobacionModal.accion].ok : "OK"}
        okButtonProps={{ danger: aprobacionModal?.accion === "rechazar" }}
        destroyOnHidden
      >
        {aprobacionModal && (
          <>
            <Paragraph style={{ marginBottom: 12 }}>
              {aprobacionModal.accion === "enviar" && "La OT pasará a SIN_APROBACION y otro usuario deberá aprobarla o rechazarla."}
              {aprobacionModal.accion === "aprobar" && "La OT quedará APROBADA y podrá ejecutarse."}
              {aprobacionModal.accion === "rechazar" && "La OT quedará RECHAZADA. El creador podrá corregir y reenviar. El comentario es obligatorio."}
              {aprobacionModal.accion === "reabrir" && "La OT volverá a BORRADOR y deberá enviarse nuevamente a aprobación."}
            </Paragraph>
            <FieldLabel>
              Comentario {ACCION_META[aprobacionModal.accion].comentarioRequerido && <Text type="danger">*</Text>}
            </FieldLabel>
            <TextArea
              rows={4}
              maxLength={500}
              value={aprobacionComentario}
              onChange={(e) => setAprobacionComentario(e.target.value)}
              placeholder={
                aprobacionModal.accion === "rechazar"
                  ? "Indicá el motivo del rechazo…"
                  : "Comentario opcional"
              }
            />
          </>
        )}
      </Modal>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers de presentación — espejan los de OTDetalleContent.tsx (OT externa)
// para mantener consistencia visual entre ambos detalles.
// ───────────────────────────────────────────────────────────────────────────
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <Text type="secondary" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3 }}>
        {label}
      </Text>
      <div style={{ fontSize: 14, color: "rgba(0,0,0,0.85)", lineHeight: 1.3, marginTop: 1 }}>
        {value == null || value === "" ? <span style={{ color: "#bfbfbf" }}>—</span> : value}
      </div>
    </div>
  );
}

// Select de Estrategia filtrado por el equipo elegido en el form. El user
// quiere ver solo los PM (estrategias) del equipo de la OT. Si no hay equipo
// seleccionado, dejamos el select vacío con placeholder explicativo.
function EstrategiaSelect({
  form, estrategias,
}: {
  form: FormInstance<EditValues>;
  estrategias: EstrategiaOption[];
}) {
  const equipoCodigo = Form.useWatch("equipo_codigo", form);
  // Solo PMs (PM1..PM4) del equipo. Antes se mostraban TODAS las estrategias
  // del equipo y la lista quedaba demasiado larga.
  const filtradas = !equipoCodigo
    ? []
    : estrategias
        .filter((e) => e.equipo_codigo === equipoCodigo)
        .filter((e) => {
          const cod = (e.codigo ?? "").toUpperCase();
          const act = (e.actividad_codigo ?? "").toUpperCase();
          return /^PM[1-4]$/.test(cod) || /^PM[1-4]$/.test(act);
        });
  return (
    <Form.Item name="estrategia_id" label="Estrategia" style={{ marginBottom: 0 }}>
      <Select
        allowClear showSearch optionFilterProp="label"
        placeholder={!equipoCodigo
          ? "Elegí un equipo primero"
          : filtradas.length === 0
            ? "Este equipo no tiene PMs cargados"
            : "Elegí PM1 / PM2 / PM3 / PM4"}
        options={filtradas.map((e) => ({ value: e.estrategia_id, label: `${e.codigo} — ${e.descripcion}` }))}
      />
    </Form.Item>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text type="secondary" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3, display: "block", marginBottom: 4 }}>
      {children}
    </Text>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${brand.border}` }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: brand.navy, letterSpacing: 0.2 }}>{children}</span>
    </div>
  );
}

const fmtFecha = (d: string | null | undefined) => (d ? dayjs(d).format("DD/MM/YYYY HH:mm") : null);
const fmtFechaSolo = (d: string | null | undefined) => (d ? dayjs(d).format("DD/MM/YYYY") : null);

// ───────────────────────────────────────────────────────────────────────────
// Tab Detalle — refactor 2026-06: pasamos de un único Descriptions a varios
// Cards con secciones (Identificación / Estados y Asignación / Planificación /
// Fechas / Comentarios). Mismo estilo visual que el detalle de OT externa
// (OTDetalleContent.tsx) para consistencia entre ambos módulos.
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
  const cardStyle = { marginBottom: 16, borderColor: brand.border };
  const cardBody = { body: { padding: 16 } };

  if (!editing) {
    return (
      <div>
        {/* ── Identificación ───────────────────────────────────────── */}
        <Card size="small" styles={cardBody} style={cardStyle}>
          <SectionTitle>Identificación</SectionTitle>
          <Row gutter={[16, 4]}>
            <Col xs={12} md={6}><Field label="Nro OT" value={formatOtInternaCodigo(ot.ot)} /></Col>
            <Col xs={12} md={6}><Field label="Tipo" value={ot.tipo_ot_interna?.nombre} /></Col>
            <Col xs={12} md={6}><Field label="Área asignada" value={ot.area_taller ? areaTallerLabel(ot.area_taller) : null} /></Col>
            <Col xs={12} md={6}><Field label="Planta" value={ot.planta?.nombre} /></Col>
          </Row>
          <Row gutter={[16, 4]}>
            <Col xs={24} md={12}>
              <Field
                label="Equipo"
                value={ot.equipo
                  ? <span><b>{ot.equipo.descripcion}</b> <span style={{ color: brand.textSecondary }}>({ot.equipo.codigo})</span></span>
                  : null}
              />
            </Col>
            <Col xs={12} md={6}><Field label="Prioridad" value={ot.prioridad_atencion?.nombre} /></Col>
            <Col xs={12} md={6}><Field label="Solicitud Mtto" value={ot.solicitud_mantenimiento ? "Sí" : "No"} /></Col>
          </Row>
          <Row gutter={[16, 4]}>
            <Col span={24}>
              <Field
                label="Descripción"
                value={ot.descripcion
                  ? <Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap", fontSize: 14 }}>{ot.descripcion}</Paragraph>
                  : null}
              />
            </Col>
          </Row>
        </Card>

        {/* ── Estados y Asignación ─────────────────────────────────── */}
        <Card size="small" styles={cardBody} style={cardStyle}>
          <SectionTitle>Estados y Asignación</SectionTitle>
          <Row gutter={[16, 4]}>
            <Col xs={12} md={6}>
              <Field
                label="OT Status"
                value={ot.ot_status?.nombre
                  ? <Tag color={ot.ot_status.codigo === "Abierta" ? "processing" : ot.ot_status.codigo === "Cerrada" ? "success" : "default"}>{ot.ot_status.nombre}</Tag>
                  : null}
              />
            </Col>
            <Col xs={12} md={6}>
              <Field
                label="User Status"
                value={ot.user_status?.nombre ? <Tag>{ot.user_status.nombre}</Tag> : null}
              />
            </Col>
            <Col xs={12} md={6}><Field label="Recursos Status" value={ot.recursos_status?.nombre} /></Col>
            <Col xs={12} md={6}><Field label="Asignado a" value={ot.asignado_a} /></Col>
          </Row>
        </Card>

        {/* ── Planificación ────────────────────────────────────────── */}
        <Card size="small" styles={cardBody} style={cardStyle}>
          <SectionTitle>Planificación</SectionTitle>
          <Row gutter={[16, 4]}>
            <Col xs={12} md={6}><Field label="Semana revisión" value={ot.semana_revision} /></Col>
            <Col xs={12} md={6}>
              <Field
                label="Estrategia"
                value={ot.estrategia ? `${ot.estrategia.codigo}${ot.estrategia.descripcion ? ` — ${ot.estrategia.descripcion}` : ""}` : null}
              />
            </Col>
          </Row>
        </Card>

        {/* ── Fechas ───────────────────────────────────────────────── */}
        <Card size="small" styles={cardBody} style={cardStyle}>
          <SectionTitle>Fechas</SectionTitle>
          <Row gutter={[16, 4]}>
            <Col xs={12} md={6}><Field label="Inicio Planificado" value={fmtFecha(ot.fecha_inicio_plan)} /></Col>
            <Col xs={12} md={6}><Field label="Fin Planificado" value={fmtFecha(ot.fecha_fin_plan)} /></Col>
            <Col xs={12} md={6}><Field label="Inicio Real" value={fmtFecha(ot.fecha_inicio_real)} /></Col>
            <Col xs={12} md={6}><Field label="Fin Real" value={fmtFecha(ot.fecha_fin_real)} /></Col>
          </Row>
          <Row gutter={[16, 4]}>
            <Col xs={12} md={6}><Field label="Cierre" value={fmtFecha(ot.fecha_cierre)} /></Col>
          </Row>
        </Card>

        {/* ── Comentarios (solo si tiene contenido) ───────────────── */}
        {ot.comentarios && (
          <Card size="small" styles={cardBody} style={cardStyle}>
            <SectionTitle>Comentarios</SectionTitle>
            <Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap", fontSize: 14 }}>
              {ot.comentarios}
            </Paragraph>
          </Card>
        )}

        {/* ── Footer de auditoría ──────────────────────────────────── */}
        <div style={{
          marginTop: 8, padding: "10px 16px", background: "#FAFAFA",
          border: `1px solid ${brand.border}`, borderRadius: 6, fontSize: 11,
          color: "rgba(0,0,0,0.55)", display: "flex", gap: 24, flexWrap: "wrap",
        }}>
          <div>
            <span style={{ color: "#888" }}>Creada por:</span>{" "}
            <b style={{ color: brand.navy }}>{ot.usuario_crea ?? "—"}</b>
            {ot.fecha_creacion && (
              <>
                {" · "}<span style={{ color: "#888" }}>el</span>{" "}
                <b>{fmtFechaSolo(ot.fecha_creacion)}</b>
              </>
            )}
          </div>
          <div>
            <span style={{ color: "#888" }}>Versión:</span>{" "}
            <b>v{ot.version}</b>
          </div>
        </div>
      </div>
    );
  }

  // ── Vista EDICIÓN — mismas secciones, pero con inputs editables ──
  return (
    <Form form={form} layout="vertical">
      {/* Identificación */}
      <Card size="small" styles={cardBody} style={cardStyle}>
        <SectionTitle>Identificación</SectionTitle>
        <Row gutter={[16, 12]}>
          <Col xs={24} md={8}>
            <Form.Item name="tipo_ot_interna_codigo" label="Tipo" rules={[{ required: true }]} style={{ marginBottom: 0 }}>
              <Select showSearch optionFilterProp="label" options={catalogos.tipos.map((t) => ({ value: t.codigo, label: t.nombre }))} />
            </Form.Item>
          </Col>
          <Col xs={24} md={16}>
            <Form.Item name="area_taller" label="Área asignada" rules={[{ required: true }]} style={{ marginBottom: 0 }}>
              <Select placeholder="Elegí un área o sub-área" showSearch optionFilterProp="label" options={areasTallerGrouped()} />
            </Form.Item>
          </Col>
          <Col xs={24} md={16}>
            <Form.Item name="equipo_codigo" label="Equipo" tooltip="Si la OT es para un equipo específico del taller, seleccionalo." style={{ marginBottom: 0 }}>
              <Select
                placeholder="Buscar equipo (código o descripción)"
                showSearch allowClear optionFilterProp="label"
                options={catalogos.equipos.map((e) => ({ value: e.codigo, label: `${e.codigo} — ${e.descripcion}` }))}
              />
            </Form.Item>
          </Col>
          <Col xs={12} md={4}>
            <Form.Item name="planta_codigo" label="Planta" style={{ marginBottom: 0 }}>
              <Select showSearch optionFilterProp="label" allowClear options={catalogos.plantas.map((p) => ({ value: p.codigo, label: p.nombre }))} />
            </Form.Item>
          </Col>
          <Col xs={12} md={4}>
            <Form.Item name="prioridad_atencion_codigo" label="Prioridad" style={{ marginBottom: 0 }}>
              <Select showSearch optionFilterProp="label" allowClear options={catalogos.prioridades.map((p) => ({ value: p.codigo, label: p.nombre }))} />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="descripcion" label="Descripción" rules={[{ required: true }]} style={{ marginBottom: 0 }}>
              <TextArea rows={2} maxLength={500} />
            </Form.Item>
          </Col>
        </Row>
      </Card>

      {/* Estados y Asignación */}
      <Card size="small" styles={cardBody} style={cardStyle}>
        <SectionTitle>Estados y Asignación</SectionTitle>
        <Row gutter={[16, 12]}>
          <Col xs={24} md={8}>
            <Form.Item name="ot_status_codigo" label="OT Status" style={{ marginBottom: 0 }}>
              <Select showSearch optionFilterProp="label" options={catalogos.otStatuses.map((s) => ({ value: s.codigo, label: s.nombre }))} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="user_status_codigo" label="User Status" style={{ marginBottom: 0 }}>
              <Select showSearch optionFilterProp="label" allowClear options={catalogos.userStatuses.map((s) => ({ value: s.codigo, label: s.nombre }))} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="recursos_status_codigo" label="Recursos Status" style={{ marginBottom: 0 }}>
              <Select showSearch optionFilterProp="label" allowClear options={catalogos.recursosStatuses.map((s) => ({ value: s.codigo, label: s.nombre }))} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="asignado_a" label="Asignado a" style={{ marginBottom: 0 }}>
              <Select
                allowClear showSearch optionFilterProp="label"
                options={catalogos.trabajadores.map((t) => ({ value: t.nombre, label: `${t.nombre} — ${t.area}` }))}
              />
            </Form.Item>
          </Col>
          <Col span={24}>
            <CierreGuardAlert form={form} ot={ot} />
          </Col>
        </Row>
      </Card>

      {/* Planificación */}
      <Card size="small" styles={cardBody} style={cardStyle}>
        <SectionTitle>Planificación</SectionTitle>
        <Row gutter={[16, 12]}>
          <Col xs={12} md={6}>
            <Form.Item name="semana_revision" label="Semana revisión" style={{ marginBottom: 0 }}>
              <Input placeholder="2026W18" maxLength={10} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            {/* Estrategia filtrada por el equipo seleccionado. Si el form
                aún no tiene equipo, mostramos vacío con placeholder.
                Form.useWatch hace que la lista se reactivize cuando el
                user cambia de equipo. */}
            <EstrategiaSelect form={form} estrategias={catalogos.estrategias} />
          </Col>
        </Row>
      </Card>

      {/* Fechas */}
      <Card size="small" styles={cardBody} style={cardStyle}>
        <SectionTitle>Fechas</SectionTitle>
        <Row gutter={[16, 12]}>
          <Col xs={12} md={6}>
            <Form.Item name="fecha_inicio_plan" label="Inicio Planificado" style={{ marginBottom: 0 }}>
              <DatePicker showTime format="DD/MM/YY HH:mm" style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="fecha_fin_plan" label="Fin Planificado" style={{ marginBottom: 0 }}>
              <DatePicker showTime format="DD/MM/YY HH:mm" style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="fecha_inicio_real" label="Inicio Real" style={{ marginBottom: 0 }}>
              <DatePicker showTime format="DD/MM/YY HH:mm" style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="fecha_fin_real" label="Fin Real" style={{ marginBottom: 0 }}>
              <DatePicker showTime format="DD/MM/YY HH:mm" style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="fecha_cierre" label="Cierre" style={{ marginBottom: 0 }}>
              <DatePicker showTime format="DD/MM/YY HH:mm" style={{ width: "100%" }} />
            </Form.Item>
          </Col>
        </Row>
      </Card>

      {/* Comentarios */}
      <Card size="small" styles={cardBody} style={cardStyle}>
        <SectionTitle>Comentarios</SectionTitle>
        <Form.Item name="comentarios" style={{ marginBottom: 0 }}>
          <TextArea rows={3} maxLength={2000} />
        </Form.Item>
      </Card>
    </Form>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Tab Tareas
//
// Cambio (pedido del user): se eliminó el textarea libre `task_list` del
// formulario. Ahora el tab Tareas muestra DIRECTAMENTE las tareas del
// catálogo de TaskList correspondientes al equipo + estrategia PM de la OT
// (con cascada acumulativa PM1 ⊂ PM2 ⊂ PM3 ⊂ PM4), igual que en OT externa.
//
// El listado es read-only acá — para materializar los items como
// requerimientos, se usa el botón "Aplicar Task List" del tab Requerimientos
// (que invoca /requerimientos/aplicar-tasklist).
// ───────────────────────────────────────────────────────────────────────────
function TareasTab({ ot }: {
  ot: OTInternaDetalle;
  editing: boolean;
  form: ReturnType<typeof Form.useForm<EditValues>>[0];
}) {
  const { message } = App.useApp();
  const [tareas, setTareas] = useState<Array<{ actividad_codigo: string; descripcion: string }>>([]);
  const [cascada, setCascada] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // El nivel PM está en `actividad_codigo` — `codigo` es el ID arbitrario
  // tipo "EST-0059". Convención oficial: PM1/PM2/PM3/PM4.
  const estrCodigo = ot.estrategia?.actividad_codigo;
  const esPM = !!estrCodigo && /^PM[1-4]$/i.test(estrCodigo);
  const puedeListar = !!ot.equipo_codigo && esPM;

  useEffect(() => {
    if (!puedeListar) {
      setTareas([]);
      setCascada([]);
      return;
    }
    let cancelado = false;
    setLoading(true);
    fetch(`/api/ordenes-trabajo-internas/${ot.id}/tareas/preview-tasklist`)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error ?? "Error al cargar tareas");
        }
        return r.json();
      })
      .then((j) => {
        if (cancelado) return;
        setTareas(j.tareas ?? []);
        setCascada(j.cascada ?? []);
      })
      .catch((e) => { if (!cancelado) message.error(e instanceof Error ? e.message : "Error"); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [ot.id, puedeListar, ot.equipo_codigo, estrCodigo, message]);

  if (!puedeListar) {
    return (
      <Card size="small">
        <Empty
          description={
            <div>
              <div style={{ fontSize: 13, marginBottom: 4 }}>Sin tareas para mostrar</div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Asigná un <b>equipo</b> y una <b>estrategia PM</b> (PM1/PM2/PM3/PM4) en el tab Detalle
                para ver las tareas del task list correspondiente.
              </Text>
            </div>
          }
        />
      </Card>
    );
  }

  // Vista única (sin edit mode): tabla con las tareas del PM seleccionado.
  return (
    <Card size="small">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 12, flexWrap: "wrap" }}>
        <div>
          <Text strong style={{ fontSize: 13 }}>
            Tareas — equipo <Tag style={{ margin: 0 }}>{ot.equipo_codigo}</Tag>{" "}
            estrategia <Tag color="blue" style={{ margin: 0 }}>{estrCodigo}</Tag>
          </Text>
          {cascada.length > 1 && (
            <div style={{ fontSize: 11, color: brand.textSecondary, marginTop: 2 }}>
              Incluye cascada acumulativa: {cascada.join(" + ")}
            </div>
          )}
        </div>
        <Text type="secondary" style={{ fontSize: 11 }}>
          Para generar los requerimientos de estas tareas, usá el botón <b>Aplicar Task List</b> en el tab Requerimientos.
        </Text>
      </div>
      <Table
        size="small"
        loading={loading}
        rowKey={(_r, idx) => String(idx)}
        dataSource={tareas}
        pagination={false}
        scroll={{ x: 700 }}
        locale={{ emptyText: "No hay tareas en el catálogo para este equipo + PM" }}
        columns={[
          {
            title: "#", key: "idx", width: 50, align: "right",
            render: (_v, _r, i) => <Text type="secondary">{i + 1}</Text>,
          },
          {
            title: "PM", dataIndex: "actividad_codigo", key: "pm", width: 70,
            render: (v: string) => <Tag color="blue" style={{ margin: 0, fontFamily: "monospace" }}>{v}</Tag>,
          },
          {
            title: "Tarea", dataIndex: "descripcion", key: "descripcion",
            render: (v: string) => <span style={{ fontSize: 13 }}>{v}</span>,
          },
        ]}
      />
    </Card>
  );
}

// Alert que aparece al intentar cerrar la OT y faltan campos. Espeja la
// validación del backend (PUT /api/ordenes-trabajo-internas/[id]) — feedback
// inmediato sin esperar el 409.
function CierreGuardAlert({
  form,
  ot,
}: {
  form: FormInstance<EditValues>;
  ot: OTInternaDetalle;
}) {
  const otStatus = Form.useWatch("ot_status_codigo", form);
  const recursos = Form.useWatch("recursos_status_codigo", form);
  const asignado = Form.useWatch("asignado_a", form);
  const fInicioReal = Form.useWatch("fecha_inicio_real", form);
  const fFinReal = Form.useWatch("fecha_fin_real", form);

  if (otStatus !== "Cerrada" || ot.ot_status?.codigo === "Cerrada") return null;

  const faltantes: string[] = [];
  if (!fInicioReal) faltantes.push("Fecha de inicio real");
  if (!fFinReal) faltantes.push("Fecha de fin real");
  if (!asignado) faltantes.push("Asignado a");
  if (recursos !== "Recursos completos") faltantes.push("Recursos completos");
  if (ot.aprobacion_status_codigo !== "APROBADA") faltantes.push("Aprobación (debe estar APROBADA)");

  if (faltantes.length === 0) return null;

  return (
    <Alert
      type="warning"
      showIcon
      style={{ marginTop: 8 }}
      message="Para cerrar la OT faltan campos"
      description={
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {faltantes.map((f) => <li key={f}>{f}</li>)}
        </ul>
      }
    />
  );
}

