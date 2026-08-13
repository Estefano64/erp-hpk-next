"use client";

// Desplegables de personas del módulo SSOMA.
//
//   <SelectTrabajador>  — todo el personal activo (RRHH → Trabajadores). Se
//     usa en los campos donde el formato pide "apellidos y nombres" de quien
//     reporta. Es buscable por nombre; si falta alguien, se lo da de alta como
//     trabajador y aparece acá sin tocar código.
//   <SelectResponsableSsoma> — solo cuentas con rol "responsable_ssoma": son
//     los únicos que pueden quedar a cargo de una acción correctiva, porque al
//     asignarlos se les notifica. Guarda el nombre y expone el id de la cuenta.
//
// Ambos leen /api/ssoma/personas a través del cache global (una sola llamada
// por sesión aunque haya varios selects en la pantalla).
import { Select } from "antd";
import { useCachedFetch } from "@/lib/useCachedFetch";

export interface TrabajadorOpcion {
  trabajador_id: number;
  nombre: string;
  puesto: string | null;
  area: string | null;
}

export interface ResponsableOpcion {
  id: number;
  nombre: string;
  email: string | null;
}

interface PersonasResponse {
  trabajadores: TrabajadorOpcion[];
  responsables: ResponsableOpcion[];
}

const URL_PERSONAS = "/api/ssoma/personas";

export function useSsomaPersonas(): PersonasResponse {
  const data = useCachedFetch<PersonasResponse>(URL_PERSONAS);
  return { trabajadores: data?.trabajadores ?? [], responsables: data?.responsables ?? [] };
}

// Nombre → id de cuenta, para poder notificar al responsable elegido.
export function usuarioIdDeResponsable(
  responsables: ResponsableOpcion[],
  nombre: string | null | undefined,
): number | null {
  if (!nombre) return null;
  const n = nombre.trim().toLowerCase();
  return responsables.find((r) => r.nombre.trim().toLowerCase() === n)?.id ?? null;
}

// ── Select de trabajador (nombre libre permitido) ────────────────
export function SelectTrabajador({
  value,
  onChange,
  onSelectPersona,
  placeholder = "Apellidos y nombres",
  disabled,
}: {
  value?: string;
  onChange?: (v: string | undefined) => void;
  // Para autocompletar campos hermanos (ej. el cargo) al elegir a alguien.
  onSelectPersona?: (t: TrabajadorOpcion | null) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const { trabajadores } = useSsomaPersonas();
  return (
    <Select
      showSearch
      allowClear
      disabled={disabled}
      placeholder={placeholder}
      value={value || undefined}
      onChange={(v) => {
        onChange?.(v ?? undefined);
        onSelectPersona?.(v ? trabajadores.find((t) => t.nombre === v) ?? null : null);
      }}
      optionFilterProp="label"
      options={trabajadores.map((t) => ({
        value: t.nombre,
        label: t.puesto ? `${t.nombre} — ${t.puesto}` : t.nombre,
      }))}
      style={{ width: "100%" }}
    />
  );
}

// ── Select de responsable de acción correctiva ───────────────────
export function SelectResponsableSsoma({
  value,
  onChange,
  placeholder = "Responsable",
  disabled,
}: {
  value?: string;
  onChange?: (v: string | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const { responsables } = useSsomaPersonas();
  return (
    <Select
      showSearch
      allowClear
      disabled={disabled}
      placeholder={placeholder}
      value={value || undefined}
      onChange={(v) => onChange?.(v ?? undefined)}
      optionFilterProp="label"
      notFoundContent="Nadie tiene el rol «Responsable SSOMA» todavía"
      options={responsables.map((r) => ({ value: r.nombre, label: r.nombre }))}
      style={{ width: "100%" }}
    />
  );
}
