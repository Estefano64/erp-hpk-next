// scripts/update-precios.ts
//
// Actualiza precios en BD desde 2 Excels:
//   1. `5. Cod Rep (3).xlsx`    → codigo_reparacion.precio + moneda
//   2. `4. Log prod - Task list materiales y servicios (4).xlsx` → tarea.precio
//      (solo filas SER por ahora)
//
// Match:
//   - Cod Rep: `codigo_reparacion.np` ⇆ columna "NP" del Excel
//   - Servicio: `tarea.cod_rep_codigo` (lookup desde np) + `tarea.item_numero` ⇆
//                columnas "N/P cod 1" + "Item" del Excel, filtrando tipo_codigo='SER'
//
// Uso:
//   npx tsx scripts/update-precios.ts            # DRY RUN — solo reporta
//   npx tsx scripts/update-precios.ts --apply    # Ejecuta UPDATE real
//
// Usa RAILWAY_DATABASE_URL del .env. Si querés correrlo contra local, cambiá
// la env var manualmente antes (no lo dejo hardcoded para evitar accidentes).

import "dotenv/config";
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";

const EXCEL_COD_REP = "C:/Users/HP/Downloads/5. Cod Rep (3).xlsx";
const EXCEL_TASK_LIST = "C:/Users/HP/Downloads/4. Log prod - Task list materiales y servicios (4).xlsx";

const APPLY = process.argv.includes("--apply");

function cleanUrl(url: string): string {
  return url.replace(/\?.*$/, "");
}

interface CodRepRow {
  np: string;
  descripcion: string;
  precio: number;
  moneda: string;
}

interface ServicioRow {
  np_cod_1: string;     // ⇆ codigo_reparacion.np
  item_numero: number;  // ⇆ tarea.item_numero
  texto: string;        // descripción del servicio (para reporte)
  precio: number;
}

function leerCodRep(): CodRepRow[] {
  const wb = XLSX.readFile(EXCEL_COD_REP);
  const sheet = wb.Sheets["Cod Rep"];
  const json = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
  const out: CodRepRow[] = [];
  // Headers en fila 1, datos desde fila 2.
  // Columnas: 0=Usuario 1=Cod Rep 2=Descripcion 3=Tipo 4=Descripcion tipo
  //           5=Categoria 6=Flota 7=Fabricante 8=NP 9=Posicion 10=Precio 11=Moneda
  for (let i = 2; i < json.length; i++) {
    const row = json[i];
    if (!row) continue;
    const np = row[8] != null ? String(row[8]).trim() : "";
    if (!np) continue;
    const precio = Number(row[10]);
    if (!Number.isFinite(precio) || precio <= 0) continue;
    out.push({
      np,
      descripcion: row[2] ? String(row[2]) : "",
      precio,
      moneda: row[11] ? String(row[11]).trim() : "USD",
    });
  }
  return out;
}

function leerServicios(): ServicioRow[] {
  const wb = XLSX.readFile(EXCEL_TASK_LIST);
  const sheet = wb.Sheets["Task List Materiales"];
  const json = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
  const out: ServicioRow[] = [];
  // Headers en fila 1, datos desde fila 2.
  // Columnas: 0=Usuario 1=Actividad 2=Cod Rep 3=N/P cod 1 4=N/P cod 2 5=ID TUBO 6=OD VAS
  //           7=Descripción 8=Item 9=Tipo 10=Material 11=Requerimiento 12=Ref descripcion
  //           13=NP 14=Texto 15=Precio
  for (let i = 2; i < json.length; i++) {
    const row = json[i];
    if (!row || row[9] !== "SER") continue;
    const npCod1 = row[3] != null ? String(row[3]).trim() : "";
    const item = Number(row[8]);
    const precio = Number(row[15]);
    if (!npCod1 || !Number.isFinite(item) || !Number.isFinite(precio) || precio <= 0) continue;
    out.push({
      np_cod_1: npCod1,
      item_numero: item,
      texto: row[14] ? String(row[14]) : "",
      precio,
    });
  }
  return out;
}

