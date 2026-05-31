"use client";

import { useMemo, useState } from "react";
import {
  Modal, Tabs, Input, Upload, Table, Button, Alert, Space, Typography,
  Select, Tag, App, Divider,
} from "antd";
import { InboxOutlined, FileExcelOutlined, CopyOutlined, CheckCircleOutlined } from "@ant-design/icons";
import * as XLSX from "xlsx";
import type { ColumnsType } from "antd/es/table";
import { useColumnasRedimensionables } from "@/lib/tables";
import { useResponsive, modalWidth } from "@/lib/responsive";

const { Text, Paragraph } = Typography;
const { Dragger } = Upload;

export interface ImportFieldDef {
  /** Nombre del campo en el endpoint (ej. "codigo") */
  key: string;
  /** Label visible y usado para auto-mapeo desde headers de Excel */
  label: string;
  /** Aliases adicionales para auto-mapeo (case-insensitive) */
  aliases?: string[];
  required?: boolean;
  type?: "string" | "number" | "boolean";
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess?: (result: BulkResult) => void;
  title: string;
  endpoint: string;
  fields: ImportFieldDef[];
  /** Filas de ejemplo para mostrar en la pestaña de plantilla */
  templateRows?: (string | number)[][];
}

interface BulkResult {
  ok: number;
  errors: { row: number; error: string }[];
  updated: number;
  created: number;
}

// Convierte una matriz de celdas (con header en la primera fila) en
// objetos {fieldKey: value} aplicando el mapping.
function buildPayload(
  matrix: (string | number | null)[][],
  mapping: Record<string, string>, // columnIndex -> fieldKey
  fields: ImportFieldDef[],
): { rows: Record<string, unknown>[]; errors: { row: number; error: string }[] } {
  const rows: Record<string, unknown>[] = [];
  const errors: { row: number; error: string }[] = [];
  const dataRows = matrix.slice(1); // saltear header

  dataRows.forEach((row, idx) => {
    const obj: Record<string, unknown> = {};
    let isEmpty = true;
    Object.entries(mapping).forEach(([colIdx, fieldKey]) => {
      const raw = row[Number(colIdx)];
      if (raw === null || raw === undefined || raw === "") return;
      isEmpty = false;
      const fieldDef = fields.find((f) => f.key === fieldKey);
      if (!fieldDef) return;
      if (fieldDef.type === "number") {
        const n = Number(String(raw).replace(",", "."));
        if (Number.isFinite(n)) obj[fieldKey] = n;
        else errors.push({ row: idx + 2, error: `Columna "${fieldDef.label}": "${raw}" no es número` });
      } else if (fieldDef.type === "boolean") {
        const s = String(raw).toLowerCase().trim();
        obj[fieldKey] = s === "true" || s === "si" || s === "sí" || s === "1";
      } else {
        obj[fieldKey] = String(raw).trim();
      }
    });
    if (isEmpty) return; // ignorar filas vacías
    // Validar required
    for (const f of fields) {
      if (f.required && (obj[f.key] === undefined || obj[f.key] === "")) {
        errors.push({ row: idx + 2, error: `Falta campo obligatorio: ${f.label}` });
      }
    }
    rows.push(obj);
  });

  return { rows, errors };
}

// Auto-detecta mapping comparando header con label/aliases
function autoMap(headers: string[], fields: ImportFieldDef[]): Record<string, string> {
  const norm = (s: string) => s.toLowerCase().trim().replace(/[._-]/g, "");
  const result: Record<string, string> = {};
  headers.forEach((h, idx) => {
    const nh = norm(h);
    const match = fields.find((f) => {
      if (norm(f.label) === nh || norm(f.key) === nh) return true;
      return f.aliases?.some((a) => norm(a) === nh);
    });
    if (match) result[String(idx)] = match.key;
  });
  return result;
}

