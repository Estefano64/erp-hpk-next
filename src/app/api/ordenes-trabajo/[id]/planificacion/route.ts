import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// GET — lista planificación de una OT
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const otId = Number(id);
  const data = await prisma.planificacionOT.findMany({
    where: { ot_id: otId },
    include: {
      operacion_cod_rep: {
        select: {
          operacion_cod_rep_id: true,
          componente_codigo: true,
          operacion_reparacion_codigo: true,
          trabajo: true,
        },
      },
      _count: { select: { capturas: true } },
    },
    orderBy: { orden: "asc" },
  });
  return NextResponse.json({ data });
}

// POST — genera planificación desde el CodRep de la OT (bulk)
// Body: { sobreescribir?: boolean }  (default false: si ya hay filas, error)
const BulkSchema = z.object({
  sobreescribir: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const otId = Number(id);
    const body = await req.json().catch(() => ({}));
    const parsed = BulkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }

    const usuario = (await getAuditUser(req)) ?? "sistema";
    const resultado = await prisma.$transaction(async (tx) => {
      const ot = await tx.ordenTrabajo.findUnique({
        where: { id: otId },
        select: { id: true, id_cod_rep: true, codigo_reparacion: { select: { codigo: true } } },
      });
      if (!ot) throw Object.assign(new Error("OT no encontrada"), { code: "NOT_FOUND" });
      if (!ot.id_cod_rep || !ot.codigo_reparacion) {
        throw Object.assign(new Error("La OT no tiene un CodRep asignado"), { code: "NO_CODREP" });
      }

      const existentes = await tx.planificacionOT.count({ where: { ot_id: otId } });
      if (existentes > 0 && !parsed.data.sobreescribir) {
        throw Object.assign(
          new Error(`La OT ya tiene ${existentes} filas de planificación. Pasar sobreescribir:true para regenerar.`),
          { code: "ALREADY_EXISTS" },
        );
      }
      if (existentes > 0 && parsed.data.sobreescribir) {
        await tx.planificacionOT.deleteMany({ where: { ot_id: otId } });
      }

      const operaciones = await tx.operacionCodRep.findMany({
        where: { cod_rep_codigo: ot.codigo_reparacion.codigo, activo: true },
        orderBy: { orden: "asc" },
      });

      if (operaciones.length === 0) {
        return { inserted: 0, cod_rep: ot.codigo_reparacion.codigo };
      }

      const rows = operaciones.map((op) => ({
        ot_id: otId,
        operacion_cod_rep_id: op.operacion_cod_rep_id,
        componente: op.componente_codigo,
        operacion_codigo: op.operacion_reparacion_codigo ?? op.trabajo.slice(0, 20),
        descripcion: op.trabajo,
        orden: op.orden,
        horas_estimadas: op.horas ?? null,
        estado: "abierto",
      }));

      await tx.planificacionOT.createMany({ data: rows });

      // Historial
      await tx.oTHistorial.create({
        data: {
          ot_id: otId,
          tipo_operacion: "TAREAS_GENERADAS",
          descripcion: `Planificación generada desde ${ot.codigo_reparacion.codigo}: ${rows.length} tarea(s)${existentes > 0 ? ` (reemplazó ${existentes} anteriores)` : ""}.`,
          usuario,
        },
      });

      return { inserted: rows.length, cod_rep: ot.codigo_reparacion.codigo };
    });

    return NextResponse.json({ success: true, ...resultado }, { status: 201 });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err?.code === "NOT_FOUND") return NextResponse.json({ error: err.message }, { status: 404 });
    if (err?.code === "NO_CODREP" || err?.code === "ALREADY_EXISTS") {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("POST /api/ordenes-trabajo/[id]/planificacion error:", error);
    return NextResponse.json({ error: "Error al generar planificación" }, { status: 500 });
  }
}
