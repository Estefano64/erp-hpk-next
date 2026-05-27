// POST /api/requerimientos/desaprobar-lote
// Desaprueba todos los items de un requerimiento en una sola transacción.
//
// Body: { nro_req?: string, ids?: number[], motivo?: string }
//   - nro_req OR ids[]: cuáles items desaprobar
//   - motivo: texto opcional que se concatena a observaciones de cada item
//
// Bloquea items que ya tienen OC asociada (po_id != null) — no permite
// desaprobar lo que ya está en proceso de compra.
//
// Permiso: cualquier usuario autenticado.
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: { nro_req?: unknown; ids?: unknown; motivo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const nroReq = typeof body.nro_req === "string" && body.nro_req.length > 0 ? body.nro_req : null;
  const ids = Array.isArray(body.ids)
    ? (body.ids as unknown[]).filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x > 0)
    : null;
  const motivo = typeof body.motivo === "string" ? body.motivo.trim() || null : null;

  if (!nroReq && (!ids || ids.length === 0)) {
    return NextResponse.json({ error: "Se requiere nro_req o ids[]" }, { status: 400 });
  }

  const usuario = (await getAuditUser(req)) ?? "sistema";

  try {
    const result = await prisma.$transaction(async (tx) => {
      const candidatos = await tx.oTRepuesto.findMany({
        where: {
          status_requerimiento_codigo: "SIN_APROBACION",
          ...(nroReq ? { nro_req: nroReq } : { id: { in: ids! } }),
        },
        select: { id: true, ot_id: true, nro_req: true, po_id: true, observaciones: true },
      });

      if (candidatos.length === 0) {
        return { desaprobados: 0, ot_ids: [] as number[], ref: nroReq ?? `${ids?.length ?? 0} items` };
      }

      // Si alguno ya tiene OC, no se puede desaprobar — abortar todo.
      const conOC = candidatos.filter((c) => c.po_id != null);
      if (conOC.length > 0) {
        throw Object.assign(
          new Error(`No se puede desaprobar: ${conOC.length} item(s) ya tienen OC asociada.`),
          { status: 409 },
        );
      }

      // Update item por item porque cada uno tiene `observaciones` distintas.
      for (const c of candidatos) {
        await tx.oTRepuesto.update({
          where: { id: c.id },
          data: {
            status_requerimiento_codigo: "DESAPROBADO",
            usuario_aprueba: usuario,
            fecha_aprobacion: new Date(),
            observaciones: motivo
              ? (c.observaciones ? `${c.observaciones}\n[Desaprobación] ${motivo}` : `[Desaprobación] ${motivo}`)
              : c.observaciones,
          },
        });
      }

      const otsUnicas = [...new Set(candidatos.map((c) => c.ot_id))];
      const refTexto = nroReq ?? `${candidatos.length} item(s)`;
      for (const ot_id of otsUnicas) {
        await tx.oTHistorial.create({
          data: {
            ot_id,
            tipo_operacion: "Otro",
            descripcion: `Requerimiento ${refTexto} desaprobado${motivo ? ` — ${motivo}` : ""} (${candidatos.length} item${candidatos.length === 1 ? "" : "s"})`,
            usuario,
          },
        });
      }

      return { desaprobados: candidatos.length, ot_ids: otsUnicas, ref: refTexto };
    });

    return NextResponse.json({ data: result });
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err?.status) {
      return NextResponse.json({ error: err.message ?? "Error" }, { status: err.status });
    }
    console.error("POST /api/requerimientos/desaprobar-lote error:", error);
    return NextResponse.json({ error: "Error al desaprobar requerimiento" }, { status: 500 });
  }
}
