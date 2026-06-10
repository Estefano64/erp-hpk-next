# Programación Semanal — Manual de funcionamiento

> Módulo: `/operaciones/programacion-semanal` (Gantt) + `/operaciones/planificacion` (tabla).
> Última actualización: 2026-06-10. Versión in-app: botón "?" del header
> (`src/components/modules/operaciones/AyudaProgramacionSemanal.tsx`) — si se
> cambia el comportamiento, actualizar ambos.

## 1. Los tres "tiempos" de una tarea

Cada tarea de planificación (`PlanificacionOT`) vive en tres capas:

| Capa | Qué es | Campos en BD | Quién la escribe |
|---|---|---|---|
| **Semana planificada** | La foto del plan congelada al **Enviar** la semana | `fecha_inicio_base`, `fecha_fin_base`, `horas_estimadas_base`, `tecnico_base`, `semana_base`, `publicado_at` | El planner, al apretar Enviar (solo la **primera vez** por tarea) |
| **Semana real** | El plan vivo, con todos los cambios de la semana | `fecha_inicio`, `fecha_fin`, `horas_estimadas`, `tecnico`, `maquina`, `semana_plan` | El planner (drag, resize, emergencias, bulk) |
| **Ejecución** | Lo que el técnico realmente trabajó | `fecha_inicio_real`, `fecha_fin_real`, `horas_reales` + sesiones (`PlanificacionOTSesion`) | El técnico (iniciar / pausar / finalizar) |

**Regla de oro:** todo lo que se edita modifica la **semana real**. La semana
planificada solo se escribe al apretar **Enviar**, y nunca se pisa al reabrir y
re-enviar (salvo "Re-enviar", ver §5).

## 2. Flujo semanal del planner

1. **Viernes/sábado**: navegar a la semana siguiente → **Modo edición** → armar
   el plan (arrastrar tareas del pool al carril de cada operario, ajustar
   duraciones). Tag del header: **"Sin enviar"**.
2. **Enviar semana (N)**: congela la foto de las N tareas agendadas → tag
   **"Semana enviada"**. Las tareas enviadas quedan bloqueadas para el drag.
3. **Durante la semana**: para mover algo, **Reabrir** el carril del operario →
   editar → volver a **Enviar**. Todos esos cambios cuentan en la semana real;
   la foto no se toca. El tag pasa a "Envío parcial" mientras haya borradores.
4. **Emergencias** (correctivas): caen encima del horario y empujan el resto del
   día del operario sin necesidad de reabrir (ver §6).
5. **Fin de mes**: la comparativa "trabajó según lo planificado vs lo real" sale
   de las columnas `*_base` (la usan `/operaciones/programacion-dashboard` y el
   ranking de técnicos).

## 3. Vistas del Gantt

Selector del header:

- **Semana planificada** 📌 — la foto. Solo lectura, sin pools. Si una tarea se
  movió después a otra semana, acá se ve donde estaba al enviarse. Sobre cada
  tarea iniciada se dibuja una **barrita de ejecución real** (cyan = en proceso,
  verde = terminada, naranja = pausada): la comparación plan enviado vs realidad
  se ve en el mismo carril.
- **Semana real** — el plan vivo (editable). Además muestra:
  - **Tareas iniciadas**: el bloque arranca en `inicio_real` y mientras está
    en proceso/pausada **reserva la duración planificada** (si mostrara solo lo
    transcurrido, el espacio "libre" invitaría a sobre-programar al operario);
    si se pasa del plan, crece en vivo hasta "ahora". Recién al **terminar** el
    bloque se acorta a lo que realmente duró y el espacio liberado se ve al
    instante. La barra de carga del operario también descuenta lo terminado por
    sus horas reales. (Las iniciadas no se arrastran, así que es seguro.)
  - **↷** = tarea distinta a la foto (fecha u operario cambiado). El tooltip
    muestra el horario enviado original.
  - **＋** = tarea fuera del plan enviado (agregada después de enviar). Solo se
    marca en operarios que tienen algo enviado esa semana.
- **Vista Operarios / Equipos**: la asignación se hace SIEMPRE por operario;
  Equipos es solo visualización de carga de máquinas.

Otras señales: 🚨 emergencia · glifos de estado (▶ en proceso, ⏸ pausada,
✓ realizada, • programada, ○ abierta) · franja gris = almuerzo · línea roja =
ahora · flechas en el borde del bloque = la tarea continúa de/hacia otra semana
· 💬 comentario del planner · 🗒 nota del técnico (dejada al pausar/terminar;
texto en el tooltip y en el modal Detalle).

## 4. Reglas de programación

