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

// Alias para nombres "genéricos" o de cuentas técnicas. Estos NO son personas
// reales pero las OCs viejas se generaron con esos nombres como
// `usuario_solicita`. Por convención HPK la elaboradora histórica de OCs es
// Miriam — su firma se usa como fallback cuando el nombre real se perdió.
// Si el usuario quiere otro fallback, basta editar este map.
const ALIAS_ELABORADOR: Record<string, string> = {
  "Logistica": "Miriam Ccanahuire",
  "logistica": "Miriam Ccanahuire",
  "LOGISTICA": "Miriam Ccanahuire",
  "sistema": "Miriam Ccanahuire",
  "import-quellaveco": "Miriam Ccanahuire",
};

// Devuelve la ruta pública (`/firmas/<archivo>`) de la firma del usuario, o
// null si el nombre no tiene firma registrada. Verifica además que el archivo
// exista en disco para fallar rápido si hay drift entre el código y los
// archivos reales.
export function rutaFirmaDe(nombre: string | null | undefined): string | null {
  if (!nombre) return null;
  const t = nombre.trim();
  // Match directo, sino probar el alias (para cuentas genéricas como
  // "Logistica" → Miriam Ccanahuire).
  const archivo = FIRMAS_CONOCIDAS[t] ?? FIRMAS_CONOCIDAS[ALIAS_ELABORADOR[t] ?? ""];
  if (!archivo) return null;
  const absPath = path.join(process.cwd(), "public", "firmas", archivo);
  if (!existsSync(absPath)) return null;
  return `/firmas/${archivo}`;
}

// Devuelve el NOMBRE a mostrar bajo la firma. Resuelve alias (ej.
// "Logistica" → "Miriam Ccanahuire") para que el rótulo no quede en
// blanco/genérico cuando la firma sí es de una persona real.
export function nombreParaFirma(nombre: string | null | undefined): string | null {
  if (!nombre) return null;
  const t = nombre.trim();
  if (FIRMAS_CONOCIDAS[t]) return t;
  const alias = ALIAS_ELABORADOR[t];
  if (alias && FIRMAS_CONOCIDAS[alias]) return alias;
  return t;
}
