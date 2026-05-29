/**
 * Simulación intensiva de planificación / programación semanal.
 *
 * Reproduce FIELMENTE la cadena real:
 *   1. Cliente suelta un bloque en el Gantt  (persistMove → patch)
 *   2. El servidor procesa el PUT            (normalizar + recalcular Fin)
 *   3. La UI vuelve a leer y renderiza        (renderTaskBlock → ¿visible?)
 *
 * Importa la lógica REAL de `src/lib/planification-hours.ts`, así que lo que
 * acá falle, falla igual en producción.
 *
 * Corre miles de escenarios (cada día, cada slot de 15', varias duraciones y
 * cantidades de personal, con y sin horas extra) y verifica invariantes:
 *
 *   INV-1  No-salto:     donde lo suelto = donde queda (sin reubicación silenciosa)
 *   INV-2  Visible:      el bloque sigue visible en la semana donde lo solté
 *   INV-3  HE mismo día: una tarea de horas-extra termina el MISMO día (no se
 *                        desborda a la mañana siguiente)
 *   INV-4  Fin > Inicio: el fin siempre es posterior al inicio
 *   INV-5  Sin choque-fantasma: una tarea HE no bloquea la mañana del día siguiente
 *
 * Uso:  npx tsx scripts/sim-planificacion.ts
 */

import dayjs, { Dayjs } from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import {
  calcularFin,
  calcularFinEstimado,
  normalizarAInicioHabil,
} from "../src/lib/planification-hours";

dayjs.extend(isoWeek);

// ── Constantes del grid (idénticas a programacion-semanal/page.tsx) ──
const VIEW_INICIO = 8; // el grid se ve desde las 08:00
const VIEW_FIN = 20; // hasta las 20:00 (la banda 18–20 es "horas extra")
const SNAP_MIN = 15;

// Lunes de referencia fijo para que la corrida sea determinística.
// 2026-05-25 es lunes (la semana de "hoy" = 2026-05-28).
const MONDAY = dayjs("2026-05-25T00:00:00");

// ── Modelo mínimo de una fila de planificación ──
interface Row {
  id: number;
  horas_estimadas: number | null;
  qty_personal: number | null;
  horas_extras: boolean | null;
  horas_extras_qty: number | null;
  fecha_inicio: Date | null;
  fecha_fin: Date | null;
  semana_plan: string | null;
  tecnico: string | null;
  maquina: string | null;
  estado: string | null;
}

function nuevaFila(over: Partial<Row>): Row {
  return {
    id: 1,
    horas_estimadas: 1,
    qty_personal: 1,
    horas_extras: false,
    horas_extras_qty: null,
    fecha_inicio: null,
    fecha_fin: null,
    semana_plan: null,
    tecnico: null,
    maquina: null,
    estado: "abierto",
    ...over,
  };
}

function semanaCodigo(d: Dayjs): string {
  return `${d.isoWeekYear()}W${String(d.isoWeek()).padStart(2, "0")}`;
}
function semanaCodigoFromDate(d: Date): string {
  return semanaCodigo(dayjs(d));
}

// ─────────────────────────────────────────────────────────────────────────
// CLIENTE — réplica de persistMove() (programacion-semanal/page.tsx)
// ─────────────────────────────────────────────────────────────────────────
interface Patch {
  fecha_inicio?: Date;
  fecha_fin?: Date;
  semana_plan?: string;
  horas_estimadas?: number;
  horas_extras?: boolean;
  horas_extras_qty?: number;
  maquina?: string;
  tecnico?: string;
}

