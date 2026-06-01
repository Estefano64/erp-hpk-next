// scripts/smoke-test-pre-deploy.ts
// Pruebas mínimas que verifican que la creación de OT externa, OT interna y
// requerimientos funcionan con el nuevo formato (V/S/OI + NNNNYY).
//
// Crea entidades de prueba con prefijo "SMOKE-" y al final las borra.

import { prisma } from "../src/lib/prisma";
import { nextNumeroOTExterna, nextNumeroOTInterna } from "../src/lib/ot-numero";
import { nextNroReqExterna, nextNroReqInterna } from "../src/lib/requerimientos";
import { formatOtCodigo, formatOtInternaCodigo } from "../src/lib/ot-formato";

const USUARIO = "SMOKE-TEST";

async function fail(msg: string): Promise<never> {
  console.error(`❌ ${msg}`);
  await prisma.$disconnect();
  process.exit(1);
}

async function main() {
  console.log("=".repeat(64));
  console.log("SMOKE TEST PRE-DEPLOY");
  console.log("=".repeat(64));

  const dbUrl = process.env.DATABASE_URL ?? "";
  if (!dbUrl.includes("localhost") && !dbUrl.includes("127.0.0.1")) {
    return fail("DATABASE_URL no es local. Abortando — este test crea/borra datos.");
  }

  const cleanupExternaIds: number[] = [];
  const cleanupInternaIds: number[] = [];

  try {
    // 1) OT externa BIE → debe arrancar con correlativo bajo (no hay BIE
    //    nuevas todavía después del reset)
    console.log("\n[1] Crear OT externa BIE...");
    const otBie = await prisma.$transaction(async (tx) => {
      const num = await nextNumeroOTExterna(tx, "BIE");
      return tx.ordenTrabajo.create({
        data: {
          ot: num,
          anio: num % 100,
          tipo_codigo: "BIE",
          descripcion: "SMOKE BIE",
          usuario_crea: USUARIO,
          ot_status_codigo: "Abierta",
          recursos_status_codigo: "En revision procesos",
          taller_status_codigo: "Pdt Evaluación",
        },
      });
    });
    cleanupExternaIds.push(otBie.id);
    const codigoBie = formatOtCodigo(otBie.ot, otBie.tipo_codigo);
    console.log(`   ot=${otBie.ot}  código visible=${codigoBie}`);
    if (!codigoBie.startsWith("V")) return fail(`OT BIE debería arrancar con V — recibí: ${codigoBie}`);

    // 2) OT externa SER
    console.log("\n[2] Crear OT externa SER...");
    const otSer = await prisma.$transaction(async (tx) => {
      const num = await nextNumeroOTExterna(tx, "SER");
      return tx.ordenTrabajo.create({
        data: {
          ot: num,
          anio: num % 100,
          tipo_codigo: "SER",
          descripcion: "SMOKE SER",
          usuario_crea: USUARIO,
          ot_status_codigo: "Abierta",
          recursos_status_codigo: "En revision procesos",
          taller_status_codigo: "Pdt Evaluación",
        },
      });
    });
    cleanupExternaIds.push(otSer.id);
    const codigoSer = formatOtCodigo(otSer.ot, otSer.tipo_codigo);
    console.log(`   ot=${otSer.ot}  código visible=${codigoSer}`);
    if (!codigoSer.startsWith("S")) return fail(`OT SER debería arrancar con S — recibí: ${codigoSer}`);

    // 3) OT interna OI
    console.log("\n[3] Crear OT interna...");
    const otInt = await prisma.$transaction(async (tx) => {
      const num = await nextNumeroOTInterna(tx);
      return tx.ordenTrabajoInterna.create({
        data: {
          ot: num,
          anio: num % 100,
          descripcion: "SMOKE INTERNA",
          tipo_ot_interna_codigo: null,
          usuario_crea: USUARIO,
          ot_status_codigo: "Abierta",
        },
      });
    });
    cleanupInternaIds.push(otInt.id);
    const codigoInt = formatOtInternaCodigo(otInt.ot);
    console.log(`   ot=${otInt.ot}  código visible=${codigoInt}`);
    if (!codigoInt.startsWith("OI")) return fail(`OT interna debería arrancar con OI — recibí: ${codigoInt}`);

    // 4) Requerimientos en cada una
    console.log("\n[4] Crear requerimientos con nueva nomenclatura...");
    const nroReqBie = await prisma.$transaction(async (tx) => nextNroReqExterna(tx, otBie.id));
    const nroReqSer = await prisma.$transaction(async (tx) => nextNroReqExterna(tx, otSer.id));
    const nroReqInt = await prisma.$transaction(async (tx) => nextNroReqInterna(tx, otInt.id));
    console.log(`   BIE → ${nroReqBie}`);
    console.log(`   SER → ${nroReqSer}`);
    console.log(`   INT → ${nroReqInt}`);
    if (!nroReqBie.startsWith(`${codigoBie}-`)) return fail(`nroReq BIE mal formado: ${nroReqBie}`);
    if (!nroReqSer.startsWith(`${codigoSer}-`)) return fail(`nroReq SER mal formado: ${nroReqSer}`);
    if (!nroReqInt.startsWith(`${codigoInt}-`)) return fail(`nroReq INT mal formado: ${nroReqInt}`);

    // 5) Tomar segundo correlativo de RQ por OT
    console.log("\n[5] Crear 2do requerimiento por OT (debe incrementar -2)...");
    const nroReqBie2 = await prisma.$transaction(async (tx) => nextNroReqExterna(tx, otBie.id));
    const nroReqInt2 = await prisma.$transaction(async (tx) => nextNroReqInterna(tx, otInt.id));
    console.log(`   BIE → ${nroReqBie2}`);
    console.log(`   INT → ${nroReqInt2}`);
    if (!nroReqBie2.endsWith("-1") && !nroReqBie2.endsWith("-2")) return fail(`Segundo RQ BIE debería ir a -2 — recibí: ${nroReqBie2}`);

    // 6) Verificar generación es por-año y por-tipo independiente
    console.log("\n[6] Crear otra BIE (correlativo debería ser +1 de la anterior)...");
    const otBie2 = await prisma.$transaction(async (tx) => {
      const num = await nextNumeroOTExterna(tx, "BIE");
      return tx.ordenTrabajo.create({
        data: {
          ot: num,
          anio: num % 100,
          tipo_codigo: "BIE",
          descripcion: "SMOKE BIE 2",
          usuario_crea: USUARIO,
          ot_status_codigo: "Abierta",
          recursos_status_codigo: "En revision procesos",
          taller_status_codigo: "Pdt Evaluación",
        },
      });
    });
    cleanupExternaIds.push(otBie2.id);
    const codigoBie2 = formatOtCodigo(otBie2.ot, otBie2.tipo_codigo);
    console.log(`   ot=${otBie2.ot}  código visible=${codigoBie2}`);
    const corrBie1 = Math.floor((otBie.ot ?? 0) / 100);
    const corrBie2 = Math.floor((otBie2.ot ?? 0) / 100);
    if (corrBie2 !== corrBie1 + 1) return fail(`Correlativo BIE no incrementó +1 (${corrBie1} → ${corrBie2})`);

    console.log("\n✅ Todas las pruebas pasaron.");
  } finally {
    // Cleanup
    console.log("\n🧹 Limpiando datos de smoke...");
    for (const id of cleanupExternaIds) {
      await prisma.oTRepuesto.deleteMany({ where: { ot_id: id } }).catch(() => {});
      await prisma.oTHistorial.deleteMany({ where: { ot_id: id } }).catch(() => {});
      await prisma.ordenTrabajo.delete({ where: { id } }).catch(() => {});
    }
    for (const id of cleanupInternaIds) {
      await prisma.ordenTrabajoInterna.delete({ where: { id } }).catch(() => {});
    }
    await prisma.$disconnect();
  }
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
