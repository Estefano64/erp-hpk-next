/**
 * Stress test: lanza N transacciones concurrentes que llaman nextNroReq
 * y crean un OTRepuesto con ese nro_req. Sin lock, varias colisionan.
 * Con lock, todas obtienen nros únicos secuenciales.
 *
 * Uso: npx tsx scripts/test-nro-req-atomic.ts
 */
import { PrismaClient } from "@prisma/client";
import { nextNroReqExterna } from "../src/lib/requerimientos";

const prisma = new PrismaClient();
const CONCURRENCY = 20;

async function main() {
  console.log(`\n=== Stress test: ${CONCURRENCY} requests concurrentes ===\n`);

  // Setup: necesito una OT para crear los repuestos
  const cliente = await prisma.cliente.findFirst();
  const codRep = await prisma.codigoReparacion.findFirst();
  if (!cliente || !codRep) throw new Error("Falta cliente o codRep");

  const ot = await prisma.ordenTrabajo.create({
    data: {
      ot: "STRESS-NRO-REQ",
      id_cliente: cliente.cliente_id,
      id_cod_rep: codRep.cod_rep_id,
      usuario_crea: "stress-test",
    },
  });

  // Lanzar N transacciones en paralelo
  const promesas = Array.from({ length: CONCURRENCY }, (_, i) =>
    prisma.$transaction(async (tx) => {
      const nro = await nextNroReqExterna(tx, ot.id);
      await tx.oTRepuesto.create({
        data: {
          ot_id: ot.id,
          tipo_codigo: "MAC",
          cantidad: 1,
          descripcion: `stress-${i}`,
          nro_req: nro,
          item_req: 1,
          status_requerimiento_codigo: "BORRADOR",
          usuario_solicita: "stress",
        },
      });
      return nro;
    })
  );

  const resultados = await Promise.all(promesas);
  const unicos = new Set(resultados);

  console.log("nros generados:", resultados.sort().join(", "));
  console.log(`Únicos: ${unicos.size} / Total: ${resultados.length}`);

  const ok = unicos.size === resultados.length;
  console.log(ok ? "\n\x1b[32m✓ Todos los nro_req son únicos\x1b[0m" : "\n\x1b[31m✗ Hubo colisiones\x1b[0m");

  // Cleanup
  await prisma.ordenTrabajo.delete({ where: { id: ot.id } });
  console.log("Cleanup OK\n");

  if (!ok) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
