// Resuelve la ruta pública de la imagen de firma de un usuario.
// Convención: el archivo en /public/firmas/ se llama exactamente como el campo
// `usuario.nombre`, con extensión .png o .jpeg.
//
// Importante: este módulo solo se usa en el servidor (lee el filesystem) y
// devuelve una ruta absoluta del proyecto (`/firmas/...`) que el navegador
// resuelve contra /public/.

import { existsSync } from "fs";
import path from "path";

// Mantener sincronizado con los archivos reales en public/firmas/ y con los
// usuarios creados en prisma/seed.ts (sección "Usuarios con firma").
const FIRMAS_CONOCIDAS: Record<string, string> = {
  "Antonio Zumaeta Mendoza": "Antonio Zumaeta Mendoza.png",
  "Carlos Viña Miranda": "Carlos Viña Miranda.png",
  "Diego Jaime Monge": "Diego Jaime Monge.jpeg",
  "Juan Diego Muñoz Manrique": "Juan Diego Muñoz Manrique.jpeg",
  "Miriam Ccanahuire": "Miriam Ccanahuire.png",
};

// Devuelve la ruta pública (`/firmas/<archivo>`) de la firma del usuario, o
// null si el nombre no tiene firma registrada. Verifica además que el archivo
// exista en disco para fallar rápido si hay drift entre el código y los
// archivos reales.
export function rutaFirmaDe(nombre: string | null | undefined): string | null {
  if (!nombre) return null;
  const archivo = FIRMAS_CONOCIDAS[nombre.trim()];
  if (!archivo) return null;
  const absPath = path.join(process.cwd(), "public", "firmas", archivo);
  if (!existsSync(absPath)) return null;
  return `/firmas/${archivo}`;
}
