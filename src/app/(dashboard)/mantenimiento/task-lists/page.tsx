"use client";

// Task Lists de Mantenimiento — vista principal por GRUPO (Máquina + Pauta).
//
// Cada fila del listado principal representa un GRUPO virtual (máquina del
// taller + actividad PM1..PM4). El grupo agrega N tareas (TaskList) y M
// ítems (TaskListItem). Al abrir un grupo, el usuario navega a:
//   - Tareas         → /mantenimiento/task-lists/grupo/{máquina}/{PM}/tareas
//   - Requerimientos → /mantenimiento/task-lists/grupo/{máquina}/{PM}/requerimientos
//
// Espejo directo del patrón de Códigos Estratégicos → Operaciones / Template
// requerimientos: mismo look, mismas acciones por fila, edición inline en las
// sub-páginas. La importación por Excel se conserva como vía alterna de carga
// masiva (reemplaza todo el catálogo).
//
// La agregación por grupo se hace client-side sobre los TaskList devueltos
// por /api/mantenimiento/task-lists (paginación grande, limit=1000). Si el
// volumen crece, mover al endpoint /grupos server-side.

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Typography, Table, Button, Input, Select, Space, Tag, Modal, App,
  Row, Col, Card, Upload,
} from "antd";
import {
  SearchOutlined, ReloadOutlined, UploadOutlined, InboxOutlined, EyeOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { UploadFile } from "antd/es/upload/interface";
import { brand } from "@/lib/theme";
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
  useTablaFiltrada,
  useAbortableFetch,
} from "@/lib/tables";
import { ExportarExcelButton } from "@/components/ExportarExcelButton";

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

// Grupo virtual (Máquina + Pauta) — agrega N tareas + M ítems.
interface Grupo {
  key: string;                    // "máquina|actividad" — identidad estable
  maquina_taller: string;
  actividad_codigo: string;
  tareas_count: number;
  items_count: number;
  responsables: string[];         // únicos, ordenados
}

