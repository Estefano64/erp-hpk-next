// Catálogos de hallazgos y recomendaciones para las hojas de evaluación.
// Extraídos del Excel `check_list_CUADRO_DE_CILINDROS_(EVALUACION).xlsx`.
//
// Cada hoja del Excel define, por componente (cilindro, vastago, tapa, etc.):
//   - HALLAZGOS: lista de observaciones que el evaluador puede marcar.
//     Algunos items vienen con sub-opciones (severidad o multi-tipo).
//   - RECOMENDACIONES: listas separadas en "Estándar" y "No estándar".
//
// Las claves (`key`) son estables — no cambiarlas sin migrar datos guardados,
// porque se usan como nombre del campo en `datos_formulario`.

export interface HallazgoItem {
  key: string;
  texto: string;
  // Si está presente, el item se muestra como check + radio para elegir severidad.
  severidades?: string[];
  // Si está presente, el item se muestra como check + multi-select de tipos.
  opcionesMultiples?: string[];
  // Si está presente, el item se muestra con un input de texto libre adicional
  // (ej. para medidas X:_____ Y:_____).
  campoLibre?: string;
}

export interface HallazgoGrupo {
  nombre: string;
  items: HallazgoItem[];
}

export interface RecomendacionItem {
  key: string;
  texto: string;
  // Si está presente, al marcar la recomendación se muestra un radio con
  // sub-opciones (ej. "REALIZAR CAMBIO DE" → COJINETE / ROTULA).
  subOpciones?: string[];
  // Si true, muestra un input numérico para la cantidad (ej. "REALIZAR CAMBIO
  // DE ___ PERNOS").
  cantidad?: boolean;
  // Si true, en el informe Word se omite la sub-opción y solo se imprime el
  // texto base. Ej: bruñido — en el form pide Mínimo/Regular pero el informe
  // solo dice "Realizar bruñido de cilindro" (nota del Excel R7c15).
  omitirSubOpEnInforme?: boolean;
}

export interface RecomendacionGrupo {
  nombre: string;
  estandar: RecomendacionItem[];
  noEstandar: RecomendacionItem[];
}

export interface CatalogoEvaluacion {
  // Hallazgos agrupados por componente del cilindro (cilindro, vastago, tapa, etc.)
  hallazgos: Record<string, HallazgoGrupo>;
  // Recomendaciones agrupadas por componente.
  recomendaciones: Record<string, RecomendacionGrupo>;
}

// ─── HALLAZGOS COMUNES (reutilizables entre tipos) ─────────────────────────

// Cojinete (aplica a CHVS y CHP — "tanto para cilindro como para vástago")
const HALLAZGOS_COJINETE: HallazgoItem[] = [
  {
    key: "coj_presenta",
    texto: "Presenta ____ en cojinete",
    opcionesMultiples: ["Corrosion", "Picaduras", "Desgaste"],
  },
  {
    key: "coj_llego",
    texto: "Cojinete llegó ____",
    opcionesMultiples: ["Fisurado", "Fracturado"],
  },
  { key: "coj_sin", texto: "Llegó sin cojinete" },
  {
    key: "coj_ovoide",
    texto: "Cojinete presenta forma ovoide",
    campoLibre: "X:_____ Y:_____",
  },
  { key: "coj_sin_sellos", texto: "Llegó sin sellos limpiadores" },
];

// Rótula (aplica a CHVS y CHP)
const HALLAZGOS_ROTULA: HallazgoItem[] = [
  {
    key: "rot_presenta",
    texto: "Presenta ____ en interior de rótula",
    opcionesMultiples: ["Corrosion", "Picaduras", "Desgaste"],
  },
  {
    key: "rot_llego",
    texto: "Rótula llegó ____",
    opcionesMultiples: ["Fisurada", "Fracturada"],
  },
  { key: "rot_sin", texto: "Llegó sin rótula" },
];

// Pin directo (CHVS)
const HALLAZGOS_PIN: HallazgoItem[] = [
  {
    key: "pin_presenta",
    texto: "Presenta ____ en alojamiento de pin",
    opcionesMultiples: ["Desgaste", "Corrosion", "Picaduras"],
  },
  {
    key: "pin_deformacion",
    texto: "Alojamiento de pin presenta deformación",
    campoLibre: "X:_____ Y:_____",
  },
];

// Cáncamo (CHVS, CHP, CHT)
const HALLAZGOS_CANCAMO: HallazgoItem[] = [
  {
    key: "can_alojamiento",
    texto: "Presenta ____ en alojamiento",
    opcionesMultiples: ["Desgaste", "Corrosion"],
  },
  {
    key: "can_ovoide",
    texto: "Alojamiento presenta forma ovoide",
    campoLibre: "X:_____ Y:_____",
  },
  {
    key: "can_presenta",
    texto: "Presenta ____ en cáncamo",
    opcionesMultiples: ["Fisuras", "Fractura"],
  },
  { key: "can_destruido", texto: "Llegó destruido" },
  { key: "can_caras", texto: "Caras laterales llegaron desgastadas" },
];

// Tapa (CHVS, CHP, CHT y acum_embolo)
const HALLAZGOS_TAPA: HallazgoItem[] = [
  { key: "tapa_ovoide", texto: "Diámetro interior presenta forma ovoide" },
  {
    key: "tapa_fuera_medida",
    texto: "Diámetro interior fuera de medida estándar",
    campoLibre: "Indicar medida",
  },
  {
    key: "tapa_picaduras",
    texto: "Alojamiento de ____ presenta picaduras",
    opcionesMultiples: ["Sello limpiador", "Sello principal", "Sello de amortiguación", "Anillo de desgaste", "Oring y back up", "Diámetro de sellado"],
  },
  {
    key: "tapa_desgaste",
    texto: "Alojamiento de ____ presenta desgaste",
    opcionesMultiples: ["Sello limpiador", "Sello principal", "Sello de amortiguación", "Anillo de desgaste", "Oring y back up", "Diámetro de sellado"],
  },
  {
    key: "tapa_fisura",
    texto: "Alojamiento de ____ presenta fisura",
    opcionesMultiples: ["Sello limpiador", "Sello principal", "Sello de amortiguación", "Anillo de desgaste", "Oring y back up", "Diámetro de sellado"],
  },
  {
    key: "tapa_deformacion",
    texto: "Alojamiento de ____ presenta deformación",
    opcionesMultiples: ["Sello limpiador", "Sello principal", "Sello de amortiguación", "Anillo de desgaste", "Oring y back up", "Diámetro de sellado"],
  },
  {
    key: "tapa_corrosion",
    texto: "Alojamiento de ____ presenta corrosión",
    opcionesMultiples: ["Sello limpiador", "Sello principal", "Sello de amortiguación", "Anillo de desgaste", "Oring y back up", "Diámetro de sellado"],
  },
  {
    key: "tapa_filos",
    texto: "Alojamiento de ____ presenta filos cortantes",
    opcionesMultiples: ["Sello limpiador", "Sello principal", "Sello de amortiguación", "Anillo de desgaste", "Oring y back up", "Diámetro de sellado"],
  },
  { key: "tapa_contaminantes", texto: "Alojamientos llegaron con presencia de contaminantes" },
  {
    key: "tapa_rod_bushing",
    texto: "Rod bushing presenta ____",
    opcionesMultiples: ["Desgaste", "Corrosion", "Picaduras"],
  },
  {
    key: "tapa_sello_dañado",
    texto: "Sello ____ llegó dañado",
    opcionesMultiples: ["Sello limpiador", "Sello principal", "Sello de amortiguación", "Anillo de desgaste", "Oring y back up", "Otro"],
  },
  {
    key: "tapa_sello_fabricado",
    texto: "Sello ____ llegó fabricado",
    opcionesMultiples: ["Sello limpiador", "Sello principal", "Sello de amortiguación", "Anillo de desgaste", "Oring y back up", "Otro"],
  },
];

