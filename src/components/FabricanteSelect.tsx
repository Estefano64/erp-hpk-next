"use client";

// Selector de fabricante con alta rápida: si la marca no está en el catálogo,
// el pie del desplegable ofrece "+ Agregar «lo tipeado»" y la crea vía
// /api/fabricantes sin salir del formulario (mantenimiento no podía cargar un
// requerimiento con una marca nueva, 2026-10-20). Funciona dentro de un
// Form.Item (recibe value/onChange) o suelto.

import { useState } from "react";
import { App, Button, Select } from "antd";
import type { SelectProps } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { brand } from "@/lib/theme";
import { useCachedFetch, invalidateCache } from "@/lib/useCachedFetch";
import { useEscrituraApi } from "@/lib/use-escritura";

const URL_FABRICANTES = "/api/catalogos?tabla=fabricante";

type Fabricante = { codigo: string; nombre: string };

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

type Props = Omit<SelectProps<string>, "options" | "showSearch" | "onChange"> & {
  value?: string | null;
  onChange?: (v: string | undefined) => void;
  /** Etiqueta "COD — Nombre" (formularios) o solo el nombre (celdas angostas). */
  conCodigo?: boolean;
};

export default function FabricanteSelect({ value, onChange, conCodigo = true, ...rest }: Props) {
  const { message } = App.useApp();
  const res = useCachedFetch<{ data: Fabricante[] }>(URL_FABRICANTES);
  // Los recién creados se suman acá: el cache compartido se invalida para el
  // próximo montaje, pero este selector no vuelve a pedir la lista.
  const [creados, setCreados] = useState<Fabricante[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [creando, setCreando] = useState(false);
  const puedeCrear = useEscrituraApi("/api/fabricantes");

  const fabricantes = [
    ...(res?.data ?? []),
    ...creados.filter((c) => !(res?.data ?? []).some((f) => f.codigo === c.codigo)),
  ];

  const texto = busqueda.trim();
  const clave = normalizar(texto);
  const yaExiste = !!clave && fabricantes.some((f) => normalizar(f.nombre) === clave || normalizar(f.codigo) === clave);

  const crear = async () => {
    if (!texto) return;
    setCreando(true);
    try {
      const r = await fetch("/api/fabricantes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: texto }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.data) {
        message.error(j?.error ?? "No se pudo agregar el fabricante");
        return;
      }
      const f: Fabricante = { codigo: j.data.codigo, nombre: j.data.nombre };
      setCreados((prev) => [...prev, f]);
      invalidateCache(URL_FABRICANTES);
      onChange?.(f.codigo);
      setBusqueda("");
      message.success(j.existente
        ? `Ya existía: ${f.nombre} (${f.codigo}). Quedó seleccionado.`
        : `Fabricante agregado: ${f.nombre} (${f.codigo})`);
    } finally {
      setCreando(false);
    }
  };

  return (
    <Select
      {...rest}
      value={value ?? undefined}
      onChange={(v) => onChange?.(v)}
      showSearch
      allowClear
      optionFilterProp="label"
      searchValue={busqueda}
      onSearch={setBusqueda}
      onOpenChange={(open) => { if (!open) setBusqueda(""); }}
      options={fabricantes.map((f) => ({
        value: f.codigo,
        label: conCodigo ? `${f.codigo} — ${f.nombre}` : f.nombre,
      }))}
      popupRender={(menu) => (
        <div>
          {menu}
          {puedeCrear && texto && !yaExiste && (
            <div style={{ borderTop: `1px solid ${brand.border}`, padding: "4px 8px" }}>
              <Button
                type="link" size="small" block icon={<PlusOutlined />}
                loading={creando}
                onMouseDown={(e) => e.preventDefault()}
                onClick={crear}
                style={{ textAlign: "left" }}
              >
                Agregar fabricante <b>{`"${texto}"`}</b>
              </Button>
            </div>
          )}
        </div>
      )}
    />
  );
}
