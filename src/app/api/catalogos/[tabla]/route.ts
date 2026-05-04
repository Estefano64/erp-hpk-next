import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/audit";
import { catalogosById, type FieldDef } from "@/lib/catalogos-config";

type Params = { params: Promise<{ tabla: string }> };

/* ── helpers ─────────────────────────────────────────────────────────── */

function getModel(tabla: string): { model: any; cfg: ReturnType<typeof catalogoConfigOrNull> } | null {
  const cfg = catalogoConfigOrNull(tabla);
  if (!cfg) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = (prisma as any)[cfg.id];
  if (!model) return null;
  return { model, cfg };
}

function catalogoConfigOrNull(tabla: string) {
  return catalogosById[tabla] ?? null;
}

/** Sanitiza el body con la config: solo deja campos editables, valida required, coerce types. */
function buildPayload(fields: FieldDef[], body: Record<string, unknown>): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = body[f.key];
    if (v === undefined) continue; // no enviado → no se actualiza
    if (v === null || v === "") {
      if (f.required) return { ok: false, error: `Campo "${f.label}" es requerido.` };
      out[f.key] = null;
      continue;
    }
    switch (f.type) {
      case "number": {
        const n = Number(v);
        if (!Number.isFinite(n)) return { ok: false, error: `Campo "${f.label}" debe ser numérico.` };
        if (!Number.isInteger(n)) {
          return { ok: false, error: `Campo "${f.label}" debe ser un número entero (recibido ${n}).` };
        }
        out[f.key] = n;
        break;
      }
      case "boolean":
        out[f.key] = Boolean(v);
        break;
      case "string":
      case "text":
      case "color":
      case "select":
      case "select-fk": {
        const s = String(v).trim();
        if (f.required && !s) return { ok: false, error: `Campo "${f.label}" es requerido.` };
        if (f.maxLength && s.length > f.maxLength) {
          return { ok: false, error: `Campo "${f.label}" excede ${f.maxLength} caracteres.` };
        }
        if (f.type === "select" && f.options && !f.options.some((o) => String(o.value) === s)) {
          return { ok: false, error: `Valor inválido para "${f.label}".` };
        }
        out[f.key] = s;
        break;
      }
    }
  }
  return { ok: true, data: out };
}

/* ── POST: crear nuevo registro ──────────────────────────────────────── */
export async function POST(req: NextRequest, { params }: Params) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ error: "Solo administradores pueden crear catálogos" }, { status: 403 });
  }
  const { tabla } = await params;
  const ctx = getModel(tabla);
  if (!ctx) return NextResponse.json({ error: `Tabla "${tabla}" no permitida` }, { status: 400 });

  try {
    const body = await req.json();
    const built = buildPayload(ctx.cfg!.fields, body);
    if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });

    const created = await ctx.model.create({ data: built.data });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Ya existe un registro con ese código." }, { status: 409 });
    }
    console.error("POST /api/catalogos/[tabla] error:", error);
    return NextResponse.json({ error: "Error al crear" }, { status: 500 });
  }
}

/* ── PUT: actualizar por PK (?id=) ───────────────────────────────────── */
export async function PUT(req: NextRequest, { params }: Params) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ error: "Solo administradores pueden editar catálogos" }, { status: 403 });
  }
  const { tabla } = await params;
  const ctx = getModel(tabla);
  if (!ctx) return NextResponse.json({ error: `Tabla "${tabla}" no permitida` }, { status: 400 });

  const idStr = req.nextUrl.searchParams.get("id");
  const id = Number(idStr);
  if (!idStr || !Number.isFinite(id)) {
    return NextResponse.json({ error: "Parámetro id requerido." }, { status: 400 });
  }

  try {
    const body = await req.json();
    const built = buildPayload(ctx.cfg!.fields, body);
    if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });

    const updated = await ctx.model.update({
      where: { [ctx.cfg!.pkField]: id },
      data: built.data,
    });
    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return NextResponse.json({ error: "Ya existe un registro con ese código." }, { status: 409 });
      }
      if (error.code === "P2025") {
        return NextResponse.json({ error: "Registro no encontrado." }, { status: 404 });
      }
    }
    console.error("PUT /api/catalogos/[tabla] error:", error);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

/* ── DELETE: borrar (real o soft via ?soft=1) ────────────────────────── */
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ error: "Solo administradores pueden eliminar catálogos" }, { status: 403 });
  }
  const { tabla } = await params;
  const ctx = getModel(tabla);
  if (!ctx) return NextResponse.json({ error: `Tabla "${tabla}" no permitida` }, { status: 400 });

  const idStr = req.nextUrl.searchParams.get("id");
  const soft = req.nextUrl.searchParams.get("soft") === "1";
  const id = Number(idStr);
  if (!idStr || !Number.isFinite(id)) {
    return NextResponse.json({ error: "Parámetro id requerido." }, { status: 400 });
  }

  try {
    if (soft) {
      const updated = await ctx.model.update({
        where: { [ctx.cfg!.pkField]: id },
        data: { activo: false },
      });
      return NextResponse.json({ data: updated, mode: "soft" });
    }
    await ctx.model.delete({ where: { [ctx.cfg!.pkField]: id } });
    return NextResponse.json({ ok: true, mode: "hard" });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2003" || error.code === "P2014") {
        return NextResponse.json({
          error: "No se puede eliminar: hay registros relacionados. Usá la opción 'desactivar' en su lugar.",
        }, { status: 409 });
      }
      if (error.code === "P2025") {
        return NextResponse.json({ error: "Registro no encontrado." }, { status: 404 });
      }
    }
    console.error("DELETE /api/catalogos/[tabla] error:", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
