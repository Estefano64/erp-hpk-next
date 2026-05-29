// Revierte la restauración errónea de plaqueteo: lo pone null para las OTs
// en BDU (los datos visibles bajo "Plaqueteo" en BDU realmente son
// equipo_codigo, no plaqueteo).

import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import * as path from "node:path";

const RAILWAY_URL =
  "postgresql://postgres:vthphXsotIJPSGPdpZkkLRSDVxVuBHVG@yamabiko.proxy.rlwy.net:42613/railway";
const prisma = new PrismaClient({ datasources: { db: { url: RAILWAY_URL } } });
const EXCEL_PATH = path.resolve(__dirname, "../../CABECERA_LOG_Y_OPERACIONES_CORREGIDO(2)(1).xlsx");
const APPLY = process.argv.includes("--apply");

async function main() {
  const wb = XLSX.readFile(EXCEL_PATH);
  const sheet = wb.Sheets["BASE DE DATOS UNI"];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const otsBdu: number[] = [];
  for (const r of rows.slice(2)) {
    const v = String((r as unknown[])[0] ?? "").trim();
    if (/^\d+$/.test(v)) otsBdu.push(parseInt(v, 10));
  }

  const conPlaqueteo = await prisma.ordenTrabajo.count({
    where: { AND: [{ ot: { in: otsBdu } }, { plaqueteo: { not: null } }] },
  });
  console.log(`OTs en BDU con plaqueteo a null: ${conPlaqueteo}`);

  if (!APPLY) {
    console.log(`🟡 DRY-RUN. Para aplicar: --apply`);
    return;
  }
  const r = await prisma.ordenTrabajo.updateMany({
    where: { ot: { in: otsBdu } },
    data: { plaqueteo: null },
  });
  console.log(`✅ ${r.count} OTs con plaqueteo → null`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
