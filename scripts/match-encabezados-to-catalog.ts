/**
 * Matchea OperacionCodRep.trabajo → OperacionReparacion.codigo
 * por nombre + componente. Populariza operacion_reparacion_codigo.
 *
 * Reglas (conservadoras):
 *  - mismo componente_codigo
 *  - nombre catálogo empieza con trabajo (normalizados: lowercase + sin acentos + sin puntuación)
 *  - O bien, trabajo === nombre exacto
 * Deja NULL los que no matcheen (operaciones de flujo como "Desarmado", "Armado", "Evaluacion", etc.)
 * Idempotente: solo actualiza los que hoy están en NULL.
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const ops = await p.operacionReparacion.findMany({
    where: { activo: true },
    select: { codigo: true, nombre: true, componente_codigo: true, clasificacion: true },
  });
  const opsByComp = new Map<string, typeof ops>();
  for (const op of ops) {
    if (!op.componente_codigo) continue;
    const arr = opsByComp.get(op.componente_codigo) ?? [];
    arr.push(op);
    opsByComp.set(op.componente_codigo, arr);
  }

  const rows = await p.operacionCodRep.findMany({
    where: { operacion_reparacion_codigo: null },
    select: { operacion_cod_rep_id: true, trabajo: true, componente_codigo: true, cod_rep_codigo: true },
  });

  console.log(`Candidatos (sin match hoy): ${rows.length}`);
  let matched = 0;
  const matchCounts = new Map<string, number>();
  const unmatched = new Map<string, number>();

  for (const r of rows) {
    const trabajo = normalize(r.trabajo);
    if (trabajo.length < 4) continue;
    const candidates = opsByComp.get(r.componente_codigo) ?? [];
    const hit = candidates.find((c) => {
      const nom = normalize(c.nombre);
      return nom === trabajo || nom.startsWith(trabajo + " ");
    });
    if (hit) {
      await p.operacionCodRep.update({
        where: { operacion_cod_rep_id: r.operacion_cod_rep_id },
        data: { operacion_reparacion_codigo: hit.codigo },
      });
      matched++;
      matchCounts.set(hit.codigo, (matchCounts.get(hit.codigo) ?? 0) + 1);
    } else {
      const key = `${r.componente_codigo} :: ${r.trabajo}`;
      unmatched.set(key, (unmatched.get(key) ?? 0) + 1);
    }
  }

  console.log(`\n=== RESUMEN ===`);
  console.log(`  Matched: ${matched}`);
  console.log(`  Unmatched: ${rows.length - matched}`);
  console.log(`\nTop matches por código (cantidad de filas ligadas):`);
  const sorted = [...matchCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [codigo, count] of sorted.slice(0, 20)) {
    console.log(`  ${codigo.padEnd(12)} ${count}`);
  }
  console.log(`\nTop textos sin match (se quedan como trabajo libre):`);
  const sortedUn = [...unmatched.entries()].sort((a, b) => b[1] - a[1]);
  for (const [key, count] of sortedUn.slice(0, 20)) {
    console.log(`  ${key.padEnd(60)} ${count}`);
  }

  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
