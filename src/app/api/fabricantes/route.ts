// Alta rápida de fabricantes desde los formularios de requerimiento.
//   POST { nombre } — crea el fabricante con un código autogenerado.
//
// Quien crea requerimientos (todas las áreas, ver REGLAS_ESCRITURA_API) puede
// agregar una marca que falta sin pasar por /catalogos (solo admin). Para no
// llenar la lista de duplicados: si ya existe uno con el mismo nombre (sin
// distinguir mayúsculas/tildes) se devuelve ese, reactivándolo si estaba
// inactivo, en lugar de crear otro.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";

const CreateSchema = z.object({
  nombre: z.string().trim().min(1).max(200),
});

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

// Mismo estilo que los códigos cargados a mano (BOH, NOR, 3M, C&A): las
// primeras letras del nombre. Si choca, se alarga; si igual choca, sufijo
// numérico.
function candidatosCodigo(nombre: string): string[] {
  const base = normalizar(nombre).replace(/[^A-Z0-9&]/g, "");
  const raiz = base || "FAB";
  const out: string[] = [];
  for (let n = 3; n <= Math.min(raiz.length, 8); n++) out.push(raiz.slice(0, n));
  if (raiz.length < 3) out.push(raiz);
  const corto = raiz.slice(0, 3);
  for (let i = 2; i <= 99; i++) out.push(`${corto}${i}`);
  return out;
}

export async function POST(req: NextRequest) {
  const usuario = await getAuditUser(req);
  if (!usuario) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Nombre de fabricante requerido (máx. 200 caracteres)." }, { status: 400 });
  }
  const nombre = parsed.data.nombre.replace(/\s+/g, " ");
  const clave = normalizar(nombre);

  try {
    const todos = await prisma.fabricante.findMany({
      select: { fabricante_id: true, codigo: true, nombre: true, activo: true },
    });

    const existente = todos.find((f) => normalizar(f.nombre) === clave || normalizar(f.codigo) === clave);
    if (existente) {
      const data = existente.activo
        ? existente
        : await prisma.fabricante.update({
            where: { fabricante_id: existente.fabricante_id },
            data: { activo: true },
          });
      return NextResponse.json({ data, existente: true });
    }

    const usados = new Set(todos.map((f) => f.codigo.toUpperCase()));
    const codigo = candidatosCodigo(nombre).find((c) => !usados.has(c));
    if (!codigo) {
      return NextResponse.json({ error: "No se pudo generar un código libre. Pedí a un administrador que lo agregue." }, { status: 409 });
    }

    const data = await prisma.fabricante.create({ data: { codigo, nombre, activo: true } });
    console.info(`[fabricantes] ${usuario} creó ${codigo} — ${nombre}`);
    return NextResponse.json({ data, existente: false }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Otro usuario acaba de crear ese código. Volvé a intentar." }, { status: 409 });
    }
    console.error("POST /api/fabricantes error:", error);
    return NextResponse.json({ error: "Error al crear fabricante" }, { status: 500 });
  }
}