function clienteSoltarBloque(
  original: Row,
  ini: Dayjs,
  recurso: string,
  view: "equipo" | "operario",
): { patch: Patch; optimistaIni: Date } {
  const durRaw = Number(original.horas_estimadas);
  const horasFaltantes = !Number.isFinite(durRaw) || durRaw <= 0;
  const dur = horasFaltantes ? 1 : durRaw;
  const qty = Math.max(1, Number(original.qty_personal ?? 1));

  const inicioHoraDec = ini.hour() + ini.minute() / 60;
  const enBandaHE = inicioHoraDec >= 18;
  // Normal: normalizamos a la jornada (igual que el server). HE: queda donde cae.
  const inicioReal = enBandaHE ? ini : dayjs(normalizarAInicioHabil(ini.toDate()));
  const fin = calcularFin(inicioReal.toDate(), dur * qty, enBandaHE);

  const patch: Patch = {
    fecha_inicio: inicioReal.toDate(),
    fecha_fin: fin,
    semana_plan: semanaCodigo(inicioReal),
  };
  if (horasFaltantes) patch.horas_estimadas = 1;
  if (enBandaHE) {
    patch.horas_extras = true;
    patch.horas_extras_qty = Math.max(0.5, dur * qty);
  }
  if (view === "equipo") patch.maquina = recurso;
  else patch.tecnico = recurso;

  return { patch, optimistaIni: inicioReal.toDate() };
}

// ─────────────────────────────────────────────────────────────────────────
// SERVIDOR — réplica de PUT /api/planificacion/[id] (route.ts)
// ─────────────────────────────────────────────────────────────────────────
function servidorPut(
  current: Row,
  patch: Patch,
): { ok: boolean; status: number; row?: Row; error?: string } {
  const data: Record<string, unknown> = {};
  for (const k of Object.keys(patch) as (keyof Patch)[]) {
    if (patch[k] !== undefined) data[k] = patch[k];
  }

  const fechaInicioCambia = "fecha_inicio" in data;
  const semanaCambia = "semana_plan" in data;

  if (fechaInicioCambia && data.fecha_inicio) {
    data.semana_plan = semanaCodigoFromDate(data.fecha_inicio as Date);
  } else if (semanaCambia && !fechaInicioCambia) {
    const nuevaSemana = data.semana_plan as string | null;
    const semanaActualDeFecha = current.fecha_inicio
      ? semanaCodigoFromDate(current.fecha_inicio)
      : null;
    if (nuevaSemana && nuevaSemana !== semanaActualDeFecha) data.fecha_inicio = null;
  }

  // ── Normalizar a jornada hábil (solo si NO es HE) ──
  const finalHE =
    (patch.horas_extras !== undefined ? patch.horas_extras : current.horas_extras) ?? false;
  if (data.fecha_inicio && !finalHE) {
    const normalizada = normalizarAInicioHabil(data.fecha_inicio as Date);
    data.fecha_inicio = normalizada;
    data.semana_plan = semanaCodigoFromDate(normalizada);
  }

  const finalHEQty =
    patch.horas_extras_qty !== undefined
      ? Number(patch.horas_extras_qty ?? 0)
      : Number(current.horas_extras_qty ?? 0);
  if (finalHE && finalHEQty <= 0) {
    return { ok: false, status: 400, error: "HE_INVALID" };
  }

  const finalDur =
    patch.horas_estimadas !== undefined
      ? Number(patch.horas_estimadas ?? 0)
      : Number(current.horas_estimadas ?? 0);
  const finalQty =
    (patch as { qty_personal?: number }).qty_personal !== undefined
      ? Number((patch as { qty_personal?: number }).qty_personal ?? 1)
      : Number(current.qty_personal ?? 1);
  const finalIni =
    "fecha_inicio" in data ? (data.fecha_inicio as Date | null) : current.fecha_inicio;

  if (!finalHE) {
    if (finalIni && finalDur > 0) {
      data.fecha_fin = calcularFinEstimado(finalIni, finalDur * Math.max(1, finalQty));
    } else {
      data.fecha_fin = null;
    }
  }

  const row: Row = { ...current, ...(data as Partial<Row>) };
  return { ok: true, status: 200, row };
}

// ─────────────────────────────────────────────────────────────────────────
// UI — réplica de renderTaskBlock() visibilidad
// ─────────────────────────────────────────────────────────────────────────
function bloqueVisible(monday: Dayjs, ini: Date | null, fin: Date | null): boolean {
  if (!ini || !fin) return false;
  const i = dayjs(ini);
  const f = dayjs(fin);
  const semanaIni = monday.hour(VIEW_INICIO).minute(0).second(0).millisecond(0);
  const semanaFin = monday.add(4, "day").hour(VIEW_FIN).minute(0).second(0).millisecond(0);
  if (f.isBefore(semanaIni) || i.isAfter(semanaFin)) return false;
  return true;
}

