/**
 * Simulación intensiva de PLANIFICACIÓN + PROGRAMACIÓN SEMANAL.
 *
 * Reproduce FIELMENTE la lógica real de ambos módulos (cliente + servidor +
 * render) e importa las funciones reales de `src/lib/planification-hours.ts`,
 * así que lo que acá falle, falla igual en producción.
 *
 * Suites:
 *   1. COLOCACIÓN (programación semanal): arrastrar bloques al Gantt.
 *   2. FORM (planificación): recalcularFin, HH, flujo del check de HE.
 *   3. FILTROS (planificación): réplica del where del servidor + multi-recurso.
 *   4. SINCRONIZACIÓN planificación ↔ programación semanal.
 *
 * Uso:  npx tsx scripts/sim-planificacion.ts
 */

import dayjs, { Dayjs } from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import {
  calcularFin,
  calcularFinEstimado,
  calcularHH,
  normalizarAInicioHabil,
} from "../src/lib/planification-hours";

dayjs.extend(isoWeek);

// ── Constantes del grid (idénticas a programacion-semanal/page.tsx) ──
const VIEW_INICIO = 8;
const VIEW_FIN = 20;
const SNAP_MIN = 15;

// Lunes de referencia fijo (la semana de "hoy" 2026-05-28).
const MONDAY = dayjs("2026-05-25T00:00:00");

