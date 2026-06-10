// POST /api/r2/delete
// Body: { key: string }
// Solo elimina la key SI no está referenciada por ningún registro en BD.
// Caso de uso: limpiar uploads abortados (cliente subió a R2 pero falló al crear
// el registro). Para borrar adjuntos ya registrados, usar el endpoint del módulo
// correspondiente (que se encarga de la sincronía BD ↔ R2).
import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { deleteObject } from "@/lib/r2-helpers";

export async function POST(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const { key } = body as { key?: unknown };
  if (typeof key !== "string" || key.length === 0) {
    return NextResponse.json({ error: "key requerida" }, { status: 400 });
  }

  // Verifica que la key no esté ya asociada a ningún registro.
  const [otAdj, reqAdj, compraG, compraF, compraP, evalI] = await Promise.all([
    prisma.otAdjunto.findFirst({ where: { r2_key: key }, select: { id: true } }),
    prisma.oTRepuestoAdjunto.findFirst({ where: { r2_key: key }, select: { id: true } }),
    prisma.compra.findFirst({ where: { guia_key: key }, select: { id: true } }),
    prisma.compra.findFirst({ where: { factura_key: key }, select: { id: true } }),
    prisma.compra.findFirst({ where: { pago_key: key }, select: { id: true } }),
    prisma.evaluacionTecnica.findFirst({ where: { informe_key: key }, select: { id: true } }),
  ]);
  if (otAdj || reqAdj || compraG || compraF || compraP || evalI) {
    return NextResponse.json(
      { error: "La key está referenciada en BD. Usar el endpoint del módulo." },
      { status: 409 },
    );
  }

  try {
    await deleteObject(key);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/r2/delete error:", error);
    return NextResponse.json({ error: "Error eliminando objeto de R2" }, { status: 500 });
  }
}
