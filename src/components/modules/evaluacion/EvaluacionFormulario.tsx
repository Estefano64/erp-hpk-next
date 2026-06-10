"use client";

import { createContext, useContext, useMemo } from "react";
import { Card, Row, Col, Input, Checkbox, Radio, InputNumber, Space, Typography, Divider, Image, Upload, Button, App, Tag, Alert } from "antd";
import { CameraOutlined, UploadOutlined, DeleteOutlined } from "@ant-design/icons";
import { brand } from "@/lib/theme";
import { findMedidasModelo, modeloForField, type MedidaModelo } from "@/lib/medidas-modelo";
import {
  CATALOGOS_EVALUACION,
  type HallazgoItem,
  type RecomendacionItem,
} from "@/lib/evaluacion-catalogos";

const { Text } = Typography;
const { TextArea } = Input;

// ── Context de medidas modelo (referencia visual) ───────────
// Permite que cualquier InputMedida descendiente pueda leer la medida modelo
// aplicable según el NP del cilindro, sin pasarla por props en toda la cadena.
interface MedidasModeloContextValue {
  medida: MedidaModelo | null;
  unidad: string;
}
const MedidasModeloContext = createContext<MedidasModeloContextValue>({ medida: null, unidad: "mm" });

// ── Modelos disponibles ─────────────────────────────────────
// `codigo`: código corto del catálogo Excel "5. Cod Rep" (CHVS, CHP, etc.)
// `aplica`: ayuda al usuario a saber qué equipo/flota corresponde a cada modelo
//           (se muestra cuando no se puede detectar el tipo automáticamente).
export const MODELOS_EVALUACION = [
  { value: "cil_vastago_simple", label: "1. Cilindro hidraulico vastago simple", grupo: "Cilindros", codigo: "CHVS", aplica: "Todos los cilindros de simple efecto" },
  { value: "cil_pivotado", label: "2. Cilindro hidraulico pivotado", grupo: "Cilindros", codigo: "CHP", aplica: "bladelift 24 - 24M / levante de ripper 24 - 24M / levante de buldozer D11 - D11T - 844H - 844K" },
  { value: "cil_doble_vastago", label: "3. Cilindro hidraulico de piston de doble vastago", grupo: "Cilindros", codigo: "CHPDV", aplica: "Dirección de montacargas genéricos" },
  { value: "cil_telescopico", label: "4. Cilindro hidraulico telescopico", grupo: "Cilindros", codigo: "CHT", aplica: "Levante de tolvas 797F / 793D - 930E-4SE / 830E" },
  { value: "acum_embolo", label: "5. Acumulador de embolo", grupo: "Acumuladores", codigo: "AE", aplica: "Dirección 797F / Freno 797F / Dirección 980E-4SE" },
  { value: "acum_vejiga", label: "6. Acumulador de vejiga", grupo: "Acumuladores", codigo: "AV", aplica: "Dirección 930E-4SE / Freno 930E-4SE / Freno 830E-4SE" },
  { value: "rueda_delantera", label: "7. Rueda delantera", grupo: "Otros", codigo: "RD", aplica: "Rueda 930E-4SE / 797F / 980E-4SE / 830E / HD1500 / 793D" },
  { value: "suspension_delantera", label: "8. Cilindro de suspension delantera", grupo: "Otros", codigo: "SD", aplica: "Suspensiones 930E-4SE / 797F / 980E-4SE / 830E / HD1500 / 793D" },
  { value: "freno_servicio_parqueo", label: "9. Freno de servicio & parqueo", grupo: "Otros", codigo: "FS", aplica: "Frenos de 24 - 24M / Drive 24M" },
];

