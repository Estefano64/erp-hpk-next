// GET /api/proveedores/[id]/defaults-oc
//
// Devuelve los valores por defecto que el formulario de "Crear OC" debe
// usar cuando se selecciona este proveedor. Cascada:
//   1. Defaults configurados en el modelo Proveedor (campos *_default).
//   2. Si están NULL, inferir de la última OC con este proveedor
//      (tipo_pago, dias_credito, moneda_codigo, tiempo de entrega
//      promedio = fecha_entrega_real - fecha_solicitud).
//   3. Si no hay historial, devuelve null/undefined en esos campos.
//
// Respuesta:
//   {
//     proveedor: { id, razon_social, ruc, nombre_comercial },
//     defaults: {
//       moneda: string | null,
//       tipo_pago: string | null,
//       dias_credito: number | null,
//       tiempo_entrega_dias: number | null,   // sugerido (puede usarse para
//                                               // calcular fecha_entrega_esperada
//                                               // = hoy + tiempo_entrega_dias)
//       observaciones_sugeridas: string,      // ej. "RUC: 20XXX | Prov: ..."
//     },
//     fuente: { moneda: "default" | "historial" | null, ... }, // diagnóstico
//   }

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { parseInt4Safe } from "@/lib/ot-formato";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const token = await getToken({ req });
    if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { id } = await params;
    const provId = parseInt4Safe(id);
    if (provId == null || provId <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const proveedor = await prisma.proveedor.findUnique({
      where: { id: provId },
      select: {
        id: true, razon_social: true, ruc: true, nombre_comercial: true,
        moneda_default: true, tipo_pago_default: true,
        dias_credito_default: true, tiempo_entrega_dias: true,
        precios_incluyen_igv_default: true, aplica_igv_default: true,
      },
    });
    if (!proveedor) {
      return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });
    }

    // Tipo "fuente" para diagnosticar de dónde sale cada valor.
    type Fuente = "default" | "historial" | null;
    const fuente: Record<string, Fuente> = {
      moneda: null, tipo_pago: null, dias_credito: null, tiempo_entrega_dias: null,
      precios_incluyen_igv: null, aplica_igv: null,
    };

    // 1) Defaults del proveedor.
    let moneda: string | null = proveedor.moneda_default ?? null;
    let tipo_pago: string | null = proveedor.tipo_pago_default ?? null;
    let dias_credito: number | null = proveedor.dias_credito_default ?? null;
    let tiempo_entrega_dias: number | null = proveedor.tiempo_entrega_dias ?? null;
    let precios_incluyen_igv: boolean | null = proveedor.precios_incluyen_igv_default ?? null;
    let aplica_igv: boolean | null = proveedor.aplica_igv_default ?? null;
    if (moneda) fuente.moneda = "default";
    if (tipo_pago) fuente.tipo_pago = "default";
    if (dias_credito != null) fuente.dias_credito = "default";
    if (tiempo_entrega_dias != null) fuente.tiempo_entrega_dias = "default";
    if (precios_incluyen_igv != null) fuente.precios_incluyen_igv = "default";
    if (aplica_igv != null) fuente.aplica_igv = "default";

    // 2) Fallback al historial si algún campo quedó null.
    const necesitaHistorial =
      moneda == null || tipo_pago == null || dias_credito == null || tiempo_entrega_dias == null;
    if (necesitaHistorial) {
      const ultimaOC = await prisma.compra.findFirst({
        where: { proveedor_id: provId },
        orderBy: { fecha_solicitud: "desc" },
        select: {
          moneda_codigo: true, tipo_pago: true, dias_credito: true,
          fecha_solicitud: true, fecha_entrega_real: true,
          aplica_igv: true,
        },
      });
      if (ultimaOC) {
        if (moneda == null && ultimaOC.moneda_codigo) {
          moneda = ultimaOC.moneda_codigo;
          fuente.moneda = "historial";
        }
        if (tipo_pago == null && ultimaOC.tipo_pago) {
          tipo_pago = ultimaOC.tipo_pago;
          fuente.tipo_pago = "historial";
        }
        if (dias_credito == null && ultimaOC.dias_credito != null) {
          dias_credito = ultimaOC.dias_credito;
          fuente.dias_credito = "historial";
        }
        if (aplica_igv == null && ultimaOC.aplica_igv != null) {
          aplica_igv = ultimaOC.aplica_igv;
          fuente.aplica_igv = "historial";
        }
        // precios_incluyen_igv no se guarda en Compra (es solo flag del UI
        // editor que controla cómo se ingresan los precios). Sin historial.
        // Tiempo promedio de entrega: solo si la OC tiene entrega real.
        if (
          tiempo_entrega_dias == null &&
          ultimaOC.fecha_entrega_real &&
          ultimaOC.fecha_solicitud
        ) {
          const dias = Math.max(0, Math.round(
            (new Date(ultimaOC.fecha_entrega_real).getTime() -
              new Date(ultimaOC.fecha_solicitud).getTime()) / (1000 * 60 * 60 * 24),
          ));
          if (dias > 0 && dias <= 365) {
            tiempo_entrega_dias = dias;
            fuente.tiempo_entrega_dias = "historial";
          }
        }
      }
    }

    // Observaciones sugeridas — texto que el frontend puede pre-llenar.
    const obsParts: string[] = [];
    obsParts.push(`RUC: ${proveedor.ruc}`);
    obsParts.push(`Prov: ${proveedor.nombre_comercial ?? proveedor.razon_social}`);
    const observaciones_sugeridas = obsParts.join(" | ");

    return NextResponse.json({
      proveedor: {
        id: proveedor.id,
        razon_social: proveedor.razon_social,
        ruc: proveedor.ruc,
        nombre_comercial: proveedor.nombre_comercial,
      },
      defaults: {
        moneda,
        tipo_pago,
        dias_credito,
        tiempo_entrega_dias,
        precios_incluyen_igv,
        aplica_igv,
        observaciones_sugeridas,
      },
      fuente,
    });
  } catch (e) {
    console.error("GET /api/proveedores/[id]/defaults-oc error:", e);
    return NextResponse.json({ error: "Error al obtener defaults" }, { status: 500 });
  }
}
