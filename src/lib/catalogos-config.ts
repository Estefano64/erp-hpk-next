/**
 * Configuración schema-driven de catálogos maestros.
 * Una sola fuente de verdad para:
 *  - índice (categoría, label, icono)
 *  - CRUD (campos editables, validaciones)
 *  - validación server-side (mismo objeto se importa en /api/catalogos/[tabla])
 *
 * NOTA: las claves de `tabla` deben coincidir con el `allowed` de /api/catalogos/route.ts
 *       y con el nombre del modelo en Prisma (lowercase camelCase).
 */

export type FieldType =
  | "string"     // input texto corto
  | "text"       // textarea
  | "number"     // input numérico
  | "boolean"    // switch
  | "color"      // input de color
  | "select-fk"  // select cuyas opciones se traen de otro catálogo
  | "select";    // select con options fijas (hardcoded)

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  maxLength?: number;
  /** Para `select-fk`: el id de la tabla referenciada. */
  fkTabla?: string;
  /** Para `select-fk`: campo del registro foreign que se usa como value (default `codigo`). */
  fkValueField?: string;
  /** Para `select-fk`: campo del registro foreign que se usa como label (default `nombre`). */
  fkLabelField?: string;
  /** Para `select` con options hardcoded. */
  options?: { value: string | number; label: string }[];
  /** Solo lectura (ej. para PK, fechas auto). */
  readOnly?: boolean;
  /** Texto de ayuda. */
  hint?: string;
}

export interface CatalogoConfig {
  /** Clave que coincide con allowed en /api/catalogos/route.ts */
  id: string;
  /** Nombre humano (en plural). */
  label: string;
  /** Para descripción opcional bajo el título. */
  description?: string;
  /** Agrupador en el índice. */
  category:
    | "Datos maestros"
    | "Reparación (OT)"
    | "Mantenimiento Taller"
    | "Estados / Workflow";
  /** Nombre del campo PK (e.g., "planta_id"). */
  pkField: string;
  /** Campo único legible (típicamente "codigo"). */
  uniqueField: string;
  /** Campo para mostrar en listas (default "nombre"). */
  displayField?: string;
  /** Por defecto se ordena por `codigo` o por `pkField` si se indica `orderByPK`. */
  orderByPK?: boolean;
  /** Campos editables. `codigo` y `nombre` deberían ir siempre, pero los explícitamos. */
  fields: FieldDef[];
}

const codigoNombre = (codigoMax: number, nombreMax: number = 100): FieldDef[] => [
  { key: "codigo", label: "Código", type: "string", required: true, maxLength: codigoMax },
  { key: "nombre", label: "Nombre", type: "string", required: true, maxLength: nombreMax },
];

const activo: FieldDef = { key: "activo", label: "Activo", type: "boolean" };

