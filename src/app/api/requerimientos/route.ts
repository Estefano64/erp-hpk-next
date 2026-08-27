import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseOtCodigoSearch } from "@/lib/ot-formato";
import { calcularStockReservado } from "@/lib/stock-reservado";

// GET /api/requerimientos — listado cross-OT con filtros, para módulo global de Logística.
//
// Query params soportados:
//   ot_id              número exacto
//   ot                 string (busca dentro de orden_trabajo.ot, contains)
//   status_req         código exacto del status_requerimiento
//   status_cot         código exacto del status_cotizacion
//   status_oc          código exacto del status_oc
//   tipo               MAC | CAD | SER
//   proveedor_id       número exacto
//   fecha_desde        ISO (filtra fecha_solicitud >= )
//   fecha_hasta        ISO (filtra fecha_solicitud <= )
//   solo_aprobados_sin_oc   "1" → status_req=APROBADO AND po_id IS NULL (útil para "items elegibles para OC")
//   search             texto: busca en descripcion / texto / nro_req / nro_oc / material_codigo
//   page, limit        paginación (default 1, 100)
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, Number(sp.get("page") ?? 1));
    const limit = Math.min(10000, Math.max(1, Number(sp.get("limit") ?? 100)));

    const where: Record<string, unknown> = {
      // Excluir items "libres" agregados desde el editor de OC — esos
      // solo deben figurar en el PDF/editor de la OC, no como reqs.
      // Usamos AND para no chocar con el OR de search/ot que se setea abajo.
      AND: [{ OR: [{ solo_para_oc: false }, { solo_para_oc: null }] }],
    };
    const otId = sp.get("ot_id");
    if (otId) where.ot_id = Number(otId);

    const ot = sp.get("ot")?.trim();
    if (ot) {
      // Acepta "390126" (raw) o "V000126" / "S000126" / "OI000126" (formato
      // visible). Si matchea una OT externa la buscamos ahí; si no, podría
      // ser una interna — probamos en ambas vías con OR.
      const otNum = parseOtCodigoSearch(ot);
      if (otNum != null) {
        const otOR = [
          { orden_trabajo: { ot: otNum } },
          { orden_trabajo_interna: { ot: otNum } },
        ];
        // Va como bloque dentro del AND para no pisar (ni ser pisado por)
        // el OR del search de texto libre.
        (where.AND as unknown[]).push({ OR: otOR });
      }
    }

    const statusReq = sp.get("status_req")?.trim();
    if (statusReq) where.status_requerimiento_codigo = statusReq;

    const statusCot = sp.get("status_cot")?.trim();
    if (statusCot) where.status_cotizacion_codigo = statusCot;

    const statusOC = sp.get("status_oc")?.trim();
    if (statusOC) where.status_oc_codigo = statusOC;

    const tipo = sp.get("tipo")?.trim();
    if (tipo) where.tipo_codigo = tipo;

    const proveedorId = sp.get("proveedor_id");
    if (proveedorId) where.proveedor_id = Number(proveedorId);

    const desde = sp.get("fecha_desde") ?? sp.get("sol_desde");
    const hasta = sp.get("fecha_hasta") ?? sp.get("sol_hasta");
    if (desde || hasta) {
      const range: Record<string, Date> = {};
      if (desde) range.gte = new Date(desde);
      if (hasta) range.lte = new Date(hasta);
      where.fecha_solicitud = range;
    }
    const reqDesde = sp.get("req_desde");
    const reqHasta = sp.get("req_hasta");
    if (reqDesde || reqHasta) {
      const range: Record<string, Date> = {};
      if (reqDesde) range.gte = new Date(reqDesde);
      if (reqHasta) range.lte = new Date(reqHasta);
      where.fecha_requerida = range;
    }

    if (sp.get("solo_aprobados_sin_oc") === "1") {
      where.status_requerimiento_codigo = "APROBADO";
      where.po_id = null;
    }

    const search = sp.get("search")?.trim();
    if (search) {
      // Si el texto parece un número/código de OT ("390126" / "V000126" /
      // "OI000126"), también matchea por la OT externa o interna del req.
      const searchOtNum = parseOtCodigoSearch(search);
      (where.AND as unknown[]).push({
        OR: [
          ...(searchOtNum != null
            ? [{ orden_trabajo: { ot: searchOtNum } }, { orden_trabajo_interna: { ot: searchOtNum } }]
            : []),
          { descripcion: { contains: search, mode: "insensitive" } },
          { texto: { contains: search, mode: "insensitive" } },
          { nro_req: { contains: search, mode: "insensitive" } },
          { nro_oc: { contains: search, mode: "insensitive" } },
          { material_codigo: { contains: search, mode: "insensitive" } },
        ],
      });
    }

    const soloAprobadosSinOC = sp.get("solo_aprobados_sin_oc") === "1";

    // Relaciones que consumen los listados (mismas en modo full y slim).
    const relaciones = {
      orden_trabajo: {
        select: {
          id: true, ot: true, tipo_codigo: true,
          descripcion: true,
          cod_rep_flota: true,
          cliente: { select: { codigo: true, razon_social: true, nombre_comercial: true } },
          codigo_reparacion: { select: { codigo: true, descripcion: true } },
        },
      },
      // Para items que pertenecen a una OT interna (orden_trabajo es null),
      // traemos los datos de la OT interna así el frontend puede renderear
      // el código OIXXXXYY en lugar de mostrar la fila vacía.
      orden_trabajo_interna: {
        select: { id: true, ot: true, descripcion: true },
      },
      // `ubicacion` (campo libre legacy de Material) es lo que consumen las
      // columnas "Ubicación almacén" del detalle y el fallback del despacho
      // por OT — sin él, los items amarillos (con stock disponible) no
      // muestran dónde está el material físicamente.
      material: { select: { codigo: true, descripcion: true, unidad_medida_codigo: true, stock_actual: true, np: true, precio: true, moneda_codigo: true, ubicacion: true } },
      // Ubicación física en el almacén HP&K: zona (HER/SUM/REP/STO) +
      // celda (A1, B2...). Visible como columna en /requerimientos.
      almacen_zona: { select: { codigo: true, nombre: true } },
      almacen_posicion: { select: { codigo: true } },
      status_requerimiento: { select: { codigo: true, nombre: true } },
      status_cotizacion: { select: { codigo: true, nombre: true } },
      status_oc: { select: { codigo: true, nombre: true } },
      proveedor: { select: { id: true, razon_social: true } },
      compra: {
        select: {
          id: true, numero_po: true, status_oc_codigo: true,
          // Datos de la aceptación de la OC — visibles en /requerimientos/detalle
          // como tooltip/columna separada del comentario de aprobación del req.
          usuario_aprueba: true,
          comentario_aprobacion: true,
        },
      },
      adjuntos: { select: { id: true, nombre_archivo: true, r2_key: true, tamano: true } },
    } as const;

    // Modo slim (?slim=1): en vez de TODOS los escalares de OTRepuesto (~70
    // columnas, varios TEXT), solo los campos que consume la tabla de
    // /requerimientos/detalle (su interface RequerimientoApi). Con 800+ filas
    // el modo full pesa ~2 MB por carga; el slim baja a menos de la mitad.
    const slim = sp.get("slim") === "1";
    const orderBy = [{ fecha_solicitud: "desc" as const }, { id: "desc" as const }];
    const skip = (page - 1) * limit;
    const listQuery = slim
      ? prisma.oTRepuesto.findMany({
          where,
          select: {
            id: true, ot_id: true, orden_trabajo_interna_id: true,
            material_id: true, material_codigo: true,
            nro_req: true, item_req: true, tipo_codigo: true,
            cantidad: true, cantidad_recibida: true,
            descripcion: true, fabricante_codigo: true, unidad_medida: true,
            fecha_solicitud: true, fecha_requerida: true,
            precio_unitario: true, moneda: true,
            po_id: true, nro_oc: true, observaciones: true,
            // fecha_aprobacion: alimenta la columna "Días s/OC" (antigüedad de
            // aprobados sin comprar) en /requerimientos/detalle.
            usuario_aprueba: true, comentario_aprobacion: true, fecha_aprobacion: true,
            status_requerimiento_codigo: true, status_cotizacion_codigo: true, status_oc_codigo: true,
            ...relaciones,
          },
          orderBy, skip, take: limit,
        })
      : prisma.oTRepuesto.findMany({
          where,
          include: relaciones,
          orderBy, skip, take: limit,
        });
    const [dataRaw, totalRaw] = await Promise.all([
      listQuery,
      prisma.oTRepuesto.count({ where }),
    ]);

    // Cuando el flag "solo aprobados sin OC" está activo (lo usa el tab
    // "Requerimientos Aprobados" del editor de OC), excluímos los items que
    // ya fueron despachados completamente desde almacén. El despacho-OT y el
    // ingreso-po ambos incrementan cantidad_recibida; si llegó a cantidad
    // ya no hay nada que comprar — no debe aparecer como elegible para OC.
    // Prisma no soporta bien comparar dos columnas del mismo modelo en `where`,
    // así que filtramos post-fetch y ajustamos el total acorde.
    let data = dataRaw;
    let total = totalRaw;
    if (soloAprobadosSinOC) {
      data = dataRaw.filter((r) => {
        const cantidad = Number(r.cantidad);
        const recibida = Number(r.cantidad_recibida ?? 0);
        return Number.isFinite(cantidad) && recibida < cantidad;
      });
      total = data.length;
    }

    // ── Matches probables por NP para reqs sin material vinculado ────────
    // Un req que se creó como CAD (texto libre) pero tiene un NP embebido en
    // su descripción/texto podría corresponder a un material del catálogo.
    // Ejemplo: "Lainas, ED3755" → material 001149 (LAINAS, NP=ED3755). El
    // frontend usa este dato para: (a) resaltar la fila si el match tiene
    // stock suficiente, (b) sugerir Vincular con un click.
    // Extraemos tokens candidatos con al menos 4 chars y al menos un dígito
    // (patrón típico de NP). El match final se hace con NP exacto (case-insensitive)
    // para evitar falsos positivos con palabras comunes.
    const sinMaterial = data.filter((r) => r.material_id == null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matchesPorReq = new Map<number, any[]>();
    if (sinMaterial.length > 0) {
      const tokenRegex = /\b[A-Za-z0-9-]{4,}\b/g;
      const tokensPorReq = new Map<number, Set<string>>();
      const tokensGlobal = new Set<string>();
      for (const r of sinMaterial) {
        // `texto` es un campo del modelo OTRepuesto, pero según la versión de
        // Prisma client generada en algunos deploys puede no aparecer en el
        // tipo derivado (drift entre schema y client generado). Lo leemos
        // vía bracket + cast para desanclar del tipo inferido — el runtime
        // funciona igual porque Prisma devuelve el campo si existe en la BD.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const texto = ((r as any).texto as string | null | undefined) ?? "";
        const bag = `${r.descripcion ?? ""} ${texto}`;
        const tokens = new Set<string>();
        for (const m of bag.matchAll(tokenRegex)) {
          const t = m[0];
          if (/\d/.test(t)) tokens.add(t.toUpperCase());
        }
        if (tokens.size > 0) {
          tokensPorReq.set(r.id, tokens);
          for (const t of tokens) tokensGlobal.add(t);
        }
      }
      if (tokensGlobal.size > 0) {
        const matsCandidatos = await prisma.material.findMany({
          where: {
            activo: true,
            OR: [
              { np: { in: [...tokensGlobal], mode: "insensitive" } },
              { codigo: { in: [...tokensGlobal], mode: "insensitive" } },
            ],
          },
          select: {
            material_id: true, codigo: true, descripcion: true, np: true,
            stock_actual: true, unidad_medida_codigo: true, precio: true, moneda_codigo: true,
          },
        });
        // Indexamos por NP y por código (ambos uppercase) para lookup rápido.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const idxNp = new Map<string, any[]>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const idxCod = new Map<string, any[]>();
        for (const m of matsCandidatos) {
          if (m.np) {
            const k = m.np.toUpperCase();
            if (!idxNp.has(k)) idxNp.set(k, []);
            idxNp.get(k)!.push(m);
          }
          if (m.codigo) {
            const k = m.codigo.toUpperCase();
            if (!idxCod.has(k)) idxCod.set(k, []);
            idxCod.get(k)!.push(m);
          }
        }
        for (const [reqId, tokens] of tokensPorReq) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const found: any[] = [];
          const seen = new Set<number>();
          for (const t of tokens) {
            for (const arr of [idxNp.get(t) ?? [], idxCod.get(t) ?? []]) {
              for (const m of arr) {
                if (!seen.has(m.material_id)) {
                  seen.add(m.material_id);
                  found.push(m);
                }
              }
            }
          }
          if (found.length > 0) matchesPorReq.set(reqId, found);
        }
      }
    }
    // ── Stock reservado a OTs ───────────────────────────────────────────
    // `Material.stock_actual` incluye el material que ya llegó de una OC y
    // está en el almacén pero pertenece a una OT concreta (todavía sin
    // despachar al técnico). Ese material NO es stock libre: si lo ofrecemos
    // como "hay stock, consumí de almacén" para otra OT, el cruce es erróneo.
    // Mandamos el reservado por material para que la UI calcule
    // stock_libre = stock_actual − reservado.
    const materialIdsPayload = [
      ...new Set([
        ...data.map((r) => r.material_id).filter((x): x is number => x != null),
        ...[...matchesPorReq.values()].flat().map((m) => m.material_id as number),
      ]),
    ];
    const reservadoPorMaterial = await calcularStockReservado(prisma, materialIdsPayload);

    // Adjuntamos el campo al payload sin modificar reqs con material_id ya seteado.
    const dataConMatches = data.map((r) => {
      const res = r.material_id != null ? reservadoPorMaterial.get(r.material_id) : undefined;
      return {
        ...r,
        _matches_probables: matchesPorReq.get(r.id)?.map((m) => {
          const resM = reservadoPorMaterial.get(m.material_id as number);
          return {
            ...m,
            _stock_reservado: resM?.cantidad ?? 0,
            _stock_reservado_ots: resM?.ots ?? [],
          };
        }) ?? undefined,
        _stock_reservado: res?.cantidad ?? 0,
        _stock_reservado_ots: res?.ots ?? [],
      };
    });

    return NextResponse.json({ data: dataConMatches, total, page });
  } catch (error) {
    console.error("GET /api/requerimientos error:", error);
    return NextResponse.json({ error: "Error al obtener requerimientos" }, { status: 500 });
  }
}
