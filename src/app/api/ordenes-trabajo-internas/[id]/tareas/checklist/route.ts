// Checklist de tareas ejecutadas — read/write del JSON `tareas_checklist` en
// la OT interna. Cada key del JSON es un task_list_id (stringificado) y su
// valor es `{ done, fecha, usuario, obs }`.
//
// GET  → devuelve el objeto actual (o {} si nunca se seteó).
// PATCH → merge parcial: recibe { [task_list_id]: partial } y lo mezcla con
//         lo existente. Setea fecha/usuario automáticamente cuando `done`
//         pasa de false→true.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { parseInt4Safe } from "@/lib/ot-formato";

type Ctx = { params: Promise<{ id: string }> };

interface ChecklistEntry {
  done?: boolean;
  fecha?: string | null;
  usuario?: string | null;
  obs?: string | null;
}
type Checklist = Record<string, ChecklistEntry>;

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const otId = parseInt4Safe(id) ?? 0;
    if (otId <= 0) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    // Cast: la migración se aplica en deploy; localmente ya está aplicada.
    // El cliente de Prisma se regenera al reiniciar el dev server.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ot = await prisma.ordenTrabajoInterna.findUnique({
      where: { id: otId },
      select: { tareas_checklist: true } as any,
    }) as { tareas_checklist: Checklist | null } | null;
    if (!ot) return NextResponse.json({ error: "OT no encontrada" }, { status: 404 });
    return NextResponse.json({ data: ot.tareas_checklist ?? {} });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

const EntrySchema = z.object({
  done: z.boolean().optional(),
  obs: z.string().max(500).optional().nullable(),
});
// Body: mapa parcial { [task_list_id]: { done?, obs? } }.
const PatchSchema = z.record(z.string(), EntrySchema);

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const otId = parseInt4Safe(id) ?? 0;
    if (otId <= 0) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    const body = await req.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validación", detail: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const patch = parsed.data;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const current = await prisma.ordenTrabajoInterna.findUnique({
      where: { id: otId },
      select: { tareas_checklist: true } as any,
    }) as { tareas_checklist: Checklist | null } | null;
    if (!current) return NextResponse.json({ error: "OT no encontrada" }, { status: 404 });

    const usuario = (await getAuditUser(req)) ?? "sistema";
    const now = new Date().toISOString();
    const merged: Checklist = { ...(current.tareas_checklist ?? {}) };
    for (const [key, entry] of Object.entries(patch)) {
      const prev = merged[key] ?? {};
      const nextDone = entry.done ?? prev.done ?? false;
      const wasDone = prev.done === true;
      merged[key] = {
        done: nextDone,
        // Fecha + usuario se estampan cuando cruza a done=true. Si vuelve a
        // false, se limpian para no dejar rastro incorrecto.
        fecha: nextDone
          ? (wasDone ? (prev.fecha ?? now) : now)
          : null,
        usuario: nextDone
          ? (wasDone ? (prev.usuario ?? usuario) : usuario)
          : null,
        obs: entry.obs !== undefined ? entry.obs : (prev.obs ?? null),
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await prisma.ordenTrabajoInterna.update({
      where: { id: otId },
      data: { tareas_checklist: merged as any },
    });
    return NextResponse.json({ data: merged });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}
