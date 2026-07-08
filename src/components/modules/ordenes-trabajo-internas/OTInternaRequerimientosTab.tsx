"use client";

// Tab "Requerimientos" del detalle de OT Interna.
//
// Este archivo dejó de ser una calca de ~2000 líneas: ahora es un thin wrapper
// que delega TODO a `OTRequerimientosTab` (fuente de verdad) con `kind="interna"`.
// El componente unificado maneja las diferencias por dominio:
//   - URLs: /api/ordenes-trabajo-internas/…
//   - Botón "Aplicar Task List" (equipo + PM cascada) vs "Generar desde template"
//   - Sin validación de fecha_recepcion (interna no la tiene)
//   - Equivalencia cil↔gl en cantidad y precio (uso típico de mantenimiento)
//   - Auto-rescale de precio referencial cuando la UM difiere del catálogo
//
// El componente unificado también preserva `useColumnasOcultas` con clave
// namespaced por kind, así usuarios pueden tener layouts distintos por tipo
// de OT sin pisarse entre sí.

import OTRequerimientosTab from "@/components/modules/ordenes-trabajo/OTRequerimientosTab";

interface Props {
  otInternaId: number;
  onUpdated?: () => void;
}

export default function OTInternaRequerimientosTab({ otInternaId, onUpdated }: Props) {
  return (
    <OTRequerimientosTab
      kind="interna"
      otId={otInternaId}
      codRepCodigo={null}
      onUpdated={onUpdated}
    />
  );
}
