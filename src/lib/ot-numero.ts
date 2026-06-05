import { Prisma } from "@prisma/client";

// ─── Generación de números de OT ──────────────────────────────────────────
// Formato común: NNNNYY (correlativo * 100 + año-2-dígitos), almacenado como
// INTEGER en BD. La visualización (prefijo V/S/OI según tipo) se construye en
// la app vía src/lib/ot-formato.ts.
//
// Los contadores son INDEPENDIENTES por tipo y por año:
//   - externas REP: comparte con tipo_codigo NULL (históricas BDU)
//   - externas BIE: contador propio
//   - externas SER: contador propio
//   - internas    : contador propio (no tiene tipo_codigo)
//
// Para evitar race conditions usamos pg_advisory_xact_lock con un key
// derivado del scope (tipo+año). Dos POSTs paralelos del mismo tipo esperan
// uno al otro antes de calcular max+1.

// MIN reservado solo para REP/null (las históricas se importarán con códigos
// menores y los nuevos arrancan en el siguiente). BIE/SER/INT no aplican.
const MIN_CORRELATIVO_REP_POR_ANIO: Record<string, number> = {
  "26": 3905,
};

async function lockNumeroOT(
  tx: Prisma.TransactionClient,
  scope: string,
): Promise<void> {
  await tx.$executeRawUnsafe(
    `SELECT pg_advisory_xact_lock(hashtext($1))`,
    `ot-numero:${scope}`,
  );
}

/**
 * Próximo número de OT externa según tipo_codigo. Devuelve el código en
 * formato NNNNYY (Int). Debe llamarse dentro de una transacción Prisma para
 * que el lock cierre al hacer COMMIT/ROLLBACK.
 */
export async function nextNumeroOTExterna(
  tx: Prisma.TransactionClient,
  tipoCodigo: string | null | undefined,
): Promise<number> {
  const year2 = new Date().getFullYear() % 100;
  const yyKey = String(year2).padStart(2, "0");

  // Scope del contador: tipo + año. Cada tipo lleva su propio correlativo
  // dentro de su año.
  const tipoScope = tipoCodigo === "BIE" || tipoCodigo === "SER" ? tipoCodigo : "REP";
  const scope = `externa:${tipoScope}:${yyKey}`;
  await lockNumeroOT(tx, scope);

  const tipoWhere =
    tipoCodigo === "BIE"
      ? { tipo_codigo: "BIE" }
      : tipoCodigo === "SER"
        ? { tipo_codigo: "SER" }
        : { OR: [{ tipo_codigo: "REP" }, { tipo_codigo: null }] };

  const candidatos = await tx.ordenTrabajo.findMany({
    where: { ot: { not: null, lt: 1_000_000 }, activo: true, ...tipoWhere },
    select: { ot: true },
  });

  let maxN = 0;
  for (const { ot } of candidatos) {
    if (ot == null) continue;
    if (ot % 100 !== year2) continue;
    const n = Math.floor(ot / 100);
    if (n > maxN) maxN = n;
  }

  const aplicaMin = tipoScope === "REP";
  const minN = aplicaMin ? (MIN_CORRELATIVO_REP_POR_ANIO[yyKey] ?? 0) : 0;
  const next = Math.max(maxN, minN) + 1;
  return next * 100 + year2;
}

/**
 * Próximo número de OT interna (formato Int NNNNYY). Per-año, sin distinción
 * de tipo. Debe llamarse dentro de una transacción Prisma.
 */
export async function nextNumeroOTInterna(
  tx: Prisma.TransactionClient,
): Promise<number> {
  const year2 = new Date().getFullYear() % 100;
  const yyKey = String(year2).padStart(2, "0");
  const scope = `interna:${yyKey}`;
  await lockNumeroOT(tx, scope);

  const candidatos = await tx.ordenTrabajoInterna.findMany({
    where: { ot: { not: null, lt: 1_000_000 }, activo: true },
    select: { ot: true },
  });

  let maxN = 0;
  for (const { ot } of candidatos) {
    if (ot == null) continue;
    if (ot % 100 !== year2) continue;
    const n = Math.floor(ot / 100);
    if (n > maxN) maxN = n;
  }
  const next = maxN + 1;
  return next * 100 + year2;
}

/**
 * Próximo correlativo de reporte correctivo (per-año). Devuelve { numero, anio }
 * donde `numero` es el correlativo crudo (1..9999) y `anio` los dos dígitos del
 * año. El código visible se construye como `RC-NNNN-YY`. Debe llamarse dentro
 * de una transacción Prisma.
 */
export async function nextNumeroCorrectivo(
  tx: Prisma.TransactionClient,
): Promise<{ numero: number; anio: number }> {
  const year2 = new Date().getFullYear() % 100;
  const yyKey = String(year2).padStart(2, "0");
  const scope = `correctivo:${yyKey}`;
  await lockNumeroOT(tx, scope);

  const candidatos = await tx.reporteCorrectivo.findMany({
    where: { anio: year2, activo: true },
    select: { numero: true },
  });

  let maxN = 0;
  for (const { numero } of candidatos) {
    if (numero != null && numero > maxN) maxN = numero;
  }
  return { numero: maxN + 1, anio: year2 };
}
