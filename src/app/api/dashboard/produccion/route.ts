// GET /api/dashboard/produccion
//
// Agregados para el dashboard de Producción (KPIs de taller). Réplica del
// dashboard Excel "STATUS 2026 HPK kpi" que manejaba el área:
//   - WIP: componentes en taller por status y por modelo (flota)
//   - Ingresos de componentes por mes (fecha_recepcion)
//   - Entregas por mes (fecha_despacho, con respaldo en fecha_entrega y
//     fecha_facturacion — históricamente solo facturación se llenó bien)
//   - Días promedio en taller y días promedio de evaluación, por cliente
//   - Estándar vs No estándar (caracteristica_cilindro) de lo recibido
//   - Componentes reparados (histórico) del modelo seleccionado
//
// Query params:
//   ?anio=2026        obligatorio (rige ingresos/entregas/días/estándar)
//   ?modelo=930E-4SE  opcional — para el chart de componentes reparados;
//                     si no viene, se usa la flota con más entregas históricas.
//
// Todo se calcula con agregados SQL en un solo Promise.all (patrón tanda 3).

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import dayjs from "dayjs";

// Estados de taller que cuentan como "en taller" (WIP), en orden de flujo.
// Entregado y Cobranza son post-taller y quedan fuera del WIP.
const WIP_STATUS = [
  "Pdt Evaluación",
  "Programado Evaluación",
  "Pdt proceso",
  "Programado Proceso",
  "Terminado",
] as const;

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const sp = req.nextUrl.searchParams;
    const anio = Number(sp.get("anio") ?? dayjs().year());
    const modeloParam = sp.get("modelo")?.trim() || null;
    if (!Number.isFinite(anio) || anio < 2020 || anio > 2100) {
      return NextResponse.json({ error: "anio inválido" }, { status: 400 });
    }
    const desde = new Date(Date.UTC(anio, 0, 1));
    const hasta = new Date(Date.UTC(anio + 1, 0, 1));

    type StatusRow = { status: string; n: number };
    type ModeloRow = { modelo: string; n: number };
    type TipoRow = { tipo: string; n: number };
    type MesRow = { mes: number; n: number };
    type ClienteRow = { cliente: string; dias: number; n: number };
    type CompRow = { componente: string; n: number };
    type FlotaRow = { modelo: string };

    const [wipStatus, wipModelo, tipoRep, ingresosMes, entregadosMes, diasTaller, diasEval, modelos] =
      await Promise.all([
        // ── WIP por status de taller ─────────────────────────────────────
        prisma.$queryRaw<StatusRow[]>`
          SELECT taller_status_codigo AS status, COUNT(*)::int AS n
          FROM orden_trabajo
          WHERE activo = true
            AND taller_status_codigo IN ('Pdt Evaluación','Programado Evaluación','Pdt proceso','Programado Proceso','Terminado')
          GROUP BY 1
        `,
        // ── WIP por modelo (flota) ───────────────────────────────────────
        prisma.$queryRaw<ModeloRow[]>`
          SELECT COALESCE(NULLIF(TRIM(cod_rep_flota), ''), 'SIN FLOTA') AS modelo, COUNT(*)::int AS n
          FROM orden_trabajo
          WHERE activo = true
            AND taller_status_codigo IN ('Pdt Evaluación','Programado Evaluación','Pdt proceso','Programado Proceso','Terminado')
          GROUP BY 1
          ORDER BY 2 DESC
        `,
        // ── Estándar vs No estándar de lo RECIBIDO en el año ─────────────
        prisma.$queryRaw<TipoRow[]>`
          SELECT COALESCE(caracteristica_cilindro, 'SIN DATO') AS tipo, COUNT(*)::int AS n
          FROM orden_trabajo
          WHERE activo = true
            AND fecha_recepcion >= ${desde} AND fecha_recepcion < ${hasta}
          GROUP BY 1
        `,
        // ── Ingresos por mes (fecha_recepcion) ───────────────────────────
        prisma.$queryRaw<MesRow[]>`
          SELECT EXTRACT(MONTH FROM fecha_recepcion)::int AS mes, COUNT(*)::int AS n
          FROM orden_trabajo
          WHERE activo = true
            AND fecha_recepcion >= ${desde} AND fecha_recepcion < ${hasta}
          GROUP BY 1
        `,
        // ── Entregas por mes (despacho → entrega → facturación) ──────────
        prisma.$queryRaw<MesRow[]>`
          SELECT EXTRACT(MONTH FROM COALESCE(fecha_despacho, fecha_entrega, fecha_facturacion))::int AS mes,
                 COUNT(*)::int AS n
          FROM orden_trabajo
          WHERE activo = true
            AND taller_status_codigo IN ('Entregado','Cobranza')
            AND COALESCE(fecha_despacho, fecha_entrega, fecha_facturacion) >= ${desde}
            AND COALESCE(fecha_despacho, fecha_entrega, fecha_facturacion) < ${hasta}
          GROUP BY 1
        `,
        // ── Días promedio en taller por cliente (entregas del año) ───────
        // Se excluyen fechas incoherentes (salida anterior a la recepción).
        prisma.$queryRaw<ClienteRow[]>`
          SELECT COALESCE(c.nombre_comercial, c.razon_social, 'SIN CLIENTE') AS cliente,
                 AVG((COALESCE(ot.fecha_despacho, ot.fecha_entrega, ot.fecha_facturacion))::date - ot.fecha_recepcion::date)::float AS dias,
                 COUNT(*)::int AS n
          FROM orden_trabajo ot
          LEFT JOIN cliente c ON c.cliente_id = ot.id_cliente
          WHERE ot.activo = true
            AND ot.taller_status_codigo IN ('Entregado','Cobranza')
            AND ot.fecha_recepcion IS NOT NULL
            AND COALESCE(ot.fecha_despacho, ot.fecha_entrega, ot.fecha_facturacion) >= ${desde}
            AND COALESCE(ot.fecha_despacho, ot.fecha_entrega, ot.fecha_facturacion) < ${hasta}
            AND COALESCE(ot.fecha_despacho, ot.fecha_entrega, ot.fecha_facturacion) >= ot.fecha_recepcion
          GROUP BY 1
          ORDER BY 2 DESC
        `,
        // ── Días promedio de evaluación por cliente (evaluadas en el año) ─
        prisma.$queryRaw<ClienteRow[]>`
          SELECT COALESCE(c.nombre_comercial, c.razon_social, 'SIN CLIENTE') AS cliente,
                 AVG(ot.fecha_evaluacion::date - ot.fecha_recepcion::date)::float AS dias,
                 COUNT(*)::int AS n
          FROM orden_trabajo ot
          LEFT JOIN cliente c ON c.cliente_id = ot.id_cliente
          WHERE ot.activo = true
            AND ot.fecha_recepcion IS NOT NULL
            AND ot.fecha_evaluacion >= ${desde} AND ot.fecha_evaluacion < ${hasta}
            AND ot.fecha_evaluacion >= ot.fecha_recepcion
          GROUP BY 1
          ORDER BY 2 DESC
        `,
        // ── Modelos disponibles para el selector ─────────────────────────
        prisma.$queryRaw<FlotaRow[]>`
          SELECT DISTINCT TRIM(cod_rep_flota) AS modelo
          FROM orden_trabajo
          WHERE activo = true AND cod_rep_flota IS NOT NULL AND TRIM(cod_rep_flota) <> ''
          ORDER BY 1
        `,
      ]);

    // Modelo para el chart de componentes: el pedido o el de más entregas.
    let modelo = modeloParam;
    if (!modelo) {
      const [top] = await prisma.$queryRaw<ModeloRow[]>`
        SELECT TRIM(cod_rep_flota) AS modelo, COUNT(*)::int AS n
        FROM orden_trabajo
        WHERE activo = true AND taller_status_codigo IN ('Entregado','Cobranza')
          AND cod_rep_flota IS NOT NULL AND TRIM(cod_rep_flota) <> ''
        GROUP BY 1 ORDER BY 2 DESC LIMIT 1
      `;
      modelo = top?.modelo ?? null;
    }

    // Componentes reparados del modelo (HISTÓRICO completo, como el Excel —
    // no se filtra por año porque el volumen anual por modelo es chico).
    const componentesModelo = modelo
      ? await prisma.$queryRaw<CompRow[]>`
          SELECT COALESCE(NULLIF(TRIM(descripcion), ''), 'SIN DESCRIPCIÓN') AS componente, COUNT(*)::int AS n
          FROM orden_trabajo
          WHERE activo = true
            AND taller_status_codigo IN ('Entregado','Cobranza')
            AND TRIM(cod_rep_flota) = ${modelo}
          GROUP BY 1
          ORDER BY 2 DESC
          LIMIT 12
        `
      : [];

    // Ordenar WIP por flujo de taller y armar arrays de 12 meses.
    const wipPorStatus = WIP_STATUS
      .map((s) => ({ status: s, n: wipStatus.find((r) => r.status === s)?.n ?? 0 }));
    const porMes = (rows: MesRow[]) => {
      const arr = Array(12).fill(0);
      for (const r of rows) arr[r.mes - 1] = r.n;
      return arr;
    };
    const ingresosPorMes = porMes(ingresosMes);
    const entregadosPorMes = porMes(entregadosMes);

    const enTaller = wipPorStatus.reduce((s, r) => s + r.n, 0);
    const pond = (rows: ClienteRow[]) => {
      const n = rows.reduce((s, r) => s + r.n, 0);
      return n ? rows.reduce((s, r) => s + r.dias * r.n, 0) / n : 0;
    };

    return NextResponse.json({
      kpis: {
        enTaller,
        ingresosAnio: ingresosPorMes.reduce((s, n) => s + n, 0),
        entregadosAnio: entregadosPorMes.reduce((s, n) => s + n, 0),
        promDiasTaller: pond(diasTaller),
        promDiasEvaluacion: pond(diasEval),
      },
      wipPorStatus,
      wipPorModelo: wipModelo,
      tipoReparacion: tipoRep,
      ingresosPorMes,
      entregadosPorMes,
      diasTallerPorCliente: diasTaller,
      diasEvaluacionPorCliente: diasEval,
      componentesModelo,
      modelos: modelos.map((m) => m.modelo),
      meta: { anio, modelo },
    });
  } catch (e) {
    console.error("GET /api/dashboard/produccion error:", e);
    return NextResponse.json({ error: "Error al obtener datos" }, { status: 500 });
  }
}
