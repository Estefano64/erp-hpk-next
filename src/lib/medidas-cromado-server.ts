// Lado servidor de las medidas de cromado (ver ./medidas-cromado).
//
// datos_formulario pesa cientos de kB por evaluación: NUNCA se trae entero.
// Postgres extrae solo las claves del vástago (diámetro B1-B3 X/Y y longitud
// de cromo) de la evaluación más reciente de cada OT.
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { PREFIJO_MODELO_EVALUACION, VAS } from "./evaluacion-campos";
import { esServicioCromado, observacionesConMedidas, textoMedidasCromado, type MedidasCromado } from "./medidas-cromado";

type Row = {
  id: number;
  ot_id: number;
  modelo_evaluacion: string;
  sistema_medicion: string;
  medidas: Record<string, unknown> | null;
};

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Medidas de cromado por OT (evaluación más reciente de cada una). */
export async function medidasCromadoPorOt(otIds: number[]): Promise<Map<number, MedidasCromado>> {
  const out = new Map<number, MedidasCromado>();
  const ids = [...new Set(otIds.filter((x) => Number.isInteger(x) && x > 0))];
  if (ids.length === 0) return out;

  const claveDiam = VAS.vas_dext.key;   // vas_dext → <p>_vas_dext_b1_x ...
  const claveLong = VAS.vas_lcro.key;   // vas_lcro → <p>_vas_lcro
  const patron = `^t[0-9]+_(${claveDiam}_${VAS.vas_dext.sufijo}[0-9]+_[xy]|${claveLong})$`;

  const rows = await prisma.$queryRaw<Row[]>`
    SELECT DISTINCT ON (e.ot_id)
      e.id, e.ot_id, e.modelo_evaluacion, e.sistema_medicion,
      (SELECT jsonb_object_agg(k, e.datos_formulario -> k)
         FROM jsonb_object_keys(e.datos_formulario) AS k
        WHERE k ~ ${patron}) AS medidas
    FROM evaluaciones_tecnicas e
    WHERE e.ot_id IN (${Prisma.join(ids)})
    ORDER BY e.ot_id, e.id DESC`;

  for (const r of rows) {
    const p = PREFIJO_MODELO_EVALUACION[r.modelo_evaluacion] ?? "t1";
    const m = r.medidas ?? {};
    const diametros: number[] = [];
    for (let i = 1; i <= (VAS.vas_dext.puntos ?? 3); i++) {
      for (const eje of ["x", "y"]) {
        const v = num(m[`${p}_${claveDiam}_${VAS.vas_dext.sufijo}${i}_${eje}`]);
        if (v != null) diametros.push(v);
      }
    }
    const longitud = num(m[`${p}_${claveLong}`]);
    if (diametros.length === 0 && longitud == null) continue;
    out.set(r.ot_id, {
      diametro_min: diametros.length ? Math.min(...diametros) : null,
      diametro_max: diametros.length ? Math.max(...diametros) : null,
      longitud_cromo: longitud,
      unidad: r.sistema_medicion === "Imperial" ? "in" : "mm",
      evaluacion_id: r.id,
    });
  }
  return out;
}

/**
 * Escribe/actualiza la línea "Medidas evaluación: ..." en las observaciones
 * de los SER de cromado de la OT. Se llama al crear requerimientos y al
 * guardar la evaluación. Solo SER sin OC y no anulados: una vez emitida la
 * OC el requerimiento ya viajó al proveedor y no se reescribe.
 * Devuelve cuántos SER se actualizaron. Nunca lanza (no debe romper el
 * guardado que la invoca).
 */
export async function sincronizarObservacionesCromado(otId: number, usuario?: string | null): Promise<number> {
  try {
    if (!Number.isInteger(otId) || otId <= 0) return 0;
    const sers = await prisma.oTRepuesto.findMany({
      where: {
        ot_id: otId,
        tipo_codigo: "SER",
        descripcion: { contains: "crom", mode: "insensitive" },
        po_id: null,
        NOT: { status_requerimiento_codigo: "ANULADO" },
      },
      select: { id: true, tipo_codigo: true, descripcion: true, observaciones: true },
    });
    const cromados = sers.filter((r) => esServicioCromado(r.tipo_codigo, r.descripcion));
    if (cromados.length === 0) return 0;
    const m = (await medidasCromadoPorOt([otId])).get(otId);
    if (!m) return 0;
    let n = 0;
    for (const r of cromados) {
      const nuevas = observacionesConMedidas(r.observaciones, m);
      if (nuevas === r.observaciones) continue;
      await prisma.oTRepuesto.update({ where: { id: r.id }, data: { observaciones: nuevas } });
      n++;
    }
    if (n > 0) {
      await prisma.oTHistorial.create({
        data: {
          ot_id: otId,
          tipo_operacion: "REQUERIMIENTO",
          descripcion: `Medidas de vástago de la evaluación copiadas a ${n} servicio(s) de cromado: ${textoMedidasCromado(m)}`,
          usuario: usuario || "sistema",
        },
      });
    }
    return n;
  } catch (error) {
    console.error("sincronizarObservacionesCromado error:", error);
    return 0;
  }
}
