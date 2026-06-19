import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import * as XLSX from "xlsx";

// xlsx requiere APIs de Node (Buffer) — runtime Node, no edge.
export const runtime = "nodejs";

// Columnas esperadas en la Hoja 1 "Task List Materiales" (1-indexed):
//   1=Usuario · 2=Actividad · 3=Cod Rep · 4=N/P cod 1 · 5=N/P cod 2 · 6=ID TUBO
//   7=OD VAS · 8=Descripción · 9=Item · 10=Tipo · 11=Material · 12=Requerimiento
//   13=UM · 14=Ref descripcion · 15=NP · 16=Texto · 17=Precio
//
// La estructura "aplanada" del Excel agrupa por (maquina_taller + actividad +
// descripción) — todas las filas con esos 3 valores forman un único TaskList
// con N TaskListItem. El "maquina_taller" viene en la columna 5 (N/P cod 2)
// según la convención original del Excel.

// Nombres de hoja aceptados (variaciones por mayúsculas / espacios).
const NOMBRES_HOJA_HOJA1 = [
  "Task List Materiales",
  "task list materiales",
  "TaskListMateriales",
];

interface RawRow {
  usuario: string | null;
  actividad: string | null;
  maquinaTaller: string | null;
  descripcion: string | null;
  item: number | null;
  tipo: string | null;
  requerimiento: number | null;
  um: string | null;
  refDescripcion: string | null;
  np: string | null;
  texto: string | null;
  precio: number | null;
}

function parseRow(row: unknown[]): RawRow {
  const s = (i: number): string | null => {
    const v = row[i];
    if (v == null) return null;
    const t = String(v).trim();
    return t === "" ? null : t;
  };
  const n = (i: number): number | null => {
    const v = row[i];
    if (v == null || v === "") return null;
    const num = Number(v);
    return Number.isFinite(num) ? num : null;
  };
  return {
    usuario: s(0),         // A=1 → idx 0
    actividad: s(3),       // D=4 (N/P cod 1): código PM1/PM2/PM3/PM4 (MP*→PM* al guardar)
    maquinaTaller: s(4),   // E=5 (N/P cod 2) tiene el nombre de la máquina
    descripcion: s(7),     // H=8
    item: n(8),            // I=9
    tipo: s(9),            // J=10
    requerimiento: n(11),  // L=12
    um: s(12),             // M=13
    refDescripcion: s(13), // N=14
    np: s(14),             // O=15
    texto: s(15),          // P=16
    precio: n(16),         // Q=17
  };
}

export async function POST(req: NextRequest) {
  try {
    const usuario = (await getAuditUser(req)) ?? "sistema";
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "Adjuntá el archivo .xlsx en el campo 'file'" }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });

    // Encontrar la hoja correcta.
    const sheetName = wb.SheetNames.find((s) =>
      NOMBRES_HOJA_HOJA1.some((n) => s.trim().toLowerCase() === n.trim().toLowerCase()),
    );
    if (!sheetName) {
      return NextResponse.json(
        { error: `No se encontró la hoja. Hojas presentes: ${wb.SheetNames.join(", ")}` },
        { status: 400 },
      );
    }
    const sheet = wb.Sheets[sheetName];
    // header:1 → cada fila es un array indexado por columna.
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });

    // Las primeras 2 filas son cabeceras del Excel — saltarlas.
    const dataRows = rows.slice(2).map(parseRow);

    // Agrupar por (maquinaTaller + actividad + descripcion).
    // Si maquina o actividad vienen en NULL (filas hijas), heredarlas del último
    // header válido — así replicamos la lectura jerárquica del Excel "aplanado".
    let lastMaquina: string | null = null;
    let lastActividad: string | null = null;
    let lastDescripcion: string | null = null;
    let lastUsuario: string | null = null;

    interface AgrupadoKey {
      maquina: string;
      actividad: string;
      descripcion: string;
      usuario: string | null;
    }
    interface ItemNorm {
      item: number;
      tipo: string;
      ref_descripcion: string | null;
      np: string | null;
      requerimiento: number | null;
      um: string | null;
      texto: string | null;
      precio: number | null;
    }
    const grupos = new Map<string, AgrupadoKey & { items: ItemNorm[] }>();

    let saltadas = 0;
    // Normalizador: el Excel puede traer MP1-4 o PM1-4 — siempre persistimos
    // como PM* (convención oficial HPK).
    const normActividad = (v: string | null): string | null => {
      if (!v) return v;
      const t = v.trim().toUpperCase();
      if (/^MP[1-4]$/.test(t)) return "PM" + t.substring(2);
      return t;
    };
    for (const r of dataRows) {
      if (r.maquinaTaller) lastMaquina = r.maquinaTaller;
      if (r.actividad) lastActividad = normActividad(r.actividad);
      if (r.descripcion) lastDescripcion = r.descripcion;
      if (r.usuario) lastUsuario = r.usuario;

      // Fila sin datos suficientes — descartar.
      if (!lastMaquina || !lastActividad || !lastDescripcion) {
        if (r.tipo || r.refDescripcion) saltadas++;
        continue;
      }
      // Fila sin item ni tipo → es solo un header heredado, no se inserta.
      if (!r.tipo && !r.refDescripcion && r.item == null) continue;

      const key = `${lastMaquina}|||${lastActividad}|||${lastDescripcion}`;
      let g = grupos.get(key);
      if (!g) {
        g = {
          maquina: lastMaquina,
          actividad: lastActividad,
          descripcion: lastDescripcion,
          usuario: lastUsuario,
          items: [],
        };
        grupos.set(key, g);
      }
      g.items.push({
        item: r.item ?? g.items.length + 1,
        tipo: (r.tipo ?? "CAD").toUpperCase(),
        ref_descripcion: r.refDescripcion,
        np: r.np,
        requerimiento: r.requerimiento,
        um: r.um,
        texto: r.texto,
        precio: r.precio,
      });
    }

    // Full replace: borrar todo lo existente y reinsertar.
    const result = await prisma.$transaction(
      async (tx) => {
        // items se borran en cascada vía FK.
        await tx.taskList.deleteMany({});

        const created: { id: number }[] = [];
        for (const g of grupos.values()) {
          const tl = await tx.taskList.create({
            data: {
              maquina_taller: g.maquina,
              actividad_codigo: g.actividad,
              descripcion: g.descripcion,
              usuario_responsable: g.usuario,
              usuario_crea: usuario,
              items: {
                create: g.items.map((i) => ({
                  item: i.item,
                  tipo: i.tipo,
                  ref_descripcion: i.ref_descripcion,
                  np: i.np,
                  requerimiento: i.requerimiento,
                  um: i.um,
                  texto: i.texto,
                  precio: i.precio,
                })),
              },
            },
            select: { id: true },
          });
          created.push(tl);
        }
        return created;
      },
      { timeout: 120_000 },
    );

    return NextResponse.json({
      ok: true,
      task_lists_creados: result.length,
      items_totales: Array.from(grupos.values()).reduce((a, g) => a + g.items.length, 0),
      saltadas,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}
