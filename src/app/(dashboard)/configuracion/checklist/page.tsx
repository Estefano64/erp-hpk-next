"use client";

// Checklist de funcionalidades del ERP HP&K.
//
// Lista exhaustiva de features agrupadas por sección. El usuario marca cada una
// a medida que la verifica. El estado se persiste en localStorage por usuario
// (no requiere backend) y queda disponible para futuras sesiones en el mismo
// navegador.
//
// Cómo agregar una nueva funcionalidad: editar `SECCIONES` abajo. Cada item
// necesita un `id` ESTABLE (string único) — si lo cambiás, la marca previa se
// pierde. Mejor agregar un id nuevo que renombrar uno existente.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Typography, Card, Checkbox, Space, Button, Row, Col, Statistic, Progress,
  App, Tooltip, Collapse, Input, Tag, Empty, Modal,
} from "antd";
import {
  CheckSquareOutlined, ReloadOutlined, SearchOutlined, ExportOutlined,
  DeleteOutlined, LinkOutlined, EyeOutlined, EyeInvisibleOutlined,
} from "@ant-design/icons";
import { brand, space as spc } from "@/lib/theme";

const { Title, Text } = Typography;

interface Item {
  id: string;
  label: string;
  /** Descripción corta — qué chequear concretamente. */
  detalle?: string;
  /** Ruta del ERP donde se prueba (opcional, agrega botón "Ir"). */
  ruta?: string;
}

interface Seccion {
  id: string;
  titulo: string;
  descripcion?: string;
  items: Item[];
}

