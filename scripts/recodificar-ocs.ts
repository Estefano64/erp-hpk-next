// Renombra el numero_po de las OCs existentes para que sigan el formato
// nuevo {códigoOT}-{N} cuando la OC pertenece a una sola OT externa con código.
//
// Reglas (mismas que /api/compras/crear-oc/route.ts):
//   - 1 sola OT externa con código  → "{codigoOT}-{N}" (N = correlativo por OT, por fecha de creación)
//   - OC multi-OT externa             → se deja como está (formato viejo D{YY}{NNNN})
//   - OC con items de OT interna      → se deja como está
//   - OT externa sin código `ot`      → se deja como está
//
// El script actualiza también `ot_repuestos.nro_oc` (cache del numero_po en los
// items de requerimiento) y deja un mensaje en `ot_historial` por cada OT
// afectada para que quede traza.
//
// Uso:
//   DATABASE_URL="..." npx tsx scripts/recodificar-ocs.ts            # dry-run (no aplica)
//   DATABASE_URL="..." npx tsx scripts/recodificar-ocs.ts --apply    # aplica los cambios
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

interface PlanItem {
  compraId: number;
  numeroPoActual: string;
  numeroPoNuevo: string;
  otCodigo: string;
  fechaCreacion: Date;
}

async function main() {
  console.log(`Modo: ${APPLY ? "🔴 APPLY (escribe en BD)" : "🟡 DRY-RUN (no aplica nada)"}`);

  // 1. Cargar todas las compras con sus items (ot_id externa + interna).
  const compras = await prisma.compra.findMany({
    select: {
      id: true,
      numero_po: true,
      createdAt: true,
      ot_repuestos: {
        select: {
          id: true,
          ot_id: true,
          orden_trabajo_interna_id: true,
          orden_trabajo: { select: { ot: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`📄 Compras totales: ${compras.length}`);

  // 2. Para cada compra, decidir si aplica el formato {OT}-{N}.
  const candidatas: { compraId: number; numeroPoActual: string; otCodigo: string; createdAt: Date }[] = [];
  let skipMultiOT = 0;
  let skipConInterna = 0;
  let skipSinCodigo = 0;
  let skipSinItems = 0;
  let skipYaTieneFormato = 0;

  for (const c of compras) {
    if (c.ot_repuestos.length === 0) {
      skipSinItems++;
      continue;
    }
    // `ot` (externa) ahora es number — convertir a string para set/comparación.
    const otsExternasUnicas = new Set(
      c.ot_repuestos.map((r) => r.orden_trabajo?.ot != null ? String(r.orden_trabajo.ot) : null).filter((v): v is string => !!v),
    );
    const hayItemsInternos = c.ot_repuestos.some((r) => r.orden_trabajo_interna_id != null);
    const otsExternasSinCodigo = c.ot_repuestos.some(
      (r) => r.ot_id != null && r.orden_trabajo?.ot == null,
    );

    if (hayItemsInternos) {
      skipConInterna++;
      continue;
    }
    if (otsExternasUnicas.size !== 1) {
      skipMultiOT++;
      continue;
    }
    if (otsExternasSinCodigo) {
      skipSinCodigo++;
      continue;
    }
    const otCodigo = [...otsExternasUnicas][0]!;

    // Si el numero_po ya empieza con "{otCodigo}-" lo dejamos.
    if (c.numero_po.startsWith(`${otCodigo}-`)) {
      skipYaTieneFormato++;
      continue;
    }

    candidatas.push({
      compraId: c.id,
      numeroPoActual: c.numero_po,
      otCodigo,
      createdAt: c.createdAt,
    });
  }

  // 3. Agrupar candidatas por OT y asignar correlativo por fecha de creación.
  const porOT = new Map<string, typeof candidatas>();
  for (const c of candidatas) {
    if (!porOT.has(c.otCodigo)) porOT.set(c.otCodigo, []);
    porOT.get(c.otCodigo)!.push(c);
  }

  const plan: PlanItem[] = [];
  for (const [otCodigo, lista] of porOT) {
    // Necesitamos el max N actual (por si alguna OC del nuevo flujo ya usó {OT}-1)
    const yaExistentes = await prisma.compra.findMany({
      where: { numero_po: { startsWith: `${otCodigo}-` } },
      select: { numero_po: true },
    });
    let maxN = 0;
    for (const c of yaExistentes) {
      const n = parseInt(c.numero_po.substring(otCodigo.length + 1), 10);
      if (Number.isFinite(n) && n > maxN) maxN = n;
    }
    // Ordenar candidatas por fecha de creación
    lista.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    let n = maxN;
    for (const c of lista) {
      n++;
      plan.push({
        compraId: c.compraId,
        numeroPoActual: c.numeroPoActual,
        numeroPoNuevo: `${otCodigo}-${n}`,
        otCodigo,
        fechaCreacion: c.createdAt,
      });
    }
  }

  // 4. Reportar.
  console.log(`\n📊 Resumen:`);
  console.log(`  - Saltadas (sin items):              ${skipSinItems}`);
  console.log(`  - Saltadas (con OT interna):         ${skipConInterna}`);
  console.log(`  - Saltadas (multi-OT externa):       ${skipMultiOT}`);
  console.log(`  - Saltadas (OT externa sin código):  ${skipSinCodigo}`);
  console.log(`  - Saltadas (ya tienen formato nuevo): ${skipYaTieneFormato}`);
  console.log(`  - A renombrar:                       ${plan.length}`);

  if (plan.length === 0) {
    console.log("\n✓ Nada para renombrar.");
    return;
  }

  console.log(`\n📝 Cambios planeados (primeros 30 por orden de OT):`);
  for (const p of plan.slice(0, 30)) {
    console.log(`  ${p.numeroPoActual.padEnd(15)} → ${p.numeroPoNuevo}   (OT ${p.otCodigo}, creada ${p.fechaCreacion.toISOString().slice(0, 10)})`);
  }
  if (plan.length > 30) {
    console.log(`  ... y ${plan.length - 30} más.`);
  }

  if (!APPLY) {
    console.log(`\n🟡 DRY-RUN: no se aplicó nada. Para aplicar, corré con --apply`);
    return;
  }

  // 5. Aplicar en transacción (una por compra para no bloquear demasiado).
  console.log(`\n🔴 Aplicando cambios...`);
  let ok = 0;
  let errs = 0;
  for (const p of plan) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.compra.update({
          where: { id: p.compraId },
          data: { numero_po: p.numeroPoNuevo },
        });
        // Sincronizar el cache nro_oc en los items.
        await tx.oTRepuesto.updateMany({
          where: { po_id: p.compraId },
          data: { nro_oc: p.numeroPoNuevo },
        });
        // Trazas en historial de la OT afectada.
        // ot ahora es INT — convertir.
        const otNumLookup = parseInt(p.otCodigo, 10);
        const otRow = Number.isFinite(otNumLookup)
          ? await tx.ordenTrabajo.findFirst({ where: { ot: otNumLookup }, select: { id: true } })
          : null;
        if (otRow) {
          await tx.oTHistorial.create({
            data: {
              ot_id: otRow.id,
              tipo_operacion: "Otro",
              descripcion: `OC ${p.numeroPoActual} renombrada a ${p.numeroPoNuevo} (migración formato {OT}-{N})`,
              usuario: "seed-recodificar-ocs",
              datos_adicionales: JSON.stringify({ anterior: p.numeroPoActual, nuevo: p.numeroPoNuevo }),
            },
          });
        }
      });
      ok++;
    } catch (e) {
      errs++;
      console.error(`✗ Error renombrando compra ${p.compraId} (${p.numeroPoActual} → ${p.numeroPoNuevo}):`, e instanceof Error ? e.message : e);
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        console.error(`  (P2002: el numero_po nuevo ya existe — colisión)`);
      }
    }
  }
  console.log(`\n✓ Aplicado: ${ok} renombradas, ${errs} errores.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().then(() => process.exit(1));
  });
