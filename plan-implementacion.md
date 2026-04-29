# Plan de Implementación — ERP HP&K

> Documento vivo. Versión inicial post-análisis de los 14 Excel del equipo.
> Última revisión: 2026-04-20.

## 1. Propósito

Este documento describe la **estrategia de armado final** del ERP de mantenimiento industrial de HP&K: el orden paso a paso, la lógica de cada fase, las dependencias entre ellas, y los bloqueos conocidos.

No es un cronograma con fechas — es la secuencia lógica. Cada fase depende de las anteriores; saltarse una produce rework.

## 2. Decisiones que anclan el diseño

Estas decisiones ya están tomadas con el equipo y no se re-discuten salvo cambio explícito:

| # | Decisión | Efecto |
|---|---|---|
| 1 | `TipoOT` queda pospuesto. El campo `tipo` en OT se mantiene como string libre. | No hay catálogo `TipoOT` ni lógica condicional por tipo todavía. |
| 2 | Herramientas NO es módulo aparte. Viven dentro de Equipos como `Tipo = HER`. | Un solo CRUD en `mantenimiento/equipos`. El filtro de tipo separa vistas. |
| 3 | Evaluación digital = formulario que se auto-llena desde tareas completadas. Plantilla base: `Hoja de Evaluación - Producción - HP&K ERP.html`. | Se modela `OTTarea` + `OTTareaCaptura` genéricos; el HTML se renderiza desde esos datos. |
| 4 | Banco de pruebas = un `Equipo` más (MAQ001/MAQ002). | Ningún modelo especial. |
| 5 | Fases en orden, sin saltos salvo petición explícita. | Fase N depende de N-1. |
| 6 | Estados de REQ/COT/OC = tres catálogos separados. | `StatusRequerimiento`, `StatusCotizacion`, `StatusOC` — no un solo catálogo con campo `fase`. |
| 7 | `Tarea` admite doble referencia: FK opcional a `CodigoReparacion` (cilindros) o FK opcional a `Estrategia` (mantenimiento preventivo). | Una sola tabla sirve para los dos task lists (normal 1400 filas + Toño 585 filas). |
| 8 | `5.1 Encabezados` se importa con `HORAS`/`HH` en NULL. Producción completa después. | Se provee UI para completar esas columnas. Cotización automática queda inoperante hasta que se llenen. |
| 9 | `Cod Rep` gana campos `np_reemplaza` y `reemplaza` (bool). | Migración aditiva, sin romper datos existentes. |

## 3. Visión del sistema en 4 capas

```
┌───────────────────────────────────────────────────────────┐
│  CAPA 1 — DATOS MAESTROS (catálogos + fichas)             │
│    Lo que "existe" antes de operar                        │
├───────────────────────────────────────────────────────────┤
│  CAPA 2 — ENTRADA DE TRABAJO (creación de OT)             │
│    Cómo nace el trabajo (3 caminos)                       │
├───────────────────────────────────────────────────────────┤
│  CAPA 3 — PROCESOS OPERATIVOS (10 pasos)                  │
│    Recepción → Evaluación → Cotización → Aprobación →     │
│    Req/OC → Producción → QC → Despacho → Facturación      │
│    Paralelo: Mantenimiento Preventivo                     │
├───────────────────────────────────────────────────────────┤
│  CAPA 4 — CONTROL Y REPORTES                              │
│    Dashboards, KPIs, alertas SLA                          │
└───────────────────────────────────────────────────────────┘
```

## 4. Fase 0 — Fundamentos faltantes

**Objetivo:** dejar el schema listo para meter datos sin re-migraciones mayores.

### 4.1 Catálogos a crear

| Catálogo | Cardinalidad | Fuente |
|---|---|---|
| `Componente` | 14 | Encabezados.xlsx columna COMPONENTE |
| `OperacionReparacion` | 26 | Tablas de planificacion.xlsx (códigos RELC, BRUC, CROV, PUL-T, FAB-T, etc.) |
| `StatusRequerimiento` | 4 | Log POs → estados REQ |
| `StatusCotizacion` | 5 | Log POs → estados COT |
| `StatusOC` | 7 | Log POs → estados OC |

