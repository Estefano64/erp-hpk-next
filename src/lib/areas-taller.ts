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

// Áreas (nivel 2) y sub-áreas (nivel 3). El nivel 1 ("1. TALLER HPK AQP") es
// la raíz implícita — no aparece como opción del select.
export const AREAS_TALLER: AreaTallerOpt[] = [
  // 1.1 Administración
  { value: "1.1",   label: "Administración" },
  { value: "1.1.1", label: "Ventas",         parent: "1.1" },
  { value: "1.1.2", label: "SOMA",           parent: "1.1" },
  { value: "1.1.3", label: "Contabilidad",   parent: "1.1" },

  // 1.2 Logística
  { value: "1.2",   label: "Logística" },
  { value: "1.2.1", label: "Almacén de Suministros", parent: "1.2" },
  { value: "1.2.2", label: "Almacén de Repuestos",   parent: "1.2" },

  // 1.3 Mantenimiento
  { value: "1.3",   label: "Mantenimiento" },
  { value: "1.3.1", label: "Herramientas",   parent: "1.3" },
  { value: "1.3.2", label: "Equipos",        parent: "1.3" },
  { value: "1.3.3", label: "Vehículos",      parent: "1.3" },
  { value: "1.3.4", label: "Infraestructura",parent: "1.3" },

  // 1.4 Operación
  { value: "1.4",   label: "Operación" },
  { value: "1.4.1", label: "Evaluación", parent: "1.4" },
  { value: "1.4.2", label: "Bruñido",    parent: "1.4" },
  { value: "1.4.3", label: "Soldadura",  parent: "1.4" },
  { value: "1.4.4", label: "Maquinado",  parent: "1.4" },
  { value: "1.4.5", label: "Pintura",    parent: "1.4" },
  { value: "1.4.6", label: "Cromado",    parent: "1.4" },

  // 1.5 Gerencia (sin sub-áreas)
  { value: "1.5",   label: "Gerencia" },
];

// Devuelve el label legible (con prefijo numérico) para un código guardado.
// Ej: areaTallerLabel("1.3.4") → "1.3.4. Infraestructura".
// Si el código no está en el catálogo, devuelve el código tal cual.
export function areaTallerLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const found = AREAS_TALLER.find((a) => a.value === value);
  return found ? `${found.value}. ${found.label}` : value;
}

// Devuelve opciones agrupadas para usar con <Select>. Los grupos son las áreas
// padre (1.1, 1.2, ...) y dentro van las sub-áreas. Las áreas padre TAMBIÉN
// aparecen como opción seleccionable (primera dentro de su grupo).
export function areasTallerGrouped(): {
  label: string;
  options: { value: string; label: string }[];
}[] {
  const padres = AREAS_TALLER.filter((a) => !a.parent);
  return padres.map((p) => {
    const hijos = AREAS_TALLER.filter((a) => a.parent === p.value);
    return {
      label: `${p.value}. ${p.label}`,
      options: [
        { value: p.value, label: `${p.value}. ${p.label} (área completa)` },
        ...hijos.map((h) => ({ value: h.value, label: `${h.value}. ${h.label}` })),
      ],
    };
  });
}
