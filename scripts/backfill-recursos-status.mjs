// Recalcula recursos_status_codigo para todas las OTs (externas e internas)
// usando la logica actualizada de src/lib/recursos-ot.ts. Sirve para arreglar
// las OTs stuck en 'En espera de recursos' cuando en realidad ya estan
// entregadas/completas.
// Uso: node scripts/backfill-recursos-status.mjs [--dry-run]

import { PrismaClient } from "@prisma/client";

const DRY = process.argv.includes("--dry-run");
const prisma = new PrismaClient({
  datasourceUrl: "postgresql://postgres:vthphXsotIJPSGPdpZkkLRSDVxVuBHVG@yamabiko.proxy.rlwy.net:42613/railway",
});

// ── Copia de la logica de src/lib/recursos-ot.ts ─────────────────────
const FLUJO = [
  "En revision procesos",
  "Recursos solicitados",
  "En cotización",
  "En aprobación",
  "En espera de recursos",
  "Recursos completos",
  "Recursos entregados",
];
const CONSUMIDOS = new Set(["CONSUMIDO_ALMACEN", "CONSUMIDO_OC_ABIERTA"]);

function etapaRep(r) {
  const sr = r.status_requerimiento_codigo;
  if (sr == null || sr === "BORRADOR") return 0;
  if (sr === "SIN_APROBACION") return 1;
  const oc = r.status_oc_codigo;
  if (oc && CONSUMIDOS.has(oc)) return 6;
  if (oc === "COMPLETO" || oc === "ENTREGADO") return 5;
  const compraOc = r.compra?.status_oc_codigo ?? null;
  if (compraOc === "ENTREGADO" || compraOc === "COMPLETO") return 5;
  if (compraOc === "INCOMPLETO") {
    const cant = Number(r.cantidad);
    const rec = Number(r.cantidad_recibida ?? 0);
    if (rec >= cant - 0.0001 && cant > 0) return 5;
    return 4;
  }
  const tieneOC = r.po_id != null || compraOc != null;
  if (tieneOC) {
    if (compraOc === "PEND_OC" || oc === "PEND_OC") return 3;
    return 4;
  }
  if (oc === "PEND_OC") return 3;
  return 2;
}

function calcularStatus(reps) {
  const vivos = reps.filter((r) => {
    if (r.solo_para_oc === true) return false;
    const sr = r.status_requerimiento_codigo;
    return sr !== "ANULADO" && sr !== "DESAPROBADO" && r.status_oc_codigo !== "ANULADO";
  });
  const enviados = vivos.filter(
    (r) => r.status_requerimiento_codigo != null && r.status_requerimiento_codigo !== "BORRADOR",
  );
  if (enviados.length === 0) return FLUJO[0];
  const etapaMin = Math.min(...enviados.map(etapaRep));
  return FLUJO[etapaMin];
}

const SELECT = {
  status_requerimiento_codigo: true,
  status_oc_codigo: true,
  po_id: true,
  solo_para_oc: true,
  cantidad: true,
  cantidad_recibida: true,
  compra: { select: { status_oc_codigo: true } },
};

async function backfillExternas() {
  console.log("\n=== OTs Externas ===");
  const ots = await prisma.ordenTrabajo.findMany({
    select: { id: true, ot: true, recursos_status_codigo: true },
  });
  let cambios = 0;
  const cambiosPorEstado = new Map();
  for (const ot of ots) {
    const reps = await prisma.oTRepuesto.findMany({
      where: { ot_id: ot.id },
      select: SELECT,
    });
    const nuevo = calcularStatus(reps);
    if (nuevo !== ot.recursos_status_codigo) {
      cambios++;
      const key = `${ot.recursos_status_codigo ?? "—"} → ${nuevo}`;
      cambiosPorEstado.set(key, (cambiosPorEstado.get(key) ?? 0) + 1);
      if (!DRY) {
        await prisma.$transaction(async (tx) => {
          await tx.ordenTrabajo.update({
            where: { id: ot.id },
            data: { recursos_status_codigo: nuevo },
          });
          await tx.oTHistorial.create({
            data: {
              ot_id: ot.id,
              tipo_operacion: "Cambio Estado",
              descripcion: `Recursos: "${ot.recursos_status_codigo ?? "—"}" → "${nuevo}" (backfill masivo)`,
              usuario: "sistema",
            },
          });
        });
      }
    }
  }
  console.log(`  Total OTs: ${ots.length}`);
  console.log(`  Cambiadas: ${cambios}`);
  for (const [k, v] of cambiosPorEstado) console.log(`    ${k} · ${v} OTs`);
}

async function backfillInternas() {
  console.log("\n=== OTs Internas ===");
  const ots = await prisma.ordenTrabajoInterna.findMany({
    select: { id: true, ot: true, recursos_status_codigo: true },
  });
  let cambios = 0;
  const cambiosPorEstado = new Map();
  for (const ot of ots) {
    const reps = await prisma.oTRepuesto.findMany({
      where: { orden_trabajo_interna_id: ot.id },
      select: SELECT,
    });
    const nuevo = calcularStatus(reps);
    if (nuevo !== ot.recursos_status_codigo) {
      cambios++;
      const key = `${ot.recursos_status_codigo ?? "—"} → ${nuevo}`;
      cambiosPorEstado.set(key, (cambiosPorEstado.get(key) ?? 0) + 1);
      if (!DRY) {
        await prisma.$transaction(async (tx) => {
          await tx.ordenTrabajoInterna.update({
            where: { id: ot.id },
            data: { recursos_status_codigo: nuevo },
          });
          await tx.oTHistorial.create({
            data: {
              orden_trabajo_interna_id: ot.id,
              tipo_operacion: "Cambio Estado",
              descripcion: `Recursos: "${ot.recursos_status_codigo ?? "—"}" → "${nuevo}" (backfill masivo)`,
              usuario: "sistema",
            },
          });
        });
      }
    }
  }
  console.log(`  Total OTs: ${ots.length}`);
  console.log(`  Cambiadas: ${cambios}`);
  for (const [k, v] of cambiosPorEstado) console.log(`    ${k} · ${v} OTs`);
}

async function main() {
  console.log(`Modo: ${DRY ? "DRY-RUN" : "APLICAR EN RAILWAY"}`);
  await backfillExternas();
  await backfillInternas();
  if (DRY) console.log("\n(dry-run — no se escribió nada)");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
