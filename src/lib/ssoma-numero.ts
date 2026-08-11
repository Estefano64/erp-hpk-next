import { Prisma } from "@prisma/client";

// Correlativos del módulo SSOMA - SIG. Mismo patrón que nextNumeroCorrectivo
// (src/lib/ot-numero.ts): contador per-año y per-formato, protegido con
// pg_advisory_xact_lock para que dos POSTs paralelos no repitan número.
// TODAS estas funciones deben llamarse dentro de prisma.$transaction — el
// lock se libera recién en COMMIT/ROLLBACK.

async function lockNumeroSsoma(
  tx: Prisma.TransactionClient,
  scope: string,
): Promise<void> {
  await tx.$executeRawUnsafe(
    `SELECT pg_advisory_xact_lock(hashtext($1))`,
    `ssoma-numero:${scope}`,
  );
}

function maxNumero(candidatos: { numero: number | null }[]): number {
  let maxN = 0;
  for (const { numero } of candidatos) {
    if (numero != null && numero > maxN) maxN = numero;
  }
  return maxN;
}

// Próximo correlativo de Reporte de Seguridad (RS-NNNN-YY).
export async function nextNumeroReporteSeguridad(
  tx: Prisma.TransactionClient,
): Promise<{ numero: number; anio: number }> {
  const anio = new Date().getFullYear() % 100;
  await lockNumeroSsoma(tx, `rs:${anio}`);
  const candidatos = await tx.reporteSeguridad.findMany({
    where: { anio, activo: true },
    select: { numero: true },
  });
  return { numero: maxNumero(candidatos) + 1, anio };
}

// Próximo correlativo de Salida No Conforme (SNC-NNNN-YY).
export async function nextNumeroSalidaNoConforme(
  tx: Prisma.TransactionClient,
): Promise<{ numero: number; anio: number }> {
  const anio = new Date().getFullYear() % 100;
  await lockNumeroSsoma(tx, `snc:${anio}`);
  const candidatos = await tx.salidaNoConforme.findMany({
    where: { anio, activo: true },
    select: { numero: true },
  });
  return { numero: maxNumero(candidatos) + 1, anio };
}

// Próximo correlativo de SAC (SAC-NNNN-YY).
export async function nextNumeroSac(
  tx: Prisma.TransactionClient,
): Promise<{ numero: number; anio: number }> {
  const anio = new Date().getFullYear() % 100;
  await lockNumeroSsoma(tx, `sac:${anio}`);
  const candidatos = await tx.solicitudAccionCorrectiva.findMany({
    where: { anio, activo: true },
    select: { numero: true },
  });
  return { numero: maxNumero(candidatos) + 1, anio };
}
