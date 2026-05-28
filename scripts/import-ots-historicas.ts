// Importa OTs históricas del Excel a la BD. Procesa DOS hojas con schemas
// distintos: "Base de datos" (histórica) y "Base de datos 2026" (nueva).
// Idempotente: saltea las OTs cuyo `ot` ya existe.
//
// Reglas (decisión del usuario, 2026-05-28):
//   - Clientes que no existan en BD → se crean automáticamente con código corto.
//   - Fabricantes "reales" que no existan (Volvo, Liebherr, P&H, etc.) → se crean.
//   - Fabricantes con códigos basura ("o", "1321", "1324", "EQ1324") → id_fabricante=null.
//   - "HP&K" del Excel → mapea a HPK existente.
//   - OTs cuyo `ot` ya existe en BD → se saltan (no se sobrescriben).
//
// STATUS TALLER (mapeo de la imagen 2026-05-27):
//   COBRANZA            → Cobranza            (cerrada — facturación pendiente)
//   ENTREGADO           → Entregado           (cerrada)
//   LISTO PARA DESPACHO → Terminado           (cerrada)
//   DEVOLUCIÓN / STOCK / PROCESO → Pdt proceso         (abierta)
//   ARMADO / PROGRAMADO          → Programado Proceso  (abierta)
//   EVALUACION / STAND BY        → Pdt Evaluación      (abierta)
//
// OT STATUS:
//   Cobranza / Entregado / Terminado → "Cerrada"
//   Resto                             → "Abierta"
//
// Uso:
//   DATABASE_URL="..." npx tsx scripts/import-ots-historicas.ts            # dry-run
//   DATABASE_URL="..." npx tsx scripts/import-ots-historicas.ts --apply
import { PrismaClient, Prisma } from "@prisma/client";
import * as XLSX from "xlsx";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const EXCEL_PATH = "c:/Users/cesar/OneDrive/Desktop/ERP-HpyK/Ramas/cambi/Cloudflare/CABECERA_LOG_Y_OPERACIONES_CORREGIDO (2) (1).xlsx";

// ─── Mapeos de status ─────────────────────────────────────────────────────

const STATUS_TALLER_MAP: Record<string, string> = {
  "COBRANZA": "Cobranza",
  "DEVOLUCION": "Pdt proceso",
  "DEVOLUCIÓN": "Pdt proceso",
  "STOCK": "Pdt proceso",
  "LISTO PARA DESPACHO": "Terminado",
  "ENTREGADO": "Entregado",
  "PROCESO": "Pdt proceso",
  "ARMADO": "Programado Proceso",
  "EVALUACION": "Pdt Evaluación",
  "EVALUACIÓN": "Pdt Evaluación",
  "PROGRAMADO": "Programado Proceso",
  "STAND BY": "Pdt Evaluación",
};

const TALLER_CIERRA_OT = new Set(["Cobranza", "Entregado", "Terminado"]);

// ─── Schemas por hoja ─────────────────────────────────────────────────────
// Cada hoja tiene su propia disposición de columnas. `null` = la hoja no
// tiene esa columna (se importa como null).

interface SheetCols {
  ot: number;
  cliente: number;
  descripcion: number;
  base_metalica: number;
  equipo: number;
  pos: number;
  plaqueteo: number;
  np: number;
  ns: number;
  horas: number;
  pcr: number;
  id_viajero: number;
  garantia: number;
  guia_remision: number;
  fecha_evaluacion: number;
  evaluador: number;
  fecha_req_1: number | null;
  fecha_req_2: number | null;
  nro_informe_evaluacion: number;
  fecha_entrega_informe: number | null;
  fecha_recepcion: number;
  dias_evaluacion: number;
  fecha_cotizacion: number;
  dias_cotizacion: number;
  nro_cotizacion: number;
  monto_cotizacion: number;
  fecha_aprobacion: number;
  dias_aprobacion: number;
  fecha_entrega: number;
  cumplimiento: number;
  dias_proceso: number;
  nro_informe_entrega: number;
  guia_entrega_salida: number;
  nro_factura: number;
  fecha_facturacion: number;
  dias_en_taller: number;
  status_final: number;
}