// ── Modelo mínimo de una fila ──
interface Row {
  id: number;
  horas_estimadas: number | null;
  qty_personal: number | null;
  horas_extras: boolean | null;
  horas_extras_qty: number | null;
  fecha_inicio: Date | null;
  fecha_fin: Date | null;
  fecha_fin_real: Date | null;
  semana_plan: string | null;
  tecnico: string | null;
  maquina: string | null;
  trabajo_externo: boolean | null;
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
    fecha_fin_real: null,
    semana_plan: null,
    tecnico: null,
    maquina: null,
    trabajo_externo: false,
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
// Separador de multi-recurso = "|" (NO coma): los nombres traen coma.
function splitTecnicos(s: string | null | undefined): string[] {
  if (!s) return [];
  return s.split("|").map((x) => x.trim()).filter(Boolean);
}
function joinTecnicos(arr: string[]): string | null {
  const clean = arr.map((x) => x.trim()).filter(Boolean);
  return clean.length === 0 ? null : clean.join(" | ");
}

// ─────────────────────────────────────────────────────────────────────────
// CLIENTE — réplica de persistMove() (programacion-semanal/page.tsx)
// ─────────────────────────────────────────────────────────────────────────
interface Patch {
  fecha_inicio?: Date | null;
  fecha_fin?: Date | null;
  semana_plan?: string | null;
  horas_estimadas?: number | null;
  horas_extras?: boolean;
  horas_extras_qty?: number | null;
  qty_personal?: number;
  maquina?: string | null;
  tecnico?: string | null;
  fecha_fin_real?: Date | null;
  trabajo_externo?: boolean;
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
// CLIENTE — réplica de recalcularFin() (planificacion/page.tsx)
// ─────────────────────────────────────────────────────────────────────────
function recalcularFin(r: Row, patch: Partial<Row>): Partial<Row> {
  const out: Partial<Row> = { ...patch };
  const merged = { ...r, ...patch };
  if (merged.horas_extras) return out; // HE: el usuario maneja el fin
  const inicio = merged.fecha_inicio ? new Date(merged.fecha_inicio) : null;
  const duracion = Number(merged.horas_estimadas ?? 0);
  const qty = Math.max(1, Number(merged.qty_personal ?? 1));
  const horasTotalTarea = duracion * qty;
  if (inicio && horasTotalTarea > 0) {
    out.fecha_fin = calcularFinEstimado(inicio, horasTotalTarea);
  } else {
    out.fecha_fin = null;
  }
  return out;
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

  // Bloqueo si estado = realizado (replicado simplificado)
  const isRealizado = current.estado === "realizado";
  const intentaEditar = Object.keys(data).length > 0;
  if (isRealizado && intentaEditar && !("estado" in data)) {
    return { ok: false, status: 423, error: "REALIZADO_LOCKED" };
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
  if (finalHE && finalHEQty <= 0) return { ok: false, status: 400, error: "HE_INVALID" };

  const finalDur =
    patch.horas_estimadas !== undefined
      ? Number(patch.horas_estimadas ?? 0)
      : Number(current.horas_estimadas ?? 0);
  const finalQty =
    patch.qty_personal !== undefined
      ? Number(patch.qty_personal ?? 1)
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

  // Auto-transición a "realizado" al setear fecha_fin_real
  if ("fecha_fin_real" in data && data.fecha_fin_real != null && !("estado" in data)) {
    data.estado = "realizado";
  }
  // abierto → programado al asignar fecha + recurso
  const finalRecurso =
    patch.tecnico !== undefined || patch.maquina !== undefined
      ? ((data.tecnico as string | null) ?? current.tecnico) ||
        ((data.maquina as string | null) ?? current.maquina)
      : current.tecnico || current.maquina;
  if (current.estado === "abierto" && finalIni && finalRecurso && !("estado" in data)) {
    data.estado = "programado";
  }

  const row: Row = { ...current, ...(data as Partial<Row>) };
  return { ok: true, status: 200, row };
}

// ─────────────────────────────────────────────────────────────────────────
// SERVIDOR — réplica del WHERE de GET /api/planificacion (filtros)
// ─────────────────────────────────────────────────────────────────────────
interface Filtros {
  semana?: string;
  estado?: string;
  tecnico?: string;
  maquina?: string;
}
// Réplica del WHERE del servidor. tecnico/maquina ahora hacen match por TOKEN
// (reconocen valores multi-recurso "Juan, Pedro"), igual que tokenMatch() en
// el route real.
function servidorFiltrar(rows: Row[], f: Filtros): Row[] {
  return rows.filter((r) => {
    if (f.semana && r.semana_plan !== f.semana) return false;
    if (f.estado && r.estado !== f.estado) return false;
    if (f.tecnico && !splitTecnicos(r.tecnico).includes(f.tecnico)) return false;
    if (f.maquina && !splitTecnicos(r.maquina).includes(f.maquina)) return false;
    return true;
  });
}

// ── Réplica del filtro de OVERLAP por rango (desde/hasta) del GET ──
function pasaOverlap(r: Row, desde: Date, hasta: Date): boolean {
  if (!r.fecha_inicio) return false; // sin fecha no entra al rango
  if (r.fecha_inicio.getTime() > hasta.getTime()) return false;
  if (r.fecha_fin) return r.fecha_fin.getTime() >= desde.getTime();
  return r.fecha_inicio.getTime() >= desde.getTime();
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
function solapan(a: Row, b: Row): boolean {
  if (!a.fecha_inicio || !a.fecha_fin || !b.fecha_inicio || !b.fecha_fin) return false;
  return a.fecha_inicio.getTime() < b.fecha_fin.getTime() && b.fecha_inicio.getTime() < a.fecha_fin.getTime();
}

// ─────────────────────────────────────────────────────────────────────────
// Recolección de fallas
// ─────────────────────────────────────────────────────────────────────────
const conteo: Record<string, number> = {};
const ejemplos: Record<string, string[]> = {};
const descripciones: Record<string, string> = {};
function definirInv(inv: string, desc: string) {
  descripciones[inv] = desc;
  conteo[inv] = conteo[inv] ?? 0;
}
function reportar(inv: string, detalle: string) {
  conteo[inv] = (conteo[inv] ?? 0) + 1;
  ejemplos[inv] = ejemplos[inv] ?? [];
  if (ejemplos[inv].length < 4) ejemplos[inv].push(detalle);
}
function fmt(d: Date | null): string {
  return d ? dayjs(d).format("ddd DD/MM HH:mm") : "—";
}

let totalCasos = 0;

// Invariantes
definirInv("INV1-SALTO", "El bloque se reubica solo (cae distinto de donde lo soltás)");
definirInv("INV2-INVISIBLE", "El bloque queda invisible en la semana donde lo soltaste");
definirInv("INV3-HE-DESBORDA", "El fin de una HE no es reloj continuo (inicio + horas)");
definirInv("INV4-FIN<=INI", "Fin anterior o igual al inicio");
definirInv("INV5-CHOQUE-FANTASMA", "Una tarea HE bloquea la mañana del día siguiente");
definirInv("SRV-ERROR", "El servidor rechaza la colocación");
definirInv("FORM1-FIN-PARITY", "recalcularFin (planif.) ≠ fin del server / programación");
definirInv("FORM2-HE-MANUAL", "Marcar HE NO debe recalcular el fin automáticamente");
definirInv("FORM3-HE-RECHAZO", "Marcar HE deja la tarea en estado que el server rechaza");
definirInv("FORM4-HH", "calcularHH no coincide con dur×qty(+HE)");
definirInv("FILT1-MULTI", "Filtro por operario/equipo pierde tareas multi-recurso");
definirInv("FILT2-SEMANA", "Filtro por semana no coincide con semana_plan");
definirInv("SYNC1-SEMANA", "fecha_inicio y semana_plan quedan inconsistentes");
definirInv("SYNC2-OVERLAP", "Tarea de la semana N no entra en el rango de esa semana");
definirInv("SYNC3-SACAR", "Sacar de la semana no la manda al pool 'sin semana'");
definirInv("SYNC4-EXTERNO", "Bulk 'Tercero' no marca trabajo_externo / no limpia equipo");
definirInv("BULK1-AUTOMAQ", "Bulk operario no autocompleta la máquina asignada del técnico");
definirInv("BULK2-NO-PISA", "Bulk operario pisa una máquina ya asignada en la fila");
definirInv("BULK3-EXPLICITA", "Bulk con máquina explícita no respeta la elección");
definirInv("LANE1-COMA", "Operario con coma en el nombre no aparece en su franja del Gantt");

// ═════════════════════════════════════════════════════════════════════════
// SUITE 1 — COLOCACIÓN (programación semanal)
// ═════════════════════════════════════════════════════════════════════════
{
  const DURACIONES = [0.5, 1, 2, 3, 4.5, 6, 9];
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
              reportar("SRV-ERROR", `[${view}] ${fmt(ini.toDate())} dur=${dur} qty=${qty} → ${res.error}`);
              continue;
            }
            const row = res.row!;
            const esHE = !!patch.horas_extras;

            if (row.fecha_inicio!.getTime() !== optimistaIni.getTime())
              reportar("INV1-SALTO", `[${view}] solté ${fmt(optimistaIni)} → quedó ${fmt(row.fecha_inicio)}`);
            if (!bloqueVisible(MONDAY, row.fecha_inicio, row.fecha_fin))
              reportar("INV2-INVISIBLE", `[${view}] ${fmt(ini.toDate())} dur=${dur} qty=${qty} HE=${esHE} → ${fmt(row.fecha_inicio)}→${fmt(row.fecha_fin)}`);
            if (esHE && row.fecha_inicio && row.fecha_fin) {
              const esperado = row.fecha_inicio.getTime() + dur * qty * 3_600_000;
              if (row.fecha_fin.getTime() !== esperado)
                reportar("INV3-HE-DESBORDA", `[${view}] HE ${fmt(row.fecha_inicio)} dur=${dur} qty=${qty} → ${fmt(row.fecha_fin)} (esperaba ${fmt(new Date(esperado))})`);
            }
            if (row.fecha_inicio && row.fecha_fin && row.fecha_fin.getTime() <= row.fecha_inicio.getTime())
              reportar("INV4-FIN<=INI", `[${view}] ${fmt(row.fecha_inicio)} → ${fmt(row.fecha_fin)}`);
          }
        }
      }
    }
  }

  // INV5: choque-fantasma — HE lunes 18:30 no debe bloquear martes 08:00
  totalCasos++;
  const lunesHE = MONDAY.hour(18).minute(30);
  const tareaHE = nuevaFila({ id: 100, horas_estimadas: 1, qty_personal: 1, maquina: "TR-01" });
  const storedHE = servidorPut(tareaHE, clienteSoltarBloque(tareaHE, lunesHE, "TR-01", "equipo").patch).row!;
  storedHE.id = 100;
  const martes8 = MONDAY.add(1, "day").hour(8).minute(0);
  const tareaMartes = nuevaFila({ id: 101, maquina: "TR-01", fecha_inicio: martes8.toDate(), fecha_fin: calcularFinEstimado(martes8.toDate(), 1) });
  if (solapan(storedHE, tareaMartes))
    reportar("INV5-CHOQUE-FANTASMA", `HE lunes 18:30 quedó ${fmt(storedHE.fecha_inicio)}→${fmt(storedHE.fecha_fin)} y choca martes 08:00`);
}

