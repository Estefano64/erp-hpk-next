"use client";

// Documento de impresión reusable de una OT. Renderiza un layout limpio para
// papel/PDF con las secciones elegidas. Se usa desde:
//   - un modal a pantalla completa en el detalle de OT (OTDetalleContent), y
//   - la ruta /ordenes-trabajo/[id]/imprimir (URL directa).
//
// El CSS de print usa el truco de `visibility` para imprimir SOLO este
// documento (ocultando el resto de la página / el chrome del modal), así
// funciona igual dentro de un modal que como página suelta.

import { useEffect, useState } from "react";
import { formatOtCodigo } from "@/lib/ot-formato";
import { formatDateOnly } from "@/lib/dates";

type Dict = Record<string, unknown>;

function fmtMoneda(v: unknown, m: string): string {
  const n = Number(v ?? 0);
  const s = n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sim = m === "USD" ? "US$ " : m === "PEN" || m === "SOL" ? "S/ " : `${m} `;
  return `${sim}${s}`;
}

function MonedaTot({ tot }: { tot: Record<string, number> | undefined }) {
  const e = Object.entries(tot ?? {}).filter(([, v]) => v !== 0);
  if (e.length === 0) return <span className="muted">—</span>;
  return <>{e.map(([m, v]) => fmtMoneda(v, m)).join("  ·  ")}</>;
}

interface Props {
  otId: number;
  secciones: string[];
  orient?: "vertical" | "horizontal";
  // Dispara window.print() automáticamente cuando termina de cargar.
  autoPrint?: boolean;
}

