"use client";

import { Card, Row, Col, Input, Checkbox, Radio, InputNumber, Space, Typography, Divider, Image, Upload, Button, App } from "antd";
import { CameraOutlined, UploadOutlined, DeleteOutlined } from "@ant-design/icons";
import { brand } from "@/lib/theme";

const { Text } = Typography;
const { TextArea } = Input;

// ── Modelos disponibles ─────────────────────────────────────
export const MODELOS_EVALUACION = [
  { value: "cil_vastago_simple", label: "1. Cilindro hidraulico vastago simple", grupo: "Cilindros" },
  { value: "cil_pivotado", label: "2. Cilindro hidraulico pivotado", grupo: "Cilindros" },
  { value: "cil_doble_vastago", label: "3. Cilindro hidraulico de piston de doble vastago", grupo: "Cilindros" },
  { value: "cil_telescopico", label: "4. Cilindro hidraulico telescopico", grupo: "Cilindros" },
  { value: "acum_embolo", label: "5. Acumulador de embolo", grupo: "Acumuladores" },
  { value: "acum_vejiga", label: "6. Acumulador de vejiga", grupo: "Acumuladores" },
  { value: "rueda_delantera", label: "7. Rueda delantera", grupo: "Otros" },
  { value: "suspension_delantera", label: "8. Cilindro de suspension delantera", grupo: "Otros" },
];

// ── Mapeo de componentes a imagenes ─────────────────────────
export const IMG_COMPONENTE: Record<string, string> = {
  cilindro: "/Cilindro.png",
  vastago: "/Vastago.png",
  tapa: "/Tapa.png",
  piston: "/Piston.png",
  embolo: "/Piston.png",
};

// ── Detectar modelo desde estrategia ────────────────────────
export function detectarModeloDesdeEstrategia(tipoOT: string): string | null {
  const t = (tipoOT || "").toLowerCase();
  if (t.includes("telescop")) return "cil_telescopico";
  if (t.includes("pivotado") || t.includes("trunnion")) return "cil_pivotado";
  if (t.includes("doble")) return "cil_doble_vastago";
  if (t.includes("acumulador") && t.includes("vejiga")) return "acum_vejiga";
  if (t.includes("acumulador") && (t.includes("embolo") || t.includes("émbolo"))) return "acum_embolo";
  if (t.includes("rueda")) return "rueda_delantera";
  if (t.includes("suspension") || t.includes("suspensión")) return "suspension_delantera";
  if (t.includes("vastago") || t.includes("cilindro")) return "cil_vastago_simple";
  return null;
}

// ── Props del componente ────────────────────────────────────
interface EvaluacionFormularioProps {
  modelo: string;
  sistemaMedicion: string;
  datos: Record<string, unknown>;
  onChange: (datos: Record<string, unknown>) => void;
}

// ── Helper: obtener y setear valor ─────────────────────────
function useValor(datos: Record<string, unknown>, onChange: (d: Record<string, unknown>) => void) {
  return {
    get: (key: string) => datos[key],
    set: (key: string, value: unknown) => onChange({ ...datos, [key]: value }),
  };
}

// ── Seccion numerada ───────────────────────────────────────
function SeccionNum({ num, titulo, children }: { num: number | string; titulo: string; children: React.ReactNode }) {
  return (
    <Card
      title={
        <Space>
          <span
            style={{
              background: brand.navy,
              color: "#fff",
              borderRadius: "50%",
              width: 24,
              height: 24,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
            }}
          >
            {num}
          </span>
          {titulo}
        </Space>
      }
      style={{ marginBottom: 16 }}
    >
      {children}
    </Card>
  );
}

// ── Imagen de referencia ───────────────────────────────────
function ImagenReferencia({ componente, label }: { componente: string; label: string }) {
  const src = IMG_COMPONENTE[componente] || IMG_COMPONENTE.cilindro;
  return (
    <div style={{ border: `1px solid ${brand.border}`, borderRadius: 4, padding: 8, textAlign: "center", background: "#fafcff" }}>
      <Image src={src} alt={label} width="100%" style={{ maxWidth: 320 }} preview={{ mask: "Ver imagen" }} />
      <Text type="secondary" style={{ display: "block", fontSize: 11, marginTop: 4, color: brand.navy, fontWeight: 600 }}>
        {label}
      </Text>
    </div>
  );
}

// ── Input de medida numerica ───────────────────────────────
function InputMedida({
  name,
  placeholder,
  datos,
  onChange,
}: {
  name: string;
  placeholder?: string;
  datos: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
}) {
  const v = useValor(datos, onChange);
  return (
    <InputNumber
      size="small"
      value={v.get(name) as number | undefined}
      onChange={(val) => v.set(name, val)}
      placeholder={placeholder || ""}
      step={0.0001}
      style={{ width: "100%" }}
      controls={false}
    />
  );
}

// ── Tabla de medidas A1-A4 (X,Y) ──────────────────────────
function TablaA1A4({
  prefix,
  datos,
  onChange,
}: {
  prefix: string;
  datos: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <Text strong style={{ fontSize: 12 }}>
        Diametro Interior (A1-A4)
      </Text>
      <Row gutter={[8, 8]} style={{ marginTop: 4 }}>
        {[1, 2, 3, 4].map((i) => (
          <Col span={6} key={i}>
            <div style={{ textAlign: "center", fontWeight: 600, fontSize: 11 }}>A{i}</div>
            <Row gutter={4}>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 10 }}>X</Text>
                <InputMedida name={`${prefix}_a${i}_x`} datos={datos} onChange={onChange} />
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 10 }}>Y</Text>
                <InputMedida name={`${prefix}_a${i}_y`} datos={datos} onChange={onChange} />
              </Col>
            </Row>
          </Col>
        ))}
      </Row>
    </div>
  );
}

