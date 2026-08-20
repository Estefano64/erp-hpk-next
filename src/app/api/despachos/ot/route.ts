import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatOtCodigo } from "@/lib/ot-formato";

// GET /api/despachos/ot
// Lista OTs con requerimientos APROBADOS pendientes de entrega a la OT (aún
// no ENTREGADO). Incluye:
//   - Items con material (MAC): aparecen con su stock y si ya hay para despachar.
//   - Items SIN material (CAD/free): se despachan directo a la OT, sin pasar
//     por stock (no hay catálogo). "Puede despachar" cuando ya se recibió la
//     OC (cantidad_recibida > 0). 2026-06 fix: antes el filtro
//     `material_id: { not: null }` excluía estos items y desaparecían del
//     listado de despachos.
//   - Items sin OC: material que ya estaba en almacén / stock directo.
export async function GET(_req: NextRequest) {
  try {
    const items = await prisma.oTRepuesto.findMany({
      where: {
        status_requerimiento_codigo: "APROBADO",
        // Excluir items "libres" agregados desde el editor de OC — esos
        // solo van al PDF de OC, no al despacho del técnico.
        AND: [{ OR: [{ solo_para_oc: false }, { solo_para_oc: null }] }],
        // Removido `material_id: { not: null }` — los items free (CAD) tienen
        // material_id NULL pero igual deben aparecer para despacho a la OT.
        //
        // BUG fix: antes usábamos `status_oc_codigo: { notIn: [...] }` pero en
        // SQL `NULL NOT IN (...)` evalúa a NULL (= FALSE), por lo que TODOS los
        // items con status_oc=null (reqs aprobados sin OC todavía) quedaban
        // excluidos. Por eso una OT como 390926, con 1 item en estado
        // "aprobado pero sin OC", no aparecía en despachos. Ahora usamos OR
        // explícito: status_oc IS NULL O distinto de ENTREGADO/ANULADO.
        OR: [
          { status_oc_codigo: null },
          { status_oc_codigo: { notIn: ["ENTREGADO", "ANULADO"] } },
        ],
      },
      select: {
        id: true,
        ot_id: true,
        nro_req: true,
        item_req: true,
        descripcion: true,
        cantidad: true,
        cantidad_recibida: true,
        unidad_medida: true,
        material_id: true,
        po_id: true,
        status_oc_codigo: true,
        // Para excluir SERVICIOS del payload (no se "despachan" físicamente).
        // El query igual los trae: un item SER pendiente mantiene la OT en el
        // listado (su estado será ENTREGADO si los repuestos ya salieron).
        tipo_codigo: true,
        material: { select: { codigo: true, descripcion: true, stock_actual: true, ubicacion: true } },
        // Ubicación física donde se guardó al recepcionar la PO. Esta es la
        // fuente de verdad para "dónde está el material" — `material.ubicacion`
        // es un texto libre legacy que rara vez se llena.
        almacen_zona: { select: { codigo: true, nombre: true } },
        almacen_posicion: { select: { id: true, codigo: true } },
        compra: { select: { numero_po: true, status_oc_codigo: true } },
        orden_trabajo: {
          select: {
            id: true, ot: true,
            // tipo_codigo (de la OT) permite formatear el código visible
            // (V/S para BIE/SER) en el front — `ot` es el entero crudo NNNNYY.
            tipo_codigo: true,
            // Descripción y flota de la OT — columnas del listado de
            // Inventario por OT (pedido 2026-08-20).
            descripcion: true,
            cod_rep_flota: true,
            recursos_status_codigo: true,
            ubicacion_codigo: true,
            ubicacion: { select: { codigo: true, nombre: true } },
            cliente: { select: { codigo: true, razon_social: true, nombre_comercial: true } },
            codigo_reparacion: { select: { codigo: true, descripcion: true } },
          },
        },
      },
      orderBy: [{ ot_id: "asc" }, { nro_req: "asc" }, { item_req: "asc" }],
    });

    // Items pendientes de despacho a la OT. Reglas:
    //   - status_req = APROBADO (filtro inicial)
    //   - status_oc NO ENTREGADO/ANULADO (filtro inicial)
    //   - cant_pendiente > 0  (normalmente);
    //     EXCEPCIÓN: items FREE (sin material catálogo) que ya fueron
    //     recibidos vía ingreso-po tienen cantidad_recibida = cantidad pero
    //     todavía NO se entregaron al técnico (el despacho final no tocó
    //     OTRepuesto). Los detectamos como `esFreeOCRecibida` y los
    //     incluimos para que aparezcan en /despachos.
    const pendientes = items
      .map((it) => {
        const cantTotal = Number(it.cantidad);
        const yaDespachado = Number(it.cantidad_recibida ?? 0);
        const esFree = it.material_id == null;
        // Origen del item para el despacho al técnico. Dos casos especiales:
        //   "stock"        → CONSUMIDO_ALMACEN: stock ya descontado en
        //                    consumir-de-almacen, queda solo entrega al técnico.
        //   "oc_abierta"   → CONSUMIDO_OC_ABIERTA: ya se reservó del stock
        //                    fijo de la OC abierta, también queda solo
        //                    entrega al técnico. El despacho NO debe tocar
        //                    stock catálogo (no aplica).
        //   "oc"           → flujo normal de OC recibida (con o sin material).
        const esConsumidoAlmacen = it.status_oc_codigo === "CONSUMIDO_ALMACEN";
        const esConsumidoOCAbierta = it.status_oc_codigo === "CONSUMIDO_OC_ABIERTA";
        const yaConsumido = esConsumidoAlmacen || esConsumidoOCAbierta;
        const stockMat = Number(it.material?.stock_actual ?? 0);
        const poStatus = it.compra?.status_oc_codigo ?? null;
        const poRecibida = it.po_id == null
          ? stockMat > 0
          : poStatus === "ENTREGADO" || poStatus === "INCOMPLETO" || poStatus === "COMPLETO";
        // Cuánto arribó realmente para ESTE item de esta OT.
        // Nota: `ingreso-po` solo actualiza OTRepuesto.cantidad_recibida para
        // items FREE (sin material) — para MAC solo toca CompraDetalle. Por
        // eso NO leemos cantidad_recibida para MAC: derivamos del status de
        // la OC padre:
        //   OC ENTREGADO/COMPLETO → item recibió cantidad completa.
        //   OC INCOMPLETO         → llegó parcial (fallback a cantidad_recibida).
        //   CONSUMIDO_ALMACEN     → cuenta como recibido (ya está reservado).
        //   otros / sin OC        → nada llegado aún.
        let cantLlegada = 0;
        if (yaConsumido) {
          cantLlegada = cantTotal;
        } else if (esFree) {
          cantLlegada = Math.min(yaDespachado, cantTotal);
        } else if (it.po_id != null) {
          if (poStatus === "ENTREGADO" || poStatus === "COMPLETO") {
            cantLlegada = cantTotal;
          } else if (poStatus === "INCOMPLETO") {
            cantLlegada = Math.min(yaDespachado, cantTotal);
          }
        }
        // Pendiente = lo que falta que llegue (a comprar / a recepcionar).
        // Antes: cantidad - cantidad_recibida (siempre 0 para MAC porque el
        // campo no se actualiza) → todos los items MAC con OC ENTREGADA
        // aparecían con Pendiente = cantidad, lo cual es incorrecto.
        const cantPendiente = Math.max(0, cantTotal - cantLlegada);
        // Caso especial FREE: ingreso-po incrementa cantidad_recibida (item
        // ya arribó a HPK) pero el item AÚN no se entregó al técnico — su
        // status_oc sigue siendo PROCESO/INCOMPLETO/COMPLETO. En este estado
        // cant_pendiente=0 pero el item DEBE aparecer en despachos para que
        // el almacenero confirme la entrega final al técnico.
        const esFreeOCRecibida =
          esFree
          && cantPendiente <= 0
          && poRecibida
          && it.status_oc_codigo !== "ENTREGADO"
          && it.status_oc_codigo !== "ANULADO";
        // Caso especial CONSUMIDO_*: items consumidos de almacén / OC abierta
        // que aún no se entregaron formalmente al técnico (status_oc sigue
        // siendo CONSUMIDO_* y no ENTREGADO). Cubre dos sub-casos:
        //   (a) NUEVO flujo (post-fix): cantidad_recibida=0 → cant_pendiente=cant
        //       → ya pasa por `cantPendiente > 0`, no hace falta esta rama.
        //   (b) LEGACY: items consumidos antes del fix con cantidad_recibida=cant
        //       (o casos raros con cantidad_recibida > cantidad) → cant_pendiente
        //       ≤ 0 y el filtro los excluía. Esta rama los rescata para que el
        //       almacenero pueda cerrar el despacho final.
        const esConsumidoPendDespacho =
          yaConsumido
          && cantPendiente <= 0
          && it.status_oc_codigo !== "ENTREGADO"
          && it.status_oc_codigo !== "ANULADO";
        // Caso MAC con OC ya recibida pero sin despachar al técnico todavía:
        // cantLlegada > 0 y cant_pendiente = 0, pero el item sigue en
        // estado PROCESO/INCOMPLETO/COMPLETO. Sin esta rama, el filtro de
        // `_cant_pendiente > 0` lo sacaba de despachos y el almacenero no
        // podía entregarlo al técnico. Espeja el patrón de esFreeOCRecibida.
        const esMacLlegadoPendDespacho =
          !esFree
          && !yaConsumido
          && cantLlegada > 0
          && cantPendiente <= 0
          && it.status_oc_codigo !== "ENTREGADO"
          && it.status_oc_codigo !== "ANULADO";
        // Lógica de "puede despachar":
        //   - Ya consumido (almacén o OC abierta): siempre listo para entrega.
        //   - FREE con OC recibida: listo (el stock ya está físicamente).
        //   - Consumido legacy (pend=0): listo (solo cierre formal).
        //   - MAC desde OC: hay stock suficiente en almacén.
        //   - FREE (sin material) normal: la OC asociada ya fue recibida.
        const puedeDespachar = (cantPendiente > 0 || esFreeOCRecibida || esConsumidoPendDespacho || esMacLlegadoPendDespacho) && (
          yaConsumido || esFreeOCRecibida || esConsumidoPendDespacho || esMacLlegadoPendDespacho
            ? true
            : esFree
              ? poRecibida
              : stockMat >= cantPendiente
        );
        // Motivo por el cual NO se puede despachar — el user pidió ver
        // explícitamente cosas como "falta comprar" (sin OC), "OC sin
        // recepcionar", "sin stock" para entender el bloqueo.
        let motivoPendiente: "sin_oc" | "oc_pendiente" | "sin_stock" | "ok" | null = null;
        if (!puedeDespachar && cantPendiente > 0) {
          if (it.po_id == null && !yaConsumido && stockMat === 0) {
            motivoPendiente = "sin_oc";          // falta generar la OC
          } else if (it.po_id != null && !poRecibida && !yaConsumido) {
            motivoPendiente = "oc_pendiente";    // hay OC pero no se recibió
          } else {
            motivoPendiente = "sin_stock";       // stock insuficiente
          }
        } else if (puedeDespachar) {
          motivoPendiente = "ok";
        }
        return {
          ...it,
          _es_free: esFree,
          _es_consumido_almacen: esConsumidoAlmacen,
          _es_consumido_oc_abierta: esConsumidoOCAbierta,
          _es_free_oc_recibida: esFreeOCRecibida,
          _es_consumido_pend_despacho: esConsumidoPendDespacho,
          _es_mac_llegado_pend_despacho: esMacLlegadoPendDespacho,
          _cant_pendiente: cantPendiente,
          // Cuánto llegó para ESTA OT (basado en status de la OC, no en el
          // stock global del material). Es lo que la columna "Stock alm."
          // debería mostrar — el material.stock_actual es global y otras OTs
          // pueden haber consumido lo que llegó para ésta.
          _cant_llegada: cantLlegada,
          _puede_despachar: puedeDespachar,
          _po_status: poStatus,
          _po_recibida: poRecibida,
          _motivo_pendiente: motivoPendiente,
        };
      })
      .filter((it) =>
        it._cant_pendiente > 0
        || it._es_free_oc_recibida
        || it._es_consumido_pend_despacho
        || it._es_mac_llegado_pend_despacho,
      );

    type ItemConCalc = (typeof pendientes)[number];

    const grupos = new Map<number, {
      ot_id: number;
      // Código VISIBLE de la OT ("390126", "V014326", …) — string formateado,
      // no el entero crudo. El front lo usa para mostrar Y para filtrar; el
      // bug viejo ("This page couldn't load" al filtrar desde la vista
      // General) venía de mandar acá el número crudo: filtro.trim() sobre un
      // number reventaba el render.
      ot: string | null;
      cliente: string | null;
      descripcion_ot: string | null;
      flota: string | null;
      codigo_reparacion: string | null;
      recursos_status: string | null;
      ubicacion: string | null;
      items: ItemConCalc[];
      con_stock: number;
      sin_stock: number;
      // Totales de la OT (incluye los ya entregados / ya despachados).
      // Sirve para mostrar "X / Y items" en la UI y entender el avance global
      // sin importar si los reqs aprobados completos ya están fuera del listado.
      total_items_ot: number;
      items_entregados: number;
      items_sin_oc: number;
      items_oc_pendiente: number;
      items_sin_stock: number;
      // entregada = TODOS los repuestos de la OT ya salieron (la OT sigue acá
      // porque le quedan servicios pendientes u otros items no-físicos).
      estado_ot: "completa" | "incompleta" | "entregada";
      // Código crudo de la ubicación (catálogo Ubicacion) — la UI lo necesita
      // para el editor inline de ubicación.
      ubicacion_codigo: string | null;
      // Items YA entregados de la OT, con fecha y quién recibió — para la
      // sección "Entregados" de la fila expandida en /despachos.
      entregados: Array<{
        id: number; nro_req: string | null; item_req: number | null;
        codigo: string | null; descripcion: string | null;
        cantidad: number; unidad_medida: string | null;
        fecha: Date | null; persona: string | null;
      }>;
    }>();

    for (const it of pendientes) {
      // Despachos son a clientes externos: ignorar items de OT interna.
      if (it.ot_id == null) continue;
      const otId = it.ot_id;
      if (!grupos.has(otId)) {
        grupos.set(otId, {
          ot_id: otId,
          ot: it.orden_trabajo?.ot != null
            ? formatOtCodigo(it.orden_trabajo.ot, it.orden_trabajo.tipo_codigo)
            : null,
          cliente: it.orden_trabajo?.cliente?.nombre_comercial ?? it.orden_trabajo?.cliente?.razon_social ?? null,
          descripcion_ot: it.orden_trabajo?.descripcion ?? null,
          flota: it.orden_trabajo?.cod_rep_flota ?? null,
          codigo_reparacion: it.orden_trabajo?.codigo_reparacion?.codigo ?? null,
          recursos_status: it.orden_trabajo?.recursos_status_codigo ?? null,
          ubicacion: it.orden_trabajo?.ubicacion
            ? `${it.orden_trabajo.ubicacion.codigo} — ${it.orden_trabajo.ubicacion.nombre}`
            : null,
          ubicacion_codigo: it.orden_trabajo?.ubicacion_codigo ?? null,
          items: [],
          con_stock: 0,
          sin_stock: 0,
          total_items_ot: 0,
          items_entregados: 0,
          items_sin_oc: 0,
          items_oc_pendiente: 0,
          items_sin_stock: 0,
          estado_ot: "completa",
          entregados: [],
        });
      }
      const g = grupos.get(otId)!;
      // SERVICIOS: no figuran como items de despacho (no hay entrega física).
      // El item SER pendiente solo sirvió para crear/retener el grupo de la
      // OT — no se agrega al payload ni cuenta en stock/motivos.
      if (it.tipo_codigo === "SER") continue;
      if (it._puede_despachar) g.con_stock++;
      else g.sin_stock++;
      if (it._motivo_pendiente === "sin_oc") g.items_sin_oc++;
      if (it._motivo_pendiente === "oc_pendiente") g.items_oc_pendiente++;
      if (it._motivo_pendiente === "sin_stock") g.items_sin_stock++;
      g.items.push(it);
    }

    // Totales por OT incluyendo los ya entregados (no aparecen en `items`
    // del payload, solo se cuentan). Esto permite mostrar "6 / 7 items" en
    // la UI: el user ve el avance global y entiende cuánto falta.
    const otIds = Array.from(grupos.keys());
    if (otIds.length > 0) {
      const totalesPorOT = await prisma.oTRepuesto.groupBy({
        by: ["ot_id", "status_oc_codigo"],
        where: {
          ot_id: { in: otIds },
          // Excluimos anulados/desaprobados — son items "muertos", no cuentan
          // contra el avance del despacho.
          status_requerimiento_codigo: { notIn: ["ANULADO", "DESAPROBADO"] },
          // Solo REPUESTOS: los servicios no cuentan en el avance X/Y ni en
          // el estado del despacho (no hay entrega física de un servicio).
          OR: [{ tipo_codigo: null }, { tipo_codigo: { not: "SER" } }],
        },
        _count: { id: true },
      });
      for (const t of totalesPorOT) {
        if (t.ot_id == null) continue;
        const g = grupos.get(t.ot_id);
        if (!g) continue;
        g.total_items_ot += t._count.id;
        if (t.status_oc_codigo === "ENTREGADO" || t.status_oc_codigo === "COMPLETO") {
          g.items_entregados += t._count.id;
        }
      }

      // Detalle de los items ya entregados: fecha y quién recibió. La persona
      // vive en `persona_recibe` desde 2026-08-18; los despachos anteriores
      // solo la registraron dentro de `observaciones` ("… — recibe: NOMBRE"),
      // de ahí el fallback parseado (se toma la ÚLTIMA mención, que es la del
      // despacho más reciente del item).
      const personaDesdeObs = (obs: string | null): string | null => {
        if (!obs) return null;
        const matches = obs.match(/recibe:\s*([^·\n]+)/gi);
        if (!matches || matches.length === 0) return null;
        const persona = matches[matches.length - 1].replace(/recibe:\s*/i, "").trim();
        return persona || null;
      };
      const entregadosRows = await prisma.oTRepuesto.findMany({
        where: {
          ot_id: { in: otIds },
          status_requerimiento_codigo: { notIn: ["ANULADO", "DESAPROBADO"] },
          status_oc_codigo: { in: ["ENTREGADO", "COMPLETO"] },
          OR: [{ tipo_codigo: null }, { tipo_codigo: { not: "SER" } }],
        },
        select: {
          id: true, ot_id: true, nro_req: true, item_req: true, descripcion: true,
          material_id: true,
          cantidad: true, unidad_medida: true, fecha_salida_almacen: true,
          fecha_entrega_real: true, persona_recibe: true, observaciones: true,
          material: { select: { codigo: true, descripcion: true } },
        },
        orderBy: [{ fecha_salida_almacen: "desc" }, { nro_req: "asc" }, { item_req: "asc" }],
      });

      // Tercer fallback: el movimiento SALIDA del despacho registró
      // persona_recibe desde antes de que existiera la columna en el item.
      // Se matchea por documento_referencia ("REQ-{nro_req}") + material; el
      // registro es por req (no por item), así que items del mismo req
      // comparten receptor — en la práctica un despacho es una sola entrega.
      const refKeys = [...new Set(
        entregadosRows.filter((r) => r.nro_req).map((r) => `REQ-${r.nro_req}`),
      )];
      const movsConPersona = refKeys.length > 0
        ? await prisma.movimientoInventario.findMany({
            where: {
              tipo_movimiento: "SALIDA",
              persona_recibe: { not: null },
              documento_referencia: { in: refKeys },
            },
            select: { documento_referencia: true, material_id: true, persona_recibe: true },
            orderBy: { fecha_movimiento: "asc" }, // asc: el más reciente pisa al escribir el Map
          })
        : [];
      const personaPorMov = new Map<string, string>();
      for (const m of movsConPersona) {
        if (!m.persona_recibe) continue;
        personaPorMov.set(`${m.documento_referencia}|${m.material_id}`, m.persona_recibe);
        personaPorMov.set(`${m.documento_referencia}|*`, m.persona_recibe);
      }

      for (const r of entregadosRows) {
        if (r.ot_id == null) continue;
        const g = grupos.get(r.ot_id);
        if (!g) continue;
        g.entregados.push({
          id: r.id,
          nro_req: r.nro_req,
          item_req: r.item_req,
          codigo: r.material?.codigo ?? null,
          descripcion: r.material?.descripcion ?? r.descripcion ?? null,
          cantidad: Number(r.cantidad),
          unidad_medida: r.unidad_medida,
          fecha: r.fecha_salida_almacen ?? r.fecha_entrega_real,
          persona: r.persona_recibe
            ?? personaDesdeObs(r.observaciones)
            ?? personaPorMov.get(`REQ-${r.nro_req}|${r.material_id}`)
            ?? personaPorMov.get(`REQ-${r.nro_req}|*`)
            ?? null,
        });
      }
    }

    // Estado por OT — SOLO mira repuestos (pedido 2026-08-18):
    //   entregada   → sin repuestos pendientes y con al menos 1 ya entregado
    //                 (la OT sigue listada por sus servicios pendientes).
    //   completa    → todo lo pendiente tiene stock listo para despachar.
    //   incompleta  → falta material (aunque parte ya se haya entregado:
    //                 "2 de 3 sigue incompleto").
    // Las OTs SIN repuestos (solo servicios) se eliminan del listado.
    for (const [otId, g] of grupos) {
      if (g.total_items_ot === 0) {
        grupos.delete(otId);
        continue;
      }
      g.estado_ot = g.items.length === 0
        ? "entregada"
        : g.sin_stock === 0 && g.con_stock > 0 ? "completa" : "incompleta";
    }

    return NextResponse.json({ data: Array.from(grupos.values()) });
  } catch (error) {
    console.error("GET /api/despachos/ot error:", error);
    return NextResponse.json({ error: "Error al obtener despachos pendientes" }, { status: 500 });
  }
}