// Émbolo (CHVS, CHP, CHT y acum_embolo)
const HALLAZGOS_EMBOLO: HallazgoItem[] = [
  { key: "emb_def_int", texto: "Diámetro interior presenta deformación" },
  {
    key: "emb_dext",
    texto: "Diámetro exterior presenta ____",
    opcionesMultiples: ["Golpes", "Rayaduras", "Desgaste"],
  },
  {
    key: "emb_corrosion",
    texto: "Alojamiento de ____ presenta corrosión",
    opcionesMultiples: ["Conjunto de sello", "Anillo de desgaste"],
  },
  {
    key: "emb_rayaduras",
    texto: "Alojamiento de ____ presenta rayaduras",
    opcionesMultiples: ["Conjunto de sello", "Anillo de desgaste"],
  },
  {
    key: "emb_filos",
    texto: "Alojamiento de ____ presenta filos cortantes",
    opcionesMultiples: ["Conjunto de sello", "Anillo de desgaste"],
  },
  { key: "emb_rosc_corrosion", texto: "Superficie roscada presenta corrosión" },
  { key: "emb_rosc_desgaste", texto: "Superficie roscada presenta desgaste" },
  { key: "emb_rosc_dañada", texto: "Superficie roscada dañada" },
];

// Vástago / Barra (CHVS, CHP, CHT)
const HALLAZGOS_VASTAGO_BARRA: HallazgoItem[] = [
  {
    key: "vas_cromado",
    texto: "Presenta ____ en superficie cromada",
    opcionesMultiples: ["Desgaste", "Picaduras"],
  },
  {
    key: "vas_flexion_barra",
    texto: "Barra presenta flexión",
    campoLibre: "Indicar medida",
  },
  { key: "vas_flexion_espiga", texto: "Presenta flexión de espiga" },
  {
    key: "vas_poco_cromo",
    texto: "Presenta poco espesor de cromo",
    campoLibre: "Indicar medida",
  },
  { key: "vas_desprendimiento_cromo", texto: "Presenta desprendimiento de capa de cromo" },
  { key: "vas_excesivo_cromo", texto: "Presenta excesiva capa de cromo" },
  { key: "vas_rosc_espiga", texto: "Presenta daño en superficie roscada de espiga" },
  { key: "vas_fisura_espiga", texto: "Presenta fisura en espiga" },
  { key: "vas_fisura_junta", texto: "Presenta fisura en junta" },
  { key: "vas_sin_cancamo", texto: "Llegó sin cáncamo" },
  { key: "vas_cancamo_desprendido", texto: "Llegó con cáncamo desprendido" },
];

// ─── HALLAZGOS - CILINDRO (CHVS) ───────────────────────────────────────────

const HALLAZGOS_CIL_CHVS_INTERIOR: HallazgoItem[] = [
  {
    key: "ax",
    texto: "Presenta rayaduras axiales en interior de cilindro",
    severidades: ["Leves", "Regulares", "Graves"],
  },
  {
    key: "rad",
    texto: "Presenta rayaduras radiales en interior de cilindro",
    severidades: ["Leves", "Regulares", "Graves"],
  },
  { key: "def", texto: "Diámetro interior presenta deformación" },
  {
    key: "fuera_tol",
    texto: "Medida interna fuera de tolerancia",
    campoLibre: "Indicar medida",
  },
  { key: "desg_int", texto: "Diámetro interior muestra desgaste" },
  { key: "desg_sell", texto: "Diámetro de sellado muestra desgaste" },
];

const HALLAZGOS_CIL_CHVS_EXTERIOR: HallazgoItem[] = [
  { key: "ext_golpes", texto: "Presenta golpes en el exterior del cilindro" },
  { key: "ext_desg", texto: "Presenta desgaste en exterior del cilindro" },
  { key: "ext_def", texto: "Presenta deformación en exterior de cilindro" },
  { key: "ext_sold", texto: "Presenta depósitos de soldadura ajenos al diseño original" },
];

// ─── HALLAZGOS - CILINDRO (CHP - Pivotado) ─────────────────────────────────
// Estructura igual a CHVS pero también tiene la sección "Trunnion"

const HALLAZGOS_TRUNNION_CHP: HallazgoItem[] = [
  {
    key: "trun_pivotantes",
    texto: "Presenta pivotantes con ____",
    opcionesMultiples: ["Desgaste", "Deformación", "Corrosion"],
  },
  { key: "trun_fisura", texto: "Presenta fisura en pivotantes" },
  { key: "trun_fract", texto: "Trunnion llegó fracturado" },
];

// Cojinete CHP (tiene un item adicional "presenta deformación")
const HALLAZGOS_COJINETE_CHP: HallazgoItem[] = [
  {
    key: "coj_ext",
    texto: "Presenta ____ en exterior de cojinete",
    opcionesMultiples: ["Corrosion", "Picaduras", "Desgaste"],
  },
  {
    key: "coj_llego",
    texto: "Cojinete llegó ____",
    opcionesMultiples: ["Fisurado", "Fracturado"],
  },
  { key: "coj_def", texto: "Presenta deformación en cojinete" },
  { key: "coj_sin", texto: "Llegó sin cojinete" },
];

// ─── HALLAZGOS - ACUMULADOR DE VEJIGA ──────────────────────────────────────

const HALLAZGOS_ACUM_VEJIGA: HallazgoItem[] = [
  { key: "av_corrosion", texto: "Diámetros de ingreso presentan corrosión" },
  { key: "av_bladder_roto", texto: "Bladder llegó roto" },
  {
    key: "av_int_presenta",
    texto: "Interior de cilindro presenta ____",
    opcionesMultiples: ["Contaminación", "Rebabas", "Daños"],
  },
  { key: "av_aceite_contam", texto: "Llegó con aceite contaminado" },
  { key: "av_valvula_dañada", texto: "Conjunto de válvula llegó dañado" },
  { key: "av_sin_valvula", texto: "Llegó sin conjunto de válvula" },
  { key: "av_ext_golpes", texto: "Exterior presenta golpes" },
];

// ─── HALLAZGOS - ACUMULADOR DE ÉMBOLO ──────────────────────────────────────

// Cilindro del acum_embolo es igual al CHVS interior + un "exterior golpes"
const HALLAZGOS_CIL_AE_INTERIOR: HallazgoItem[] = [
  ...HALLAZGOS_CIL_CHVS_INTERIOR,
  { key: "ext_golpes", texto: "Exterior presenta golpes" },
];

const HALLAZGOS_TAPA_AE: HallazgoItem[] = [
  {
    key: "tapa_rosc",
    texto: "Superficie roscada presenta ____",
    opcionesMultiples: ["Desgaste", "Daño", "Corrosion"],
  },
];

const HALLAZGOS_EMBOLO_AE: HallazgoItem[] = [
  {
    key: "emb_dext",
    texto: "Diámetro exterior presenta ____",
    opcionesMultiples: ["Golpes", "Rayaduras", "Desgaste"],
  },
  {
    key: "emb_alo_sellos",
    texto: "Alojamiento de sellos presentan ____",
    opcionesMultiples: ["Rayaduras", "Corrosion"],
  },
  { key: "emb_contaminacion", texto: "Sellos presentan contaminación" },
];

// ─── HALLAZGOS - CILINDRO TELESCÓPICO ──────────────────────────────────────

const HALLAZGOS_CUERPO_INTERMEDIO_CHT: HallazgoItem[] = [
  {
    key: "ci_ax",
    texto: "Presenta rayaduras axiales en interior de cuerpo",
    severidades: ["Leves", "Regulares", "Graves"],
  },
  {
    key: "ci_rad",
    texto: "Presenta rayaduras radiales en interior de cuerpo",
    severidades: ["Leves", "Regulares", "Graves"],
  },
  { key: "ci_def", texto: "Diámetro interior presenta deformación" },
  {
    key: "ci_cromado",
    texto: "Presenta ____ en superficie cromada",
    opcionesMultiples: ["Desgaste", "Picaduras"],
  },
  {
    key: "ci_capa_cromo",
    texto: "Presenta ____ capa de cromo",
    opcionesMultiples: ["Desprendimiento", "Excesiva"],
  },
  { key: "ci_fisura_junta", texto: "Presenta fisura en junta" },
  { key: "ci_rosc_dañada", texto: "Superficie roscada presenta daño (solo si es roscado)" },
];