// ────────────────────────────────────────────────────────────────────────────
// Catálogo de funcionalidades. Mantener IDs estables.
// ────────────────────────────────────────────────────────────────────────────
const SECCIONES: Seccion[] = [
  {
    id: "auth",
    titulo: "Autenticación y usuarios",
    descripcion: "Login, sesiones, perfiles y administración de cuentas.",
    items: [
      { id: "auth.login", label: "Login con email o código de empleado", ruta: "/login" },
      { id: "auth.idle", label: "Auto-logout por inactividad" },
      { id: "auth.session-8h", label: "Sesión máxima de 8 horas" },
      { id: "auth.perfil-ver", label: "Mi perfil — ver datos y roles", ruta: "/perfil" },
      { id: "auth.perfil-cambio", label: "Mi perfil — cambiar mi propia contraseña (requiere actual)", ruta: "/perfil" },
      { id: "auth.admin-reset", label: "Admin — resetear contraseña de otro usuario (sin actual)", ruta: "/perfil" },
      { id: "auth.tecnico-restringido", label: "Técnico restringido solo ve Dashboard / Mis Tareas / Tickets" },
    ],
  },
  {
    id: "rrhh",
    titulo: "RR/HH — Trabajadores",
    items: [
      { id: "rrhh.list", label: "Listar trabajadores con filtros (área, activo/inactivo)", ruta: "/rrhh/trabajadores" },
      { id: "rrhh.crear", label: "Crear / editar / desactivar trabajador", ruta: "/rrhh/trabajadores" },
      { id: "rrhh.cuenta", label: "Asociar cuenta de usuario (crear nueva o vincular existente)", ruta: "/rrhh/trabajadores" },
      { id: "rrhh.cuenta-roles", label: "Asignar múltiples roles a una cuenta (multi-rol)" },
      { id: "rrhh.vista-tecnico", label: "Gerente — vista de técnico por DNI (read-only)", ruta: "/rrhh/trabajadores" },
    ],
  },
  {
    id: "aprobaciones",
    titulo: "Aprobaciones",
    descripcion: "Aprobar / rechazar OCs y Requerimientos pendientes.",
    items: [
      { id: "aprob.oc-aprobar", label: "Aprobar OC (PEND_OC → PROCESO)", ruta: "/aprobaciones" },
      { id: "aprob.oc-rechazar", label: "Rechazar OC con motivo (→ ANULADO + propaga a OTRepuestos)", ruta: "/aprobaciones" },
      { id: "aprob.req-aprobar", label: "Aprobar requerimiento", ruta: "/aprobaciones" },
      { id: "aprob.req-rechazar", label: "Rechazar requerimiento con motivo", ruta: "/aprobaciones" },
      { id: "aprob.ver-comentarios", label: "Comentarios del aprobador visibles en detalle de Requerimientos" },
    ],
  },
  {
    id: "ot-externas",
    titulo: "Operaciones — OTs Externas",
    items: [
      { id: "ot.list", label: "Listar OTs con filtros (Tipo, Estado, Fecha, Cliente, etc.)", ruta: "/ordenes-trabajo" },
      { id: "ot.crear-rep", label: "Crear OT Reparación", ruta: "/ordenes-trabajo/nueva" },
      { id: "ot.crear-bien", label: "Crear OT Bien (con campo Cantidad)" },
      { id: "ot.crear-ser", label: "Crear OT Servicio" },
      { id: "ot.fecha-req-opcional", label: "Fecha requerimiento cliente es opcional" },
      { id: "ot.cantidad-col", label: "Columna 'Cantidad' visible en listado (resalta > 1)" },
      { id: "ot.estado-po", label: "Columna 'Estado PO' (Pdt PO / Con PO)" },
      { id: "ot.detalle", label: "Ver detalle de OT (tabs: Detalle, Tareas, Costos, Requerimientos, Adjuntos, Historial)" },
      { id: "ot.adjuntos-r2", label: "Adjuntos por etapa (7 etapas) guardados en Cloudflare R2" },
      { id: "ot.adjuntos-folders", label: "Adjuntos organizados en carpetas R2 por etapa" },
      { id: "ot.requerimientos-template", label: "Aplicar template de requerimientos desde Cód. Reparable" },
      { id: "ot.bloqueo-cerrada", label: "Bloqueo de edición cuando la OT está cerrada" },
      { id: "ot.historial", label: "Historial de cambios y operaciones por OT" },
      { id: "ot.export-excel", label: "Export Excel con selección de columnas + filtros (fecha, tipo)" },
    ],
  },
  {
    id: "ot-internas",
    titulo: "Operaciones — OTs Internas",
    items: [
      { id: "oti.list", label: "Listar OTs internas con filtros", ruta: "/ordenes-trabajo-internas" },
      { id: "oti.crear", label: "Crear OT interna (equipo obligatorio, solo MAQ)", ruta: "/ordenes-trabajo-internas" },
      { id: "oti.requerimientos", label: "Crear requerimientos de la OT interna (PU + F.requerida obligatorios)" },
      { id: "oti.adjuntos", label: "Adjuntos por etapa" },
      { id: "oti.historial", label: "Historial" },
      { id: "oti.filtro-vacios", label: "Filtro (vacío) por columna funcionando" },
    ],
  },
  {
    id: "evaluacion",
    titulo: "Hojas de Evaluación",
    items: [
      { id: "eval.list", label: "Listar hojas de evaluación", ruta: "/evaluaciones" },
      { id: "eval.crear", label: "Crear hoja de evaluación de OT" },
      { id: "eval.form-tabs", label: "Form con secciones / checklists" },
      { id: "eval.imagenes", label: "Subir imágenes (se ajustan a 8cm de ancho automático)" },
      { id: "eval.firmas", label: "Evaluado por + Supervisor (firmas)" },
      { id: "eval.word", label: "Generar informe Word con checks + imágenes en flujo continuo" },
      { id: "eval.word-oc", label: "Word muestra N° OC + PO Cliente" },
      { id: "eval.aprobacion", label: "Aprobación de hoja por rol aprobador_evaluacion" },
    ],
  },
  {
    id: "tickets",
    titulo: "Tickets",
    items: [
      { id: "tickets.list", label: "Listar tickets con filtros", ruta: "/tickets" },
      { id: "tickets.crear", label: "Crear ticket (bug/feature/duda)" },
      { id: "tickets.adjuntos", label: "Capturas adjuntas en R2" },
      { id: "tickets.estados", label: "Cambiar estado (abierto / en proceso / resuelto)" },
    ],
  },
  {
    id: "planificacion",
    titulo: "Operaciones — Planificación",
    items: [
      { id: "plan.dashboard", label: "Dashboard de planificación", ruta: "/operaciones/programacion-dashboard" },
      { id: "plan.semanal", label: "Programación semanal por técnico", ruta: "/operaciones/programacion-semanal" },
      { id: "plan.tareas", label: "Crear / asignar tareas a técnicos", ruta: "/operaciones/planificacion" },
      { id: "plan.emergencia", label: "Cascade de emergencia (correctivo prioritario)" },
      { id: "plan.adjuntos-tarea", label: "Adjuntos por tarea" },
      { id: "plan.reabrir", label: "Reabrir tarea finalizada" },
    ],
  },
  {
    id: "tecnico",
    titulo: "Panel del Técnico",
    items: [
      { id: "tec.mis-tareas", label: "Ver mis tareas con paginación + filtros", ruta: "/mis-tareas" },
      { id: "tec.dashboard", label: "Dashboard personal con KPIs", ruta: "/dashboard" },
      { id: "tec.iniciar", label: "Iniciar sesión de trabajo en una tarea" },
      { id: "tec.pausar", label: "Pausar / reanudar sesión" },
      { id: "tec.finalizar", label: "Finalizar tarea (registra horas reales)" },
      { id: "tec.rendimiento", label: "Mostrar eficiencia (horas estimadas vs reales)" },
    ],
  },
  {
    id: "codigos-rep",
    titulo: "Códigos Reparables",
    items: [
      { id: "cr.list", label: "Listar códigos reparables con filtros (Tipo, Flota, Fabricante)", ruta: "/codigos-reparacion" },
      { id: "cr.crear", label: "Crear / editar código reparable" },
      { id: "cr.operaciones", label: "Definir operaciones del cód. reparable" },
      { id: "cr.template-req", label: "Definir template de requerimientos" },
      { id: "cr.export-excel", label: "Export Excel con filtros (Tipo, Categoría, Flota, Fabricante)" },
    ],
  },
  {
    id: "logistica-maestros",
    titulo: "Logística — Maestros",
    items: [
      { id: "log.clientes", label: "Clientes — CRUD + RUC lookup", ruta: "/clientes" },
      { id: "log.proveedores", label: "Proveedores — CRUD + RUC lookup", ruta: "/proveedores" },
      { id: "log.materiales", label: "Materiales — CRUD + categorías + stock + precio", ruta: "/materiales" },
      { id: "log.materiales-import", label: "Materiales — importar desde Excel" },
      { id: "log.materiales-export", label: "Materiales — Export Excel con filtros (Categoría, Clasificación, Fabricante, Planta, Área)" },
    ],
  },
  {
    id: "compras",
    titulo: "Logística — Ciclo de Compras",
    items: [
      { id: "req.list", label: "Listar requerimientos con filtros", ruta: "/requerimientos" },
      { id: "req.crear", label: "Crear requerimiento de OT" },
      { id: "req.aprobar", label: "Aprobar / rechazar requerimiento" },
      { id: "req.detalle", label: "Ver detalle con comentarios de aprobación", ruta: "/requerimientos/detalle" },
      { id: "oc.list", label: "Listar OCs con KPIs (Pendientes, En Proceso, Próximos, Vencidos, Faltan)", ruta: "/compras" },
      { id: "oc.crear", label: "Crear OC desde requerimientos aprobados" },
      { id: "oc.editor-ot", label: "Editor OC auto-populiza OT en descripción" },
      { id: "oc.pdf", label: "Generar PDF de OC (muestra OT en items)" },
      { id: "oc.aprobar", label: "Aprobar OC desde /aprobaciones" },
      { id: "oc.rechazar", label: "Rechazar OC (botón Rechazar en /aprobaciones)" },
      { id: "oc.cotizaciones-hist", label: "Cotizaciones / precios históricos", ruta: "/compras/historico" },
    ],
  },
  {
    id: "almacen",
    titulo: "Logística — Almacén",
    items: [
      { id: "alm.movimientos", label: "Movimientos de inventario (entradas/salidas)", ruta: "/movimientos" },
      { id: "alm.recibir-po", label: "Recibir PO — selección por checkbox + bulk", ruta: "/movimientos" },
      { id: "alm.recibir-parcial", label: "Recibir PO parcial (no exige todos los items)" },
      { id: "alm.recibir-free", label: "Recibir PO con items libres (sin material_id catalogado)" },
      { id: "alm.ubicacion-zona", label: "Asignar zona + posición física al recibir" },
      { id: "alm.stock", label: "Inventario de stock (materiales catalogados)", ruta: "/stock" },
      { id: "alm.stock-no-cat", label: "Inventario no catalogado", ruta: "/stock/no-catalogados" },
      { id: "alm.despachos", label: "Despachos por OT — listado + filtro de búsqueda", ruta: "/despachos" },
      { id: "alm.despachos-ubic", label: "Despachos muestran ubicación física (zona/posición)" },
      { id: "alm.despacho-bulk", label: "Despacho por selección múltiple con datos (fecha, persona, comentarios)" },
      { id: "alm.ppp", label: "Costo PPP (Promedio Ponderado) recalculado en cada entrada" },
    ],
  },
  {
    id: "herr-sum",
    titulo: "Logística — Herramientas y Suministros",
    items: [
      { id: "hs.herramientas", label: "Herramientas — CRUD", ruta: "/herramientas" },
      { id: "hs.suministros", label: "Suministros — CRUD", ruta: "/suministros" },
    ],
  },
  {
    id: "despacho-fact",
    titulo: "Logística — Despacho y Facturación",
    items: [
      { id: "df.despacho-mina", label: "Despacho a mina con Guía de Remisión", ruta: "/despachos/mina" },
      { id: "df.facturacion-ot", label: "Facturación de OT (mina)", ruta: "/facturacion/ot" },
      { id: "df.facturacion-modal", label: "Modal de facturación con todos los adjuntos por categoría" },
      { id: "df.facturacion-upload", label: "Subir factura + guía de remisión desde el mismo modal" },
      { id: "df.contabilidad-oc", label: "Guía y factura de OC (cuentas por pagar)", ruta: "/compras/contabilidad" },
    ],
  },
  {
    id: "mantenimiento",
    titulo: "Mantenimiento",
    items: [
      { id: "mant.equipos", label: "Equipos / Herramientas — CRUD con criticidad y estado", ruta: "/mantenimiento/equipos" },
      { id: "mant.export", label: "Equipos — Export Excel con filtros (Tipo, Estado, Criticidad, Planta, Área)" },
    ],
  },
  {
    id: "contratos",
    titulo: "Contratos",
    items: [
      { id: "ctr.list", label: "Listar contratos por cliente + cód. reparable", ruta: "/contratos" },
      { id: "ctr.crear", label: "Crear contrato con días de reparación" },
      { id: "ctr.auto-fecha", label: "Auto-calcula fecha req cliente cuando OT es 'Contrato'" },
    ],
  },
  {
    id: "config",
    titulo: "Configuración",
    items: [
      { id: "cfg.cotizacion", label: "Configuración de cotización (porcentajes, plantillas)", ruta: "/configuracion-cotizacion" },
      { id: "cfg.catalogos", label: "Catálogos maestros — editar tablas de referencia", ruta: "/catalogos" },
      { id: "cfg.catalogos-health", label: "Panel de health de catálogos (valores faltantes / huérfanos)" },
      { id: "cfg.checklist", label: "Esta misma página — Checklist de funcionalidades", ruta: "/configuracion/checklist" },
    ],
  },
  {
    id: "reportes",
    titulo: "Reportes",
    items: [
      { id: "rpt.dashboard", label: "Dashboard general con KPIs", ruta: "/reportes" },
    ],
  },
  {
    id: "tablas",
    titulo: "Tablas — Funcionalidad común",
    descripcion: "Comportamientos que aplican en todas las tablas del ERP.",
    items: [
      { id: "tbl.resize", label: "Resize de columnas (drag del borde derecho del header) — persiste en F5" },
      { id: "tbl.reorder", label: "Drag-to-reorder de columnas — persiste en F5" },
      { id: "tbl.pin", label: "Pin de columnas a la izquierda — persiste en F5" },
      { id: "tbl.ocultar", label: "Mostrar/ocultar columnas — persiste en F5" },
      { id: "tbl.filtro-vacio", label: "Filtro (vacío) automático en columnas con celdas en blanco" },
      { id: "tbl.export-excel", label: "Export Excel con modal: selector de columnas + fecha + filtros multi-select" },
      { id: "tbl.paginacion", label: "Paginación estandarizada con cambio de page size" },
    ],
  },
];

