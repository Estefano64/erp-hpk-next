import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseDateOnly } from "@/lib/dates";

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
});

const IGV_PCT = new Prisma.Decimal("0.18");
const ONE_PLUS_IGV = new Prisma.Decimal(1).plus(IGV_PCT);
const MAX_NUMERO_PO_RETRIES = 5;

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
    const usuario = d.usuario || "Logistica";

    const prefix = `D${new Date().getFullYear().toString().slice(-2)}`;

    const result = await prisma.$transaction(async (tx) => {
      // Cargamos sólo requerimientos que NO estén ya asignados a una OC.
      const repuestos = await tx.oTRepuesto.findMany({
        where: { id: { in: d.repuesto_ids }, po_id: null },
        include: { orden_trabajo: { select: { ot: true } } },
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

      // Calcular totales con Prisma.Decimal para no perder precisión.
      let subtotal = new Prisma.Decimal(0);
      const detallesData: Prisma.CompraDetalleCreateManyInput[] = [];

      for (const rep of repuestos) {
        const precio = new Prisma.Decimal(rep.precio_unitario ?? 0);
        const cant = new Prisma.Decimal(rep.cantidad);
        const itemSub = precio.mul(cant);
        subtotal = subtotal.plus(itemSub);

        if (rep.material_id) {
          const itemImp = itemSub.mul(IGV_PCT);
          const itemTotal = itemSub.mul(ONE_PLUS_IGV);
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

      const impuesto = subtotal.mul(IGV_PCT);
      const total = subtotal.mul(ONE_PLUS_IGV);

      // Construir el nombre descriptivo: "OT-{codigos} · {Proveedor}".
      // Si vino del cliente lo respetamos; si no, lo auto-generamos.
      const otsUnicas = [...new Set(repuestos.map((r) => r.orden_trabajo?.ot).filter(Boolean) as string[])];
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
              nombre: nombreFinal,
              proveedor_id: d.proveedor_id,
              ubicacion_codigo,
              fecha_solicitud: new Date(),
              fecha_entrega_esperada: parseDateOnly(d.fecha_entrega_esperada),
              status_oc_codigo: "PEND_OC",
              subtotal,
              impuesto,
              total,
              moneda_codigo,
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
      if (assigned.count !== repuestos.length) {
        throw Object.assign(
          new Error("Conflicto: otro proceso asignó parte de los requerimientos"),
          { code: "RACE" },
        );
      }

      const otIds = Array.from(new Set(repuestos.map((r) => r.ot_id)));
      for (const otId of otIds) {
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
    const err = error as { code?: string; message?: string };
    if (err?.code === "NO_DISPONIBLES" || err?.code === "PARCIAL" || err?.code === "RACE") {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("POST /api/compras/crear-oc error:", error);
    const msg = error instanceof Error ? error.message : "Error al crear OC";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