const HALLAZGOS_TAPA_POSTERIOR_CHT: HallazgoItem[] = [
  { key: "tp_desgaste", texto: "Presenta desgaste en alojamiento" },
  {
    key: "tp_ovoide",
    texto: "Presenta forma ovoide en alojamiento",
    campoLibre: "X:_____ Y:_____",
  },
  { key: "tp_corrosion", texto: "Presenta corrosión en alojamiento" },
  { key: "tp_fisura", texto: "Presenta fisura en alojamiento" },
  { key: "tp_caras", texto: "Caras laterales llegaron desgastadas" },
  { key: "tp_fisura_cordon", texto: "Presenta fisura en cordón de soldadura" },
  {
    key: "tp_sello",
    texto: "Presenta alojamiento de sello con ____",
    opcionesMultiples: ["Desgaste", "Corrosion"],
  },
];

const HALLAZGOS_TAPA_ROSCADA_CHT: HallazgoItem[] = [
  { key: "tr_golpes", texto: "Presenta golpes en diámetro exterior" },
  { key: "tr_def", texto: "Presenta deformación" },
  { key: "tr_corrosion", texto: "Presenta corrosión" },
  { key: "tr_rosc_dañada", texto: "Superficie roscada dañada" },
  {
    key: "tr_alojamientos",
    texto: "Alojamientos presentan ____",
    opcionesMultiples: ["Desgaste", "Corrosion", "Picaduras"],
  },
];

// CHT: Rótula con items específicos (sin "rotula presenta corrosion" agrupado)
const HALLAZGOS_ROTULA_CHT: HallazgoItem[] = [
  { key: "rot_corrosion", texto: "Presenta corrosión en interior de rótula" },
  { key: "rot_picaduras", texto: "Presenta picaduras en interior de rótula" },
  { key: "rot_desgaste", texto: "Presenta desgaste en interior de rótula" },
  { key: "rot_fract", texto: "Rótula llegó fracturada" },
  { key: "rot_fisura", texto: "Rótula llegó fisurada" },
  { key: "rot_sin", texto: "Llegó sin rótula" },
];

// CHT: Cáncamo con items específicos
const HALLAZGOS_CANCAMO_CHT: HallazgoItem[] = [
  { key: "can_desgaste", texto: "Presenta desgaste en alojamiento" },
  {
    key: "can_ovoide",
    texto: "Presenta forma ovoide",
    campoLibre: "X:_____ Y:_____",
  },
  { key: "can_corrosion", texto: "Presenta corrosión en alojamiento" },
  { key: "can_fisura", texto: "Presenta fisura en alojamiento" },
  { key: "can_destruido", texto: "Llegó destruido" },
  { key: "can_caras", texto: "Caras laterales llegaron desgastadas" },
  { key: "can_fractura", texto: "Presenta fractura" },
  {
    key: "can_fisuras",
    texto: "Presenta fisuras en ____",
    opcionesMultiples: ["Interior de alojamiento", "Exterior"],
  },
];

// ─── RECOMENDACIONES ───────────────────────────────────────────────────────

// CHVS - Cilindro
const RECOM_CIL_CHVS_ESTANDAR: RecomendacionItem[] = [
  { key: "brunido", texto: "Realizar bruñido de cilindro", subOpciones: ["Mínimo", "Regular"], omitirSubOpEnInforme: true },
  { key: "recup_diam_sold", texto: "Recuperar diámetro de alojamiento con soldadura" },
  { key: "barrenado", texto: "Barrenado de alojamiento a medida nominal" },
  { key: "rectif_caras", texto: "Rectificado de caras laterales de cáncamo" },
  { key: "cambio_inst", texto: "Realizar cambio / instalación de", subOpciones: ["Cojinete", "Rotula"] },
  { key: "seguros", texto: "Realizar cambio / instalación de seguros seager" },
  { key: "sellos_limp", texto: "Realizar cambio / instalación de sellos limpiadores" },
  { key: "pulido_brida", texto: "Realizar pulido de cara de brida" },
];

const RECOM_CIL_CHVS_NO_ESTANDAR: RecomendacionItem[] = [
  { key: "reconst_aloj", texto: "Reconstrucción de alojamiento" },
  { key: "cambio_tubo", texto: "Realizar cambio de tubo" },
  { key: "fabr_cancamo", texto: "Realizar fabricación de cáncamo" },
  { key: "rectif_agujeros", texto: "Realizar rectificado de agujeros roscados" },
  { key: "recup_over30", texto: "Recuperar cilindro a OVER30" },
  { key: "fabr_soportes", texto: "Fabricar soportes roscados", cantidad: true },
];

// CHVS - Vástago
const RECOM_VAS_CHVS_ESTANDAR: RecomendacionItem[] = [
  { key: "rect_cromado", texto: "Realizar rectificado y cromado de vástago" },
  { key: "recup_diam_sold", texto: "Recuperar diámetro de alojamiento con soldadura" },
  { key: "barrenado", texto: "Barrenado de alojamiento a medida nominal" },
  { key: "rectif_caras", texto: "Rectificado de caras laterales de cáncamo" },
  { key: "cambio_inst", texto: "Realizar cambio / instalación de", subOpciones: ["Cojinete", "Rotula"] },
  { key: "seguros", texto: "Realizar cambio / instalación de seguros seager" },
  { key: "sellos_limp", texto: "Realizar cambio / instalación de sellos limpiadores" },
];

const RECOM_VAS_CHVS_NO_ESTANDAR: RecomendacionItem[] = [
  { key: "fabr_barra", texto: "Realizar fabricación de barra de vástago" },
  { key: "fabr_cancamo", texto: "Realizar fabricación de cáncamo" },
  { key: "rectif_rosc_espiga", texto: "Realizar rectificado de superficie roscada de espiga" },
  { key: "reconst_aloj", texto: "Reconstrucción de alojamiento" },
];

// Tapa (común CHVS, CHP)
const RECOM_TAPA_ESTANDAR: RecomendacionItem[] = [
  { key: "pulido_aloj", texto: "Pulido de alojamientos de tapa" },
  { key: "sellos", texto: "Realizar cambio / instalación de sellos" },
  { key: "rod_bushing", texto: "Realizar cambio / instalación de rod bushing" },
  { key: "pernos", texto: "Realizar cambio de pernos", cantidad: true },
  { key: "arandelas", texto: "Realizar cambio de arandelas", cantidad: true },
];

const RECOM_TAPA_NO_ESTANDAR: RecomendacionItem[] = [
  {
    key: "rectif_aloj",
    texto: "Rectificado de alojamiento de",
    subOpciones: ["Sello limpiador", "Sello principal", "Sello de amortiguación", "Anillo de desgaste", "Oring y back up", "Diámetro de sellado"],
  },
  { key: "fabr_tapa", texto: "Realizar fabricación de tapa" },
  { key: "cambio_tapa", texto: "Realizar cambio de tapa (nuevo)" },
];

// Émbolo (común CHVS, CHP, CHT y AE)
const RECOM_EMBOLO_ESTANDAR: RecomendacionItem[] = [
  { key: "pulido_aloj", texto: "Pulido de alojamientos de émbolo" },
  { key: "sellos", texto: "Realizar cambio / instalación de sellos" },
];

const RECOM_EMBOLO_NO_ESTANDAR: RecomendacionItem[] = [
  {
    key: "rectif_aloj",
    texto: "Rectificado de alojamiento de",
    subOpciones: ["Conjunto de sello", "Anillo de desgaste"],
  },
  { key: "fabr_embolo", texto: "Realizar fabricación de émbolo" },
  { key: "cambio_embolo", texto: "Realizar cambio de émbolo (nuevo)" },
];

