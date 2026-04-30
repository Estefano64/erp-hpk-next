"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Typography,
  Table,
  Button,
  Input,
  Select,
  Tag,
  Row,
  Col,
  Card,
  Space,
  App,
  Statistic,
  Tooltip,
  Modal,
  Form,
} from "antd";
import {
  SearchOutlined,
  ReloadOutlined,
  EyeOutlined,
  ExperimentOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  FileDoneOutlined,
  SendOutlined,
  EditOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { brand } from "@/lib/theme";
import dayjs from "dayjs";

const { Title, Text } = Typography;
const { TextArea } = Input;

interface Evaluacion {
  id: number;
  ot_id: number;
  modelo_evaluacion: string;
  sistema_medicion: string;
  fecha_evaluacion: string | null;
  evaluado_por: string | null;
  resultado_general: string | null;
  informe_archivo: string | null;
  informe_nombre: string | null;
  estado: string;
  revisado_por: string | null;
  fecha_revision: string | null;
  comentarios_revision: string | null;
  solicitado_revision_por: string | null;
  fecha_solicitud_revision: string | null;
  createdAt: string;
  updatedAt: string;
  orden_trabajo: {
    id: number;
    ot: string | null;
    descripcion: string | null;
    tipo: string | null;
    estrategia: boolean | null;
  };
}

const estadoColor: Record<string, string> = {
  BORRADOR: "default",
  COMPLETADA: "blue",
  PENDIENTE_APROBACION: "gold",
  APROBADA: "green",
  RECHAZADA: "red",
};

const estadoLabel: Record<string, string> = {
  BORRADOR: "Borrador",
  COMPLETADA: "Completada",
  PENDIENTE_APROBACION: "Pendiente Aprobación",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
};

const estadoIcon: Record<string, React.ReactNode> = {
  BORRADOR: <EditOutlined />,
  COMPLETADA: <FileDoneOutlined />,
  PENDIENTE_APROBACION: <ClockCircleOutlined />,
  APROBADA: <CheckCircleOutlined />,
  RECHAZADA: <CloseCircleOutlined />,
};

export default function EvaluacionesPage() {
  const router = useRouter();
  const { message } = App.useApp();

  const [data, setData] = useState<Evaluacion[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<string | undefined>();

  // Modal aprobar/rechazar
  const [modalAccion, setModalAccion] = useState<{ evalItem: Evaluacion; accion: "aprobar" | "rechazar" | "solicitar" } | null>(null);
  const [accionForm] = Form.useForm();
  const [procesando, setProcesando] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/evaluaciones");
      const json = await res.json();
      setData(json.data ?? []);
    } catch {
      message.error("Error al cargar evaluaciones");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filtrar datos
  const filtered = data.filter((ev) => {
    if (filtroEstado && ev.estado !== filtroEstado) return false;
    if (!search) return true;
    const lc = search.toLowerCase();
    return (
      (ev.orden_trabajo?.ot || "").toLowerCase().includes(lc) ||
      (ev.orden_trabajo?.descripcion || "").toLowerCase().includes(lc) ||
      (ev.evaluado_por || "").toLowerCase().includes(lc) ||
      (ev.modelo_evaluacion || "").toLowerCase().includes(lc)
    );
  });

  // KPIs
  const kpis = {
    total: data.length,
    borrador: data.filter((e) => e.estado === "BORRADOR").length,
    pendientes: data.filter((e) => e.estado === "PENDIENTE_APROBACION").length,
    aprobadas: data.filter((e) => e.estado === "APROBADA").length,
    rechazadas: data.filter((e) => e.estado === "RECHAZADA").length,
  };

  const ejecutarAccion = async () => {
    if (!modalAccion) return;
    try {
      const values = accionForm.getFieldsValue();
      setProcesando(true);
      const res = await fetch(`/api/evaluaciones/${modalAccion.evalItem.id}/revision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: modalAccion.accion,
          usuario: values.usuario || "Usuario",
          comentarios: values.comentarios || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");

      const textos: Record<string, string> = {
        solicitar: "Evaluación enviada a revisión",
        aprobar: "Evaluación aprobada",
        rechazar: "Evaluación rechazada",
      };
      message.success(textos[modalAccion.accion]);
      setModalAccion(null);
      accionForm.resetFields();
      await fetchData();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Error");
    } finally {
      setProcesando(false);
    }
  };

  const valoresUnicos = (campo: keyof Evaluacion): Array<{ text: string; value: string }> => {
    const set = new Set<string>();
    data.forEach((e) => {
      const v = e[campo];
      if (v !== null && v !== undefined && v !== "") set.add(String(v));
    });
    return [...set].sort().map((v) => ({ text: v, value: v }));
  };

  const columns: ColumnsType<Evaluacion> = [
    {
      title: "OT",
      width: 130,
      fixed: "left",
      render: (_, r) => (r.orden_trabajo?.ot ? <Tag color={brand.navy}>{r.orden_trabajo.ot}</Tag> : "-"),
    },
    {
      title: "Estado",
      dataIndex: "estado",
      width: 180,
      filters: [
        { text: "Borrador", value: "BORRADOR" },
        { text: "Completada", value: "COMPLETADA" },
        { text: "Pendiente Aprobación", value: "PENDIENTE_APROBACION" },
        { text: "Aprobada", value: "APROBADA" },
        { text: "Rechazada", value: "RECHAZADA" },
      ],
      onFilter: (value, r) => r.estado === value,
      render: (v: string) => (
        <Tag color={estadoColor[v] || "default"} icon={estadoIcon[v]}>
          {estadoLabel[v] || v}
        </Tag>
      ),
    },
    {
      title: "Tipo Cilindro",
      dataIndex: "modelo_evaluacion",
      width: 220,
      filters: valoresUnicos("modelo_evaluacion"),
      filterSearch: true,
      onFilter: (value, r) => r.modelo_evaluacion === value,
      ellipsis: true,
    },
    {
      title: "Evaluado por",
      dataIndex: "evaluado_por",
      width: 140,
      filters: valoresUnicos("evaluado_por"),
      filterSearch: true,
      onFilter: (value, r) => r.evaluado_por === value,
      render: (v: string | null) => v || "-",
    },
    {
      title: "F. Evaluación",
      dataIndex: "fecha_evaluacion",
      width: 120,
      sorter: (a, b) => (a.fecha_evaluacion || "").localeCompare(b.fecha_evaluacion || ""),
      render: (v: string | null) => (v ? dayjs(v).format("DD/MM/YYYY") : "-"),
    },
    {
      title: "Solicitada por",
      dataIndex: "solicitado_revision_por",
      width: 130,
      render: (v: string | null) => v || "-",
    },
    {
      title: "Revisada por",
      dataIndex: "revisado_por",
      width: 130,
      filters: valoresUnicos("revisado_por"),
      filterSearch: true,
      onFilter: (value, r) => r.revisado_por === value,
      render: (v: string | null) => v || "-",
    },
    {
      title: "F. Revisión",
      dataIndex: "fecha_revision",
      width: 120,
      sorter: (a, b) => (a.fecha_revision || "").localeCompare(b.fecha_revision || ""),
      render: (v: string | null) => (v ? dayjs(v).format("DD/MM/YYYY") : "-"),
    },
    {
      title: "Informe",
      dataIndex: "informe_nombre",
      width: 100,
      align: "center",
      render: (v: string | null) => (v ? <Tag color="green">Sí</Tag> : <Tag>No</Tag>),
    },
    {
      title: "Acciones",
      width: 200,
      align: "center",
      fixed: "right",
      render: (_, r) => (
        <Space size={2}>
          <Tooltip title="Ver / Editar">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => router.push(`/ordenes-trabajo/${r.ot_id}/evaluacion`)}
            />
          </Tooltip>
          {(r.estado === "BORRADOR" || r.estado === "COMPLETADA" || r.estado === "RECHAZADA") && (
            <Tooltip title="Enviar a revisión">
              <Button
                type="text"
                icon={<SendOutlined style={{ color: brand.cyan }} />}
                onClick={() => setModalAccion({ evalItem: r, accion: "solicitar" })}
              />
            </Tooltip>
          )}
          {r.estado === "PENDIENTE_APROBACION" && (
            <>
              <Tooltip title="Aprobar">
                <Button
                  type="text"
                  icon={<CheckCircleOutlined style={{ color: "#52c41a" }} />}
                  onClick={() => setModalAccion({ evalItem: r, accion: "aprobar" })}
                />
              </Tooltip>
              <Tooltip title="Rechazar">
                <Button
                  type="text"
                  icon={<CloseCircleOutlined style={{ color: "#ff4d4f" }} />}
                  onClick={() => setModalAccion({ evalItem: r, accion: "rechazar" })}
                />
              </Tooltip>
            </>
          )}
        </Space>
      ),
    },
  ];

  const tituloModal: Record<string, string> = {
    solicitar: "Solicitar Revisión",
    aprobar: "Aprobar Evaluación",
    rechazar: "Rechazar Evaluación",
  };
  const colorModal: Record<string, string> = {
    solicitar: brand.cyan,
    aprobar: "#52c41a",
    rechazar: "#ff4d4f",
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          <ExperimentOutlined style={{ color: brand.cyan, marginRight: 8 }} />
          Hojas de Evaluación
        </Title>
      </div>

      {/* KPIs */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={4}>
          <Card styles={{ body: { padding: 16 } }}>
            <Statistic
              title="Total"
              value={kpis.total}
              prefix={<ExperimentOutlined style={{ color: brand.navy }} />}
              styles={{ content: { color: brand.navy } }}
            />
          </Card>
        </Col>
        <Col xs={12} md={5}>
          <Card
            hoverable
            styles={{ body: { padding: 16 } }}
            onClick={() => setFiltroEstado("BORRADOR")}
            style={{ borderColor: filtroEstado === "BORRADOR" ? brand.cyan : undefined }}
          >
            <Statistic title="Borrador" value={kpis.borrador} prefix={<EditOutlined />} />
          </Card>
        </Col>
        <Col xs={12} md={5}>
          <Card
            hoverable
            styles={{ body: { padding: 16 } }}
            onClick={() => setFiltroEstado("PENDIENTE_APROBACION")}
            style={{ borderColor: filtroEstado === "PENDIENTE_APROBACION" ? "#faad14" : undefined, background: filtroEstado === "PENDIENTE_APROBACION" ? "#fffbe6" : undefined }}
          >
            <Statistic
              title="Pendiente Aprobación"
              value={kpis.pendientes}
              prefix={<ClockCircleOutlined style={{ color: "#faad14" }} />}
              styles={{ content: { color: "#faad14" } }}
            />
          </Card>
        </Col>
        <Col xs={12} md={5}>
          <Card
            hoverable
            styles={{ body: { padding: 16 } }}
            onClick={() => setFiltroEstado("APROBADA")}
            style={{ borderColor: filtroEstado === "APROBADA" ? "#52c41a" : undefined }}
          >
            <Statistic
              title="Aprobadas"
              value={kpis.aprobadas}
              prefix={<CheckCircleOutlined style={{ color: "#52c41a" }} />}
              styles={{ content: { color: "#52c41a" } }}
            />
          </Card>
        </Col>
        <Col xs={12} md={5}>
          <Card
            hoverable
            styles={{ body: { padding: 16 } }}
            onClick={() => setFiltroEstado("RECHAZADA")}
            style={{ borderColor: filtroEstado === "RECHAZADA" ? "#ff4d4f" : undefined }}
          >
            <Statistic
              title="Rechazadas"
              value={kpis.rechazadas}
              prefix={<CloseCircleOutlined style={{ color: "#ff4d4f" }} />}
              styles={{ content: { color: "#ff4d4f" } }}
            />
          </Card>
        </Col>
      </Row>

      {/* Filtros */}
      <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 12 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={10} md={8}>
            <Input
              placeholder="Buscar OT, evaluador, tipo..."
              prefix={<SearchOutlined />}
              allowClear
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Col>
          <Col xs={12} sm={8} md={5}>
            <Select
              placeholder="Filtrar por estado"
              allowClear
              style={{ width: "100%" }}
              value={filtroEstado}
              onChange={setFiltroEstado}
              options={[
                { value: "BORRADOR", label: "Borrador" },
                { value: "COMPLETADA", label: "Completada" },
                { value: "PENDIENTE_APROBACION", label: "Pendiente Aprobación" },
                { value: "APROBADA", label: "Aprobada" },
                { value: "RECHAZADA", label: "Rechazada" },
              ]}
            />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Button icon={<ReloadOutlined />} onClick={fetchData} block>
              Actualizar
            </Button>
          </Col>
        </Row>
      </Card>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={filtered}
        loading={loading}
        pagination={{ pageSize: 20, showTotal: (t) => `${t} evaluaciones` }}
        scroll={{ x: 1700 }}
        size="small"
      />

      {/* Modal Accion */}
      <Modal
        title={
          modalAccion ? (
            <Space>
              <span style={{ color: colorModal[modalAccion.accion] }}>
                {modalAccion.accion === "aprobar" ? <CheckCircleOutlined /> : modalAccion.accion === "rechazar" ? <CloseCircleOutlined /> : <SendOutlined />}
              </span>
              {tituloModal[modalAccion.accion]}
            </Space>
          ) : ""
        }
        open={!!modalAccion}
        onCancel={() => setModalAccion(null)}
        onOk={ejecutarAccion}
        confirmLoading={procesando}
        okText={modalAccion?.accion === "aprobar" ? "Aprobar" : modalAccion?.accion === "rechazar" ? "Rechazar" : "Enviar"}
        okButtonProps={{
          danger: modalAccion?.accion === "rechazar",
          type: "primary",
        }}
      >
        {modalAccion && (
          <>
            <Card size="small" style={{ background: brand.bgPage, marginBottom: 12 }}>
              <Row gutter={16}>
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 12 }}>OT:</Text>{" "}
                  <Tag color={brand.navy}>{modalAccion.evalItem.orden_trabajo?.ot}</Tag>
                </Col>
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Evaluador:</Text>{" "}
                  <b>{modalAccion.evalItem.evaluado_por || "-"}</b>
                </Col>
                <Col span={24} style={{ marginTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Tipo:</Text>{" "}
                  <b>{modalAccion.evalItem.modelo_evaluacion}</b>
                </Col>
              </Row>
            </Card>

            <Form form={accionForm} layout="vertical">
              <Form.Item
                label={modalAccion.accion === "solicitar" ? "Tu nombre" : "Nombre del revisor"}
                name="usuario"
                rules={[{ required: true, message: "Ingresa tu nombre" }]}
              >
                <Input placeholder="Ej. Juan Pérez" />
              </Form.Item>
              <Form.Item
                label={
                  modalAccion.accion === "solicitar"
                    ? "Comentarios para el revisor (opcional)"
                    : modalAccion.accion === "rechazar"
                    ? "Motivo del rechazo"
                    : "Comentarios (opcional)"
                }
                name="comentarios"
                rules={
                  modalAccion.accion === "rechazar"
                    ? [{ required: true, message: "Indica el motivo del rechazo" }]
                    : []
                }
              >
                <TextArea rows={3} placeholder="Observaciones..." />
              </Form.Item>
            </Form>

            {modalAccion.accion === "rechazar" && (
              <Text type="warning" style={{ fontSize: 12 }}>
                ⚠ Al rechazar, el evaluador podrá reabrir la evaluación y volver a enviarla.
              </Text>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