interface SheetConfig {
  sheetName: string;
  dataStartRow: number;
  cols: SheetCols;
}

// "Base de datos 2026" — schema actual con cols extra (FECHA REQ, CRITICIDAD, etc.)
const SHEET_2026: SheetConfig = {
  sheetName: "Base de datos 2026",
  dataStartRow: 3,
  cols: {
    ot: 0, cliente: 1, descripcion: 2, base_metalica: 3, equipo: 4,
    pos: 6, plaqueteo: 7, np: 8, ns: 9, horas: 10, pcr: 11,
    id_viajero: 12, garantia: 13, guia_remision: 14,
    fecha_evaluacion: 15, evaluador: 16,
    fecha_req_1: 17, fecha_req_2: 18,
    nro_informe_evaluacion: 21, fecha_entrega_informe: 22, fecha_recepcion: 23,
    dias_evaluacion: 25, fecha_cotizacion: 26, dias_cotizacion: 27,
    nro_cotizacion: 28, monto_cotizacion: 29,
    fecha_aprobacion: 31, dias_aprobacion: 32, fecha_entrega: 36,
    cumplimiento: 38, dias_proceso: 39, nro_informe_entrega: 40,
    guia_entrega_salida: 41, nro_factura: 42, fecha_facturacion: 43,
    dias_en_taller: 44, status_final: 47,
  },
};

// "Base de datos" — schema histórico (sin FECHA REQ 1/2, sin CRITICIDAD, etc.)
const SHEET_HISTORICA: SheetConfig = {
  sheetName: "Base de datos",
  dataStartRow: 2,
  cols: {
    ot: 0, cliente: 1, descripcion: 2, base_metalica: 3, equipo: 4,
    pos: 6, plaqueteo: 7, np: 8, ns: 9, horas: 10, pcr: 11,
    id_viajero: 12, garantia: 13, guia_remision: 14,
    fecha_evaluacion: 15, evaluador: 16,
    fecha_req_1: null, fecha_req_2: null,
    nro_informe_evaluacion: 17, fecha_entrega_informe: null, fecha_recepcion: 18,
    dias_evaluacion: 19, fecha_cotizacion: 20, dias_cotizacion: 21,
    nro_cotizacion: 22, monto_cotizacion: 23,
    fecha_aprobacion: 24, dias_aprobacion: 25, fecha_entrega: 28,
    cumplimiento: 29, dias_proceso: 30, nro_informe_entrega: 31,
    guia_entrega_salida: 32, nro_factura: 33, fecha_facturacion: 34,
    dias_en_taller: 35, status_final: 36,
  },
};

const SHEETS_A_IMPORTAR: SheetConfig[] = [SHEET_2026, SHEET_HISTORICA];

// ─── Helpers ──────────────────────────────────────────────────────────────

function norm(s: unknown): string {
  return String(s ?? "").trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function clean(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "" || s === "-" || s === "—") return null;
  return s;
}

function cleanNum(v: unknown): number | null {
  const s = clean(v);
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function excelDateToJs(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 32874 || n > 73415) return null;
  const epoch = new Date(Date.UTC(1899, 11, 30));
  return new Date(epoch.getTime() + n * 86400000);
}

function makeCodigo(nombre: string, len: number): string {
  return norm(nombre).replace(/[^A-Z0-9]/g, "").slice(0, len) || "X";
}

// Lee un campo opcional (devuelve null si la hoja no lo tiene).
function col(row: unknown[], idx: number | null): unknown {
  return idx == null ? null : row[idx];
}

const FABRICANTES_A_CREAR: Record<string, string> = {
  VOLVO: "Volvo",
  LIEBHERR: "Liebherr",
  "P&H": "P&H",
  TEREX: "Terex",
  MANITEX: "Manitex",
  ACOPCO: "Acopco",
  ALCO: "Alco",
  CWS: "CWS",
  FMA: "FMA",
  UKUMARI: "Ukumari",
};