// CHP - Cilindro (similar a CHVS pero con recups de pivotantes)
const RECOM_CIL_CHP_ESTANDAR: RecomendacionItem[] = [
  { key: "brunido", texto: "Realizar bruñido de cilindro", subOpciones: ["Mínimo", "Regular"], omitirSubOpEnInforme: true },
  { key: "recup_pivot_sold", texto: "Recuperar diámetro exterior de pivotantes con soldadura" },
  { key: "barrenado_pivot", texto: "Barrenado de pivotantes a medida nominal" },
  { key: "cambio_cojinetes", texto: "Realizar cambio / instalación de cojinetes" },
  { key: "pulido_brida", texto: "Realizar pulido de cara de brida" },
];

const RECOM_CIL_CHP_NO_ESTANDAR: RecomendacionItem[] = [
  { key: "reconst_pivot", texto: "Reconstrucción de pivotantes" },
  { key: "cambio_tubo", texto: "Realizar cambio de tubo" },
  { key: "rectif_agujeros", texto: "Realizar rectificado de agujeros roscados" },
  { key: "recup_over30", texto: "Recuperar cilindro a OVER30" },
  { key: "cambio_trunnion", texto: "Realizar cambio de trunnion" },
];

// AV (Acumulador de Vejiga)
const RECOM_AV_ESTANDAR: RecomendacionItem[] = [
  { key: "limpieza", texto: "Realizar limpieza de cilindro" },
  { key: "cambio_bladder", texto: "Realizar cambio de bladder" },
  { key: "cambio_valvula", texto: "Realizar cambio de válvula" },
];

const RECOM_AV_NO_ESTANDAR: RecomendacionItem[] = [
  { key: "cambio_conjunto", texto: "Realizar cambio de conjunto de válvula" },
  { key: "cambio_cilindro", texto: "Realizar cambio de cilindro de acumulador" },
];

// AE (Acumulador de Émbolo) - Cilindro
const RECOM_CIL_AE_ESTANDAR: RecomendacionItem[] = [
  { key: "brunido", texto: "Realizar bruñido de cilindro", subOpciones: ["Mínimo", "Regular"], omitirSubOpEnInforme: true },
  { key: "pulido_salida", texto: "Realizar pulido de diámetro de salida" },
];

const RECOM_CIL_AE_NO_ESTANDAR: RecomendacionItem[] = [
  { key: "cambio_tubo", texto: "Realizar cambio de tubo" },
  { key: "rectif_rosc", texto: "Realizar rectificado de superficie roscada" },
];

// AE - Tapa
const RECOM_TAPA_AE_ESTANDAR: RecomendacionItem[] = [
  { key: "pulido_aloj", texto: "Pulido de alojamientos de tapa" },
  { key: "sellos", texto: "Realizar cambio / instalación de sellos" },
];

const RECOM_TAPA_AE_NO_ESTANDAR: RecomendacionItem[] = [
  { key: "rectif_aloj", texto: "Rectificado de alojamiento" },
  { key: "fabr_tapa", texto: "Realizar fabricación de tapa" },
  { key: "cambio_tapa", texto: "Realizar cambio de tapa (nuevo)" },
];

// AE - Émbolo
const RECOM_EMBOLO_AE_ESTANDAR: RecomendacionItem[] = [
  { key: "pulido_aloj", texto: "Pulido de alojamientos de émbolo" },
  { key: "sellos", texto: "Realizar cambio / instalación de sellos" },
];

const RECOM_EMBOLO_AE_NO_ESTANDAR: RecomendacionItem[] = [
  { key: "rectif_aloj", texto: "Rectificado de alojamiento" },
  { key: "fabr_embolo", texto: "Realizar fabricación de émbolo" },
  { key: "cambio_embolo", texto: "Realizar cambio de émbolo (nuevo)" },
];

// CHT - Cilindro (incluye logica de tapa posterior)
const RECOM_CIL_CHT_ESTANDAR: RecomendacionItem[] = [
  { key: "brunido", texto: "Realizar bruñido de cilindro", subOpciones: ["Mínimo", "Regular"], omitirSubOpEnInforme: true },
  { key: "pulido_brida", texto: "Realizar pulido de cara de brida" },
  { key: "pulido_aloj", texto: "Realizar pulido de alojamientos (si tiene tapa posterior)" },
  { key: "recup_diam_sold", texto: "Recuperar diámetro de alojamiento con soldadura" },
  { key: "barrenado", texto: "Barrenado de alojamiento a medida nominal" },
  { key: "rectif_caras", texto: "Rectificado de caras laterales de cáncamo" },
  { key: "cambio_rotula", texto: "Realizar cambio / instalación de rotula" },
  { key: "seguros", texto: "Realizar cambio / instalación de seguros seager" },
];

const RECOM_CIL_CHT_NO_ESTANDAR: RecomendacionItem[] = [
  { key: "reconst_aloj", texto: "Reconstrucción de alojamiento" },
  { key: "cambio_tubo", texto: "Realizar cambio de tubo" },
  { key: "fabr_cancamo", texto: "Realizar fabricación de cáncamo" },
  { key: "rectif_agujeros", texto: "Realizar rectificado de agujeros roscados" },
];

// CHT - Vástago
const RECOM_VAS_CHT_ESTANDAR: RecomendacionItem[] = [
  { key: "rect_cromado", texto: "Realizar rectificado y cromado de vástago" },
  { key: "recup_diam_sold", texto: "Recuperar diámetro de alojamiento con soldadura" },
  { key: "barrenado", texto: "Barrenado de alojamiento a medida nominal" },
  { key: "rectif_caras", texto: "Rectificado de caras laterales de cáncamo" },
  { key: "cambio_rotula", texto: "Realizar cambio / instalación de rotula" },
  { key: "seguros", texto: "Realizar cambio / instalación de seguros seager" },
];

const RECOM_VAS_CHT_NO_ESTANDAR: RecomendacionItem[] = [
  { key: "cambio_vastago", texto: "Realizar cambio de vástago" },
  { key: "rectif_rosc", texto: "Realizar rectificado de superficie roscada" },
  { key: "reconst_aloj", texto: "Reconstrucción de alojamiento" },
];

// CHT - Cuerpo intermedio
const RECOM_CUERPO_INTERM_ESTANDAR: RecomendacionItem[] = [
  { key: "brunido", texto: "Realizar bruñido de cuerpo intermedio", omitirSubOpEnInforme: true },
  { key: "rect_cromado_ext", texto: "Realizar rectificado y cromado de superficie exterior de cuerpo intermedio" },
  { key: "pulido_aloj", texto: "Realizar pulido de alojamientos" },
];

const RECOM_CUERPO_INTERM_NO_ESTANDAR: RecomendacionItem[] = [
  { key: "rectif_aloj", texto: "Realizar rectificado de alojamientos" },
  { key: "rectif_rosc", texto: "Realizar rectificado de superficie roscada" },
  { key: "reparar_fisura", texto: "Reparar fisura de junta" },
];

// CHT - Tapa Posterior
const RECOM_TAPA_POSTERIOR_ESTANDAR: RecomendacionItem[] = [
  { key: "recup_diam_sold", texto: "Recuperar diámetro de alojamiento con soldadura" },
  { key: "barrenado", texto: "Barrenado de alojamiento a medida nominal" },
  { key: "rectif_caras", texto: "Rectificado de caras laterales de cáncamo" },
  { key: "cambio_rotula", texto: "Realizar cambio / instalación de rotula" },
  { key: "seguros", texto: "Realizar cambio / instalación de seguros seager" },
  { key: "pulido_sellos", texto: "Realizar pulido de alojamiento de sellos" },
];

const RECOM_TAPA_POSTERIOR_NO_ESTANDAR: RecomendacionItem[] = [
  { key: "reparar_soldadura", texto: "Reparar soldadura de tubo de transferencia" },
  { key: "reconst_aloj", texto: "Reconstrucción de alojamiento" },
];