const STORAGE_KEY = "erp-checklist-funcionalidades-v1";

interface PersistedState {
  done: Record<string, true>;
  notes: Record<string, string>;
}

const EMPTY_STATE: PersistedState = { done: {}, notes: {} };

export default function ChecklistPage() {
  const { modal, message } = App.useApp();
  const router = useRouter();
  const [state, setState] = useState<PersistedState>(EMPTY_STATE);
  const [hidratado, setHidratado] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [soloPendientes, setSoloPendientes] = useState(false);

  // Cargar estado al montar.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<PersistedState>;
        setState({
          done: parsed.done ?? {},
          notes: parsed.notes ?? {},
        });
      }
    } catch { /* ignore */ }
    setHidratado(true);
  }, []);

  // Persistir después de cada cambio (post-hidratado).
  useEffect(() => {
    if (!hidratado) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* ignore */ }
  }, [state, hidratado]);

  const toggleItem = useCallback((id: string) => {
    setState((prev) => {
      const next = { ...prev.done };
      if (next[id]) delete next[id];
      else next[id] = true;
      return { ...prev, done: next };
    });
  }, []);

  const setNota = useCallback((id: string, nota: string) => {
    setState((prev) => {
      const notes = { ...prev.notes };
      if (nota.trim()) notes[id] = nota;
      else delete notes[id];
      return { ...prev, notes };
    });
  }, []);

  const totales = useMemo(() => {
    const all = SECCIONES.flatMap((s) => s.items);
    const total = all.length;
    const done = all.filter((i) => state.done[i.id]).length;
    const porcentaje = total === 0 ? 0 : Math.round((done / total) * 100);
    return { total, done, porcentaje };
  }, [state.done]);

  const seccionesFiltradas = useMemo(() => {
    const term = busqueda.trim().toLowerCase();
    return SECCIONES.map((s) => {
      let items = s.items;
      if (soloPendientes) items = items.filter((i) => !state.done[i.id]);
      if (term) {
        items = items.filter((i) =>
          i.label.toLowerCase().includes(term) ||
          (i.detalle?.toLowerCase().includes(term) ?? false) ||
          (i.ruta?.toLowerCase().includes(term) ?? false),
        );
      }
      return { ...s, items };
    }).filter((s) => s.items.length > 0);
  }, [busqueda, soloPendientes, state.done]);

  function resetear() {
    modal.confirm({
      title: "¿Resetear todo el checklist?",
      content: "Se borran TODAS las marcas y notas. Esta acción no se puede deshacer.",
      okText: "Resetear",
      okButtonProps: { danger: true },
      cancelText: "Cancelar",
      onOk: () => {
        setState(EMPTY_STATE);
        message.success("Checklist reseteado");
      },
    });
  }

  function exportarTexto() {
    const lineas: string[] = [];
    lineas.push(`# Checklist ERP HP&K — ${totales.done}/${totales.total} verificadas (${totales.porcentaje}%)`);
    lineas.push("");
    for (const sec of SECCIONES) {
      lineas.push(`## ${sec.titulo}`);
      for (const it of sec.items) {
        const marca = state.done[it.id] ? "[x]" : "[ ]";
        const nota = state.notes[it.id];
        lineas.push(`- ${marca} ${it.label}${nota ? ` — _${nota}_` : ""}`);
      }
      lineas.push("");
    }
    const texto = lineas.join("\n");
    void navigator.clipboard.writeText(texto)
      .then(() => message.success("Copiado al portapapeles (formato Markdown)"))
      .catch(() => message.error("No se pudo copiar al portapapeles"));
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <Title level={3} style={{ marginBottom: spc.lg }}>
        <CheckSquareOutlined style={{ marginRight: spc.sm, color: brand.cyan }} />
        Checklist de funcionalidades del ERP
      </Title>

      <Card style={{ marginBottom: spc.lg }} styles={{ body: { padding: spc.lg } }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} md={8}>
            <Statistic
              title="Progreso total"
              value={totales.done}
              suffix={`/ ${totales.total}`}
              styles={{ content: { color: brand.navy } }}
            />
          </Col>
          <Col xs={24} md={16}>
            <Progress
              percent={totales.porcentaje}
              status={totales.porcentaje === 100 ? "success" : "active"}
              strokeColor={{ "0%": brand.cyan, "100%": brand.success }}
            />
          </Col>
        </Row>
      </Card>

      <Card size="small" style={{ marginBottom: spc.md }} styles={{ body: { padding: spc.md } }}>
        <Space wrap>
          <Input
            placeholder="Buscar funcionalidad..."
            prefix={<SearchOutlined />}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            allowClear
            style={{ width: 280 }}
          />
          <Tooltip title={soloPendientes ? "Mostrar todas" : "Mostrar solo pendientes"}>
            <Button
              icon={soloPendientes ? <EyeOutlined /> : <EyeInvisibleOutlined />}
              onClick={() => setSoloPendientes((v) => !v)}
              type={soloPendientes ? "primary" : "default"}
            >
              {soloPendientes ? "Solo pendientes" : "Todas"}
            </Button>
          </Tooltip>
          <Tooltip title="Copiar al portapapeles como Markdown para compartir el progreso">
            <Button icon={<ExportOutlined />} onClick={exportarTexto}>
              Copiar resumen
            </Button>
          </Tooltip>
          <Tooltip title="Borra todas las marcas y notas">
            <Button icon={<DeleteOutlined />} danger onClick={resetear}>
              Resetear
            </Button>
          </Tooltip>
        </Space>
      </Card>

      {seccionesFiltradas.length === 0 && (
        <Empty
          description={
            soloPendientes
              ? "No hay funcionalidades pendientes que coincidan con la búsqueda."
              : "No hay resultados."
          }
        />
      )}

      <Collapse
        accordion={false}
        defaultActiveKey={SECCIONES.map((s) => s.id)}
        items={seccionesFiltradas.map((sec) => {
          const doneEnSeccion = sec.items.filter((i) => state.done[i.id]).length;
          const pct = sec.items.length === 0 ? 0 : Math.round((doneEnSeccion / sec.items.length) * 100);
          return {
            key: sec.id,
            label: (
              <Space style={{ width: "100%", justifyContent: "space-between" }}>
                <Space>
                  <Text strong>{sec.titulo}</Text>
                  {sec.descripcion && (
                    <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
                      {sec.descripcion}
                    </Text>
                  )}
                </Space>
                <Tag color={pct === 100 ? "success" : pct > 0 ? "blue" : "default"}>
                  {doneEnSeccion} / {sec.items.length}
                </Tag>
              </Space>
            ),
            children: (
              <Space direction="vertical" size={spc.sm} style={{ width: "100%" }}>
                {sec.items.map((it) => {
                  const marcado = !!state.done[it.id];
                  const nota = state.notes[it.id] ?? "";
                  return (
                    <div
                      key={it.id}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        padding: "8px 12px",
                        background: marcado ? `${brand.success}11` : brand.bgPage,
                        border: `1px solid ${marcado ? brand.success : brand.border}`,
                        borderRadius: 6,
                        opacity: marcado ? 0.85 : 1,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <Checkbox
                          checked={marcado}
                          onChange={() => toggleItem(it.id)}
                          style={{ fontSize: 13 }}
                        >
                          <Text
                            style={{
                              textDecoration: marcado ? "line-through" : undefined,
                              color: marcado ? brand.textSecondary : brand.textPrimary,
                              fontSize: 13,
                            }}
                          >
                            {it.label}
                          </Text>
                        </Checkbox>
                        {it.ruta && (
                          <Tooltip title={`Ir a ${it.ruta}`}>
                            <Button
                              type="link"
                              size="small"
                              icon={<LinkOutlined />}
                              onClick={() => router.push(it.ruta!)}
                              style={{ padding: 0, height: "auto" }}
                            >
                              Ir
                            </Button>
                          </Tooltip>
                        )}
                      </div>
                      {it.detalle && (
                        <Text type="secondary" style={{ fontSize: 11, marginLeft: 24 }}>
                          {it.detalle}
                        </Text>
                      )}
                      <Input.TextArea
                        autoSize={{ minRows: 1, maxRows: 3 }}
                        placeholder="Notas opcionales (bugs encontrados, dudas, etc.)"
                        value={nota}
                        onChange={(e) => setNota(it.id, e.target.value)}
                        style={{
                          marginLeft: 24,
                          fontSize: 12,
                          background: "transparent",
                          maxWidth: "calc(100% - 24px)",
                        }}
                      />
                    </div>
                  );
                })}
              </Space>
            ),
          };
        })}
      />

      <div style={{ marginTop: spc.lg, textAlign: "center" }}>
        <Text type="secondary" style={{ fontSize: 11 }}>
          El progreso se guarda solo en este navegador. Para compartirlo con otros, usá &quot;Copiar resumen&quot;.
        </Text>
      </div>
    </div>
  );
}
