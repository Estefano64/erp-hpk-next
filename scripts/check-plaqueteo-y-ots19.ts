// Verifica: (1) si plaqueteo está realmente en BDU, (2) qué OTs terminan en 19
// y si están o no en BDU (para borrar las que sobran).

import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import * as path from "node:path";

const RAILWAY_URL =
  "postgresql://postgres:vthphXsotIJPSGPdpZkkLRSDVxVuBHVG@yamabiko.proxy.rlwy.net:42613/railway";
const prisma = new PrismaClient({ datasources: { db: { url: RAILWAY_URL } } });

const EXCEL_PATH = path.resolve(__dirname, "../../CABECERA_LOG_Y_OPERACIONES_CORREGIDO(2)(1).xlsx");

async function main() {
  const wb = XLSX.readFile(EXCEL_PATH);
  const sheet = wb.Sheets["BASE DE DATOS UNI"];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const dataRows = rows.slice(1).filter((r) => /^\d+$/.test(String((r as unknown[])[0] ?? "").trim()));

  // ── 1. Plaqueteo en BDU ──────────────────────────────────────────────
  console.log(`\n🔍 PLAQUETEO en BDU:`);
  console.log(`   Header col 14: "${(rows[0] as unknown[])[14]}"`);
  console.log(`   Data fila 0 (encabezado de datos):`);
  for (let c = 13; c <= 16; c++) {
    console.log(`     col ${c}: ${JSON.stringify((rows[0] as unknown[])[c])}`);
  }
  // Buscar header "Plaqueteo" o variante en TODA la fila 0 (data row 0)
  const dataHeaders = rows[0] as unknown[];
  for (let c = 0; c < dataHeaders.length; c++) {
    const v = String(dataHeaders[c] ?? "").toLowerCase();
    if (v.includes("plaque")) {
      console.log(`   ✓ Header con "plaque" encontrado en col ${c}: "${dataHeaders[c]}"`);
      let conValor = 0;
      const ejemplos: string[] = [];
      for (const r of dataRows) {
        const v = String((r as unknown[])[c] ?? "").trim();
        if (v && v !== "-" && v !== "—") {
          conValor++;
          if (ejemplos.length < 5) ejemplos.push(`OT ${(r as unknown[])[0]}: "${v}"`);
        }
      }
      console.log(`     ${conValor}/${dataRows.length} OTs tienen valor`);
      ejemplos.forEach((e) => console.log(`       ${e}`));
    }
  }

  // ── 2. OTs que terminan en 19 ────────────────────────────────────────
  console.log(`\n🔍 OTs en BDU que terminan en 19 (año 2019):`);
  const otsBdu = new Set<number>();
  let otsEn19Bdu = 0;
  for (const r of dataRows) {
    const ot = parseInt(String((r as unknown[])[0]).trim(), 10);
    if (!Number.isFinite(ot)) continue;
    otsBdu.add(ot);
    if (ot % 100 === 19) otsEn19Bdu++;
  }
  console.log(`   En BDU terminan en 19: ${otsEn19Bdu} OTs`);

  console.log(`\n🔍 OTs en Railway que terminan en 19:`);
  const otsDb19 = await prisma.ordenTrabajo.findMany({
    where: {
      AND: [
        { ot: { not: null } },
      ],
    },
    select: { id: true, ot: true, descripcion: true, usuario_crea: true, fecha_creacion: true, cliente: { select: { razon_social: true } } },
    orderBy: { ot: "asc" },
  });
  const en19Db = otsDb19.filter((o) => o.ot != null && o.ot % 100 === 19);
  console.log(`   Total en Railway terminan en 19: ${en19Db.length}`);
  const en19EnBdu = en19Db.filter((o) => o.ot != null && otsBdu.has(o.ot));
  const en19NoEnBdu = en19Db.filter((o) => o.ot != null && !otsBdu.has(o.ot));
  console.log(`     ├ En BDU (legítimas):              ${en19EnBdu.length}`);
  console.log(`     └ NO en BDU (deberían borrarse):   ${en19NoEnBdu.length}`);
  console.log(`\n   Primeras 15 OTs en 19 que NO están en BDU:`);
  for (const o of en19NoEnBdu.slice(0, 15)) {
    console.log(`     OT ${o.ot} | ${o.cliente?.razon_social ?? "—"} | "${o.descripcion ?? "—"}" | crea=${o.usuario_crea ?? "—"} ${o.fecha_creacion ?? ""}`);
  }
  if (en19NoEnBdu.length > 15) console.log(`     ...y ${en19NoEnBdu.length - 15} más`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
