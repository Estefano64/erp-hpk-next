// scripts/dryrun-import-bienes.ts
// SOLO LECTURA. Lee el Excel 6.1, parsea los códigos VXXXXYY, cruza
// catálogos contra Railway y reporta exactamente qué se importaría.
// NO escribe nada — esperamos confirmación.

import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import * as path from "node:path";
import { formatOtCodigo } from "../src/lib/ot-formato";

const EXCEL_PATH = path.resolve(__dirname, "../../6.1_Ots_VENTAS_INFORMACION.xlsx");
const RW = "postgresql://postgres:vthphXsotIJPSGPdpZkkLRSDVxVuBHVG@yamabiko.proxy.rlwy.net:42613/railway";
const prisma = new PrismaClient({ datasources: { db: { url: RW } } });

// Typos conocidos a auto-corregir antes del lookup.
const TYPO_CLIENTE: Record<string, string> = {
  QUELLAEVECO: "QUELLAVECO",
};
const TYPO_FABRICANTE: Record<string, string> = {
  "CROSS CRONTROL": "CROSS CONTROL",
};

function N(s: unknown): string {
  return String(s ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

// Excel serial → Date. Excel cuenta días desde 1900-01-01 con el bug del 29-feb-1900.
function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial <= 0) return null;
  // 25569 = días entre 1900-01-01 y 1970-01-01 (corregido por el bug 1900).
  const utcDays = serial - 25569;
  const ms = utcDays * 86400 * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

interface Fila {
  rowIdx: number;
  codigoExcel: string;
  ot: number | null;           // Int parseado de VXXXXYY
  anio: number | null;
  correlativo: number | null;
  cliente: string;
  clienteNormalizado: string;
  estrategia: boolean;
  np: string;
  descripcion: string;
  fabricante: string;
  fabricanteNormalizado: string;
  equipo: string;
  ns: string;
  plaqueteo: string;
  wo_cliente: string;
  po_cliente: string;
  id_viajero: string;
  guia_remision: string;
  empresa_entrega: string;
  fecha_recepcion: Date | null;
  pcr: number | null;
  horas: number | null;
  atencion: string;
  prioridad: string;
  comentarios: string;
  fecha_req_cliente: Date | null;
  ot_status: string;
  recursos_status: string;
  taller_status: string;
}

async function main() {
  // 1. Leer Excel.
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets["Ots De bienes "];
  if (!ws) throw new Error("Hoja 'Ots De bienes ' no encontrada");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });

  // r0 = headers, datos desde r1 (en la versión actualizada del Excel ya no
  // hay fila de marcadores "X").
  const dataRows = rows.slice(1).filter((r) => String((r as unknown[])[0] ?? "").trim().length > 0);

  // 2. Cargar catálogos de Railway.
  const [clientes, fabricantes, tipoOt, atRep, otStatus, recStatus, prio] = await Promise.all([
    prisma.cliente.findMany({ select: { cliente_id: true, codigo: true, razon_social: true, nombre_comercial: true } }),
    prisma.fabricante.findMany({ select: { fabricante_id: true, nombre: true } }),
    prisma.tipoOT.findMany({ select: { codigo: true, nombre: true } }),
    prisma.atencionReparacion.findMany({ select: { codigo: true } }),
    prisma.otStatus.findMany({ select: { codigo: true } }),
    prisma.recursosStatus.findMany({ select: { codigo: true, nombre: true } }),
    prisma.prioridadAtencion.findMany({ select: { codigo: true } }),
  ]);

  const clienteByName = new Map<string, number>();
  for (const c of clientes) {
    [c.codigo, c.razon_social, c.nombre_comercial].forEach((v) => {
      if (v) clienteByName.set(N(v), c.cliente_id);
    });
  }
  const fabByName = new Map<string, number>();
  for (const f of fabricantes) {
    if (f.nombre) fabByName.set(N(f.nombre), f.fabricante_id);
  }
  const atRepCodes = new Set(atRep.map((a) => N(a.codigo)));
  const otStatusCodes = new Map<string, string>(otStatus.map((s) => [N(s.codigo), s.codigo]));
  const recStatusCodes = new Map<string, string>(recStatus.map((s) => [N(s.codigo), s.codigo]));
  const prioCodes = new Set(prio.map((p) => N(p.codigo)));

  // 3. Parsear cada fila.
  const filas: Fila[] = [];
  const stats = {
    parseErrors: [] as string[],
    sinCliente: 0,
    sinFabricante: 0,
    sinFecha: 0,
    atencionX: 0,
  };
  const codigosVistos = new Map<number, string>();
  const duplicadosInternos: string[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i] as unknown[];
    const codigoExcel = String(row[0]).trim();

    // Formato esperado nuevo: V<4 dígitos correlativo><2 dígitos año>.
    // Aceptamos también legacy con padding raro.
    const m = /^V(\d{4})(\d{2})$/.exec(codigoExcel);
    let ot: number | null = null;
    let correlativo: number | null = null;
    let anio: number | null = null;
    if (m) {
      correlativo = parseInt(m[1], 10);
      anio = parseInt(m[2], 10);
      ot = correlativo * 100 + anio; // NNNNYY
    } else {
      stats.parseErrors.push(codigoExcel);
    }
    if (ot != null) {
      if (codigosVistos.has(ot)) {
        duplicadosInternos.push(`${codigoExcel} (otro: ${codigosVistos.get(ot)})`);
      } else {
        codigosVistos.set(ot, codigoExcel);
      }
    }

    const cliente = String(row[1] ?? "").trim();
    const clienteNorm = TYPO_CLIENTE[N(cliente)] ?? N(cliente);

    const fabricante = String(row[7] ?? "").trim();
    const fabNorm = TYPO_FABRICANTE[N(fabricante)] ?? N(fabricante);

    const estrategia = N(row[3]) === "SI";

    const atencion = String(row[23] ?? "").trim();
    if (atencion === "X" || N(atencion) === "X") stats.atencionX++;

    const fechaRecepNum = Number(row[18]);
    const fechaRecep = Number.isFinite(fechaRecepNum) && fechaRecepNum > 0 ? excelSerialToDate(fechaRecepNum) : null;
    if (!fechaRecep) stats.sinFecha++;
    const fechaReqNum = Number(row[30]);
    const fechaReq = Number.isFinite(fechaReqNum) && fechaReqNum > 0 ? excelSerialToDate(fechaReqNum) : null;

    if (cliente && !clienteByName.has(clienteNorm)) stats.sinCliente++;
    if (fabricante && !fabByName.has(fabNorm)) stats.sinFabricante++;

    filas.push({
      rowIdx: i + 2,
      codigoExcel,
      ot,
      anio,
      correlativo,
      cliente,
      clienteNormalizado: clienteNorm,
      estrategia,
      np: String(row[5] ?? "").trim(),
      descripcion: String(row[6] ?? "").trim(),
      fabricante,
      fabricanteNormalizado: fabNorm,
      equipo: String(row[10] ?? "").trim(),
      ns: String(row[11] ?? "").trim(),
      plaqueteo: String(row[12] ?? "").trim(),
      wo_cliente: String(row[13] ?? "").trim(),
      po_cliente: String(row[14] ?? "").trim(),
      id_viajero: String(row[15] ?? "").trim(),
      guia_remision: String(row[16] ?? "").trim(),
      empresa_entrega: String(row[17] ?? "").trim(),
      fecha_recepcion: fechaRecep,
      pcr: Number.isFinite(Number(row[19])) && Number(row[19]) > 0 ? Number(row[19]) : null,
      horas: Number.isFinite(Number(row[20])) && Number(row[20]) > 0 ? Number(row[20]) : null,
      atencion,
      prioridad: String(row[26] ?? "").trim(),
      comentarios: String(row[29] ?? "").trim(),
      fecha_req_cliente: fechaReq,
      ot_status: String(row[31] ?? "").trim(),
      recursos_status: String(row[32] ?? "").trim(),
      taller_status: String(row[33] ?? "").trim(),
    });
  }

  // 4. Reportes.
  console.log(`${"=".repeat(70)}`);
  console.log(`📊 RESUMEN DRY-RUN — ${filas.length} OTs a importar`);
  console.log(`${"=".repeat(70)}\n`);

  // Distribución por año.
  const porAnio = new Map<number, number>();
  for (const f of filas) if (f.anio != null) porAnio.set(f.anio, (porAnio.get(f.anio) ?? 0) + 1);
  console.log(`Por año:`);
  [...porAnio.entries()].sort((a, b) => a[0] - b[0]).forEach(([y, n]) =>
    console.log(`   20${String(y).padStart(2, "0")}: ${n} OTs`),
  );

  console.log(`\nErrores de parseo de código: ${stats.parseErrors.length}`);
  if (stats.parseErrors.length) console.log(`   ejemplos: ${stats.parseErrors.slice(0, 5).join(", ")}`);

  console.log(`Duplicados internos (mismo ot dentro del Excel): ${duplicadosInternos.length}`);
  if (duplicadosInternos.length) console.log(`   ejemplos: ${duplicadosInternos.slice(0, 5).join(", ")}`);

  console.log(`OTs con cliente no encontrado (id_cliente=null): ${stats.sinCliente}`);
  console.log(`OTs con fabricante no encontrado (id_fabricante=null): ${stats.sinFabricante}`);
  console.log(`OTs con atencion='X' (atencion_reparacion_codigo=null): ${stats.atencionX}`);
  console.log(`OTs sin fecha de recepción: ${stats.sinFecha}`);

  // 5. Conflicto con OTs ya en Railway (mismo ot + tipo BIE).
  const otNumeros = filas.map((f) => f.ot).filter((v): v is number => v != null);
  const conflictos = await prisma.ordenTrabajo.findMany({
    where: { ot: { in: otNumeros }, tipo_codigo: "BIE", activo: true },
    select: { id: true, ot: true, descripcion: true },
  });
  console.log(`\nOTs en Railway que ya existen como BIE con mismo número: ${conflictos.length}`);
  if (conflictos.length > 0) {
    console.log("   (estas se SALTARÍAN para no duplicar)");
    conflictos.slice(0, 10).forEach((c) => console.log(`     ot=${c.ot}: ${c.descripcion?.slice(0, 60)}`));
  }

  // 6. Conflicto con otras tipos (REP que tenga el mismo número). Permitido pero
  //    es bueno reportarlo. La BD NO tiene @unique en ot.
  const conflictosREP = await prisma.ordenTrabajo.findMany({
    where: { ot: { in: otNumeros }, tipo_codigo: { not: "BIE" } },
    select: { ot: true, tipo_codigo: true },
  });
  console.log(`OTs con mismo número pero OTRO tipo (REP/null históricas): ${conflictosREP.length}`);
  console.log(`   (NO bloquea: la BD permite ot duplicado con tipo distinto)`);
  if (conflictosREP.length > 0) {
    conflictosREP.slice(0, 10).forEach((c) => console.log(`     ot=${c.ot} (tipo=${c.tipo_codigo ?? "null"})`));
  }

  // 7. Muestra primeras 10 filas como van a entrar a la BD.
  console.log(`\n${"=".repeat(70)}`);
  console.log(`📋 PRIMERAS 10 FILAS (vista previa de cómo se guardan en Railway):`);
  console.log("=".repeat(70));
  for (const f of filas.slice(0, 10)) {
    const cId = clienteByName.get(f.clienteNormalizado) ?? null;
    const fId = fabByName.get(f.fabricanteNormalizado) ?? null;
    const otStat = otStatusCodes.get(N(f.ot_status)) ?? null;
    const recStat = recStatusCodes.get(N(f.recursos_status)) ?? null;
    const atRepCode = f.atencion === "X" || f.atencion === "" ? null
      : (atRepCodes.has(N(f.atencion)) ? f.atencion : null);

    const displayCodigo = formatOtCodigo(f.ot, "BIE");
    const matchExcel = displayCodigo === f.codigoExcel ? " ✓ (idéntico al Excel)" : "";
    console.log(`\nFila ${f.rowIdx}: Excel "${f.codigoExcel}" → BD ot=${f.ot} → display "${displayCodigo}"${matchExcel}`);
    console.log(`   tipo_codigo='BIE'  estrategia=${f.estrategia}  anio=${f.anio}`);
    console.log(`   cliente "${f.cliente}" → id=${cId ?? "NULL"}`);
    console.log(`   fabricante "${f.fabricante}" → id=${fId ?? "NULL"}`);
    console.log(`   np="${f.np}"  descripcion="${f.descripcion.slice(0, 50)}..."`);
    console.log(`   equipo="${f.equipo}"  ns="${f.ns}"  po_cliente="${f.po_cliente}"`);
    console.log(`   atencion="${f.atencion}" → ${atRepCode ?? "NULL"}`);
    console.log(`   ot_status="${f.ot_status}" → ${otStat ?? "NULL"}`);
    console.log(`   recursos_status="${f.recursos_status}" → ${recStat ?? "NULL"}`);
    console.log(`   fecha_recepcion=${f.fecha_recepcion?.toISOString().slice(0, 10) ?? "NULL"}`);
    console.log(`   fecha_req_cliente=${f.fecha_req_cliente?.toISOString().slice(0, 10) ?? "NULL"}`);
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log(`🟡 DRY-RUN. Nada se escribió en la BD.`);
  console.log(`${"=".repeat(70)}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
