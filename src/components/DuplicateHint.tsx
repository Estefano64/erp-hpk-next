"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, List, Space, Spin, Typography } from "antd";
import { WarningOutlined } from "@ant-design/icons";

const { Text } = Typography;

interface Match {
  id: number | string;
  primary: string;     // Texto principal a mostrar
  secondary?: string;  // Texto secundario (ej. código, RUC)
}

interface Props<T> {
  /** Valor actual del input que dispara la búsqueda */
  value: string;
  /** Endpoint que devuelve { data: T[] } al hacer GET con ?search=value */
  endpoint: string;
  /** Mapper de cada record T a {id, primary, secondary} para mostrar */
  mapMatch: (record: T) => Match;
  /** Mínimo de caracteres para empezar a buscar (default 3) */
  minChars?: number;
  /** Cuántos resultados mostrar (default 3) */
  topN?: number;
  /** Si está editando un registro existente, su id, para excluirlo de los resultados */
  excludeId?: number | string;
  /** Callback cuando el usuario clickea "Usar este" en un duplicado */
  onPick?: (record: T) => void;
}

// Detecta posibles duplicados consultando un endpoint de búsqueda.
// Muestra los top N como Alert tipo warning bajo el campo.
export function DuplicateHint<T>({
  value, endpoint, mapMatch, minChars = 3, topN = 3, excludeId, onPick,
}: Props<T>) {
  const [matches, setMatches] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed.length < minChars) {
      setMatches([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const id = ++reqIdRef.current;
      setLoading(true);
      try {
        const url = endpoint + (endpoint.includes("?") ? "&" : "?") + `search=${encodeURIComponent(trimmed)}&limit=${topN + (excludeId ? 1 : 0)}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const j = await res.json();
        if (id !== reqIdRef.current) return; // resultado de petición vieja, descartar
        const data = (j.data ?? []) as T[];
        const filtered = excludeId
          ? data.filter((r) => mapMatch(r).id !== excludeId)
          : data;
        setMatches(filtered.slice(0, topN));
      } finally {
        if (id === reqIdRef.current) setLoading(false);
      }
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [value, endpoint, minChars, topN, excludeId, mapMatch]);

  if (value.trim().length < minChars) return null;
  if (loading && matches.length === 0) {
    return (
      <div style={{ marginTop: 4, fontSize: 11, color: "#888" }}>
        <Spin size="small" /> Buscando coincidencias…
      </div>
    );
  }
  if (matches.length === 0) return null;

  return (
    <Alert
      type="warning"
      icon={<WarningOutlined />}
      style={{ marginTop: 6 }}
      message={
        <Text strong style={{ fontSize: 12 }}>
          Ya existe(n) {matches.length} registro(s) similar(es)
        </Text>
      }
      description={
        <List
          size="small"
          split={false}
          dataSource={matches.map(mapMatch)}
          renderItem={(m, idx) => (
            <List.Item style={{ padding: "4px 0" }}>
              <Space style={{ width: "100%", justifyContent: "space-between" }}>
                <div>
                  <Text style={{ fontSize: 12 }}>{m.primary}</Text>
                  {m.secondary && (
                    <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>
                      ({m.secondary})
                    </Text>
                  )}
                </div>
                {onPick && (
                  <Button
                    size="small" type="link"
                    onClick={() => onPick(matches[idx])}
                  >
                    Usar este
                  </Button>
                )}
              </Space>
            </List.Item>
          )}
        />
      }
    />
  );
}
