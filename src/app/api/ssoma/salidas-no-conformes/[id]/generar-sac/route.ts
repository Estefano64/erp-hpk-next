import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { parseInt4Safe } from "@/lib/ot-formato";
import { nextNumeroSac } from "@/lib/ssoma-numero";
import { esEncargadoSsoma } from "@/lib/ssoma-server";

// POST — genera una SAC (SIG-G-F-10) a partir de esta salida no conforme.
// Solo el encargado de seguridad. La SAC nace ABIERTA, vinculada a la SNC,
// pre-cargada como "Servicio No Conforme" con la descripción de la salida.
// Marca requiere_sac = true en la SNC.
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const idNum = parseInt4Safe(id);
    if (idNum == null) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 });
    }
    if (!(await esEncargadoSsoma(req))) {
      return NextResponse.json(
        { error: "Solo el encargado de seguridad puede generar una SAC" },
        { status: 403 },
      );
    }
    const usuario = (await getAuditUser(req)) ?? "sistema";

    const snc = await prisma.salidaNoConforme.findUnique({
      where: { id: idNum },
      select: {
        id: true,
        activo: true,
        descripcion: true,
        area: true,
        responsable_salida: true,
        sacs: { where: { activo: true }, select: { id: true, numero: true, anio: true } },
      },
    });
    if (!snc) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (!snc.activo) return NextResponse.json({ error: "Registro anulado" }, { status: 409 });
    if (snc.sacs.length > 0) {
      return NextResponse.json(
        { error: "Esta salida no conforme ya tiene una SAC activa" },
        { status: 409 },
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const { numero, anio } = await nextNumeroSac(tx);
      const sac = await tx.solicitudAccionCorrectiva.create({
        data: {
          numero,
          anio,
          salida_no_conforme_id: idNum,
          tipo_desviacion: "SERVICIO_NO_CONFORME",
          sistemas: ["CALIDAD"],
          descripcion: snc.descripcion,
          proceso_responsable: snc.responsable_salida || snc.area || null,
          identificado_por: usuario,
          fecha_identificacion: new Date(),
          estado: "ABIERTA",
          usuario_crea: usuario,
        },
        include: { acciones: true, salida_no_conforme: { select: { id: true, numero: true, anio: true } } },
      });
      await tx.salidaNoConforme.update({
        where: { id: idNum },
        data: { requiere_sac: true, usuario_actualiza: usuario },
      });
      return sac;
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}
