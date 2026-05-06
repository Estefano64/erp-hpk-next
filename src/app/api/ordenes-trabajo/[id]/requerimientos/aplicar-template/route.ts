import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { nextNroReq } from "@/lib/requerimientos";

type Ctx = { params: Promise<{ id: string }> };

const Schema = z.object({
  /**
   * Estrategia frente a los requerimientos ya existentes en la OT:
   *  - "keep_all": no toca los existentes, solo agrega los del template (puede generar duplicados — uso responsable).
   *  - "replace_pending": elimina los SIN_APROBACION sin po_id antes de copiar el template (recomendado).
   *  - "skip_if_any": si ya hay requerimientos, no hace nada.
   */
  estrategia: z.enum(["keep_all", "replace_pending", "skip_if_any"]).default("replace_pending"),
});

// POST /api/ordenes-trabajo/[id]/requerimientos/aplicar-template
// Copia las Tarea (template) del cod_rep de la OT a OTRepuesto.
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const otId = Number(id);
    if (!Number.isFinite(otId) || otId <= 0) {
      return NextResponse.json({ error: "ID de OT inválido" }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const { estrategia } = parsed.data;
    const usuario = (await getAuditUser(req)) ?? "sistema";

    const result = await prisma.$transaction(async (tx) => {
      const ot = await tx.ordenTrabajo.findUnique({
        where: { id: otId },
        select: { id: true, codigo_reparacion: { select: { codigo: true } } },
      });
      if (!ot) return { error: "NOT_FOUND_OT" } as const;
      if (!ot.codigo_reparacion) return { error: "NO_COD_REP" } as const;

      const codRep = ot.codigo_reparacion.codigo;

      // Items del template
      const tareas = await tx.tarea.findMany({
        where: { cod_rep_codigo: codRep },
        orderBy: { item_numero: "asc" },
      });
      if (tareas.length === 0) {
        return { error: "TEMPLATE_VACIO", codRep } as const;
      }

      // Existentes de la OT
      const existentes = await tx.oTRepuesto.findMany({ where: { ot_id: otId } });

      if (estrategia === "skip_if_any" && existentes.length > 0) {
        return { skipped: true, existentes: existentes.length } as const;
      }

      let eliminados = 0;
      if (estrategia === "replace_pending") {
        const aBorrar = existentes.filter(
          (r) => (r.status_requerimiento_codigo === "BORRADOR" || r.status_requerimiento_codigo === "SIN_APROBACION") && r.po_id == null,
        );
        if (aBorrar.length > 0) {
          const del = await tx.oTRepuesto.deleteMany({
            where: { id: { in: aBorrar.map((r) => r.id) } },
          });
          eliminados = del.count;
        }
      }

      // Un solo nro_req para todo el template, item_req incremental dentro
      const nroReq = await nextNroReq(tx);
      let creados = 0;
      for (let i = 0; i < tareas.length; i++) {
        const t = tareas[i];
        await tx.oTRepuesto.create({
          data: {
            ot_id: otId,
            material_id: null, // se resuelve abajo si hay material_codigo
            material_codigo: t.material_codigo ?? null,
            tipo_codigo: t.tipo_codigo,
            cantidad: t.requerimiento,
            descripcion: t.descripcion,
            texto: t.texto ?? null,
            fabricante_codigo: t.fabricante_codigo ?? null,
            unidad_medida: "UNIDAD",
            precio_unitario: t.precio ?? null,
            moneda: "USD",
            es_adicional: false,
            nro_req: nroReq,
            item_req: i + 1,
            status_requerimiento_codigo: "BORRADOR",
            usuario_solicita: usuario,
          },
        });
        creados++;
      }

      // Resolver material_id en bulk para los MAC con material_codigo
      const codigosUnicos = [...new Set(tareas.filter((t) => t.material_codigo).map((t) => t.material_codigo!))];
      if (codigosUnicos.length > 0) {
        const materiales = await tx.material.findMany({
          where: { codigo: { in: codigosUnicos } },
          select: { material_id: true, codigo: true },
        });
        const map = new Map(materiales.map((m) => [m.codigo, m.material_id]));
        for (const [cod, matId] of map.entries()) {
          await tx.oTRepuesto.updateMany({
            where: { ot_id: otId, material_codigo: cod, material_id: null },
            data: { material_id: matId },
          });
        }
      }

      return { creados, eliminados, codRep, total: tareas.length } as const;
    });

    if ("error" in result) {
      const codes: Record<string, [number, string]> = {
        NOT_FOUND_OT: [404, "OT no encontrada"],
        NO_COD_REP: [400, "La OT no tiene cod_rep asignado, no hay template para copiar."],
        TEMPLATE_VACIO: [400, `El template del cod_rep ${(result as { codRep?: string }).codRep ?? ""} está vacío.`],
      };
      const [status, msg] = codes[String(result.error)] ?? [400, "Error"];
      return NextResponse.json({ error: msg }, { status });
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("POST aplicar-template error:", error);
    return NextResponse.json({ error: "Error al aplicar template" }, { status: 500 });
  }
}