const FABRICANTES_IGNORAR = new Set(["O", "1321", "1324", "EQ1324"]);
const FABRICANTES_ALIAS: Record<string, string> = { "HP&K": "HPK" };

// Clientes alias: del Excel → al nombre canónico (otro valor del Excel).
// Evita crear dos clientes para la misma entidad cuando el Excel usa nombres
// distintos (ej: "HP&K" y "HPK" son lo mismo).
const CLIENTES_ALIAS: Record<string, string> = {
  "HPK": "HP&K",
};

// ─── Carga de filas de cada hoja ──────────────────────────────────────────

interface LoadedSheet {
  config: SheetConfig;
  dataRows: unknown[][];
}

function loadSheet(wb: XLSX.WorkBook, cfg: SheetConfig): LoadedSheet {
  const sheet = wb.Sheets[cfg.sheetName];
  if (!sheet) throw new Error(`Hoja "${cfg.sheetName}" no encontrada en el Excel.`);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const dataRows = rows
    .slice(cfg.dataStartRow)
    .filter((r) => {
      const v = String(r[cfg.cols.ot] ?? "").trim();
      return /^\d+$/.test(v);
    });
  return { config: cfg, dataRows };
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Modo: ${APPLY ? "🔴 APPLY" : "🟡 DRY-RUN"}`);
  const wb = XLSX.readFile(EXCEL_PATH);

  // 1. Cargar ambas hojas.
  const sheets = SHEETS_A_IMPORTAR.map((cfg) => loadSheet(wb, cfg));
  console.log(`\n📄 Hojas cargadas:`);
  for (const s of sheets) {
    console.log(`   ${s.config.sheetName}: ${s.dataRows.length} filas con OT numérica`);
  }

  // 2. Catálogos de BD: clientes, fabricantes.
  const clientesBD = await prisma.cliente.findMany({
    select: { cliente_id: true, codigo: true, razon_social: true, nombre_comercial: true },
  });
  const clienteByName = new Map<string, { cliente_id: number; codigo: string }>();
  const codigosClientesUsados = new Set<string>();
  for (const c of clientesBD) {
    clienteByName.set(norm(c.razon_social), c);
    if (c.nombre_comercial) clienteByName.set(norm(c.nombre_comercial), c);
    clienteByName.set(norm(c.codigo), c);
    codigosClientesUsados.add(c.codigo);
  }

  const fabsBD = await prisma.fabricante.findMany({
    select: { fabricante_id: true, codigo: true, nombre: true },
  });
  const fabByName = new Map<string, { fabricante_id: number; codigo: string }>();
  const codigosFabsUsados = new Set<string>();
  for (const f of fabsBD) {
    fabByName.set(norm(f.nombre), f);
    fabByName.set(norm(f.codigo), f);
    codigosFabsUsados.add(f.codigo);
  }

  // 3. Detectar clientes a crear (de cualquier hoja).
  // Aplica CLIENTES_ALIAS para evitar crear duplicados (ej: HP&K + HPK).
  const clientesAcrear = new Map<string, { nombre: string; codigoSugerido: string }>();
  const todosClientesXls = new Set<string>();
  for (const s of sheets) {
    for (const r of s.dataRows) {
      const raw = String(r[s.config.cols.cliente] || "").trim();
      if (!raw) continue;
      const canon = CLIENTES_ALIAS[raw] ?? raw;
      todosClientesXls.add(canon);
    }
  }
  for (const c of todosClientesXls) {
    if (clienteByName.has(norm(c))) continue;
    let cod = makeCodigo(c, 5);
    let suf = 1;
    while (
      codigosClientesUsados.has(cod) ||
      [...clientesAcrear.values()].some((x) => x.codigoSugerido === cod)
    ) {
      cod = makeCodigo(c, 4) + suf;
      suf++;
    }
    clientesAcrear.set(c, { nombre: c, codigoSugerido: cod });
  }

  // 4. Detectar fabricantes a crear (de cualquier hoja).
  const fabsAcrear = new Map<string, { nombre: string; codigoSugerido: string }>();
  const todosFabsXls = new Set<string>();
  for (const s of sheets) {
    for (const r of s.dataRows) {
      const f = String(r[s.config.cols.equipo] || "").trim();
      if (f) todosFabsXls.add(f);
    }
  }
  for (const f of todosFabsXls) {
    const nu = norm(f);
    if (fabByName.has(nu)) continue;
    if (FABRICANTES_IGNORAR.has(nu)) continue;
    if (FABRICANTES_ALIAS[f]) continue;
    if (!FABRICANTES_A_CREAR[nu]) continue;
    const nombreReal = FABRICANTES_A_CREAR[nu];
    let cod = makeCodigo(nombreReal, 5);
    let suf = 1;
    while (
      codigosFabsUsados.has(cod) ||
      [...fabsAcrear.values()].some((x) => x.codigoSugerido === cod)
    ) {
      cod = makeCodigo(nombreReal, 4) + suf;
      suf++;
    }
    fabsAcrear.set(f, { nombre: nombreReal, codigoSugerido: cod });
  }

  // 5. OTs existentes en BD (de cualquier hoja).
  const todasOTsXls = new Set<string>();
  for (const s of sheets) {
    for (const r of s.dataRows) todasOTsXls.add(String(r[s.config.cols.ot]).trim());
  }
  const otsExistentes = new Set(
    (await prisma.ordenTrabajo.findMany({
      where: { ot: { in: [...todasOTsXls] } },
      select: { ot: true },
    })).map((o) => o.ot ?? ""),
  );

  // 6. Reporte previo por hoja.
  console.log(`\n📊 Plan global:`);
  console.log(`  - OTs únicas (total entre hojas): ${todasOTsXls.size}`);
  console.log(`  - OTs ya existentes en BD:        ${otsExistentes.size}`);
  console.log(`  - Clientes a crear:               ${clientesAcrear.size}`);
  for (const { nombre, codigoSugerido } of clientesAcrear.values()) {
    console.log(`      • ${codigoSugerido.padEnd(7)} → ${nombre}`);
  }
  console.log(`  - Fabricantes a crear:            ${fabsAcrear.size}`);
  for (const { nombre, codigoSugerido } of fabsAcrear.values()) {
    console.log(`      • ${codigoSugerido.padEnd(7)} → ${nombre}`);
  }

  // Deduplicar OTs entre hojas y por sheet: la primera hoja en SHEETS_A_IMPORTAR
  // gana (en general la más "rica" → 2026 antes que Histórica).
  const yaProcesadasEnEsteRun = new Set<string>();
  const reportePorHoja: { sheet: string; aImportar: number; duplicadas: number; tallerCounts: Map<string, number>; sinMapeo: Map<string, number> }[] = [];

  for (const s of sheets) {
    let aImportar = 0;
    let duplicadas = 0;
    const tallerCounts = new Map<string, number>();
    const sinMapeo = new Map<string, number>();
    for (const r of s.dataRows) {
      const ot = String(r[s.config.cols.ot]).trim();
      if (otsExistentes.has(ot) || yaProcesadasEnEsteRun.has(ot)) {
        duplicadas++;
        continue;
      }
      yaProcesadasEnEsteRun.add(ot);
      aImportar++;
      const raw = String(r[s.config.cols.status_final] ?? "").trim().toUpperCase();
      if (!raw) {
        tallerCounts.set("(vacío)", (tallerCounts.get("(vacío)") ?? 0) + 1);
        continue;
      }
      const mapped = STATUS_TALLER_MAP[raw];
      if (mapped) {
        tallerCounts.set(`${raw} → ${mapped}`, (tallerCounts.get(`${raw} → ${mapped}`) ?? 0) + 1);
      } else {
        sinMapeo.set(raw, (sinMapeo.get(raw) ?? 0) + 1);
      }
    }
    reportePorHoja.push({ sheet: s.config.sheetName, aImportar, duplicadas, tallerCounts, sinMapeo });
  }

  for (const rep of reportePorHoja) {
    console.log(`\n📋 Hoja "${rep.sheet}":`);
    console.log(`   - A importar:   ${rep.aImportar}`);
    console.log(`   - Duplicadas:   ${rep.duplicadas}  (ya en BD o ya en otra hoja)`);
    console.log(`   Status Taller:`);
    [...rep.tallerCounts.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => {
      console.log(`       ${String(n).padStart(5)}  ${k}`);
    });
    if (rep.sinMapeo.size > 0) {
      console.log(`   ⚠️  Status Taller sin mapeo (se importan con NULL):`);
      [...rep.sinMapeo.entries()].slice(0, 20).forEach(([k, n]) =>
        console.log(`       ${String(n).padStart(5)}  ${k.slice(0, 80)}`));
      if (rep.sinMapeo.size > 20) console.log(`       ... y ${rep.sinMapeo.size - 20} más`);
    }
  }

  if (!APPLY) {
    console.log(`\n🟡 DRY-RUN: no se aplicó nada. Para aplicar, corré con --apply`);
    return;
  }

  // 7. Crear catálogos faltantes.
  console.log(`\n🔴 Creando catálogos faltantes...`);
  for (const [excelName, { nombre, codigoSugerido }] of clientesAcrear) {
    const nuevo = await prisma.cliente.create({
      data: { codigo: codigoSugerido, razon_social: nombre, usuario_crea: "import-xlsx" },
      select: { cliente_id: true, codigo: true },
    });
    clienteByName.set(norm(excelName), nuevo);
    console.log(`  ✓ Cliente ${nuevo.codigo} (${nombre})`);
  }
  for (const [excelName, { nombre, codigoSugerido }] of fabsAcrear) {
    const nuevo = await prisma.fabricante.create({
      data: { codigo: codigoSugerido, nombre },
      select: { fabricante_id: true, codigo: true },
    });
    fabByName.set(norm(excelName), nuevo);
    console.log(`  ✓ Fabricante ${nuevo.codigo} (${nombre})`);
  }
  for (const [alias, target] of Object.entries(FABRICANTES_ALIAS)) {
    const f = fabByName.get(norm(target));
    if (f) fabByName.set(norm(alias), f);
  }

  // 8. Crear OTs, recorriendo cada hoja con su propio column map.
  const yaCreadasEnEsteRun = new Set<string>();
  let creadasTotal = 0;
  let saltadasTotal = 0;
  const errores: { sheet: string; ot: string; error: string }[] = [];

  for (const s of sheets) {
    console.log(`\n🔴 Importando OTs desde "${s.config.sheetName}"...`);
    let creadas = 0;
    let saltadas = 0;
    for (const r of s.dataRows) {
      const ot = String(r[s.config.cols.ot]).trim();
      if (otsExistentes.has(ot) || yaCreadasEnEsteRun.has(ot)) {
        saltadas++;
        continue;
      }

      const c = s.config.cols;
      const clienteNombre = clean(r[c.cliente]);
      const fabExcel = clean(r[c.equipo]);
      let id_fabricante: number | null = null;
      if (fabExcel) {
        const fab = fabByName.get(norm(fabExcel));
        if (fab) id_fabricante = fab.fabricante_id;
      }
      let id_cliente: number | null = null;
      if (clienteNombre) {
        const canon = CLIENTES_ALIAS[clienteNombre] ?? clienteNombre;
        const cli = clienteByName.get(norm(canon));
        if (cli) id_cliente = cli.cliente_id;
      }

      const tallerRaw = String(r[c.status_final] ?? "").trim().toUpperCase();
      const tallerCodigo = tallerRaw ? (STATUS_TALLER_MAP[tallerRaw] ?? null) : null;
      const otStatusCodigo = tallerCodigo && TALLER_CIERRA_OT.has(tallerCodigo) ? "Cerrada" : "Abierta";

      try {
        await prisma.ordenTrabajo.create({
          data: {
            ot,
            tipo_codigo: "REP",
            id_cliente,
            id_fabricante,
            descripcion: clean(r[c.descripcion]),
            cod_rep_posicion: clean(r[c.pos]),
            plaqueteo: clean(r[c.plaqueteo]),
            np: clean(r[c.np]),
            ns: clean(r[c.ns]),
            horas: cleanNum(r[c.horas]) != null ? new Prisma.Decimal(cleanNum(r[c.horas])!) : null,
            pcr: cleanNum(r[c.pcr]) != null ? new Prisma.Decimal(cleanNum(r[c.pcr])!) : null,
            id_viajero: clean(r[c.id_viajero]),
            garantia_codigo: clean(r[c.garantia]) === "SI" ? "Si" : "No",
            guia_remision: clean(r[c.guia_remision]),
            fecha_evaluacion: excelDateToJs(r[c.fecha_evaluacion]),
            evaluador: clean(r[c.evaluador]),
            fecha_req_1: excelDateToJs(col(r, c.fecha_req_1)),
            fecha_req_2: excelDateToJs(col(r, c.fecha_req_2)),
            nro_informe_evaluacion: clean(r[c.nro_informe_evaluacion]),
            fecha_entrega_informe: excelDateToJs(col(r, c.fecha_entrega_informe)),
            fecha_recepcion: excelDateToJs(r[c.fecha_recepcion]),
            dias_evaluacion: cleanNum(r[c.dias_evaluacion]),
            fecha_cotizacion: excelDateToJs(r[c.fecha_cotizacion]),
            dias_cotizacion: cleanNum(r[c.dias_cotizacion]),
            nro_cotizacion: clean(r[c.nro_cotizacion]),
            monto_cotizacion: cleanNum(r[c.monto_cotizacion]) != null
              ? new Prisma.Decimal(cleanNum(r[c.monto_cotizacion])!)
              : null,
            fecha_aprobacion: excelDateToJs(r[c.fecha_aprobacion]),
            dias_aprobacion: cleanNum(r[c.dias_aprobacion]),
            fecha_entrega: excelDateToJs(r[c.fecha_entrega]),
            cumplimiento: clean(r[c.cumplimiento])?.slice(0, 20),
            dias_proceso: cleanNum(r[c.dias_proceso]),
            nro_informe_entrega: clean(r[c.nro_informe_entrega]),
            guia_entrega_salida: clean(r[c.guia_entrega_salida]),
            nro_factura: clean(r[c.nro_factura]),
            fecha_facturacion: excelDateToJs(r[c.fecha_facturacion]),
            dias_en_taller: cleanNum(r[c.dias_en_taller]),
            base_metalica_codigo: clean(r[c.base_metalica]) === "SI" ? "Si"
              : clean(r[c.base_metalica]) === "NO" ? "No" : null,
            ot_status_codigo: otStatusCodigo,
            recursos_status_codigo: "Recursos completos",
            taller_status_codigo: tallerCodigo,
            usuario_crea: "import-xlsx",
          },
        });
        creadas++;
        yaCreadasEnEsteRun.add(ot);
      } catch (e) {
        errores.push({ sheet: s.config.sheetName, ot, error: e instanceof Error ? e.message : String(e) });
      }
    }
    console.log(`   ✓ ${s.config.sheetName}: ${creadas} creadas, ${saltadas} saltadas`);
    creadasTotal += creadas;
    saltadasTotal += saltadas;
  }

  console.log(`\n✓ Resultados globales:`);
  console.log(`  - Creadas:   ${creadasTotal}`);
  console.log(`  - Saltadas:  ${saltadasTotal}`);
  console.log(`  - Errores:   ${errores.length}`);
  if (errores.length > 0) {
    console.log(`\nPrimeros 10 errores:`);
    errores.slice(0, 10).forEach((e) => console.log(`  ✗ [${e.sheet}] ${e.ot}: ${e.error}`));
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().then(() => process.exit(1));
  });
