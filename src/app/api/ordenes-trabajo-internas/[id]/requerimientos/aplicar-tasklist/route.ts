// POST /api/ordenes-trabajo-internas/[id]/requerimientos/aplicar-tasklist
//
// Aplica los TaskList items del equipo + estrategia PM a la OT interna,
// creando OTRepuesto para cada uno. Espejo de aplicar-template de OT
// externa, pero usa TaskList en vez de Tarea, y resuelve la CASCADA PM
// acumulativo:
//   - PM1 → solo PM1
//   - PM2 → PM1 + PM2
//   - PM3 → PM1 + PM2 + PM3
//   - PM4 → PM1 + PM2 + PM3 + PM4
//
// Requisitos:
//   - La OT interna debe tener equipo_codigo Y estrategia_id seteados
//   - La estrategia.codigo debe ser PM1/PM2/PM3/PM4
//
// Body: { estrategia?: "keep_all" | "replace_pending" | "skip_if_any" }
// Default: "replace_pending" (elimina BORRADOR/SIN_APROBACION sin po_id
// antes de copiar, mismo patrón que aplicar-template de OT externa).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { nextNroReqInterna } from "@/lib/requerimientos";

import { parseInt4Safe } from "@/lib/ot-formato";
type Ctx = { params: Promise<{ id: string }> };

const Schema = z.object({
  estrategia: z.enum(["keep_all", "replace_pending", "skip_if_any"]).default("replace_pending"),
});

