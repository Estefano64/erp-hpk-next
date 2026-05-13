import { NextRequest, NextResponse } from "next/server";

type Ctx = { params: Promise<{ ruc: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { ruc } = await ctx.params;

  if (!/^\d{11}$/.test(ruc)) {
    return NextResponse.json({ error: "RUC debe tener 11 dígitos" }, { status: 400 });
  }

  const token = process.env.DECOLECTA_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "DECOLECTA_TOKEN no configurado en el servidor" }, { status: 500 });
  }

  try {
    const res = await fetch(`https://api.decolecta.com/v1/sunat/ruc?numero=${ruc}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (res.status === 404) {
      return NextResponse.json({ error: "RUC no encontrado en SUNAT" }, { status: 404 });
    }
    if (!res.ok) {
      return NextResponse.json({ error: `SUNAT respondió ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json({
      ruc: data.numero_documento ?? ruc,
      razon_social: data.razon_social ?? null,
      direccion: data.direccion?.trim() || null,
      estado: data.estado ?? null,
      condicion: data.condicion ?? null,
      distrito: data.distrito ?? null,
      provincia: data.provincia ?? null,
      departamento: data.departamento ?? null,
    });
  } catch (e) {
    console.error("SUNAT lookup error:", e);
    return NextResponse.json({ error: "Error consultando SUNAT" }, { status: 502 });
  }
}