export default function OTPrintDoc({ otId, secciones, orient = "vertical", autoPrint = false }: Props) {
  const [ot, setOt] = useState<Dict | null>(null);
  const [tareas, setTareas] = useState<Dict[]>([]);
  const [reqs, setReqs] = useState<Dict[]>([]);
  const [costos, setCostos] = useState<Dict | null>(null);
  const [historial, setHistorial] = useState<Dict[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    (async () => {
      try {
        const j = async (url: string) => {
          const r = await fetch(url);
          return r.ok ? r.json() : null;
        };
        const otRes = await j(`/api/ordenes-trabajo/${otId}`);
        if (!otRes?.data) { if (!cancel) { setError("OT no encontrada"); setCargando(false); } return; }
        const tasks: Promise<void>[] = [];
        if (secciones.includes("tareas")) tasks.push(j(`/api/ordenes-trabajo/${otId}/planificacion`).then((x) => { if (!cancel) setTareas(x?.data ?? []); }));
        if (secciones.includes("requerimientos")) tasks.push(j(`/api/ordenes-trabajo/${otId}/requerimientos`).then((x) => { if (!cancel) setReqs(x?.data ?? []); }));
        if (secciones.includes("costos")) tasks.push(j(`/api/ordenes-trabajo/${otId}/costos`).then((x) => { if (!cancel) setCostos(x?.data ?? null); }));
        if (secciones.includes("historial")) tasks.push(j(`/api/ordenes-trabajo/${otId}/historial`).then((x) => { if (!cancel) setHistorial(x?.data ?? []); }));
        await Promise.all(tasks);
        if (!cancel) { setOt(otRes.data); setCargando(false); }
      } catch {
        if (!cancel) { setError("Error al cargar la OT"); setCargando(false); }
      }
    })();
    return () => { cancel = true; };
  }, [otId, secciones]);

  useEffect(() => {
    if (autoPrint && !cargando && !error && ot) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [autoPrint, cargando, error, ot]);

  if (error) return <div style={{ padding: 24 }}>⚠ {error}</div>;
  if (cargando || !ot) return <div style={{ padding: 24 }}>Preparando impresión…</div>;

  const otCodigo = formatOtCodigo(ot.ot as number, ot.tipo_codigo as string, "—");
  const cliente = ot.cliente as Dict | null;
  const fld = (v: unknown) => (v == null || v === "" ? "—" : String(v));

  const Header = () => (
    <div className="doc-header">
      <div>
        <div className="doc-title">Orden de Trabajo {otCodigo}</div>
        <div className="doc-sub">
          {fld(cliente?.nombre_comercial ?? cliente?.razon_social)} &nbsp;·&nbsp;
          Equipo: {fld(ot.equipo_codigo)} &nbsp;·&nbsp; {fld(ot.descripcion)}
        </div>
      </div>
      <div className="doc-meta">Impreso: {formatDateOnly(new Date().toISOString())}</div>
    </div>
  );

  return (
    <div className="ot-print-doc">
      <div className="doc">
        {secciones.includes("resumen") && (
          <section className="seccion">
            <Header />
            <h2>Resumen</h2>
            <table className="kv">
              <tbody>
                <tr><th>Nro OT</th><td>{otCodigo}</td><th>Tipo</th><td>{fld(ot.tipo)}</td></tr>
                <tr><th>Cliente</th><td>{fld(cliente?.nombre_comercial ?? cliente?.razon_social)}</td><th>Cant.</th><td>{fld(ot.cantidad)}</td></tr>
                <tr><th>Cod. Reparable</th><td>{fld((ot.codigo_reparacion as Dict | null)?.codigo)}</td><th>N/P</th><td>{fld(ot.np)}</td></tr>
                <tr><th>Equipo</th><td>{fld(ot.equipo_codigo)}</td><th>N/S</th><td>{fld(ot.ns)}</td></tr>
                <tr><th>Flota</th><td>{fld(ot.cod_rep_flota)}</td><th>Posición</th><td>{fld(ot.cod_rep_posicion)}</td></tr>
                <tr><th>Descripción</th><td colSpan={3}>{fld(ot.descripcion)}</td></tr>
                <tr><th>PO Cliente</th><td>{fld(ot.po_cliente)}</td><th>PO Item</th><td>{fld(ot.po_item)}</td></tr>
                <tr><th>Estado OT</th><td>{fld((ot.ot_status as Dict | null)?.nombre)}</td><th>Recursos</th><td>{fld((ot.recursos_status as Dict | null)?.nombre)}</td></tr>
                <tr><th>Fecha recepción</th><td>{ot.fecha_recepcion ? formatDateOnly(ot.fecha_recepcion as string) : "—"}</td><th>Fecha req.</th><td>{ot.fecha_requerimiento_cliente ? formatDateOnly(ot.fecha_requerimiento_cliente as string) : "—"}</td></tr>
                <tr><th>PCR</th><td>{fld(ot.pcr)}</td><th>Horas</th><td>{fld(ot.horas)}</td></tr>
                <tr><th>Cotización</th><td colSpan={3}>{ot.monto_cotizacion != null ? fmtMoneda(ot.monto_cotizacion, String((ot.moneda_cotizacion as Dict | null)?.codigo ?? ot.moneda_cotizacion_codigo ?? "")) : "—"}</td></tr>
              </tbody>
            </table>
          </section>
        )}

        {secciones.includes("tareas") && (
          <section className="seccion salto">
            <Header />
            <h2>Tareas ({tareas.length})</h2>
            {tareas.length === 0 ? <p className="muted">Sin tareas.</p> : (
              <table className="data">
                <thead><tr><th>#</th><th>Componente</th><th>Operación</th><th>Descripción</th><th>Hs est.</th><th>Técnico</th><th>Estado</th></tr></thead>
                <tbody>
                  {tareas.map((t, i) => (
                    <tr key={i}>
                      <td>{fld(t.orden ?? i + 1)}</td><td>{fld(t.componente)}</td><td>{fld(t.operacion_codigo)}</td>
                      <td>{fld(t.descripcion)}</td><td className="r">{fld(t.horas_estimadas)}</td><td>{fld(t.tecnico)}</td><td>{fld(t.estado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {secciones.includes("requerimientos") && (
          <section className="seccion salto">
            <Header />
            <h2>Requerimientos ({reqs.length})</h2>
            {reqs.length === 0 ? <p className="muted">Sin requerimientos.</p> : (
              <table className="data">
                <thead><tr><th>Req/Item</th><th>Código</th><th>Descripción</th><th>Cant.</th><th>UM</th><th>Precio</th><th>Estado</th></tr></thead>
                <tbody>
                  {reqs.map((r, i) => (
                    <tr key={i}>
                      <td>{fld(r.nro_req)}{r.item_req != null ? `.${r.item_req}` : ""}</td>
                      <td>{fld(r.material_codigo)}</td>
                      <td>{fld(((r.material as Dict | null)?.descripcion) ?? r.descripcion)}</td>
                      <td className="r">{fld(r.cantidad)}</td>
                      <td>{fld(r.unidad_medida)}</td>
                      <td className="r">{r.precio_unitario != null ? fmtMoneda(r.precio_unitario, String(r.moneda ?? "USD")) : "—"}</td>
                      <td>{fld(r.status_requerimiento_codigo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {secciones.includes("costos") && costos && (
          <section className="seccion salto">
            <Header />
            <h2>Costos</h2>
            <table className="data">
              <thead><tr><th>Categoría</th><th className="r">Estrategia</th><th className="r">Estimado</th><th className="r">Real (ejecutado)</th></tr></thead>
              <tbody>
                {([
                  ["Materiales", "materiales"], ["Cargo directo", "cargo_directo"], ["Servicios", "servicios"], ["HH", "hh"],
                ] as const).map(([label, key]) => {
                  const est = costos.estrategia as Dict, esti = costos.estimado as Dict, eje = costos.ejecutado as Dict;
                  return (
                    <tr key={key}>
                      <td>{label}</td>
                      <td className="r"><MonedaTot tot={(est?.[key] as Dict)?.total_por_moneda as Record<string, number>} /></td>
                      <td className="r"><MonedaTot tot={(esti?.[key] as Dict)?.total_por_moneda as Record<string, number>} /></td>
                      <td className="r"><MonedaTot tot={(eje?.[key] as Dict)?.total_por_moneda as Record<string, number>} /></td>
                    </tr>
                  );
                })}
                <tr className="total">
                  <td>TOTAL</td>
                  <td className="r"><MonedaTot tot={(costos.estrategia as Dict)?.total_por_moneda as Record<string, number>} /></td>
                  <td className="r"><MonedaTot tot={(costos.estimado as Dict)?.total_por_moneda as Record<string, number>} /></td>
                  <td className="r"><MonedaTot tot={(costos.ejecutado as Dict)?.total_por_moneda as Record<string, number>} /></td>
                </tr>
              </tbody>
            </table>
          </section>
        )}

        {secciones.includes("historial") && (
          <section className="seccion salto">
            <Header />
            <h2>Historial ({historial.length})</h2>
            {historial.length === 0 ? <p className="muted">Sin historial.</p> : (
              <table className="data">
                <thead><tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Usuario</th></tr></thead>
                <tbody>
                  {historial.map((h, i) => (
                    <tr key={i}>
                      <td>{h.fecha ? formatDateOnly(h.fecha as string) : "—"}</td>
                      <td>{fld(h.tipo_operacion)}</td><td>{fld(h.descripcion)}</td><td>{fld(h.usuario)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
      </div>

      <style>{`
        @page { size: A4 ${orient === "horizontal" ? "landscape" : "portrait"}; margin: 14mm; }
        .ot-print-doc .doc { color: #111; font-family: Arial, sans-serif; font-size: 12px; }
        .ot-print-doc .doc-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #14324f; padding-bottom: 6px; margin-bottom: 10px; }
        .ot-print-doc .doc-title { font-size: 16px; font-weight: 700; color: #14324f; }
        .ot-print-doc .doc-sub { font-size: 11px; color: #444; margin-top: 2px; }
        .ot-print-doc .doc-meta { font-size: 10px; color: #777; white-space: nowrap; }
        .ot-print-doc h2 { font-size: 13px; color: #14324f; border-left: 4px solid #17a2b8; padding-left: 8px; margin: 14px 0 8px; }
        .ot-print-doc table { width: 100%; border-collapse: collapse; }
        .ot-print-doc table.kv th { text-align: left; background: #f0f4f7; width: 16%; padding: 4px 6px; border: 1px solid #dde; font-weight: 600; }
        .ot-print-doc table.kv td { padding: 4px 6px; border: 1px solid #dde; }
        .ot-print-doc table.data th { background: #14324f; color: #fff; text-align: left; padding: 5px 6px; font-size: 11px; }
        .ot-print-doc table.data td { padding: 4px 6px; border-bottom: 1px solid #e5e5e5; }
        .ot-print-doc table.data tr:nth-child(even) td { background: #fafbfc; }
        .ot-print-doc table.data th.r, .ot-print-doc table.data td.r { text-align: right; }
        .ot-print-doc table.data tr.total td { font-weight: 700; border-top: 2px solid #14324f; background: #eef3f6; }
        .ot-print-doc .muted { color: #999; }
        @media print {
          /* Saltos de página por sección + no cortar tablas. El "ocultar todo lo
             demás" lo maneja el contenedor (modal en el detalle, o la ruta). */
          .ot-print-doc .seccion.salto { break-before: page; }
          .ot-print-doc table, .ot-print-doc tr, .ot-print-doc td, .ot-print-doc th { break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
