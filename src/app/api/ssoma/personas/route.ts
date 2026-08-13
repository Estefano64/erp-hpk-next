import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/ssoma/personas — alimenta los desplegables de los formatos SSOMA.
//
//   trabajadores → todo el personal activo (para "Reportado por"). No exige
//                  cuenta de usuario: un técnico sin cuenta igual puede
//                  figurar como quien reportó.
//   responsables → cuentas con rol "responsable_ssoma". Son los únicos que
//                  pueden quedar como responsables de una acción correctiva,
//                  porque al asignarlos se les manda una notificación a su
//                  cuenta (ver /api/notificaciones).
//
// Ambas listas son chicas (decenas de filas) y se piden juntas en una sola
// llamada al abrir cada pantalla del módulo.
export async function GET() {
  try {
    const [trabajadores, responsables] = await Promise.all([
      prisma.trabajador.findMany({
        where: { activo: true },
        select: { trabajador_id: true, nombre: true, puesto: true, area: true },
        orderBy: { nombre: "asc" },
      }),
      prisma.usuario.findMany({
        where: { activo: true, roles: { has: "responsable_ssoma" } },
        select: { id: true, nombre: true, email: true },
        orderBy: { nombre: "asc" },
      }),
    ]);
    return NextResponse.json({ trabajadores, responsables });
  } catch (e) {
    console.error("GET /api/ssoma/personas error:", e);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