// CHT - Tapa Roscada
const RECOM_TAPA_ROSCADA_ESTANDAR: RecomendacionItem[] = [
  { key: "pulido_aloj_sellos", texto: "Realizar pulido de alojamientos de sellos" },
  { key: "sellos", texto: "Realizar cambio / instalación de sellos" },
  { key: "pulido_exterior", texto: "Realizar pulido de exterior" },
];

const RECOM_TAPA_ROSCADA_NO_ESTANDAR: RecomendacionItem[] = [
  {
    key: "rectif_aloj",
    texto: "Rectificado de alojamiento de",
    subOpciones: ["Sello limpiador", "Sello principal", "Sello de amortiguación", "Anillo de desgaste", "Oring y back up", "Diámetro de sellado", "Otro"],
  },
  { key: "fabr_tapa", texto: "Realizar fabricación de tapa" },
  { key: "cambio_tapa", texto: "Realizar cambio de tapa (nuevo)" },
  { key: "reparar_dext", texto: "Reparar con soldadura diámetro exterior" },
];

// ─── HALLAZGOS - RUEDA DELANTERA (HUB / SPINDLE / FRENOS) ──────────────────
// Extraídos del Excel 1, hoja "7" (Rueda Delantera), col 0 = checks de
// RESULTADOS, col 3 = checks de RECOMENDACIONES. No tienen split estándar / no
// estándar — todas van en `estandar` para que la UI sea consistente con el
// selector de Tipo de reparación.

const HALLAZGOS_SPINDLE: HallazgoItem[] = [
  { key: "sp_picaduras_rod", texto: "Presenta picaduras en asiento de rodamiento" },
  { key: "sp_rayaduras_rod", texto: "Presenta rayaduras en asiento de rodamiento" },
  { key: "sp_dano_aloj_rosc", texto: "Daños en alojamientos roscados" },
  { key: "sp_dano_conico", texto: "Presenta daños en alojamiento cónico" },
  { key: "sp_corr_conico", texto: "Presenta corrosión en alojamiento cónico" },
  { key: "sp_picaduras_conico", texto: "Presenta picaduras en alojamiento cónico" },
  { key: "sp_aloj_pernos_bastidor", texto: "Alojamientos roscados de pernos de sujeción de bastidor" },
];

const HALLAZGOS_HUB: HallazgoItem[] = [
  { key: "hub_desgaste_pistas", texto: "Alojamientos de pistas de rodamientos cónicos presentan desgaste" },
  { key: "hub_rayaduras_pistas", texto: "Alojamientos de pistas de rodamientos cónicos presentan rayaduras" },
  { key: "hub_desgaste_pistas2", texto: "Pistas de rodamientos cónicos presentan desgaste" },
  { key: "hub_rayaduras_pistas2", texto: "Pistas de rodamientos cónicos presentan rayaduras" },
  { key: "hub_pernos_desgaste", texto: "Pernos de sujeción de rueda presentan desgaste" },
  { key: "hub_pernos_fatiga", texto: "Pernos de sujeción de rueda presentan fatiga" },
  { key: "hub_pernos_hilos", texto: "Pernos de sujeción de rueda presentan hilos dañados" },
  { key: "hub_pernos_fractura", texto: "Pernos de sujeción de rueda presentan fractura" },
  { key: "hub_corr_portasellos", texto: "Presenta corrosión en portasellos" },
  { key: "hub_duo_cone", texto: "Sello Duo Cone presenta desgaste" },
  { key: "hub_eng_sensor_corr", texto: "Engranaje de sensor presenta corrosión" },
  { key: "hub_lainas_dano", texto: "Lainas de separación llegaron dañadas" },
  { key: "hub_rev_eng_int", texto: "Revisión de engranaje interior" },
  { key: "hub_rev_pernos_eng_int", texto: "Revisión de pernos de sujeción de engranaje interior (32 unidades)" },
];

const HALLAZGOS_CONJUNTO_FRENO: HallazgoItem[] = [
  { key: "cf_piston_rayaduras", texto: "Pistón de freno presenta rayaduras en alojamientos" },
  { key: "cf_resortes_desgaste", texto: "Presenta desgaste en resortes de retracción" },
  { key: "cf_pernos_elongados", texto: "Pernos de sujeción llegaron elongados" },
  { key: "cf_sellos_desgaste", texto: "Sellos presentan desgaste" },
];

const HALLAZGOS_CAJA_FRENO: HallazgoItem[] = [
  { key: "cj_rayas_asientos", texto: "Presenta rayas en asientos de sellos" },
  { key: "cj_aloj_contam", texto: "Alojamientos roscados presentan contaminación" },
];

const HALLAZGOS_GENERAL_RUEDA: HallazgoItem[] = [
  { key: "gen_discos_desgaste", texto: "Discos de fricción presentan desgaste" },
  { key: "gen_discos_recalent", texto: "Discos de fricción presentan marcas de temperatura (recalentamiento)" },
  { key: "gen_placas_rayas", texto: "Placas separadoras presentan rayas circulares" },
  { key: "gen_placas_desgaste", texto: "Placas separadoras presentan desgaste" },
  { key: "gen_placas_sobrecal", texto: "Placas separadoras presentan manchas de sobrecalentamiento" },
  { key: "gen_dumpers_dano", texto: "Dumpers presentan desgaste y daños por temperatura (trabajo)" },
];

// ─── RECOMENDACIONES - RUEDA DELANTERA ─────────────────────────────────────

const RECOM_SPINDLE_ESTANDAR: RecomendacionItem[] = [
  { key: "pulido_asientos_rod", texto: "Pulido de asientos de rodamientos" },
  { key: "metalizado_asientos_rod", texto: "Metalizado de asientos de rodamientos" },
  { key: "cambio_rodamientos", texto: "Cambio de rodamientos" },
  { key: "rectif_aloj_rosc", texto: "Rectificado de alojamientos roscados" },
  { key: "realizar_ndt", texto: "Realizar NDT" },
  { key: "pulido_aloj_conico", texto: "Pulido de alojamiento cónico" },
  { key: "rectif_aloj_rosc_bastidor", texto: "Rectificado de alojamientos roscados de sujeción de bastidor" },
  { key: "ndt_brazo_direccion", texto: "Realizar NDT en brazo de dirección" },
];

const RECOM_HUB_ESTANDAR: RecomendacionItem[] = [
  { key: "cambio_pistas", texto: "Cambio de pistas cónicas de rodamientos" },
  { key: "pulido_aloj_pistas", texto: "Realizar pulido de alojamientos de pistas" },
  { key: "metalizado_aloj_pistas", texto: "Realizar metalizado de alojamientos de pistas" },
  { key: "cambio_stud", texto: "Realizar cambio de Stud" },
  { key: "repasar_rosc_stud", texto: "Repasar superficie roscada de Stud" },
  { key: "cambio_lainas_sensor", texto: "Cambio de lainas de engranaje de sensor" },
  { key: "cambio_sello_duo_cone", texto: "Cambio de sello Duo Cone" },
  { key: "pulido_portasello", texto: "Realizar pulido de portasello" },
  { key: "pulido_eng_sensor", texto: "Realizar pulido de engranaje sensor" },
  { key: "pulido_corona_int", texto: "Realizar pulido de corona interior" },
  { key: "limpieza_pernos_eng", texto: "Realizar limpieza de pernos de sujeción de engranaje interior" },
  { key: "cambio_pernos_eng_int", texto: "Realizar cambio de pernos de sujeción de engranaje interior" },
  { key: "repasar_aloj_pernos_eng", texto: "Repasar alojamientos roscados de pernos de sujeción de engranaje" },
  { key: "cambio_engranaje", texto: "Realizar cambio de engranaje" },
];

