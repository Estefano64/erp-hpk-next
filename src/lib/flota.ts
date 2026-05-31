import { prisma } from "@/lib/prisma";

/**
 * Asegura que exista la flota con ese código; si no existe, la crea al vuelo
 * (codigo = nombre, como el resto del catálogo, p.ej. "374DL"). Devuelve el
 * código normalizado (trim + máx 20 chars) o null si vino vacío.
 *
 * Permite que el formulario de Código Reparable acepte una flota escrita a mano
 * sin tener que darla de alta antes en el catálogo de Flotas.
 */
export async function ensureFlotaCodigo(raw: string | null | undefined): Promise<string | null> {
  const c = (raw ?? "").trim().slice(0, 20);
  if (!c) return null;
  await prisma.flotaEquipo.upsert({
    where: { codigo: c },
    update: {},
    create: { codigo: c, nombre: c, activo: true },
  });
  return c;
}