export function ImportarExcelModal({
  open, onClose, onSuccess, title, endpoint, fields, templateRows,
}: Props) {
  const { message } = App.useApp();
  const { screens } = useResponsive();
  const [pasteText, setPasteText] = useState("");
  const [matrix, setMatrix] = useState<(string | number | null)[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);

  const headers = matrix[0]?.map((c) => String(c ?? "")) ?? [];

  function loadFromPaste(text: string) {
    setPasteText(text);
    if (!text.trim()) { setMatrix([]); setMapping({}); return; }
    // TSV: una fila por línea, columnas separadas por tab
    const rows = text.split(/\r?\n/).map((line) => line.split("\t").map((c) => c.trim()));
    if (rows.length === 0) { setMatrix([]); return; }
    setMatrix(rows);
    setMapping(autoMap(rows[0].map(String), fields));
  }

  async function loadFromFile(file: File) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1, defval: null });
    if (!rows.length) { message.warning("Hoja vacía"); return; }
    setMatrix(rows);
    setMapping(autoMap((rows[0] ?? []).map((c) => String(c ?? "")), fields));
  }

  const { rows: payloadRows, errors: validationErrors } = useMemo(
    () => matrix.length > 1
      ? buildPayload(matrix, mapping, fields)
      : { rows: [], errors: [] },
    [matrix, mapping, fields],
  );

  const camposMapeados = new Set(Object.values(mapping));
  const requiredFaltantes = fields
    .filter((f) => f.required && !camposMapeados.has(f.key))
    .map((f) => f.label);

  const canSubmit = matrix.length > 1 && requiredFaltantes.length === 0 && payloadRows.length > 0;

  type MappingRow = { key: number; idx: number; header: string; mapping: string | undefined };
  const mappingColumns: ColumnsType<MappingRow> = [
    { key: "header", title: "Columna Excel", dataIndex: "header", render: (v: string, _r, i) => v || <Text type="secondary">(col {i + 1})</Text> },
    {
      key: "mapping", title: "Campo", dataIndex: "mapping", width: 280,
      render: (v: string | undefined, r: { idx: number }) => (
        <Select showSearch optionFilterProp="label"
          style={{ width: "100%" }}
          placeholder="(ignorar)"
          allowClear
          value={v ?? undefined}
          onChange={(val) => {
            const m = { ...mapping };
            if (val) m[String(r.idx)] = val;
            else delete m[String(r.idx)];
            // Asegurar unicidad: si el field ya estaba mapeado a otra col, quitarlo
            Object.entries(m).forEach(([k, vv]) => {
              if (k !== String(r.idx) && vv === val) delete m[k];
            });
            setMapping(m);
          }}
          options={fields.map((f) => ({
            value: f.key,
            label: <span>{f.label}{f.required && <Text type="danger"> *</Text>}{f.type === "number" && <Tag style={{ marginLeft: 6, fontSize: 10 }}>num</Tag>}</span>,
          }))}
        />
      ),
    },
  ];

  const { columnas: mappingColumnsResizable, components: mappingTableComponents } =
    useColumnasRedimensionables<MappingRow>(mappingColumns, "importar-excel-mapping-cols-widths-v1");

  type PreviewRow = Record<string, unknown> & { _key: number };
  const previewColumns: ColumnsType<PreviewRow> = fields
    .filter((f) => camposMapeados.has(f.key))
    .map((f) => ({ title: f.label, dataIndex: f.key, key: f.key, ellipsis: true }));

  const { columnas: previewColumnsResizable, components: previewTableComponents } =
    useColumnasRedimensionables<PreviewRow>(previewColumns, "importar-excel-preview-cols-widths-v1");

  async function submit() {
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payloadRows }),
      });
      const j = await res.json();
      if (!res.ok) {
        message.error(j.error ?? "Error al importar");
        return;
      }
      const r = j.data as BulkResult;
      setResult(r);
      if (r.errors.length === 0) {
        message.success(`Importados ${r.ok} registro(s)`);
        onSuccess?.(r);
      } else {
        message.warning(`${r.ok} ok, ${r.errors.length} con error`);
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Error de red");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setPasteText(""); setMatrix([]); setMapping({}); setResult(null);
  }

  function close() {
    reset(); onClose();
  }

  // Plantilla: TSV con header + filas ejemplo
  const templateTSV = useMemo(() => {
    const headerLine = fields.map((f) => f.label + (f.required ? " *" : "")).join("\t");
    const sampleLines = (templateRows ?? []).map((row) => row.join("\t")).join("\n");
    return sampleLines ? `${headerLine}\n${sampleLines}` : headerLine;
  }, [fields, templateRows]);

  return (
    <Modal
      open={open} onCancel={close} title={title} width={modalWidth(screens, 900)}
      footer={
        <Space>
          <Button onClick={close}>Cancelar</Button>
          <Button onClick={reset} disabled={!matrix.length && !result}>Limpiar</Button>
          <Button
            type="primary" loading={submitting}
            disabled={!canSubmit}
            onClick={submit}
          >
            Importar {payloadRows.length > 0 ? `(${payloadRows.length})` : ""}
          </Button>
        </Space>
      }
      destroyOnHidden
    >
      <Tabs
        items={[
          {
            key: "paste",
            label: <span><CopyOutlined /> Pegar desde Excel</span>,
            children: (
              <div>
                <Paragraph type="secondary" style={{ fontSize: 12 }}>
                  Copiá el rango con header desde Excel (incluyendo la fila de títulos)
                  y pegalo aquí abajo. Formato: una fila por línea, columnas separadas por tab.
                </Paragraph>
                <Input.TextArea
                  rows={8}
                  value={pasteText}
                  onChange={(e) => loadFromPaste(e.target.value)}
                  placeholder="Pegá tu tabla aquí…"
                  style={{ fontFamily: "monospace", fontSize: 12 }}
                />
              </div>
            ),
          },
          {
            key: "file",
            label: <span><FileExcelOutlined /> Subir .xlsx</span>,
            children: (
              <Dragger
                multiple={false}
                accept=".xlsx,.xls"
                beforeUpload={(file) => { loadFromFile(file); return false; }}
                showUploadList={false}
              >
                <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                <p className="ant-upload-text">Arrastrá un .xlsx o hacé click para seleccionar</p>
                <p className="ant-upload-hint" style={{ fontSize: 12 }}>
                  Se usa la primera hoja del libro. La primera fila debe ser el header.
                </p>
              </Dragger>
            ),
          },
          {
            key: "template",
            label: <span>📋 Plantilla</span>,
            children: (
              <div>
                <Paragraph type="secondary" style={{ fontSize: 12 }}>
                  Estructura esperada de columnas. Los campos con * son obligatorios.
                </Paragraph>
                <Input.TextArea
                  rows={6}
                  value={templateTSV}
                  readOnly
                  style={{ fontFamily: "monospace", fontSize: 12 }}
                />
                <Button
                  size="small" style={{ marginTop: 8 }}
                  onClick={() => {
                    navigator.clipboard.writeText(templateTSV);
                    message.success("Plantilla copiada");
                  }}
                >
                  Copiar plantilla
                </Button>
              </div>
            ),
          },
        ]}
      />

      {matrix.length > 0 && (
        <>
          <Divider style={{ margin: "16px 0" }}>Mapeo de columnas</Divider>
          {requiredFaltantes.length > 0 && (
            <Alert
              type="warning" showIcon style={{ marginBottom: 12 }}
              title={`Falta mapear: ${requiredFaltantes.join(", ")}`}
            />
          )}
          <Table
            size="small"
            pagination={false}
            dataSource={headers.map((h, idx) => ({ key: idx, idx, header: h, mapping: mapping[String(idx)] }))}
            columns={mappingColumnsResizable}
            components={mappingTableComponents}
          />

          <Divider style={{ margin: "16px 0" }}>
            Preview ({payloadRows.length} fila(s) válida(s)
            {validationErrors.length > 0 && `, ${validationErrors.length} con error`})
          </Divider>

          {validationErrors.length > 0 && (
            <Alert
              type="error" showIcon style={{ marginBottom: 12 }}
              title={`${validationErrors.length} fila(s) con error`}
              description={
                <div style={{ maxHeight: 120, overflowY: "auto", fontSize: 12 }}>
                  {validationErrors.slice(0, 10).map((e, i) => (
                    <div key={i}>Fila {e.row}: {e.error}</div>
                  ))}
                  {validationErrors.length > 10 && <Text type="secondary">…y {validationErrors.length - 10} más</Text>}
                </div>
              }
            />
          )}

          <Table
            size="small"
            pagination={{ pageSize: 5, showSizeChanger: false, placement: ["topEnd", "bottomEnd"] }}
            dataSource={payloadRows.slice(0, 50).map((r, i) => ({ ...r, _key: i }))}
            rowKey="_key"
            columns={previewColumnsResizable}
            components={previewTableComponents}
            scroll={{ x: 600 }}
          />
        </>
      )}

      {result && (
        <Alert
          style={{ marginTop: 16 }}
          type={result.errors.length === 0 ? "success" : "warning"}
          showIcon icon={<CheckCircleOutlined />}
          title={`Importación: ${result.created} creados, ${result.updated} actualizados${result.errors.length > 0 ? `, ${result.errors.length} con error` : ""}`}
          description={result.errors.length > 0 && (
            <div style={{ maxHeight: 120, overflowY: "auto", fontSize: 12 }}>
              {result.errors.slice(0, 10).map((e, i) => <div key={i}>Fila {e.row}: {e.error}</div>)}
              {result.errors.length > 10 && <Text type="secondary">…y {result.errors.length - 10} más</Text>}
            </div>
          )}
        />
      )}
    </Modal>
  );
}
