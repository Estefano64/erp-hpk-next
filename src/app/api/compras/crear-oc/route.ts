import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseDateOnly } from "@/lib/dates";
import { getAuditUser } from "@/lib/audit";
import { recalcularRecursosStatusOT, recalcularRecursosStatusOTInterna } from "@/lib/recursos-ot";

const Schema = z.object({
  repuesto_ids: z.array(z.coerce.number().int().positive()).min(1),
  proveedor_id: z.coerce.number().int().positive(),
  moneda: z.string().trim().optional().nullable(),
  fecha_entrega_esperada: z.string().optional().nullable(),
  observaciones: z.string().optional().nullable(),
  nombre: z.string().trim().max(300).optional().nullable(),
  ubicacion_codigo: z.string().optional().nullable(),
  almacen_id: z.string().optional().nullable(),
  usuario: z.string().trim().optional().nullable(),
  // Tipo de pago. Códigos sugeridos: CONTADO, CREDITO, ADELANTO,
  // CHEQUE_FECHADO, TRANSFERENCIA. Texto libre si el front quiere otra cosa.
  tipo_pago: z.string().trim().max(30).optional().nullable(),
  // Plazo en días (solo CREDITO/CHEQUE_FECHADO). null/0 para CONTADO.
  dias_credito: z.coerce.number().int().min(0).max(365).optional().nullable(),
  // ── Campos extra del editor de OC, opcionales al crear ──────────────
  // Ref. pedido (numero_req): texto libre que aparece en el header del PDF.
  ref_pedido: z.string().trim().max(500).optional().nullable(),
  // Flag IGV por-OC. Default true (estándar).
  aplica_igv: z.boolean().optional(),
  // Descuento en moneda de la OC, se RESTA del subtotal antes de calcular IGV.
  descuento: z.coerce.number().min(0).optional(),
  // "Otros" (flete, manipuleo, etc.). Se SUMA o RESTA al total según `otros_signo`.
  otros: z.coerce.number().min(0).optional(),
  otros_signo: z.enum(["+", "-"]).optional(),
  // Cantidades override por OTRepuesto.id → cantidad. Si no viene, se usa
  // la cantidad original del req. Permite ajustar al alza/baja en el momento
  // de comprar sin modificar el req base.
  cantidades_override: z.record(z.string(), z.coerce.number().min(0.0001)).optional(),
});

const IGV_PCT = new Prisma.Decimal("0.18");
const ONE_PLUS_IGV = new Prisma.Decimal(1).plus(IGV_PCT);
const MAX_NUMERO_PO_RETRIES = 5;

