"use client";

// Documento de impresión de la Programación Semanal. Trae TODA la semana
// elegida (sin otros filtros) y la renderiza en dos formatos seleccionables:
//   - "plana":  una tabla con todas las tareas (Operario · OT · Cliente · …)
//   - "grilla": operarios (filas) × días Lun-Sáb (columnas), tareas en celdas
// El "ocultar todo lo demás" al imprimir lo maneja el contenedor (portal a body
// en la página de planificación), igual que OTPrintDoc.

import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { splitRecursos } from "@/lib/recursos";
import { formatDateOnlyShort } from "@/lib/dates";

dayjs.extend(isoWeek);

type Dict = Record<string, unknown>;

interface Props {
  semana: string;                 // "YYYY-Wnn"
  formatos: string[];             // ["plana", "grilla"]
  orient?: "vertical" | "horizontal";
  autoPrint?: boolean;
}

const DIAS_LABEL = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export default function PlanificacionPrintDoc({ semana, formatos, orient = "horizontal", autoPrint = false }: Props) {
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

  // Días de la semana (Lun-Sáb) a partir del código ISO.
  const dias = useMemo(() => {
    const [yStr, wStr] = semana.split("-W");
    const year = Number(yStr), week = Number(wStr);
    if (!Number.isFinite(year) || !Number.isFinite(week)) return [];
    const lunes = dayjs().year(year).isoWeek(week).startOf("isoWeek");
    return Array.from({ length: 6 }, (_, i) => lunes.add(i, "day"));
  }, [semana]);

  const rangoLabel = dias.length ? `${dias[0].format("DD/MM")} – ${dias[5].format("DD/MM/YYYY")}` : semana;

  // Operarios distintos (una tarea multi-operario cuenta para cada uno).
  const operarios = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) splitRecursos((r.tecnico as string) ?? "").forEach((t) => t && set.add(t));
    return [...set].sort();
  }, [rows]);

  const fld = (v: unknown) => (v == null || v === "" ? "—" : String(v));
  const otCod = (r: Dict) => fld((r.orden_trabajo as Dict | null)?.ot);
  const cliente = (r: Dict) => {
    const c = (r.orden_trabajo as Dict | null)?.cliente as Dict | null;
    return fld(c?.nombre_comercial ?? c?.razon_social);
  };

  if (cargando) return <div style={{ padding: 24 }}>Preparando impresión…</div>;

  return (
    <div className="plan-print-doc">
      <div className="doc">
        <div className="doc-header">
          <div>
            <div className="doc-title">Programación Semanal</div>
            <div className="doc-sub">Semana {semana} &nbsp;·&nbsp; {rangoLabel} &nbsp;·&nbsp; {rows.length} tarea(s)</div>
          </div>
          <div className="doc-meta">Impreso: {formatDateOnlyShort(new Date().toISOString())}</div>
        </div>

        {formatos.includes("plana") && (
          <section className="seccion">
            <h2>Tareas de la semana</h2>
            {rows.length === 0 ? <p className="muted">Sin tareas en la semana.</p> : (
              <table className="data">
                <thead><tr><th>Operario</th><th>OT</th><th>Cliente</th><th>Tarea</th><th>Máquina</th><th>Hs</th><th>Inicio → Fin</th><th>Estado</th></tr></thead>
                <tbody>
                  {[...rows]
                    .sort((a, b) => String(a.tecnico ?? "").localeCompare(String(b.tecnico ?? "")) || String(a.fecha_inicio ?? "").localeCompare(String(b.fecha_inicio ?? "")))
                    .map((r, i) => (
                      <tr key={i}>
                        <td>{splitRecursos((r.tecnico as string) ?? "").join(", ") || "—"}</td>
                        <td>{otCod(r)}</td>
                        <td>{cliente(r)}</td>
                        <td>{fld(r.descripcion ?? r.operacion_codigo)}</td>
                        <td>{fld(r.maquina)}</td>
                        <td className="r">{fld(r.horas_estimadas)}</td>
                        <td>{r.fecha_inicio ? formatDateOnlyShort(r.fecha_inicio as string) : "—"} → {r.fecha_fin ? formatDateOnlyShort(r.fecha_fin as string) : "—"}</td>
                        <td>{fld(r.estado)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {formatos.includes("grilla") && (
          <section className={`seccion ${formatos.includes("plana") ? "salto" : ""}`}>
            <h2>Grilla semanal (operario × día)</h2>
            {operarios.length === 0 ? <p className="muted">Sin tareas con operario asignado.</p> : (
              <table className="grid">
                <thead>
                  <tr>
                    <th>Operario</th>
                    {dias.map((d, i) => <th key={i}>{DIAS_LABEL[i]} {d.format("DD/MM")}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {operarios.map((op) => (
                    <tr key={op}>
                      <td className="op">{op}</td>
                      {dias.map((d, i) => {
                        const dstr = d.format("YYYY-MM-DD");
                        const tareasDia = rows.filter((r) =>
                          splitRecursos((r.tecnico as string) ?? "").includes(op) &&
                          r.fecha_inicio && String(r.fecha_inicio).slice(0, 10) === dstr,
                        );
                        return (
                          <td key={i} className="cell">
                            {tareasDia.map((t, k) => (
                              <div key={k} className="tarea">
                                <b>{otCod(t)}</b> {fld(t.descripcion ?? t.operacion_codigo)}
                                {t.maquina ? <span className="maq"> · {String(t.maquina)}</span> : null}
                                {t.horas_estimadas ? <span className="hs"> · {String(t.horas_estimadas)}h</span> : null}
                              </div>
                            ))}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
      </div>

      <style>{`
        @page { size: A4 ${orient === "horizontal" ? "landscape" : "portrait"}; margin: 12mm; }
        .plan-print-doc .doc { color: #111; font-family: Arial, sans-serif; font-size: 11px; }
        .plan-print-doc .doc-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #14324f; padding-bottom: 6px; margin-bottom: 10px; }
        .plan-print-doc .doc-title { font-size: 16px; font-weight: 700; color: #14324f; }
        .plan-print-doc .doc-sub { font-size: 11px; color: #444; margin-top: 2px; }
        .plan-print-doc .doc-meta { font-size: 10px; color: #777; white-space: nowrap; }
        .plan-print-doc h2 { font-size: 13px; color: #14324f; border-left: 4px solid #17a2b8; padding-left: 8px; margin: 14px 0 8px; }
        .plan-print-doc table { width: 100%; border-collapse: collapse; }
        .plan-print-doc table.data th { background: #14324f; color: #fff; text-align: left; padding: 4px 6px; font-size: 10px; }
        .plan-print-doc table.data td { padding: 3px 6px; border-bottom: 1px solid #e5e5e5; }
        .plan-print-doc table.data tr:nth-child(even) td { background: #fafbfc; }
        .plan-print-doc table.data .r { text-align: right; }
        .plan-print-doc table.grid th { background: #14324f; color: #fff; padding: 4px 5px; font-size: 10px; border: 1px solid #24455f; }
        .plan-print-doc table.grid td { border: 1px solid #d5dde3; vertical-align: top; padding: 3px 5px; }
        .plan-print-doc table.grid td.op { font-weight: 600; background: #f0f4f7; white-space: nowrap; }
        .plan-print-doc .tarea { font-size: 10px; margin-bottom: 3px; padding-bottom: 2px; border-bottom: 1px dotted #e0e0e0; }
        .plan-print-doc .tarea .maq { color: #0a6; }
        .plan-print-doc .tarea .hs { color: #777; }
        .plan-print-doc .muted { color: #999; }
        @media print {
          .plan-print-doc .seccion.salto { break-before: page; }
          .plan-print-doc table.data tr, .plan-print-doc table.grid tr { break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