// ── Mapeo de componentes a imagenes ─────────────────────────
export const IMG_COMPONENTE: Record<string, string> = {
  cilindro: "/Cilindro.png",
  vastago: "/Vastago.png",
  tapa: "/Tapa.png",
  piston: "/Piston.png",
  embolo: "/Piston.png",
  hub: "/Hub.jpeg",
  spindle: "/Spindle.jpeg",
  conjunto_freno: "/ConjuntoFreno.jpeg",
  piston_freno: "/PistonFreno.jpeg",
  housing_freno: "/HOUSING.jpeg",
  spindle_freno: "/SPINDLE_freno.jpeg",
  cuerpo_intermedio: "/CuerposIntermedios.jpeg",
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
  readonly?: boolean;
  /** N° de parte del cilindro (de la OT/CodRep). Si coincide con una fila del
   *  catálogo MEDIDAS2.xlsx, los inputs muestran la medida modelo abajo. */
  np?: string | null;
  /** Descripción/marca/modelo para fallback de búsqueda si NP no matchea. */
  descripcionCilindro?: string | null;
  marca?: string | null;
  modeloCilindro?: string | null;
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
              color: brand.white,
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
// Renderiza dos celdas verticales: arriba la medida MODELO (readonly, fondo
// claro) y abajo el INPUT editable donde el técnico ingresa la medida real.
// Cuando no hay modelo aplicable, solo se muestra el input.
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
  const { medida, unidad } = useContext(MedidasModeloContext);
  const modelo = useMemo(() => modeloForField(name, medida), [name, medida]);
  // La medida modelo se muestra con la misma precisión que los inputs:
  //   - Pulgadas (in): 3 decimales (#.###).
  //   - Milímetros (mm): 2 decimales (#.##).
  // Antes condicionaba por valor (>= 100 → 2 decimales) lo que redondeaba
  // medidas exactas en pulgadas grandes (ej. 150.123 in → 150.12 in).
  const modeloTexto = modelo != null
    ? `${modelo.toFixed(unidad === "in" ? 3 : 2)} ${unidad}`
    : null;
  return (
    <div>
      {modeloTexto && (
        <div
          title="Medida modelo (referencia del catálogo)"
          style={{
            height: 24,
            lineHeight: "22px",
            border: `1px solid ${brand.cyan}`,
            background: "#f0f9ff",
            color: brand.navy,
            borderRadius: 4,
            padding: "0 6px",
            fontSize: 11,
            fontWeight: 600,
            textAlign: "center",
            marginBottom: 2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {modeloTexto}
        </div>
      )}
      <InputNumber
        size="small"
        value={v.get(name) as number | undefined}
        onChange={(val) => v.set(name, val)}
        placeholder={placeholder || ""}
        // En pulgadas: 3 decimales (#.###). En mm: 2 decimales (#.##).
        step={unidad === "in" ? 0.001 : 0.01}
        precision={unidad === "in" ? 3 : 2}
        style={{ width: "100%" }}
        controls={false}
      />
    </div>
  );
}

// Variante de InputMedida para "espesor de cromo" — siempre en MIL (milésimas
// de pulgada, 1 mil = 0.001 in = 0.0254 mm), independiente del sistema de
// medición de la OT. El espesor de cromado en HP&K se mide siempre en mil
// porque los valores típicos van de 0.5 a 20 mil; expresarlo en pulgadas
// (0.0005 in) o mm (0.0127 mm) lleva a errores de lectura.
function InputMedidaMil({
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
  const { medida, unidad } = useContext(MedidasModeloContext);
  const modelo = useMemo(() => modeloForField(name, medida), [name, medida]);
  // El catálogo guarda la medida modelo en in o mm — la convertimos a mil
  // para mostrarla con la misma unidad que el input. Conversiones:
  //   1 in = 1000 mil    →  mil = in * 1000
  //   1 mm = 1/0.0254 mil ≈ 39.3701 mil
  const modeloMil = modelo != null
    ? (unidad === "in" ? modelo * 1000 : modelo / 0.0254)
    : null;
  const modeloTexto = modeloMil != null ? `${modeloMil.toFixed(2)} mil` : null;
  return (
    <div>
      {modeloTexto && (
        <div
          title="Medida modelo (convertida a milésimas de pulgada)"
          style={{
            height: 24,
            lineHeight: "22px",
            border: `1px solid ${brand.cyan}`,
            background: "#f0f9ff",
            color: brand.navy,
            borderRadius: 4,
            padding: "0 6px",
            fontSize: 11,
            fontWeight: 600,
            textAlign: "center",
            marginBottom: 2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {modeloTexto}
        </div>
      )}
      <InputNumber
        size="small"
        value={v.get(name) as number | undefined}
        onChange={(val) => v.set(name, val)}
        placeholder={placeholder || "mil"}
        // Mil acepta 2 decimales (5.25 mil, etc.). Step 0.1 mil.
        step={0.1}
        precision={2}
        style={{ width: "100%" }}
        controls={false}
      />
    </div>
  );
}

// ── Tabla de medidas multi-punto (N puntos cada uno con X,Y) ───────
// Generalización de la antigua TablaA1A4. Default 4 puntos con prefijo "a"
// (compatible hacia atrás). Para Diámetro Vástago se usa con puntos=3 y
// prefijo "b" según el Excel de evaluación ("3 puntos de medidas").
function TablaPuntos({
  prefix,
  datos,
  onChange,
  titulo = "Diametro Interior (A1-A4)",
  puntos = 4,
  letra = "A",
  sufijo = "a",
}: {
  prefix: string;
  datos: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
  titulo?: string;
  puntos?: number;
  letra?: string;
  sufijo?: string;
}) {
  const span = Math.max(4, Math.floor(24 / puntos));
  return (
    <div style={{ marginBottom: 8 }}>
      <Text strong style={{ fontSize: 12 }}>{titulo}</Text>
      <Row gutter={[8, 8]} style={{ marginTop: 4 }}>
        {Array.from({ length: puntos }, (_, idx) => idx + 1).map((i) => (
          <Col span={span} key={i}>
            <div style={{ textAlign: "center", fontWeight: 600, fontSize: 11 }}>{letra}{i}</div>
            <Row gutter={4}>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 10 }}>X</Text>
                <InputMedida name={`${prefix}_${sufijo}${i}_x`} datos={datos} onChange={onChange} />
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 10 }}>Y</Text>
                <InputMedida name={`${prefix}_${sufijo}${i}_y`} datos={datos} onChange={onChange} />
              </Col>
            </Row>
          </Col>
        ))}
      </Row>
    </div>
  );
}

// Alias compatible con el helper original (4 puntos A1-A4) para no romper
// callsites existentes.
function TablaA1A4(props: {
  prefix: string;
  datos: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
}) {
  return <TablaPuntos {...props} titulo="Diametro Interior (A1-A4)" puntos={4} letra="A" sufijo="a" />;
}

// ── Tabla de medidas simples ───────────────────────────────
interface FilaMedida {
  prefix: string;
  label: string;
  tipo: "xy" | "single";
}
// Tabla compacta para Flexión + Espesor de Cromo del vástago (3 puntos: B/C/D).
// Reemplaza la versión anterior de inputs sueltos en columnas.
function TablaFlexionCromo({
  prefix,
  unidad,
  datos,
  onChange,
}: {
  prefix: string;   // ej: "{p}_vas"
  unidad: string;
  datos: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
}) {
  const puntos = ["b", "c", "d"] as const;
  const cell: React.CSSProperties = { border: `1px solid ${brand.border}`, padding: 2 };
  const head: React.CSSProperties = { ...cell, padding: "4px 8px", textAlign: "center", background: brand.bgPage };
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead>
        <tr>
          <th style={{ ...head, textAlign: "left" }}>Parametro</th>
          {puntos.map((s) => <th key={s} style={head}>{s.toUpperCase()}</th>)}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style={{ ...cell, padding: "4px 8px" }}>Flexión [{unidad}]</td>
          {puntos.map((s) => (
            <td key={s} style={cell}>
              <InputMedida name={`${prefix}_flexion_${s}`} datos={datos} onChange={onChange} />
            </td>
          ))}
        </tr>
        <tr>
          <td style={{ ...cell, padding: "4px 8px" }}>Espesor de Cromo [mil]</td>
          {puntos.map((s) => (
            <td key={s} style={cell}>
              <InputMedidaMil name={`${prefix}_esp_cromo_${s}`} datos={datos} onChange={onChange} />
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
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
  // Si NINGUNA fila es xy, ocultamos las columnas X/Y y mostramos una sola
  // "Medida". Esto aplica a Émbolo, Tapa, Émbolo del Acumulador, etc.
  const hayXY = filas.some((f) => f.tipo === "xy");
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead>
        <tr style={{ background: brand.bgPage }}>
          <th style={{ border: `1px solid ${brand.border}`, padding: "4px 8px", textAlign: "left" }}>Parametro</th>
          {hayXY ? (
            <>
              <th style={{ border: `1px solid ${brand.border}`, padding: "4px 8px", textAlign: "center" }}>X</th>
              <th style={{ border: `1px solid ${brand.border}`, padding: "4px 8px", textAlign: "center" }}>Y</th>
            </>
          ) : (
            <th style={{ border: `1px solid ${brand.border}`, padding: "4px 8px", textAlign: "center" }}>Medida</th>
          )}
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
              <td colSpan={hayXY ? 2 : 1} style={{ border: `1px solid ${brand.border}`, padding: 2 }}>
                <InputMedida name={f.prefix} datos={datos} onChange={onChange} />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Radio inline (opciones simples horizontales) ───────────
function RadioInline({
  name,
  label,
  opciones,
  datos,
  onChange,
}: {
  name: string;
  label: string;
  opciones: string[];
  datos: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
}) {
  const v = useValor(datos, onChange);
  const val = v.get(name) as string | undefined;
  return (
    <div style={{ marginBottom: 4 }}>
      <Text strong style={{ fontSize: 12, display: "block" }}>{label}</Text>
      <Radio.Group
        size="small"
        value={val}
        onChange={(e) => v.set(name, e.target.value)}
      >
        {opciones.map((op) => (
          <Radio key={op} value={op} style={{ fontSize: 12 }}>
            {op}
          </Radio>
        ))}
      </Radio.Group>
    </div>
  );
}

// ── Par X/Y con label ─────────────────────────────────────
function ParXY({
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
  return (
    <div style={{ marginBottom: 4 }}>
      <Text strong style={{ fontSize: 12, display: "block" }}>{label}</Text>
      <Row gutter={4}>
        <Col span={12}>
          <Text type="secondary" style={{ fontSize: 10 }}>X</Text>
          <InputMedida name={`${prefix}_x`} datos={datos} onChange={onChange} />
        </Col>
        <Col span={12}>
          <Text type="secondary" style={{ fontSize: 10 }}>Y</Text>
          <InputMedida name={`${prefix}_y`} datos={datos} onChange={onChange} />
        </Col>
      </Row>
    </div>
  );
}

// ── Tabla de checks Bueno/Malo/NA ──────────────────────────
interface ItemCheck {
  key: string;
  label: string;
  // bm = Bueno/Malo, sn = Si/No, ci = Completo/Incompleto
  tipo?: "bm" | "sn" | "ci";
}

// Devuelve los valores almacenados y las etiquetas a mostrar según el tipo.
function opcionesPorTipo(tipo?: "bm" | "sn" | "ci"): { valores: string[]; labels: string[] } {
  if (tipo === "sn") return { valores: ["SI", "NO", "NA"], labels: ["SI", "NO", "N/A"] };
  if (tipo === "ci") return { valores: ["Completo", "Incompleto", "NA"], labels: ["Completo", "Incompleto", "N/A"] };
  return { valores: ["Bueno", "Malo", "NA"], labels: ["Bueno", "Malo", "N/A"] };
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
  // Agrupa items consecutivos por tipo y renderiza una mini-tabla por grupo,
  // así cada grupo muestra el header correcto (Bueno/Malo vs SI/NO vs etc.)
  const grupos: { tipo?: ItemCheck["tipo"]; items: ItemCheck[] }[] = [];
  for (const it of items) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.tipo === it.tipo) ultimo.items.push(it);
    else grupos.push({ tipo: it.tipo, items: [it] });
  }
  return (
    <>
      {grupos.map((g, gi) => {
        const { valores, labels } = opcionesPorTipo(g.tipo);
        return (
          <table key={gi} style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginBottom: gi < grupos.length - 1 ? 6 : 0 }}>
            <thead>
              <tr style={{ background: brand.bgPage }}>
                <th style={{ border: `1px solid ${brand.border}`, padding: "4px 8px", textAlign: "left" }}></th>
                {labels.map((lbl) => (
                  <th key={lbl} style={{ border: `1px solid ${brand.border}`, padding: "4px 8px", textAlign: "center", width: 80 }}>{lbl}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {g.items.map((it) => {
                const name = `${prefix}_${it.key}`;
                const valActual = v.get(name) as string | undefined;
                return (
                  <tr key={it.key}>
                    <td style={{ border: `1px solid ${brand.border}`, padding: "4px 8px" }}>{it.label}</td>
                    {valores.map((op) => (
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
      })}
    </>
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
    <>
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
      <div style={{ marginTop: 12 }}>
        <Text strong style={{ fontSize: 12, color: brand.navy }}>
          Comentarios - {label}
        </Text>
        <TextArea
          rows={2}
          value={(v.get(`${prefix}_comentarios`) as string) || ""}
          onChange={(e) => v.set(`${prefix}_comentarios`, e.target.value)}
          placeholder="Notas adicionales..."
          style={{ marginTop: 4 }}
        />
      </div>
    </>
  );
}

// ── Comprimir imagen a base64 para almacenar en datos_formulario ──
// Estandariza las fotos a una ALTURA fija (8 cm a 96 dpi ≈ 300 px) con
// ancho proporcional para que aspect ratio se mantenga y la imagen no se
// deforme. Decisión del user: todas las fotos del informe deben quedar a
// la misma altura visual de 8 cm; el ancho lo dicta el aspect ratio.
//
// 8 cm = 8 * 96 / 2.54 ≈ 302 px → redondeamos a 300.
// El CSS del Word usa height: 8cm + max-width: 100% (cell) — si una foto
// panorámica se pasa del ancho del cell, ahí sí se cae a max-width y la
// altura baja proporcionalmente. Por eso también limitamos el ANCHO MÁXIMO
// a 800 px (≈ 21 cm) para no inflar el JSON con panorámicas absurdas.
async function comprimirImagen(file: File, targetHeightPx = 300, maxWidthPx = 800, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new window.Image();
      img.onload = () => {
        // Primero escalamos para que el alto matche el target (sin agrandar).
        const scaleH = Math.min(1, targetHeightPx / img.height);
        let w = Math.round(img.width * scaleH);
        let h = Math.round(img.height * scaleH);
        // Si después de escalar por alto el ancho supera el cap, achicamos
        // por ancho (aspect ratio se mantiene en ambos casos).
        if (w > maxWidthPx) {
          const scaleW = maxWidthPx / w;
          w = Math.round(w * scaleW);
          h = Math.round(h * scaleW);
        }
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

  // Procesa el lote ENTERO de un solo onChange para evitar la race condition
  // donde cada beforeUpload por archivo lee `datos` desincronizado y pisa los
  // anteriores. Acá comprimimos todas las imágenes en paralelo y hacemos UN solo
  // setState con el array final.
  const handleUploadBatch = async (files: File[]) => {
    const tipos = files.filter((f) => !f.type.startsWith("image/"));
    if (tipos.length > 0) {
      message.warning(`${tipos.length} archivo(s) ignorado(s) — solo se permiten imágenes`);
    }
    const grandes = files.filter((f) => f.type.startsWith("image/") && f.size > 15 * 1024 * 1024);
    if (grandes.length > 0) {
      message.warning(`${grandes.length} imagen(es) demasiado grande(s) (max 15MB) — ignoradas`);
    }
    const validos = files.filter((f) => f.type.startsWith("image/") && f.size <= 15 * 1024 * 1024);
    if (validos.length === 0) return;

    const actuales = (datos[key] as FotoComponente[] | undefined) || [];
    const espacioDisponible = MAX_FOTOS - actuales.length;
    if (espacioDisponible <= 0) {
      message.warning(`Límite alcanzado (${MAX_FOTOS} fotos por componente)`);
      return;
    }
    if (validos.length > espacioDisponible) {
      message.info(`Solo se agregarán las primeras ${espacioDisponible} imágenes (límite ${MAX_FOTOS})`);
    }
    const aProcesar = validos.slice(0, espacioDisponible);

    try {
      const resultados = await Promise.allSettled(
        aProcesar.map(async (f) => ({ name: f.name, data: await comprimirImagen(f) })),
      );
      const nuevas = resultados
        .filter((r): r is PromiseFulfilledResult<FotoComponente> => r.status === "fulfilled")
        .map((r) => r.value);
      const fallidas = resultados.length - nuevas.length;
      if (fallidas > 0) {
        message.error(`${fallidas} imagen(es) fallaron al procesar`);
      }
      if (nuevas.length > 0) {
        onChange({ ...datos, [key]: [...actuales, ...nuevas] });
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Error al procesar imágenes");
    }
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
        beforeUpload={(file, fileList) => {
          // beforeUpload se dispara una vez por archivo seleccionado. Procesamos
          // el batch entero SOLO en la primera invocación (file === fileList[0])
          // para que sea un único onChange con todas las imágenes.
          if (file === fileList[0]) {
            handleUploadBatch(fileList as File[]);
          }
          return false;
        }}
        showUploadList={false}
        multiple
        accept="image/*"
        disabled={lleno}
      >
        <Button icon={<UploadOutlined />} size="small" disabled={lleno}>
          {lleno ? `Limite alcanzado (${MAX_FOTOS})` : "Agregar fotos (varias a la vez)"}
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
                  background: brand.white,
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

// ─── Hallazgo item rico (del catálogo Excel) ────────────────
// Soporta:
//   - check simple (sólo marca el hallazgo)
//   - severidades (LEVES/REGULARES/GRAVES como radio adicional)
//   - opciones múltiples (CORROSION/PICADURAS/etc. como checkboxes anidados)
//   - campo libre (X:_____ Y:_____ como input de texto)
function HallazgoRichItem({
  prefix,
  item,
  datos,
  onChange,
}: {
  prefix: string;
  item: HallazgoItem;
  datos: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
}) {
  const v = useValor(datos, onChange);
  const baseKey = `${prefix}_${item.key}`;
  const checked = !!v.get(baseKey);
  return (
    <div style={{ marginBottom: 6 }}>
      <Checkbox checked={checked} onChange={(e) => v.set(baseKey, e.target.checked)}>
        <span style={{ fontSize: 12 }}>{item.texto}</span>
      </Checkbox>
      {checked && (
        <div style={{ marginLeft: 22, marginTop: 2 }}>
          {item.severidades && (
            <Radio.Group
              size="small"
              value={v.get(`${baseKey}_sev`) as string | undefined}
              onChange={(e) => v.set(`${baseKey}_sev`, e.target.value)}
            >
              {item.severidades.map((s) => (
                <Radio key={s} value={s} style={{ fontSize: 11 }}>{s}</Radio>
              ))}
            </Radio.Group>
          )}
          {item.opcionesMultiples && (
            <Space wrap size={4}>
              {item.opcionesMultiples.map((op) => {
                const opKey = `${baseKey}_op_${op.replace(/\s+/g, "_").toLowerCase()}`;
                return (
                  <Checkbox
                    key={op}
                    checked={!!v.get(opKey)}
                    onChange={(e) => v.set(opKey, e.target.checked)}
                  >
                    <span style={{ fontSize: 11 }}>{op}</span>
                  </Checkbox>
                );
              })}
            </Space>
          )}
          {item.campoLibre && (
            <Input
              size="small"
              placeholder={item.campoLibre}
              value={(v.get(`${baseKey}_libre`) as string) || ""}
              onChange={(e) => v.set(`${baseKey}_libre`, e.target.value)}
              style={{ width: 280 }}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Hallazgos por catálogo (consume CATALOGOS_EVALUACION) ─────
// Renderiza los grupos del catálogo cuyos keys coincidan con `filtro` (prefix
// match). Ej: filtro="cil_" trae todos los grupos cuyo key empieza con "cil_".
function HallazgosCatalogo({
  modelo,
  filtro,
  prefix,
  titulo,
  datos,
  onChange,
  sujecion,
  flexionRootPrefix,
}: {
  modelo: string;
  filtro: string | string[];
  prefix: string;
  titulo: string;
  datos: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
  // Cuando se pasa, filtra grupos *_cojinete/*_rotula/*_pin dejando solo el
  // correspondiente a la articulación elegida ("Cojinete" | "Rótula" | "Pin directo").
  sujecion?: string;
  // Prefijo base donde están las medidas de flexión {prefix}_flexion_{b,c,d}.
  // Cuando se pasa Y el hallazgo "vas_flexion_barra" está marcado sin medida
  // cargada, mostramos warning. Solo aplica al vástago.
  flexionRootPrefix?: string;
}) {
  const cat = CATALOGOS_EVALUACION[modelo];
  if (!cat) return null;
  const filtros = Array.isArray(filtro) ? filtro : [filtro];
  // Si el filtro termina en "_" hace prefix match, si no hace exact match.
  // Permite: filtro="cil_" → cil_interior, cil_exterior, etc.
  //          filtro="tapa" → exacto, solo "tapa" (no "tapa_posterior")
  let grupos = Object.entries(cat.hallazgos).filter(([k]) =>
    filtros.some((f) => f.endsWith("_") ? k.startsWith(f) : k === f),
  );

  // Filtrar por articulación seleccionada:
  //  - Si elegiste una opción válida, mostrar solo el grupo correspondiente.
  //  - Si NO eligió nada (undefined / ""), OCULTAR los 3 grupos *_cojinete /
  //    *_rotula / *_pin: el user debe elegir primero para ver hallazgos.
  // (Decisión confirmada por el usuario el 2026-05-29.)
  const SUJECION_SLUG: Record<string, string> = {
    "Cojinete": "cojinete",
    "Rótula": "rotula",
    "Pin directo": "pin",
  };
  const todosSlugs = Object.values(SUJECION_SLUG);
  if (sujecion && SUJECION_SLUG[sujecion]) {
    const elegido = SUJECION_SLUG[sujecion];
    const otros = todosSlugs.filter((s) => s !== elegido);
    grupos = grupos.filter(([k]) => !otros.some((s) => k.endsWith(`_${s}`)));
  } else if (sujecion === undefined || sujecion === "") {
    // Nada elegido → ocultar TODOS los grupos de articulación.
    grupos = grupos.filter(([k]) => !todosSlugs.some((s) => k.endsWith(`_${s}`)));
  }

  if (grupos.length === 0) return null;

  // Detecta si hay alguna medida de flexión cargada en la tabla Flexión/Cromo
  // (para warning bajo "Barra presenta flexión").
  const tieneAlgunaMedidaFlexion =
    !!flexionRootPrefix &&
    (["b", "c", "d"] as const).some((s) => {
      const v = datos[`${flexionRootPrefix}_flexion_${s}`];
      return v != null && String(v).trim() !== "";
    });

  return (
    <div style={{ marginTop: 12 }}>
      <Text strong style={{ color: brand.navy }}>{titulo}</Text>
      <Row gutter={[16, 16]} style={{ marginTop: 8 }}>
        {grupos.map(([key, g]) => (
          <Col xs={24} md={12} key={key}>
            <Card size="small" title={<span style={{ fontSize: 11, fontWeight: 700 }}>{g.nombre}</span>}>
              {g.items.map((it) => {
                // Warning: si es "Barra presenta flexión" y el check está marcado
                // pero ninguna medida de Flexión fue cargada en la tabla de arriba.
                const itemBaseKey = `${prefix}_${key}_${it.key}`;
                const isFlexionBarra = it.key === "vas_flexion_barra";
                const checked = !!datos[itemBaseKey];
                const mostrarWarningFlex = isFlexionBarra && checked && flexionRootPrefix && !tieneAlgunaMedidaFlexion;
                return (
                  <div key={it.key}>
                    <HallazgoRichItem
                      prefix={`${prefix}_${key}`}
                      item={it}
                      datos={datos}
                      onChange={onChange}
                    />
                    {mostrarWarningFlex && (
                      <Alert
                        type="warning"
                        showIcon
                        title="Falta cargar las medidas de Flexión (B/C/D) en la tabla de Flexión/Cromo arriba."
                        style={{ marginTop: 4, marginBottom: 8, fontSize: 11, padding: "4px 8px" }}
                      />
                    )}
                  </div>
                );
              })}
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}

// ─── Recomendación item ────────────────────────────────────
function RecomItem({
  prefix,
  item,
  datos,
  onChange,
}: {
  prefix: string;
  item: RecomendacionItem;
  datos: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
}) {
  const v = useValor(datos, onChange);
  const baseKey = `${prefix}_${item.key}`;
  const checked = !!v.get(baseKey);
  return (
    <div style={{ marginBottom: 6 }}>
      <Checkbox checked={checked} onChange={(e) => v.set(baseKey, e.target.checked)}>
        <span style={{ fontSize: 12 }}>{item.texto}</span>
      </Checkbox>
      {checked && (
        <div style={{ marginLeft: 22, marginTop: 2 }}>
          {item.subOpciones && (
            <Radio.Group
              size="small"
              value={v.get(`${baseKey}_sub`) as string | undefined}
              onChange={(e) => v.set(`${baseKey}_sub`, e.target.value)}
            >
              {item.subOpciones.map((s) => (
                <Radio key={s} value={s} style={{ fontSize: 11 }}>{s}</Radio>
              ))}
            </Radio.Group>
          )}
          {item.cantidad && (
            <Space size={4}>
              <Text style={{ fontSize: 11 }}>Cantidad:</Text>
              <InputNumber
                size="small"
                min={0}
                value={v.get(`${baseKey}_cant`) as number | undefined}
                onChange={(val) => v.set(`${baseKey}_cant`, val)}
                style={{ width: 80 }}
              />
            </Space>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Recomendaciones por catálogo (Estándar + No estándar) ─────
// Respeta el flag global `datos.tipo_reparacion_recomendada` que el técnico
// elige en la parte superior del form: "Estándar" / "No Estándar" / "Ambos".
function RecomendacionesCatalogo({
  modelo,
  componente,
  prefix,
  datos,
  onChange,
}: {
  modelo: string;
  componente: string;
  prefix: string;
  datos: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
}) {
  const cat = CATALOGOS_EVALUACION[modelo];
  if (!cat) return null;
  const grupo = cat.recomendaciones[componente];
  if (!grupo) return null;
  const tipo = (datos["tipo_reparacion_recomendada"] as string) || "Ambos";
  const mostrarEst = tipo === "Estándar" || tipo === "Ambos";
  const mostrarNo = tipo === "No Estándar" || tipo === "Ambos";
  // Col span: 24 cuando solo se muestra una, 12 cuando ambas
  const span = mostrarEst && mostrarNo ? 12 : 24;
  return (
    <div style={{ marginTop: 12 }}>
      <Text strong style={{ color: brand.navy }}>Recomendaciones - {grupo.nombre}</Text>
      <Row gutter={[16, 16]} style={{ marginTop: 8 }}>
        {mostrarEst && (
          <Col xs={24} md={span}>
            <Card size="small" title={<span style={{ fontSize: 11, fontWeight: 700, color: brand.cyan }}>ESTÁNDAR</span>}>
              {grupo.estandar.map((it) => (
                <RecomItem key={it.key} prefix={`${prefix}_recom_${componente}_est`} item={it} datos={datos} onChange={onChange} />
              ))}
            </Card>
          </Col>
        )}
        {mostrarNo && (
          <Col xs={24} md={span}>
            <Card size="small" title={<span style={{ fontSize: 11, fontWeight: 700, color: "#cf1322" }}>NO ESTÁNDAR</span>}>
              {grupo.noEstandar.map((it) => (
                <RecomItem key={it.key} prefix={`${prefix}_recom_${componente}_no`} item={it} datos={datos} onChange={onChange} />
              ))}
            </Card>
          </Col>
        )}
      </Row>
    </div>
  );
}

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
            <ImagenReferencia componente="cuerpo_intermedio" label={`Etapa ${i} - Cuerpo Intermedio (LT, A, B, C, L)`} />
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
            <Divider style={{ margin: "8px 0" }}>
              <Text style={{ fontSize: 11 }}>Diámetro Interior (3 lecturas X/Y)</Text>
            </Divider>
            <Row gutter={8}>
              <Col span={8}>
                <ParXY prefix={`${prefix}_etapa${i}_cuerpo_dint_1`} label="Lectura 1" datos={datos} onChange={onChange} />
              </Col>
              <Col span={8}>
                <ParXY prefix={`${prefix}_etapa${i}_cuerpo_dint_2`} label="Lectura 2" datos={datos} onChange={onChange} />
              </Col>
              <Col span={8}>
                <ParXY prefix={`${prefix}_etapa${i}_cuerpo_dint_3`} label="Lectura 3" datos={datos} onChange={onChange} />
              </Col>
            </Row>
            <Divider style={{ margin: "8px 0" }}>
              <Text style={{ fontSize: 11 }}>Diámetro Exterior (3 lecturas X/Y)</Text>
            </Divider>
            <Row gutter={8}>
              <Col span={8}>
                <ParXY prefix={`${prefix}_etapa${i}_cuerpo_dext_1`} label="Lectura 1" datos={datos} onChange={onChange} />
              </Col>
              <Col span={8}>
                <ParXY prefix={`${prefix}_etapa${i}_cuerpo_dext_2`} label="Lectura 2" datos={datos} onChange={onChange} />
              </Col>
              <Col span={8}>
                <ParXY prefix={`${prefix}_etapa${i}_cuerpo_dext_3`} label="Lectura 3" datos={datos} onChange={onChange} />
              </Col>
            </Row>
            <Divider style={{ margin: "8px 0" }}>
              <Text style={{ fontSize: 11 }}>Flexión y Espesor de Cromo (numéricos)</Text>
            </Divider>
            <Row gutter={8}>
              {([1, 2, 3] as const).map((n) => (
                <Col span={4} key={`fx${n}`}>
                  <Text strong style={{ fontSize: 11 }}>Flexión {n}</Text>
                  <InputMedida name={`${prefix}_etapa${i}_cuerpo_flexion_${n}`} datos={datos} onChange={onChange} />
                </Col>
              ))}
              {([1, 2, 3] as const).map((n) => (
                <Col span={4} key={`ec${n}`}>
                  <Text strong style={{ fontSize: 11 }}>Esp. Cromo {n} [mil]</Text>
                  <InputMedidaMil name={`${prefix}_etapa${i}_cuerpo_esp_cromo_${n}`} datos={datos} onChange={onChange} />
                </Col>
              ))}
            </Row>
            <div style={{ marginTop: 12 }}>
              <TablaChecks
                prefix={`${prefix}_etapa${i}`}
                items={[
                  { key: "estado_cromo", label: "Estado de superficie cromada" },
                  { key: "sup_roscada", label: "Estado de superficie Roscada" },
                  { key: "ndt", label: "Pasa NDT", tipo: "sn" },
                  { key: "diam_salida_roscado", label: "Diam. Salida Roscado", tipo: "sn" },
                ]}
                datos={datos}
                onChange={onChange}
              />
            </div>
          </Col>
        </Row>
        <HallazgosCatalogo
          modelo="cil_telescopico"
          filtro="cuerpo_intermedio"
          prefix={`${prefix}_etapa${i}`}
          titulo={`Resultado de evaluación - Etapa ${i} (Cuerpo Intermedio)`}
          datos={datos}
          onChange={onChange}
        />
        <ImagenesComponente
          prefix={`${prefix}_etapa${i}`}
          etiqueta={`Etapa ${i}`}
          datos={datos}
          onChange={onChange}
        />
        <RecomendacionesCatalogo
          modelo="cil_telescopico"
          componente="cuerpo_intermedio"
          prefix={`${prefix}_etapa${i}`}
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
export default function EvaluacionFormulario({
  modelo,
  sistemaMedicion,
  datos,
  onChange,
  readonly = false,
  np = null,
  descripcionCilindro = null,
  marca = null,
  modeloCilindro = null,
}: EvaluacionFormularioProps) {
  const unidad = sistemaMedicion === "Imperial" ? "in" : "mm";

  // Resolver medida modelo aplicable según NP / descripción.
  const medidaModelo = useMemo(
    () => findMedidasModelo({ np, descripcion: descripcionCilindro, marca, modelo: modeloCilindro }),
    [np, descripcionCilindro, marca, modeloCilindro],
  );

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
    freno_servicio_parqueo: "t9",
  };
  const p = prefijos[modelo] || "t1";

  // Renderizar secciones segun tipo
  const renderSecciones = () => {
    // ── CILINDRO TELESCOPICO ── (etapas dinamicas)
    if (modelo === "cil_telescopico") {
      const tipoAnclajeCil = (datos[`${p}_cil_tipo_anclaje`] as string) || "";
      const tipoTapaSec = (datos[`${p}_tipo_tapa_sec`] as string) || "";
      return (
        <>
          {/* Pregunta global de sujeción — aplica a CILINDRO + VÁSTAGO (Excel:
              "PREGUNTAR SI LLEVA COJINETE, ROTULA O PIN DIRECTO"). */}
          <Card
            title={<span style={{ color: brand.navy }}>Tipo de sujeción del cilindro / vástago</span>}
            style={{ marginBottom: 16, background: "#fafcff", border: `1px dashed ${brand.cyan}` }}
            styles={{ body: { padding: 12 } }}
          >
            <RadioInline
              name={`${p}_elem_sujecion`}
              label="¿Lleva cojinete, rótula o pin directo? (aplica al cilindro y al vástago)"
              opciones={["Cojinete", "Rótula", "Pin directo"]}
              datos={datos}
              onChange={onChange}
            />
            <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 4 }}>
              Esta elección determina las preguntas de Cojinete/Rótula/Pin que aparecen
              en los resultados de evaluación del cilindro y el vástago.
            </Text>
          </Card>
          {/* Cilindro principal (botella) */}
          <SeccionNum num={3} titulo="Cilindro Principal (Botella)">
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <ImagenReferencia componente="cilindro" label="Cilindro Principal" />
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
                <Divider style={{ margin: "8px 0" }} />
                <RadioInline
                  name={`${p}_cil_tipo_anclaje`}
                  label="Tipo de anclaje"
                  opciones={["Con Cáncamo", "Sin Cáncamo"]}
                  datos={datos}
                  onChange={onChange}
                />
                {tipoAnclajeCil === "Con Cáncamo" && (
                  <>
                    <Row gutter={8} style={{ marginTop: 8 }}>
                      <Col xs={24} md={12}>
                        <ParXY prefix={`${p}_cil_dojo_f`} label={`Diámetro Ojo F [${unidad}]`} datos={datos} onChange={onChange} />
                      </Col>
                      <Col xs={24} md={12}>
                        <RadioInline
                          name={`${p}_cil_elem_sujecion`}
                          label="Tipo de articulación"
                          opciones={["Cojinete", "Rótula", "Pin directo"]}
                          datos={datos}
                          onChange={onChange}
                        />
                      </Col>
                    </Row>
                    {/* Pin directo: ocultar Diám. Int. G y Ancho de Ojo. */}
                    {datos[`${p}_cil_elem_sujecion`] !== "Pin directo" && (
                      <Row gutter={8}>
                        <Col xs={24} md={12}>
                          <ParXY
                            prefix={`${p}_cil_dint_g`}
                            label={`Diám. Int. ${(datos[`${p}_cil_elem_sujecion`] as string) || "G"} [${unidad}]`}
                            datos={datos}
                            onChange={onChange}
                          />
                        </Col>
                        <Col xs={24} md={12}>
                          <div>
                            <Text strong style={{ fontSize: 12, display: "block" }}>Ancho de Ojo [{unidad}]</Text>
                            <InputMedida name={`${p}_cil_ancho_ojo`} datos={datos} onChange={onChange} />
                          </div>
                        </Col>
                      </Row>
                    )}
                  </>
                )}
                <div style={{ marginTop: 12 }}>
                  <TablaChecks
                    prefix={`${p}_cil`}
                    items={[
                      { key: "tomas", label: "Tomas hidráulicas" },
                      { key: "roscada", label: "Estado de superficie Roscada" },
                      { key: "estado_cancamo", label: "Estado de cancamo" },
                      { key: "ndt", label: "Pasa NDT", tipo: "sn" },
                      { key: "placa_conectores", label: "Placa / Conectores", tipo: "ci" },
                    ]}
                    datos={datos}
                    onChange={onChange}
                  />
                  {/* Comentario libre debajo de Placa / Conectores. */}
                  <div style={{ marginTop: 6 }}>
                    <Text style={{ fontSize: 11, color: "rgba(0,0,0,0.55)" }}>Comentario — Placa / Conectores</Text>
                    <TextArea
                      rows={2}
                      placeholder="Ej: faltan 2 conectores, placa ilegible, etc."
                      value={(datos[`${p}_cil_placa_conectores_coment`] as string) || ""}
                      onChange={(e) => onChange({ ...datos, [`${p}_cil_placa_conectores_coment`]: e.target.value })}
                      style={{ fontSize: 12 }}
                    />
                  </div>
                </div>
              </Col>
            </Row>
            <HallazgosCatalogo modelo={modelo} filtro="cil_" prefix={`${p}_cil`} titulo="Resultado de evaluación - Cilindro Principal" datos={datos} onChange={onChange} sujecion={(datos[`${p}_cil_elem_sujecion`] as string) || (datos[`${p}_elem_sujecion`] as string) || undefined} />
            <ImagenesComponente prefix={`${p}_cil`} etiqueta="Cilindro Principal" datos={datos} onChange={onChange} />
            <RecomendacionesCatalogo modelo={modelo} componente="cilindro" prefix={p} datos={datos} onChange={onChange} />
            <ResultadoComponente prefix={`${p}_cil`} label="Cilindro Principal" datos={datos} onChange={onChange} />
          </SeccionNum>

          {/* Vastago principal */}
          <SeccionNum num={4} titulo="Vástago Principal">
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <ImagenReferencia componente="vastago" label="Vástago Principal" />
              </Col>
              <Col xs={24} md={16}>
                {/* Orden del Excel: A (Espiga) → B (Vástago 3 puntos) → D (Cojinete)
                    → E (Cromo) → F (Total) → G (Espiga). Longitud de Espiga (G)
                    ahora vive dentro de la tabla principal (antes era input suelto). */}
                <TablaMedidas
                  filas={[
                    { prefix: `${p}_vas_desp`, label: `Diametro Espiga (A) [${unidad}]`, tipo: "xy" },
                  ]}
                  datos={datos}
                  onChange={onChange}
                />
                {/* Diámetro Vástago (B) — 3 puntos de medida según Excel de evaluación. */}
                <div style={{ marginTop: 8 }}>
                  <TablaPuntos
                    prefix={`${p}_vas_dext`}
                    datos={datos}
                    onChange={onChange}
                    titulo={`Diametro Vástago (B1-B3) [${unidad}]`}
                    puntos={3}
                    letra="B"
                    sufijo="b"
                  />
                </div>
                <div style={{ marginTop: 8 }}>
                  <TablaMedidas
                    filas={[
                      { prefix: `${p}_vas_dcoj`, label: `Diametro Cojinete (D) [${unidad}]`, tipo: "xy" },
                      { prefix: `${p}_vas_lcro`, label: `Longitud Cromo (E) [${unidad}]`, tipo: "single" },
                      { prefix: `${p}_vas_ltot`, label: `Longitud Total (F) [${unidad}]`, tipo: "single" },
                      { prefix: `${p}_vas_long_espiga_g`, label: `Longitud de Espiga (G) [${unidad}]`, tipo: "single" },
                    ]}
                    datos={datos}
                    onChange={onChange}
                  />
                </div>
                <Divider style={{ margin: "8px 0" }} />
                <Row gutter={8}>
                  <Col xs={24} md={12}>
                    <ParXY prefix={`${p}_vas_dext_ojo_h`} label={`Diám. Ext. Ojo H [${unidad}]`} datos={datos} onChange={onChange} />
                  </Col>
                  <Col xs={24} md={12}>
                    <RadioInline
                      name={`${p}_vas_elem_sujecion`}
                      label="Tipo de articulación"
                      opciones={["Cojinete", "Rótula", "Pin directo"]}
                      datos={datos}
                      onChange={onChange}
                    />
                  </Col>
                </Row>
                {/* Pin directo: ocultar Diám. Int. J y Ancho de Ojo. */}
                <Row gutter={8}>
                  <Col xs={24} md={8}>
                    <ParXY prefix={`${p}_vas_dint_ojo_i`} label={`Diám. Int. Ojo I [${unidad}]`} datos={datos} onChange={onChange} />
                  </Col>
                  {datos[`${p}_vas_elem_sujecion`] !== "Pin directo" && (
                    <>
                      <Col xs={24} md={8}>
                        <ParXY
                          prefix={`${p}_vas_dint_j`}
                          label={`Diám. Int. ${(datos[`${p}_vas_elem_sujecion`] as string) || "J"} [${unidad}]`}
                          datos={datos}
                          onChange={onChange}
                        />
                      </Col>
                      <Col xs={24} md={8}>
                        <div>
                          <Text strong style={{ fontSize: 12, display: "block" }}>Ancho de Ojo [{unidad}]</Text>
                          <InputMedida name={`${p}_vas_ancho_ojo`} datos={datos} onChange={onChange} />
                        </div>
                      </Col>
                    </>
                  )}
                </Row>
                <Divider style={{ margin: "8px 0" }}>
                  <Text style={{ fontSize: 11 }}>Flexión y Espesor de Cromo</Text>
                </Divider>
                <TablaFlexionCromo prefix={`${p}_vas`} unidad={unidad} datos={datos} onChange={onChange} />
                <div style={{ marginTop: 12 }}>
                  <TablaChecks
                    prefix={`${p}_vas`}
                    items={[
                      { key: "estado_cromo", label: "Estado de superficie cromada" },
                      { key: "chk_estado_cancamo", label: "Estado de cancamo" },
                      { key: "ndt", label: "Pasa NDT", tipo: "sn" },
                      { key: "sensor", label: "Sensor", tipo: "sn" },
                    ]}
                    datos={datos}
                    onChange={onChange}
                  />
                </div>
              </Col>
            </Row>
            <HallazgosCatalogo modelo={modelo} filtro="vas_" prefix={`${p}_vas`} titulo="Resultado de evaluación - Vástago Principal" datos={datos} onChange={onChange} sujecion={(datos[`${p}_vas_elem_sujecion`] as string) || (datos[`${p}_elem_sujecion`] as string) || undefined} flexionRootPrefix={`${p}_vas`} />
            <ImagenesComponente prefix={`${p}_vas`} etiqueta="Vástago Principal" datos={datos} onChange={onChange} />
            <RecomendacionesCatalogo modelo={modelo} componente="vastago" prefix={p} datos={datos} onChange={onChange} />
            <ResultadoComponente prefix={`${p}_vas`} label="Vástago Principal" datos={datos} onChange={onChange} />
          </SeccionNum>

          <EtapasTelescopico prefix={p} unidad={unidad} datos={datos} onChange={onChange} />

          {/* Selector entre las dos tapas secundarias — es una o la otra */}
          <Card
            title="Tipo de tapa secundaria"
            style={{ marginBottom: 16, background: "#fafcff", border: `1px dashed ${brand.cyan}` }}
          >
            <RadioInline
              name={`${p}_tipo_tapa_sec`}
              label="Seleccionar el tipo aplicable (es una o la otra)"
              opciones={["Tapa Roscada Secundaria", "Tapa Posterior de Sujeción"]}
              datos={datos}
              onChange={onChange}
            />
          </Card>

          {tipoTapaSec === "Tapa Roscada Secundaria" && (
            <SeccionNum num="T1" titulo="Tapa Roscada Secundaria">
              <Row gutter={16}>
                <Col xs={24} md={8}>
                  <ImagenReferencia componente="tapa" label="Tapa Roscada Secundaria" />
                </Col>
                <Col xs={24} md={16}>
                  <TablaMedidas
                    filas={[
                      { prefix: `${p}_tapa_sec_a`, label: `Diámetro Exterior (A) [${unidad}]`, tipo: "single" },
                      { prefix: `${p}_tapa_sec_b`, label: `Diámetro Interior (B) [${unidad}]`, tipo: "single" },
                      { prefix: `${p}_tapa_sec_c`, label: `Diámetro Sellado (C) [${unidad}]`, tipo: "single" },
                      { prefix: `${p}_tapa_sec_d`, label: `Longitud Total (D) [${unidad}]`, tipo: "single" },
                    ]}
                    datos={datos}
                    onChange={onChange}
                  />
                  <div style={{ marginTop: 12 }}>
                    <TablaChecks
                      prefix={`${p}_tapa_sec`}
                      items={[
                        { key: "sup_roscada", label: "Estado de superficie Roscada" },
                        { key: "ndt", label: "Pasa NDT", tipo: "sn" },
                      ]}
                      datos={datos}
                      onChange={onChange}
                    />
                  </div>
                  {/* Detalle libre - retrocompatibilidad con datos previos */}
                  <div style={{ marginTop: 12 }}>
                    <Text strong style={{ fontSize: 12 }}>Detalle adicional (opcional)</Text>
                    <TextArea
                      rows={2}
                      placeholder="Medidas y condicion..."
                      value={(datos[`${p}_tapa_secundaria`] as string) || ""}
                      onChange={(e) => onChange({ ...datos, [`${p}_tapa_secundaria`]: e.target.value })}
                    />
                  </div>
                </Col>
              </Row>
              <HallazgosCatalogo modelo={modelo} filtro="tapa_roscada" prefix={`${p}_tapa_sec`} titulo="Resultado de evaluación - Tapa Roscada" datos={datos} onChange={onChange} />
              <ImagenesComponente prefix={`${p}_tapa_sec`} etiqueta="Tapa Roscada Secundaria" datos={datos} onChange={onChange} />
              <RecomendacionesCatalogo modelo={modelo} componente="tapa_roscada" prefix={`${p}_tapa_sec`} datos={datos} onChange={onChange} />
              <ResultadoComponente prefix={`${p}_tapa_sec`} label="Tapa Roscada Secundaria" datos={datos} onChange={onChange} />
            </SeccionNum>
          )}

          {tipoTapaSec === "Tapa Posterior de Sujeción" && (
            <SeccionNum num="T2" titulo="Tapa Posterior de Sujeción">
              <Row gutter={16}>
                <Col xs={24} md={8}>
                  <ImagenReferencia componente="tapa" label="Tapa Posterior de Sujeción" />
                </Col>
                <Col xs={24} md={16}>
                  <TablaMedidas
                    filas={[
                      { prefix: `${p}_tapa_post_dsell`, label: `Diám. Sellado [${unidad}]`, tipo: "single" },
                      { prefix: `${p}_tapa_post_dint_ojo`, label: `Diám. Int. Ojo [${unidad}]`, tipo: "single" },
                      { prefix: `${p}_tapa_post_dint_rotula`, label: `Diám. Int. Rótula [${unidad}]`, tipo: "single" },
                      { prefix: `${p}_tapa_post_ancho_ojo`, label: `Ancho de Ojo [${unidad}]`, tipo: "xy" },
                    ]}
                    datos={datos}
                    onChange={onChange}
                  />
                  <div style={{ marginTop: 12 }}>
                    <TablaChecks
                      prefix={`${p}_tapa_post`}
                      items={[
                        { key: "est_soldadura", label: "Est. de soldadura" },
                        { key: "ndt", label: "Pasa NDT", tipo: "sn" },
                      ]}
                      datos={datos}
                      onChange={onChange}
                    />
                  </div>
                  {/* Detalle libre - retrocompatibilidad */}
                  <div style={{ marginTop: 12 }}>
                    <Text strong style={{ fontSize: 12 }}>Detalle adicional (opcional)</Text>
                    <TextArea
                      rows={2}
                      placeholder="Medidas y condicion..."
                      value={(datos[`${p}_tapa_posterior`] as string) || ""}
                      onChange={(e) => onChange({ ...datos, [`${p}_tapa_posterior`]: e.target.value })}
                    />
                  </div>
                </Col>
              </Row>
              <HallazgosCatalogo modelo={modelo} filtro="tapa_posterior" prefix={`${p}_tapa_post`} titulo="Resultado de evaluación - Tapa Posterior" datos={datos} onChange={onChange} />
              <ImagenesComponente prefix={`${p}_tapa_post`} etiqueta="Tapa Posterior" datos={datos} onChange={onChange} />
              <RecomendacionesCatalogo modelo={modelo} componente="tapa_posterior" prefix={`${p}_tapa_post`} datos={datos} onChange={onChange} />
              <ResultadoComponente prefix={`${p}_tapa_post`} label="Tapa Posterior" datos={datos} onChange={onChange} />
            </SeccionNum>
          )}

          {/* Tapa principal (A, B, C, D) — sec final del Excel */}
          <SeccionNum num={5} titulo="Tapa">
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <ImagenReferencia componente="tapa" label="Tapa (A, B, C, D)" />
              </Col>
              <Col xs={24} md={16}>
                <TablaMedidas
                  filas={[
                    { prefix: `${p}_tapa_dext`, label: `Diámetro Exterior (A) [${unidad}]`, tipo: "single" },
                    { prefix: `${p}_tapa_dint`, label: `Diámetro Interior (B) [${unidad}]`, tipo: "single" },
                    { prefix: `${p}_tapa_dsell`, label: `Diámetro Sellado (C) [${unidad}]`, tipo: "single" },
                    { prefix: `${p}_tapa_ltot`, label: `Longitud Total (D) [${unidad}]`, tipo: "single" },
                  ]}
                  datos={datos}
                  onChange={onChange}
                />
                <div style={{ marginTop: 12 }}>
                  <TablaChecks
                    prefix={`${p}_tapa`}
                    items={[
                      { key: "ndt", label: "Pasa NDT", tipo: "sn" },
                      { key: "ext_roscado", label: "Exterior roscado", tipo: "sn" },
                      { key: "sup_roscada", label: "Estado de superficie Roscada" },
                    ]}
                    datos={datos}
                    onChange={onChange}
                  />
                </div>
              </Col>
            </Row>
            <HallazgosCatalogo modelo={modelo} filtro="tapa" prefix={`${p}_tapa`} titulo="Resultado de evaluación - Tapa" datos={datos} onChange={onChange} />
            <ImagenesComponente prefix={`${p}_tapa`} etiqueta="Tapa" datos={datos} onChange={onChange} />
            <RecomendacionesCatalogo modelo={modelo} componente="tapa" prefix={p} datos={datos} onChange={onChange} />
            <ResultadoComponente prefix={`${p}_tapa`} label="Tapa" datos={datos} onChange={onChange} />
          </SeccionNum>

          {/* Émbolo (A, B, D) — sec final del Excel */}
          <SeccionNum num={6} titulo="Émbolo">
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <ImagenReferencia componente="embolo" label="Émbolo (A, B, D)" />
              </Col>
              <Col xs={24} md={16}>
                <TablaMedidas
                  filas={[
                    { prefix: `${p}_emb_dext`, label: `Diámetro Exterior (A) [${unidad}]`, tipo: "single" },
                    { prefix: `${p}_emb_dint`, label: `Diámetro Interior (B) [${unidad}]`, tipo: "single" },
                    { prefix: `${p}_emb_ltot`, label: `Longitud Total (D) [${unidad}]`, tipo: "single" },
                  ]}
                  datos={datos}
                  onChange={onChange}
                />
                <div style={{ marginTop: 12 }}>
                  <TablaChecks
                    prefix={`${p}_emb`}
                    items={[
                      { key: "ndt", label: "Pasa NDT", tipo: "sn" },
                      { key: "int_roscado", label: "Interior roscado", tipo: "sn" },
                      { key: "sup_roscada", label: "Estado de superficie Roscada" },
                    ]}
                    datos={datos}
                    onChange={onChange}
                  />
                </div>
              </Col>
            </Row>
            <HallazgosCatalogo modelo={modelo} filtro="embolo" prefix={`${p}_emb`} titulo="Resultado de evaluación - Émbolo" datos={datos} onChange={onChange} />
            <ImagenesComponente prefix={`${p}_emb`} etiqueta="Émbolo" datos={datos} onChange={onChange} />
            <RecomendacionesCatalogo modelo={modelo} componente="embolo" prefix={p} datos={datos} onChange={onChange} />
            <ResultadoComponente prefix={`${p}_emb`} label="Émbolo" datos={datos} onChange={onChange} />
          </SeccionNum>
        </>
      );
    }

    // ── FRENO DE SERVICIO & PARQUEO ── (tipo 9)
    // 5 sub-secciones: Housing + Spindle (con medidas), Sprocket, Pistón Freno
    // Servicio, Pistón Freno Parqueo (solo hallazgos+recomendaciones). El
    // catálogo está en `evaluacion-catalogos.ts`.
    if (modelo === "freno_servicio_parqueo") {
      return (
        <>
          <SeccionNum num={3} titulo="Housing">
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <ImagenReferencia componente="housing_freno" label="Housing (A, B)" />
              </Col>
              <Col xs={24} md={16}>
                <div style={{ marginBottom: 8 }}>
                  <Text strong style={{ fontSize: 12, display: "block" }}>REF. NP</Text>
                  <Input
                    size="small"
                    value={(datos[`${p}_housing_ref_np`] as string) || ""}
                    onChange={(e) => onChange({ ...datos, [`${p}_housing_ref_np`]: e.target.value })}
                    placeholder="Número de parte"
                    style={{ width: "100%" }}
                  />
                </div>
                <TablaMedidas
                  filas={[
                    { prefix: `${p}_housing_a`, label: `Diámetro Alojamiento 1 (A) [${unidad}]`, tipo: "xy" },
                    { prefix: `${p}_housing_b`, label: `Diámetro Alojamiento 2 (B) [${unidad}]`, tipo: "xy" },
                  ]}
                  datos={datos}
                  onChange={onChange}
                />
              </Col>
            </Row>
            <HallazgosCatalogo modelo={modelo} filtro="housing" prefix={`${p}_housing`} titulo="Resultado de evaluación - Housing" datos={datos} onChange={onChange} />
            <ImagenesComponente prefix={`${p}_housing`} etiqueta="Housing" datos={datos} onChange={onChange} />
            <RecomendacionesCatalogo modelo={modelo} componente="housing" prefix={p} datos={datos} onChange={onChange} />
            <ResultadoComponente prefix={`${p}_housing`} label="Housing" datos={datos} onChange={onChange} />
          </SeccionNum>

          <SeccionNum num={4} titulo="Spindle">
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <ImagenReferencia componente="spindle_freno" label="Spindle (A, L)" />
              </Col>
              <Col xs={24} md={16}>
                <div style={{ marginBottom: 8 }}>
                  <Text strong style={{ fontSize: 12, display: "block" }}>REF. NP</Text>
                  <Input
                    size="small"
                    value={(datos[`${p}_spindle_ref_np`] as string) || ""}
                    onChange={(e) => onChange({ ...datos, [`${p}_spindle_ref_np`]: e.target.value })}
                    placeholder="Número de parte"
                    style={{ width: "100%" }}
                  />
                </div>
                <TablaMedidas
                  filas={[
                    { prefix: `${p}_spindle_a`, label: `Diámetro de asiento de rodamiento (A) [${unidad}]`, tipo: "xy" },
                    { prefix: `${p}_spindle_l`, label: `Longitud (L) [${unidad}]`, tipo: "single" },
                  ]}
                  datos={datos}
                  onChange={onChange}
                />
              </Col>
            </Row>
            <HallazgosCatalogo modelo={modelo} filtro="spindle" prefix={`${p}_spindle`} titulo="Resultado de evaluación - Spindle" datos={datos} onChange={onChange} />
            <ImagenesComponente prefix={`${p}_spindle`} etiqueta="Spindle" datos={datos} onChange={onChange} />
            <RecomendacionesCatalogo modelo={modelo} componente="spindle" prefix={p} datos={datos} onChange={onChange} />
            <ResultadoComponente prefix={`${p}_spindle`} label="Spindle" datos={datos} onChange={onChange} />
          </SeccionNum>

          <SeccionNum num={5} titulo="Sprocket">
            <HallazgosCatalogo modelo={modelo} filtro="sprocket" prefix={`${p}_sprocket`} titulo="Resultado de evaluación - Sprocket" datos={datos} onChange={onChange} />
            <ImagenesComponente prefix={`${p}_sprocket`} etiqueta="Sprocket" datos={datos} onChange={onChange} />
            <RecomendacionesCatalogo modelo={modelo} componente="sprocket" prefix={p} datos={datos} onChange={onChange} />
            <ResultadoComponente prefix={`${p}_sprocket`} label="Sprocket" datos={datos} onChange={onChange} />
          </SeccionNum>

          <SeccionNum num={6} titulo="Pistón Freno Servicio">
            <HallazgosCatalogo modelo={modelo} filtro="piston_servicio" prefix={`${p}_piston_servicio`} titulo="Resultado de evaluación - Pistón Freno Servicio" datos={datos} onChange={onChange} />
            <ImagenesComponente prefix={`${p}_piston_servicio`} etiqueta="Pistón Freno Servicio" datos={datos} onChange={onChange} />
            <RecomendacionesCatalogo modelo={modelo} componente="piston_servicio" prefix={p} datos={datos} onChange={onChange} />
            <ResultadoComponente prefix={`${p}_piston_servicio`} label="Pistón Freno Servicio" datos={datos} onChange={onChange} />
          </SeccionNum>

          <SeccionNum num={7} titulo="Pistón Freno Parqueo">
            <HallazgosCatalogo modelo={modelo} filtro="piston_parqueo" prefix={`${p}_piston_parqueo`} titulo="Resultado de evaluación - Pistón Freno Parqueo" datos={datos} onChange={onChange} />
            <ImagenesComponente prefix={`${p}_piston_parqueo`} etiqueta="Pistón Freno Parqueo" datos={datos} onChange={onChange} />
            <RecomendacionesCatalogo modelo={modelo} componente="piston_parqueo" prefix={p} datos={datos} onChange={onChange} />
            <ResultadoComponente prefix={`${p}_piston_parqueo`} label="Pistón Freno Parqueo" datos={datos} onChange={onChange} />
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
                <ImagenReferencia componente="hub" label="Hub" />
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
            <HallazgosCatalogo modelo={modelo} filtro="hub" prefix={`${p}_hub`} titulo="Resultado de evaluación - Hub" datos={datos} onChange={onChange} />
            <ImagenesComponente prefix={`${p}_hub`} etiqueta="Hub" datos={datos} onChange={onChange} />
            <RecomendacionesCatalogo modelo={modelo} componente="hub" prefix={p} datos={datos} onChange={onChange} />
            <ResultadoComponente prefix={`${p}_hub`} label="Hub" datos={datos} onChange={onChange} />
          </SeccionNum>

          <SeccionNum num={4} titulo="SPINDLE (Muñon)">
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <ImagenReferencia componente="spindle" label="Spindle" />
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
            <HallazgosCatalogo modelo={modelo} filtro="spindle" prefix={`${p}_spi`} titulo="Resultado de evaluación - Spindle" datos={datos} onChange={onChange} />
            <ImagenesComponente prefix={`${p}_spi`} etiqueta="Spindle" datos={datos} onChange={onChange} />
            <RecomendacionesCatalogo modelo={modelo} componente="spindle" prefix={p} datos={datos} onChange={onChange} />
            <ResultadoComponente prefix={`${p}_spi`} label="Spindle" datos={datos} onChange={onChange} />
          </SeccionNum>

          <SeccionNum num={5} titulo="CONJUNTO DE FRENO">
            <Row gutter={16} style={{ marginBottom: 12 }}>
              <Col xs={24} md={8}>
                <ImagenReferencia componente="conjunto_freno" label="Conjunto de Freno" />
              </Col>
            </Row>
            <HallazgosCatalogo modelo={modelo} filtro="conjunto_freno" prefix={`${p}_freno`} titulo="Resultado de evaluación - Conjunto de Freno" datos={datos} onChange={onChange} />
            <ImagenesComponente prefix={`${p}_freno`} etiqueta="Conjunto Freno" datos={datos} onChange={onChange} />
            <RecomendacionesCatalogo modelo={modelo} componente="conjunto_freno" prefix={p} datos={datos} onChange={onChange} />
            <ResultadoComponente prefix={`${p}_freno`} label="Conjunto Freno" datos={datos} onChange={onChange} />
          </SeccionNum>

          <SeccionNum num={6} titulo="CAJA DE FRENO">
            <Row gutter={16} style={{ marginBottom: 12 }}>
              <Col xs={24} md={8}>
                <ImagenReferencia componente="piston_freno" label="Pistón de Freno" />
              </Col>
            </Row>
            <HallazgosCatalogo modelo={modelo} filtro="caja_freno" prefix={`${p}_caja`} titulo="Resultado de evaluación - Caja de Freno" datos={datos} onChange={onChange} />
            <ImagenesComponente prefix={`${p}_caja`} etiqueta="Caja Freno" datos={datos} onChange={onChange} />
            <RecomendacionesCatalogo modelo={modelo} componente="caja_freno" prefix={p} datos={datos} onChange={onChange} />
            <ResultadoComponente prefix={`${p}_caja`} label="Caja Freno" datos={datos} onChange={onChange} />
          </SeccionNum>

          <SeccionNum num={7} titulo="GENERAL">
            <HallazgosCatalogo modelo={modelo} filtro="general" prefix={`${p}_gen`} titulo="Resultado de evaluación - General" datos={datos} onChange={onChange} />
            <ImagenesComponente prefix={`${p}_gen`} etiqueta="General" datos={datos} onChange={onChange} />
            <RecomendacionesCatalogo modelo={modelo} componente="general" prefix={p} datos={datos} onChange={onChange} />
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
              <ImagenReferencia componente="cilindro" label="Acumulador (A,B,C,E)" />
            </Col>
            <Col xs={24} md={16}>
              {/* Singles existentes (compatibilidad con evaluaciones previas) */}
              <TablaMedidas
                filas={[
                  { prefix: `${p}_dext`, label: `Diametro Exterior (A) - simple [${unidad}]`, tipo: "single" },
                  { prefix: `${p}_dint`, label: `Diametro Interior (B) [${unidad}]`, tipo: "single" },
                  { prefix: `${p}_ltot`, label: `Longitud Total (C) [${unidad}]`, tipo: "single" },
                  { prefix: `${p}_dsal1`, label: `Diametro salida 1 - simple [${unidad}]`, tipo: "single" },
                  { prefix: `${p}_dsal2`, label: `Diametro salida 2 - simple [${unidad}]`, tipo: "single" },
                ]}
                datos={datos}
                onChange={onChange}
              />
              <Divider style={{ margin: "8px 0" }}>
                <Text style={{ fontSize: 11 }}>Lecturas X/Y (según Excel)</Text>
              </Divider>
              <TablaMedidas
                filas={[
                  { prefix: `${p}_acumv_dsal1`, label: `Diámetro de Salida 1 (A) [${unidad}]`, tipo: "xy" },
                  { prefix: `${p}_acumv_dsal2`, label: `Diámetro de Salida 2 (B) [${unidad}]`, tipo: "xy" },
                  { prefix: `${p}_acumv_dext`, label: `Diámetro Exterior (C) [${unidad}]`, tipo: "xy" },
                ]}
                datos={datos}
                onChange={onChange}
              />
              <Row gutter={8} style={{ marginTop: 8 }}>
                <Col xs={24} md={8}>
                  <Text strong style={{ fontSize: 12 }}>Volumen (E) [GL]</Text>
                  <InputMedida name={`${p}_acumv_volumen_e`} datos={datos} onChange={onChange} />
                </Col>
              </Row>
              <div style={{ marginTop: 12 }}>
                <TablaChecks
                  prefix={`${p}_acum`}
                  items={[
                    { key: "valv_muelle", label: "Valvula hidraulica de muelle" },
                    { key: "estado_vejiga", label: "Estado vejiga" },
                    { key: "ndt", label: "Pasa NDT", tipo: "sn" },
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
    const esCilHidraulico = modelo === "cil_vastago_simple" || modelo === "cil_pivotado" || modelo === "cil_doble_vastago";
    const esPivotado = modelo === "cil_pivotado";

    // Pregunta global de sujeción — aplica al CILINDRO + VÁSTAGO. El Excel
    // pide "PREGUNTAR SI LLEVA COJINETE, ROTULA O PIN DIRECTO" como pregunta
    // única para ambas secciones. Solo se muestra en cilindros hidráulicos
    // (los acumuladores y suspensiones no tienen vástago con sujeción).
    if (esCilHidraulico) {
      secciones.push(
        <Card
          key="elem_sujecion_global"
          title={<span style={{ color: brand.navy }}>Tipo de sujeción del cilindro / vástago</span>}
          style={{ marginBottom: 16, background: "#fafcff", border: `1px dashed ${brand.cyan}` }}
          styles={{ body: { padding: 12 } }}
        >
          <RadioInline
            name={`${p}_elem_sujecion`}
            label="¿Lleva cojinete, rótula o pin directo? (aplica al cilindro y al vástago)"
            opciones={["Cojinete", "Rótula", "Pin directo"]}
            datos={datos}
            onChange={onChange}
          />
          <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 4 }}>
            Esta elección determina las preguntas de Cojinete/Rótula/Pin que aparecen
            en los resultados de evaluación del cilindro y el vástago.
          </Text>
        </Card>,
      );
    }
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
            {/* Extras de cancamo y sujeción - solo cilindros hidraulicos (CHVS/CHP/CHPDV) */}
            {esCilHidraulico && (
              <>
                <Divider style={{ margin: "8px 0" }}>
                  <Text style={{ fontSize: 11 }}>Cáncamo y tipo de articulación</Text>
                </Divider>
                <Row gutter={8}>
                  <Col xs={24} md={12}>
                    <RadioInline
                      name={`${p}_cil_tipo_cancamo`}
                      label="Tipo de cancamo"
                      opciones={["Convencional", "Concavo"]}
                      datos={datos}
                      onChange={onChange}
                    />
                  </Col>
                  {/* Si se eligió un Tipo de cancamo, NO se muestra Tipo de
                      articulación (son alternativos según el usuario). */}
                  {!datos[`${p}_cil_tipo_cancamo`] && (
                  <Col xs={24} md={12}>
                    <RadioInline
                      name={`${p}_cil_elem_sujecion`}
                      label="Tipo de articulación"
                      opciones={["Cojinete", "Rótula", "Pin directo"]}
                      datos={datos}
                      onChange={onChange}
                    />
                  </Col>
                  )}
                </Row>
                {/* Si el cáncamo es Cóncavo, ocultar Diám. Ojo F, Diám. Int. G y
                    Ancho de Ojo (items 6,7,8 del Excel). Comentario de J.F.Vera
                    en el Excel de hoja de evaluación: "si marca concavo omitir
                    los siguientes items". */}
                {datos[`${p}_cil_tipo_cancamo`] !== "Concavo" && (() => {
                  // Pin directo: ocultar Diám. Int. y Ancho de Ojo (no aplican).
                  const esPin = datos[`${p}_cil_elem_sujecion`] === "Pin directo";
                  return (
                    <Row gutter={8}>
                      <Col xs={24} md={8}>
                        <ParXY prefix={`${p}_cil_dojo_f`} label={`Diámetro Ojo F [${unidad}]`} datos={datos} onChange={onChange} />
                      </Col>
                      {!esPin && (
                        <Col xs={24} md={8}>
                          <ParXY
                            prefix={`${p}_cil_dint_g`}
                            label={`Diám. Int. ${(datos[`${p}_cil_elem_sujecion`] as string) || "G"} [${unidad}]`}
                            datos={datos}
                            onChange={onChange}
                          />
                        </Col>
                      )}
                      {!esPin && (
                        <Col xs={24} md={8}>
                          <div>
                            <Text strong style={{ fontSize: 12, display: "block" }}>Ancho de Ojo [{unidad}]</Text>
                            <InputMedida name={`${p}_cil_ancho_ojo`} datos={datos} onChange={onChange} />
                          </div>
                        </Col>
                      )}
                    </Row>
                  );
                })()}
              </>
            )}
            {/* Extras para CHP: dos lecturas de pivotante */}
            {esPivotado && (
              <>
                <Divider style={{ margin: "8px 0" }}>
                  <Text style={{ fontSize: 11 }}>Pivotante - dos lecturas X/Y</Text>
                </Divider>
                <Row gutter={8}>
                  <Col xs={24} md={12}>
                    <ParXY prefix={`${p}_cil_dext_cojinete_g_1`} label={`Diám. Ext. Cojinete G - Lectura 1 [${unidad}]`} datos={datos} onChange={onChange} />
                  </Col>
                  <Col xs={24} md={12}>
                    <ParXY prefix={`${p}_cil_dext_cojinete_g_2`} label={`Diám. Ext. Cojinete G - Lectura 2 [${unidad}]`} datos={datos} onChange={onChange} />
                  </Col>
                </Row>
                <Row gutter={8}>
                  <Col xs={24} md={12}>
                    <ParXY prefix={`${p}_cil_dext_pivotante_1`} label={`Diám. Ext. Pivotante - Lectura 1 [${unidad}]`} datos={datos} onChange={onChange} />
                  </Col>
                  <Col xs={24} md={12}>
                    <ParXY prefix={`${p}_cil_dext_pivotante_2`} label={`Diám. Ext. Pivotante - Lectura 2 [${unidad}]`} datos={datos} onChange={onChange} />
                  </Col>
                </Row>
                <Row gutter={8}>
                  <Col xs={24} md={8}>
                    <Text strong style={{ fontSize: 12 }}>Longitud de Pivotante [{unidad}]</Text>
                    <InputMedida name={`${p}_cil_long_pivotante`} datos={datos} onChange={onChange} />
                  </Col>
                </Row>
              </>
            )}
            <div style={{ marginTop: 12 }}>
              <TablaChecks
                prefix={`${p}_cil`}
                items={[
                  { key: "tomas", label: "Tomas hidráulicas" },
                  { key: "roscada", label: "Estado de superficie Roscada" },
                  ...(esCilHidraulico ? [{ key: "bocina_stop_1", label: "Bocina STOP 1" }, { key: "bocina_stop_2", label: "Bocina STOP 2" }, { key: "estado_cancamo", label: "Estado de cancamo" }] : []),
                  ...(esPivotado ? [{ key: "estado_trunnion", label: "Estado de trunnion" }, { key: "pasa_estanqueidad", label: "Pasa prueba de estanqueidad", tipo: "sn" as const }] : []),
                  ...(modelo === "cil_doble_vastago" ? [{ key: "estado_soporte_sujecion", label: "Estado de soporte de sujeción" }, { key: "pasa_estanqueidad", label: "Pasa prueba de estanqueidad", tipo: "sn" as const }] : []),
                  ...(modelo === "suspension_delantera" ? [{ key: "est_cartelas", label: "Est. De cartelas" }] : []),
                  { key: "ndt", label: "Pasa NDT", tipo: "sn" as const },
                  { key: "placa_conectores", label: "Placa / Conectores", tipo: "ci" as const },
                ]}
                datos={datos}
                onChange={onChange}
              />
              {/* Comentario libre debajo de Placa / Conectores. */}
              <div style={{ marginTop: 6 }}>
                <Text style={{ fontSize: 11, color: "rgba(0,0,0,0.55)" }}>Comentario — Placa / Conectores</Text>
                <TextArea
                  rows={2}
                  placeholder="Ej: faltan 2 conectores, placa ilegible, etc."
                  value={(datos[`${p}_cil_placa_conectores_coment`] as string) || ""}
                  onChange={(e) => onChange({ ...datos, [`${p}_cil_placa_conectores_coment`]: e.target.value })}
                  style={{ fontSize: 12 }}
                />
              </div>
            </div>
          </Col>
        </Row>
        <HallazgosCatalogo modelo={modelo} filtro={["cil_", "acumulador"]} prefix={`${p}_cil`} titulo="Resultado de evaluación - Cilindro" datos={datos} onChange={onChange} sujecion={(datos[`${p}_cil_elem_sujecion`] as string) || (datos[`${p}_elem_sujecion`] as string) || undefined} />
        <ImagenesComponente prefix={`${p}_cil`} etiqueta="Cilindro" datos={datos} onChange={onChange} />
        <RecomendacionesCatalogo modelo={modelo} componente={modelo === "acum_vejiga" ? "acumulador" : "cilindro"} prefix={p} datos={datos} onChange={onChange} />
        <ResultadoComponente prefix={`${p}_cil`} label="Cilindro" datos={datos} onChange={onChange} />
      </SeccionNum>
    );

    // Vastago (excepto acumuladores)
    if (!modelo.startsWith("acum")) {
      // Opciones cancamo: CHPDV usa Convencional/N-A; CHVS y CHP usan Convencional/Concavo
      const opcionesCancamoVastago = modelo === "cil_doble_vastago"
        ? ["Convencional", "N-A"]
        : ["Convencional", "Concavo"];
      const muestraCancamoVastago = modelo === "cil_vastago_simple" || modelo === "cil_pivotado" || modelo === "cil_doble_vastago";
      secciones.push(
        <SeccionNum key="vas" num={4} titulo="Vastago">
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <ImagenReferencia componente="vastago" label="Vastago (A-J)" />
            </Col>
            <Col xs={24} md={16}>
              {/* Orden del Excel: A (Espiga) → B (Vástago 3 puntos) → D (Cojinete)
                  → E (Cromo) → F (Total) → G (Espiga). Longitud de Espiga (G)
                  ahora vive dentro de la tabla principal (antes era un input suelto). */}
              <TablaMedidas
                filas={[
                  { prefix: `${p}_vas_desp`, label: `Diametro Espiga (A) [${unidad}]`, tipo: "xy" },
                ]}
                datos={datos}
                onChange={onChange}
              />
              {/* Diámetro Vástago (B) — 3 puntos según Excel de evaluación. */}
              <div style={{ marginTop: 8 }}>
                <TablaPuntos
                  prefix={`${p}_vas_dext`}
                  datos={datos}
                  onChange={onChange}
                  titulo={`Diametro Vástago (B1-B3) [${unidad}]`}
                  puntos={3}
                  letra="B"
                  sufijo="b"
                />
              </div>
              <div style={{ marginTop: 8 }}>
                <TablaMedidas
                  filas={[
                    { prefix: `${p}_vas_dcoj`, label: `Diametro Cojinete (D) [${unidad}]`, tipo: "xy" },
                    { prefix: `${p}_vas_lcro`, label: `Longitud Cromo (E) [${unidad}]`, tipo: "single" },
                    { prefix: `${p}_vas_ltot`, label: `Longitud Total (F) [${unidad}]`, tipo: "single" },
                    { prefix: `${p}_vas_long_espiga_g`, label: `Longitud de Espiga (G) [${unidad}]`, tipo: "single" },
                  ]}
                  datos={datos}
                  onChange={onChange}
                />
              </div>
              {muestraCancamoVastago && (
                <>
                  <Divider style={{ margin: "8px 0" }}>
                    <Text style={{ fontSize: 11 }}>Cáncamo y tipo de articulación</Text>
                  </Divider>
                  <Row gutter={8}>
                    <Col xs={24} md={12}>
                      <RadioInline
                        name={`${p}_vas_tipo_cancamo`}
                        label="Tipo de cancamo"
                        opciones={opcionesCancamoVastago}
                        datos={datos}
                        onChange={onChange}
                      />
                    </Col>
                    {/* Si se eligió un Tipo de cancamo, NO se muestra Tipo de
                        articulación (son alternativos según el usuario). */}
                    {!datos[`${p}_vas_tipo_cancamo`] && (
                      <Col xs={24} md={12}>
                        <RadioInline
                          name={`${p}_vas_elem_sujecion`}
                          label="Tipo de articulación"
                          opciones={["Cojinete", "Rótula", "Pin directo"]}
                          datos={datos}
                          onChange={onChange}
                        />
                      </Col>
                    )}
                  </Row>
                </>
              )}
              {/* Si el cáncamo del vástago es Cóncavo, ocultar Diám. Ext. Ojo H,
                  Diám. Int. Ojo I, Diám. Int. J y Ancho de Ojo (items 6,7,8,9
                  del Excel). Mismo comentario de J.F.Vera. */}
              {datos[`${p}_vas_tipo_cancamo`] !== "Concavo" && (() => {
                // Pin directo: ocultar Diám. Int. J y Ancho de Ojo (no aplican).
                const esPin = datos[`${p}_vas_elem_sujecion`] === "Pin directo";
                return (
                  <>
                    <Row gutter={8}>
                      <Col xs={24} md={8}>
                        <ParXY prefix={`${p}_vas_dext_ojo_h`} label={`Diám. Ext. Ojo H [${unidad}]`} datos={datos} onChange={onChange} />
                      </Col>
                      <Col xs={24} md={8}>
                        <ParXY prefix={`${p}_vas_dint_ojo_i`} label={`Diám. Int. Ojo I [${unidad}]`} datos={datos} onChange={onChange} />
                      </Col>
                      {!esPin && (
                        <Col xs={24} md={8}>
                          <ParXY
                            prefix={`${p}_vas_dint_j`}
                            label={`Diám. Int. ${(datos[`${p}_vas_elem_sujecion`] as string) || "J"} [${unidad}]`}
                            datos={datos}
                            onChange={onChange}
                          />
                        </Col>
                      )}
                    </Row>
                    {!esPin && (
                      <Row gutter={8}>
                        <Col xs={24} md={8}>
                          <div>
                            <Text strong style={{ fontSize: 12, display: "block" }}>Ancho de Ojo [{unidad}]</Text>
                            <InputMedida name={`${p}_vas_ancho_ojo`} datos={datos} onChange={onChange} />
                          </div>
                        </Col>
                      </Row>
                    )}
                  </>
                );
              })()}
              <Divider style={{ margin: "8px 0" }}>
                <Text style={{ fontSize: 11 }}>Flexión y Espesor de Cromo</Text>
              </Divider>
              <TablaFlexionCromo prefix={`${p}_vas`} unidad={unidad} datos={datos} onChange={onChange} />
              <div style={{ marginTop: 12 }}>
                <TablaChecks
                  prefix={`${p}_vas`}
                  items={[
                    { key: "estado_cromo", label: "Estado de superficie cromada" },
                    ...(muestraCancamoVastago ? [{ key: "chk_estado_cancamo", label: "Estado de cancamo" }] : []),
                    { key: "ndt", label: "Pasa NDT", tipo: "sn" as const },
                    { key: "sensor", label: "Sensor", tipo: "sn" as const },
                  ]}
                  datos={datos}
                  onChange={onChange}
                />
              </div>
            </Col>
          </Row>
          <HallazgosCatalogo modelo={modelo} filtro="vas_" prefix={`${p}_vas`} titulo="Resultado de evaluación - Vástago" datos={datos} onChange={onChange} sujecion={(datos[`${p}_vas_elem_sujecion`] as string) || (datos[`${p}_elem_sujecion`] as string) || undefined} flexionRootPrefix={`${p}_vas`} />
          <ImagenesComponente prefix={`${p}_vas`} etiqueta="Vastago" datos={datos} onChange={onChange} />
          <RecomendacionesCatalogo modelo={modelo} componente="vastago" prefix={p} datos={datos} onChange={onChange} />
          <ResultadoComponente prefix={`${p}_vas`} label="Vastago" datos={datos} onChange={onChange} />
        </SeccionNum>
      );
    }

    // Tapa — incluye también acum_embolo (acumulador de émbolo tiene tapa)
    if (!modelo.startsWith("acum") || modelo === "acum_embolo") {
      const esDobleVastago = modelo === "cil_doble_vastago";
      secciones.push(
        <SeccionNum key="tapa" num={5} titulo="Tapa">
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <ImagenReferencia componente="tapa" label="Tapa (A, B, C, D)" />
            </Col>
            <Col xs={24} md={16}>
              <TablaMedidas
                filas={[
                  { prefix: `${p}_tapa_dext`, label: `Diametro Exterior (A${esDobleVastago ? "1" : ""}) [${unidad}]`, tipo: "single" },
                  { prefix: `${p}_tapa_dint`, label: `Diametro Interior (B${esDobleVastago ? "1" : ""}) [${unidad}]`, tipo: "single" },
                  { prefix: `${p}_tapa_dsell`, label: `Diametro Sellado (C${esDobleVastago ? "1" : ""}) [${unidad}]`, tipo: "single" },
                  { prefix: `${p}_tapa_ltot`, label: `Longitud Total (D${esDobleVastago ? "1" : ""}) [${unidad}]`, tipo: "single" },
                ]}
                datos={datos}
                onChange={onChange}
              />
              {/* Segundo juego para Cilindro de Doble Vastago */}
              {esDobleVastago && (
                <>
                  <Divider style={{ margin: "8px 0" }}>
                    <Text style={{ fontSize: 11 }}>Tapa - Segundo juego (A2, B2, C2, D2)</Text>
                  </Divider>
                  <TablaMedidas
                    filas={[
                      { prefix: `${p}_tapa_a2`, label: `Diametro Exterior (A2) [${unidad}]`, tipo: "single" },
                      { prefix: `${p}_tapa_b2`, label: `Diametro Interior (B2) [${unidad}]`, tipo: "single" },
                      { prefix: `${p}_tapa_c2`, label: `Diametro Sellado (C2) [${unidad}]`, tipo: "single" },
                      { prefix: `${p}_tapa_d2`, label: `Longitud Total (D2) [${unidad}]`, tipo: "single" },
                    ]}
                    datos={datos}
                    onChange={onChange}
                  />
                </>
              )}
              <div style={{ marginTop: 12 }}>
                <TablaChecks
                  prefix={`${p}_tapa`}
                  items={[
                    { key: "ndt", label: "Pasa NDT", tipo: "sn" },
                    { key: "ext_roscado", label: "Exterior roscado", tipo: "sn" },
                  ]}
                  datos={datos}
                  onChange={onChange}
                />
              </div>
            </Col>
          </Row>
          <HallazgosCatalogo modelo={modelo} filtro="tapa" prefix={`${p}_tapa`} titulo="Resultado de evaluación - Tapa" datos={datos} onChange={onChange} />
          <ImagenesComponente prefix={`${p}_tapa`} etiqueta="Tapa" datos={datos} onChange={onChange} />
          <RecomendacionesCatalogo modelo={modelo} componente="tapa" prefix={p} datos={datos} onChange={onChange} />
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
                  { key: "ndt", label: "Pasa NDT", tipo: "sn" },
                  { key: "int_roscado", label: "Interior roscado", tipo: "sn" },
                ]}
                datos={datos}
                onChange={onChange}
              />
            </div>
          </Col>
        </Row>
        <HallazgosCatalogo modelo={modelo} filtro="embolo" prefix={`${p}_pis`} titulo={`Resultado de evaluación - ${modelo === "acum_embolo" || modelo === "cil_telescopico" ? "Émbolo" : "Pistón"}`} datos={datos} onChange={onChange} />
        <ImagenesComponente prefix={`${p}_pis`} etiqueta={modelo === "acum_embolo" ? "Embolo" : "Piston"} datos={datos} onChange={onChange} />
        <RecomendacionesCatalogo modelo={modelo} componente="embolo" prefix={p} datos={datos} onChange={onChange} />
        <ResultadoComponente prefix={`${p}_pis`} label={modelo === "acum_embolo" || modelo === "cil_telescopico" ? "Émbolo" : "Pistón"} datos={datos} onChange={onChange} />
      </SeccionNum>
    );

    return secciones;
  };

  // Banner informativo cuando se encontró la medida modelo aplicable
  const bannerModelo = medidaModelo ? (
    <Card
      size="small"
      style={{ marginBottom: 12, background: "#f0f5ff", borderColor: brand.cyan }}
      styles={{ body: { padding: 8 } }}
    >
      <Space size={6} wrap>
        <Tag color={brand.cyan} style={{ margin: 0 }}>Medida modelo</Tag>
        <Text strong style={{ fontSize: 12 }}>
          {medidaModelo.descripcion ?? "—"}
        </Text>
        <Text type="secondary" style={{ fontSize: 11 }}>
          {medidaModelo.marca ?? ""} {medidaModelo.modelo ?? ""} · NP {medidaModelo.np1 ?? medidaModelo.np2 ?? "—"}
        </Text>
        <Tag style={{ margin: 0 }}>Unidades: {medidaModelo.sistema}</Tag>
        <Text type="secondary" style={{ fontSize: 11 }}>
          Los valores “ref:” bajo cada input son las medidas modelo de este cilindro.
        </Text>
      </Space>
    </Card>
  ) : np ? (
    <Card
      size="small"
      style={{ marginBottom: 12, background: "#fffbe6", borderColor: "#ffe58f" }}
      styles={{ body: { padding: 8 } }}
    >
      <Text type="secondary" style={{ fontSize: 12 }}>
        ⚠ No se encontró medida modelo para NP <b>{np}</b> en el catálogo MEDIDAS2. Los inputs no muestran referencia.
      </Text>
    </Card>
  ) : null;

  // Selector global de tipo de reparación (Estándar / No Estándar / Ambos).
  // Filtra qué columnas se muestran en cada bloque de Recomendaciones.
  // Default: "Ambos" para no esconder nada hasta que el usuario decida.
  const tipoReparacion = (datos["tipo_reparacion_recomendada"] as string) || "Ambos";
  const bannerTipoReparacion = (
    <Card
      size="small"
      style={{ marginBottom: 12, background: "#fafcff", borderColor: brand.cyan }}
      styles={{ body: { padding: 12 } }}
    >
      <Space size={12} wrap>
        <Text strong style={{ color: brand.navy }}>Tipo de reparación recomendada:</Text>
        <Radio.Group
          value={tipoReparacion}
          onChange={(e) => onChange({ ...datos, tipo_reparacion_recomendada: e.target.value })}
        >
          <Radio value="Estándar">Estándar</Radio>
          <Radio value="No Estándar">No Estándar</Radio>
          <Radio value="Ambos">Ambos</Radio>
        </Radio.Group>
        <Text type="secondary" style={{ fontSize: 11 }}>
          (filtra las recomendaciones mostradas por componente)
        </Text>
      </Space>
    </Card>
  );

  const contextValue = { medida: medidaModelo, unidad };

  if (readonly) {
    // Bloquear todos los inputs internos (Input, InputNumber, Checkbox, Radio, button/Upload)
    // usando <fieldset disabled> que desactiva a nivel DOM.
    return (
      <MedidasModeloContext.Provider value={contextValue}>
        <fieldset
          disabled
          style={{
            border: "none",
            padding: 0,
            margin: 0,
            minWidth: 0,
            opacity: 0.85,
          }}
        >
          {bannerModelo}
          {bannerTipoReparacion}
          {renderSecciones()}
        </fieldset>
      </MedidasModeloContext.Provider>
    );
  }

  return (
    <MedidasModeloContext.Provider value={contextValue}>
      {bannerModelo}
      {bannerTipoReparacion}
      {renderSecciones()}
    </MedidasModeloContext.Provider>
  );
}