// Genera el próximo numero_po con formato {YY}{NNNN} (correlativo global por año).
// El prefijo "D" fue removido por pedido del usuario — ahora empieza con el año.
async function siguienteNumeroPO(tx: Prisma.TransactionClient, prefix: string): Promise<string> {
  const ultima = await tx.compra.findFirst({
    where: { numero_po: { startsWith: prefix } },
    orderBy: { numero_po: "desc" },
    select: { numero_po: true },
  });
  let seq = 1;
  if (ultima) {
    const lastNum = parseInt(ultima.numero_po.substring(prefix.length), 10);
    if (!Number.isNaN(lastNum)) seq = lastNum + 1;
  }
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validación", detail: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const d = parsed.data;
    const ubicacion_codigo = d.ubicacion_codigo ?? d.almacen_id ?? null;
    const monedaInput = (d.moneda ?? "USD").toUpperCase();
    const moneda_codigo = monedaInput === "PEN" ? "SOL" : monedaInput;
    // Tomar el nombre del usuario logueado (NextAuth) para que aparezca en el
    // PDF como "Elaborado por" y matchee con la firma en /public/firmas/.
    // El campo `usuario` del body queda como fallback por compatibilidad.
    const usuarioSesion = await getAuditUser(req);
    const usuario = usuarioSesion || d.usuario || "Logistica";

    // Antes era "D26", ahora solo "26" (los 2 dígitos del año).
    const prefix = new Date().getFullYear().toString().slice(-2);

    const result = await prisma.$transaction(async (tx) => {
      // Cargamos sólo requerimientos que NO estén ya asignados a una OC.
      const repuestos = await tx.oTRepuesto.findMany({
        where: { id: { in: d.repuesto_ids }, po_id: null },
        include: {
          orden_trabajo: { select: { id: true, ot: true } },
          orden_trabajo_interna: { select: { id: true, ot: true } },
        },
      });
      if (repuestos.length === 0) {
        throw Object.assign(
          new Error("Ninguno de los requerimientos está disponible (todos ya tienen OC)"),
          { code: "NO_DISPONIBLES" },
        );
      }
      if (repuestos.length !== d.repuesto_ids.length) {
        const encontrados = new Set(repuestos.map((r) => r.id));
        const faltantes = d.repuesto_ids.filter((id) => !encontrados.has(id));
        throw Object.assign(
          new Error(`Requerimientos no disponibles (ya asignados o inexistentes): ${faltantes.join(", ")}`),
          { code: "PARCIAL" },
        );
      }

      // Validación: TODO ítem debe tener precio_unitario > 0 antes de crear la OC.
      const sinPrecio = repuestos.filter((r) => {
        const p = Number(r.precio_unitario ?? 0);
        return !Number.isFinite(p) || p <= 0;
      });
      if (sinPrecio.length > 0) {
        const labels = sinPrecio
          .map((r) => `${r.nro_req ?? `#${r.id}`}/${r.item_req ?? "-"}`)
          .join(", ");
        throw Object.assign(
          new Error(
            `No se puede crear la OC: ${sinPrecio.length} item(s) sin precio unitario (${labels}). Asigná un precio antes de generar la OC.`,
          ),
          {
            code: "SIN_PRECIO",
            sin_precio_ids: sinPrecio.map((r) => r.id),
          },
        );
      }

      // Calcular totales con Prisma.Decimal para no perder precisión.
      // `cantidades_override` permite usar una cantidad distinta a la del req
      // (ajuste al alza/baja al momento de comprar). Solo se aplica si el id
      // del req está en el mapa; si no, se usa rep.cantidad.
      const overrideCant = d.cantidades_override ?? {};
      const aplicaIgv = d.aplica_igv ?? true;
      const igvFactor = aplicaIgv ? IGV_PCT : new Prisma.Decimal(0);
      const onePlusIgv = aplicaIgv ? ONE_PLUS_IGV : new Prisma.Decimal(1);

      let subtotal = new Prisma.Decimal(0);
      const detallesData: Prisma.CompraDetalleCreateManyInput[] = [];

      for (const rep of repuestos) {
        const precio = new Prisma.Decimal(rep.precio_unitario ?? 0);
        const cantSrc = overrideCant[String(rep.id)] ?? rep.cantidad;
        const cant = new Prisma.Decimal(cantSrc);
        const itemSub = precio.mul(cant);
        subtotal = subtotal.plus(itemSub);

        if (rep.material_id) {
          const itemImp = itemSub.mul(igvFactor);
          const itemTotal = itemSub.mul(onePlusIgv);
          detallesData.push({
            compra_id: 0, // se setea tras crear la compra
            material_id: rep.material_id,
            cantidad: cant,
            precio_unitario: precio,
            subtotal: itemSub,
            impuesto: itemImp,
            total: itemTotal,
          });
        }
      }

      // Descuento + "otros" (signo configurable) se aplican a nivel cabecera.
      const descuento = new Prisma.Decimal(d.descuento ?? 0);
      const otrosVal = new Prisma.Decimal(d.otros ?? 0);
      const otrosFirmado = d.otros_signo === "-" ? otrosVal.neg() : otrosVal;
      // Base imponible = subtotal - descuento (no puede ir bajo 0).
      const baseImponible = Prisma.Decimal.max(new Prisma.Decimal(0), subtotal.minus(descuento));
      const impuesto = baseImponible.mul(igvFactor);
      const total = baseImponible.plus(impuesto).plus(otrosFirmado);

      // Construir el nombre descriptivo: "OT-{codigos} · {Proveedor}".
      // Si vino del cliente lo respetamos; si no, lo auto-generamos.
      // `ot` ahora es number — lo casteamos a string para mostrar como código.
      const otsUnicas = [...new Set(repuestos.map((r) => r.orden_trabajo?.ot != null ? String(r.orden_trabajo.ot) : null).filter(Boolean) as string[])];
      const proveedor = await tx.proveedor.findUnique({
        where: { id: d.proveedor_id },
        select: { razon_social: true, nombre_comercial: true },
      });
      const provLabel = proveedor?.nombre_comercial ?? proveedor?.razon_social ?? `Prov.${d.proveedor_id}`;
      const otsLabel = otsUnicas.length === 0
        ? "Sin OT"
        : otsUnicas.length <= 3
        ? `OT ${otsUnicas.join(", ")}`
        : `OT ${otsUnicas.slice(0, 3).join(", ")} +${otsUnicas.length - 3}`;
      const nombreAuto = `${otsLabel} · ${provLabel}`;
      const nombreFinal = (d.nombre?.trim() || nombreAuto).slice(0, 300);

      // Generar numero_po con reintento por colisión P2002.
      let compraCreada: Awaited<ReturnType<typeof tx.compra.create>> | null = null;
      let lastError: unknown = null;
      for (let intento = 0; intento < MAX_NUMERO_PO_RETRIES; intento++) {
        const numero_po = await siguienteNumeroPO(tx, prefix);
        try {
          compraCreada = await tx.compra.create({
            data: {
              numero_po,
              numero_req: d.ref_pedido?.trim() || null,
              nombre: nombreFinal,
              proveedor_id: d.proveedor_id,
              ubicacion_codigo,
              fecha_solicitud: new Date(),
              fecha_entrega_esperada: parseDateOnly(d.fecha_entrega_esperada),
              status_oc_codigo: "PEND_OC",
              subtotal,
              descuento,
              impuesto,
              otros: otrosFirmado,
              total,
              moneda_codigo,
              aplica_igv: aplicaIgv,
              // Para CONTADO forzamos dias_credito a 0 aunque el cliente
              // mande otra cosa — evita disonancias en reportes.
              tipo_pago: d.tipo_pago || null,
              dias_credito: d.tipo_pago === "CONTADO" ? 0 : (d.dias_credito ?? null),
              observaciones: d.observaciones || `OC generada desde ${repuestos.length} requerimiento(s)`,
              usuario_solicita: usuario,
            },
          });
          break;
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
            lastError = e;
            continue;
          }
          throw e;
        }
      }
      if (!compraCreada) {
        throw lastError ?? new Error("No se pudo generar numero_po único");
      }
      const compra = compraCreada;

      if (detallesData.length > 0) {
        await tx.compraDetalle.createMany({
          data: detallesData.map((det) => ({ ...det, compra_id: compra.id })),
        });
      }

      // Actualizar el histórico de precios por proveedor (cotizacion_proveedor).
      // Esto deja registrado el precio efectivo de compra en el histórico de
      // /compras/historico, evitando que una cotización manual obsoleta pise el
      // precio recién comprado.
      const now = new Date();
      for (const rep of repuestos) {
        if (!rep.material_id) continue;
        const precio = new Prisma.Decimal(rep.precio_unitario ?? 0);
        if (precio.lte(0)) continue;
        await tx.cotizacionProveedor.upsert({
          where: {
            material_id_proveedor_id: {
              material_id: rep.material_id,
              proveedor_id: d.proveedor_id,
            },
          },
          create: {
            material_id: rep.material_id,
            proveedor_id: d.proveedor_id,
            precio_unitario: precio,
            moneda_codigo,
            observaciones: `Precio de OC ${compra.numero_po}`,
            usuario,
            fecha: now,
          },
          update: {
            precio_unitario: precio,
            moneda_codigo,
            observaciones: `Precio de OC ${compra.numero_po}`,
            usuario,
            fecha: now,
          },
        });
      }

      // Asignar po_id sólo a los que seguían disponibles (race-safe).
      // Una vez creada la OC, el item sale de PEND_OC y entra a PROCESO.
      const assigned = await tx.oTRepuesto.updateMany({
        where: { id: { in: repuestos.map((r) => r.id) }, po_id: null },
        data: {
          po_id: compra.id,
          nro_oc: compra.numero_po,
          fecha_oc: new Date(),
          fecha_entrega_esperada: parseDateOnly(d.fecha_entrega_esperada),
          status_oc_codigo: "PROCESO",
        },
      });
      // Persistir cantidades override (oc_cantidad) item por item. Solo
      // se actualizan los que el front mandó en el mapa — el resto queda
      // con cantidad = rep.cantidad original.
      for (const [idStr, cant] of Object.entries(overrideCant)) {
        const id = Number(idStr);
        if (!Number.isFinite(id)) continue;
        await tx.oTRepuesto.update({
          where: { id },
          data: { oc_cantidad: new Prisma.Decimal(cant) },
        });
      }
      if (assigned.count !== repuestos.length) {
        throw Object.assign(
          new Error("Conflicto: otro proceso asignó parte de los requerimientos"),
          { code: "RACE" },
        );
      }

      // Historial polimórfico: separar OTs externas e internas.
      const otIdsExternas = Array.from(
        new Set(repuestos.map((r) => r.ot_id).filter((x): x is number => x != null)),
      );
      const otIdsInternas = Array.from(
        new Set(repuestos.map((r) => r.orden_trabajo_interna_id).filter((x): x is number => x != null)),
      );
      for (const otId of otIdsExternas) {
        const itemsOT = repuestos.filter((r) => r.ot_id === otId).length;
        await tx.oTHistorial.create({
          data: {
            ot_id: otId,
            tipo_operacion: "Otro",
            descripcion: `Generación de OC ${compra.numero_po} con ${itemsOT} item(s)`,
            usuario,
            datos_adicionales: JSON.stringify({ po_id: compra.id, numero_po: compra.numero_po }),
          },
        });
      }
      for (const otInternaId of otIdsInternas) {
        const itemsOT = repuestos.filter((r) => r.orden_trabajo_interna_id === otInternaId).length;
        await tx.oTHistorial.create({
          data: {
            orden_trabajo_interna_id: otInternaId,
            tipo_operacion: "Otro",
            descripcion: `Generación de OC ${compra.numero_po} con ${itemsOT} item(s)`,
            usuario,
            datos_adicionales: JSON.stringify({ po_id: compra.id, numero_po: compra.numero_po }),
          },
        });
      }

      // Auto-update del estado de recursos de cada OT tocada — al crear
      // la OC, los reqs pasan de "Recursos solicitados" → "En espera de
      // recursos" automáticamente.
      const otsExt = [...new Set(repuestos.map((r) => r.ot_id).filter((x): x is number => x != null))];
      const otsInt = [...new Set(repuestos.map((r) => r.orden_trabajo_interna_id).filter((x): x is number => x != null))];
      for (const oid of otsExt) await recalcularRecursosStatusOT(tx, oid);
      for (const oid of otsInt) await recalcularRecursosStatusOTInterna(tx, oid);

      return { compra, items: repuestos.length };
    });

    return NextResponse.json(
      {
        message: `OC ${result.compra.numero_po} creada con ${result.items} item(s)`,
        compra: result.compra,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string; sin_precio_ids?: number[] };
    if (err?.code === "NO_DISPONIBLES" || err?.code === "PARCIAL" || err?.code === "RACE") {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err?.code === "SIN_PRECIO") {
      return NextResponse.json(
        { error: err.message, sin_precio_ids: err.sin_precio_ids ?? [] },
        { status: 400 },
      );
    }
    console.error("POST /api/compras/crear-oc error:", error);
    const msg = error instanceof Error ? error.message : "Error al crear OC";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
