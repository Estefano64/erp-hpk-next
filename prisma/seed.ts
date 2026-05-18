import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // ── Usuario admin ───────────────────────────────────
  const hash = await bcrypt.hash("admin123", 10);
  await prisma.usuario.upsert({
    where: { codigoEmpleado: "ADM-001" },
    update: {},
    create: {
      codigoEmpleado: "ADM-001",
      email: "admin@empresa.com",
      nombre: "Administrador",
      password: hash,
      rol: "admin",
    },
  });
  console.log("✓ Usuario admin creado");

  // ── Moneda ──────────────────────────────────────────
  const monedas = [
    { codigo: "USD", nombre: "Dólar Americano", simbolo: "$" },
    { codigo: "SOL", nombre: "Sol Peruano", simbolo: "S/" },
  ];
  for (const m of monedas) {
    await prisma.moneda.upsert({
      where: { codigo: m.codigo },
      update: {},
      create: m,
    });
  }
  console.log("✓ Monedas creadas");

  // ── TipoCodRep (familias, 6 del Excel 5. Cod Rep) ──
  const tipos = [
    { codigo: "CIL", nombre: "Cilindro" },
    { codigo: "ACU", nombre: "Acumulador" },
    { codigo: "FRE", nombre: "Freno" },
    { codigo: "RUE", nombre: "Rueda" },
    { codigo: "ENR", nombre: "Enrollador" },
    { codigo: "LIN", nombre: "Links" },
  ];
  for (const t of tipos) {
    await prisma.tipoCodRep.upsert({
      where: { codigo: t.codigo },
      update: { nombre: t.nombre },
      create: t,
    });
  }
  console.log(`✓ ${tipos.length} TipoCodRep creados`);

  // ── CategoriaCodRep (tipos de maquinaria, 6 del Excel) ──
  const categoriasCodRep = [
    { codigo: "CAM", nombre: "Camión" },
    { codigo: "MOT", nombre: "Motoniveladora" },
    { codigo: "TRU", nombre: "Tractor de Ruedas" },
    { codigo: "TOR", nombre: "Tractor de Orugas" },
    { codigo: "EXC", nombre: "Excavadora" },
    { codigo: "PER", nombre: "Perforadora" },
  ];
  for (const c of categoriasCodRep) {
    await prisma.categoriaCodRep.upsert({
      where: { codigo: c.codigo },
      update: { nombre: c.nombre },
      create: c,
    });
  }
  console.log(`✓ ${categoriasCodRep.length} CategoriaCodRep creadas`);

  // ── ModeloEvaluacion (9 subtipos, hoja Descripcion tipo del Excel) ──
  // También usados como modelo de la hoja de evaluación digital (HTML).
  const modelosEvaluacion = [
    { codigo: "CHVS", nombre: "Cilindro hidráulico vástago simple" },
    { codigo: "CHP", nombre: "Cilindro hidráulico pivotado" },
    { codigo: "CHPDV", nombre: "Cilindro hidráulico de pistón de doble vástago" },
    { codigo: "CHT", nombre: "Cilindro hidráulico telescópico" },
    { codigo: "AE", nombre: "Acumulador de émbolo" },
    { codigo: "AV", nombre: "Acumulador de vejiga" },
    { codigo: "RD", nombre: "Rueda delantera" },
    { codigo: "FS", nombre: "Freno de servicio" },
    { codigo: "SD", nombre: "Suspensión delantera" },
  ];
  for (const m of modelosEvaluacion) {
    await prisma.modeloEvaluacion.upsert({
      where: { codigo: m.codigo },
      update: { nombre: m.nombre },
      create: m,
    });
  }
  console.log(`✓ ${modelosEvaluacion.length} ModeloEvaluacion creados`);

  // ── FlotaEquipo (42 modelos reales, del Excel Cod Rep col Flota) ──
  const flotasEquipo = [
    "16M", "24", "24M", "336DL", "349", "374DL", "374FL", "390DL", "390FL", "6060FS",
    "793D", "797F", "830AC", "830DC", "830E", "834H", "834K", "844H", "844K", "930E-4SE",
    "950H", "966H", "966M", "980E", "980E-4SE", "980G", "980H", "988H", "988K", "992K",
    "994F", "994K", "D11", "D11T", "D475", "D475A", "D8T", "FMA", "HD1500", "MD6640",
    "PC1250", "PC2000", "PITVIPER 351", "WA900",
  ];
  for (const codigo of flotasEquipo) {
    await prisma.flotaEquipo.upsert({
      where: { codigo },
      update: { nombre: codigo },
      create: { codigo, nombre: codigo },
    });
  }
  console.log(`✓ ${flotasEquipo.length} FlotaEquipo creadas`);

  // ── Fabricante ──────────────────────────────────────
  const fabricantes = [
    { codigo: "CAT", nombre: "Caterpillar" },
    { codigo: "KOM", nombre: "Komatsu" },
    { codigo: "EPI", nombre: "Epiroc" },
    { codigo: "WBM", nombre: "WBM" },
    { codigo: "ALT", nombre: "Alternativo" },
    { codigo: "MAC", nombre: "Machen" },
    { codigo: "BOH", nombre: "Bohler" },
    { codigo: "VIS", nombre: "Vistony" },
    { codigo: "CAN", nombre: "Cantesco" },
    { codigo: "TEK", nombre: "Tekbond" },
    { codigo: "SOL", nombre: "Solpack" },
    { codigo: "TRU", nombre: "Truper" },
    { codigo: "SHU", nombre: "Shurtape" },
    { codigo: "C&A", nombre: "C&A" },
    { codigo: "NOR", nombre: "Norton" },
    { codigo: "UYU", nombre: "Uyustools" },
    { codigo: "SIL", nombre: "Siliconi" },
    { codigo: "ANY", nombre: "Anypsa" },
    { codigo: "CLU", nombre: "Clute" },
    { codigo: "FER", nombre: "Ferrawyy" },
    { codigo: "PRO", nombre: "Protec" },
    { codigo: "BAH", nombre: "Bahco" },
    { codigo: "ABR", nombre: "Abralit" },
    { codigo: "SEG", nombre: "Segpro" },
    { codigo: "HEN", nombre: "Henkel" },
    { codigo: "KLI", nombre: "Klingspor" },
    { codigo: "STE", nombre: "Steelpro" },
    { codigo: "ELI", nombre: "Elite" },
    { codigo: "SDM", nombre: "Soldimix" },
    { codigo: "ESA", nombre: "ESAB" },
    { codigo: "OER", nombre: "Oerlikon" },
    { codigo: "NAC", nombre: "Nacho" },
    { codigo: "TRA", nombre: "Trapex" },
    { codigo: "ALI", nombre: "Alicorp" },
    { codigo: "3M", nombre: "3M" },
    { codigo: "ANS", nombre: "Ansell" },
    { codigo: "XIA", nombre: "Xiadal" },
    { codigo: "ARA", nombre: "Aragcu" },
    { codigo: "LIN", nombre: "LINDE" },
    { codigo: "ALD", nombre: "ALDISE" },
    { codigo: "SUN", nombre: "Sunnen" },
    { codigo: "ZCC", nombre: "ZCC-CT" },
    { codigo: "GEN", nombre: "Genérico" },
    { codigo: "TAE", nombre: "TAE" },
    { codigo: "EPS", nombre: "EPS" },
    { codigo: "CHMT", nombre: "Chem Tools" },
  ];
  for (const f of fabricantes) {
    await prisma.fabricante.upsert({
      where: { codigo: f.codigo },
      update: {},
      create: f,
    });
  }
  console.log("✓ Fabricantes creados");

  // ── Planta (del Excel) ────────────────────────────────
  const plantasData = [
    { codigo: "AQPTA01", nombre: "Taller 1 de reparación Arequipa" },
    { codigo: "AQPTA02", nombre: "Taller 2 de reparación Arequipa" },
  ];
  for (const p of plantasData) {
    await prisma.planta.upsert({
      where: { codigo: p.codigo },
      update: {},
      create: p,
    });
  }
  console.log("✓ Plantas creadas");

  // ── Area (del Excel) ────────────────────────────────
  const areasData = [
    { codigo: "PR", nombre: "Producción" },
    { codigo: "SG", nombre: "Seguridad" },
    { codigo: "LG", nombre: "Logística" },
    { codigo: "MT", nombre: "Mantenimiento" },
    { codigo: "AD", nombre: "Administración" },
  ];
  for (const a of areasData) {
    await prisma.area.upsert({
      where: { codigo: a.codigo },
      update: {},
      create: a,
    });
  }
  console.log("✓ Áreas creadas");

  // ── Categoria Material (del Excel) ──────────────────
  const categoriasMatData = [
    { codigo: "CON", nombre: "Consumible" },
    { codigo: "CRI", nombre: "Crítico" },
    { codigo: "REP", nombre: "Repuesto" },
    { codigo: "CAP", nombre: "Capital" },
    { codigo: "OBS", nombre: "Obsoleto" },
    { codigo: "FAB", nombre: "Fabricado" },
  ];
  for (const c of categoriasMatData) {
    await prisma.categoria.upsert({
      where: { codigo: c.codigo },
      update: {},
      create: c,
    });
  }
  console.log("✓ Categorías (Material) creadas");

  // ── Clasificacion (del Excel) ───────────────────────
  const clasificaciones = [
    { codigo: "ACEI", nombre: "Aceite" },
    { codigo: "ACER", nombre: "Acero" },
    { codigo: "ADAP", nombre: "Adaptador" },
    { codigo: "ANIL", nombre: "Anillo" },
    { codigo: "ADES", nombre: "Anillo de desgaste" },
    { codigo: "AMET", nombre: "Anillo metálico" },
    { codigo: "ARES", nombre: "Anillo de respaldo" },
    { codigo: "ARET", nombre: "Anillo de retención" },
    { codigo: "ARAN", nombre: "Arandela" },
    { codigo: "AGOM", nombre: "Arandela de goma" },
    { codigo: "BACK", nombre: "Back Up" },
    { codigo: "BARR", nombre: "Barras" },
    { codigo: "BILL", nombre: "Billa" },
    { codigo: "BUFF", nombre: "Buffer" },
    { codigo: "CALC", nombre: "Calce" },
    { codigo: "CASE", nombre: "Carrier Seal" },
    { codigo: "CASQ", nombre: "Casquillo" },
    { codigo: "COJI", nombre: "Cojinete" },
    { codigo: "CAMO", nombre: "Conjunto amortiguador" },
    { codigo: "CENC", nombre: "Conjunto de enchufe" },
    { codigo: "CIMA", nombre: "Conjunto de imán" },
    { codigo: "CRES", nombre: "Conjunto de resorte" },
    { codigo: "CSEL", nombre: "Conjunto de sello" },
    { codigo: "CTAP", nombre: "Conjunto de tapón" },
    { codigo: "CVAL", nombre: "Conjunto de válvula" },
    { codigo: "CONR", nombre: "Cone Roller" },
    { codigo: "CONT", nombre: "Contratuerca" },
    { codigo: "CUPR", nombre: "Cup Roller." },
    { codigo: "DAMP", nombre: "Damper" },
    { codigo: "DISC", nombre: "Discos" },
    { codigo: "DFRI", nombre: "Disco de fricción" },
    { codigo: "DOWS", nombre: "Dowel Spring" },
    { codigo: "DUOC", nombre: "Duo cone" },
    { codigo: "EMB", nombre: "Embolo" },
    { codigo: "EPPS", nombre: "Equipo de seguridad" },
    { codigo: "ESPA", nombre: "Espaciador" },
    { codigo: "ESPI", nombre: "Espiga" },
    { codigo: "GUIA", nombre: "Guia" },
    { codigo: "GSEN", nombre: "Grupo de sensor" },
    { codigo: "IMAN", nombre: "Iman" },
    { codigo: "INSE", nombre: "Insert" },
    { codigo: "IRONC", nombre: "Iron Cast" },
    { codigo: "JUREC", nombre: "Juego de recptáculo" },
    { codigo: "KITB", nombre: "Kit de bladder" },
    { codigo: "KITS", nombre: "Kit de sellos" },
    { codigo: "LIMP", nombre: "Limpiadores" },
    { codigo: "MANG", nombre: "Manguito" },
    { codigo: "ORIN", nombre: "Sello anular" },
    { codigo: "PASA", nombre: "Pasador" },
    { codigo: "PERN", nombre: "Perno" },
    { codigo: "PISTA", nombre: "Pista" },
    { codigo: "PLCA", nombre: "Placa" },
    { codigo: "PLTE", nombre: "Plate" },
    { codigo: "PLUG", nombre: "Plug" },
    { codigo: "PRIB", nombre: "Prisionero de bola" },
    { codigo: "PRIS", nombre: "Prisionero" },
    { codigo: "PROT", nombre: "Protector" },
    { codigo: "PROV", nombre: "Protector de válvula" },
    { codigo: "RESO", nombre: "Resorte" },
    { codigo: "RETD", nombre: "Retenedor" },
    { codigo: "RETE", nombre: "Reten" },
    { codigo: "RINC", nombre: "Ring Cushion" },
    { codigo: "RODA", nombre: "Rodamiento" },
    { codigo: "RODB", nombre: "Rod Bushing" },
    { codigo: "ROTU", nombre: "Rótulas" },
    { codigo: "SEGS", nombre: "Seguro seager" },
    { codigo: "SEGU", nombre: "Seguros" },
    { codigo: "SELA", nombre: "Sello anillo" },
    { codigo: "SELC", nombre: "Sello de culata" },
    { codigo: "SELF", nombre: "Sello de funda" },
    { codigo: "SELL", nombre: "Sellos" },
    { codigo: "SELP", nombre: "Sello principal" },
    { codigo: "SENS", nombre: "Sensores" },
    { codigo: "SENV", nombre: "Sensor de velocidad" },
    { codigo: "SHIM", nombre: "Shim" },
    { codigo: "SUMI", nombre: "Suministros" },
    { codigo: "TAPA", nombre: "Tapa" },
    { codigo: "TAPO", nombre: "Tapon" },
    { codigo: "TORN", nombre: "Tornillo" },
    { codigo: "TRAB", nombre: "Trabador" },
    { codigo: "TUBO", nombre: "Tubos" },
    { codigo: "TUER", nombre: "Tuerca" },
    { codigo: "UNIF", nombre: "Uniformes" },
    { codigo: "VALV", nombre: "Válvula" },
  ];
  for (const c of clasificaciones) {
    await prisma.clasificacion.upsert({
      where: { codigo: c.codigo },
      update: {},
      create: c,
    });
  }
  console.log("✓ Clasificaciones creadas");

  // ── UnidadMedida (del Excel) ────────────────────────
  const unidadesData = [
    { codigo: "mm", nombre: "Milímetro", abreviatura: "mm" },
    { codigo: "cm", nombre: "Centímetro", abreviatura: "cm" },
    { codigo: "m", nombre: "Metro", abreviatura: "m" },
    { codigo: "in", nombre: "Pulgada", abreviatura: "in" },
    { codigo: "kg", nombre: "Kilogramo", abreviatura: "kg" },
    { codigo: "t", nombre: "Tonelada", abreviatura: "t" },
    { codigo: "h", nombre: "Hora", abreviatura: "h" },
    { codigo: "m2", nombre: "Metro cuadrado", abreviatura: "m²" },
    { codigo: "m3", nombre: "Metro cúbico", abreviatura: "m³" },
    { codigo: "lt", nombre: "Litro", abreviatura: "lt" },
    { codigo: "bal", nombre: "Balde", abreviatura: "bal" },
    { codigo: "gl", nombre: "Galones", abreviatura: "gl" },
    { codigo: "und", nombre: "Unidad", abreviatura: "und" },
    { codigo: "cil", nombre: "Cilindro", abreviatura: "cil" },
    { codigo: "año", nombre: "Año", abreviatura: "año" },
    { codigo: "mes", nombre: "Mes", abreviatura: "mes" },
    { codigo: "dia", nombre: "Día", abreviatura: "día" },
    { codigo: "km", nombre: "Kilómetros", abreviatura: "km" },
    { codigo: "sm", nombre: "Semana", abreviatura: "sem" },
    { codigo: "amp", nombre: "Amperaje", abreviatura: "amp" },
    { codigo: "lbf", nombre: "Libras Fuerza", abreviatura: "lbf" },
  ];
  for (const u of unidadesData) {
    await prisma.unidadMedida.upsert({
      where: { codigo: u.codigo },
      update: {},
      create: u,
    });
  }
  console.log("✓ Unidades de Medida creadas");

  // ── Posicion ────────────────────────────────────────
  const posiciones = [
    { codigo: "NA", nombre: "No Aplica" },
    { codigo: "RH", nombre: "Derecho (Right Hand)" },
    { codigo: "LH", nombre: "Izquierdo (Left Hand)" },
    { codigo: "DEL", nombre: "Delantero" },
    { codigo: "POS", nombre: "Posterior" },
  ];
  for (const p of posiciones) {
    await prisma.posicion.upsert({
      where: { codigo: p.codigo },
      update: {},
      create: p,
    });
  }
  console.log("✓ Posiciones creadas");

  // ── Componente ──────────────────────────────────────
  const componentes = [
    { codigo: "CILINDRO", nombre: "Cilindro" },
    { codigo: "VASTAGO", nombre: "Vástago" },
    { codigo: "TAPA", nombre: "Tapa" },
    { codigo: "EMBOLO", nombre: "Émbolo" },
    { codigo: "CUERPO INTERMEDIO", nombre: "Cuerpo intermedio" },
    { codigo: "TAPA POSTERIOR", nombre: "Tapa posterior" },
    { codigo: "TAPA ROSCADA", nombre: "Tapa roscada" },
    { codigo: "FRENO", nombre: "Freno" },
    { codigo: "RUEDA", nombre: "Rueda" },
    { codigo: "SPINDLE", nombre: "Spindle" },
    { codigo: "HUB", nombre: "Hub" },
    { codigo: "CONJUNTO DE FRENO", nombre: "Conjunto de freno" },
    { codigo: "CAJA DE FRENO", nombre: "Caja de freno" },
    { codigo: "GENERAL", nombre: "General" },
  ];
  for (const c of componentes) {
    await prisma.componente.upsert({
      where: { codigo: c.codigo },
      update: {},
      create: c,
    });
  }
  console.log(`✓ ${componentes.length} Componentes creados`);

  // ── OperacionReparacion (desde Tablas de planificacion.xlsx) ──
  // 28 operaciones con clasificación STD (estándar) o NO_STD (no estándar).
  const operaciones = [
    // CILINDRO — STD
    { codigo: "RELC", nombre: "Rellenado de alojamiento de cilindro", componente_codigo: "CILINDRO", clasificacion: "STD" },
    { codigo: "BARC", nombre: "Barrenado de alojamiento de cilindro", componente_codigo: "CILINDRO", clasificacion: "STD" },
    { codigo: "BRUC", nombre: "Bruñido de cilindro", componente_codigo: "CILINDRO", clasificacion: "STD" },
    // CILINDRO — NO_STD
    { codigo: "COR-C", nombre: "Corte de cilindro", componente_codigo: "CILINDRO", clasificacion: "NO_STD" },
    { codigo: "MAQ-ENBC", nombre: "Maq. Encastre de brida", componente_codigo: "CILINDRO", clasificacion: "NO_STD" },
    { codigo: "MAQ-ENCC", nombre: "Maq. Encastre de cáncamo / tapa posterior", componente_codigo: "CILINDRO", clasificacion: "NO_STD" },
    { codigo: "ENC-TC", nombre: "Encastre de tubo de cilindro", componente_codigo: "CILINDRO", clasificacion: "NO_STD" },
    { codigo: "SOL-JC", nombre: "Soldadura de juntas de cilindro", componente_codigo: "CILINDRO", clasificacion: "NO_STD" },
    { codigo: "MAQ-DSALC", nombre: "Maq. Diámetro Salida de cilindro", componente_codigo: "CILINDRO", clasificacion: "NO_STD" },
    { codigo: "FAB-SC", nombre: "Fabricación de dados/soportes de cilindro", componente_codigo: "CILINDRO", clasificacion: "NO_STD" },
    { codigo: "SOLD SC", nombre: "Soldadura de dados/soportes de cilindro", componente_codigo: "CILINDRO", clasificacion: "NO_STD" },
    { codigo: "FAB-BC", nombre: "Fabricación de bocina de cilindro", componente_codigo: "CILINDRO", clasificacion: "NO_STD" },
    // VASTAGO — STD
    { codigo: "RELV", nombre: "Rellenado de alojamiento de vástago", componente_codigo: "VASTAGO", clasificacion: "STD" },
    { codigo: "BARV", nombre: "Barrenado de alojamiento de vástago", componente_codigo: "VASTAGO", clasificacion: "STD" },
    { codigo: "CROV", nombre: "Cromado de vástago", componente_codigo: "VASTAGO", clasificacion: "STD" },
    // VASTAGO — NO_STD
    { codigo: "COR-V", nombre: "Corte de vástago", componente_codigo: "VASTAGO", clasificacion: "NO_STD" },
    { codigo: "ENC-CV", nombre: "Encastre de cáncamo de vástago", componente_codigo: "VASTAGO", clasificacion: "NO_STD" },
    { codigo: "ENC-BV", nombre: "Encastre de barra de vástago", componente_codigo: "VASTAGO", clasificacion: "NO_STD" },
    { codigo: "MAQ-EV", nombre: "Maq. Espiga de vástago", componente_codigo: "VASTAGO", clasificacion: "NO_STD" },
    { codigo: "SOL-JV", nombre: "Soldadura de junta de vástago", componente_codigo: "VASTAGO", clasificacion: "NO_STD" },
    { codigo: "MAQ-SV", nombre: "Maq. Soldadura de vástago", componente_codigo: "VASTAGO", clasificacion: "NO_STD" },
    { codigo: "FAB-BV", nombre: "Fabricación de bocina de vástago", componente_codigo: "VASTAGO", clasificacion: "NO_STD" },
    // TAPA — STD
    { codigo: "PUL-T", nombre: "Pulido de tapa", componente_codigo: "TAPA", clasificacion: "STD" },
    // TAPA — NO_STD
    { codigo: "REC-T", nombre: "Rectificado de tapa", componente_codigo: "TAPA", clasificacion: "NO_STD" },
    { codigo: "FAB-T", nombre: "Fabricación de tapa", componente_codigo: "TAPA", clasificacion: "NO_STD" },
    // EMBOLO (Pistón) — STD
    { codigo: "PUL-P", nombre: "Pulido de pistón", componente_codigo: "EMBOLO", clasificacion: "STD" },
    // EMBOLO — NO_STD
    { codigo: "REC-P", nombre: "Rectificado de pistón", componente_codigo: "EMBOLO", clasificacion: "NO_STD" },
    { codigo: "FAB-P", nombre: "Fabricación de pistón", componente_codigo: "EMBOLO", clasificacion: "NO_STD" },
  ];
  for (const op of operaciones) {
    await prisma.operacionReparacion.upsert({
      where: { codigo: op.codigo },
      update: { nombre: op.nombre, componente_codigo: op.componente_codigo, clasificacion: op.clasificacion },
      create: op,
    });
  }
  console.log(`✓ ${operaciones.length} Operaciones de Reparación creadas (STD/NO_STD clasificadas)`);

  // ── StatusRequerimiento (desde 7. Log POs) ──────────
  const statusReq = [
    { codigo: "SIN_APROBACION", nombre: "Sin aprobación", orden: 1 },
    { codigo: "APROBADO", nombre: "Aprobado", orden: 2 },
    { codigo: "DESAPROBADO", nombre: "Desaprobado", orden: 3 },
    { codigo: "ANULADO", nombre: "Anulado", orden: 4 },
  ];
  for (const s of statusReq) {
    await prisma.statusRequerimiento.upsert({
      where: { codigo: s.codigo },
      update: {},
      create: s,
    });
  }
  console.log(`✓ ${statusReq.length} Status Requerimiento creados`);

  // ── StatusCotizacion ────────────────────────────────
  const statusCot = [
    { codigo: "PEND_COT", nombre: "Pendiente de cotización", orden: 1 },
    { codigo: "PEND_APROB", nombre: "Pendiente de aprobación", orden: 2 },
    { codigo: "APROBADO", nombre: "Aprobado", orden: 3 },
    { codigo: "ANULADO", nombre: "Anulado", orden: 4 },
    { codigo: "COMPLETO", nombre: "Completo", orden: 5 },
  ];
  for (const s of statusCot) {
    await prisma.statusCotizacion.upsert({
      where: { codigo: s.codigo },
      update: {},
      create: s,
    });
  }
  console.log(`✓ ${statusCot.length} Status Cotización creados`);

  // ── StatusOC ────────────────────────────────────────
  const statusOC = [
    { codigo: "PEND_OC", nombre: "Pendiente de OC", orden: 1 },
    { codigo: "PROCESO", nombre: "En proceso", orden: 2 },
    { codigo: "ENTREGADO", nombre: "Entregado", orden: 3 },
    { codigo: "INCOMPLETO", nombre: "Incompleto", orden: 4 },
    { codigo: "COMPLETO", nombre: "Completo", orden: 5 },
    { codigo: "ANULADO", nombre: "Anulado", orden: 6 },
    { codigo: "DEVOLUCION", nombre: "Devolución", orden: 7 },
  ];
  for (const s of statusOC) {
    await prisma.statusOC.upsert({
      where: { codigo: s.codigo },
      update: {},
      create: s,
    });
  }
  console.log(`✓ ${statusOC.length} Status OC creados`);

  // ── StatusEstrategia (del Excel 3. Todos - Estrategias) ──
  const statusEstr = [
    { codigo: "AC", nombre: "Activo" },
    { codigo: "PR", nombre: "En proceso" },
    { codigo: "EL", nombre: "Eliminado" },
  ];
  for (const s of statusEstr) {
    await prisma.statusEstrategia.upsert({
      where: { codigo: s.codigo },
      update: {},
      create: s,
    });
  }
  console.log(`✓ ${statusEstr.length} Status Estrategia creados`);

  // ── TipoEstrategia (del Excel 3. Todos - Estrategias) ──
  const tipoEstr = [
    { codigo: "CC", nombre: "Cambio de componente" },
    { codigo: "MP", nombre: "Mantenimiento preventivo" },
    { codigo: "RP", nombre: "Reparación" },
    { codigo: "SG", nombre: "Seguridad" },
    { codigo: "IN", nombre: "Inspección" },
    { codigo: "AU", nombre: "Auditoria" },
    { codigo: "ME", nombre: "Mejora" },
    { codigo: "CR", nombre: "Control crítico" },
  ];
  for (const t of tipoEstr) {
    await prisma.tipoEstrategia.upsert({
      where: { codigo: t.codigo },
      update: {},
      create: t,
    });
  }
  console.log(`✓ ${tipoEstr.length} Tipo Estrategia creados`);

  // ── TipoTarea (del Excel 4. Task list / hoja Tipo) ──
  const tipoTarea = [
    { codigo: "MAC", nombre: "Material catalogado" },
    { codigo: "CAD", nombre: "Cargo directo" },
    { codigo: "SER", nombre: "Servicio" },
  ];
  for (const t of tipoTarea) {
    await prisma.tipoTarea.upsert({
      where: { codigo: t.codigo },
      update: {},
      create: t,
    });
  }
  console.log(`✓ ${tipoTarea.length} Tipo Tarea creados`);

  // ── StatusTarea (estados de PlanificacionOT.estado) ──
  const statusTarea = [
    { codigo: "abierto", nombre: "Abierto", color: "warning", orden: 1 },
    { codigo: "programado", nombre: "Programado", color: "processing", orden: 2 },
    { codigo: "realizado", nombre: "Realizado", color: "success", orden: 3 },
    { codigo: "correctivo", nombre: "Correctivo", color: "volcano", orden: 4 },
    { codigo: "cancelado", nombre: "Cancelado", color: "error", orden: 5 },
  ];
  for (const s of statusTarea) {
    await prisma.statusTarea.upsert({
      where: { codigo: s.codigo },
      update: { nombre: s.nombre, color: s.color, orden: s.orden },
      create: s,
    });
  }
  console.log(`✓ ${statusTarea.length} Status Tarea creados`);

  // ── ConjuntoMantenimiento (agrupadores abstractos del Excel Estrategias) ──
  // Se usan cuando una estrategia aplica a un conjunto, no a un equipo específico.
  const conjuntos = [
    { codigo: "TALLER", nombre: "Taller", descripcion: "Edificio del taller (pisos, muros, estructuras)" },
    { codigo: "HERRAMIENTAS", nombre: "Herramientas", descripcion: "Conjunto de herramientas manuales" },
    { codigo: "HERR_MEDICION", nombre: "Herramientas de medición", descripcion: "Instrumentos de medición" },
    { codigo: "MAQUINAS", nombre: "Máquinas y equipos", descripcion: "Conjunto global de máquinas y equipos" },
    { codigo: "VEHICULOS", nombre: "Vehículos", descripcion: "Conjunto de vehículos" },
    { codigo: "SEGURIDAD", nombre: "Seguridad", descripcion: "Sistema/programa de seguridad" },
    { codigo: "INVENTARIO", nombre: "Inventario", descripcion: "Control de inventario" },
  ];
  for (const c of conjuntos) {
    await prisma.conjuntoMantenimiento.upsert({
      where: { codigo: c.codigo },
      update: { nombre: c.nombre, descripcion: c.descripcion },
      create: c,
    });
  }
  console.log(`✓ ${conjuntos.length} Conjuntos de Mantenimiento creados`);

  // ── ConfiguracionCotizacion (singleton con tarifas) ──
  await prisma.configuracionCotizacion.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      tarifa_hora_usd: 25,
      tarifa_hora_sol: 100,
      moneda_default_codigo: "USD",
      igv_porcentaje: 18,
    },
  });
  console.log("✓ Configuración de cotización inicializada");

  // ── Proveedores de ejemplo ──────────────────────────
  // Vendors reales observados en el Excel 8 (REQ & OC) + distribuidores comunes.
  // RUCs pueden corregirse desde la UI cuando el equipo los valide.
  const proveedoresEjemplo = [
    {
      ruc: "20100043170",
      razon_social: "FERREYROS S.A.",
      nombre_comercial: "Ferreyros",
      contacto: "Mesa de Ventas",
      telefono: "+51 1 626-4000",
      email: "ventas@ferreyros.com.pe",
      direccion: "Av. Industrial 675, Lima",
    },
    {
      ruc: "20109167429",
      razon_social: "KOMATSU-MITSUI MAQUINARIAS PERU S.A.",
      nombre_comercial: "Komatsu Mitsui",
      contacto: "Post-Venta",
      telefono: "+51 1 617-5000",
      email: "postventa@komatsu-mitsui.com.pe",
      direccion: "Av. Argentina 2201, Callao",
    },
    {
      ruc: "20143231014",
      razon_social: "BOHLER UDDEHOLM PERU S.A.",
      nombre_comercial: "Bohler Perú",
      contacto: "Aceros y Herramentales",
      telefono: "+51 1 517-3100",
      email: "ventas@bohler.com.pe",
      direccion: "Av. Elmer Faucett 1234, Callao",
    },
    {
      ruc: "20512345671",
      razon_social: "MACHEN PERU S.A.C.",
      nombre_comercial: "Machen",
      contacto: "Ventas Técnicas",
      telefono: "+51 1 480-1111",
      email: "ventas@machen.pe",
      direccion: "Av. Los Frutales 220, Ate",
    },
    {
      ruc: "20445566778",
      razon_social: "HOLDING INDUSTRIAL S.A.",
      nombre_comercial: "Holding",
      contacto: "Compras Corporativas",
      telefono: "+51 54 221-9000",
      email: "compras@holding.com.pe",
      direccion: "Variante de Uchumayo Km 5, Arequipa",
    },
    {
      ruc: "20556677889",
      razon_social: "TRACTO SONI E.I.R.L.",
      nombre_comercial: "Tracto Soni",
      contacto: "Servicios de Cromado y Rectificado",
      telefono: "+51 54 343-5656",
      email: "servicios@tractosoni.com",
      direccion: "Calle Industrial 456, Arequipa",
    },
  ];
  for (const prov of proveedoresEjemplo) {
    await prisma.proveedor.upsert({
      where: { ruc: prov.ruc },
      update: {},
      create: { ...prov, usuario_crea: "seed", usuario_actualiza: "seed" },
    });
  }
  console.log(`✓ ${proveedoresEjemplo.length} Proveedores de ejemplo creados`);

  // ── Códigos Reparables (del Excel) ──────────────────
  const codReps = [
    { desc: "CILINDRO DE JACK HYD", tipo: "CIL", cat: "CHVS", flota: "PER", fab: "EPI", np: "2654472188", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE SUSPENSION POSTERIOR", tipo: "CIL", cat: "CHVS", flota: "CAM", fab: "CAT", np: "106-3722", pos: "NA", precio: 82802.49, moneda: "USD" },
    { desc: "CILINDRO DE INCLINACION DE BULLDOZER", tipo: "CIL", cat: "CHVS", flota: "TRU", fab: "CAT", np: "109-8832_844H", pos: "RH", precio: 19804.99, moneda: "USD" },
    { desc: "CILINDRO DE INCLINACION DE BULLDOZER", tipo: "CIL", cat: "CHVS", flota: "TRU", fab: "CAT", np: "109-8832_844K", pos: "RH", precio: 19804.99, moneda: "USD" },
    { desc: "CILINDRO DE INCLINACION DE BULLDOZER", tipo: "CIL", cat: "CHVS", flota: "TRU", fab: "CAT", np: "109-8833_844H", pos: "LH", precio: 19804.99, moneda: "USD" },
    { desc: "CILINDRO DE INCLINACION DE BULLDOZER", tipo: "CIL", cat: "CHVS", flota: "TRU", fab: "CAT", np: "109-8833_844K", pos: "LH", precio: 19804.99, moneda: "USD" },
    { desc: "CILINDRO DE LEVANTE", tipo: "CIL", cat: "CHVS", flota: "TRU", fab: "CAT", np: "111-8181", pos: "NA", precio: 22930.94, moneda: "USD" },
    { desc: "CILINDRO DE INCLINACION", tipo: "CIL", cat: "CHVS", flota: "TRU", fab: "CAT", np: "112-5003_980G", pos: "RH", precio: 13259.06, moneda: "USD" },
    { desc: "CILINDRO DE INCLINACION", tipo: "CIL", cat: "CHVS", flota: "TRU", fab: "CAT", np: "112-5003_980H", pos: "RH", precio: 13259.06, moneda: "USD" },
    { desc: "CILINDRO DE INCLINACION", tipo: "CIL", cat: "CHVS", flota: "TRU", fab: "CAT", np: "112-5004_980G", pos: "LH", precio: 13259.06, moneda: "USD" },
    { desc: "CILINDRO DE INCLINACION", tipo: "CIL", cat: "CHVS", flota: "TRU", fab: "CAT", np: "112-5004_980H", pos: "LH", precio: 13259.06, moneda: "USD" },
    { desc: "CILINDRO DE LEVANTE DE RIPPER", tipo: "CIL", cat: "CHP", flota: "MOT", fab: "CAT", np: "113-7754", pos: "NA", precio: 7686.79, moneda: "USD" },
    { desc: "CILINDRO DE WHEEL LEAN", tipo: "CIL", cat: "CHVS", flota: "MOT", fab: "CAT", np: "117-0836", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE LEVANTE DE TOLVA", tipo: "CIL", cat: "CHT", flota: "CAM", fab: "CAT", np: "121-2071", pos: "NA", precio: 102689.73, moneda: "USD" },
    { desc: "CILINDRO TENSOR DE ORUGAS", tipo: "CIL", cat: "CHVS", flota: "PER", fab: "CAT", np: "127-1474", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE LEVANTE DE RIPPER", tipo: "CIL", cat: "CHP", flota: "MOT", fab: "CAT", np: "128-7678", pos: "NA", precio: 15691.58, moneda: "USD" },
    { desc: "CILINDRO DE DESPLAZAMIENTO DE VERTEDERA", tipo: "CIL", cat: "CHVS", flota: "MOT", fab: "CAT", np: "141-2914", pos: "NA", precio: 30791.78, moneda: "USD" },
    { desc: "CILINDRO DE BLADE TIP", tipo: "CIL", cat: "CHVS", flota: "MOT", fab: "CAT", np: "143-5988", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE INCLINACION DE BULLDOZER", tipo: "CIL", cat: "CHVS", flota: "TRU", fab: "CAT", np: "151-5171", pos: "RH", precio: 17258.62, moneda: "USD" },
    { desc: "CILINDRO DE LEVANTE", tipo: "CIL", cat: "CHVS", flota: "CAM", fab: "CAT", np: "155-9068", pos: "NA", precio: 74476.96, moneda: "USD" },
    { desc: "CILINDRO DE DIRECCION", tipo: "CIL", cat: "CHVS", flota: "TRU", fab: "CAT", np: "157-1352", pos: "NA", precio: 19962.25, moneda: "USD" },
    { desc: "CILINDRO DE LEVANTE", tipo: "CIL", cat: "CHVS", flota: "TRU", fab: "CAT", np: "173-8612", pos: "RH", precio: 34639.19, moneda: "USD" },
    { desc: "CILINDRO DE LEVANTE", tipo: "CIL", cat: "CHVS", flota: "TRU", fab: "CAT", np: "173-8613", pos: "LH", precio: 34639.19, moneda: "USD" },
    { desc: "CILINDRO DE DIRECCION", tipo: "CIL", cat: "CHVS", flota: "TRU", fab: "CAT", np: "175-5521_834H", pos: "NA", precio: 10018.27, moneda: "USD" },
    { desc: "CILINDRO DE DIRECCION", tipo: "CIL", cat: "CHVS", flota: "TRU", fab: "CAT", np: "175-5521_834K", pos: "NA", precio: 10018.27, moneda: "USD" },
    { desc: "CILINDRO DE DIRECCION", tipo: "CIL", cat: "CHVS", flota: "CAM", fab: "CAT", np: "194-6171", pos: "LH", precio: 20929.83, moneda: "USD" },
    { desc: "ACUMULADOR DE DIRECCION", tipo: "ACU", cat: "AV", flota: "CAM", fab: "CAT", np: "219-2540", pos: "NA", precio: 11246.64, moneda: "USD" },
    { desc: "CILINDRO DE DIRECCION", tipo: "CIL", cat: "CHVS", flota: "TRU", fab: "CAT", np: "229-9337", pos: "NA", precio: 4320.05, moneda: "USD" },
    { desc: "CILINDRO DE LEVANTE DE BULLDOZER", tipo: "CIL", cat: "CHVS", flota: "TRU", fab: "CAT", np: "234-9000", pos: "NA", precio: 24612.32, moneda: "USD" },
    { desc: "CILINDRO DE LEVANTE DE LAMPON", tipo: "CIL", cat: "CHVS", flota: "TRU", fab: "CAT", np: "242-4272", pos: "NA", precio: 17596.52, moneda: "USD" },
    { desc: "CILINDRO DE LEVANTE DE BULLDOZER", tipo: "CIL", cat: "CHP", flota: "TOR", fab: "CAT", np: "250-5861", pos: "NA", precio: 17194.15, moneda: "USD" },
    { desc: "CILINDRO DE LEVANTE DE BULLDOZER", tipo: "CIL", cat: "CHP", flota: "TOR", fab: "CAT", np: "252-0471", pos: "NA", precio: 42851.95, moneda: "USD" },
    { desc: "CILINDRO DE DIRECCION", tipo: "CIL", cat: "CHVS", flota: "TRU", fab: "CAT", np: "261-4949", pos: "NA", precio: 8584.81, moneda: "USD" },
    { desc: "CILINDRO DE INCLINACION DE BULLDOZER", tipo: "CIL", cat: "CHVS", flota: "TRU", fab: "CAT", np: "264-3233", pos: "LH", precio: 16571.01, moneda: "USD" },
    { desc: "CILINDRO DE DIRECCION", tipo: "CIL", cat: "CHVS", flota: "MOT", fab: "CAT", np: "267-3863", pos: "NA", precio: 8473.19, moneda: "USD" },
    { desc: "CILINDRO DE INCLINACION", tipo: "CIL", cat: "CHVS", flota: "TRU", fab: "CAT", np: "271-6441", pos: "NA", precio: 51806.69, moneda: "USD" },
    { desc: "FRENO DE SERVICIO Y PARQUEO", tipo: "FRE", cat: "FS", flota: "MOT", fab: "CAT", np: "271-9321", pos: "DEL", precio: 97759.06, moneda: "USD" },
    { desc: "FRENO DE SERVICIO Y PARQUEO", tipo: "FRE", cat: "FS", flota: "MOT", fab: "CAT", np: "271-9322", pos: "POS", precio: 97814.02, moneda: "USD" },
    { desc: "CILINDRO DE ARTICULACION", tipo: "CIL", cat: "CHVS", flota: "MOT", fab: "CAT", np: "273-1733", pos: "NA", precio: 10708.40, moneda: "USD" },
    { desc: "CILINDRO DE BLADE LIFT", tipo: "CIL", cat: "CHP", flota: "MOT", fab: "CAT", np: "276-7646", pos: "NA", precio: 15186.15, moneda: "USD" },
    { desc: "ACUMULADOR DE DIRECCION", tipo: "ACU", cat: "AE", flota: "CAM", fab: "CAT", np: "277-7219", pos: "NA", precio: 18591.47, moneda: "USD" },
    { desc: "CILINDRO DE DIRECCION", tipo: "CIL", cat: "CHVS", flota: "CAM", fab: "CAT", np: "288-5537", pos: "RH", precio: 25110.79, moneda: "USD" },
    { desc: "CILINDRO DE WHEEL LEAN", tipo: "CIL", cat: "CHVS", flota: "MOT", fab: "CAT", np: "289-3054", pos: "NA", precio: 6759.60, moneda: "USD" },
    { desc: "CILINDRO DE LEVANTE DE TOLVA", tipo: "CIL", cat: "CHT", flota: "CAM", fab: "CAT", np: "289-8616", pos: "NA", precio: 150062.49, moneda: "USD" },
    { desc: "CILINDRO DE SUSPENSION POSTERIOR", tipo: "CIL", cat: "CHVS", flota: "CAM", fab: "CAT", np: "289-8619", pos: "RH", precio: 121270.77, moneda: "USD" },
    { desc: "CILINDRO DE SUSPENSION POSTERIOR", tipo: "CIL", cat: "CHVS", flota: "CAM", fab: "CAT", np: "289-8620", pos: "LH", precio: 121270.77, moneda: "USD" },
    { desc: "CILINDRO DE DIRECCION", tipo: "CIL", cat: "CHVS", flota: "TRU", fab: "CAT", np: "314-9336", pos: "NA", precio: 8118.44, moneda: "USD" },
    { desc: "CILINDRO DE HERRAMIENTA DE GARFIO", tipo: "CIL", cat: "CHVS", flota: "TRU", fab: "WBM", np: "317-002-1072", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE VOLTEO", tipo: "CIL", cat: "CHVS", flota: "CAM", fab: "CAT", np: "341-6034", pos: "NA", precio: 53470.72, moneda: "USD" },
    { desc: "CILINDRO DE BOOM", tipo: "CIL", cat: "CHVS", flota: "EXC", fab: "CAT", np: "353-6907", pos: "NA", precio: 55455.31, moneda: "USD" },
    { desc: "CILINDRO DE BOOM", tipo: "CIL", cat: "CHVS", flota: "EXC", fab: "CAT", np: "353-9648", pos: "LH", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE BOOM", tipo: "CIL", cat: "CHVS", flota: "EXC", fab: "CAT", np: "353-9649", pos: "RH", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE INCLINACION", tipo: "CIL", cat: "CHVS", flota: "TRU", fab: "CAT", np: "354-0798", pos: "NA", precio: 34533.85, moneda: "USD" },
    { desc: "CILINDRO DE LEVANTE", tipo: "CIL", cat: "CHVS", flota: "TRU", fab: "CAT", np: "355-7377", pos: "RH", precio: 38050.62, moneda: "USD" },
    { desc: "CILINDRO DE LEVANTE", tipo: "CIL", cat: "CHVS", flota: "TRU", fab: "CAT", np: "355-7378", pos: "LH", precio: 38050.62, moneda: "USD" },
    { desc: "CILINDRO DE INCLINACION", tipo: "CIL", cat: "CHVS", flota: "TRU", fab: "CAT", np: "359-6691", pos: "NA", precio: 14515.31, moneda: "USD" },
    { desc: "CILINDRO DE BUCKET", tipo: "CIL", cat: "CHVS", flota: "EXC", fab: "CAT", np: "361-2862", pos: "NA", precio: 64466.59, moneda: "USD" },
    { desc: "CILINDRO DE BUCKET", tipo: "CIL", cat: "CHVS", flota: "EXC", fab: "CAT", np: "362-2784", pos: "NA", precio: 45560.57, moneda: "USD" },
    { desc: "CILINDRO DE DIRECCION", tipo: "CIL", cat: "CHVS", flota: "TRU", fab: "CAT", np: "363-0218", pos: "NA", precio: 10465.33, moneda: "USD" },
    { desc: "CILINDRO DE STICK", tipo: "CIL", cat: "CHVS", flota: "EXC", fab: "CAT", np: "363-1685", pos: "NA", precio: 91337.16, moneda: "USD" },
    { desc: "CILINDRO DE BUCKET", tipo: "CIL", cat: "CHVS", flota: "EXC", fab: "CAT", np: "365-9225", pos: "NA", precio: 45560.57, moneda: "USD" },
    { desc: "CILINDRO DE INCLINACION DE BULLDOZER", tipo: "CIL", cat: "CHVS", flota: "TOR", fab: "CAT", np: "367-2258", pos: "RH", precio: 34922.77, moneda: "USD" },
    { desc: "CILINDRO DE STICK", tipo: "CIL", cat: "CHVS", flota: "EXC", fab: "CAT", np: "375-1722", pos: "NA", precio: 43979.11, moneda: "USD" },
    { desc: "CILINDRO DE BLADE TIP", tipo: "CIL", cat: "CHVS", flota: "MOT", fab: "CAT", np: "389-9511", pos: "NA", precio: 7280.86, moneda: "USD" },
    { desc: "CILINDRO DE LEVANTE", tipo: "CIL", cat: "CHP", flota: "MOT", fab: "CAT", np: "389-9512", pos: "NA", precio: 12802.81, moneda: "USD" },
    { desc: "CILINDRO DE LEVANTE", tipo: "CIL", cat: "CHVS", flota: "CAM", fab: "CAT", np: "416-4017", pos: "NA", precio: 175803.78, moneda: "USD" },
    { desc: "CILINDRO DE VOLTEO", tipo: "CIL", cat: "CHVS", flota: "CAM", fab: "CAT", np: "416-4018", pos: "NA", precio: 81197.90, moneda: "USD" },
    { desc: "CILINDRO DE DIRECCION", tipo: "CIL", cat: "CHVS", flota: "CAM", fab: "CAT", np: "416-4020", pos: "NA", precio: 33570.30, moneda: "USD" },
    { desc: "CILINDRO DE TENSOR DE ORUGA", tipo: "CIL", cat: "CHVS", flota: "PER", fab: "CAT", np: "425-1554", pos: "NA", precio: 31409.18, moneda: "USD" },
    { desc: "CILINDRO DE BUCKET", tipo: "CIL", cat: "CHVS", flota: "EXC", fab: "CAT", np: "434-0194", pos: "NA", precio: 41503.84, moneda: "USD" },
    { desc: "FRENO DE SERVICIO Y PARQUEO", tipo: "FRE", cat: "FS", flota: "MOT", fab: "CAT", np: "442-1908", pos: "DEL", precio: 104449.70, moneda: "USD" },
    { desc: "FRENO DE SERVICIO Y PARQUEO", tipo: "FRE", cat: "FS", flota: "MOT", fab: "CAT", np: "442-1909", pos: "POS", precio: 104504.66, moneda: "USD" },
    { desc: "CILINDRO DE INCLINACION DE RIPPER", tipo: "CIL", cat: "CHVS", flota: "TOR", fab: "CAT", np: "465-1711", pos: "NA", precio: 41494.67, moneda: "USD" },
    { desc: "CILINDRO DE LEVANTE DE BULLDOZER", tipo: "CIL", cat: "CHP", flota: "TOR", fab: "CAT", np: "465-2717", pos: "NA", precio: 42461.63, moneda: "USD" },
    { desc: "CILINDRO DE ARTICULACION", tipo: "CIL", cat: "CHVS", flota: "MOT", fab: "CAT", np: "468-0220", pos: "NA", precio: 10609.28, moneda: "USD" },
    { desc: "CILINDRO DE LEVANTE DE RIPPER", tipo: "CIL", cat: "CHP", flota: "MOT", fab: "CAT", np: "468-0433", pos: "NA", precio: 9702.77, moneda: "USD" },
    { desc: "CILINDRO DE BOOM", tipo: "CIL", cat: "CHVS", flota: "EXC", fab: "CAT", np: "470-7141", pos: "NA", precio: 74476.96, moneda: "USD" },
    { desc: "CILINDRO DE SUSPENSION DELANTERA", tipo: "CIL", cat: "SD", flota: "CAM", fab: "CAT", np: "482-4637", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE DIRECCION", tipo: "CIL", cat: "CHVS", flota: "MOT", fab: "CAT", np: "489-2403", pos: "NA", precio: 9369.95, moneda: "USD" },
    { desc: "CILINDRO DE LEVANTE DE BULLDOZER", tipo: "CIL", cat: "CHP", flota: "TRU", fab: "CAT", np: "502-5819_H", pos: "NA", precio: 25080.49, moneda: "USD" },
    { desc: "CILINDRO DE LEVANTE DE BULLDOZER", tipo: "CIL", cat: "CHP", flota: "TRU", fab: "CAT", np: "502-5819_K", pos: "NA", precio: 25080.49, moneda: "USD" },
    { desc: "CILINDRO DE DESPLAZAMIENTO DE VERTEDERA", tipo: "CIL", cat: "CHVS", flota: "MOT", fab: "CAT", np: "507-2438", pos: "NA", precio: 30791.78, moneda: "USD" },
    { desc: "CILINDRO DE SIDESHIFT", tipo: "CIL", cat: "CHVS", flota: "MOT", fab: "CAT", np: "509-6996", pos: "NA", precio: 12823.68, moneda: "USD" },
    { desc: "CILINDRO DE ARTICULACION", tipo: "CIL", cat: "CHVS", flota: "MOT", fab: "CAT", np: "510-8438", pos: "NA", precio: 7582.67, moneda: "USD" },
    { desc: "CILINDRO DE INCLINACION DE BULLDOZER", tipo: "CIL", cat: "CHVS", flota: "TOR", fab: "CAT", np: "517-3767", pos: "LH", precio: 34922.77, moneda: "USD" },
    { desc: "CILINDRO DE INCLINACION DE RIPPER", tipo: "CIL", cat: "CHVS", flota: "TOR", fab: "CAT", np: "521-8411", pos: "RH", precio: 28436.72, moneda: "USD" },
    { desc: "CILINDRO DE INCLINACION DE RIPPER", tipo: "CIL", cat: "CHVS", flota: "TOR", fab: "CAT", np: "521-8420", pos: "LH", precio: 28441.43, moneda: "USD" },
    { desc: "CILINDRO DE LEVANTE DE RIPPER", tipo: "CIL", cat: "CHVS", flota: "TOR", fab: "CAT", np: "521-8423", pos: "NA", precio: 21510.02, moneda: "USD" },
    { desc: "CILINDRO DE INCLINACION DE BULLDOZER", tipo: "CIL", cat: "CHVS", flota: "TOR", fab: "CAT", np: "561-6909", pos: "NA", precio: 32602.12, moneda: "USD" },
    { desc: "CILINDRO DE LEVANTE DE RIPPER", tipo: "CIL", cat: "CHVS", flota: "TOR", fab: "CAT", np: "561-7470", pos: "NA", precio: 21742.54, moneda: "USD" },
    { desc: "CILINDRO DE LEVANTE", tipo: "CIL", cat: "CHVS", flota: "CAM", fab: "CAT", np: "569-5376", pos: "NA", precio: 131088.84, moneda: "USD" },
    { desc: "CILINDRO DE STICK", tipo: "CIL", cat: "CHVS", flota: "EXC", fab: "CAT", np: "570-1981_DL", pos: "NA", precio: 91337.16, moneda: "USD" },
    { desc: "CILINDRO DE STICK", tipo: "CIL", cat: "CHVS", flota: "EXC", fab: "CAT", np: "570-1981_FL", pos: "NA", precio: 91337.16, moneda: "USD" },
    { desc: "CILINDRO DE BUCKET", tipo: "CIL", cat: "CHVS", flota: "EXC", fab: "CAT", np: "570-1986", pos: "NA", precio: 51597.53, moneda: "USD" },
    { desc: "CILINDRO DE BUCKET", tipo: "CIL", cat: "CHVS", flota: "EXC", fab: "CAT", np: "582-7096", pos: "NA", precio: 65846.10, moneda: "USD" },
    { desc: "CILINDRO DE STICK", tipo: "CIL", cat: "CHVS", flota: "EXC", fab: "CAT", np: "589-2696", pos: "NA", precio: 166700.79, moneda: "USD" },
    { desc: "RUEDA DELANTERA", tipo: "RUE", cat: "RD", flota: "CAM", fab: "KOM", np: "58B3200247SERV", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE DIRECCION", tipo: "CIL", cat: "CHVS", flota: "CAM", fab: "KOM", np: "58B4150120SERV", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE DIRECCION", tipo: "CIL", cat: "CHVS", flota: "CAM", fab: "KOM", np: "58B5000400", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE LEVANTE DE TOLVA", tipo: "CIL", cat: "CHT", flota: "CAM", fab: "KOM", np: "58B5001000", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE SUSPENSION DELANTERA", tipo: "CIL", cat: "SD", flota: "CAM", fab: "KOM", np: "58B5040351", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "ACUMULADOR DE DIRECCION", tipo: "ACU", cat: "AE", flota: "CAM", fab: "KOM", np: "58B6020061", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "RUEDA DELANTERA", tipo: "RUE", cat: "RD", flota: "CAM", fab: "KOM", np: "58F3240013SERV", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE BUCKET", tipo: "CIL", cat: "CHVS", flota: "EXC", fab: "CAT", np: "590-8059", pos: "RH", precio: 79020.52, moneda: "USD" },
    { desc: "CILINDRO DE BOOM", tipo: "CIL", cat: "CHVS", flota: "EXC", fab: "CAT", np: "598-1519", pos: "NA", precio: 262432.29, moneda: "USD" },
    { desc: "CILINDRO DE STICK", tipo: "CIL", cat: "CHVS", flota: "EXC", fab: "CAT", np: "599-6994", pos: "NA", precio: 55663.95, moneda: "USD" },
    { desc: "CILINDRO DE LEVANTE DE RIPPER", tipo: "CIL", cat: "CHP", flota: "MOT", fab: "CAT", np: "605-8762", pos: "NA", precio: 9702.77, moneda: "USD" },
    { desc: "CILINDRO DE DIRECCION", tipo: "CIL", cat: "CHVS", flota: "MOT", fab: "CAT", np: "605-8769", pos: "NA", precio: 12823.68, moneda: "USD" },
    { desc: "CILINDRO DE WHEEL LEAN", tipo: "CIL", cat: "CHVS", flota: "MOT", fab: "CAT", np: "605-8793", pos: "NA", precio: 7333.78, moneda: "USD" },
    { desc: "CILINDRO DE BLADE TIP", tipo: "CIL", cat: "CHVS", flota: "MOT", fab: "CAT", np: "605-8794_24", pos: "NA", precio: 7599.38, moneda: "USD" },
    { desc: "CILINDRO DE BLADE TIP", tipo: "CIL", cat: "CHVS", flota: "MOT", fab: "CAT", np: "605-8794_24M", pos: "NA", precio: 7599.38, moneda: "USD" },
    { desc: "CILINDRO DE BLADE LIFT", tipo: "CIL", cat: "CHP", flota: "MOT", fab: "CAT", np: "605-8795", pos: "NA", precio: 15698.30, moneda: "USD" },
    { desc: "CILINDRO DE BLADE LIFT", tipo: "CIL", cat: "CHP", flota: "MOT", fab: "CAT", np: "605-8795_M", pos: "NA", precio: 15698.30, moneda: "USD" },
    { desc: "CILINDRO DE ARTICULACION", tipo: "CIL", cat: "CHVS", flota: "MOT", fab: "CAT", np: "605-8796", pos: "NA", precio: 10609.28, moneda: "USD" },
    { desc: "CILINDRO DE DIRECCION", tipo: "CIL", cat: "CHVS", flota: "TRU", fab: "CAT", np: "6E-1244_H", pos: "NA", precio: 17298.40, moneda: "USD" },
    { desc: "CILINDRO DE DIRECCION", tipo: "CIL", cat: "CHVS", flota: "TRU", fab: "CAT", np: "6E-1244_K", pos: "NA", precio: 17298.40, moneda: "USD" },
    { desc: "CILINDRO DE INCLINACION", tipo: "CIL", cat: "CHVS", flota: "TRU", fab: "KOM", np: "707-01-03212", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE LEVANTE", tipo: "CIL", cat: "CHVS", flota: "TRU", fab: "KOM", np: "707-01-07580", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE DIRECCION", tipo: "CIL", cat: "CHVS", flota: "CAM", fab: "KOM", np: "707010F502", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE INCLINACION DE BULLDOZER", tipo: "CIL", cat: "CHVS", flota: "TOR", fab: "KOM", np: "7070-10-F521", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE BOOM", tipo: "CIL", cat: "CHVS", flota: "EXC", fab: "KOM", np: "707-F1-01380", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE BOOM", tipo: "CIL", cat: "CHVS", flota: "EXC", fab: "KOM", np: "707G105170", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE VOLTEO DE BUCKET", tipo: "CIL", cat: "CHVS", flota: "EXC", fab: "KOM", np: "707G105230", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE LEVANTE DE BULLDOZER", tipo: "CIL", cat: "CHP", flota: "TOR", fab: "KOM", np: "707G300180SG", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE STICK", tipo: "CIL", cat: "CHVS", flota: "EXC", fab: "KOM", np: "707H105780", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE LEVANTE DE RIPPER", tipo: "CIL", cat: "CHVS", flota: "TOR", fab: "KOM", np: "707H106340SG", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE VOLTEO DE RIPPER", tipo: "CIL", cat: "CHVS", flota: "TOR", fab: "KOM", np: "707-H1-06360", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE GARRA", tipo: "CIL", cat: "CHVS", flota: "TRU", fab: "WBM", np: "8011C0", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE DIRECCION", tipo: "CIL", cat: "CHVS", flota: "CAM", fab: "CAT", np: "9T-8912", pos: "NA", precio: 14503.01, moneda: "USD" },
    { desc: "CILINDRO DE SUSPENSION POSTERIOR", tipo: "CIL", cat: "CHVS", flota: "CAM", fab: "KOM", np: "EJ2176", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE DIRECCION", tipo: "CIL", cat: "CHVS", flota: "CAM", fab: "KOM", np: "EK1677", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE LEVANTE DE TOLVA", tipo: "CIL", cat: "CHT", flota: "CAM", fab: "KOM", np: "EL4835", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE DIRECCION", tipo: "CIL", cat: "CHVS", flota: "CAM", fab: "KOM", np: "EL7952", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE SUSPENSION POSTERIOR", tipo: "CIL", cat: "CHVS", flota: "CAM", fab: "KOM", np: "EL7969", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE DIRECCION", tipo: "CIL", cat: "CHVS", flota: "CAM", fab: "KOM", np: "EM0241", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE LEVANTE DE TOLVA", tipo: "CIL", cat: "CHT", flota: "CAM", fab: "KOM", np: "EM8355", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE SUSPENSION POSTERIOR", tipo: "CIL", cat: "CHVS", flota: "CAM", fab: "KOM", np: "EM8841", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE SUSPENSION POSTERIOR", tipo: "CIL", cat: "CHVS", flota: "CAM", fab: "KOM", np: "EM8844", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "ACUMULADOR DE DIRECCION", tipo: "ACU", cat: "AV", flota: "CAM", fab: "KOM", np: "PC2732", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE LEVANTE DE TOLVA", tipo: "CIL", cat: "CHT", flota: "CAM", fab: "KOM", np: "TY5936", pos: "NA", precio: 0.10, moneda: "USD" },
    { desc: "CILINDRO DE SUSPENSION DELANTERA", tipo: "CIL", cat: "SD", flota: "CAM", fab: "KOM", np: "XB3916", pos: "NA", precio: 0.10, moneda: "USD" },
  ];

  // NOTA: Los 139 CodigoReparacion ya NO se crean en este seed.
  // Se cargan desde el Excel vía `npx tsx scripts/fix-codrep-catalogs.ts`,
  // porque el mapeo correcto (con ModeloEvaluacion + Categoria + Flota real)
  // requiere los datos del Excel como fuente de verdad. El seed.ts solo
  // deja los catálogos listos; el script carga la data.
  const _unused_codReps = codReps; // silence unused warning on the legacy array above
  void _unused_codReps;
  console.log("ℹ  Saltando seed hardcoded de CodigoReparacion. Correr: npx tsx scripts/fix-codrep-catalogs.ts");

  // ── Catálogos de Órdenes de Trabajo ──────────────────

  // OT Status
  const otStatuses = [
    { codigo: "Abierta", nombre: "Abierta" },
    { codigo: "Cerrada", nombre: "Cerrada" },
    { codigo: "No Ejecutada", nombre: "No Ejecutada" },
  ];
  for (const s of otStatuses) {
    await prisma.otStatus.upsert({ where: { codigo: s.codigo }, update: {}, create: s });
  }
  console.log("✓ OT Status creados");

  // Recursos Status
  const recursosStatuses = [
    { codigo: "En revision procesos", nombre: "En revision procesos" },
    { codigo: "Recursos solicitados", nombre: "Recursos solicitados" },
    { codigo: "En cotización", nombre: "En cotización" },
    { codigo: "En aprobación", nombre: "En aprobación" },
    { codigo: "En espera de recursos", nombre: "En espera de recursos" },
    { codigo: "Recursos en recepción", nombre: "Recursos en recepción" },
    { codigo: "Recursos incompletos", nombre: "Recursos incompletos" },
    { codigo: "Recursos completos", nombre: "Recursos completos" },
  ];
  for (const s of recursosStatuses) {
    await prisma.recursosStatus.upsert({ where: { codigo: s.codigo }, update: {}, create: s });
  }
  console.log("✓ Recursos Status creados");

  // Taller Status
  const tallerStatuses = [
    { codigo: "Pdt Evaluación", nombre: "Pdt Evaluación" },
    { codigo: "Programado Evaluación", nombre: "Programado Evaluación" },
    { codigo: "Pdt proceso", nombre: "Pdt proceso" },
    { codigo: "Programado Proceso", nombre: "Programado Proceso" },
    { codigo: "Terminado", nombre: "Terminado" },
    { codigo: "Entregado", nombre: "Entregado" },
    { codigo: "Cobranza", nombre: "Cobranza" },
  ];
  for (const s of tallerStatuses) {
    await prisma.tallerStatus.upsert({ where: { codigo: s.codigo }, update: {}, create: s });
  }
  console.log("✓ Taller Status creados");

  // Garantía
  const garantias = [
    { codigo: "Si", nombre: "Si" },
    { codigo: "No", nombre: "No" },
  ];
  for (const g of garantias) {
    await prisma.garantia.upsert({ where: { codigo: g.codigo }, update: {}, create: g });
  }
  console.log("✓ Garantías creadas");

  // Atención Reparación
  const atencionReparaciones = [
    { codigo: "Contrato", nombre: "Contrato" },
    { codigo: "Presupuesto", nombre: "Presupuesto" },
    { codigo: "Emergencia", nombre: "Emergencia" },
  ];
  for (const a of atencionReparaciones) {
    await prisma.atencionReparacion.upsert({ where: { codigo: a.codigo }, update: {}, create: a });
  }
  console.log("✓ Atención Reparación creadas");

  // Tipo Reparación
  const tipoReparaciones = [
    { codigo: "General", nombre: "General" },
    { codigo: "Parcial", nombre: "Parcial" },
    { codigo: "Eval & Lim", nombre: "Eval & Lim" },
    { codigo: "Vestido", nombre: "Vestido" },
  ];
  for (const t of tipoReparaciones) {
    await prisma.tipoReparacion.upsert({ where: { codigo: t.codigo }, update: {}, create: t });
  }
  console.log("✓ Tipo Reparación creados");

  // Tipo Garantía
  const tipoGarantias = [
    { codigo: "Cliente", nombre: "Cliente" },
    { codigo: "Por definir", nombre: "Por definir" },
    { codigo: "HPK", nombre: "HPK" },
    { codigo: "Comercial", nombre: "Comercial" },
    { codigo: "NA", nombre: "NA" },
  ];
  for (const t of tipoGarantias) {
    await prisma.tipoGarantia.upsert({ where: { codigo: t.codigo }, update: {}, create: t });
  }
  console.log("✓ Tipo Garantía creados");

  // Prioridad de Atención
  const prioridades = [
    { codigo: "1", nombre: "Alta", nivel: 1 },
    { codigo: "2", nombre: "Media", nivel: 2 },
    { codigo: "3", nombre: "Baja", nivel: 3 },
    { codigo: "E", nombre: "Emergencia", nivel: 0 },
  ];
  for (const p of prioridades) {
    await prisma.prioridadAtencion.upsert({ where: { codigo: p.codigo }, update: {}, create: p });
  }
  console.log("✓ Prioridad Atención creadas");

  // Base Metálica
  const baseMetalicas = [
    { codigo: "Si", nombre: "Si" },
    { codigo: "No", nombre: "No" },
  ];
  for (const b of baseMetalicas) {
    await prisma.baseMetalica.upsert({ where: { codigo: b.codigo }, update: {}, create: b });
  }
  console.log("✓ Base Metálica creadas");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