export default function TaskListsPage() {
  const router = useRouter();
  const { message, modal: antdModal } = App.useApp();
  const { screens } = useResponsive();

  const [rows, setRows] = useState<TaskListRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGINATION_PAGE_SIZE);

  // Filtros persistidos.
  const [search, setSearch] = usePersistedState<string>("task-lists-search-v2", "");
  const [maquinaFiltro, setMaquinaFiltro] = usePersistedState<string>("task-lists-maquina-v2", "");
  const [actividadFiltro, setActividadFiltro] = usePersistedState<string>("task-lists-actividad-v2", "");

  // Catálogos para los selects de filtro.
  const [maquinas, setMaquinas] = useState<string[]>([]);
  const [actividades, setActividades] = useState<string[]>([]);

  // Modal de importar Excel.
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<UploadFile | null>(null);
  const [importing, setImporting] = useState(false);

  // ── Fetchers ────────────────────────────────────────────
  const abortable = useAbortableFetch();
  const fetchData = useCallback(async () => {
    const controller = abortable.start();
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", "10000");
      if (search.trim()) qs.set("search", search.trim());
      if (maquinaFiltro) qs.set("maquina_taller", maquinaFiltro);
      if (actividadFiltro) qs.set("actividad_codigo", actividadFiltro);
      const res = await fetch(`/api/mantenimiento/task-lists?${qs}`, { signal: controller.signal });
      if (!res.ok) throw new Error("Error al cargar");
      const json = await res.json();
      if (controller.signal.aborted) return;
      setRows(json.data || []);
    } catch (e) {
      if (abortable.isAbort(e)) return;
      message.error((e as Error).message);
    } finally {
      if (abortable.isCurrent(controller)) setLoading(false);
    }
  }, [search, maquinaFiltro, actividadFiltro, message, abortable]);

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

  // ── Agregación por grupo (máquina + actividad) ──────────
  // Recorre las filas devueltas por el API y las agrupa por par
  // (máquina, actividad). Suma tareas + ítems, junta responsables únicos.
  const grupos: Grupo[] = useMemo(() => {
    const map = new Map<string, Grupo>();
    for (const r of rows) {
      const key = `${r.maquina_taller}|${r.actividad_codigo}`;
      const existing = map.get(key);
      if (existing) {
        existing.tareas_count += 1;
        existing.items_count += r.items.length;
        if (r.usuario_responsable && !existing.responsables.includes(r.usuario_responsable)) {
          existing.responsables.push(r.usuario_responsable);
        }
      } else {
        map.set(key, {
          key,
          maquina_taller: r.maquina_taller,
          actividad_codigo: r.actividad_codigo,
          tareas_count: 1,
          items_count: r.items.length,
          responsables: r.usuario_responsable ? [r.usuario_responsable] : [],
        });
      }
    }
    const arr = [...map.values()];
    arr.sort((a, b) => {
      const m = a.maquina_taller.localeCompare(b.maquina_taller);
      return m !== 0 ? m : a.actividad_codigo.localeCompare(b.actividad_codigo);
    });
    for (const g of arr) g.responsables.sort();
    return arr;
  }, [rows]);

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

  function urlGrupo(g: Grupo, kind: "tareas" | "requerimientos") {
    return `/mantenimiento/task-lists/grupo/${encodeURIComponent(g.maquina_taller)}/${encodeURIComponent(g.actividad_codigo)}/${kind}`;
  }

  // ── Columnas tabla principal (grupos) ───────────────────
  const columns: ColumnsType<Grupo> = useMemo(
    () => [
      numeracionColumn<Grupo>({ current: page, pageSize }),
      {
        key: "maquina_taller",
        title: "Máquina del taller",
        dataIndex: "maquina_taller",
        width: 240,
        sorter: (a, b) => a.maquina_taller.localeCompare(b.maquina_taller),
        ...filtroPorColumna<Grupo>(grupos, "maquina_taller"),
        render: (v: string) => <Tag color={brand.navy}>{v}</Tag>,
      },
      {
        key: "actividad_codigo",
        title: "Pauta (PM)",
        dataIndex: "actividad_codigo",
        width: 120,
        sorter: (a, b) => a.actividad_codigo.localeCompare(b.actividad_codigo),
        ...filtroPorColumna<Grupo>(grupos, "actividad_codigo"),
        render: (v: string) => <Tag color="cyan">{v}</Tag>,
      },
      {
        key: "responsables",
        title: "Responsable(s)",
        width: 180,
        render: (_: unknown, g: Grupo) =>
          g.responsables.length > 0
            ? g.responsables.join(", ")
            : <Text type="secondary">—</Text>,
      },
      {
        key: "tareas_count",
        title: "Tareas",
        width: 90,
        align: "center",
        sorter: (a, b) => a.tareas_count - b.tareas_count,
        render: (_: unknown, g) => <Tag color="blue">{g.tareas_count}</Tag>,
      },
      {
        key: "items_count",
        title: "Requerimientos",
        width: 130,
        align: "center",
        sorter: (a, b) => a.items_count - b.items_count,
        render: (_: unknown, g) => <Tag color="purple">{g.items_count}</Tag>,
      },
      {
        key: "acciones",
        title: "Acciones",
        width: 130,
        align: "center",
        render: (_: unknown, g: Grupo) => (
          <Space size="small">
            <Button
              type="text"
              icon={<ToolOutlined />}
              title="Ver / editar tareas"
              onClick={() => router.push(urlGrupo(g, "tareas"))}
            />
            <Button
              type="text"
              icon={<InboxOutlined />}
              title="Ver / editar template de requerimientos"
              onClick={() => router.push(urlGrupo(g, "requerimientos"))}
            />
            <Button
              type="text"
              icon={<EyeOutlined />}
              title="Ver detalle (tareas)"
              onClick={() => router.push(urlGrupo(g, "tareas"))}
            />
          </Space>
        ),
      },
    ],
    [grupos, page, pageSize, router],
  );

  const { filtradas, captureFilteredRows } = useTablaFiltrada(grupos);
  const { ocultas, setOcultas } = useColumnasOcultas("task-lists-cols-ocultas-v3", []);
  const { columnas: columnsResizable, components: tableComponents, resetAnchos, TableDragWrapper } =
    useColumnasRedimensionables<Grupo>(columns, "task-lists-cols-widths-v3", { data: grupos });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <Title level={3} style={{ margin: 0 }}>
          Task Lists de Mantenimiento
        </Title>
        <Space wrap>
          <ColumnasToggleButton<Grupo>
            columns={columns}
            ocultas={ocultas}
            setOcultas={setOcultas}
            obligatorias={["__num", "maquina_taller", "acciones"]}
          />
          <Button onClick={resetAnchos}>Restablecer anchos</Button>
          <ExportarExcelButton<Grupo>
            endpoint="/api/mantenimiento/task-lists"
            filename="TaskLists-Grupos"
            currentRows={filtradas}
            tablaLayout={{ ocultas }}
            columns={[
              { key: "maquina_taller", label: "Máquina del taller", value: (r) => r.maquina_taller },
              { key: "actividad_codigo", label: "Pauta", value: (r) => r.actividad_codigo },
              { key: "responsables", label: "Responsables", value: (r) => r.responsables.join(", ") },
              { key: "tareas_count", label: "Tareas", value: (r) => r.tareas_count },
              { key: "items_count", label: "Requerimientos", value: (r) => r.items_count },
            ]}
          >
            Descargar Grupos
          </ExportarExcelButton>
          <Button
            type="primary"
            icon={<UploadOutlined />}
            onClick={() => setImportOpen(true)}
          >
            Importar Excel
          </Button>
        </Space>
      </div>

      <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} md={8}>
            <Input
              placeholder="Buscar por descripción, máquina o responsable..."
              prefix={<SearchOutlined />}
              allowClear
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </Col>
          <Col xs={12} sm={6} md={5}>
            <Select
              placeholder="Máquina del taller"
              allowClear showSearch optionFilterProp="label"
              style={{ width: "100%" }}
              value={maquinaFiltro || undefined}
              onChange={(v) => { setMaquinaFiltro(v ?? ""); setPage(1); }}
              options={maquinas.map((m) => ({ value: m, label: m }))}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              placeholder="Pauta (PM1..)"
              allowClear showSearch optionFilterProp="label"
              style={{ width: "100%" }}
              value={actividadFiltro || undefined}
              onChange={(v) => { setActividadFiltro(v ?? ""); setPage(1); }}
              options={actividades.map((a) => ({ value: a, label: a }))}
            />
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Space wrap>
              <Button icon={<ReloadOutlined />} onClick={() => { setSearch(""); setMaquinaFiltro(""); setActividadFiltro(""); setPage(1); }}>
                Limpiar
              </Button>
              <Button onClick={fetchData} loading={loading}>
                Refrescar
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <TableDragWrapper>
        <Table<Grupo>
          rowKey="key"
          size="small"
          loading={loading}
          columns={visibleColumns(columnsResizable, ocultas)}
          components={tableComponents}
          dataSource={grupos}
          scroll={{ x: 1100 }}
          sticky={{ offsetHeader: 56, offsetScroll: 0 }}
          pagination={paginacionEstandar({
            current: page,
            pageSize,
            total: grupos.length,
            onChange: (p, s) => { setPage(p); setPageSize(s); },
            label: "grupos",
          })}
          onChange={(_p, _f, _s, extra) => {
            captureFilteredRows(extra);
          }}
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
        width={modalWidth(screens, 600)}
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
              return false;
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