Enum (no tabla): `TipoMovimientoInventario { ENTRADA, SALIDA, AJUSTE }`.

### 4.2 Ajustes a modelos existentes

| Modelo | Cambio | Motivo |
|---|---|---|
| `MovimientoInventario` | FK a Material; convertir `tipo` a enum `TipoMovimientoInventario` | Hoy el tipo es texto libre — bloquea reportes de rotación |
| `Tarea` | FK opcional `estrategia_id` (además del `cod_rep_codigo` ya existente) | Task list Toño referencia Estrategia, no CodRep |
| `CodigoReparacion` | Campos `np_reemplaza` (string) y `reemplaza` (bool) | Viene en el Excel Cod Rep y hoy se pierde |
| `OTRepuesto` | FKs a `StatusRequerimiento`, `StatusCotizacion`, `StatusOC` en lugar de `status_codigo` texto libre | Hoy el estado es string — impide transiciones validadas |

### 4.3 Auditoría automática

Trigger a nivel de servicio (no DB): en cada cambio de `ot_status`, `recursos_status`, `taller_status` de `OrdenTrabajo`, insertar fila en `OTHistorial` con `campo`, `valor_anterior`, `valor_nuevo`, `usuario_id`, `fecha`.

### 4.4 Orden dentro de Fase 0

```
1. Migración: catálogos nuevos (5 tablas + 1 enum)
2. Migración: ajustes a MovimientoInventario, Tarea, CodigoReparacion, OTRepuesto
3. Servicio de auditoría en OTHistorial
4. Verificar: prisma generate + prisma migrate dev sin errores en dev
```

**Salida de Fase 0:** schema listo, sin datos aún.

## 5. Fase 1 — Script único de seeding

**Objetivo:** poblar todos los catálogos maestros desde los Excel en una sola corrida reproducible.

### 5.1 Lógica del script

```
- Lee los 14 Excel de C:\Users\HP\Desktop\erp_data
- Aplica la misma detección de headers que analyze-excel-v2.mjs
  (saltar filas de tags: Software/Produccion/Logistica/Mant)
- Upsert por código único → idempotente (se puede re-ejecutar)
- En orden de dependencias (ver 5.2)
- Loguea por catálogo: creados, actualizados, saltados
- Si falla una FK, detiene y reporta el huérfano
```

### 5.2 Orden por dependencias

Los FK mandan el orden:

```
Nivel 0 (sin FK):
  Planta, Area, Moneda, UnidadMedida, Criticidad, TipoEquipo, StatusEquipo,
  StatusEstrategia, TipoEstrategia, TipoTarea, TipoCodRep, CategoriaCodRep,
  FlotaEquipo, Posicion, Fabricante, Clasificacion, Componente,
  OperacionReparacion, StatusRequerimiento, StatusCotizacion, StatusOC,
  Garantia, AtencionReparacion, TipoReparacion, TipoGarantia,
  PrioridadAtencion, BaseMetalica, OtStatus, RecursosStatus, TallerStatus

Nivel 1 (dependen de nivel 0):
  SubArea (→ Area), Cliente, CodigoReparacion (→ Tipo/Categoria/Flota/Fabricante/Posicion/Moneda)

Nivel 2:
  Material (→ Planta/Area/Categoria/Clasificacion/UndMed/Moneda/Fabricante)
  Equipo (→ Status/Area/SubArea/Tipo/Fabricante/Planta/Criticidad/UndMed)

Nivel 3:
  Estrategia (→ Area/Equipo/TipoEstrategia/StatusEstrategia/UndMed)
  Tarea (→ CodigoReparacion o Estrategia, TipoTarea, Material opcional)

Nivel 4:
  Encabezados (→ CodigoReparacion/Componente vía lookup por NP+DESCRIPCION TIPO)
```

