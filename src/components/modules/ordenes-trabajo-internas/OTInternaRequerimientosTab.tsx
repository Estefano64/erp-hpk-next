"use client";

// Tab "Requerimientos" del detalle de OT Interna.
//
// Features (paridad parcial con OTRequerimientosTab de OT externas):
//   - Multi-item: crear varios items en un solo modal (tabla editable)
//   - Edición inline de campos clave (cantidad, descripción, precio)
//   - Anular / eliminar items
//   - Enviar a aprobación por requerimiento (todos los items de un nro_req)
//
// Comparte la mayoría de los endpoints con OT externa porque OTRepuesto es
// polimórfico (ot_id o orden_trabajo_interna_id).

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Table, Button, Tag, Space, Modal, Form, Input, InputNumber, Select,
  Typography, Empty, App, AutoComplete, Popconfirm, Tooltip, Card, DatePicker,
} from "antd";
import dayjs from "dayjs";
import {
  PlusOutlined, ReloadOutlined, SendOutlined, DeleteOutlined,
  CloseCircleOutlined, EditOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { brand } from "@/lib/theme";
import { useResponsive, modalWidth } from "@/lib/responsive";

const { Text } = Typography;

interface RequerimientoRow {
  id: number;
  nro_req: string | null;
  item_req: number | null;
  tipo_codigo: string | null;
  material_codigo: string | null;
  descripcion: string | null;
  texto: string | null;
  cantidad: string | number;
  unidad_medida: string | null;
  precio_unitario: string | number | null;
  moneda: string | null;
  observaciones: string | null;
  material: { codigo: string; descripcion: string } | null;
  status_requerimiento: { codigo: string; nombre: string } | null;
}

interface MaterialOpt {
  material_id: number;
  codigo: string;
  descripcion: string;
  fabricante_codigo: string | null;
  unidad_medida_codigo: string | null;
}

// Item del modal "Nuevo requerimiento" — antes de mandar al backend.
interface DraftItem {
  key: string; // local key React
  tipo_codigo: "MAC" | "CAD" | "SER";
  material_codigo?: string;
  descripcion: string;
  cantidad: number;
  unidad_medida: string;
  fabricante_codigo?: string;
  observaciones?: string;
  // precio_unitario y moneda: opcionales, solo se usan para items tipo SER y CAD
  // (para MAC el precio viene del catálogo de materiales). Trabajo del otro dev
  // mergeado: hace que cada draft item lleve su precio referencial.
  precio_unitario?: number;
  moneda?: string;
  // Obligatoria para poder enviar a aprobación (mismo flujo que OT externa).
  fecha_requerida?: dayjs.Dayjs | null;
}

const REQ_COLOR: Record<string, string> = {
  BORRADOR: "default",
  SIN_APROBACION: "orange",
  APROBADO: "green",
  DESAPROBADO: "red",
  ANULADO: "red",
};

const TIPO_COLOR: Record<string, string> = { MAC: "blue", CAD: "orange", SER: "purple" };

interface Props {
  otInternaId: number;
}

function randomKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function OTInternaRequerimientosTab({ otInternaId }: Props) {
  const { message, modal } = App.useApp();
  const { screens } = useResponsive();

  const [rows, setRows] = useState<RequerimientoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [materiales, setMateriales] = useState<MaterialOpt[]>([]);

  // ── Modal "Nuevo requerimiento" (multi-item) ──────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [draftNroReq, setDraftNroReq] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // ── Edición inline ──────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Partial<RequerimientoRow>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ordenes-trabajo-internas/${otInternaId}/requerimientos`);
      if (res.ok) {
        const j = await res.json();
        setRows(j.data ?? []);
      }
    } catch {
      message.error("Error al cargar requerimientos.");
    } finally {
      setLoading(false);
    }
  }, [otInternaId, message]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Cargar materiales lazy al abrir modal por primera vez
  useEffect(() => {
    if (modalOpen && materiales.length === 0) {
      fetch("/api/materiales?limit=2000")
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .then((j) => setMateriales(j.data ?? []))
        .catch(() => { /* noop */ });
    }
  }, [modalOpen, materiales.length]);

  // ── Modal multi-item ────────────────────────────────────────────────

  function openNuevo() {
    setDraftNroReq("");
    setDraftItems([{
      key: randomKey(),
      tipo_codigo: "MAC",
      descripcion: "",
      cantidad: 1,
      unidad_medida: "UNIDAD",
    }]);
    setModalOpen(true);
  }

  function addDraftRow() {
    setDraftItems((prev) => [...prev, {
      key: randomKey(),
      tipo_codigo: "MAC",
      descripcion: "",
      cantidad: 1,
      unidad_medida: "UNIDAD",
    }]);
  }

  function removeDraftRow(key: string) {
    setDraftItems((prev) => prev.filter((d) => d.key !== key));
  }

  function updateDraft(key: string, patch: Partial<DraftItem>) {
    setDraftItems((prev) => prev.map((d) => {
      if (d.key !== key) return d;
      const next = { ...d, ...patch };
      // Auto-completar descripción / unidad / fabricante desde el material si MAC.
      if (patch.material_codigo && next.tipo_codigo === "MAC") {
        const mat = materiales.find((m) => m.codigo === patch.material_codigo);
        if (mat) {
          if (!next.descripcion) next.descripcion = mat.descripcion;
          if (!next.unidad_medida || next.unidad_medida === "UNIDAD") {
            next.unidad_medida = mat.unidad_medida_codigo ?? "UNIDAD";
          }
          if (!next.fabricante_codigo && mat.fabricante_codigo) {
            next.fabricante_codigo = mat.fabricante_codigo;
          }
        }
      }
      return next;
    }));
  }

  async function handleCrear() {
    // Validar
    if (draftItems.length === 0) {
      message.error("Agregá al menos un item.");
      return;
    }
    for (let i = 0; i < draftItems.length; i++) {
      const it = draftItems[i];
      if (!it.descripcion?.trim()) {
        message.error(`Item ${i + 1}: descripción requerida.`);
        return;
      }
      if (!it.cantidad || it.cantidad <= 0) {
        message.error(`Item ${i + 1}: cantidad debe ser mayor a 0.`);
        return;
      }
      if (it.tipo_codigo === "MAC" && !it.material_codigo) {
        message.error(`Item ${i + 1}: tipo MAC requiere seleccionar material.`);
        return;
      }
      if (!it.fecha_requerida) {
        message.error(`Item ${i + 1}: fecha requerida es obligatoria (para poder enviar a aprobación).`);
        return;
      }
    }

    try {
      setSaving(true);
      const res = await fetch(`/api/ordenes-trabajo-internas/${otInternaId}/requerimientos/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: draftItems.map(({ key: _key, fecha_requerida, ...rest }) => ({
            ...rest,
            fecha_requerida: fecha_requerida ? fecha_requerida.format("YYYY-MM-DD") : null,
          })),
          nro_req: draftNroReq.trim() || undefined,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Error al crear requerimiento");
      message.success(`Requerimiento ${j.nro_req} creado con ${j.creados} item(s).`);
      setModalOpen(false);
      fetchData();
    } catch (e) {
      if (e instanceof Error) message.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Edición inline ──────────────────────────────────────────────────

  function startEdit(r: RequerimientoRow) {
    setEditingId(r.id);
    setEditValues({
      cantidad: r.cantidad,
      descripcion: r.descripcion,
      precio_unitario: r.precio_unitario,
      observaciones: r.observaciones,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValues({});
  }

  async function saveEdit(id: number) {
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/requerimientos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cantidad: editValues.cantidad,
          descripcion: editValues.descripcion,
          precio_unitario: editValues.precio_unitario ?? null,
          observaciones: editValues.observaciones ?? null,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Error al guardar");
      message.success("Item actualizado.");
      cancelEdit();
      fetchData();
    } catch (e) {
      if (e instanceof Error) message.error(e.message);
    } finally {
      setSavingEdit(false);
    }
  }

  // ── Acciones por item ───────────────────────────────────────────────

  async function eliminarItem(id: number) {
    try {
      const res = await fetch(`/api/requerimientos/${id}`, { method: "DELETE" });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Error al eliminar");
      message.success("Item eliminado.");
      fetchData();
    } catch (e) {
      if (e instanceof Error) message.error(e.message);
    }
  }

  function anularItem(r: RequerimientoRow) {
    let motivo = "";
    modal.confirm({
      title: `Anular item ${r.nro_req}/${r.item_req}`,
      content: <Input.TextArea rows={3} placeholder="Motivo (opcional)" onChange={(e) => { motivo = e.target.value; }} />,
      okText: "Anular",
      okButtonProps: { danger: true },
      onOk: async () => {
        const res = await fetch(`/api/requerimientos/${r.id}/anular`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ motivo: motivo || null }),
        });
        const j = await res.json().catch(() => null);
        if (!res.ok) {
          message.error(j?.error ?? "Error al anular.");
          return;
        }
        message.success("Item anulado.");
        fetchData();
      },
    });
  }

  // ── Acciones por requerimiento (grupo de items con mismo nro_req) ──

  async function enviarAprobacion(nroReq: string) {
    const itemsDelReq = rows.filter((r) => r.nro_req === nroReq);
    const enBorrador = itemsDelReq.filter((r) => r.status_requerimiento?.codigo === "BORRADOR");
    if (enBorrador.length === 0) {
      message.warning(`No hay items en BORRADOR en ${nroReq}.`);
      return;
    }
    let ok = 0, errs = 0;
    for (const r of enBorrador) {
      const res = await fetch(`/api/requerimientos/${r.id}/enviar-a-aprobacion`, { method: "POST" });
      if (res.ok) ok++; else errs++;
    }
    if (ok > 0) message.success(`${ok} item(s) enviado(s) a aprobación.`);
    if (errs > 0) message.warning(`${errs} con error.`);
    fetchData();
  }

  // ── Agrupación por nro_req (para mostrar acciones a nivel grupo) ────
  const gruposPorReq = useMemo(() => {
    const groups = new Map<string, RequerimientoRow[]>();
    for (const r of rows) {
      const k = r.nro_req ?? `__SIN_REQ_${r.id}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }
    return groups;
  }, [rows]);

  // ── Columnas ────────────────────────────────────────────────────────

  const columns: ColumnsType<RequerimientoRow> = [
    {
      key: "nro_req", title: "Nro Req / Item", width: 140,
      render: (_, r) => (
        <Text strong style={{ fontSize: 12 }}>
          {r.nro_req ?? "—"} / {r.item_req ?? "—"}
        </Text>
      ),
    },
    {
      key: "tipo", title: "Tipo", width: 70, align: "center",
      render: (_, r) => (
        <Tag color={TIPO_COLOR[r.tipo_codigo ?? ""] ?? "default"} style={{ margin: 0 }}>
          {r.tipo_codigo ?? "—"}
        </Tag>
      ),
    },
    {
      key: "descripcion", title: "Descripción", ellipsis: true,
      render: (_, r) => {
        if (editingId === r.id) {
          return (
            <Input.TextArea
              value={String(editValues.descripcion ?? "")}
              onChange={(e) => setEditValues((v) => ({ ...v, descripcion: e.target.value }))}
              rows={1}
              autoSize={{ minRows: 1, maxRows: 3 }}
            />
          );
        }
        return (
          <div style={{ lineHeight: 1.2 }}>
            {r.material?.codigo && <Tag style={{ fontSize: 10, marginRight: 4 }}>{r.material.codigo}</Tag>}
            {r.material?.descripcion ?? r.descripcion ?? "—"}
            {r.observaciones && (
              <div style={{ fontSize: 11, color: "#888", fontStyle: "italic", marginTop: 2 }}>
                {r.observaciones}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "cantidad", title: "Cant.", width: 110, align: "right",
      render: (_, r) => {
        if (editingId === r.id) {
          return (
            <InputNumber
              value={Number(editValues.cantidad ?? 0)}
              onChange={(v) => setEditValues((vs) => ({ ...vs, cantidad: v ?? 0 }))}
              min={0.01}
              style={{ width: 80 }}
            />
          );
        }
        return `${Number(r.cantidad).toLocaleString()} ${r.unidad_medida ?? ""}`;
      },
    },
    {
      key: "precio", title: "P. unitario", width: 120, align: "right",
      render: (_, r) => {
        if (editingId === r.id) {
          return (
            <InputNumber
              value={editValues.precio_unitario != null ? Number(editValues.precio_unitario) : null}
              onChange={(v) => setEditValues((vs) => ({ ...vs, precio_unitario: v }))}
              min={0}
              placeholder="—"
              style={{ width: 100 }}
            />
          );
        }
        if (r.precio_unitario == null) return <Text type="secondary">—</Text>;
        return <span>{r.moneda ?? "USD"} {Number(r.precio_unitario).toFixed(2)}</span>;
      },
    },
    {
      key: "status", title: "Estado", width: 130,
      render: (_, r) => r.status_requerimiento
        ? <Tag color={REQ_COLOR[r.status_requerimiento.codigo] ?? "default"}>{r.status_requerimiento.nombre}</Tag>
        : <Text type="secondary">—</Text>,
    },
    {
      key: "acciones", title: "", width: 130, fixed: "right", align: "center",
      render: (_, r) => {
        const editable = r.status_requerimiento?.codigo === "BORRADOR";
        if (editingId === r.id) {
          return (
            <Space size={2}>
              <Button size="small" type="primary" loading={savingEdit} onClick={() => saveEdit(r.id)}>
                Guardar
              </Button>
              <Button size="small" onClick={cancelEdit}>Cancelar</Button>
            </Space>
          );
        }
        return (
          <Space size={2}>
            {editable && (
              <Tooltip title="Editar">
                <Button size="small" type="text" icon={<EditOutlined />} onClick={() => startEdit(r)} />
              </Tooltip>
            )}
            <Tooltip title="Anular">
              <Button
                size="small" type="text"
                icon={<CloseCircleOutlined />}
                style={{ color: "#fa8c16" }}
                onClick={() => anularItem(r)}
              />
            </Tooltip>
            {editable && (
              <Popconfirm
                title="¿Eliminar este item?"
                description="Solo se puede eliminar en estado BORRADOR."
                onConfirm={() => eliminarItem(r.id)}
                okText="Eliminar" okButtonProps={{ danger: true }} cancelText="Cancelar"
              >
                <Tooltip title="Eliminar">
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                </Tooltip>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 12 }} wrap>
        <Button type="primary" icon={<PlusOutlined />} onClick={openNuevo}>
          Nuevo requerimiento
        </Button>
        <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
          Refrescar
        </Button>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {rows.length} item{rows.length === 1 ? "" : "s"} · {gruposPorReq.size} requerimiento{gruposPorReq.size === 1 ? "" : "s"}
        </Text>
      </Space>

      {/* Acciones a nivel grupo (un botón "Enviar a aprobación" por nro_req con items en BORRADOR) */}
      {gruposPorReq.size > 0 && (
        <Card size="small" style={{ marginBottom: 12, background: brand.bgPage }}>
          <Space wrap>
            <Text type="secondary" style={{ fontSize: 11 }}>Acciones por requerimiento:</Text>
            {[...gruposPorReq.entries()]
              .filter(([_, items]) => items.some((i) => i.status_requerimiento?.codigo === "BORRADOR"))
              .map(([nroReq, items]) => {
                const enBorrador = items.filter((i) => i.status_requerimiento?.codigo === "BORRADOR").length;
                return (
                  <Popconfirm
                    key={nroReq}
                    title={`Enviar ${nroReq} a aprobación`}
                    description={`${enBorrador} item(s) en BORRADOR pasarán a SIN_APROBACION.`}
                    onConfirm={() => enviarAprobacion(nroReq)}
                    okText="Enviar" cancelText="Cancelar"
                  >
                    <Button size="small" icon={<SendOutlined />} type="dashed">
                      {nroReq} ({enBorrador})
                    </Button>
                  </Popconfirm>
                );
              })}
          </Space>
        </Card>
      )}

      {rows.length === 0 && !loading ? (
        <Empty description="Sin requerimientos. Crea el primero con el botón de arriba." />
      ) : (
        <Table
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={loading}
          size="small"
          scroll={{ x: 1000 }}
          pagination={false}
        />
      )}

      {/* ── Modal multi-item ── */}
      <Modal
        title="Nuevo requerimiento"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleCrear}
        confirmLoading={saving}
        okText={`Crear (${draftItems.length} item${draftItems.length === 1 ? "" : "s"})`}
        cancelText="Cancelar"
        width={modalWidth(screens, 1100)}
        destroyOnHidden
      >
        <Space orientation="vertical" style={{ width: "100%" }} size="small">
          <Form layout="inline">
            <Form.Item label="Agregar a req existente (opcional)">
              <Input
                placeholder="Código existente (ej. 390626-1)"
                value={draftNroReq}
                onChange={(e) => setDraftNroReq(e.target.value)}
                style={{ width: 240 }}
              />
            </Form.Item>
          </Form>

          <Table
            size="small"
            rowKey="key"
            dataSource={draftItems}
            pagination={false}
            scroll={{ x: 1200 }}
            columns={[
              {
                title: "Tipo", dataIndex: "tipo_codigo", width: 100,
                render: (v: string, row) => (
                  <Select
                    size="small"
                    value={v}
                    style={{ width: 90 }}
                    onChange={(nv) => updateDraft(row.key, { tipo_codigo: nv as DraftItem["tipo_codigo"] })}
                    options={[
                      { value: "MAC", label: "MAC" },
                      { value: "CAD", label: "CAD" },
                      { value: "SER", label: "SER" },
                    ]}
                  />
                ),
              },
              {
                title: "Material", dataIndex: "material_codigo", width: 240,
                render: (v: string | undefined, row) =>
                  row.tipo_codigo === "MAC" ? (
                    <AutoComplete
                      size="small"
                      value={v ?? ""}
                      placeholder="Código o descripción"
                      style={{ width: "100%" }}
                      onChange={(nv) => updateDraft(row.key, { material_codigo: nv })}
                      options={materiales.map((m) => ({
                        value: m.codigo,
                        label: `${m.codigo} — ${m.descripcion}`,
                      }))}
                      filterOption={(input, option) =>
                        String(option?.label ?? "").toLowerCase().includes(input.toLowerCase())
                      }
                    />
                  ) : (
                    <Text type="secondary" style={{ fontSize: 11 }}>—</Text>
                  ),
              },
              {
                title: "Descripción", dataIndex: "descripcion",
                render: (v: string, row) => (
                  <Input
                    size="small"
                    value={v}
                    placeholder={row.tipo_codigo === "MAC" ? "(se autocompleta del material)" : "Detalle"}
                    onChange={(e) => updateDraft(row.key, { descripcion: e.target.value })}
                  />
                ),
              },
              {
                title: "Cant.", dataIndex: "cantidad", width: 90,
                render: (v: number, row) => (
                  <InputNumber
                    size="small"
                    value={v}
                    min={0.01}
                    style={{ width: 70 }}
                    onChange={(nv) => updateDraft(row.key, { cantidad: nv ?? 1 })}
                  />
                ),
              },
              {
                title: "Unidad", dataIndex: "unidad_medida", width: 100,
                render: (v: string, row) => (
                  <Input
                    size="small"
                    value={v}
                    onChange={(e) => updateDraft(row.key, { unidad_medida: e.target.value })}
                  />
                ),
              },
              {
                // Precio referencial — solo aplica a SER y CAD (MAC usa el catálogo).
                title: "Precio ref.", dataIndex: "precio_unitario", width: 180,
                render: (v: number | undefined, row) => {
                  if (row.tipo_codigo !== "SER" && row.tipo_codigo !== "CAD") {
                    return <Text type="secondary" style={{ fontSize: 11 }}>—</Text>;
                  }
                  return (
                    <Space size={2}>
                      <InputNumber
                        size="small"
                        value={v}
                        min={0}
                        step={0.01}
                        placeholder="0.00"
                        style={{ width: 90 }}
                        onChange={(nv) => updateDraft(row.key, { precio_unitario: nv ?? undefined })}
                      />
                      <Select
                        size="small"
                        value={row.moneda ?? "USD"}
                        style={{ width: 70 }}
                        onChange={(nv) => updateDraft(row.key, { moneda: nv })}
                        options={[
                          { value: "USD", label: "USD" },
                          { value: "SOL", label: "SOL" },
                        ]}
                      />
                    </Space>
                  );
                },
              },
              {
                // Fecha requerida — obligatoria para poder enviar a aprobación.
                title: "F. requerida", dataIndex: "fecha_requerida", width: 140,
                render: (_: unknown, row) => (
                  <DatePicker
                    size="small"
                    value={row.fecha_requerida ?? null}
                    format="DD/MM/YYYY"
                    style={{ width: "100%" }}
                    onChange={(d) => updateDraft(row.key, { fecha_requerida: d })}
                  />
                ),
              },
              {
                title: "", key: "del", width: 50, align: "center", fixed: "right",
                render: (_, row) => (
                  <Tooltip title="Quitar fila">
                    <Button
                      size="small" type="text" danger icon={<DeleteOutlined />}
                      onClick={() => removeDraftRow(row.key)}
                      disabled={draftItems.length === 1}
                    />
                  </Tooltip>
                ),
              },
            ]}
          />
          <Button type="dashed" icon={<PlusOutlined />} onClick={addDraftRow} block>
            Agregar otro item
          </Button>
        </Space>
      </Modal>

      <style jsx>{`
        :global(.ant-table-thead > tr > th) {
          background: ${brand.bgPage} !important;
        }
      `}</style>
    </div>
  );
}
