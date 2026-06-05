"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Typography, Table, Button, Input, Select, Space, Tag, Modal, App,
  Row, Col, Card, Upload, Tooltip,
} from "antd";
import {
  ToolOutlined, SearchOutlined, ReloadOutlined, UploadOutlined, InboxOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { UploadFile } from "antd/es/upload/interface";
import { useResponsive, modalWidth } from "@/lib/responsive";
import {
  numeracionColumn,
  paginacionEstandar,
  PAGINATION_PAGE_SIZE,
  useColumnasOcultas,
  ColumnasToggleButton,
  visibleColumns,
  useColumnasRedimensionables,
  filtroPorColumna,
  usePersistedState,
} from "@/lib/tables";

const { Title, Text } = Typography;
const { Dragger } = Upload;

interface TaskListItem {
  id: number;
  item: number;
  tipo: "MAC" | "CAD" | "SER";
  material_codigo: string | null;
  ref_descripcion: string | null;
  np: string | null;
  requerimiento: number | string | null;
  um: string | null;
  texto: string | null;
  precio: number | string | null;
  material?: { codigo: string; descripcion: string; np: string | null } | null;
}

interface TaskListRow {
  id: number;
  maquina_taller: string;
  actividad_codigo: string;
  descripcion: string;
  usuario_responsable: string | null;
  activo: boolean;
  items: TaskListItem[];
}

const TIPO_COLOR: Record<string, string> = {
  MAC: "blue",
  CAD: "geekblue",
  SER: "purple",
};

export default function TaskListsPage() {
  const { message, modal: antdModal } = App.useApp();
  const screens = useResponsive();

  const [rows, setRows] = useState<TaskListRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGINATION_PAGE_SIZE);

  // Filtros persistidos
  const [search, setSearch] = usePersistedState<string>("task-lists-search", "");
  const [maquinaFiltro, setMaquinaFiltro] = usePersistedState<string>("task-lists-maquina", "");
  const [actividadFiltro, setActividadFiltro] = usePersistedState<string>("task-lists-actividad", "");
  const [columnFilters, setColumnFilters] = usePersistedState<
    Record<string, (string | number | boolean | null)[] | null>
  >("task-lists-col-filters", {});

  // Catálogos para los selects de filtro
  const [maquinas, setMaquinas] = useState<string[]>([]);
  const [actividades, setActividades] = useState<string[]>([]);

  // Modal de importar
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<UploadFile | null>(null);
  const [importing, setImporting] = useState(false);

  // ── Fetchers ────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", "1000");
      if (search.trim()) qs.set("search", search.trim());
      if (maquinaFiltro) qs.set("maquina_taller", maquinaFiltro);
      if (actividadFiltro) qs.set("actividad_codigo", actividadFiltro);
      const res = await fetch(`/api/mantenimiento/task-lists?${qs}`);
      if (!res.ok) throw new Error("Error al cargar");
      const json = await res.json();
      setRows(json.data || []);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [search, maquinaFiltro, actividadFiltro, message]);

  const fetchCatalogos = useCallback(async () => {
    try {
      const res = await fetch(`/api/mantenimiento/task-lists/catalogos`);
      if (!res.ok) return;
      const json = await res.json();
      setMaquinas(json.maquinas || []);
      setActividades(json.actividades || []);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchCatalogos(); }, [fetchCatalogos]);

  async function handleImportar() {
    if (!importFile) {
      message.warning("Adjuntá un archivo .xlsx primero.");
      return;
    }
    antdModal.confirm({
      title: "Reemplazar todos los Task Lists",
      content: (
        <>
          Esta acción <strong>borra todos los Task Lists existentes</strong> y
          carga los datos del Excel. Es la operación correcta si el archivo es la
          fuente de verdad, pero perderás cualquier edición manual previa.
          <br /><br />
          ¿Continuar?
        </>
      ),
      okText: "Sí, reemplazar todo",
      okButtonProps: { danger: true },
      cancelText: "Cancelar",
      onOk: async () => {
        setImporting(true);
        try {
          const fd = new FormData();
          fd.append("file", importFile.originFileObj as Blob);
          const res = await fetch(`/api/mantenimiento/task-lists/importar-excel`, {
            method: "POST",
            body: fd,
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "Error");
          message.success(
            `Importación OK: ${json.task_lists_creados} task lists con ${json.items_totales} ítems.${
              json.saltadas ? ` (${json.saltadas} filas inválidas saltadas)` : ""
            }`,
          );
          setImportOpen(false);
          setImportFile(null);
          fetchData();
          fetchCatalogos();
        } catch (e) {
          message.error((e as Error).message);
        } finally {
          setImporting(false);
        }
      },
    });
  }

  // ── Columnas tabla principal ────────────────────────────
  const allColumns: ColumnsType<TaskListRow> = useMemo(
    () => [
      numeracionColumn<TaskListRow>(),
      {
        key: "maquina_taller",
        title: "Máquina del taller",
        dataIndex: "maquina_taller",
        width: 220,
        fixed: "left",
        ...filtroPorColumna<TaskListRow>(rows, "maquina_taller"),
      },
      {
        key: "actividad_codigo",
        title: "Actividad",
        dataIndex: "actividad_codigo",
        width: 100,
        ...filtroPorColumna<TaskListRow>(rows, "actividad_codigo"),
        render: (v: string) => <Tag color="cyan">{v}</Tag>,
      },
      {
        key: "descripcion",
        title: "Descripción de la tarea",
        dataIndex: "descripcion",
        width: 450,
      },
      {
        key: "usuario_responsable",
        title: "Responsable",
        dataIndex: "usuario_responsable",
        width: 140,
        ...filtroPorColumna<TaskListRow>(rows, "usuario_responsable"),
        render: (v: string | null) => v || <Text type="secondary">—</Text>,
      },
      {
        key: "items_count",
        title: "Ítems",
        width: 80,
        align: "center",
        render: (_: unknown, r) => <Tag>{r.items.length}</Tag>,
      },
    ],
    [rows],
  );

  const { ocultas, setOcultas } = useColumnasOcultas("task-lists-cols-ocultas", []);
  const { columnas, components, TableDragWrapper } = useColumnasRedimensionables(
    allColumns,
    "task-lists-tabla",
    { data: rows },
  );
  const visibles = visibleColumns(columnas, ocultas);

  // ── Render expandible ─────────────────────────────────
  const renderItemsExpanded = (row: TaskListRow) => {
    if (!row.items.length) {
      return <Text type="secondary">Sin ítems registrados.</Text>;
    }
    const cols: ColumnsType<TaskListItem> = [
      { key: "item", title: "#", dataIndex: "item", width: 50, align: "center" },
      {
        key: "tipo", title: "Tipo", dataIndex: "tipo", width: 70,
        render: (t: string) => <Tag color={TIPO_COLOR[t] ?? "default"}>{t}</Tag>,
      },
      {
        key: "material", title: "Material / Servicio", width: 260,
        render: (_: unknown, i: TaskListItem) => {
          if (i.material) {
            return (
              <span>
                <Text strong>{i.material.codigo}</Text> · {i.material.descripcion}
              </span>
            );
          }
          return i.ref_descripcion || <Text type="secondary">—</Text>;
        },
      },
      {
        key: "np", title: "N° Parte", dataIndex: "np", width: 130,
        render: (v: string | null) => v || <Text type="secondary">—</Text>,
      },
      {
        key: "requerimiento", title: "Cantidad", dataIndex: "requerimiento", width: 90, align: "right",
        render: (v: number | string | null) => v != null ? String(v) : <Text type="secondary">—</Text>,
      },
      {
        key: "um", title: "UM", dataIndex: "um", width: 60, align: "center",
        render: (v: string | null) => v || <Text type="secondary">—</Text>,
      },
      {
        key: "texto", title: "Notas", dataIndex: "texto",
        render: (v: string | null) => v || <Text type="secondary">—</Text>,
      },
      {
        key: "precio", title: "Precio ref.", dataIndex: "precio", width: 100, align: "right",
        render: (v: number | string | null) => v != null ? String(v) : <Text type="secondary">—</Text>,
      },
    ];
    return (
      <Table<TaskListItem>
        rowKey="id"
        size="small"
        columns={cols}
        dataSource={row.items}
        pagination={false}
        scroll={{ x: 900 }}
      />
    );
  };

  return (
    <div style={{ padding: 16 }}>
      <Title level={3} style={{ marginTop: 0 }}>
        <ToolOutlined /> Task Lists de Mantenimiento del Taller
      </Title>
      <Text type="secondary">
        Catálogo de tareas de mantenimiento por máquina y pauta (MP1, MP2, MP3, MP4),
        con la lista de materiales / cargos directos / servicios requeridos.
      </Text>

      <Card size="small" style={{ marginTop: 16, marginBottom: 8 }}>
        <Row gutter={[8, 8]} align="middle">
          <Col xs={24} md={7}>
            <Input
              allowClear
              placeholder="Buscar por descripción, máquina, responsable"
              prefix={<SearchOutlined />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Col>
          <Col xs={24} md={6}>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Máquina del taller"
              style={{ width: "100%" }}
              value={maquinaFiltro || undefined}
              onChange={(v) => setMaquinaFiltro(v || "")}
              options={maquinas.map((m) => ({ value: m, label: m }))}
            />
          </Col>
          <Col xs={24} md={4}>
            <Select
              allowClear
              placeholder="Actividad (MP1..)"
              style={{ width: "100%" }}
              value={actividadFiltro || undefined}
              onChange={(v) => setActividadFiltro(v || "")}
              options={actividades.map((a) => ({ value: a, label: a }))}
            />
          </Col>
          <Col xs={24} md={7}>
            <Space wrap>
              <Button
                type="primary"
                icon={<UploadOutlined />}
                onClick={() => setImportOpen(true)}
              >
                Importar Excel
              </Button>
              <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
                Refrescar
              </Button>
              <ColumnasToggleButton
                columns={allColumns}
                ocultas={ocultas}
                setOcultas={setOcultas}
              />
            </Space>
          </Col>
        </Row>
      </Card>

      <TableDragWrapper>
        <Table<TaskListRow>
          rowKey="id"
          size="small"
          loading={loading}
          columns={visibles}
          components={components}
          dataSource={rows}
          scroll={{ x: 1100 }}
          expandable={{
            expandedRowRender: renderItemsExpanded,
            rowExpandable: (r) => r.items.length > 0,
          }}
          pagination={paginacionEstandar({
            current: page,
            pageSize,
            total: rows.length,
            onChange: (p, s) => { setPage(p); setPageSize(s); },
            label: "task lists",
          })}
          onChange={(_p, filters) =>
            setColumnFilters(filters as Record<string, (string | number | boolean | null)[] | null>)
          }
        />
      </TableDragWrapper>

      {/* ── Modal Importar Excel ─────────────────────────── */}
      <Modal
        open={importOpen}
        title="Importar Task Lists desde Excel"
        onCancel={() => { setImportOpen(false); setImportFile(null); }}
        onOk={handleImportar}
        okText={importing ? "Importando..." : "Importar"}
        okButtonProps={{ loading: importing, disabled: !importFile }}
        width={modalWidth(screens.screens, 600)}
        destroyOnHidden
      >
        <Text type="secondary">
          Subí el archivo <code>tasklist_Mantenimiento.xlsx</code>. Se leerá la
          hoja <strong>&quot;Task List Materiales&quot;</strong> y se reemplazará todo el
          contenido actual.
        </Text>
        <div style={{ marginTop: 12 }}>
          <Dragger
            multiple={false}
            maxCount={1}
            beforeUpload={(file) => {
              setImportFile({
                uid: String(Date.now()),
                name: file.name,
                originFileObj: file as unknown as File,
                status: "done",
              } as UploadFile);
              return false; // no auto-upload
            }}
            onRemove={() => setImportFile(null)}
            fileList={importFile ? [importFile] : []}
            accept=".xlsx"
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">Arrastrá el .xlsx o hacé click para elegir</p>
            <p className="ant-upload-hint">Solo se acepta un archivo .xlsx</p>
          </Dragger>
        </div>
      </Modal>
    </div>
  );
}