### 5.3 Particularidades

- **Task List normal vs Toño** se importan en dos pasadas con origen distinto: normal usa `cod_rep_codigo`, Toño usa `estrategia_id`.
- **`Punto de Reposición` y `Stock Máximo`** vienen vacíos en el Excel → los materiales se crean con esos campos en NULL. La UI los captura después.
- **`Encabezados.HORAS` y `HH`** vienen vacíos → se insertan como NULL. Válido.
- **Flota** tiene valores duplicados en el Excel (`980E-4SE` aparece dos veces) → dedupe por código.

**Salida de Fase 1:** base de datos con todos los catálogos poblados, sin OTs reales todavía.

## 6. Fase 2 — Importar datos operativos

**Objetivo:** traer las ~18-22 OTs existentes, los 20 requerimientos, las 15 líneas de OC para tener data real en la que probar los módulos.

### 6.1 Pasos

1. Importar OTs de `6. Ots.xlsx` (17 filas) y `6.1 OTs VENTAS.xlsx` (21 filas, columna extra Tipo → se guarda en `tipo` string).
2. Importar requerimientos de `7. Log POs` → `OTRepuesto` con fase REQ.
3. Importar detalle de OC de `8. REQ & OC` hoja DETALLE → `OTRepuesto` enriquecido con `nro_oc`, `vendor`, `fecha_oc`, etc.
4. Poblar `OTHistorial` con la fecha de recepción inicial para que tengan historial base.

### 6.2 Lo que NO se importa

- `Encabezados.HORAS/HH` (vacíos) → queda pendiente de captura UI.
- Adjuntos / imágenes de OTs (no están en el Excel).
- Planificación operativa (Tablas de planificacion es un catálogo de operaciones, no planificación real).

**Salida de Fase 2:** ~38 OTs reales + sus requerimientos/OCs + catálogos completos.

## 7. Fase 3 — Módulos de soporte

**Objetivo:** completar lo que el flujo operativo necesita como infraestructura.

### 7.1 Proveedores

- API REST (`GET /api/proveedores`, POST, PUT, DELETE).
- UI: lista + formulario con catálogos (Moneda, Ubicación).
- Validación Zod en body.

### 7.2 Compras

- Modelo: Compra → OCItem → OTRepuesto.
- UI alineada con estructura de `8. REQ & OC` hoja DETALLE:
  - Vista resumen: OT, cliente, estado, total, fecha OC.
  - Vista detalle: líneas con material, cantidad, vendor, PU, valor, estado OC.
- Transiciones de estado validadas contra `StatusOC`.

### 7.3 Recepción de repuesto (bisagra entre Compras e Inventario)

Endpoint: `POST /api/compras/:id/recepcion`

Lógica:
```
1. Valida que OC esté en estado PROCESO o INCOMPLETO
2. Crea MovimientoInventario(ENTRADA, material, cantidad, nro_guia, fecha)
3. Incrementa Material.stock_actual += cantidad
4. Si cantidad_recibida == cantidad_oc → OC pasa a COMPLETO
   sino                               → OC pasa a INCOMPLETO
5. Auditoría en OTHistorial
```

**Salida de Fase 3:** ciclo de compra funcional. Se puede comprar, recibir, ver stock.

## 8. Fase 4 — Flujo operativo (el corazón)

**Objetivo:** implementar los 10 pasos de Capa 3. Esta fase es la más grande y se sub-divide.

### 8.1 `OTTarea` + `OTTareaCaptura` (nuevo modelo)

```
OTTarea
├── id
├── ot_id              (FK OrdenTrabajo)
├── tarea_id           (FK Tarea del catálogo)
├── estado             (pendiente / en_proceso / completada / n_a)
├── tecnico_id         (FK Usuario)
├── fecha_inicio
├── fecha_fin
├── observaciones
└── orden              (int, para ordenar dentro de OT)

OTTareaCaptura
├── id
├── ot_tarea_id        (FK OTTarea)
├── campo_key          (string: "bore_diameter", "rayaduras_axiales", etc.)
├── tipo_captura       (enum: MEDIDA_NUMERICA | CHECKLIST_BMN | FOTO | TEXTO | TOLERANCIA)
├── valor_numero       (decimal, nullable)
├── valor_texto        (string, nullable)
├── valor_booleano     (bool, nullable)
├── valor_url          (string para fotos, nullable)
└── unidad             (string: "mm", "in", nullable)
```

