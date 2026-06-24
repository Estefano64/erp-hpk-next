// Catálogo jerárquico de Áreas del Taller HP&K Arequipa.
// Se usa en el dropdown "Área del taller" del módulo OTs Internas.
//
// Es un catálogo hardcoded porque la jerarquía es estable y específica del taller.
// Si en el futuro se vuelve dinámico, mover a una tabla Prisma `AreaTaller`.
//
// El value de cada opción se guarda en `OrdenTrabajoInterna.area_taller` (VarChar 50).
// Tanto áreas padre (ej. "1.3") como sub-áreas (ej. "1.3.4") son seleccionables.

export interface AreaTallerOpt {
  value: string;   // código jerárquico, ej. "1.3.4"
  label: string;   // nombre humano, ej. "Infraestructura"
  parent?: string; // value del padre, ej. "1.3"
}

// Áreas (nivel 2) y sub-áreas (nivel 3). El nivel 1 ("TALLER HPK AQP") es la
// raíz implícita — no aparece como opción del select. Los labels se guardan
// en MAYÚSCULAS y los códigos numéricos (1.1, 1.3.4…) se mantienen solo en
// `value` para indexar internamente — la UI nunca los muestra.
export const AREAS_TALLER: AreaTallerOpt[] = [
  // 1.1 Administración
  { value: "1.1",   label: "ADMINISTRACIÓN" },
  { value: "1.1.1", label: "VENTAS",         parent: "1.1" },
  { value: "1.1.2", label: "SOMA",           parent: "1.1" },
  { value: "1.1.3", label: "CONTABILIDAD",   parent: "1.1" },

  // 1.2 Logística
  { value: "1.2",   label: "LOGÍSTICA" },
  { value: "1.2.1", label: "ALMACÉN DE SUMINISTROS", parent: "1.2" },
  { value: "1.2.2", label: "ALMACÉN DE REPUESTOS",   parent: "1.2" },

  // 1.3 Mantenimiento
  { value: "1.3",   label: "MANTENIMIENTO" },
  { value: "1.3.1", label: "HERRAMIENTAS",   parent: "1.3" },
  { value: "1.3.2", label: "MÁQUINAS",       parent: "1.3" },
  { value: "1.3.3", label: "VEHÍCULOS",      parent: "1.3" },
  { value: "1.3.4", label: "INFRAESTRUCTURA",parent: "1.3" },

  // 1.4 Operación
  { value: "1.4",   label: "OPERACIÓN" },
  { value: "1.4.1", label: "EVALUACIÓN", parent: "1.4" },
  { value: "1.4.2", label: "BRUÑIDO",    parent: "1.4" },
  { value: "1.4.3", label: "SOLDADURA",  parent: "1.4" },
  { value: "1.4.5", label: "PINTURA",    parent: "1.4" },
  { value: "1.4.6", label: "CROMADO",    parent: "1.4" },

  // 1.5 Gerencia (sin sub-áreas)
  { value: "1.5",   label: "GERENCIA" },
];

// Devuelve el label legible (sin prefijo numérico, en mayúsculas) para un
// código guardado. Ej: areaTallerLabel("1.3.4") → "INFRAESTRUCTURA".
// Si el código no está en el catálogo, devuelve el código tal cual.
export function areaTallerLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const found = AREAS_TALLER.find((a) => a.value === value);
  return found ? found.label : value;
}

// Devuelve opciones agrupadas para usar con <Select>. Los grupos son las áreas
// padre y dentro van las sub-áreas. Si un padre no tiene sub-áreas (caso de
// GERENCIA), el padre se incluye como única opción seleccionable de su grupo.
export function areasTallerGrouped(): {
  label: string;
  options: { value: string; label: string }[];
}[] {
  const padres = AREAS_TALLER.filter((a) => !a.parent);
  return padres.map((p) => {
    const hijos = AREAS_TALLER.filter((a) => a.parent === p.value);
    return {
      label: p.label,
      options: hijos.length > 0
        ? hijos.map((h) => ({ value: h.value, label: h.label }))
        : [{ value: p.value, label: p.label }],
    };
  });
}

// Códigos de sub-áreas de Mantenimiento usados para filtrar el selector de
// equipos según el área del taller elegida.
export const AREA_TALLER_EQUIPOS = "1.3.2";    // Sub-área "EQUIPOS" → tipo MAQ
export const AREA_TALLER_VEHICULOS = "1.3.3";  // Sub-área "VEHÍCULOS" → tipo VEH

// Devuelve el código de TipoEquipo aplicable a un área del taller, o null si
// el área seleccionada no implica filtrar equipos. Solo MAQ y VEH habilitan
// el selector — el resto (Herramientas, Infraestructura, áreas administrativas)
// no tienen catálogo asociado en este flujo.
export function tipoEquipoPorAreaTaller(
  area: string | null | undefined,
): "MAQ" | "VEH" | null {
  if (area === AREA_TALLER_EQUIPOS) return "MAQ";
  if (area === AREA_TALLER_VEHICULOS) return "VEH";
  return null;
}