export const catalogosConfig: CatalogoConfig[] = [
  // ── General ────────────────────────────────────────────────────────────
  {
    id: "planta",
    label: "Plantas",
    description: "Sedes / plantas de la organización.",
    category: "Datos maestros",
    pkField: "planta_id",
    uniqueField: "codigo",
    fields: [
      ...codigoNombre(10),
      { key: "direccion", label: "Dirección", type: "string", maxLength: 200 },
      activo,
    ],
  },
  {
    id: "area",
    label: "Áreas",
    description: "Áreas operativas dentro de una planta.",
    category: "Datos maestros",
    pkField: "area_id",
    uniqueField: "codigo",
    fields: [
      ...codigoNombre(10),
      { key: "planta_codigo", label: "Planta", type: "select-fk", fkTabla: "planta" },
      activo,
    ],
  },
  {
    id: "subArea",
    label: "Sub-Áreas",
    category: "Datos maestros",
    pkField: "sub_area_id",
    uniqueField: "codigo",
    fields: [
      ...codigoNombre(10),
      { key: "area_codigo", label: "Área", type: "select-fk", fkTabla: "area", required: true },
      activo,
    ],
  },
  {
    id: "ubicacion",
    label: "Ubicaciones",
    category: "Datos maestros",
    pkField: "ubicacion_id",
    uniqueField: "codigo",
    fields: [
      ...codigoNombre(10),
      { key: "descripcion", label: "Descripción", type: "string", maxLength: 200 },
      activo,
    ],
  },
  {
    id: "unidadMedida",
    label: "Unidades de medida",
    category: "Datos maestros",
    pkField: "unidad_medida_id",
    uniqueField: "codigo",
    fields: [
      ...codigoNombre(10),
      { key: "abreviatura", label: "Abreviatura", type: "string", maxLength: 20 },
      activo,
    ],
  },
  {
    id: "moneda",
    label: "Monedas",
    category: "Datos maestros",
    pkField: "moneda_id",
    uniqueField: "codigo",
    fields: [
      ...codigoNombre(10),
      { key: "simbolo", label: "Símbolo", type: "string", maxLength: 10 },
      activo,
    ],
  },
  {
    id: "categoria",
    label: "Categorías (Materiales)",
    category: "Datos maestros",
    pkField: "categoria_id",
    uniqueField: "codigo",
    fields: [...codigoNombre(10), activo],
  },
  {
    id: "clasificacion",
    label: "Clasificaciones",
    category: "Datos maestros",
    pkField: "clasificacion_id",
    uniqueField: "codigo",
    fields: [...codigoNombre(10), activo],
  },

  // ── Equipos ────────────────────────────────────────────────────────────
  {
    id: "tipoEquipo",
    label: "Tipos de equipo",
    category: "Datos maestros",
    pkField: "tipo_equipo_id",
    uniqueField: "codigo",
    fields: [...codigoNombre(10), activo],
  },
  {
    id: "statusEquipo",
    label: "Estados de equipo",
    category: "Mantenimiento Taller",
    pkField: "status_equipo_id",
    uniqueField: "codigo",
    fields: [...codigoNombre(10), activo],
  },
  {
    id: "criticidad",
    label: "Criticidades",
    category: "Mantenimiento Taller",
    pkField: "criticidad_id",
    uniqueField: "codigo",
    fields: [
      ...codigoNombre(10),
      { key: "nivel", label: "Nivel", type: "number", hint: "Cuanto mayor, más crítico" },
      activo,
    ],
  },
  {
    id: "fabricante",
    label: "Fabricantes",
    category: "Datos maestros",
    pkField: "fabricante_id",
    uniqueField: "codigo",
    fields: [
      ...codigoNombre(20, 200),
      { key: "pais", label: "País", type: "string", maxLength: 100 },
      activo,
    ],
  },
  {
    id: "flotaEquipo",
    label: "Flotas de equipo",
    category: "Reparación (OT)",
    pkField: "flota_equipo_id",
    uniqueField: "codigo",
    fields: [...codigoNombre(20), activo],
  },

  // ── Estados OT ─────────────────────────────────────────────────────────
  {
    id: "otStatus",
    label: "Estado OT",
    category: "Estados / Workflow",
    pkField: "ot_status_id",
    uniqueField: "codigo",
    orderByPK: true,
    fields: [...codigoNombre(30), activo],
  },
  {
    id: "recursosStatus",
    label: "Estado Recursos",
    category: "Estados / Workflow",
    pkField: "recursos_status_id",
    uniqueField: "codigo",
    orderByPK: true,
    fields: [...codigoNombre(30), activo],
  },
  {
    id: "tallerStatus",
    label: "Estado Taller",
    category: "Estados / Workflow",
    pkField: "taller_status_id",
    uniqueField: "codigo",
    orderByPK: true,
    fields: [...codigoNombre(30), activo],
  },

  // ── Reparación ─────────────────────────────────────────────────────────
  {
    id: "atencionReparacion",
    label: "Atención reparación",
    category: "Reparación (OT)",
    pkField: "atencion_reparacion_id",
    uniqueField: "codigo",
    orderByPK: true,
    fields: [...codigoNombre(30), activo],
  },
  {
    id: "tipoReparacion",
    label: "Tipos de reparación",
    category: "Reparación (OT)",
    pkField: "tipo_reparacion_id",
    uniqueField: "codigo",
    orderByPK: true,
    fields: [...codigoNombre(10), activo],
  },
  {
    id: "tipoGarantia",
    label: "Tipos de garantía",
    category: "Reparación (OT)",
    pkField: "tipo_garantia_id",
    uniqueField: "codigo",
    orderByPK: true,
    fields: [...codigoNombre(30), activo],
  },
  {
    id: "garantia",
    label: "Garantía (Sí/No)",
    category: "Reparación (OT)",
    pkField: "garantia_id",
    uniqueField: "codigo",
    orderByPK: true,
    fields: [...codigoNombre(10), activo],
  },
  {
    id: "prioridadAtencion",
    label: "Prioridad de atención",
    category: "Reparación (OT)",
    pkField: "prioridad_atencion_id",
    uniqueField: "codigo",
    orderByPK: true,
    fields: [
      ...codigoNombre(10),
      { key: "nivel", label: "Nivel", type: "number", hint: "1 = más urgente" },
      activo,
    ],
  },
  {
    id: "baseMetalica",
    label: "Base metálica (Sí/No)",
    category: "Reparación (OT)",
    pkField: "base_metalica_id",
    uniqueField: "codigo",
    orderByPK: true,
    fields: [...codigoNombre(10), activo],
  },
  {
    id: "tipoCodRep",
    label: "Tipos Cod. Reparable",
    category: "Reparación (OT)",
    pkField: "tipo_cod_rep_id",
    uniqueField: "codigo",
    fields: [...codigoNombre(10), activo],
  },
  {
    id: "categoriaCodRep",
    label: "Categorías Cod. Reparable",
    category: "Reparación (OT)",
    pkField: "categoria_cod_rep_id",
    uniqueField: "codigo",
    fields: [...codigoNombre(10), activo],
  },
  {
    id: "posicion",
    label: "Posiciones",
    category: "Reparación (OT)",
    pkField: "posicion_id",
    uniqueField: "codigo",
    fields: [...codigoNombre(10), activo],
  },
  {
    id: "modeloEvaluacion",
    label: "Modelos de evaluación",
    category: "Reparación (OT)",
    pkField: "modelo_evaluacion_id",
    uniqueField: "codigo",
    fields: [...codigoNombre(10, 200), activo],
  },

  // ── Operaciones ────────────────────────────────────────────────────────
  {
    id: "componente",
    label: "Componentes",
    category: "Reparación (OT)",
    pkField: "componente_id",
    uniqueField: "codigo",
    fields: [...codigoNombre(30), activo],
  },
  {
    id: "operacionReparacion",
    label: "Operaciones de reparación",
    category: "Reparación (OT)",
    pkField: "operacion_reparacion_id",
    uniqueField: "codigo",
    fields: [
      ...codigoNombre(20, 200),
      { key: "componente_codigo", label: "Componente", type: "select-fk", fkTabla: "componente" },
      {
        key: "clasificacion",
        label: "Clasificación",
        type: "select",
        required: true,
        options: [
          { value: "STD", label: "Estándar" },
          { value: "NO_STD", label: "No estándar" },
        ],
      },
      activo,
    ],
  },
  {
    id: "conjuntoMantenimiento",
    label: "Conjuntos de mantenimiento",
    category: "Mantenimiento Taller",
    pkField: "conjunto_mantenimiento_id",
    uniqueField: "codigo",
    fields: [
      ...codigoNombre(20),
      { key: "descripcion", label: "Descripción", type: "string", maxLength: 200 },
      activo,
    ],
  },
  {
    id: "estrategia",
    label: "Estrategias de mantenimiento",
    description: "Planes de mantenimiento preventivo (MP1-MP4) por equipo del taller.",
    category: "Mantenimiento Taller",
    pkField: "estrategia_id",
    uniqueField: "codigo",
    displayField: "descripcion",
    fields: [
      { key: "codigo", label: "Código", type: "string", required: true, maxLength: 50 },
      { key: "descripcion", label: "Descripción", type: "string", required: true, maxLength: 200, hint: "Ej. MP1, MP2..." },
      { key: "actividad_codigo", label: "Actividad", type: "string", required: true, maxLength: 50, hint: "Ej. MP1, MP2..." },
      { key: "frecuencia", label: "Frecuencia", type: "number", required: true, hint: "Cantidad de unidades (ej. 3 meses)" },
      { key: "unidad_medida_codigo", label: "Unidad", type: "select-fk", fkTabla: "unidadMedida", required: true },
      { key: "area_codigo", label: "Área", type: "select-fk", fkTabla: "area", required: true },
      { key: "equipo_codigo", label: "Equipo", type: "select-fk", fkTabla: "equipo", fkLabelField: "descripcion" },
      { key: "conjunto_codigo", label: "Conjunto", type: "select-fk", fkTabla: "conjuntoMantenimiento" },
      { key: "tipo_estrategia_codigo", label: "Tipo", type: "select-fk", fkTabla: "tipoEstrategia", required: true },
      { key: "status_codigo", label: "Estado", type: "select-fk", fkTabla: "statusEstrategia", required: true },
      activo,
    ],
  },

  // ── Workflow ───────────────────────────────────────────────────────────
  {
    id: "servicioReparacion",
    label: "Servicios de Reparación (OT)",
    description: "Servicios externos / tercerizados que se asignan a tareas tipo SER de un código reparable.",
    category: "Reparación (OT)",
    pkField: "servicio_reparacion_id",
    uniqueField: "codigo",
    fields: [
      ...codigoNombre(20, 300),
      { key: "descripcion", label: "Descripción", type: "text" },
      activo,
    ],
  },
  {
    id: "servicioMantenimiento",
    label: "Servicios de Mantenimiento Taller",
    description: "Servicios para mantenimiento de equipos del taller (estrategias MP1-MP4).",
    category: "Mantenimiento Taller",
    pkField: "servicio_mantenimiento_id",
    uniqueField: "codigo",
    fields: [
      ...codigoNombre(20, 300),
      { key: "descripcion", label: "Descripción", type: "text" },
      activo,
    ],
  },
  {
    id: "statusTarea",
    label: "Estados de tarea",
    description: "Estados de planificación: abierto, programado, realizado, etc.",
    category: "Estados / Workflow",
    pkField: "status_tarea_id",
    uniqueField: "codigo",
    orderByPK: true,
    fields: [
      ...codigoNombre(20),
      { key: "color", label: "Color", type: "color", hint: "Color del tag en Gantt y tablas" },
      { key: "orden", label: "Orden", type: "number" },
      activo,
    ],
  },
  {
    id: "tipoTarea",
    label: "Tipos de tarea",
    category: "Estados / Workflow",
    pkField: "tipo_tarea_id",
    uniqueField: "codigo",
    fields: [...codigoNombre(10), activo],
  },
  {
    id: "statusRequerimiento",
    label: "Estados de requerimiento",
    category: "Estados / Workflow",
    pkField: "status_requerimiento_id",
    uniqueField: "codigo",
    orderByPK: true,
    fields: [
      ...codigoNombre(20),
      { key: "orden", label: "Orden", type: "number" },
      activo,
    ],
  },
  {
    id: "statusCotizacion",
    label: "Estados de cotización",
    category: "Estados / Workflow",
    pkField: "status_cotizacion_id",
    uniqueField: "codigo",
    orderByPK: true,
    fields: [
      ...codigoNombre(20),
      { key: "orden", label: "Orden", type: "number" },
      activo,
    ],
  },
  {
    id: "statusOc",
    label: "Estados de OC",
    category: "Estados / Workflow",
    pkField: "status_oc_id",
    uniqueField: "codigo",
    orderByPK: true,
    fields: [
      ...codigoNombre(20),
      { key: "orden", label: "Orden", type: "number" },
      activo,
    ],
  },
  {
    id: "statusEstrategia",
    label: "Estados de estrategia",
    category: "Mantenimiento Taller",
    pkField: "status_estrategia_id",
    uniqueField: "codigo",
    fields: [...codigoNombre(10), activo],
  },
  {
    id: "tipoEstrategia",
    label: "Tipos de estrategia",
    category: "Mantenimiento Taller",
    pkField: "tipo_estrategia_id",
    uniqueField: "codigo",
    fields: [...codigoNombre(10), activo],
  },
];

export const catalogosById: Record<string, CatalogoConfig> = Object.fromEntries(
  catalogosConfig.map((c) => [c.id, c]),
);

export const catalogosByCategory = catalogosConfig.reduce<Record<string, CatalogoConfig[]>>((acc, c) => {
  if (!acc[c.category]) acc[c.category] = [];
  acc[c.category].push(c);
  return acc;
}, {});