// ── Detección de solapamiento (réplica de tareaSuperpuesta / detectarConflictos) ──
function solapan(a: Row, b: Row): boolean {
  if (!a.fecha_inicio || !a.fecha_fin || !b.fecha_inicio || !b.fecha_fin) return false;
  const aIni = a.fecha_inicio.getTime();
  const aFin = a.fecha_fin.getTime();
  const bIni = b.fecha_inicio.getTime();
  const bFin = b.fecha_fin.getTime();
  return aIni < bFin && bFin > aIni && aIni < bFin && bIni < aFin;
}

// ─────────────────────────────────────────────────────────────────────────
// Recolección de fallas
// ─────────────────────────────────────────────────────────────────────────
interface Falla {
  inv: string;
  detalle: string;
}
const fallas: Falla[] = [];
const conteo: Record<string, number> = {};
function reportar(inv: string, detalle: string) {
  conteo[inv] = (conteo[inv] ?? 0) + 1;
  if ((conteo[inv] ?? 0) <= 4) fallas.push({ inv, detalle }); // guardo hasta 4 ejemplos por invariante
}

function fmt(d: Date | null): string {
  return d ? dayjs(d).format("ddd DD/MM HH:mm") : "—";
}

// ─────────────────────────────────────────────────────────────────────────
// SIMULACIÓN PRINCIPAL: barrido de colocaciones
// ─────────────────────────────────────────────────────────────────────────
let totalCasos = 0;

const DURACIONES = [0.5, 1, 2, 3, 4.5, 6, 9]; // horas por persona
const QTYS = [1, 2, 3];
const VIEWS: ("equipo" | "operario")[] = ["equipo", "operario"];