const RECOM_CONJUNTO_FRENO_ESTANDAR: RecomendacionItem[] = [
  { key: "pulido_aloj_sellos", texto: "Realizar pulido de alojamientos de sellos" },
  { key: "cambio_sellos", texto: "Realizar cambio de sellos" },
  { key: "cambio_resortes", texto: "Realizar cambio de resortes" },
  { key: "cambio_pernos", texto: "Realizar cambio de pernos" },
  { key: "metalizado_piston", texto: "Realizar metalizado de pistón" },
];

const RECOM_CAJA_FRENO_ESTANDAR: RecomendacionItem[] = [
  { key: "pulido_asientos_sellos", texto: "Realizar pulido de asientos de sellos" },
  { key: "repasar_aloj_rosc", texto: "Repasar alojamientos roscados" },
  { key: "metalizado_asientos_sellos", texto: "Realizar metalizado de asientos de sellos" },
];

const RECOM_GENERAL_RUEDA_ESTANDAR: RecomendacionItem[] = [
  { key: "cambio_discos_friccion", texto: "Realizar cambio de discos de fricción (10) según NP Komatsu", cantidad: true },
  { key: "cambio_placas_separadoras", texto: "Realizar cambio de placas separadoras (9) según NP Komatsu", cantidad: true },
  { key: "cambio_dumpers", texto: "Realizar cambio de dumpers (2) según NP Komatsu", cantidad: true },
  { key: "cambio_lainas", texto: "Realizar cambio de lainas según NP Komatsu" },
];

// ─── HALLAZGOS - FRENO DE SERVICIO & PARQUEO ───────────────────────────────
// Estructura provista por el usuario (check-list del Excel/PNG): cada sub-
// componente (Sprocket, Housing, Spindle, Pistón Freno Servicio, Pistón Freno
// Parqueo) tiene su propio set de hallazgos y recomendaciones.

const HALLAZGOS_FRENO_SPROCKET: HallazgoItem[] = [
  {
    key: "sproc_estado",
    texto: "Sprocket se encuentra en ____ estado",
    severidades: ["Buen", "Mal"],
  },
  { key: "sproc_desmontaje", texto: "Se realiza el desmontaje de damper, discos de fricción" },
  {
    key: "sproc_discos_presentan",
    texto: "Discos presentan ____",
    opcionesMultiples: ["Desgaste", "Rayaduras"],
  },
];

const HALLAZGOS_FRENO_HOUSING: HallazgoItem[] = [
  {
    key: "hou_desgaste_pista_sellos",
    texto: "Presenta desgaste ____ en pista de alojamiento de sellos",
    severidades: ["Leve", "Excesivo"],
  },
];

const HALLAZGOS_FRENO_SPINDLE: HallazgoItem[] = [
  { key: "sp_rayas_pistas", texto: "Presenta rayas en pistas de alojamiento de rodamientos" },
  { key: "sp_rodamiento_desgaste", texto: "Rodamiento llegó con desgaste" },
  { key: "sp_esparragos_danados", texto: "Espárragos llegaron dañados" },
  { key: "sp_dentada_corr", texto: "Superficie dentada presenta corrosión" },
  { key: "sp_espaciadores_desg", texto: "Espaciadores presentan desgaste" },
  {
    key: "sp_rueda_matriz",
    texto: "Rueda matriz con ____ desgaste",
    severidades: ["Leve", "Excesivo"],
  },
];

const HALLAZGOS_FRENO_PISTON_SERVICIO: HallazgoItem[] = [
  { key: "pfs_desgaste", texto: "Presenta desgaste" },
  {
    key: "pfs_estado_general",
    texto: "Presenta ____ estado en general",
    severidades: ["Buen", "Mal"],
  },
];

const HALLAZGOS_FRENO_PISTON_PARQUEO: HallazgoItem[] = [
  { key: "pfp_desgaste", texto: "Presenta desgaste" },
  {
    key: "pfp_estado_general",
    texto: "Presenta ____ estado en general",
    severidades: ["Buen", "Mal"],
  },
];

const RECOM_FRENO_SPROCKET: RecomendacionItem[] = [
  { key: "pulido_sproc", texto: "Realizar pulido de sprocket" },
  { key: "cambio_sproc", texto: "Realizar cambio de sprocket" },
  { key: "cambio_discos_friccion", texto: "Realizar cambio de discos de fricción" },
  { key: "cambio_damper", texto: "Realizar cambio de damper" },
];

const RECOM_FRENO_HOUSING: RecomendacionItem[] = [
  { key: "metalizado_pista_sellos", texto: "Recuperar con metalizado superficie de pista de alojamiento de sellos" },
  { key: "pulido_general", texto: "Realizar pulido en general" },
  { key: "cambio_housing", texto: "Realizar cambio de housing" },
];

const RECOM_FRENO_SPINDLE: RecomendacionItem[] = [
  { key: "metalizado_pista_rod", texto: "Recuperar con metalizado pista de alojamiento de rodamiento" },
  { key: "cambio_rodamiento", texto: "Realizar cambio de rodamiento" },
  { key: "pulido_dentada", texto: "Realizar pulido de superficie dentada" },
  { key: "cambio_espaciadores", texto: "Realizar cambio de espaciadores" },
  { key: "pulido_matriz", texto: "Realizar pulido de matriz" },
];

const RECOM_FRENO_PISTON_SERVICIO: RecomendacionItem[] = [
  { key: "pulido", texto: "Realizar pulido" },
  { key: "cambio", texto: "Realizar cambio" },
];

const RECOM_FRENO_PISTON_PARQUEO: RecomendacionItem[] = [
  { key: "pulido", texto: "Realizar pulido" },
  { key: "cambio", texto: "Realizar cambio" },
];

// ─── CATÁLOGOS POR TIPO ────────────────────────────────────────────────────

