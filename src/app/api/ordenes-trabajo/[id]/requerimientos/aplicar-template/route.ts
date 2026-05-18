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

      // Pre-cargar materiales (para usar SU descripción/UM/fabricante, no la del cod_rep que es genérica)
      const codigosUnicos = [...new Set(tareas.filter((t) => t.material_codigo).map((t) => t.material_codigo!))];
      const materiales = codigosUnicos.length
        ? await tx.material.findMany({
            where: { codigo: { in: codigosUnicos } },
            select: { material_id: true, codigo: true, descripcion: true, fabricante_codigo: true, unidad_medida_codigo: true },
          })
        : [];
      const matByCodigo = new Map(materiales.map((m) => [m.codigo, m]));

      // Pre-cargar servicios (para SER, usar nombre/descripcion del servicio si está enlazado)
      const serviciosUnicos = [...new Set(tareas.filter((t) => t.servicio_codigo).map((t) => t.servicio_codigo!))];
      const servicios = serviciosUnicos.length
        ? await tx.servicioReparacion.findMany({
            where: { codigo: { in: serviciosUnicos } },
            select: { codigo: true, nombre: true, descripcion: true },
          })
        : [];
      const svcByCodigo = new Map(servicios.map((s) => [s.codigo, s]));

      function pickDescripcion(t: typeof tareas[number]): string {
        if (t.tipo_codigo === "MAC" && t.material_codigo) {
          const m = matByCodigo.get(t.material_codigo);
          if (m?.descripcion) return m.descripcion;
        }
        if (t.tipo_codigo === "SER") {
          if (t.servicio_codigo) {
            const s = svcByCodigo.get(t.servicio_codigo);
            if (s) return s.descripcion ?? s.nombre;
          }
          if (t.texto) return t.texto;
        }
        // CAD u otros: preferimos texto si existe (es lo "específico"); descripcion suele ser genérica del cod_rep.
        return t.texto || t.descripcion;
      }

      // Un solo nro_req para todo el template, item_req incremental dentro
      const nroReq = await nextNroReq(tx);
      let creados = 0;
      for (let i = 0; i < tareas.length; i++) {
        const t = tareas[i];
        const mat = t.material_codigo ? matByCodigo.get(t.material_codigo) : null;
        await tx.oTRepuesto.create({
          data: {
            ot_id: otId,
            material_id: mat?.material_id ?? null,
            material_codigo: t.material_codigo ?? null,
            tipo_codigo: t.tipo_codigo,
            cantidad: t.requerimiento,
            descripcion: pickDescripcion(t),
            texto: t.texto ?? null,
            fabricante_codigo: t.fabricante_codigo ?? mat?.fabricante_codigo ?? null,
            unidad_medida: mat?.unidad_medida_codigo ?? "UNIDAD",
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

      // Historial
      await tx.oTHistorial.create({
        data: {
          ot_id: otId,
          tipo_operacion: "REQUERIMIENTO",
          descripcion: `Template ${codRep} aplicado: ${nroReq} creado con ${creados} item(s)${eliminados ? `, ${eliminados} pendientes reemplazados` : ""}.`,
          usuario,
        },
      });

      return { creados, eliminados, codRep, total: tareas.length, nro_req: nroReq } as const;
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