**Lógica de creación:**
Al crear una OT con `codigo_reparacion` asignado, servidor copia automáticamente las `Tarea` del catálogo con ese `cod_rep_codigo` como `OTTarea` en estado `pendiente`. Si es OT de mantenimiento preventivo (disparada por Estrategia), copia las Tarea con ese `estrategia_id`.

**Lógica de captura:**
Cada `Tarea` del catálogo declara qué `campo_key` produce (columna nueva `campos_captura` JSON en Tarea). Ejemplo: tarea "Medir diámetro interior A1-A4" declara 4 campos: `bore_a1`, `bore_a2`, `bore_a3`, `bore_a4`. Cuando el técnico marca la tarea completada, el formulario pide esos 4 valores y los guarda como `OTTareaCaptura`.

### 8.2 Evaluación digital

- Página: `/ordenes-trabajo/[id]/evaluacion`.
- Lee el `descripcion_tipo` del CodigoReparacion de la OT (CHVS, CHP, AE, AV, RD, FS, SD, CHT, CHPDV).
- Renderiza la plantilla correspondiente (8 modelos, ver HTML original).
- Lee `OTTareaCaptura` y pinta los campos por `campo_key`.
- Export PDF/Word del render actual.
- Sin firma digital en v1 (no está en el HTML original).

### 8.3 Cotización

- Pre-requisito: `Encabezados.HORAS` y `HH` llenos para ese CodRep.
- Cálculo:
  ```
  por cada operacion de Encabezados del cod_rep:
    subtotal_op = QTY × HH × tarifa_hora_actual
  por cada Tarea del cod_rep con Material.precio:
    subtotal_rep = requerimiento × precio_material
  total = Σ subtotales + costos_adicionales
  ```
- Genera PDF de cotización.
- Campo `monto_cotizacion` en OT se llena.

**Si HORAS/HH no están llenos**: UI muestra warning "Cotización incompleta, faltan datos en Encabezados" y deja capturar manualmente el monto.

### 8.4 Aprobación del cliente

Flujo simple: botón Aprobado / Rechazado en la OT.
- Aprobado → genera automáticamente `OTRepuesto` (en `StatusRequerimiento = REV`) para cada Tarea del cod_rep. Setea `fecha_aprobacion`.
- Rechazado → `ot_status = Cerrada`, `taller_status = "Devolucion cliente"`.

### 8.5 Producción con % automático

- `PlanificacionOT` ya existe. Se vincula a cada `OperacionReparacion` de los Encabezados del cod_rep.
- Cuando una `PlanificacionOT.estado = TERMINADO`, cálculo:
  ```
  pct_componente = (ops TERMINADO del componente / ops totales del componente) × 100
  ```
- Mapping automático: `pct_cilindro`, `pct_vastago`, `pct_tapa`, `pct_piston`, etc. en OrdenTrabajo.

### 8.6 Scheduler de mantenimiento preventivo

- Job diario (cron o similar): lee `Estrategia.fecha_proxima_ejecucion`.
- Si `fecha_proxima <= hoy + 7 días`: crea OT con:
  - `equipo_codigo` = Estrategia.equipo
  - `tipo` = "MANTENIMIENTO"
  - OTTareas generadas desde `Tarea` con ese `estrategia_id`
- Al marcarse la OT como completada: actualiza `Estrategia.fecha_ultima_ejecucion = hoy` y recalcula `fecha_proxima = hoy + frecuencia`.

**Salida de Fase 4:** flujo completo recepción → facturación operativo para reparaciones y mantenimiento preventivo.

