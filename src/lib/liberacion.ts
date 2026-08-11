// Motor server-side de la liberación multi-nivel (esquema A/B/C).
// Reglas puras en src/lib/aprobacion-montos.ts; acá va lo que toca BD:
// leer las firmas de `liberacion_codigo` y estampar las que correspondan.
// SIEMPRE dentro de la transacción del endpoint que libera.
import { Prisma } from "@prisma/client";
import {
  estadoLiberacion, puedeFirmarNivel, nombreNivel, fmtUSD,
  type EstadoLiberacion, type NivelLiberacion, type TipoDocLiberacion,
} from "./aprobacion-montos";

export interface ResultadoFirma {
  // Estado DESPUÉS de estampar las firmas de esta llamada.
  estado: EstadoLiberacion;
  // Niveles que este usuario firmó en esta llamada (puede ser >1 si tiene
  // los roles de niveles consecutivos; vacío si no le tocaba ninguno).
  firmadosAhora: NivelLiberacion[];
}

// Firma, en orden secuencial, todos los niveles pendientes consecutivos cuyos
// roles tenga el usuario. No firma nada si el siguiente pendiente no le
// corresponde (la secuencia es estricta: nadie saltea al nivel anterior).
export async function firmarNiveles(
  tx: Prisma.TransactionClient,
  params: {
    tipo: TipoDocLiberacion;
    compraId?: number;
    otRepuestoId?: number;
    montoUSD: number;
    roles: string[];
    usuario: string;
    comentario?: string | null;
  },
): Promise<ResultadoFirma> {
  const { tipo, compraId, otRepuestoId, montoUSD, roles, usuario } = params;
  const whereDoc = tipo === "OC" ? { compra_id: compraId } : { ot_repuesto_id: otRepuestoId };

  const existentes = await tx.liberacionCodigo.findMany({
    where: whereDoc,
    select: { nivel: true },
  });
  const firmados = existentes.map((f) => f.nivel);
  const firmadosAhora: NivelLiberacion[] = [];

  let estado = estadoLiberacion(tipo, montoUSD, firmados);
  while (estado.siguiente && puedeFirmarNivel(tipo, estado.siguiente, roles)) {
    const nivel = estado.siguiente;
    await tx.liberacionCodigo.create({
      data: {
        ...(tipo === "OC" ? { compra_id: compraId! } : { ot_repuesto_id: otRepuestoId! }),
        nivel,
        liberado_por: usuario,
        comentario: params.comentario?.slice(0, 500) || null,
        monto_usd: montoUSD,
      },
    });
    firmados.push(nivel);
    firmadosAhora.push(nivel);
    estado = estadoLiberacion(tipo, montoUSD, firmados);
  }

  return { estado, firmadosAhora };
}

// Mensaje 403 cuando el usuario no puede firmar el siguiente nivel pendiente.
export function errorNivelNoAutorizado(
  tipo: TipoDocLiberacion,
  estado: EstadoLiberacion,
  montoUSD: number,
): string {
  const sig = estado.siguiente;
  if (!sig) return "El documento ya tiene todos los niveles liberados.";
  const doc = tipo === "OC" ? "Esta OC" : "Este requerimiento";
  const firmadas = estado.firmados.length > 0 ? ` Firmas previas: ${estado.firmados.join(", ")}.` : "";
  return (
    `${doc} (${fmtUSD(montoUSD)}) requiere los códigos de liberación ` +
    `${estado.requeridos.join(" → ")}. El siguiente pendiente es el nivel ${sig} ` +
    `(${nombreNivel(tipo, sig)}) y tu usuario no tiene ese rol.${firmadas}`
  );
}

// Borra las firmas de un documento (reset). Se usa al desaprobar/anular un
// req, al anular una OC, y cuando cambia el total de una OC aún pendiente
// (las firmas hechas con otro monto dejan de valer).
export async function resetLiberaciones(
  tx: Prisma.TransactionClient,
  params: { compraId?: number; otRepuestoId?: number; otRepuestoIds?: number[] },
): Promise<number> {
  const { compraId, otRepuestoId, otRepuestoIds } = params;
  const res = await tx.liberacionCodigo.deleteMany({
    where: compraId != null
      ? { compra_id: compraId }
      : otRepuestoIds
        ? { ot_repuesto_id: { in: otRepuestoIds } }
        : { ot_repuesto_id: otRepuestoId },
  });
  return res.count;
}