for (const view of VIEWS) {
  for (let day = 0; day < 5; day++) {
    for (let slot = VIEW_INICIO; slot <= VIEW_FIN; slot += SNAP_MIN / 60) {
      const hh = Math.floor(slot);
      const mm = Math.round((slot - hh) * 60);
      const ini = MONDAY.add(day, "day").hour(hh).minute(mm).second(0).millisecond(0);
      for (const dur of DURACIONES) {
        for (const qty of QTYS) {
          totalCasos++;
          const recurso = view === "equipo" ? "TR-01" : "Juan Pérez";
          const original = nuevaFila({ horas_estimadas: dur, qty_personal: qty });
          const { patch, optimistaIni } = clienteSoltarBloque(original, ini, recurso, view);
          const res = servidorPut(original, patch);

          if (!res.ok) {
            reportar(
              "SRV-ERROR",
              `[${view}] soltar ${fmt(ini.toDate())} dur=${dur} qty=${qty} → ${res.error}`,
            );
            continue;
          }
          const row = res.row!;
          const esHE = !!patch.horas_extras;

          // INV-1: no-salto (donde lo suelto debería quedar)
          if (row.fecha_inicio!.getTime() !== optimistaIni.getTime()) {
            reportar(
              "INV1-SALTO",
              `[${view}] solté ${fmt(optimistaIni)} → quedó en ${fmt(row.fecha_inicio)} (dur=${dur} qty=${qty})`,
            );
          }

          // INV-2: visible en la semana donde lo solté
          if (!bloqueVisible(MONDAY, row.fecha_inicio, row.fecha_fin)) {
            reportar(
              "INV2-INVISIBLE",
              `[${view}] solté ${fmt(ini.toDate())} dur=${dur} qty=${qty} HE=${esHE} → ini=${fmt(row.fecha_inicio)} fin=${fmt(row.fecha_fin)} NO se ve`,
            );
          }

          // INV-3: el fin de una tarea HE es reloj CONTINUO = inicio + horas.
          // (El bug era que la jornada normal lo empujaba a la mañana del día
          // siguiente. Que una HE muy larga cruce medianoche es correcto.)
          if (esHE && row.fecha_inicio && row.fecha_fin) {
            const esperadoFin = row.fecha_inicio.getTime() + dur * qty * 3_600_000;
            if (row.fecha_fin.getTime() !== esperadoFin) {
              reportar(
                "INV3-HE-DESBORDA",
                `[${view}] HE soltada ${fmt(row.fecha_inicio)} dur=${dur} qty=${qty} → fin ${fmt(row.fecha_fin)} (esperaba ${fmt(new Date(esperadoFin))})`,
              );
            }
          }

          // INV-4: fin > inicio
          if (row.fecha_inicio && row.fecha_fin && row.fecha_fin.getTime() <= row.fecha_inicio.getTime()) {
            reportar(
              "INV4-FIN<=INI",
              `[${view}] ${fmt(row.fecha_inicio)} → ${fmt(row.fecha_fin)} (dur=${dur} qty=${qty})`,
            );
          }
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// ESCENARIO DE CHOQUE-FANTASMA (INV-5)
// Coloco una tarea HE el lunes a las 18:30 (1h) y verifico que NO bloquee
// la mañana del martes.
// ─────────────────────────────────────────────────────────────────────────
{
  const recurso = "TR-01";
  const lunesHE = MONDAY.hour(18).minute(30);
  const tareaHE = nuevaFila({ id: 100, horas_estimadas: 1, qty_personal: 1, maquina: recurso });
  const { patch } = clienteSoltarBloque(tareaHE, lunesHE, recurso, "equipo");
  const stored = servidorPut(tareaHE, patch).row!;
  stored.id = 100;

  // Intento colocar otra tarea el martes 08:00 en el mismo recurso.
  const martes8 = MONDAY.add(1, "day").hour(8).minute(0);
  const finMartes = calcularFinEstimado(martes8.toDate(), 1);
  const tareaMartes = nuevaFila({
    id: 101,
    maquina: recurso,
    fecha_inicio: martes8.toDate(),
    fecha_fin: finMartes,
  });

  totalCasos++;
  if (solapan(stored, tareaMartes)) {
    reportar(
      "INV5-CHOQUE-FANTASMA",
      `HE lunes 18:30 (1h) quedó ${fmt(stored.fecha_inicio)}→${fmt(stored.fecha_fin)} y bloquea martes 08:00 (choque falso)`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Reporte
// ─────────────────────────────────────────────────────────────────────────
console.log("\n══════════════════════════════════════════════════════════════");
console.log("  SIMULACIÓN INTENSIVA — Planificación / Programación Semanal");
console.log("══════════════════════════════════════════════════════════════");
console.log(`  Casos simulados: ${totalCasos.toLocaleString("es")}`);
console.log("──────────────────────────────────────────────────────────────");

const INVS = [
  ["INV1-SALTO", "El bloque se reubica solo (cae distinto de donde lo soltás)"],
  ["INV2-INVISIBLE", "El bloque queda invisible en la semana donde lo soltaste"],
  ["INV3-HE-DESBORDA", "Tarea de horas-extra termina al día siguiente (mal)"],
  ["INV4-FIN<=INI", "Fin anterior o igual al inicio"],
  ["INV5-CHOQUE-FANTASMA", "Una tarea HE bloquea la mañana del día siguiente"],
  ["SRV-ERROR", "El servidor rechaza la colocación"],
];

let hayFallas = false;
for (const [inv, desc] of INVS) {
  const n = conteo[inv] ?? 0;
  if (n > 0) hayFallas = true;
  const icon = n > 0 ? "❌" : "✅";
  console.log(`  ${icon} ${inv.padEnd(22)} ${String(n).padStart(6)}  ${desc}`);
}

console.log("──────────────────────────────────────────────────────────────");
if (fallas.length > 0) {
  console.log("  EJEMPLOS DE FALLAS:");
  let lastInv = "";
  for (const f of fallas) {
    if (f.inv !== lastInv) {
      console.log(`\n  ▸ ${f.inv}`);
      lastInv = f.inv;
    }
    console.log(`      ${f.detalle}`);
  }
}
console.log("\n══════════════════════════════════════════════════════════════");
console.log(hayFallas ? "  RESULTADO: HAY BUGS ❌" : "  RESULTADO: TODO OK ✅");
console.log("══════════════════════════════════════════════════════════════\n");

process.exit(hayFallas ? 1 : 0);