async function main() {
  const url = process.env.RAILWAY_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("RAILWAY_DATABASE_URL ni DATABASE_URL configurados en .env");

  const target = /localhost|127\.0\.0\.1/i.test(url) ? "LOCAL" : "RAILWAY";
  const mask = url.replace(/:[^:@/]+@/, ":****@");
  console.log(`Modo: ${APPLY ? "APPLY (escribe)" : "DRY RUN (solo reporta)"}`);
  console.log(`Destino: ${target}`);
  console.log(`URL:     ${mask}`);
  console.log("");

  const prisma = new PrismaClient({ datasourceUrl: cleanUrl(url) });

  try {
    // ── 1. COD REP ─────────────────────────────────────────────────
    console.log("[1/2] Cod Rep — precios");
    const codReps = leerCodRep();
    console.log(`  Filas Excel con NP + precio>0: ${codReps.length}`);

    const codRepsBD = await prisma.codigoReparacion.findMany({
      select: { cod_rep_id: true, codigo: true, np: true, precio: true, moneda_codigo: true },
    });
    const byNp = new Map(codRepsBD.filter((c) => c.np).map((c) => [c.np as string, c]));

    const codRepMatches: { id: number; np: string; codigo: string; precioActual: number | null; precioNuevo: number }[] = [];
    const codRepUnmatched: { np: string; descripcion: string }[] = [];

    for (const row of codReps) {
      const match = byNp.get(row.np);
      if (!match) {
        codRepUnmatched.push({ np: row.np, descripcion: row.descripcion });
        continue;
      }
      const precioActual = match.precio != null ? Number(match.precio) : null;
      codRepMatches.push({
        id: match.cod_rep_id,
        np: row.np,
        codigo: match.codigo,
        precioActual,
        precioNuevo: row.precio,
      });
    }

    console.log(`  ✓ Matches: ${codRepMatches.length}`);
    console.log(`  ✗ Sin match en BD: ${codRepUnmatched.length}`);
    if (codRepUnmatched.length > 0) {
      console.log("    Primeros 10 NPs faltantes:");
      codRepUnmatched.slice(0, 10).forEach((u) => console.log(`      - ${u.np}  ${u.descripcion.slice(0, 60)}`));
    }
    const cambios = codRepMatches.filter((m) => Number(m.precioActual ?? 0) !== Number(m.precioNuevo));
    console.log(`  → Precios que cambiarían: ${cambios.length} (los demás ya tienen el mismo precio)`);

    // ── 2. SERVICIOS (Tarea SER) ───────────────────────────────────
    console.log("\n[2/2] Servicios (Tarea tipo SER) — precios");
    const servicios = leerServicios();
    console.log(`  Filas Excel SER con N/P cod 1 + Item + precio>0: ${servicios.length}`);

    const npsUnicos = [...new Set(servicios.map((s) => s.np_cod_1))];
    const codRepsParaSvc = await prisma.codigoReparacion.findMany({
      where: { np: { in: npsUnicos } },
      select: { codigo: true, np: true },
    });
    const npToCodRep = new Map(codRepsParaSvc.map((c) => [c.np as string, c.codigo]));

    const codRepsConSvc = [...new Set(codRepsParaSvc.map((c) => c.codigo))];
    const tareas = codRepsConSvc.length > 0
      ? await prisma.tarea.findMany({
          where: { cod_rep_codigo: { in: codRepsConSvc }, tipo_codigo: "SER" },
          select: { tarea_id: true, cod_rep_codigo: true, item_numero: true, texto: true, precio: true },
        })
      : [];
    const tareaKey = (cod: string, item: number) => `${cod}::${item}`;
    const tareaMap = new Map(tareas.map((t) => [tareaKey(t.cod_rep_codigo ?? "", t.item_numero ?? 0), t]));

    const svcMatches: { id: number; cod_rep: string; item: number; texto: string; precioActual: number | null; precioNuevo: number }[] = [];
    const svcUnmatched: { np_cod_1: string; item: number; texto: string; reason: string }[] = [];

    for (const row of servicios) {
      const codRep = npToCodRep.get(row.np_cod_1);
      if (!codRep) {
        svcUnmatched.push({ np_cod_1: row.np_cod_1, item: row.item_numero, texto: row.texto, reason: `NP ${row.np_cod_1} no existe en codigo_reparacion` });
        continue;
      }
      const tarea = tareaMap.get(tareaKey(codRep, row.item_numero));
      if (!tarea) {
        svcUnmatched.push({ np_cod_1: row.np_cod_1, item: row.item_numero, texto: row.texto, reason: `Tarea SER no existe en ${codRep} item ${row.item_numero}` });
        continue;
      }
      svcMatches.push({
        id: tarea.tarea_id,
        cod_rep: codRep,
        item: row.item_numero,
        texto: row.texto,
        precioActual: tarea.precio != null ? Number(tarea.precio) : null,
        precioNuevo: row.precio,
      });
    }

    console.log(`  ✓ Matches: ${svcMatches.length}`);
    console.log(`  ✗ Sin match en BD: ${svcUnmatched.length}`);
    if (svcUnmatched.length > 0) {
      console.log("    Primeros 10 sin match:");
      svcUnmatched.slice(0, 10).forEach((u) => console.log(`      - NP ${u.np_cod_1} item ${u.item} (${u.texto}) → ${u.reason}`));
    }
    const cambiosSvc = svcMatches.filter((m) => Number(m.precioActual ?? 0) !== Number(m.precioNuevo));
    console.log(`  → Precios que cambiarían: ${cambiosSvc.length}`);

    // ── 3. APLICAR (si --apply) ────────────────────────────────────
    if (!APPLY) {
      console.log("\n────────────────────────────────────────────────────────────");
      console.log("DRY RUN — no se escribió nada. Re-correr con --apply para ejecutar.");
      return;
    }

    console.log("\n[APPLY] Escribiendo cambios…");
    // Timeout amplio: 410 updates serializados contra Railway tardan ~30-60s.
    await prisma.$transaction(async (tx) => {
      let cr = 0;
      for (const m of codRepMatches) {
        await tx.codigoReparacion.update({
          where: { cod_rep_id: m.id },
          data: { precio: m.precioNuevo, moneda_codigo: "USD" },
        });
        cr++;
      }
      console.log(`  ✓ ${cr} codigos_reparacion actualizados.`);

      let sv = 0;
      for (const m of svcMatches) {
        await tx.tarea.update({
          where: { tarea_id: m.id },
          data: { precio: m.precioNuevo },
        });
        sv++;
      }
      console.log(`  ✓ ${sv} tareas SER actualizadas.`);
    }, { timeout: 180_000, maxWait: 10_000 });
    console.log("\n✓ Listo.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : e);
  process.exit(1);
});