// ── Tabla de medidas simples ───────────────────────────────
interface FilaMedida {
  prefix: string;
  label: string;
  tipo: "xy" | "single";
}
function TablaMedidas({
  filas,
  datos,
  onChange,
}: {
  filas: FilaMedida[];
  datos: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
}) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead>
        <tr style={{ background: brand.bgPage }}>
          <th style={{ border: `1px solid ${brand.border}`, padding: "4px 8px", textAlign: "left" }}>Parametro</th>
          <th style={{ border: `1px solid ${brand.border}`, padding: "4px 8px", textAlign: "center" }}>X</th>
          <th style={{ border: `1px solid ${brand.border}`, padding: "4px 8px", textAlign: "center" }}>Y</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f, idx) => (
          <tr key={idx}>
            <td style={{ border: `1px solid ${brand.border}`, padding: "4px 8px" }}>{f.label}</td>
            {f.tipo === "xy" ? (
              <>
                <td style={{ border: `1px solid ${brand.border}`, padding: 2 }}>
                  <InputMedida name={`${f.prefix}_x`} datos={datos} onChange={onChange} />
                </td>
                <td style={{ border: `1px solid ${brand.border}`, padding: 2 }}>
                  <InputMedida name={`${f.prefix}_y`} datos={datos} onChange={onChange} />
                </td>
              </>
            ) : (
              <td colSpan={2} style={{ border: `1px solid ${brand.border}`, padding: 2 }}>
                <InputMedida name={f.prefix} datos={datos} onChange={onChange} />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Tabla de checks Bueno/Malo/NA ──────────────────────────
interface ItemCheck {
  key: string;
  label: string;
  tipo?: "bm" | "sn"; // Bueno/Malo o Si/No
}
function TablaChecks({
  prefix,
  items,
  datos,
  onChange,
}: {
  prefix: string;
  items: ItemCheck[];
  datos: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
}) {
  const v = useValor(datos, onChange);
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
      <thead>
        <tr style={{ background: brand.bgPage }}>
          <th style={{ border: `1px solid ${brand.border}`, padding: "4px 8px", textAlign: "left" }}></th>
          <th style={{ border: `1px solid ${brand.border}`, padding: "4px 8px", textAlign: "center", width: 50 }}>
            {items[0]?.tipo === "sn" ? "SI" : "Bueno"}
          </th>
          <th style={{ border: `1px solid ${brand.border}`, padding: "4px 8px", textAlign: "center", width: 50 }}>
            {items[0]?.tipo === "sn" ? "NO" : "Malo"}
          </th>
          <th style={{ border: `1px solid ${brand.border}`, padding: "4px 8px", textAlign: "center", width: 50 }}>N/A</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it) => {
          const opciones = it.tipo === "sn" ? ["SI", "NO", "NA"] : ["Bueno", "Malo", "NA"];
          const name = `${prefix}_${it.key}`;
          const valActual = v.get(name) as string | undefined;
          return (
            <tr key={it.key}>
              <td style={{ border: `1px solid ${brand.border}`, padding: "4px 8px" }}>{it.label}</td>
              {opciones.map((op) => (
                <td key={op} style={{ border: `1px solid ${brand.border}`, padding: "4px", textAlign: "center" }}>
                  <Radio checked={valActual === op} onChange={() => v.set(name, op)} />
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Checklist de hallazgos ──────────────────────────────────
interface GrupoHallazgos {
  nombre: string;
  items: string[];
}
function ChecklistHallazgos({
  id,
  titulo,
  grupos,
  datos,
  onChange,
}: {
  id: string;
  titulo: string;
  grupos: GrupoHallazgos[];
  datos: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
}) {
  const v = useValor(datos, onChange);
  return (
    <div style={{ marginTop: 12 }}>
      <Text strong style={{ color: brand.navy }}>
        {titulo}
      </Text>
      <Row gutter={[16, 16]} style={{ marginTop: 8 }}>
        {grupos.map((g, gi) => (
          <Col xs={24} md={12} key={gi}>
            <Card size="small" title={<span style={{ fontSize: 11, fontWeight: 700 }}>{g.nombre}</span>}>
              <Space orientation="vertical" size={4} style={{ width: "100%" }}>
                {g.items.map((item, idx) => {
                  const key = `${id}_g${gi}_${idx}`;
                  return (
                    <Checkbox
                      key={idx}
                      checked={!!v.get(key)}
                      onChange={(e) => v.set(key, e.target.checked ? item : false)}
                    >
                      <span style={{ fontSize: 12 }}>{item}</span>
                    </Checkbox>
                  );
                })}
              </Space>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}

// ── Resultado y Recomendaciones por componente ─────────────
function ResultadoComponente({
  prefix,
  label,
  datos,
  onChange,
}: {
  prefix: string;
  label: string;
  datos: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
}) {
  const v = useValor(datos, onChange);
  return (
    <Row gutter={16} style={{ marginTop: 12 }}>
      <Col xs={24} md={12}>
        <Text strong style={{ fontSize: 12, color: brand.navy }}>
          Resultado evaluacion - {label}
        </Text>
        <TextArea
          rows={2}
          value={(v.get(`${prefix}_resultado`) as string) || ""}
          onChange={(e) => v.set(`${prefix}_resultado`, e.target.value)}
          placeholder="Conclusiones..."
          style={{ marginTop: 4 }}
        />
      </Col>
      <Col xs={24} md={12}>
        <Text strong style={{ fontSize: 12, color: brand.navy }}>
          Recomendaciones - {label}
        </Text>
        <TextArea
          rows={2}
          value={(v.get(`${prefix}_recomendaciones`) as string) || ""}
          onChange={(e) => v.set(`${prefix}_recomendaciones`, e.target.value)}
          placeholder="Recomendaciones tecnicas..."
          style={{ marginTop: 4 }}
        />
      </Col>
    </Row>
  );
}

// ── Comprimir imagen a base64 para almacenar en datos_formulario ──
async function comprimirImagen(file: File, maxWidth = 1280, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new window.Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas no soportado"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
      img.src = ev.target?.result as string;
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

// ── Uploader de fotos por componente ───────────────────────
interface FotoComponente {
  name: string;
  data: string;
}
function ImagenesComponente({
  prefix,
  etiqueta,
  datos,
  onChange,
}: {
  prefix: string;
  etiqueta: string;
  datos: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
}) {
  const { message } = App.useApp();
  const key = `${prefix}_imagenes`;
  const imagenes = (datos[key] as FotoComponente[] | undefined) || [];
  const MAX_FOTOS = 6;
  const lleno = imagenes.length >= MAX_FOTOS;

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      message.warning("Solo se permiten imagenes");
      return false;
    }
    if (file.size > 15 * 1024 * 1024) {
      message.warning("Imagen demasiado grande (max 15MB)");
      return false;
    }
    // Leemos el estado actual de datos por si hay varios uploads paralelos
    const actuales = (datos[key] as FotoComponente[] | undefined) || [];
    if (actuales.length >= MAX_FOTOS) {
      message.warning(`Maximo ${MAX_FOTOS} fotos por componente`);
      return false;
    }
    try {
      const data = await comprimirImagen(file);
      onChange({ ...datos, [key]: [...actuales, { name: file.name, data }] });
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Error al procesar imagen");
    }
    return false;
  };

  const handleDelete = (idx: number) => {
    onChange({ ...datos, [key]: imagenes.filter((_, i) => i !== idx) });
  };

  return (
    <Card
      size="small"
      title={
        <Space>
          <CameraOutlined style={{ color: brand.cyan }} />
          <Text strong style={{ fontSize: 12, color: brand.navy }}>
            Evidencia fotografica — {etiqueta}
          </Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            ({imagenes.length}/{MAX_FOTOS})
          </Text>
        </Space>
      }
      style={{ marginTop: 12, background: "#fafcff", borderColor: brand.border }}
      styles={{ body: { padding: 12 } }}
    >
      <Upload
        beforeUpload={(file) => handleUpload(file as File)}
        showUploadList={false}
        multiple
        accept="image/*"
        disabled={lleno}
      >
        <Button icon={<UploadOutlined />} size="small" disabled={lleno}>
          {lleno ? `Limite alcanzado (${MAX_FOTOS})` : "Agregar foto"}
        </Button>
      </Upload>
      {imagenes.length > 0 && (
        <Row gutter={[8, 8]} style={{ marginTop: 10 }}>
          {imagenes.map((img, idx) => (
            <Col xs={12} sm={8} md={6} lg={4} key={idx}>
              <div
                style={{
                  position: "relative",
                  border: `1px solid ${brand.border}`,
                  borderRadius: 4,
                  padding: 4,
                  background: "#fff",
                }}
              >
                <Image
                  src={img.data}
                  alt={img.name}
                  style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 2 }}
                  preview={{ mask: "Ver" }}
                />
                <Button
                  danger
                  type="primary"
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => handleDelete(idx)}
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    minWidth: 22,
                    height: 22,
                    padding: 0,
                  }}
                />
                <div
                  style={{
                    fontSize: 10,
                    color: "#666",
                    marginTop: 4,
                    textAlign: "center",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={img.name}
                >
                  {img.name}
                </div>
              </div>
            </Col>
          ))}
        </Row>
      )}
    </Card>
  );
}

// ── Checklist Cilindro (compartido) ────────────────────────
const GRUPOS_CILINDRO: GrupoHallazgos[] = [
  {
    nombre: "Cilindro Interior",
    items: [
      "Presenta rayaduras axiales en interior",
      "Presenta rayaduras radiales en interior",
      "Diametro interior presenta deformacion",
      "Medida interna fuera de tolerancia",
      "Diametro interior muestra desgaste",
      "Diametro de sellado muestra desgaste",
    ],
  },
  {
    nombre: "Cilindro Exterior",
    items: [
      "Presenta golpes en el exterior del cilindro",
      "Presenta desgaste en exterior del cilindro",
      "Presenta deformacion en exterior de cilindro",
      "Presenta depositos de soldadura ajenos al diseño",
    ],
  },
];

const GRUPOS_VASTAGO: GrupoHallazgos[] = [
  {
    nombre: "Cojinete",
    items: [
      "Presenta corrosion en exterior de cojinete",
      "Presenta picaduras en exterior de cojinete",
      "Presenta desgaste en exterior de cojinete",
      "Cojinete llego fisurado",
      "Llego sin cojinete",
    ],
  },
  {
    nombre: "Rotula",
    items: [
      "Presenta corrosion en interior de rotula",
      "Presenta picaduras en interior de rotula",
      "Presenta desgaste en interior de rotula",
    ],
  },
];

const GRUPOS_TAPA: GrupoHallazgos[] = [
  {
    nombre: "Tapa",
    items: [
      "Tapa presenta rayaduras",
      "Tapa presenta deformacion",
      "Tapa fuera de tolerancia",
      "Roscas de tapa danadas",
    ],
  },
];

const GRUPOS_PISTON: GrupoHallazgos[] = [
  {
    nombre: "Piston / Embolo",
    items: [
      "Piston presenta rayaduras",
      "Piston presenta deformacion",
      "Piston fuera de tolerancia",
      "Canales de sellos danados",
    ],
  },
];

// ── Campos adicionales segun tipo ───────────────────────────
function CamposAdicionales({
  modelo,
  prefix,
  unidad,
  datos,
  onChange,
}: {
  modelo: string;
  prefix: string;
  unidad: string;
  datos: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
}) {
  const v = useValor(datos, onChange);

  if (modelo === "cil_pivotado") {
    return (
      <SeccionNum num="2.1" titulo="Campos adicionales - Cilindro Pivotado">
        <Row gutter={[16, 12]}>
          <Col xs={24} md={8}>
            <Text strong style={{ fontSize: 12 }}>Diametro exterior cojinete [{unidad}]</Text>
            <InputMedida name={`${prefix}_pivot_dext_cojinete`} datos={datos} onChange={onChange} />
          </Col>
          <Col xs={24} md={8}>
            <Text strong style={{ fontSize: 12 }}>Diametro exterior pivotante [{unidad}]</Text>
            <InputMedida name={`${prefix}_pivot_dext_pivotante`} datos={datos} onChange={onChange} />
          </Col>
          <Col xs={24} md={8}>
            <Text strong style={{ fontSize: 12 }}>Longitud pivotante [{unidad}]</Text>
            <InputMedida name={`${prefix}_pivot_l_pivotante`} datos={datos} onChange={onChange} />
          </Col>
          <Col xs={24} md={12}>
            <Text strong style={{ fontSize: 12 }}>Estado del trunnion</Text>
            <Input
              value={(v.get(`${prefix}_pivot_estado_trunnion`) as string) || ""}
              onChange={(e) => v.set(`${prefix}_pivot_estado_trunnion`, e.target.value)}
              placeholder="Bueno / Malo / N/A"
            />
          </Col>
          <Col xs={24} md={12}>
            <Text strong style={{ fontSize: 12 }}>Pasa prueba de estanqueidad</Text>
            <Input
              value={(v.get(`${prefix}_pivot_estanqueidad`) as string) || ""}
              onChange={(e) => v.set(`${prefix}_pivot_estanqueidad`, e.target.value)}
              placeholder="SI / NO / N/A"
            />
          </Col>
        </Row>
      </SeccionNum>
    );
  }

  if (modelo === "cil_doble_vastago") {
    return (
      <SeccionNum num="2.1" titulo="Campos adicionales - Cilindro de Doble Vastago">
        <Text strong style={{ fontSize: 12 }}>Estado de soporte de sujecion</Text>
        <TextArea
          rows={2}
          value={(v.get(`${prefix}_doble_soporte_sujecion`) as string) || ""}
          onChange={(e) => v.set(`${prefix}_doble_soporte_sujecion`, e.target.value)}
          placeholder="Describa el estado del soporte de sujecion..."
        />
        <Row gutter={16} style={{ marginTop: 12 }}>
          <Col xs={24} md={12}>
            <Text strong style={{ fontSize: 12 }}>Diametro vastago extremo 2 [{unidad}]</Text>
            <InputMedida name={`${prefix}_doble_dv2`} datos={datos} onChange={onChange} />
          </Col>
          <Col xs={24} md={12}>
            <Text strong style={{ fontSize: 12 }}>Longitud vastago extremo 2 [{unidad}]</Text>
            <InputMedida name={`${prefix}_doble_lv2`} datos={datos} onChange={onChange} />
          </Col>
        </Row>
      </SeccionNum>
    );
  }

  if (modelo === "acum_embolo") {
    return (
      <SeccionNum num="2.1" titulo="Campos adicionales - Acumulador de Embolo">
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Text strong style={{ fontSize: 12 }}>Volumen (GL)</Text>
            <InputMedida name={`${prefix}_acum_vol`} datos={datos} onChange={onChange} />
          </Col>
          <Col xs={24} md={12}>
            <Text strong style={{ fontSize: 12 }}>Presion precarga nitrogeno (PSI)</Text>
            <InputMedida name={`${prefix}_acum_presion_n2`} datos={datos} onChange={onChange} />
          </Col>
        </Row>
      </SeccionNum>
    );
  }

  if (modelo === "suspension_delantera") {
    return (
      <SeccionNum num="2.1" titulo="Campos adicionales - Suspension Delantera">
        <Row gutter={[16, 12]}>
          <Col xs={24} md={8}>
            <Text strong style={{ fontSize: 12 }}>Carga nitrogeno (PSI)</Text>
            <InputMedida name={`${prefix}_susp_n2`} datos={datos} onChange={onChange} />
          </Col>
          <Col xs={24} md={8}>
            <Text strong style={{ fontSize: 12 }}>Carga aceite (L)</Text>
            <InputMedida name={`${prefix}_susp_aceite`} datos={datos} onChange={onChange} />
          </Col>
          <Col xs={24} md={8}>
            <Text strong style={{ fontSize: 12 }}>Altura nominal [{unidad}]</Text>
            <InputMedida name={`${prefix}_susp_altura`} datos={datos} onChange={onChange} />
          </Col>
        </Row>
      </SeccionNum>
    );
  }

  return null;
}

// ── Etapas dinamicas del telescopico ───────────────────────
function EtapasTelescopico({
  prefix,
  unidad,
  datos,
  onChange,
}: {
  prefix: string;
  unidad: string;
  datos: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
}) {
  const v = useValor(datos, onChange);
  const numEtapas = Number(v.get(`${prefix}_num_etapas`) || 2);

  const actualizarEtapas = (n: number) => {
    v.set(`${prefix}_num_etapas`, n);
  };

  const etapas: React.ReactNode[] = [];
  for (let i = 1; i <= numEtapas; i++) {
    etapas.push(
      <SeccionNum key={`etapa-${i}`} num={`E${i}`} titulo={`Etapa ${i} - Cuerpo intermedio / Vastago telescopico`}>
        <Row gutter={16}>
          <Col xs={24} md={8}>
            <ImagenReferencia componente="cilindro" label={`Etapa ${i}`} />
          </Col>
          <Col xs={24} md={16}>
            <TablaA1A4 prefix={`${prefix}_etapa${i}_cil`} datos={datos} onChange={onChange} />
            <Divider style={{ margin: "8px 0" }} />
            <TablaMedidas
              filas={[
                { prefix: `${prefix}_etapa${i}_dext`, label: `Diametro Exterior (B) [${unidad}]`, tipo: "xy" },
                { prefix: `${prefix}_etapa${i}_dcro`, label: `Diametro Cromo (C) [${unidad}]`, tipo: "xy" },
                { prefix: `${prefix}_etapa${i}_lcro`, label: `Longitud Cromo (D) [${unidad}]`, tipo: "single" },
                { prefix: `${prefix}_etapa${i}_lbru`, label: `Longitud Bruñido (E) [${unidad}]`, tipo: "single" },
                { prefix: `${prefix}_etapa${i}_ltot`, label: `Longitud Total (F) [${unidad}]`, tipo: "single" },
              ]}
              datos={datos}
              onChange={onChange}
            />
            <div style={{ marginTop: 12 }}>
              <TablaChecks
                prefix={`${prefix}_etapa${i}`}
                items={[
                  { key: "estado_cromo", label: "Estado del cromo" },
                  { key: "ndt", label: "Pasa a NDT", tipo: "sn" },
                ]}
                datos={datos}
                onChange={onChange}
              />
            </div>
          </Col>
        </Row>
        <ChecklistHallazgos
          id={`${prefix}_etapa${i}`}
          titulo={`Hallazgos - Etapa ${i}`}
          grupos={GRUPOS_CILINDRO}
          datos={datos}
          onChange={onChange}
        />
        <ImagenesComponente
          prefix={`${prefix}_etapa${i}`}
          etiqueta={`Etapa ${i}`}
          datos={datos}
          onChange={onChange}
        />
        <ResultadoComponente prefix={`${prefix}_etapa${i}`} label={`Etapa ${i}`} datos={datos} onChange={onChange} />
      </SeccionNum>
    );
  }

  return (
    <>
      <Card
        title="Configuracion de etapas"
        style={{ marginBottom: 16, background: "#fafcff", border: `1px dashed ${brand.cyan}` }}
      >
        <Space size={12}>
          <Text strong>Numero de etapas del telescopico:</Text>
          <InputNumber
            min={1}
            max={6}
            value={numEtapas}
            onChange={(val) => actualizarEtapas(Number(val) || 2)}
            style={{ width: 120 }}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            (cada etapa generara su propia seccion de medidas, hallazgos y resultados)
          </Text>
        </Space>
      </Card>
      {etapas}
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// RENDER PRINCIPAL
// ═══════════════════════════════════════════════════════════
export default function EvaluacionFormulario({ modelo, sistemaMedicion, datos, onChange }: EvaluacionFormularioProps) {
  const unidad = sistemaMedicion === "Imperial" ? "in" : "mm";

  // Prefijo segun tipo
  const prefijos: Record<string, string> = {
    cil_vastago_simple: "t1",
    cil_pivotado: "t2",
    cil_doble_vastago: "t3",
    cil_telescopico: "t4",
    acum_embolo: "t5",
    acum_vejiga: "t6",
    rueda_delantera: "t7",
    suspension_delantera: "t8",
  };
  const p = prefijos[modelo] || "t1";

  // Renderizar secciones segun tipo
  const renderSecciones = () => {
    // ── CILINDRO TELESCOPICO ── (etapas dinamicas)
    if (modelo === "cil_telescopico") {
      return (
        <>
          <EtapasTelescopico prefix={p} unidad={unidad} datos={datos} onChange={onChange} />
          <SeccionNum num="T" titulo="Tapas Secundarias (opcional)">
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Text strong style={{ fontSize: 12 }}>Tapa roscada secundaria (detalle)</Text>
                <TextArea
                  rows={2}
                  placeholder="Medidas y condicion..."
                  value={(datos[`${p}_tapa_secundaria`] as string) || ""}
                  onChange={(e) => onChange({ ...datos, [`${p}_tapa_secundaria`]: e.target.value })}
                />
              </Col>
              <Col xs={24} md={12}>
                <Text strong style={{ fontSize: 12 }}>Tapa posterior de sujecion (detalle)</Text>
                <TextArea
                  rows={2}
                  placeholder="Medidas y condicion..."
                  value={(datos[`${p}_tapa_posterior`] as string) || ""}
                  onChange={(e) => onChange({ ...datos, [`${p}_tapa_posterior`]: e.target.value })}
                />
              </Col>
            </Row>
          </SeccionNum>
        </>
      );
    }

    // ── RUEDA DELANTERA ── (segun Excel tipo 7: HUB, SPINDLE, CONJUNTO FRENO, CAJA FRENO, GENERAL)
    if (modelo === "rueda_delantera") {
      return (
        <>
          <SeccionNum num={3} titulo="HUB (Cubo)">
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <ImagenReferencia componente="cilindro" label="Hub" />
              </Col>
              <Col xs={24} md={16}>
                <TablaMedidas
                  filas={[
                    { prefix: `${p}_hub_a`, label: `A - Diametro alojamiento pista rodamiento mayor [${unidad}]`, tipo: "xy" },
                    { prefix: `${p}_hub_b`, label: `B - Diametro alojamiento pista rodamiento menor [${unidad}]`, tipo: "xy" },
                  ]}
                  datos={datos}
                  onChange={onChange}
                />
              </Col>
            </Row>
            <ChecklistHallazgos
              id={`${p}_hub`}
              titulo="Check list - Hub"
              grupos={[
                {
                  nombre: "Hallazgos HUB",
                  items: [
                    "Alojamientos de pistas de rodamientos conicos presentan desgaste",
                    "Alojamientos de pistas de rodamientos conicos presentan rayaduras",
                    "Pistas de rodamientos conicos presentan desgaste",
                    "Pistas de rodamientos conicos presentan rayaduras",
                    "Pernos de sujecion de rueda presentan desgaste",
                    "Pernos de sujecion de rueda presentan fatiga",
                    "Pernos de sujecion de rueda presentan hilos dañados",
                    "Pernos de sujecion de rueda presentan fractura",
                    "Presenta corrosion en portasellos",
                    "Sello Duo Cone presenta desgaste",
                    "Engranaje de sensor presenta corrosion",
                    "Lainas de separacion llegaron dañadas",
                  ],
                },
              ]}
              datos={datos}
              onChange={onChange}
            />
            <ImagenesComponente prefix={`${p}_hub`} etiqueta="Hub" datos={datos} onChange={onChange} />
            <ResultadoComponente prefix={`${p}_hub`} label="Hub" datos={datos} onChange={onChange} />
          </SeccionNum>

          <SeccionNum num={4} titulo="SPINDLE (Muñon)">
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <ImagenReferencia componente="vastago" label="Spindle" />
              </Col>
              <Col xs={24} md={16}>
                <TablaMedidas
                  filas={[
                    { prefix: `${p}_spi_a`, label: `A - Diametro asiento rodamiento mayor [${unidad}]`, tipo: "xy" },
                    { prefix: `${p}_spi_b`, label: `B - Diametro asiento rodamiento menor [${unidad}]`, tipo: "xy" },
                  ]}
                  datos={datos}
                  onChange={onChange}
                />
              </Col>
            </Row>
            <ChecklistHallazgos
              id={`${p}_spi`}
              titulo="Check list - Spindle"
              grupos={[
                {
                  nombre: "Hallazgos SPINDLE",
                  items: [
                    "Presenta picaduras en asiento de rodamiento",
                    "Presenta rayaduras en asiento de rodamiento",
                    "Daños en alojamientos roscados",
                    "Presenta daños en alojamiento conico",
                    "Presenta corrosion en alojamiento conico",
                    "Presenta picaduras en alojamiento conico",
                    "Alojamientos roscados de pernos de sujecion de bastidor",
                  ],
                },
              ]}
              datos={datos}
              onChange={onChange}
            />
            <ImagenesComponente prefix={`${p}_spi`} etiqueta="Spindle" datos={datos} onChange={onChange} />
            <ResultadoComponente prefix={`${p}_spi`} label="Spindle" datos={datos} onChange={onChange} />
          </SeccionNum>

          <SeccionNum num={5} titulo="CONJUNTO DE FRENO">
            <ChecklistHallazgos
              id={`${p}_freno`}
              titulo="Check list - Conjunto de Freno"
              grupos={[
                {
                  nombre: "Hallazgos Freno",
                  items: [
                    "Piston de freno presenta rayaduras en alojamientos de sellos",
                    "Presenta desgaste en resortes de retraccion",
                    "Pernos de sujecion llegaron elongados",
                    "Sellos presentan desgaste",
                  ],
                },
              ]}
              datos={datos}
              onChange={onChange}
            />
            <ImagenesComponente prefix={`${p}_freno`} etiqueta="Conjunto Freno" datos={datos} onChange={onChange} />
            <ResultadoComponente prefix={`${p}_freno`} label="Conjunto Freno" datos={datos} onChange={onChange} />
          </SeccionNum>

          <SeccionNum num={6} titulo="CAJA DE FRENO">
            <ChecklistHallazgos
              id={`${p}_caja`}
              titulo="Check list - Caja de Freno"
              grupos={[
                {
                  nombre: "Hallazgos Caja",
                  items: [
                    "Presenta rayas en asientos de sellos",
                    "Alojamientos roscados presentan contaminacion",
                  ],
                },
              ]}
              datos={datos}
              onChange={onChange}
            />
            <ImagenesComponente prefix={`${p}_caja`} etiqueta="Caja Freno" datos={datos} onChange={onChange} />
            <ResultadoComponente prefix={`${p}_caja`} label="Caja Freno" datos={datos} onChange={onChange} />
          </SeccionNum>

          <SeccionNum num={7} titulo="GENERAL">
            <ChecklistHallazgos
              id={`${p}_gen`}
              titulo="Check list - General"
              grupos={[
                {
                  nombre: "Hallazgos Generales",
                  items: [
                    "Discos de friccion presentan desgaste",
                    "Discos de friccion presentan marcas de temperatura (recalentamiento)",
                    "Placas separadoras presentan rayas circulares",
                    "Placas separadoras presentan desgaste",
                    "Placas separadoras presentan manchas de sobrecalentamiento",
                    "Dumpers presentan desgaste y daños por temperatura",
                  ],
                },
              ]}
              datos={datos}
              onChange={onChange}
            />
            <ImagenesComponente prefix={`${p}_gen`} etiqueta="General" datos={datos} onChange={onChange} />
            <ResultadoComponente prefix={`${p}_gen`} label="General" datos={datos} onChange={onChange} />
          </SeccionNum>
        </>
      );
    }

    // ── ACUMULADOR DE VEJIGA ──
    if (modelo === "acum_vejiga") {
      return (
        <SeccionNum num={3} titulo="Acumulador de Vejiga">
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <ImagenReferencia componente="cilindro" label="Acumulador (A,B,C)" />
            </Col>
            <Col xs={24} md={16}>
              <TablaMedidas
                filas={[
                  { prefix: `${p}_dext`, label: `Diametro Exterior (A) [${unidad}]`, tipo: "single" },
                  { prefix: `${p}_dint`, label: `Diametro Interior (B) [${unidad}]`, tipo: "single" },
                  { prefix: `${p}_ltot`, label: `Longitud Total (C) [${unidad}]`, tipo: "single" },
                  { prefix: `${p}_dsal1`, label: `Diametro salida 1 [${unidad}]`, tipo: "single" },
                  { prefix: `${p}_dsal2`, label: `Diametro salida 2 [${unidad}]`, tipo: "single" },
                ]}
                datos={datos}
                onChange={onChange}
              />
              <div style={{ marginTop: 12 }}>
                <TablaChecks
                  prefix={`${p}_acum`}
                  items={[
                    { key: "valv_muelle", label: "Valvula hidraulica de muelle" },
                    { key: "estado_vejiga", label: "Estado vejiga" },
                    { key: "ndt", label: "Pasa a NDT", tipo: "sn" },
                  ]}
                  datos={datos}
                  onChange={onChange}
                />
              </div>
            </Col>
          </Row>
          <ImagenesComponente prefix={`${p}_acum`} etiqueta="Acumulador" datos={datos} onChange={onChange} />
          <ResultadoComponente prefix={`${p}_acum`} label="Acumulador" datos={datos} onChange={onChange} />
        </SeccionNum>
      );
    }

    // Secciones comunes para cilindros
    const secciones: React.ReactNode[] = [];

    // Campos adicionales especificos del tipo (pivotado, doble, acumulador embolo, suspension)
    const camposExtra = <CamposAdicionales key="extra" modelo={modelo} prefix={p} unidad={unidad} datos={datos} onChange={onChange} />;
    if (["cil_pivotado", "cil_doble_vastago", "acum_embolo", "suspension_delantera"].includes(modelo)) {
      secciones.push(camposExtra);
    }

    // Cilindro (Botella)
    secciones.push(
      <SeccionNum key="cil" num={3} titulo="Cilindro (Botella)">
        <Row gutter={16}>
          <Col xs={24} md={8}>
            <ImagenReferencia componente="cilindro" label="Cilindro (A1-A4, C, D, E, F, G)" />
          </Col>
          <Col xs={24} md={16}>
            <TablaA1A4 prefix={`${p}_cil`} datos={datos} onChange={onChange} />
            <Divider style={{ margin: "8px 0" }} />
            <TablaMedidas
              filas={[
                { prefix: `${p}_cil_dsal`, label: `Diametro Salida (B) [${unidad}]`, tipo: "xy" },
                { prefix: `${p}_cil_dext`, label: `Diametro Exterior (C) [${unidad}]`, tipo: "xy" },
                { prefix: `${p}_cil_lbru`, label: `Longitud Bruñido (D) [${unidad}]`, tipo: "single" },
                { prefix: `${p}_cil_ltot`, label: `Longitud Total (E) [${unidad}]`, tipo: "single" },
              ]}
              datos={datos}
              onChange={onChange}
            />
            <div style={{ marginTop: 12 }}>
              <TablaChecks
                prefix={`${p}_cil`}
                items={[
                  { key: "tomas", label: "Tomas" },
                  { key: "roscada", label: "Estado de sup. Roscada" },
                  { key: "ndt", label: "Pasa a NDT", tipo: "sn" },
                ]}
                datos={datos}
                onChange={onChange}
              />
            </div>
          </Col>
        </Row>
        <ChecklistHallazgos id={`${p}_cil`} titulo="Check list - Cilindro" grupos={GRUPOS_CILINDRO} datos={datos} onChange={onChange} />
        <ImagenesComponente prefix={`${p}_cil`} etiqueta="Cilindro" datos={datos} onChange={onChange} />
        <ResultadoComponente prefix={`${p}_cil`} label="Cilindro" datos={datos} onChange={onChange} />
      </SeccionNum>
    );

    // Vastago (excepto acumuladores)
    if (!modelo.startsWith("acum")) {
      secciones.push(
        <SeccionNum key="vas" num={4} titulo="Vastago">
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <ImagenReferencia componente="vastago" label="Vastago (A-J)" />
            </Col>
            <Col xs={24} md={16}>
              <TablaMedidas
                filas={[
                  { prefix: `${p}_vas_desp`, label: `Diametro Espiga (A) [${unidad}]`, tipo: "xy" },
                  { prefix: `${p}_vas_dext`, label: `Diametro Exterior (B) [${unidad}]`, tipo: "xy" },
                  { prefix: `${p}_vas_dsell`, label: `Diametro Sellado (C) [${unidad}]`, tipo: "xy" },
                  { prefix: `${p}_vas_dcoj`, label: `Diametro Cojinete (D) [${unidad}]`, tipo: "xy" },
                  { prefix: `${p}_vas_lcro`, label: `Longitud Cromo (E) [${unidad}]`, tipo: "single" },
                  { prefix: `${p}_vas_ltot`, label: `Longitud Total (F) [${unidad}]`, tipo: "single" },
                ]}
                datos={datos}
                onChange={onChange}
              />
              <div style={{ marginTop: 12 }}>
                <TablaChecks
                  prefix={`${p}_vas`}
                  items={[
                    { key: "estado_cromo", label: "Estado del cromo" },
                    { key: "ndt", label: "Pasa a NDT", tipo: "sn" },
                    { key: "sensor", label: "Sensor", tipo: "sn" },
                  ]}
                  datos={datos}
                  onChange={onChange}
                />
              </div>
            </Col>
          </Row>
          <ChecklistHallazgos id={`${p}_vas`} titulo="Check list - Vastago" grupos={GRUPOS_VASTAGO} datos={datos} onChange={onChange} />
          <ImagenesComponente prefix={`${p}_vas`} etiqueta="Vastago" datos={datos} onChange={onChange} />
          <ResultadoComponente prefix={`${p}_vas`} label="Vastago" datos={datos} onChange={onChange} />
        </SeccionNum>
      );
    }

    // Tapa
    if (!modelo.startsWith("acum") && modelo !== "suspension_delantera") {
      secciones.push(
        <SeccionNum key="tapa" num={5} titulo="Tapa">
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <ImagenReferencia componente="tapa" label="Tapa (A, B, C, D)" />
            </Col>
            <Col xs={24} md={16}>
              <TablaMedidas
                filas={[
                  { prefix: `${p}_tapa_dext`, label: `Diametro Exterior (A) [${unidad}]`, tipo: "single" },
                  { prefix: `${p}_tapa_dint`, label: `Diametro Interior (B) [${unidad}]`, tipo: "single" },
                  { prefix: `${p}_tapa_dsell`, label: `Diametro Sellado (C) [${unidad}]`, tipo: "single" },
                  { prefix: `${p}_tapa_ltot`, label: `Longitud Total (D) [${unidad}]`, tipo: "single" },
                ]}
                datos={datos}
                onChange={onChange}
              />
              <div style={{ marginTop: 12 }}>
                <TablaChecks
                  prefix={`${p}_tapa`}
                  items={[
                    { key: "ndt", label: "Pasa a NDT", tipo: "sn" },
                    { key: "ext_roscado", label: "Exterior roscado", tipo: "sn" },
                  ]}
                  datos={datos}
                  onChange={onChange}
                />
              </div>
            </Col>
          </Row>
          <ChecklistHallazgos id={`${p}_tapa`} titulo="Check list - Tapa" grupos={GRUPOS_TAPA} datos={datos} onChange={onChange} />
          <ImagenesComponente prefix={`${p}_tapa`} etiqueta="Tapa" datos={datos} onChange={onChange} />
          <ResultadoComponente prefix={`${p}_tapa`} label="Tapa" datos={datos} onChange={onChange} />
        </SeccionNum>
      );
    }

    // Piston / Embolo
    secciones.push(
      <SeccionNum key="pis" num={6} titulo={modelo === "acum_embolo" ? "Embolo" : "Piston"}>
        <Row gutter={16}>
          <Col xs={24} md={8}>
            <ImagenReferencia componente="piston" label={modelo === "acum_embolo" ? "Embolo (A, B, C)" : "Piston (A, B, C)"} />
          </Col>
          <Col xs={24} md={16}>
            <TablaMedidas
              filas={[
                { prefix: `${p}_pis_dext`, label: `Diametro Exterior (A) [${unidad}]`, tipo: "single" },
                { prefix: `${p}_pis_dint`, label: `Diametro Interior (B) [${unidad}]`, tipo: "single" },
                { prefix: `${p}_pis_ltot`, label: `Longitud (C) [${unidad}]`, tipo: "single" },
              ]}
              datos={datos}
              onChange={onChange}
            />
            <div style={{ marginTop: 12 }}>
              <TablaChecks
                prefix={`${p}_pis`}
                items={[
                  { key: "ndt", label: "Pasa a NDT", tipo: "sn" },
                  { key: "int_roscado", label: "Interior roscado", tipo: "sn" },
                ]}
                datos={datos}
                onChange={onChange}
              />
            </div>
          </Col>
        </Row>
        <ChecklistHallazgos id={`${p}_pis`} titulo="Check list - Piston" grupos={GRUPOS_PISTON} datos={datos} onChange={onChange} />
        <ImagenesComponente prefix={`${p}_pis`} etiqueta={modelo === "acum_embolo" ? "Embolo" : "Piston"} datos={datos} onChange={onChange} />
        <ResultadoComponente prefix={`${p}_pis`} label="Piston" datos={datos} onChange={onChange} />
      </SeccionNum>
    );

    return secciones;
  };

  return <>{renderSecciones()}</>;
}
