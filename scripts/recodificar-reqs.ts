// Renombra los nro_req de OTRepuestos al formato nuevo "{códigoOT}-{N}".
//
// El nro_req identifica a un REQUERIMIENTO (grupo de items). Varios OTRepuesto
// pueden compartir el mismo nro_req (cada uno con item_req distinto). Al
// renombrar, TODOS los items del mismo nro_req deben quedar con el mismo
// código nuevo.
//
// Reglas:
//   - Item de OT externa con código  →  "{codigoOT}-{N}"  (N por OT externa)
//   - Item de OT interna con código  →  "{codigoOTI}-{N}" (N por OT interna)
//   - Item ya con formato nuevo       →  saltado
//   - OT sin código `ot`              →  saltado (queda con nro_req viejo)
//
// El correlativo {N} cuenta el orden de aparición del nro_req dentro de la OT
// (el grupo creado primero queda como {OT}-1).
//
// Uso:
//   DATABASE_URL="..." npx tsx scripts/recodificar-reqs.ts            # dry-run
//   DATABASE_URL="..." npx tsx scripts/recodificar-reqs.ts --apply
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

interface GrupoReq {
  nroReqActual: string;
  otCodigo: string;
  parentKey: string; // "ext:{otId}" o "int:{otInternaId}"
  firstCreatedAt: Date;
  itemIds: number[];
}

async function main() {
  console.log(`Modo: ${APPLY ? "🔴 APPLY" : "🟡 DRY-RUN"}`);

  // 1. Cargar todos los items con su OT padre.
  const items = await prisma.oTRepuesto.findMany({
    select: {
      id: true,
      nro_req: true,
      ot_id: true,
      orden_trabajo_interna_id: true,
      createdAt: true,
      orden_trabajo: { select: { id: true, ot: true } },
      orden_trabajo_interna: { select: { id: true, ot: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`📄 Items totales: ${items.length}`);

  // 2. Agrupar por (parentKey, nro_req).
  const grupos = new Map<string, GrupoReq>();
  let saltadosSinReq = 0;
  let saltadosSinOTCodigo = 0;
  let saltadosYaFormatoNuevo = 0;

  for (const it of items) {
    if (!it.nro_req) {
      saltadosSinReq++;
      continue;
    }

    let parentKey: string;
    let otCodigo: string;
    if (it.ot_id != null) {
      // ot ahora es number — convertir a string para usar como código.
      const codigo = it.orden_trabajo?.ot != null ? String(it.orden_trabajo.ot) : null;
      if (!codigo) {
        saltadosSinOTCodigo++;
        continue;
      }
      parentKey = `ext:${it.ot_id}`;
      otCodigo = codigo;
    } else if (it.orden_trabajo_interna_id != null) {
      // ot interna ahora es number tras la migración a Int.
      const codigo = it.orden_trabajo_interna?.ot != null ? String(it.orden_trabajo_interna.ot) : null;
      if (!codigo) {
        saltadosSinOTCodigo++;
        continue;
      }
      parentKey = `int:${it.orden_trabajo_interna_id}`;
      otCodigo = codigo;
    } else {
      saltadosSinReq++;
      continue;
    }

    // Si el nro_req ya empieza con "{otCodigo}-" lo dejamos.
    if (it.nro_req.startsWith(`${otCodigo}-`)) {
      saltadosYaFormatoNuevo++;
      continue;
    }

    const groupKey = `${parentKey}|${it.nro_req}`;
    const g = grupos.get(groupKey);
    if (!g) {
      grupos.set(groupKey, {
        nroReqActual: it.nro_req,
        otCodigo,
        parentKey,
        firstCreatedAt: it.createdAt,
        itemIds: [it.id],
      });
    } else {
      g.itemIds.push(it.id);
      if (it.createdAt < g.firstCreatedAt) g.firstCreatedAt = it.createdAt;
    }
  }

  console.log(`\n📊 Resumen:`);
  console.log(`  - Items sin nro_req (saltados):            ${saltadosSinReq}`);
  console.log(`  - Items sin código de OT (saltados):       ${saltadosSinOTCodigo}`);
  console.log(`  - Items ya con formato nuevo (saltados):   ${saltadosYaFormatoNuevo}`);
  console.log(`  - Grupos REQ a renombrar:                  ${grupos.size}`);

  if (grupos.size === 0) {
    console.log("\n✓ Nada para renombrar.");
    return;
  }

  // 3. Por cada parentKey (OT), agrupar y asignar correlativo por orden de creación.
  // Necesitamos el max N actual por OT (puede haber grupos ya con formato nuevo).
  const porParent = new Map<string, GrupoReq[]>();
  for (const g of grupos.values()) {
    if (!porParent.has(g.parentKey)) porParent.set(g.parentKey, []);
    porParent.get(g.parentKey)!.push(g);
  }

  const plan: { groupKey: string; nroReqActual: string; nroReqNuevo: string; otCodigo: string; itemIds: number[] }[] = [];

  for (const [parentKey, lista] of porParent) {
    const otCodigo = lista[0].otCodigo;
    const isExterna = parentKey.startsWith("ext:");
    const idNum = Number(parentKey.split(":")[1]);

    // Cuántos correlativos {otCodigo}-N existen ya (para no colisionar).
    const yaExistentes = await prisma.oTRepuesto.findMany({
      where: {
        nro_req: { startsWith: `${otCodigo}-` },
        ...(isExterna ? { ot_id: idNum } : { orden_trabajo_interna_id: idNum }),
      },
      select: { nro_req: true },
      distinct: ["nro_req"],
    });
    let maxN = 0;
    for (const c of yaExistentes) {
      const n = parseInt((c.nro_req ?? "").substring(otCodigo.length + 1), 10);
      if (Number.isFinite(n) && n > maxN) maxN = n;
    }

    lista.sort((a, b) => a.firstCreatedAt.getTime() - b.firstCreatedAt.getTime());
    let n = maxN;
    for (const g of lista) {
      n++;
      plan.push({
        groupKey: `${parentKey}|${g.nroReqActual}`,
        nroReqActual: g.nroReqActual,
        nroReqNuevo: `${otCodigo}-${n}`,
        otCodigo,
        itemIds: g.itemIds,
      });
    }
  }

  console.log(`\n📝 Cambios planeados (primeros 30):`);
  for (const p of plan.slice(0, 30)) {
    console.log(`  ${p.nroReqActual.padEnd(20)} → ${p.nroReqNuevo.padEnd(15)}   (${p.itemIds.length} item${p.itemIds.length === 1 ? "" : "s"})`);
  }
  if (plan.length > 30) {
    console.log(`  ... y ${plan.length - 30} más.`);
  }

  if (!APPLY) {
    console.log(`\n🟡 DRY-RUN: no se aplicó nada. Para aplicar, corré con --apply`);
    return;
  }

  console.log(`\n🔴 Aplicando cambios...`);
  let ok = 0;
  let errs = 0;
  for (const p of plan) {
    try {
      await prisma.oTRepuesto.updateMany({
        where: { id: { in: p.itemIds } },
        data: { nro_req: p.nroReqNuevo },
      });
      ok++;
    } catch (e) {
      errs++;
      console.error(`✗ ${p.nroReqActual} → ${p.nroReqNuevo}:`, e instanceof Error ? e.message : e);
    }
  }
  console.log(`\n✓ Aplicado: ${ok} grupos renombrados, ${errs} errores.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().then(() => process.exit(1));
  });
