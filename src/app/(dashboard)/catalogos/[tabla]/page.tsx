"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Typography, Card, Table, Button, Input, Space, Tag, Modal, Form,
  Switch, InputNumber, Select, Popconfirm, message, Alert, Tooltip,
} from "antd";
import {
  PlusOutlined, ArrowLeftOutlined, EditOutlined, DeleteOutlined,
  EyeInvisibleOutlined, SearchOutlined, ReloadOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import {
  numeracionColumn,
  useColumnasOcultas,
  ColumnasToggleButton,
  visibleColumns,
  filtroPorColumna,
  useColumnasRedimensionables,
} from "@/lib/tables";
import { brand } from "@/lib/theme";
import { catalogosById, type FieldDef } from "@/lib/catalogos-config";
import { ExportarExcelButton } from "@/components/ExportarExcelButton";

const { Title, Text } = Typography;

interface CatalogRow extends Record<string, unknown> {
  activo: boolean;
}

export default function CatalogoCrudPage() {
  const params = useParams<{ tabla: string }>();
  const router = useRouter();
  const tabla = params?.tabla ?? "";
  const cfg = catalogosById[tabla];

  const [data, setData] = useState<CatalogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [showInactivos, setShowInactivos] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null); // null = creando
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fkOptions, setFkOptions] = useState<Record<string, { value: string; label: string }[]>>({});
  const [form] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();
  const { ocultas, setOcultas } = useColumnasOcultas(`catalogo-${tabla}-cols-v1`);

  const fetchData = useCallback(async () => {
    if (!cfg) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/catalogos?tabla=${cfg.id}&incluirInactivos=1`);
      if (res.ok) {
        const j = await res.json();
        setData(j.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [cfg]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Cargar opciones de FKs (solo activos)
  useEffect(() => {
    if (!cfg) return;
    const fkFields = cfg.fields.filter((f) => f.type === "select-fk");
    if (fkFields.length === 0) return;
    let alive = true;
    (async () => {
      const entries = await Promise.all(
        fkFields.map(async (f) => {
          const res = await fetch(`/api/catalogos?tabla=${f.fkTabla}`);
          if (!res.ok) return [f.key, []] as const;
          const j = await res.json();
          const opts = (j.data ?? []).map((r: Record<string, unknown>) => ({
            value: String(r[f.fkValueField ?? "codigo"] ?? ""),
            label: String(r[f.fkLabelField ?? "nombre"] ?? r[f.fkValueField ?? "codigo"] ?? ""),
          }));
          return [f.key, opts] as const;
        }),
      );
      if (alive) setFkOptions(Object.fromEntries(entries));
    })();
    return () => { alive = false; };
  }, [cfg]);

  // Filtrado búsqueda + activos
  const filtered = useMemo(() => {
    if (!cfg) return [];
    const q = search.trim().toLowerCase();
    return data.filter((r) => {
      if (!showInactivos && r.activo === false) return false;
      if (!q) return true;
      return cfg.fields.some((f) => {
        const v = r[f.key];
        return v != null && String(v).toLowerCase().includes(q);
      });
    });
  }, [data, search, showInactivos, cfg]);

  function openCreate() {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ activo: true });
    setModalOpen(true);
  }

  function openEdit(record: CatalogRow) {
    if (!cfg) return;
    setEditingId(record[cfg.pkField] as number);
    const initial: Record<string, unknown> = {};
    for (const f of cfg.fields) {
      initial[f.key] = record[f.key];
    }
    form.setFieldsValue(initial);
    setModalOpen(true);
  }

  async function handleSave(values: Record<string, unknown>) {
    if (!cfg) return;
    setSaving(true);
    try {
      const url = editingId == null
        ? `/api/catalogos/${cfg.id}`
        : `/api/catalogos/${cfg.id}?id=${editingId}`;
      const method = editingId == null ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (res.status === 403) {
        messageApi.error("Solo los administradores pueden modificar catálogos.");
        return;
      }
      if (res.status === 409) {
        const err = await res.json().catch(() => null);
        messageApi.error(err?.error ?? "Conflicto de datos.");
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        messageApi.error(err?.error ?? "Error al guardar.");
        return;
      }
      messageApi.success(editingId == null ? "Registro creado." : "Registro actualizado.");
      setModalOpen(false);
      fetchData();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number, soft: boolean) {
    if (!cfg) return;
    const url = `/api/catalogos/${cfg.id}?id=${id}${soft ? "&soft=1" : ""}`;
    const res = await fetch(url, { method: "DELETE" });
    if (res.status === 403) {
      messageApi.error("Solo los administradores pueden eliminar.");
      return;
    }
    if (res.status === 409) {
      const err = await res.json().catch(() => null);
      messageApi.warning(err?.error ?? "No se puede eliminar (FK).");
      return;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      messageApi.error(err?.error ?? "Error al eliminar.");
      return;
    }
    messageApi.success(soft ? "Registro desactivado." : "Registro eliminado.");
    fetchData();
  }

  if (!cfg) {
    return (
      <Card>
        <Alert type="error" showIcon title={`Catálogo "${tabla}" no existe.`} />
        <Button style={{ marginTop: 12 }} icon={<ArrowLeftOutlined />} onClick={() => router.push("/catalogos")}>
          Volver al índice
        </Button>
      </Card>
    );
  }

  // Columnas dinámicas — todas con filtro tipo Excel basado en los datos cargados
  const columns: ColumnsType<CatalogRow> = cfg.fields.map<ColumnsType<CatalogRow>[number]>((f) => {
    const base = {
      title: f.label,
      key: f.key,
      dataIndex: f.key,
    };
    if (f.type === "boolean") {
      return {
        ...base,
        width: 90,
        align: "center",
        filters: [
          { text: "Activo", value: "true" },
          { text: "Inactivo", value: "false" },
        ],
        onFilter: (value, r) => String(r[f.key] === true) === value,
        render: (v: boolean) => v ? <Tag color="success">Activo</Tag> : <Tag>Inactivo</Tag>,
      };
    }
    if (f.type === "color") {
      return {
        ...base,
        width: 110,
        ...filtroPorColumna(data, f.key as keyof CatalogRow),
        render: (v: string | null) => v ? (
          <Tag color={v} style={{ fontSize: 11 }}>{v}</Tag>
        ) : <Text type="secondary">—</Text>,
      };
    }
    if (f.type === "select-fk") {
      const fkOpts = fkOptions[f.key] ?? [];
      return {
        ...base,
        filters: fkOpts.map((o) => ({ text: o.label, value: o.value })),
        filterSearch: true,
        onFilter: (value, r) => String(r[f.key] ?? "") === value,
        render: (v: string | null) => {
          if (!v) return <Text type="secondary">—</Text>;
          const opt = fkOptions[f.key]?.find((o) => o.value === v);
          return <span>{opt?.label ?? v}</span>;
        },
      };
    }
    if (f.type === "select") {
      return {
        ...base,
        filters: (f.options ?? []).map((o) => ({ text: o.label, value: String(o.value) })),
        onFilter: (value, r) => String(r[f.key] ?? "") === value,
        render: (v: string | null) => {
          const opt = f.options?.find((o) => String(o.value) === String(v));
          return opt ? <Tag>{opt.label}</Tag> : v ?? "—";
        },
      };
    }
    if (f.type === "number") {
      return {
        ...base, width: 90, align: "right",
        sorter: (a, b) => Number(a[f.key] ?? 0) - Number(b[f.key] ?? 0),
      };
    }
    return {
      ...base,
      ...filtroPorColumna(data, f.key as keyof CatalogRow),
    };
  });

  // Columna de acciones
  columns.push({
    title: "",
    key: "actions",
    width: 120,
    fixed: "right",
    render: (_, r) => {
      const id = r[cfg.pkField] as number;
      return (
        <Space size={0}>
          <Tooltip title="Editar">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          </Tooltip>
          {r.activo !== false && (
            <Popconfirm
              title="Desactivar este registro"
              description="Marca como inactivo. Mantiene la FK intacta."
              onConfirm={() => handleDelete(id, true)}
              okText="Desactivar"
              cancelText="Cancelar"
            >
              <Tooltip title="Desactivar (soft)">
                <Button type="text" size="small" icon={<EyeInvisibleOutlined />} />
              </Tooltip>
            </Popconfirm>
          )}
          <Popconfirm
            title="Eliminar permanentemente"
            description="Borra el registro de la base de datos. Falla si hay relaciones."
            onConfirm={() => handleDelete(id, false)}
            okText="Eliminar"
            okButtonProps={{ danger: true }}
            cancelText="Cancelar"
          >
            <Tooltip title="Eliminar (hard)">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      );
    },
  });

  const allColumns = [numeracionColumn<CatalogRow>(), ...columns];
  const { columnas: columnsResizable, components: tableComponents, resetAnchos, TableDragWrapper } =
    useColumnasRedimensionables<CatalogRow>(allColumns, `catalogos-${cfg.id}-cols-widths-v1`);

  return (
    <div>
      {contextHolder}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
        <div>
          <Button
            type="link"
            icon={<ArrowLeftOutlined />}
            onClick={() => router.push("/catalogos")}
            style={{ padding: 0, marginBottom: 4 }}
          >
            Catálogos
          </Button>
          <Title level={3} style={{ margin: 0 }}>{cfg.label}</Title>
          {cfg.description && (
            <Text type="secondary" style={{ fontSize: 12 }}>{cfg.description}</Text>
          )}
        </div>
        <Space>
          <ColumnasToggleButton<CatalogRow>
            columns={allColumns}
            ocultas={ocultas}
            setOcultas={setOcultas}
            obligatorias={["__num"]}
          />
          <Button onClick={resetAnchos}>Restablecer anchos</Button>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>Refrescar</Button>
          <ExportarExcelButton<CatalogRow>
            endpoint={`/api/catalogos?tabla=${cfg.id}&incluirInactivos=1`}
            filename={cfg.label}
            columns={cfg.fields.map((f) => ({
              label: f.label,
              value: (r) => {
                const v = r[f.key];
                if (v === null || v === undefined) return "";
                if (f.type === "boolean") return v ? "Sí" : "No";
                if (typeof v === "object") return JSON.stringify(v);
                return v as string | number;
              },
            }))}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nuevo</Button>
        </Space>
      </div>

      <Card styles={{ body: { padding: 12 } }} style={{ marginBottom: 12 }}>
        <Space wrap>
          <Input
            placeholder="Buscar…"
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ width: 240 }}
          />
          <Space size={4}>
            <Switch checked={showInactivos} onChange={setShowInactivos} size="small" />
            <Text style={{ fontSize: 12 }}>Mostrar inactivos</Text>
          </Space>
          <Tag>Total: {filtered.length} / {data.length}</Tag>
        </Space>
      </Card>

      <TableDragWrapper>
              <Table
          rowKey={cfg.pkField}
          columns={visibleColumns(columnsResizable, ocultas)}
          components={tableComponents}
          dataSource={filtered}
          loading={loading}
          size="small"
          pagination={{ pageSize: 50, showTotal: (t) => `${t} registros`, placement: ["topEnd", "bottomEnd"] }}
          scroll={{ x: 800 }}
          sticky={{ offsetHeader: 56, offsetScroll: 0 }}
          rowClassName={(r) => r.activo === false ? "cat-row-inactive" : ""}
        />
      </TableDragWrapper>

      <Modal
        title={editingId == null ? `Nuevo ${cfg.label}` : `Editar ${cfg.label}`}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saving}
        okText="Guardar"
        cancelText="Cancelar"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          {cfg.fields.map((f) => renderField(f, fkOptions[f.key] ?? []))}
        </Form>
      </Modal>

      <style jsx global>{`
        .cat-row-inactive > td { background: #FAFAFA !important; color: #999 !important; }
      `}</style>
    </div>
  );
}

function renderField(f: FieldDef, fkOpts: { value: string; label: string }[]) {
  const rules: { required?: boolean; message?: string; max?: number }[] = [];
  if (f.required) rules.push({ required: true, message: `${f.label} es requerido` });
  if (f.maxLength) rules.push({ max: f.maxLength, message: `Máx ${f.maxLength} caracteres` });

  let input: React.ReactNode;
  switch (f.type) {
    case "text":
      input = <Input.TextArea rows={3} maxLength={f.maxLength} />;
      break;
    case "number":
      input = <InputNumber style={{ width: "100%" }} />;
      break;
    case "boolean":
      return (
        <Form.Item key={f.key} name={f.key} label={f.label} valuePropName="checked" extra={f.hint}>
          <Switch />
        </Form.Item>
      );
    case "color":
      input = <Input type="color" style={{ width: 80 }} />;
      break;
    case "select":
      input = <Select options={f.options ?? []} allowClear />;
      break;
    case "select-fk":
      input = <Select showSearch optionFilterProp="label" options={fkOpts} allowClear />;
      break;
    default:
      input = <Input maxLength={f.maxLength} />;
  }

  return (
    <Form.Item key={f.key} name={f.key} label={f.label} rules={rules} extra={f.hint}>
      {input}
    </Form.Item>
  );
}
