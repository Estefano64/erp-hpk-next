// Migra las fotos legacy de las evaluaciones técnicas: las que están como
// `{ name, data: "data:image/jpeg;base64,..." }` inline en
// `EvaluacionTecnica.datos_formulario` se suben a Cloudflare R2 y el JSON
// se reemplaza por `{ name, r2_key, tamano }`.
//
// Modo:
//   npx tsx scripts/migrar-fotos-evaluacion-a-r2.ts            # dry-run (no escribe nada)
//   npx tsx scripts/migrar-fotos-evaluacion-a-r2.ts --apply    # aplica
//
// Diseño:
//   - Idempotente: si una foto ya tiene `r2_key` (no `data`), se omite.
//   - Por evaluación: procesa todas las fotos de una eval, sube cada una,
//     y solo si TODAS suben OK actualiza el JSON (todo-o-nada por eval).
//     Si alguna falla, deja la eval intacta y registra el error.
//   - Path en R2: mismo que el flujo en vivo
//     (`ordenes-trabajo/<otCodigo>/evaluaciones/fotos/<timestamp-uuid-name>`).
//   - No borra los `data` originales si --apply falla; el reintento es seguro.
import { prisma } from "../src/lib/prisma";
import { generateUploadUrl } from "../src/lib/r2-helpers";
import { R2Keys, otCodigoFor } from "../src/lib/r2";

const APPLY = process.argv.includes("--apply");

interface FotoLegacy {
  name?: string;
  data?: string;
  r2_key?: string;
  tamano?: number;
}

function isDataUrl(s: unknown): s is string {
  return typeof s === "string" && s.startsWith("data:");
}

// data:image/jpeg;base64,XXX → { mime, bytes }
function decodeDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } | null {
  // No usamos flag /s (requiere ES2018+); el `[\s\S]*` matchea tanto
  // newlines como cualquier char (compat con el target del tsconfig).
  const m = dataUrl.match(/^data:([^;,]+)(;base64)?,([\s\S]*)$/);
  if (!m) return null;
  const mime = m[1];
  const isBase64 = !!m[2];
  const payload = m[3];
  const bytes = isBase64
    ? Uint8Array.from(Buffer.from(payload, "base64"))
    : new TextEncoder().encode(decodeURIComponent(payload));
  return { mime, bytes };
}

function extDeMime(mime: string): string {
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  return ".bin";
}

async function subirABuffer(uploadUrl: string, mime: string, bytes: Uint8Array): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mime },
    body: bytes as unknown as BodyInit,
  });
  if (!res.ok) throw new Error(`R2 PUT ${res.status}: ${await res.text().catch(() => "")}`);
}

async function main() {
  console.log(`Modo: ${APPLY ? "APPLY (escribe a BD + R2)" : "DRY-RUN (no escribe)"}\n`);

  // Solo evals que tienen datos_formulario no vacío. No filtramos por
  // contenido — recorremos el JSON en TS.
  const evals = await prisma.evaluacionTecnica.findMany({
    select: {
      id: true,
      ot_id: true,
      datos_formulario: true,
      orden_trabajo: { select: { id: true, ot: true } },
    },
    orderBy: { id: "asc" },
  });

  let evalsConFotos = 0;
  let fotosLegacy = 0;
  let fotosMigradas = 0;
  let fotosFallidas = 0;
  let evalsActualizadas = 0;

  for (const ev of evals) {
    const datos = (ev.datos_formulario as Record<string, unknown>) || {};
    // Encontrar todas las claves `*_imagenes` con fotos legacy (data inline).
    const cambios: Array<{ key: string; nuevas: FotoLegacy[] }> = [];
    let totalLegacyEsta = 0;

    for (const [k, v] of Object.entries(datos)) {
      if (!k.endsWith("_imagenes") || !Array.isArray(v)) continue;
      const arr = v as FotoLegacy[];
      const tieneLegacy = arr.some((f) => isDataUrl(f?.data));
      if (!tieneLegacy) continue;
      totalLegacyEsta += arr.filter((f) => isDataUrl(f?.data)).length;
      cambios.push({ key: k, nuevas: [...arr] });
    }

    if (cambios.length === 0) continue;
    evalsConFotos++;
    fotosLegacy += totalLegacyEsta;

    console.log(`Eval ${ev.id} (OT ${ev.orden_trabajo.ot ?? "?"} id=${ev.ot_id}): ${totalLegacyEsta} foto(s) legacy`);

    if (!APPLY) continue;

    // Procesar cada bloque secuencialmente para no saturar R2.
    const folderPrefix = `${R2Keys.otEvaluacion(otCodigoFor(ev.orden_trabajo))}/fotos`;
    let evalOk = true;

    for (const bloque of cambios) {
      for (let i = 0; i < bloque.nuevas.length; i++) {
        const foto = bloque.nuevas[i];
        if (!isDataUrl(foto.data)) continue; // ya migrada
        const dec = decodeDataUrl(foto.data!);
        if (!dec) {
          console.warn(`  ⚠ Eval ${ev.id} foto ${bloque.key}[${i}]: data URL inválida — se omite`);
          fotosFallidas++;
          evalOk = false;
          continue;
        }
        try {
          const fileName = foto.name?.replace(/\.[^.]+$/, "") + extDeMime(dec.mime) || `foto-legacy${extDeMime(dec.mime)}`;
          const { uploadUrl, key } = await generateUploadUrl({
            folderPrefix,
            fileName,
            fileType: dec.mime,
          });
          await subirABuffer(uploadUrl, dec.mime, dec.bytes);
          bloque.nuevas[i] = {
            name: foto.name ?? fileName,
            r2_key: key,
            tamano: dec.bytes.byteLength,
          };
          fotosMigradas++;
          console.log(`  ✓ ${bloque.key}[${i}] → ${key} (${(dec.bytes.byteLength / 1024).toFixed(1)} KB)`);
        } catch (e) {
          console.error(`  ✗ Eval ${ev.id} foto ${bloque.key}[${i}] falló:`, e instanceof Error ? e.message : e);
          fotosFallidas++;
          evalOk = false;
        }
      }
    }

    // Solo actualizar el JSON si TODAS las fotos de esta eval subieron OK
    // (todo-o-nada por eval — evita estado parcialmente migrado).
    if (evalOk) {
      const nuevoDatos = { ...datos };
      for (const bloque of cambios) {
        nuevoDatos[bloque.key] = bloque.nuevas;
      }
      await prisma.evaluacionTecnica.update({
        where: { id: ev.id },
        data: { datos_formulario: nuevoDatos as object },
      });
      evalsActualizadas++;
    } else {
      console.warn(`  Eval ${ev.id}: alguna foto falló — JSON NO actualizado (las exitosas quedan en R2 huérfanas, requeren rerun)`);
    }
  }

  console.log("\n────────────────────────");
  console.log(`Evaluaciones con fotos legacy : ${evalsConFotos}`);
  console.log(`Total fotos legacy detectadas : ${fotosLegacy}`);
  if (APPLY) {
    console.log(`Fotos migradas a R2           : ${fotosMigradas}`);
    console.log(`Fotos fallidas                : ${fotosFallidas}`);
    console.log(`Evaluaciones actualizadas     : ${evalsActualizadas}`);
  } else {
    console.log(`\n(dry-run) re-ejecutá con --apply para migrar.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
