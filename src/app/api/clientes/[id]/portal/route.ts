// GET /api/clientes/[id]/portal — datos para el panel de gestión del portal
// de UN cliente (módulo Clientes): sus cuentas de acceso y sus OTs con el
// estado de publicación. La publicación en sí usa
// POST /api/ordenes-trabajo/[id]/portal (gated a admin/planner/prod/logística).

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { parseInt4Safe } from "@/lib/ot-formato";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const token = await getToken({ req });
    if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    // Cuentas de portal no acceden acá (el middleware ya las bloquea, doble guarda).
    const roles = (token.roles as string[] | undefined) ?? [];
    if (roles.includes("cliente") && !roles.includes("admin")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { id } = await params;
    const clienteId = parseInt4Safe(id) ?? 0;
    if (clienteId <= 0) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    const [cliente, cuentas, ots] = await Promise.all([
      prisma.cliente.findUnique({
        where: { cliente_id: clienteId },
        select: { cliente_id: true, codigo: true, razon_social: true, nombre_comercial: true },
      }),
      prisma.usuario.findMany({
        where: { clienteId, roles: { has: "cliente" } },
        select: { id: true, nombre: true, email: true, codigoEmpleado: true, activo: true },
        orderBy: { id: "asc" },
      }),
      prisma.ordenTrabajo.findMany({
        where: { id_cliente: clienteId, activo: true },
        select: {
          id: true, ot: true, tipo_codigo: true, descripcion: true, np: true,
          cod_rep_flota: true, taller_status_codigo: true,
          fecha_recepcion: true, visible_portal: true,
        },
        orderBy: [{ fecha_recepcion: "desc" }, { id: "desc" }],
      }),
    ]);
    if (!cliente) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

    return NextResponse.json({ cliente, cuentas, ots });
  } catch (e) {
    console.error("GET /api/clientes/[id]/portal error:", e);
    return NextResponse.json({ error: "Error al obtener datos del portal" }, { status: 500 });
  }
}