- **Jornada**: L–V 08:00–18:00 (hora Perú), almuerzo fijo 12:30–13:30 que no
  cuenta. La grilla se ve hasta las 20:00 solo para visualizar horas extra.
- **Duración**: `horas_estimadas` es **por persona**; el largo del bloque es
  duración × `qty_personal`. Tarea sin duración se coloca con 1h por defecto.
- **Horas extra (HE)**: se cargan SOLO desde Planificación (flag + Qty HE + fin
  manual, reloj continuo). El drag del Gantt nunca crea HE: un drop ≥18:00 se
  normaliza a la jornada. Destildar HE manda la tarea al pool.
- **Multi-recurso**: varios operarios/equipos en un solo campo separados por
  `" | "` (nunca coma: los nombres traen coma). La tarea aparece en el carril de
  cada uno y la carga se prorratea.
- **Máquina compartida**: dos operarios no pueden usar la misma máquina a la
  vez; ese choque bloquea el guardado (excepto emergencias, que pisan).
- **Empujar al soltar**: soltar una tarea sobre otras del mismo operario no
  bloquea: empuja la cola hacia adelante (encadena al día siguiente si no
  entra). **Nunca adelanta**: las tareas no alcanzadas se quedan donde están y
  los huecos intencionales se respetan. Las HE no se empujan.
- **Tareas iniciadas** (en proceso/pausada): su horario ya es ejecución real;
  no se mueven ni se les cambia la semana (sí se puede ajustar la duración).
  **Realizadas**: no se editan (salvo regularizar horas reales o comentario).
- **Canceladas**: liberan su horario; no cuentan para choques ni aparecen.

## 5. Envío (semana planificada)

| Acción | Dónde | Qué hace |
|---|---|---|
| **Enviar semana (N)** | Header (Modo edición) | Congela la foto de las N tareas agendadas pendientes, de todos los operarios. Las que ya tienen foto NO se re-fotografían → sirve como **"publicar todo"** después de editar a varios operarios a mitad de semana. |
| **Enviar** (por operario) | Pie del carril | Igual, pero solo ese operario. |
| **Reabrir** (por operario) | Pie del carril | Vuelve sus tareas a borrador para poder editarlas. La foto queda intacta. También limpia flags de envío colgados. |
| **Re-enviar** | Header, junto a Enviar | ⚠️ **Rehace la foto**: la semana planificada pasa a ser el plan actual y la anterior se pierde (resetea la comparativa de esa semana). Solo para envíos por error. Pide confirmación fuerte. |

Detalles:
- Enviar toma **solo tareas agendadas** (con fecha). Las del pool quedan en
  borrador hasta tener hora.
- Una tarea agregada el miércoles y enviada ese día queda con foto "desde el
  miércoles": para la comparativa cuenta como planificada desde ahí.
- No existe "Reabrir todo" a propósito: reabrir es por operario para evitar
  des-envíos masivos accidentales.

## 6. Emergencias (correctivas)

- Se marcan desde el modal Detalle (Prioridad → Correctiva) o desde
  Planificación. Tienen prioridad total: **pisan la máquina** aunque la use
  otro operario (el planner resuelve la doble reserva a mano — decisión de
  producto).
