"use client";

import { useEffect, useState } from "react";
import { Input, InputNumber, Select, Tooltip, Typography } from "antd";
import { EditOutlined } from "@ant-design/icons";
import { brand } from "@/lib/theme";

const { Text } = Typography;

type CellType = "string" | "number";

interface BaseProps {
  value: string | number | null | undefined;
  type: CellType;
  /** Callback async; debe rechazar para indicar fallo (revertir UI) */
  onSave: (newValue: string | number | null) => Promise<void>;
  /** Si está en true, el cell no es editable (display-only) */
  disabled?: boolean;
  /** Texto/control mostrado cuando está en modo display (default: el valor formateado) */
  display?: React.ReactNode;
  /** Sufijo (ej. "USD") cuando está en modo display */
  suffix?: string;
  /** Permite null/empty al guardar (default true para text, false para number con required) */
  allowEmpty?: boolean;
  /** Placeholder cuando está vacío */
  emptyPlaceholder?: string;
}

// Cell que muestra valor; click → input autofocus; Enter o blur guarda; Esc cancela.
// Maneja loading optimistico: muestra el nuevo valor inmediatamente, revierte si falla.
export function EditableCell({
  value, type, onSave, disabled, display, suffix, allowEmpty = true, emptyPlaceholder = "—",
}: BaseProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string | number | null>(value ?? null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(value ?? null);
  }, [value, editing]);

  function start() {
    if (disabled || saving) return;
    setDraft(value ?? null);
    setEditing(true);
  }

  async function commit() {
    if (saving) return;
    const finalVal: string | number | null =
      draft === "" || draft === null || draft === undefined ? null : draft;
    if (!allowEmpty && finalVal === null) {
      setEditing(false);
      return;
    }
    if (finalVal === (value ?? null)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(finalVal);
      setEditing(false);
    } catch {
      // Revertir
      setDraft(value ?? null);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDraft(value ?? null);
    setEditing(false);
  }

  if (editing) {
    if (type === "number") {
      return (
        <InputNumber
          autoFocus
          size="small"
          value={typeof draft === "number" ? draft : draft ? Number(draft) : null}
          disabled={saving}
          onChange={(v) => setDraft(v as number | null)}
          onPressEnter={commit}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Escape") cancel(); }}
          style={{ width: "100%" }}
        />
      );
    }
    return (
      <Input
        autoFocus
        size="small"
        value={(draft ?? "") as string}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onPressEnter={commit}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Escape") cancel(); }}
      />
    );
  }

  const isEmpty = value === null || value === undefined || value === "";
  const content = display ?? (isEmpty
    ? <Text type="secondary">{emptyPlaceholder}</Text>
    : <span>{value}{suffix ? ` ${suffix}` : ""}</span>);

  return (
    <Tooltip title={disabled ? undefined : "Click para editar"} mouseEnterDelay={0.5}>
      <div
        onClick={start}
        style={{
          cursor: disabled ? "default" : "pointer",
          padding: "2px 4px",
          borderRadius: 3,
          minHeight: 22,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          ...(disabled ? {} : { background: "transparent" }),
        }}
        onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = "#FAFAFA"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        {content}
        {!disabled && !saving && (
          <EditOutlined style={{ fontSize: 10, color: brand.textSecondary, opacity: 0.5 }} />
        )}
      </div>
    </Tooltip>
  );
}

// ── Variante con Select para campos de catálogo ──
interface SelectProps {
  value: string | null | undefined;
  options: { value: string; label: string }[];
  onSave: (newValue: string | null) => Promise<void>;
  disabled?: boolean;
  emptyPlaceholder?: string;
  allowClear?: boolean;
}

export function EditableSelectCell({
  value, options, onSave, disabled, emptyPlaceholder = "—", allowClear = true,
}: SelectProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string | null>(value ?? null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!editing) setDraft(value ?? null); }, [value, editing]);

  async function commit(next: string | null) {
    if (next === (value ?? null)) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
    } catch {
      setDraft(value ?? null);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <Select
        autoFocus open
        size="small"
        value={draft ?? undefined}
        onChange={(v) => { setDraft(v ?? null); commit(v ?? null); }}
        onBlur={() => setEditing(false)}
        showSearch optionFilterProp="label"
        allowClear={allowClear}
        disabled={saving}
        options={options}
        style={{ width: "100%", minWidth: 140 }}
      />
    );
  }

  const isEmpty = value === null || value === undefined || value === "";
  const label = isEmpty ? null : options.find((o) => o.value === value)?.label ?? value;

  return (
    <Tooltip title={disabled ? undefined : "Click para editar"} mouseEnterDelay={0.5}>
      <div
        onClick={() => !disabled && !saving && setEditing(true)}
        style={{
          cursor: disabled ? "default" : "pointer",
          padding: "2px 4px",
          borderRadius: 3,
          minHeight: 22,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
        onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = "#FAFAFA"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        {isEmpty ? <Text type="secondary">{emptyPlaceholder}</Text> : <span>{label}</span>}
        {!disabled && !saving && (
          <EditOutlined style={{ fontSize: 10, color: brand.textSecondary, opacity: 0.5 }} />
        )}
      </div>
    </Tooltip>
  );
}