export const CATALOGOS_EVALUACION: Record<string, CatalogoEvaluacion> = {
  cil_vastago_simple: {
    hallazgos: {
      cil_interior: { nombre: "Cilindro - Interior", items: HALLAZGOS_CIL_CHVS_INTERIOR },
      cil_exterior: { nombre: "Cilindro - Exterior", items: HALLAZGOS_CIL_CHVS_EXTERIOR },
      cil_cojinete: { nombre: "Cojinete (cilindro)", items: HALLAZGOS_COJINETE },
      cil_rotula: { nombre: "Rótula (cilindro)", items: HALLAZGOS_ROTULA },
      cil_pin: { nombre: "Pin directo (cilindro)", items: HALLAZGOS_PIN },
      cil_cancamo: { nombre: "Cáncamo (cilindro)", items: HALLAZGOS_CANCAMO },
      vas_barra: { nombre: "Vástago - Barra", items: HALLAZGOS_VASTAGO_BARRA },
      vas_cojinete: { nombre: "Cojinete (vástago)", items: HALLAZGOS_COJINETE },
      vas_rotula: { nombre: "Rótula (vástago)", items: HALLAZGOS_ROTULA },
      vas_pin: { nombre: "Pin directo (vástago)", items: HALLAZGOS_PIN },
      vas_cancamo: { nombre: "Cáncamo (vástago)", items: HALLAZGOS_CANCAMO },
      tapa: { nombre: "Tapa", items: HALLAZGOS_TAPA },
      embolo: { nombre: "Émbolo", items: HALLAZGOS_EMBOLO },
    },
    recomendaciones: {
      cilindro: { nombre: "Cilindro", estandar: RECOM_CIL_CHVS_ESTANDAR, noEstandar: RECOM_CIL_CHVS_NO_ESTANDAR },
      vastago: { nombre: "Vástago", estandar: RECOM_VAS_CHVS_ESTANDAR, noEstandar: RECOM_VAS_CHVS_NO_ESTANDAR },
      tapa: { nombre: "Tapa", estandar: RECOM_TAPA_ESTANDAR, noEstandar: RECOM_TAPA_NO_ESTANDAR },
      embolo: { nombre: "Émbolo", estandar: RECOM_EMBOLO_ESTANDAR, noEstandar: RECOM_EMBOLO_NO_ESTANDAR },
    },
  },
  cil_pivotado: {
    hallazgos: {
      cil_interior: { nombre: "Cilindro - Interior", items: HALLAZGOS_CIL_CHVS_INTERIOR },
      cil_exterior: { nombre: "Cilindro - Exterior", items: HALLAZGOS_CIL_CHVS_EXTERIOR },
      cil_cojinete: { nombre: "Cojinete (cilindro)", items: HALLAZGOS_COJINETE_CHP },
      cil_trunnion: { nombre: "Trunnion", items: HALLAZGOS_TRUNNION_CHP },
      vas_barra: { nombre: "Vástago - Barra", items: HALLAZGOS_VASTAGO_BARRA },
      vas_cojinete: { nombre: "Cojinete (vástago)", items: HALLAZGOS_COJINETE },
      vas_rotula: { nombre: "Rótula (vástago)", items: HALLAZGOS_ROTULA },
      vas_pin: { nombre: "Pin directo (vástago)", items: HALLAZGOS_PIN },
      vas_cancamo: { nombre: "Cáncamo (vástago)", items: HALLAZGOS_CANCAMO },
      tapa: { nombre: "Tapa", items: HALLAZGOS_TAPA },
      embolo: { nombre: "Émbolo", items: HALLAZGOS_EMBOLO },
    },
    recomendaciones: {
      cilindro: { nombre: "Cilindro", estandar: RECOM_CIL_CHP_ESTANDAR, noEstandar: RECOM_CIL_CHP_NO_ESTANDAR },
      vastago: { nombre: "Vástago", estandar: RECOM_VAS_CHVS_ESTANDAR, noEstandar: RECOM_VAS_CHVS_NO_ESTANDAR },
      tapa: { nombre: "Tapa", estandar: RECOM_TAPA_ESTANDAR, noEstandar: RECOM_TAPA_NO_ESTANDAR },
      embolo: { nombre: "Émbolo", estandar: RECOM_EMBOLO_ESTANDAR, noEstandar: RECOM_EMBOLO_NO_ESTANDAR },
    },
  },
  acum_vejiga: {
    hallazgos: {
      acumulador: { nombre: "Acumulador con bladder", items: HALLAZGOS_ACUM_VEJIGA },
    },
    recomendaciones: {
      acumulador: { nombre: "Acumulador", estandar: RECOM_AV_ESTANDAR, noEstandar: RECOM_AV_NO_ESTANDAR },
    },
  },
  acum_embolo: {
    hallazgos: {
      cil_interior: { nombre: "Cilindro - Interior", items: HALLAZGOS_CIL_AE_INTERIOR },
      tapa: { nombre: "Tapa", items: HALLAZGOS_TAPA_AE },
      embolo: { nombre: "Émbolo", items: HALLAZGOS_EMBOLO_AE },
    },
    recomendaciones: {
      cilindro: { nombre: "Cilindro", estandar: RECOM_CIL_AE_ESTANDAR, noEstandar: RECOM_CIL_AE_NO_ESTANDAR },
      tapa: { nombre: "Tapa", estandar: RECOM_TAPA_AE_ESTANDAR, noEstandar: RECOM_TAPA_AE_NO_ESTANDAR },
      embolo: { nombre: "Émbolo", estandar: RECOM_EMBOLO_AE_ESTANDAR, noEstandar: RECOM_EMBOLO_AE_NO_ESTANDAR },
    },
  },
  // CHPDV (Doble Vástago) — el Excel 2 no tiene checklist específica para este
  // tipo. Reutilizamos los catálogos de CHVS porque comparten estructura
  // (cilindro + 2 vástagos + tapa + émbolo, sin trunnion).
  cil_doble_vastago: {
    hallazgos: {
      cil_interior: { nombre: "Cilindro - Interior", items: HALLAZGOS_CIL_CHVS_INTERIOR },
      cil_exterior: { nombre: "Cilindro - Exterior", items: HALLAZGOS_CIL_CHVS_EXTERIOR },
      cil_cojinete: { nombre: "Cojinete (cilindro)", items: HALLAZGOS_COJINETE },
      cil_cancamo: { nombre: "Cáncamo (cilindro)", items: HALLAZGOS_CANCAMO },
      vas_barra: { nombre: "Vástago - Barra", items: HALLAZGOS_VASTAGO_BARRA },
      vas_cojinete: { nombre: "Cojinete (vástago)", items: HALLAZGOS_COJINETE },
      vas_rotula: { nombre: "Rótula (vástago)", items: HALLAZGOS_ROTULA },
      vas_pin: { nombre: "Pin directo (vástago)", items: HALLAZGOS_PIN },
      vas_cancamo: { nombre: "Cáncamo (vástago)", items: HALLAZGOS_CANCAMO },
      tapa: { nombre: "Tapa", items: HALLAZGOS_TAPA },
      embolo: { nombre: "Émbolo", items: HALLAZGOS_EMBOLO },
    },
    recomendaciones: {
      cilindro: { nombre: "Cilindro", estandar: RECOM_CIL_CHVS_ESTANDAR, noEstandar: RECOM_CIL_CHVS_NO_ESTANDAR },
      vastago: { nombre: "Vástago", estandar: RECOM_VAS_CHVS_ESTANDAR, noEstandar: RECOM_VAS_CHVS_NO_ESTANDAR },
      tapa: { nombre: "Tapa", estandar: RECOM_TAPA_ESTANDAR, noEstandar: RECOM_TAPA_NO_ESTANDAR },
      embolo: { nombre: "Émbolo", estandar: RECOM_EMBOLO_ESTANDAR, noEstandar: RECOM_EMBOLO_NO_ESTANDAR },
    },
  },
  // Suspensión delantera — sin checklist en Excel 2. Estructura tipo cilindro
  // (camisa + vástago + tapa + émbolo) con extras de nitrógeno/aceite. Reutiliza
  // catálogos de CHVS para hallazgos comunes.
  suspension_delantera: {
    hallazgos: {
      cil_interior: { nombre: "Cilindro - Interior", items: HALLAZGOS_CIL_CHVS_INTERIOR },
      cil_exterior: { nombre: "Cilindro - Exterior", items: HALLAZGOS_CIL_CHVS_EXTERIOR },
      vas_barra: { nombre: "Vástago - Barra", items: HALLAZGOS_VASTAGO_BARRA },
      tapa: { nombre: "Tapa", items: HALLAZGOS_TAPA },
      embolo: { nombre: "Émbolo", items: HALLAZGOS_EMBOLO },
    },
    recomendaciones: {
      cilindro: { nombre: "Cilindro", estandar: RECOM_CIL_CHVS_ESTANDAR, noEstandar: RECOM_CIL_CHVS_NO_ESTANDAR },
      vastago: { nombre: "Vástago", estandar: RECOM_VAS_CHVS_ESTANDAR, noEstandar: RECOM_VAS_CHVS_NO_ESTANDAR },
      tapa: { nombre: "Tapa", estandar: RECOM_TAPA_ESTANDAR, noEstandar: RECOM_TAPA_NO_ESTANDAR },
      embolo: { nombre: "Émbolo", estandar: RECOM_EMBOLO_ESTANDAR, noEstandar: RECOM_EMBOLO_NO_ESTANDAR },
    },
  },
  // Freno de Servicio & Parqueo — check-list por sub-componente provisto por
  // el usuario (Sprocket, Housing, Spindle, Pistón Servicio, Pistón Parqueo).
  // Sin split estándar/no estándar — todas las recomendaciones van en `estandar`.
  freno_servicio_parqueo: {
    hallazgos: {
      sprocket: { nombre: "Sprocket", items: HALLAZGOS_FRENO_SPROCKET },
      housing: { nombre: "Housing", items: HALLAZGOS_FRENO_HOUSING },
      spindle: { nombre: "Spindle", items: HALLAZGOS_FRENO_SPINDLE },
      piston_servicio: { nombre: "Pistón Freno Servicio", items: HALLAZGOS_FRENO_PISTON_SERVICIO },
      piston_parqueo: { nombre: "Pistón Freno Parqueo", items: HALLAZGOS_FRENO_PISTON_PARQUEO },
    },
    recomendaciones: {
      sprocket: { nombre: "Sprocket", estandar: RECOM_FRENO_SPROCKET, noEstandar: [] },
      housing: { nombre: "Housing", estandar: RECOM_FRENO_HOUSING, noEstandar: [] },
      spindle: { nombre: "Spindle", estandar: RECOM_FRENO_SPINDLE, noEstandar: [] },
      piston_servicio: { nombre: "Pistón Freno Servicio", estandar: RECOM_FRENO_PISTON_SERVICIO, noEstandar: [] },
      piston_parqueo: { nombre: "Pistón Freno Parqueo", estandar: RECOM_FRENO_PISTON_PARQUEO, noEstandar: [] },
    },
  },
  // Rueda Delantera — único tipo con checklist propio en Excel 1 sheet 7. No
  // tiene split Estándar/No Estándar en el origen — todo va a `estandar`.
  rueda_delantera: {
    hallazgos: {
      spindle: { nombre: "Spindle", items: HALLAZGOS_SPINDLE },
      hub: { nombre: "Hub", items: HALLAZGOS_HUB },
      conjunto_freno: { nombre: "Conjunto de Freno", items: HALLAZGOS_CONJUNTO_FRENO },
      caja_freno: { nombre: "Caja de Freno", items: HALLAZGOS_CAJA_FRENO },
      general: { nombre: "General", items: HALLAZGOS_GENERAL_RUEDA },
    },
    recomendaciones: {
      spindle: { nombre: "Spindle", estandar: RECOM_SPINDLE_ESTANDAR, noEstandar: [] },
      hub: { nombre: "Hub", estandar: RECOM_HUB_ESTANDAR, noEstandar: [] },
      conjunto_freno: { nombre: "Conjunto de Freno", estandar: RECOM_CONJUNTO_FRENO_ESTANDAR, noEstandar: [] },
      caja_freno: { nombre: "Caja de Freno", estandar: RECOM_CAJA_FRENO_ESTANDAR, noEstandar: [] },
      general: { nombre: "General", estandar: RECOM_GENERAL_RUEDA_ESTANDAR, noEstandar: [] },
    },
  },
  cil_telescopico: {
    hallazgos: {
      cil_interior: { nombre: "Cilindro - Interior", items: HALLAZGOS_CIL_CHVS_INTERIOR },
      cil_exterior: { nombre: "Cilindro - Exterior", items: HALLAZGOS_CIL_CHVS_EXTERIOR },
      cil_rotula: { nombre: "Rótula (cilindro)", items: HALLAZGOS_ROTULA_CHT },
      cil_cancamo: { nombre: "Cáncamo (cilindro)", items: HALLAZGOS_CANCAMO_CHT },
      vas_barra: { nombre: "Vástago - Barra", items: HALLAZGOS_VASTAGO_BARRA },
      vas_cancamo: { nombre: "Cáncamo (vástago)", items: HALLAZGOS_CANCAMO_CHT },
      cuerpo_intermedio: { nombre: "Cuerpo Intermedio", items: HALLAZGOS_CUERPO_INTERMEDIO_CHT },
      tapa: { nombre: "Tapa principal", items: HALLAZGOS_TAPA },
      tapa_posterior: { nombre: "Tapa Posterior", items: HALLAZGOS_TAPA_POSTERIOR_CHT },
      tapa_roscada: { nombre: "Tapa Roscada", items: HALLAZGOS_TAPA_ROSCADA_CHT },
      embolo: { nombre: "Émbolo", items: HALLAZGOS_EMBOLO },
    },
    recomendaciones: {
      cilindro: { nombre: "Cilindro", estandar: RECOM_CIL_CHT_ESTANDAR, noEstandar: RECOM_CIL_CHT_NO_ESTANDAR },
      vastago: { nombre: "Vástago", estandar: RECOM_VAS_CHT_ESTANDAR, noEstandar: RECOM_VAS_CHT_NO_ESTANDAR },
      cuerpo_intermedio: { nombre: "Cuerpo Intermedio", estandar: RECOM_CUERPO_INTERM_ESTANDAR, noEstandar: RECOM_CUERPO_INTERM_NO_ESTANDAR },
      tapa_posterior: { nombre: "Tapa Posterior", estandar: RECOM_TAPA_POSTERIOR_ESTANDAR, noEstandar: RECOM_TAPA_POSTERIOR_NO_ESTANDAR },
      tapa_roscada: { nombre: "Tapa Roscada", estandar: RECOM_TAPA_ROSCADA_ESTANDAR, noEstandar: RECOM_TAPA_ROSCADA_NO_ESTANDAR },
      embolo: { nombre: "Émbolo", estandar: RECOM_EMBOLO_ESTANDAR, noEstandar: RECOM_EMBOLO_NO_ESTANDAR },
    },
  },
};

