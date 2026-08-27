"use client";
import { useState } from "react";
import { Input } from "antd";
import type { TextAreaProps } from "antd/es/input";

// TextArea con estado LOCAL: el tipeo vive en el propio campo y recién se
// comitea al padre en onBlur. Para campos que conviven con tablas grandes en
// el mismo componente (ej. "Comentarios" del encabezado de la OT con la
// pestaña de cientos de requerimientos abierta abajo): el patrón controlado
// clásico re-renderizaba TODO en cada tecla y el tipeo se congelaba y
// aparecía "de golpe" (reporte del equipo 2026-08-27).
// Los cambios EXTERNOS de `value` (carga inicial, guardado) se sincronizan
// ajustando el estado durante el render (patrón "derive state from props" de
// la doc de React — sin useEffect, que la regla de hooks marca).
export function TextAreaLocal({ value, onCommit, ...rest }: Omit<TextAreaProps, "value" | "onChange"> & {
  value?: string;
  onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(value ?? "");
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setLocal(value ?? "");
  }
  return (
    <Input.TextArea
      {...rest}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => { if ((value ?? "") !== local) onCommit(local); }}
    />
  );
}
