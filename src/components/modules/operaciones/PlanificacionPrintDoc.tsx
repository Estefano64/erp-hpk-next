"use client";

// Documento de impresión de la Programación Semanal (tabla plana). Trae TODA la
// semana elegida (solo filtro semana) y renderiza las columnas seleccionadas.
// El "ocultar todo lo demás" al imprimir lo maneja el contenedor (portal a body
// en la página de planificación), igual que OTPrintDoc.

import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { splitRecursos } from "@/lib/recursos";
import { formatDateOnlyShort } from "@/lib/dates";

dayjs.extend(isoWeek);

type Dict = Record<string, unknown>;

// Columnas disponibles para la tabla plana (orden fijo de impresión).
export const PLAN_PRINT_COLS: { key: string; label: string }[] = [
  { key: "operario", label: "Operario" },
  { key: "ot", label: "OT" },
  { key: "cliente", label: "Cliente" },
  { key: "tarea", label: "Tarea" },
  { key: "maquina", label: "Máquina" },
  { key: "horas", label: "Hs" },
  { key: "fechas", label: "Inicio → Fin" },
  { key: "estado", label: "Estado" },
];

interface Props {
  semana: string;             // "YYYYWnn" (ej. "2026W27")
  columnas: string[];         // keys de PLAN_PRINT_COLS a imprimir
  orient?: "vertical" | "horizontal";
  autoPrint?: boolean;
}

export default function PlanificacionPrintDoc({ semana, columnas, orient = "vertical", autoPrint = false }: Props) {
  const [rows, setRows] = useState<Dict[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    (async () => {
      try {
        const r = await fetch(`/api/planificacion?semana=${encodeURIComponent(semana)}`);
        const j = r.ok ? await r.json() : null;
        if (!cancel) { setRows(j?.data ?? []); setCargando(false); }
      } catch {
        if (!cancel) { setRows([]); setCargando(false); }
      }
    })();
    return () => { cancel = true; };
  }, [semana]);

  useEffect(() => {
    if (autoPrint && !cargando) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [autoPrint, cargando]);

  const rango = useMemo(() => {
    const [yStr, wStr] = semana.split("W");
    const y = Number(yStr), w = Number(wStr);
    if (!Number.isFinite(y) || !Number.isFinite(w)) return semana;
    const lunes = dayjs().year(y).isoWeek(w).startOf("isoWeek");
    return `${lunes.format("DD/MM")} – ${lunes.add(5, "day").format("DD/MM/YYYY")}`;
  }, [semana]);

  const cols = PLAN_PRINT_COLS.filter((c) => columnas.includes(c.key));
  const fld = (v: unknown) => (v == null || v === "" ? "—" : String(v));

  const cell = (r: Dict, key: string) => {
    const otr = r.orden_trabajo as Dict | null;
    switch (key) {
      case "operario": return splitRecursos((r.tecnico as string) ?? "").join(", ") || "—";
      case "ot": return fld(otr?.ot);
      case "cliente": { const c = otr?.cliente as Dict | null; return fld(c?.nombre_comercial ?? c?.razon_social); }
      case "tarea": return fld(r.descripcion ?? r.operacion_codigo);
      case "maquina": return fld(r.maquina);
      case "horas": return fld(r.horas_estimadas);
      case "fechas": return `${r.fecha_inicio ? formatDateOnlyShort(r.fecha_inicio as string) : "—"} → ${r.fecha_fin ? formatDateOnlyShort(r.fecha_fin as string) : "—"}`;
      case "estado": return fld(r.estado);
      default: return "—";
    }
  };

  if (cargando) return <div style={{ padding: 24 }}>Preparando impresión…</div>;

  const ordenadas = [...rows].sort(
    (a, b) => String(a.tecnico ?? "").localeCompare(String(b.tecnico ?? "")) || String(a.fecha_inicio ?? "").localeCompare(String(b.fecha_inicio ?? "")),
  );

  return (
    <div className="plan-print-doc">
      <div className="doc">
        <div className="doc-header">
          <div>
            <div className="doc-title">Programación Semanal</div>
            <div className="doc-sub">Semana {semana} &nbsp;·&nbsp; {rango} &nbsp;·&nbsp; {rows.length} tarea(s)</div>
          </div>
          <div className="doc-meta">Impreso: {formatDateOnlyShort(new Date().toISOString())}</div>
        </div>

        {rows.length === 0 ? <p className="muted">Sin tareas en la semana.</p> : (
          <table className="data">
            <thead><tr>{cols.map((c) => <th key={c.key} className={c.key === "horas" ? "r" : ""}>{c.label}</th>)}</tr></thead>
            <tbody>
              {ordenadas.map((r, i) => (
                <tr key={i}>
                  {cols.map((c) => <td key={c.key} className={c.key === "horas" ? "r" : ""}>{cell(r, c.key)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <style>{`
        @page { size: A4 ${orient === "horizontal" ? "landscape" : "portrait"}; margin: 12mm; }
        .plan-print-doc .doc { color: #111; font-family: Arial, sans-serif; font-size: 11px; }
        .plan-print-doc .doc-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #14324f; padding-bottom: 6px; margin-bottom: 10px; }
        .plan-print-doc .doc-title { font-size: 16px; font-weight: 700; color: #14324f; }
        .plan-print-doc .doc-sub { font-size: 11px; color: #444; margin-top: 2px; }
        .plan-print-doc .doc-meta { font-size: 10px; color: #777; white-space: nowrap; }
        .plan-print-doc table { width: 100%; border-collapse: collapse; }
        .plan-print-doc table.data th { background: #14324f; color: #fff; text-align: left; padding: 4px 6px; font-size: 10px; }
        .plan-print-doc table.data td { padding: 3px 6px; border-bottom: 1px solid #e5e5e5; }
        .plan-print-doc table.data tr:nth-child(even) td { background: #fafbfc; }
        .plan-print-doc table.data .r { text-align: right; }
        .plan-print-doc .muted { color: #999; }
        @media print {
          .plan-print-doc table.data tr { break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