// ═════════════════════════════════════════════════════════════════════════
// SUITE 2 — FORM (planificación): recalcularFin, HE, HH
// ═════════════════════════════════════════════════════════════════════════
{
  const DURACIONES = [0.5, 1, 2.5, 4.5, 9];
  const QTYS = [1, 2, 3];
  const HEQTYS = [0, 1, 2.5];

  for (let day = 0; day < 5; day++) {
    for (let h = 8; h <= 16; h++) {
      const inicio = MONDAY.add(day, "day").hour(h).minute(0);
      for (const dur of DURACIONES) {
        for (const qty of QTYS) {
          totalCasos++;
          const r = nuevaFila({ horas_estimadas: dur, qty_personal: qty, tecnico: "Juan Pérez" });

          // FORM1: recalcularFin (planif.) debe coincidir con el fin que produce
          // el servidor y con el de programación semanal (mismo calcularFinEstimado).
          const patchPlanif = recalcularFin(r, { fecha_inicio: inicio.toDate() });
          const finServer = servidorPut(r, { fecha_inicio: inicio.toDate() }).row!.fecha_fin;
          if (patchPlanif.fecha_fin && finServer) {
            if (patchPlanif.fecha_fin.getTime() !== finServer.getTime())
              reportar("FORM1-FIN-PARITY", `dur=${dur} qty=${qty} ini=${fmt(inicio.toDate())}: planif=${fmt(patchPlanif.fecha_fin)} server=${fmt(finServer)}`);
          }

          // FORM4: HH
          for (const heq of HEQTYS) {
            const heOn = heq > 0;
            const hh = calcularHH({ duracionHrs: dur, qtyPersonal: qty, horasExtras: heOn, horasExtrasQty: heq });
            const esperado = dur * qty + (heOn ? heq : 0);
            if (Math.abs(hh - esperado) > 1e-9)
              reportar("FORM4-HH", `dur=${dur} qty=${qty} HEq=${heq} → ${hh} (esperaba ${esperado})`);
          }
        }
      }
    }
  }

  // FORM2 + FORM3: flujo del checkbox de HE.
  // Al marcar HE, la UI fija horas_extras_qty=1 si estaba vacío y NO recalcula el fin.
  {
    totalCasos++;
    const base = nuevaFila({ horas_estimadas: 2, qty_personal: 1, fecha_inicio: MONDAY.hour(10).toDate(), tecnico: "Juan Pérez" });
    base.fecha_fin = calcularFinEstimado(base.fecha_inicio!, 2);
    const finAntes = base.fecha_fin.getTime();

    // Marca HE (réplica del onChange checked=true)
    const qtyActual = base.horas_extras_qty != null ? Number(base.horas_extras_qty) : 0;
    const patchHE: Patch = { horas_extras: true };
    if (!(qtyActual > 0)) patchHE.horas_extras_qty = 1;
    const trasMarcar = servidorPut(base, patchHE);
    if (!trasMarcar.ok)
      reportar("FORM3-HE-RECHAZO", `marcar HE → server ${trasMarcar.error}`);
    else if (trasMarcar.row!.fecha_fin && trasMarcar.row!.fecha_fin.getTime() !== finAntes)
      reportar("FORM2-HE-MANUAL", `al marcar HE el fin cambió de ${fmt(new Date(finAntes))} a ${fmt(trasMarcar.row!.fecha_fin)}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════
// SUITE 3 — FILTROS (planificación) + paridad con programación semanal
// ═════════════════════════════════════════════════════════════════════════
{
  // Dataset con tareas single y MULTI-recurso (qty>1 → "Juan, Pedro").
  const dataset: Row[] = [
    nuevaFila({ id: 1, tecnico: "Juan Pérez", maquina: "TR-01", semana_plan: "2026W22", estado: "programado" }),
    nuevaFila({ id: 2, tecnico: joinTecnicos(["Juan Pérez", "Pedro Gómez"]), maquina: joinTecnicos(["TR-01", "TR-02"]), qty_personal: 2, semana_plan: "2026W22", estado: "programado" }),
    nuevaFila({ id: 3, tecnico: "Pedro Gómez", maquina: "TR-02", semana_plan: "2026W23", estado: "abierto" }),
    nuevaFila({ id: 4, tecnico: "Tercero", maquina: null, trabajo_externo: true, semana_plan: "2026W22", estado: "programado" }),
  ];

  const OPERARIOS = ["Juan Pérez", "Pedro Gómez", "Tercero"];
  const EQUIPOS = ["TR-01", "TR-02"];

  // FILT1: el resultado del filtro del servidor debe coincidir con lo que
  // programación semanal muestra en la franja de ese recurso (splitTecnicos).
  for (const op of OPERARIOS) {
    totalCasos++;
    const delServidor = new Set(servidorFiltrar(dataset, { tecnico: op }).map((r) => r.id));
    const enLaFranja = new Set(dataset.filter((r) => splitTecnicos(r.tecnico).includes(op)).map((r) => r.id));
    const faltan = [...enLaFranja].filter((id) => !delServidor.has(id));
    if (faltan.length > 0)
      reportar("FILT1-MULTI", `operario "${op}": programación muestra OT ${faltan.join(",")} pero el filtro del server no las trae`);
  }
  for (const eq of EQUIPOS) {
    totalCasos++;
    const delServidor = new Set(servidorFiltrar(dataset, { maquina: eq }).map((r) => r.id));
    const enLaFranja = new Set(dataset.filter((r) => splitTecnicos(r.maquina).includes(eq)).map((r) => r.id));
    const faltan = [...enLaFranja].filter((id) => !delServidor.has(id));
    if (faltan.length > 0)
      reportar("FILT1-MULTI", `equipo "${eq}": programación muestra OT ${faltan.join(",")} pero el filtro del server no las trae`);
  }

  // FILT2: filtrar por semana = exactamente las filas con esa semana_plan.
  for (const sem of ["2026W22", "2026W23"]) {
    totalCasos++;
    const delServidor = new Set(servidorFiltrar(dataset, { semana: sem }).map((r) => r.id));
    const esperado = new Set(dataset.filter((r) => r.semana_plan === sem).map((r) => r.id));
    if (delServidor.size !== esperado.size || [...esperado].some((id) => !delServidor.has(id)))
      reportar("FILT2-SEMANA", `semana ${sem}: server=${[...delServidor]} esperado=${[...esperado]}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════
// SUITE 4 — SINCRONIZACIÓN planificación ↔ programación semanal
// ═════════════════════════════════════════════════════════════════════════
{
  const desde = MONDAY.hour(0).minute(0).second(0).toDate();
  const hasta = MONDAY.add(4, "day").endOf("day").toDate();

  // SYNC1 + SYNC2: cualquier edición que fije fecha_inicio deja semana_plan
  // consistente, y la tarea entra en el rango [desde,hasta] de esa semana.
  for (let day = 0; day < 5; day++) {
    for (let h = 8; h <= 17; h++) {
      totalCasos++;
      const inicio = MONDAY.add(day, "day").hour(h).minute(0);
      const r = nuevaFila({ horas_estimadas: 2, qty_personal: 1, tecnico: "Juan Pérez" });
      // Edición desde planificación: setear inicio (con recalcularFin) → server.
      const patch = recalcularFin(r, { fecha_inicio: inicio.toDate() });
      const stored = servidorPut(r, patch as Patch).row!;

      const semanaEsperada = semanaCodigoFromDate(stored.fecha_inicio!);
      if (stored.semana_plan !== semanaEsperada)
        reportar("SYNC1-SEMANA", `ini=${fmt(stored.fecha_inicio)} semana_plan=${stored.semana_plan} (esperaba ${semanaEsperada})`);

      // La semana de referencia es la del inicio guardado.
      const monday = dayjs(stored.fecha_inicio!).startOf("isoWeek");
      const d = monday.hour(0).minute(0).second(0).toDate();
      const h2 = monday.add(4, "day").endOf("day").toDate();
      if (!pasaOverlap(stored, d, h2))
        reportar("SYNC2-OVERLAP", `tarea ${fmt(stored.fecha_inicio)}→${fmt(stored.fecha_fin)} no entra en su propia semana`);
    }
  }

  // SYNC3: "Sacar de la semana" (fecha_inicio/fin/semana = null) → al pool.
  {
    totalCasos++;
    const r = nuevaFila({ fecha_inicio: MONDAY.hour(10).toDate(), tecnico: "Juan Pérez", semana_plan: "2026W22", estado: "programado" });
    r.fecha_fin = calcularFinEstimado(r.fecha_inicio!, 1);
    const stored = servidorPut(r, { fecha_inicio: null, fecha_fin: null, semana_plan: null }).row!;
    const enPool = !stored.semana_plan && !stored.fecha_inicio;
    const enRango = pasaOverlap(stored, desde, hasta);
    if (!enPool || enRango)
      reportar("SYNC3-SACAR", `tras sacar: semana=${stored.semana_plan} ini=${fmt(stored.fecha_inicio)} enRango=${enRango}`);
  }

  // SYNC4: bulk "Tercero" → trabajo_externo=true + maquina=null + tecnico="Tercero".
  {
    totalCasos++;
    const r = nuevaFila({ tecnico: "Juan Pérez", maquina: "TR-01" });
    // Réplica de aplicarBulk con bulkTecnico="Tercero"
    const patch: Patch = { tecnico: "Tercero", trabajo_externo: true, maquina: null };
    const stored = servidorPut(r, patch).row!;
    if (stored.tecnico !== "Tercero" || stored.trabajo_externo !== true || stored.maquina !== null)
      reportar("SYNC4-EXTERNO", `tercero → tecnico=${stored.tecnico} externo=${stored.trabajo_externo} maquina=${stored.maquina}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════
// SUITE 5 — BULK: autoasignado de máquina al elegir operario (planificación)
// ═════════════════════════════════════════════════════════════════════════
{
  // Catálogo de operarios con su equipo asignado.
  const trabajadores: { nombre: string; equipo_codigo: string | null }[] = [
    { nombre: "Juan Pérez", equipo_codigo: "TR-09" },
    { nombre: "Pedro Gómez", equipo_codigo: null }, // operario sin máquina
  ];

  // Réplica de la lógica por fila de aplicarBulk (tras el fix).
  function bulkFilaPatch(
    r: Row,
    bulkTecnico: string | undefined,
    bulkMaquina: string | undefined,
  ): Patch {
    const patch: Patch = {};
    if (bulkTecnico !== undefined) {
      patch.tecnico = bulkTecnico ?? null;
      if (bulkTecnico === "Tercero") {
        patch.trabajo_externo = true;
        if (bulkMaquina === undefined) patch.maquina = null;
      } else if (bulkTecnico) {
        patch.trabajo_externo = false;
      }
    }
    if (bulkMaquina !== undefined) patch.maquina = bulkMaquina ?? null;

    const autoMaquina =
      bulkTecnico && bulkTecnico !== "Tercero" && bulkMaquina === undefined
        ? (trabajadores.find((t) => t.nombre === bulkTecnico)?.equipo_codigo ?? null)
        : null;

    const filaPatch: Patch = { ...patch };
    if (autoMaquina && !r.maquina) filaPatch.maquina = autoMaquina;
    return filaPatch;
  }

  // BULK1: operario con máquina, fila SIN máquina → autocompleta.
  {
    totalCasos++;
    const r = nuevaFila({ maquina: null });
    const out = servidorPut(r, bulkFilaPatch(r, "Juan Pérez", undefined)).row!;
    if (out.maquina !== "TR-09")
      reportar("BULK1-AUTOMAQ", `fila sin máquina + operario Juan(TR-09) → maquina=${out.maquina}`);
  }
  // BULK2: operario con máquina, fila CON máquina → no la pisa.
  {
    totalCasos++;
    const r = nuevaFila({ maquina: "TR-05" });
    const out = servidorPut(r, bulkFilaPatch(r, "Juan Pérez", undefined)).row!;
    if (out.maquina !== "TR-05")
      reportar("BULK2-NO-PISA", `fila con TR-05 + operario Juan → maquina=${out.maquina} (debía quedar TR-05)`);
  }
  // BULK3: máquina explícita en el bulk → manda la elección, no la del operario.
  {
    totalCasos++;
    const r = nuevaFila({ maquina: null });
    const out = servidorPut(r, bulkFilaPatch(r, "Juan Pérez", "TR-02")).row!;
    if (out.maquina !== "TR-02")
      reportar("BULK3-EXPLICITA", `bulk maquina=TR-02 + operario Juan → maquina=${out.maquina}`);
  }
  // Operario sin máquina asignada: fila queda sin máquina (no rompe).
  {
    totalCasos++;
    const r = nuevaFila({ maquina: null });
    const out = servidorPut(r, bulkFilaPatch(r, "Pedro Gómez", undefined)).row!;
    if (out.maquina !== null)
      reportar("BULK1-AUTOMAQ", `operario sin equipo → maquina=${out.maquina} (esperaba null)`);
  }
}

// ═════════════════════════════════════════════════════════════════════════
// SUITE 6 — NOMBRES DE OPERARIO CON COMA ("APELLIDO, NOMBRE")
// Reproduce el bug real: la tarea desaparecía de la franja del operario porque
// la coma del nombre se tomaba como separador de multi-recurso.
// ═════════════════════════════════════════════════════════════════════════
{
  const OPERARIOS_COMA = [
    "GALLEGOS AQUINO, EDUARDO GABRIEL",
    "HUERTA CORNEJO, LUIS ENRIQUE",
    "MATTOS BERNAL, GUILLERMO ANGELO MICHEL",
  ];

  // Una tarea asignada a un operario con coma debe agruparse bajo SU lane
  // (la clave del lane es el nombre completo). Si splitTecnicos lo parte, la
  // tarea no matchea ningún lane y desaparece.
  for (const op of OPERARIOS_COMA) {
    totalCasos++;
    const r = nuevaFila({ tecnico: op, fecha_inicio: MONDAY.hour(9).toDate() });
    const keys = splitTecnicos(r.tecnico); // claves de lane donde aparecería
    if (!keys.includes(op))
      reportar("LANE1-COMA", `"${op}": splitTecnicos=${JSON.stringify(keys)} → no matchea su lane (desaparece)`);

    // El filtro del servidor por ese operario debe traer su tarea.
    const got = servidorFiltrar([{ ...r, id: 1 }], { tecnico: op });
    if (got.length !== 1)
      reportar("LANE1-COMA", `filtro server por "${op}" trajo ${got.length} (esperaba 1)`);
  }

  // Multi-persona real (separador "|") con nombres que tienen coma: deben
  // quedar 2 operarios completos, no 4 pedazos.
  {
    totalCasos++;
    const multi = joinTecnicos([OPERARIOS_COMA[0], OPERARIOS_COMA[1]]);
    const keys = splitTecnicos(multi);
    if (keys.length !== 2 || !keys.includes(OPERARIOS_COMA[0]) || !keys.includes(OPERARIOS_COMA[1]))
      reportar("LANE1-COMA", `multi "${multi}" → ${JSON.stringify(keys)} (esperaba los 2 nombres completos)`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Reporte
// ─────────────────────────────────────────────────────────────────────────
const GRUPOS: { titulo: string; invs: string[] }[] = [
  { titulo: "1. COLOCACIÓN (programación semanal)", invs: ["INV1-SALTO", "INV2-INVISIBLE", "INV3-HE-DESBORDA", "INV4-FIN<=INI", "INV5-CHOQUE-FANTASMA", "SRV-ERROR"] },
  { titulo: "2. FORM (planificación)", invs: ["FORM1-FIN-PARITY", "FORM2-HE-MANUAL", "FORM3-HE-RECHAZO", "FORM4-HH"] },
  { titulo: "3. FILTROS (planificación ↔ programación)", invs: ["FILT1-MULTI", "FILT2-SEMANA"] },
  { titulo: "4. SINCRONIZACIÓN", invs: ["SYNC1-SEMANA", "SYNC2-OVERLAP", "SYNC3-SACAR", "SYNC4-EXTERNO"] },
  { titulo: "5. BULK (autoasignado de máquina)", invs: ["BULK1-AUTOMAQ", "BULK2-NO-PISA", "BULK3-EXPLICITA"] },
  { titulo: "6. NOMBRES CON COMA (operarios)", invs: ["LANE1-COMA"] },
];

console.log("\n══════════════════════════════════════════════════════════════════════");
console.log("  SIMULACIÓN INTENSIVA — Planificación / Programación Semanal");
console.log("══════════════════════════════════════════════════════════════════════");
console.log(`  Casos simulados: ${totalCasos.toLocaleString("es")}`);

let hayFallas = false;
for (const g of GRUPOS) {
  console.log(`\n  ── ${g.titulo} ──`);
  for (const inv of g.invs) {
    const n = conteo[inv] ?? 0;
    if (n > 0) hayFallas = true;
    const icon = n > 0 ? "❌" : "✅";
    console.log(`  ${icon} ${inv.padEnd(20)} ${String(n).padStart(6)}  ${descripciones[inv]}`);
  }
}

const conFallas = Object.keys(conteo).filter((k) => (conteo[k] ?? 0) > 0);
if (conFallas.length > 0) {
  console.log("\n──────────────────────────────────────────────────────────────────────");
  console.log("  EJEMPLOS DE FALLAS:");
  for (const inv of conFallas) {
    console.log(`\n  ▸ ${inv}`);
    for (const e of ejemplos[inv]) console.log(`      ${e}`);
  }
}

console.log("\n══════════════════════════════════════════════════════════════════════");
console.log(hayFallas ? "  RESULTADO: HAY BUGS ❌" : "  RESULTADO: TODO OK ✅");
console.log("══════════════════════════════════════════════════════════════════════\n");

process.exit(hayFallas ? 1 : 0);