- Al ubicarla, empuja las tareas del mismo día/operario que arranquen después o
  se solapen; lo que no entra en el día va al pool (queda en la bandeja "de esta
  semana sin hora", como borrador abierto).
- No mueve tareas ya iniciadas/terminadas ni HE.
- Funciona también sobre semanas enviadas, sin reabrir; las tareas empujadas
  siguen "enviadas" (decisión de producto: no re-publicar tras cada emergencia).
  El desvío queda visible con ↷.

## 7. Pool de pendientes (solo en Semana real)

- **"Tareas de la semana X sin fecha"**: tienen `semana_plan` pero no hora.
- **"Tareas sin semana asignada"**: el backlog general.
- Entra al pool: lo creado sin fecha, lo sacado de la semana, el overflow de
  emergencias, lo destildado de HE. Al perder la fecha, la tarea vuelve a
  estado `abierto` y a borrador automáticamente.
- NO aparecen: canceladas ni realizadas. Las en proceso/pausadas sin fecha SÍ
  se ven (trabajo en curso sin calendario) pero no se pueden arrastrar.
- Orden: por prioridad de la OT y número de OT. Tiene buscador propio y respeta
  el filtro de operarios (con switch para ignorarlo).

## 8. Concurrencia (lock de edición)

- "Modo edición" toma un **lock pesimista** global de la página: una sola
  persona edita a la vez; el resto ve un aviso. Si se cuelga, se libera solo a
  los ~3 minutos. Planificación tiene su propio lock equivalente.
- El badge del header muestra Guardando… / Guardado ✓ / Error en vivo.

## 9. Ejecución del técnico (mi-trabajo)

- El técnico ve las tareas de su semana (aunque no tengan hora todavía) y las
  trabaja con **Iniciar / Pausar / Finalizar**. Solo una tarea en curso a la
  vez. Cada tramo queda como sesión (auditable en el Historial de la tarea).
- Al **pausar** elige un **motivo obligatorio** de catálogo fijo (Apoyo a otra
  OT, Montacargas, Falta material, Máquina ocupada, Emergencia, Almuerzo, Fin
  de jornada, Otro) + comentario opcional. "Pausar e iniciar otra" registra
  automáticamente el motivo "Cambio a otra tarea". El motivo queda en la
  sesión (`motivo_pausa`, catálogo en `src/lib/motivos-pausa.ts`), se ve como
  tag en el Historial y se antepone como `[Etiqueta]` en las observaciones
  acumuladas — base para reportar horas perdidas por causa.
- `horas_reales` = suma de sesiones. Con varios técnicos, la tarea queda
  realizada cuando todos terminan (rollup).
- "Reabrir tarea" finalizada por error: solo desde Planificación
  (planner/admin); vuelve a Pausado conservando el tiempo.
- **Hoja de evaluación**: en el detalle de cada tarea, si la OT tiene hoja de
  evaluación **APROBADA**, el técnico la puede abrir en solo lectura ("Ver hoja
  de evaluación"). Tareas sin OT o con hoja en borrador/pendiente no muestran
  el botón.
- **Conteo del tiempo real** (`horasRealesEntre` en `lib/plan-sesion.ts`):
  ventana **07:00–20:00 L–V** — más ancha que la jornada a propósito: quien
  arranca minutos antes de las 8 o se queda después de las 18 lo suma como hora
  normal (no es HE). La noche y el fin de semana no cuentan (protege contra
  sesiones olvidadas; el planner regulariza si hace falta).
- **El almuerzo se descuenta solo (1 hora)**: si la sesión trabaja de corrido
  sobre la ventana 12:30–13:30 se resta 1h. No importa a qué hora se tomó el
  almuerzo realmente: si ese día se corrió a 13:00–14:00 y el técnico no pausó,
  el total igual sale exacto (reloj de pared − 1h). Si el técnico SÍ pausa
  dentro de la franja, no hay descuento automático (su pausa ya descontó) — sin
  doble descuento. Pausar solo hace falta cuando el almuerzo dura más o menos
  de 1 hora. El cronómetro del panel sigue la misma regla (las tareas HE corren
  a reloj de pared).
- **Regularización**: si el técnico marcó tarde / olvidó el cronómetro /
  trabajó sin sistema ("empecé 16:30, actualizar en la programación"), el
  planner corrige **Inicio real / Fin real / Duración real** desde el modal
  Detalle del Gantt (Modo edición). El inicio real es editable en tareas
  iniciadas; el fin y la duración solo cuando ya está realizada. Las sesiones
  crudas del Historial no se tocan (queda la trazabilidad).

## 10. Decisiones de producto vigentes

- **Solapes legítimos se dejan** (emergencias, ejecución real, multi-día). No
  endurecer el anti-solape salvo reclamo real de taller por máquina compartida.
- **Empujar nunca adelanta** (los huecos del planner se respetan).
- **Las publicadas empujadas siguen publicadas** (sin fricción de re-publicar).
- **HE solo en Planificación**; el Gantt solo las visualiza.

## 11. Archivos clave

| Qué | Dónde |
|---|---|
| Gantt | `src/app/(dashboard)/operaciones/programacion-semanal/page.tsx` |
| Tabla de planificación | `src/app/(dashboard)/operaciones/planificacion/page.tsx` |
| API CRUD + anti-solape + transiciones de estado | `src/app/api/planificacion/[id]/route.ts` |
| Enviar / reabrir / foto (`rebasar`) | `src/app/api/planificacion/publicar/route.ts` |
| Cascada de empuje / emergencia | `src/lib/emergencia-cascade.ts` |
| Horas hábiles / almuerzo / HE | `src/lib/planification-hours.ts` |
| Separador multi-recurso | `src/lib/recursos.ts` |
| Ejecución del técnico | `src/app/api/planificacion/[id]/{iniciar,pausar,finalizar,reabrir}/route.ts` |
| Panel del técnico | `src/app/api/mi-trabajo/route.ts` |
| Reparación de estados colgados | `scripts/repair-pool-estados.ts` |
