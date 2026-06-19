import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { nextNumeroOTInterna } from "@/lib/ot-numero";
import { nextNroReqInterna } from "@/lib/requerimientos";
import { parseOtCodigoSearch } from "@/lib/ot-formato";

// Cascada PM acumulativa: PM1 ⊂ PM2 ⊂ PM3 ⊂ PM4. Convención oficial HPK.
const CASCADA_PM_OT: Record<string, string[]> = {
  PM1: ["PM1"],
  PM2: ["PM1", "PM2"],
  PM3: ["PM1", "PM2", "PM3"],
  PM4: ["PM1", "PM2", "PM3", "PM4"],
};

// GET — lista con filtros y paginación.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit = Math.min(10000, Math.max(1, Number(searchParams.get("limit") ?? 20)));
    const search = searchParams.get("search")?.trim() ?? "";
    const tipo = searchParams.get("tipo") ?? "";
    const otStatus = searchParams.get("ot_status") ?? "";
    const equipo = searchParams.get("equipo") ?? "";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (search) {
      // `ot` es INTEGER en BD. Aceptamos tanto el número raw como el código
      // visible "OI000126" — parseOtCodigoSearch convierte ambos al raw.
      const otNum = parseOtCodigoSearch(search);
      where.OR = [
        ...(otNum != null ? [{ ot: otNum }] : []),
        { equipo_codigo: { contains: search, mode: "insensitive" } },
        { descripcion: { contains: search, mode: "insensitive" } },
      ];
    }
    if (tipo) where.tipo_ot_interna_codigo = tipo;
    if (otStatus) where.ot_status_codigo = otStatus;
    if (equipo) where.equipo_codigo = equipo;
    // Por defecto solo OTs internas activas; las desactivadas (anuladas) se
    // ocultan. El admin puede pedirlas con ?incluirInactivas=1 (para reactivar).
    if (searchParams.get("incluirInactivas") !== "1") where.activo = true;

    const [data, total] = await Promise.all([
      prisma.ordenTrabajoInterna.findMany({
        where,
        include: {
          planta: true,
          equipo: { select: { codigo: true, descripcion: true } },
          tipo_ot_interna: true,
          prioridad_atencion: true,
          estrategia: { select: { estrategia_id: true, codigo: true, descripcion: true } },
          user_status: true,
          ot_status: true,
          recursos_status: true,
          // Conteo de requerimientos (OTRepuesto) — para la columna "Reqs"
          // de la tabla. Cuenta solo los activos (no anulados).
          _count: {
            select: {
              repuestos: { where: { status_requerimiento_codigo: { not: "ANULADO" } } },
            },
          },
        },
        orderBy: { id: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.ordenTrabajoInterna.count({ where }),
    ]);

    // ── Agregaciones por OT (página actual) ──────────────────────────────
    // Una sola query con los repuestos NO anulados de las OTs visibles para:
    //   - n_reqs_distintos: cuántos `nro_req` únicos tiene cada OT
    //   - costo_real_por_moneda:     SUM(cantidad_recibida × precio_unitario)
    //   - costo_estimado_por_moneda: SUM(pendiente × precio_unitario) con filtro
    //     de items que aún están en proceso (APROBADO o con OC vigente).
    // El cálculo replica la lógica simplificada de src/lib/costos-ot.ts pero
    // sin tocar OCs ni HH (HH no aplica a OT interna; OCs ya se reflejan vía
    // cantidad_recibida en cada repuesto).
    const otIds = data.map((o) => o.id);
    type AggMap = Map<number, {
      reqs: Set<string>;
      real: Map<string, number>;
      estimado: Map<string, number>;
    }>;
    const agg: AggMap = new Map();
    if (otIds.length > 0) {
      const reqs = await prisma.oTRepuesto.findMany({
        where: {
          orden_trabajo_interna_id: { in: otIds },
          status_requerimiento_codigo: { not: "ANULADO" },
        },
        select: {
          orden_trabajo_interna_id: true,
          nro_req: true,
          cantidad: true,
          cantidad_recibida: true,
          precio_unitario: true,
          moneda: true,
          status_requerimiento_codigo: true,
          status_oc_codigo: true,
        },
      });
      const num = (v: unknown): number => {
        if (v == null) return 0;
        if (typeof v === "object" && v !== null && "toNumber" in v) {
          // Prisma.Decimal
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (v as any).toNumber();
        }
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      };
      for (const r of reqs) {
        if (r.orden_trabajo_interna_id == null) continue;
        const entry = agg.get(r.orden_trabajo_interna_id) ?? {
          reqs: new Set<string>(),
          real: new Map<string, number>(),
          estimado: new Map<string, number>(),
        };
        if (r.nro_req) entry.reqs.add(r.nro_req);
        const moneda = r.moneda ?? "USD";
        const cantidad = num(r.cantidad);
        const recibido = num(r.cantidad_recibida);
        const precio = num(r.precio_unitario);
        const subReal = recibido * precio;
        const pendiente = Math.max(cantidad - recibido, 0);
        const enProceso =
          r.status_requerimiento_codigo === "APROBADO"
          || (r.status_oc_codigo != null && r.status_oc_codigo !== "ANULADO");
        const subEst = enProceso ? pendiente * precio : 0;
        if (subReal > 0) entry.real.set(moneda, (entry.real.get(moneda) ?? 0) + subReal);
        if (subEst > 0) entry.estimado.set(moneda, (entry.estimado.get(moneda) ?? 0) + subEst);
        agg.set(r.orden_trabajo_interna_id, entry);
      }
    }

    // Adjunto los agregados a cada fila como campos planos para que el front
    // pueda mostrarlos sin lógica extra. Si la OT no tiene repuestos los
    // valores son 0 / objeto vacío (no null) para simplificar tipado.
    const enriched = data.map((o) => {
      const a = agg.get(o.id);
      return {
        ...o,
        n_reqs_distintos: a?.reqs.size ?? 0,
        costo_real_por_moneda: a ? Object.fromEntries(a.real) : {},
        costo_estimado_por_moneda: a ? Object.fromEntries(a.estimado) : {},
      };
    });

    return NextResponse.json({ data: enriched, total, page });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

// POST — crea una OT interna con número auto-generado.
// Campos mínimos requeridos:
//   tipo_ot_interna_codigo, descripcion, y al menos uno de (area_taller | equipo_codigo).
//   area_taller es el flujo nuevo (preferido). equipo_codigo queda para compat.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.tipo_ot_interna_codigo) {
      return NextResponse.json({ error: "tipo_ot_interna_codigo es requerido" }, { status: 400 });
    }
    if (!body.descripcion || typeof body.descripcion !== "string" || !body.descripcion.trim()) {
      return NextResponse.json({ error: "descripcion es requerida" }, { status: 400 });
    }

    const usuarioCrea = (await getAuditUser(req)) ?? "sistema";

    // Defaults para que la OT arranque con el primer estado de cada catálogo
    // — mismo patrón que la OT externa al crearse.
    //   ot_status:       "Abierta"                  (siempre primera)
    //   recursos_status: "En revision procesos"     (primera fila del catálogo)
    //   user_status:     "PLANIFICADO"              (primera fila del catálogo)
    //
    // Generación + create en la misma transacción con advisory lock (en
    // nextNumeroOTInterna) para serializar generaciones concurrentes.
    const created = await prisma.$transaction(async (tx) => {
      const ot = await nextNumeroOTInterna(tx);
      const nueva = await tx.ordenTrabajoInterna.create({
        data: {
          ot,
          anio: ot % 100,
          planta_codigo: body.planta_codigo || null,
          equipo_codigo: body.equipo_codigo || null,
          area_taller: body.area_taller || null,
          tipo_ot_interna_codigo: body.tipo_ot_interna_codigo,
          descripcion: body.descripcion.trim(),
          prioridad_atencion_codigo: body.prioridad_atencion_codigo || null,
          usuario_crea: usuarioCrea,
          fecha_inicio_plan: body.fecha_inicio_plan ? new Date(body.fecha_inicio_plan) : null,
          fecha_fin_plan: body.fecha_fin_plan ? new Date(body.fecha_fin_plan) : null,
          semana_revision: body.semana_revision || null,
          estrategia_id: body.estrategia_id ? Number(body.estrategia_id) : null,
          task_list: body.task_list || null,
          user_status_codigo: body.user_status_codigo || "PLANIFICADO",
          ot_status_codigo: body.ot_status_codigo || "Abierta",
          recursos_status_codigo: body.recursos_status_codigo || "En revision procesos",
          asignado_a: body.asignado_a || null,
          comentarios: body.comentarios || null,
          solicitud_mantenimiento: body.solicitud_mantenimiento === true,
        },
        include: {
          equipo: { select: { codigo: true, descripcion: true } },
          tipo_ot_interna: true,
          ot_status: true,
          user_status: true,
          recursos_status: true,
        },
      });

      // Registro inicial en historial. Mismo patrón que OT externa.
      await tx.oTHistorial.create({
        data: {
          orden_trabajo_interna_id: nueva.id,
          tipo_operacion: "CREACION",
          descripcion: `OT interna creada: ${nueva.descripcion?.slice(0, 100) ?? ""}`,
          usuario: usuarioCrea,
        },
      });
      return nueva;
    });

    // Auto-aplicar Task List (espejo del comportamiento de OT externa con
    // cod_rep): si la OT interna se creó con equipo + estrategia preventiva
    // (MP1-4 o PM1-4), materializamos los requerimientos del TaskList del
    // equipo automáticamente — sin requerir un click extra en el detalle.
    // Falla silenciosa (try/catch externo): si algo sale mal, la OT queda
    // creada y el user puede aplicar manualmente desde el tab Requerimientos.
    if (created.equipo_codigo && created.estrategia_id) {
      try {
        const estr = await prisma.estrategia.findUnique({
          where: { estrategia_id: created.estrategia_id },
          select: { actividad_codigo: true },
        });
        const actCodigo = estr?.actividad_codigo?.toUpperCase();
        const cascada = actCodigo ? CASCADA_PM_OT[actCodigo] : null;
        if (cascada) {
          const taskLists = await prisma.taskList.findMany({
            where: {
              equipo_codigo: created.equipo_codigo,
              actividad_codigo: { in: cascada },
              activo: true,
            },
            include: { items: { orderBy: { item: "asc" } } },
            orderBy: [{ actividad_codigo: "asc" }, { id: "asc" }],
          });
          if (taskLists.length > 0) {
            const totalItems = taskLists.reduce((s, tl) => s + tl.items.length, 0);
            if (totalItems > 0) {
              await prisma.$transaction(async (tx) => {
                const nroReq = await nextNroReqInterna(tx, created.id);
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
                let itemIdx = 1;
                const data: Prisma.OTRepuestoUncheckedCreateInput[] = [];
                for (const tl of taskLists) {
                  for (const it of tl.items) {
                    const mat = it.material_codigo ? matByCodigo.get(it.material_codigo) : null;
                    const descBase = it.ref_descripcion ?? tl.descripcion ?? "(sin descripción)";
                    data.push({
                      orden_trabajo_interna_id: created.id,
                      material_id: mat?.material_id ?? null,
                      material_codigo: it.material_codigo ?? null,
                      tipo_codigo: it.tipo,
                      cantidad: it.requerimiento != null ? new Prisma.Decimal(it.requerimiento) : new Prisma.Decimal(1),
                      descripcion: `[${tl.actividad_codigo}] ${descBase}`,
                      texto: it.texto ?? null,
                      unidad_medida: it.um ?? mat?.unidad_medida_codigo ?? "UNIDAD",
                      precio_unitario: it.precio != null ? new Prisma.Decimal(it.precio) : null,
                      moneda: "USD",
                      es_adicional: false,
                      nro_req: nroReq,
                      item_req: itemIdx++,
                      status_requerimiento_codigo: "BORRADOR",
                      usuario_solicita: usuarioCrea,
                    });
                  }
                }
                await tx.oTRepuesto.createMany({ data });
                await tx.oTHistorial.create({
                  data: {
                    orden_trabajo_interna_id: created.id,
                    tipo_operacion: "REQUERIMIENTO",
                    descripcion: `Task list auto-aplicado al crear OT (${actCodigo}, equipo ${created.equipo_codigo}, cascada ${cascada.join("+")}): ${nroReq} con ${data.length} item(s).`,
                    usuario: usuarioCrea,
                  },
                });
              }, { maxWait: 10_000, timeout: 30_000 });
            }
          }
        }
      } catch (e) {
        console.error("Auto-aplicar TaskList en OT interna falló:", e);
      }
    }

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}