// Cascada PM acumulativa: PM1 ⊂ PM2 ⊂ PM3 ⊂ PM4. Convención oficial HPK.
const CASCADA_PM: Record<string, string[]> = {
  PM1: ["PM1"],
  PM2: ["PM1", "PM2"],
  PM3: ["PM1", "PM2", "PM3"],
  PM4: ["PM1", "PM2", "PM3", "PM4"],
};

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const otId = parseInt4Safe(id) ?? 0;
    if (otId == null || otId <= 0) {
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
      const ot = await tx.ordenTrabajoInterna.findUnique({
        where: { id: otId },
        select: {
          id: true,
          equipo_codigo: true,
          // El nivel PM/MP vive en actividad_codigo, no en codigo
          // (`codigo` es el ID arbitrario "EST-0059").
          estrategia: { select: { codigo: true, actividad_codigo: true } },
        },
      });
      if (!ot) return { error: "NOT_FOUND_OT" } as const;
      if (!ot.equipo_codigo) {
        return { error: "SIN_EQUIPO" } as const;
      }
      const estrCodigo = ot.estrategia?.actividad_codigo;
      if (!estrCodigo) return { error: "SIN_ESTRATEGIA" } as const;
      const cascada = CASCADA_PM[estrCodigo.toUpperCase()];
      if (!cascada) {
        return { error: "ESTRATEGIA_NO_PM", codigo: estrCodigo } as const;
      }

      // 1. Buscar TaskList aplicables: equipo + actividad_codigo IN cascada
      const taskLists = await tx.taskList.findMany({
        where: {
          equipo_codigo: ot.equipo_codigo,
          actividad_codigo: { in: cascada },
          activo: true,
        },
        include: {
          items: { orderBy: { item: "asc" } },
        },
        // PM1 primero, después PM2, etc. (orden de cascada).
        orderBy: [{ actividad_codigo: "asc" }, { id: "asc" }],
      });

      if (taskLists.length === 0) {
        return {
          error: "TASKLIST_VACIO",
          equipo: ot.equipo_codigo,
          cascada,
        } as const;
      }

      // 2. Existentes de la OT
      const existentes = await tx.oTRepuesto.findMany({
        where: { orden_trabajo_interna_id: otId },
      });

      if (estrategia === "skip_if_any" && existentes.length > 0) {
        return { skipped: true, existentes: existentes.length } as const;
      }

      let eliminados = 0;
      if (estrategia === "replace_pending") {
        const aBorrar = existentes.filter(
          (r) =>
            (r.status_requerimiento_codigo === "BORRADOR" ||
              r.status_requerimiento_codigo === "SIN_APROBACION") &&
            r.po_id == null,
        );
        if (aBorrar.length > 0) {
          const del = await tx.oTRepuesto.deleteMany({
            where: { id: { in: aBorrar.map((r) => r.id) } },
          });
          eliminados = del.count;
        }
      }

      // 3. Pre-cargar materiales catalogados (para resolver material_id)
      const codigosMat = [
        ...new Set(
          taskLists
            .flatMap((tl) => tl.items)
            .filter((it) => it.material_codigo)
            .map((it) => it.material_codigo!),
        ),
      ];
      const materiales = codigosMat.length
        ? await tx.material.findMany({
            where: { codigo: { in: codigosMat } },
            select: { material_id: true, codigo: true, unidad_medida_codigo: true },
          })
        : [];
      const matByCodigo = new Map(materiales.map((m) => [m.codigo, m]));

      // 4. Aplanar items con info de su TaskList padre para descripcion.
      // UN nro_req para TODOS los items (mismo patrón que aplicar-template).
      // El item_req es incremental: cada item del Excel suma 1, en orden de
      // cascada PM1→PM2→PM3→PM4 (el orderBy del findMany ya lo garantiza).
      const nroReq = await nextNroReqInterna(tx, otId);
      let itemIdx = 1;
      const dataItems: Prisma.OTRepuestoUncheckedCreateInput[] = [];
      for (const tl of taskLists) {
        for (const it of tl.items) {
          const mat = it.material_codigo ? matByCodigo.get(it.material_codigo) : null;
          // Descripción: prefiere ref_descripcion del item; si no hay, usa la
          // descripción de la tarea (el grupo). Prepend el nivel PM para que
          // el operario sepa de qué pauta viene cada item.
          const descBase = it.ref_descripcion ?? tl.descripcion ?? "(sin descripción)";
          const descripcion = `[${tl.actividad_codigo}] ${descBase}`;
          dataItems.push({
            orden_trabajo_interna_id: otId,
            material_id: mat?.material_id ?? null,
            material_codigo: it.material_codigo ?? null,
            tipo_codigo: it.tipo,
            cantidad: it.requerimiento != null ? new Prisma.Decimal(it.requerimiento) : new Prisma.Decimal(1),
            descripcion,
            texto: it.texto ?? null,
            unidad_medida: it.um ?? mat?.unidad_medida_codigo ?? "UNIDAD",
            precio_unitario: it.precio != null ? new Prisma.Decimal(it.precio) : null,
            moneda: "USD",
            es_adicional: false,
            nro_req: nroReq,
            item_req: itemIdx++,
            status_requerimiento_codigo: "BORRADOR",
            usuario_solicita: usuario,
          });
        }
      }
      const ins = await tx.oTRepuesto.createMany({ data: dataItems });
      const creados = ins.count;

      // 5. Historial
      await tx.oTHistorial.create({
        data: {
          orden_trabajo_interna_id: otId,
          tipo_operacion: "REQUERIMIENTO",
          descripcion: `Task list aplicado (${estrCodigo}, equipo ${ot.equipo_codigo}, cascada ${cascada.join("+")}): ${nroReq} creado con ${creados} item(s)${eliminados ? `, ${eliminados} pendientes reemplazados` : ""}.`,
          usuario,
        },
      });

      return {
        creados,
        eliminados,
        equipo_codigo: ot.equipo_codigo,
        estrategia_pm: estrCodigo,
        cascada,
        task_lists_aplicados: taskLists.length,
        nro_req: nroReq,
      } as const;
    }, { maxWait: 10_000, timeout: 30_000 });

    if ("error" in result) {
      const codes: Record<string, [number, string]> = {
        NOT_FOUND_OT: [404, "OT interna no encontrada"],
        SIN_EQUIPO: [400, "La OT no tiene equipo asignado — el task list se filtra por equipo."],
        SIN_ESTRATEGIA: [400, "La OT no tiene estrategia asignada. Asigna PM1/PM2/PM3/PM4 primero."],
        ESTRATEGIA_NO_PM: [400, `La estrategia "${(result as { codigo?: string }).codigo}" no es un nivel PM (PM1/PM2/PM3/PM4). Solo esos niveles aplican task list.`],
        TASKLIST_VACIO: [400, `No hay task lists para el equipo ${(result as { equipo?: string }).equipo} en los niveles ${(result as { cascada?: string[] }).cascada?.join("+")}.`],
      };
      const [status, msg] = codes[String(result.error)] ?? [400, "Error"];
      return NextResponse.json({ error: msg }, { status });
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("POST aplicar-tasklist error:", error);
    return NextResponse.json({ error: "Error al aplicar task list" }, { status: 500 });
  }
}