// ─── SERIALIZADORES (para informes Word) ───────────────────────────────────

// Devuelve las recomendaciones marcadas (estándar + no estándar) como un array
// de strings ya formateadas, listas para imprimir en un informe.
// - Cuando el item tiene subOpciones y NO está `omitirSubOpEnInforme`, anexa
//   " - <subOpcion>" si el técnico eligió una.
// - Cuando el item tiene cantidad, anexa " (N: <cantidad>)".
// - Cuando `omitirSubOpEnInforme` es true, solo emite el texto base (ej. bruñido).
export function serializarRecomendaciones(
  modelo: string,
  componente: string,
  prefix: string,
  datos: Record<string, unknown>,
): string[] {
  const cat = CATALOGOS_EVALUACION[modelo];
  if (!cat) return [];
  const grupo = cat.recomendaciones[componente];
  if (!grupo) return [];

  const out: string[] = [];
  for (const [bucket, items] of [["est", grupo.estandar] as const, ["no", grupo.noEstandar] as const]) {
    for (const it of items) {
      const baseKey = `${prefix}_recom_${componente}_${bucket}_${it.key}`;
      if (!datos[baseKey]) continue;
      let texto = it.texto;
      if (it.subOpciones && !it.omitirSubOpEnInforme) {
        const sub = datos[`${baseKey}_sub`];
        if (sub) texto += ` - ${String(sub)}`;
      }
      if (it.cantidad) {
        const cant = datos[`${baseKey}_cant`];
        if (cant != null && cant !== "") texto += ` (N: ${String(cant)})`;
      }
      out.push(texto);
    }
  }
  return out;
}

// Devuelve los hallazgos marcados para un componente como array de strings ya
// formateadas. Incluye severidad / opciones múltiples / campo libre como sufijo
// del texto base.
export function serializarHallazgos(
  modelo: string,
  componenteKey: string,
  prefix: string,
  datos: Record<string, unknown>,
): string[] {
  const cat = CATALOGOS_EVALUACION[modelo];
  if (!cat) return [];
  const grupo = cat.hallazgos[componenteKey];
  if (!grupo) return [];

  const out: string[] = [];
  for (const it of grupo.items) {
    const baseKey = `${prefix}_${componenteKey}_${it.key}`;
    if (!datos[baseKey]) continue;
    let texto = it.texto;
    const partes: string[] = [];
    if (it.severidades) {
      const sev = datos[`${baseKey}_sev`];
      if (sev) partes.push(String(sev));
    }
    if (it.opcionesMultiples) {
      const ops = it.opcionesMultiples
        .filter((op) => datos[`${baseKey}_op_${op.replace(/\s+/g, "_").toLowerCase()}`])
        .join(", ");
      if (ops) partes.push(ops);
    }
    if (it.campoLibre) {
      const libre = datos[`${baseKey}_libre`];
      if (libre) partes.push(String(libre));
    }
    if (partes.length > 0) texto += ` (${partes.join(" — ")})`;
    out.push(texto);
  }
  return out;
}
