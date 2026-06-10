"use client";

import { Drawer, Collapse, Tag, Typography, Divider } from "antd";
import {
  PushpinOutlined, CalendarOutlined, SendOutlined, BgColorsOutlined,
  ToolOutlined, InboxOutlined, ClockCircleOutlined,
} from "@ant-design/icons";
import { brand } from "@/lib/theme";
import { useResponsive } from "@/lib/responsive";

function P({ children }: { children: React.ReactNode }) {
  return <Typography.Paragraph style={{ fontSize: 13, marginBottom: 8 }}>{children}</Typography.Paragraph>;
}

// Ayuda in-app de Programación Semanal (botón "?" del header). Versión
// condensada para el planner del manual docs/PROGRAMACION_SEMANAL.md — si se
// cambia el comportamiento del dashboard, actualizar AMBOS.
export default function AyudaProgramacionSemanal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { screens } = useResponsive();
  return (
    <Drawer
      title="¿Cómo funciona la Programación Semanal?"
      open={open}
      onClose={onClose}
      placement="right"
      width={screens.md ? 560 : "100%"}
    >
      <P>
        <strong>Regla de oro:</strong> todo lo que editás modifica la <Tag color="processing" style={{ margin: 0 }}>Semana real</Tag>.
        La <Tag color="success" style={{ margin: 0 }}>Semana planificada</Tag> es una <em>foto</em> que se congela
        SOLO al apretar <strong>Enviar</strong> (una vez por tarea) y no se pisa al reabrir y re-enviar.
      </P>
      <Divider style={{ margin: "10px 0" }} />
      <Collapse
        size="small"
        defaultActiveKey={["flujo"]}
        items={[
          {
            key: "flujo",
            label: <span><CalendarOutlined /> El flujo de la semana</span>,
            children: (
              <ol style={{ fontSize: 13, paddingLeft: 18, margin: 0, display: "grid", gap: 6 }}>
                <li><strong>Viernes/sábado:</strong> navegá a la semana siguiente, entrá en <strong>Modo edición</strong> y armá el plan arrastrando tareas del pool al carril de cada operario.</li>
                <li>Apretá <strong>📌 Enviar semana (N)</strong>: se congela la foto del plan. El tag pasa a <Tag color="success" style={{ margin: 0 }}>Semana enviada</Tag>.</li>
                <li><strong>Durante la semana:</strong> para mover algo, <strong>Reabrir</strong> el carril del operario → editar → volver a <strong>Enviar</strong>. Eso cambia solo la semana real; la foto queda intacta.</li>
                <li>Las <strong>🚨 emergencias</strong> caen encima del horario y empujan el resto del día sin necesidad de reabrir.</li>
                <li>A fin de mes, la comparativa plan vs real sale sola de las fotos (Dashboard de programación).</li>
              </ol>
            ),
          },
          {
            key: "envio",
            label: <span><SendOutlined /> Botones de envío</span>,
            children: (
              <div style={{ fontSize: 13, display: "grid", gap: 8 }}>
                <div><strong>📌 Enviar semana (N)</strong> — congela la foto de las N tareas agendadas pendientes, de todos los operarios. Si reabriste y editaste a varios, este mismo botón los re-publica de una (NO re-fotografía lo ya enviado): es el &quot;publicar todo&quot;.</div>
                <div><strong>Enviar / Reabrir</strong> (pie de cada carril) — lo mismo pero por operario. Reabrir vuelve sus tareas a borrador para editarlas; la foto no se toca.</div>
                <div><strong>Re-enviar</strong> — ⚠️ rehace la foto: la semana planificada pasa a ser el plan actual y la anterior se pierde. Solo para envíos por error.</div>
                <div style={{ color: brand.textSecondary }}>Enviar toma solo tareas <em>con fecha</em>; las del pool quedan en borrador hasta agendarse.</div>
              </div>
            ),
          },
          {
            key: "vistas",
            label: <span><BgColorsOutlined /> Vistas y símbolos del Gantt</span>,
            children: (
              <div style={{ fontSize: 13, display: "grid", gap: 6 }}>
                <div><PushpinOutlined /> <strong>Semana planificada</strong>: la foto, solo lectura. Sobre cada tarea iniciada se dibuja una <strong>barrita</strong> con su ejecución real (cyan en proceso, verde terminada, naranja pausada): plan enviado vs realidad en el mismo carril.</div>
                <div><strong>Semana real</strong>: el plan vivo, editable. <strong>↷</strong> = la tarea está distinta a la foto (la moviste o cambió de operario). <strong>＋</strong> = fuera del plan enviado (agregada después).</div>
                <div><strong>⏱ Tarea iniciada</strong>: su bloque arranca en el inicio real y <em>reserva</em> la duración planificada mientras está en proceso o pausada (para no sobre-programar al operario); si se pasa del plan crece en vivo, y recién al <strong>terminar</strong> se acorta a lo que realmente duró. Las iniciadas no se arrastran.</div>
                <div><strong>🗒</strong> = el técnico dejó una nota al pausar/terminar (el texto se ve pasando el mouse o en el detalle de la tarea).</div>
                <div>Glifos: ▶ en proceso · ⏸ pausada · ✓ realizada · • programada · ○ abierta · 🚨 emergencia · 🤝 tercero.</div>
                <div>Franja gris = almuerzo (12:30–13:30, no cuenta) · línea roja = ahora · flechas en el borde = la tarea sigue en otra semana.</div>
                <div>La barra de carga del operario descuenta lo terminado por sus horas reales.</div>
              </div>
            ),
          },
          {
            key: "reglas",
            label: <span><ToolOutlined /> Reglas de programación</span>,
            children: (
              <ul style={{ fontSize: 13, paddingLeft: 18, margin: 0, display: "grid", gap: 6 }}>
                <li>Jornada L–V 8:00–18:00. La duración es <em>por persona</em> (bloque = duración × Qty). Sin duración ⇒ se coloca 1h y la ajustás con el borde derecho.</li>
                <li>Soltar sobre otras tareas del mismo operario <strong>empuja</strong> la cola hacia adelante (nunca adelanta lo que no choca; los huecos se respetan).</li>
                <li>La <strong>máquina</strong> es compartida: si la usa otro operario en ese horario, bloquea (salvo emergencias, que pisan).</li>
                <li><strong>Horas extra</strong> se cargan solo en Planificación; acá se visualizan pasadas las 18:00.</li>
                <li>Tarea <strong>iniciada</strong>: no se mueve (sí se ajusta su duración). <strong>Realizada</strong>: no se edita.</li>
                <li>Modo edición es exclusivo: una persona a la vez (lock; se libera solo a los ~3 min si se cuelga).</li>
              </ul>
            ),
          },
          {
            key: "pool",
            label: <span><InboxOutlined /> El pool de pendientes</span>,
            children: (
              <div style={{ fontSize: 13, display: "grid", gap: 6 }}>
                <div><strong>&quot;De esta semana sin fecha&quot;</strong>: tienen semana asignada pero no hora. <strong>&quot;Sin semana&quot;</strong>: el backlog general.</div>
                <div>Caen al pool: lo creado sin fecha, lo sacado de la semana, el desborde de emergencias y lo destildado de HE (vuelven a borrador automáticamente).</div>
                <div>No se muestran canceladas ni realizadas. Las en proceso sin fecha se ven pero no se arrastran.</div>
              </div>
            ),
          },
          {
            key: "tecnico",
            label: <span><ClockCircleOutlined /> Qué hace el técnico</span>,
            children: (
              <div style={{ fontSize: 13, display: "grid", gap: 6 }}>
                <div>Desde su panel trabaja con <strong>Iniciar / Pausar / Finalizar</strong> (una tarea en curso a la vez). Cada tramo queda como sesión — se ve en el Historial de la tarea.</div>
                <div>Al pausar elige un <strong>motivo</strong> (apoyo a otra OT, montacargas, falta material, máquina ocupada, emergencia, almuerzo…) — se ve como etiqueta en el Historial y en las notas 🗒 de la tarea.</div>
                <div>Si finalizó por error, el planner la <strong>reabre desde Planificación</strong> (vuelve a Pausado conservando el tiempo).</div>
                <div>Si marcó tarde u olvidó el cronómetro (&quot;empecé 16:30&quot;), el planner <strong>regulariza Inicio/Fin/Duración real</strong> desde el Detalle de la tarea (Modo edición) — sin tickets.</div>
              </div>
            ),
          },
        ]}
      />
      <Divider style={{ margin: "10px 0" }} />
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Manual completo: <code>docs/PROGRAMACION_SEMANAL.md</code> en el repositorio.
      </Typography.Text>
    </Drawer>
  );
}