## 9. Fase 5 — Control y reportes

**Objetivo:** hacer visible lo que ya está operativo.

### 9.1 Dashboard

- OTs por estado (contadores): Abiertas / Cerradas / En evaluación / En cotización / En producción / Entregadas hoy.
- Alertas SLA: OTs con `dias_en_taller` ≥ 80% de `Contrato.dias_reparacion`.
- Materiales críticos: `stock_actual ≤ punto_reposicion` (solo cuando Punto de Reposición esté lleno).
- OCs en tránsito con `fecha_estimada_llegada` vencida.

### 9.2 Reportes

- OTs facturadas del mes × cliente × monto.
- Tiempo promedio por fase (derivado de OTHistorial).
- Utilización de técnicos: HH planificadas vs reales.
- Rotación de inventario.

### 9.3 Auditoría

- Vista de `OTHistorial` por OT.
- Trazabilidad material: todas las entradas/salidas por material.

## 10. Bloqueos conocidos y cómo se destrancan

| Bloqueo | Fase afectada | Cómo destrabarlo |
|---|---|---|
| `Encabezados.HORAS`/`HH` vacíos (1856 filas) | 4.3 cotización automática | UI en módulo OperacionReparacion/Encabezados para que Producción complete masivamente. Exportable a Excel para edición offline si ayuda. |
| `Material.punto_reposicion` / `stock_maximo` vacíos | 5.1 alerta stock crítico | UI en Materiales para captura. Alertas se prenden cuando el campo tenga valor. |
| `TipoOT` sin definir | Nada crítico hoy | Esperar decisión del equipo. Si llegan tipos concretos, se convierte `tipo` string a FK. |
| Estados de REQ/COT/OC con valores heterogéneos en históricos | 2 importación | Normalizar durante seed: mapear texto libre a código del catálogo. Si no hace match → reportar outlier. |

## 11. Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Schema de `OTTarea`/`OTTareaCaptura` genérico puede perder validación | Zod a nivel servicio por `tipo_captura`. Catálogo `campo_key` documenta los válidos por modelo de evaluación. |
| Import con FKs huérfanas | Script valida y aborta con reporte, no silencia. |
| Cambios de catálogo en el Excel después del seed | Seed es idempotente (upsert por código). Re-ejecutar trae diffs. |
| Pérdida de datos en migraciones de Fase 0 | Migraciones aditivas (nuevas columnas nullable, no drops). Backup antes de cada migrate en prod. |

## 12. Estado actual (snapshot)

- Schema Prisma con modelos centrales (OT, Material, Equipo, Cliente, Proveedor, CodRep, Tarea, Estrategia, etc.) y la mayoría de catálogos.
- Módulos con UI funcional: Clientes, Códigos de reparación, Compras (parcial), Contratos, Dashboard (parcial), Equipos, Materiales, Órdenes de trabajo, Proveedores (parcial), Reportes.
- Scripts existentes: `analyze-excel.mjs`, `analyze-excel-v2.mjs`, `compare-tasklists.mjs`, `import-equipos.ts`.
- Pendiente: todo lo descrito en Fases 0-5.

## 13. Orden de arranque propuesto (primera sesión de código)

Cuando se autorice arrancar:

1. Fase 0.1 — migración "catalogos-faltantes": `Componente`, `OperacionReparacion`, `StatusRequerimiento`, `StatusCotizacion`, `StatusOC`, enum `TipoMovimientoInventario`.
2. Fase 0.2 — migración "ajustes-schema": FKs en `MovimientoInventario`, FK opcional `estrategia_id` en `Tarea`, campos nuevos en `CodigoReparacion`, FKs en `OTRepuesto`.
3. Fase 0.3 — servicio de auditoría en `OTHistorial` + hook en update de OT.
4. Verificación: `prisma migrate dev` + tests unitarios de auditoría.
5. Fase 1 — script `scripts/seed-all.ts` iterativo.

Pausa para review antes de Fase 2.
