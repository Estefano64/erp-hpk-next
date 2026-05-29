import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import * as path from "node:path";

const RW = "postgresql://postgres:vthphXsotIJPSGPdpZkkLRSDVxVuBHVG@yamabiko.proxy.rlwy.net:42613/railway";
const prisma = new PrismaClient({ datasources: { db: { url: RW } } });

async function main() {
  const wb = XLSX.readFile(path.resolve(__dirname, "../../OTs-Externas-estados.xlsx"));
  const sh = wb.Sheets["OTs Externas"];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sh, { header: 1, defval: "" });
  const xls = new Map<number, string>();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    const ot = parseInt(String(row[0] ?? "").trim(), 10);
    if (!ot) continue;
    const s = String(row[24] ?? "").trim();
    if (s === "Abierta" || s === "Cerrada") xls.set(ot, s);
  }
  const otsDb = await prisma.ordenTrabajo.findMany({
    where: { ot: { in: [...xls.keys()] } },
    select: { ot: true, ot_status_codigo: true },
  });
  console.log("Cerrada → Abierta:");
  for (const o of otsDb) {
    if (o.ot && o.ot_status_codigo === "Cerrada" && xls.get(o.ot) === "Abierta") {
      console.log("  OT", o.ot);
    }
  }
  console.log("\nNo Ejecutada → Abierta:");
  for (const o of otsDb) {
    if (o.ot && o.ot_status_codigo === "No Ejecutada" && xls.get(o.ot) === "Abierta") {
      console.log("  OT", o.ot);
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
