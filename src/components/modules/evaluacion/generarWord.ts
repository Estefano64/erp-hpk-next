import { MODELOS_EVALUACION } from "./EvaluacionFormulario";
import { CATALOGOS_EVALUACION } from "@/lib/evaluacion-catalogos";

interface OTDetalle {
  ot: string | null;
  descripcion: string | null;
  tipo: string | null;
  np: string | null;
  equipo_codigo: string | null;
  cod_rep_flota: string | null;
  cod_rep_posicion: string | null;
  guia_remision: string | null;
  fecha_recepcion: string | null;
  cliente: { nombre_comercial: string | null; razon_social: string } | null;
  codigo_reparacion: { codigo: string } | null;
  fabricante: { nombre: string } | null;
}

interface GenerarWordArgs {
  ot: OTDetalle | null;
  modeloEvaluacion: string;
  sistemaMedicion: string;
  fechaEvaluacion: string;
  evaluadoPor: string;
  supervisor?: string;
  datos: Record<string, unknown>;
  resultadoGeneral: string;
  recomendacionesGeneral: string;
}

const AZUL = "#1C2B5B";
const AZUL_CLARO = "#2c5282";
const GRIS_FONDO = "#f0f4f8";

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// Convertir imagen URL a base64
async function imagenABase64(url: string): Promise<string> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject();
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx?.drawImage(img, 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

// Re-escala una imagen base64 a un ANCHO objetivo (en px) manteniendo aspect
// ratio. CRÍTICO para que Word respete el tamaño: si el píxel mismo de la
// imagen está ya en el tamaño correcto, Word la pinta así por defecto aunque
// ignore CSS/atributos. Devuelve también las dimensiones finales para que el
// HTML pueda setearlas como atributos `width` y `height`.
//
// Aplica a las fotos YA SUBIDAS también — por eso se hace al generar el Word,
// no solo al subirlas. Una foto vieja de 4000 px de ancho se reduce a 302 px
// (= 8 cm @ 96 dpi) acá mismo.
async function resizeABaseWidth(dataUrl: string, targetWidthPx: number): Promise<{ dataUrl: string; w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // No agrandar imágenes ya pequeñas — preservar calidad.
      const scale = Math.min(1, targetWidthPx / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      if (scale === 1) {
        resolve({ dataUrl, w: img.width, h: img.height });
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve({ dataUrl, w: img.width, h: img.height });
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.85), w, h });
    };
    img.onerror = () => resolve({ dataUrl, w: 0, h: 0 });
    img.src = dataUrl;
  });
}

export async function generarWordEvaluacion(args: GenerarWordArgs) {
  const { ot, modeloEvaluacion, sistemaMedicion, fechaEvaluacion, evaluadoPor, supervisor = "", datos: datosRaw, resultadoGeneral, recomendacionesGeneral } = args;

  // PRE-PROCESO: re-escalar TODAS las fotos a 8 cm de ANCHO antes de generar
  // el HTML. Esto es lo que finalmente fuerza el tamaño en Word — el píxel
  // mismo queda a 302 px (= 8 cm a 96 dpi), así Word la pinta a 8 cm aunque
  // ignore todo el CSS y los atributos.
  //
  // Aplica TAMBIÉN a las fotos ya subidas hace tiempo (con tamaños originales
  // grandes) — eso es lo que el user pidió: que las viejas también se
  // achiquen al generar el Word.
  //
  // Copiamos `datos` (no mutamos el original) porque el caller sigue
  // usándolo después del Word.
  const TARGET_W_PX = 302; // 8 cm @ 96 dpi
  const datos: Record<string, unknown> = { ...datosRaw };
  type FotoConDims = { name: string; data: string; w: number; h: number };
  for (const key of Object.keys(datosRaw)) {
    if (!key.endsWith("_imagenes")) continue;
    const arr = datosRaw[key];
    if (!Array.isArray(arr)) continue;
    datos[key] = await Promise.all(
      (arr as { name: string; data: string }[]).map(async (img): Promise<FotoConDims> => {
        const r = await resizeABaseWidth(img.data, TARGET_W_PX);
        return { name: img.name, data: r.dataUrl, w: r.w, h: r.h };
      }),
    );
  }

  const modelo = MODELOS_EVALUACION.find((m) => m.value === modeloEvaluacion);
  const tituloModelo = modelo?.label || "Cilindro hidraulico vastago simple";
  const fechaHoy = new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const otNumero = ot?.ot || "N-D";

  // Cargar imagenes de referencia segun el modelo
  const [logoB64, imgCilindro, imgVastago, imgTapa, imgPiston, imgHub, imgSpindle, imgConjFreno, imgPistonFreno] = await Promise.all([
    imagenABase64("/logo.png"),
    imagenABase64("/Cilindro.png"),
    imagenABase64("/Vastago.png"),
    imagenABase64("/Tapa.png"),
    imagenABase64("/Piston.png"),
    imagenABase64("/Hub.jpeg"),
    imagenABase64("/Spindle.jpeg"),
    imagenABase64("/ConjuntoFreno.jpeg"),
    imagenABase64("/PistonFreno.jpeg"),
  ]);

  const clienteNombre = ot?.cliente?.nombre_comercial ?? ot?.cliente?.razon_social ?? "-";

  // Helper: obtener valor del formulario
  const v = (key: string): string => {
    const val = datos[key];
    if (val === undefined || val === null || val === false) return "";
    return String(val);
  };

  // Helper: tabla de medidas
  const renderMedida = (prefix: string, label: string, tipo: "xy" | "single" = "single"): string => {
    if (tipo === "xy") {
      const x = v(`${prefix}_x`);
      const y = v(`${prefix}_y`);
      return `<tr><td class="label">${esc(label)}</td><td class="editable">${esc(x) || "—"}</td><td class="editable">${esc(y) || "—"}</td></tr>`;
    }
    return `<tr><td class="label">${esc(label)}</td><td class="editable" colspan="2">${esc(v(prefix)) || "—"}</td></tr>`;
  };

  // Helper: tabla de checks (Bueno/Malo/N-A, SI/NO/N-A o Completo/Incompleto/N-A).
  // Cada item -> una fila en la tabla. Se muestra el valor marcado (X en la
  // columna correspondiente).
  //
  // IMPORTANTE: items con distinto `tipo` se agrupan y renderizan en TABLAS
  // SEPARADAS — antes una sola tabla mostraba el header del primer item para
  // todos, lo que hacía que los items SI/NO o Completo/Incompleto cayeran en
  // las columnas equivocadas. La agrupación replica exactamente lo que hace
  // el formulario en pantalla.
  type CheckItem = { key: string; label: string; tipo?: "bm" | "sn" | "ci" };
  const opcionesPorTipo = (tipo?: CheckItem["tipo"]): { vals: string[]; labels: string[] } => {
    if (tipo === "sn") return { vals: ["SI", "NO", "NA"], labels: ["SI", "NO", "N/A"] };
    if (tipo === "ci") return { vals: ["Completo", "Incompleto", "NA"], labels: ["Completo", "Incompleto", "N/A"] };
    return { vals: ["Bueno", "Malo", "NA"], labels: ["Bueno", "Malo", "N/A"] };
  };
  const renderChecksTable = (prefix: string, items: CheckItem[], titulo?: string): string => {
    if (!items.length) return "";
    // En el Word solo deben aparecer los items que el usuario MARCÓ. Filtramos
    // primero — si ningún item del grupo tiene valor seleccionado, no
    // renderizamos la tabla (ni el título) para no inflar el documento con
    // secciones vacías.
    const itemsMarcados = items.filter((it) => {
      const valor = v(`${prefix}_${it.key}`);
      return typeof valor === "string" && valor.length > 0;
    });
    if (!itemsMarcados.length) return "";
    // Agrupar items consecutivos por tipo (mismo criterio que el form).
    const grupos: { tipo?: CheckItem["tipo"]; items: CheckItem[] }[] = [];
    for (const it of itemsMarcados) {
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.tipo === it.tipo) ultimo.items.push(it);
      else grupos.push({ tipo: it.tipo, items: [it] });
    }
    const tablas = grupos
      .map((g) => {
        const { vals, labels } = opcionesPorTipo(g.tipo);
        const rows = g.items
          .map((it) => {
            const valor = v(`${prefix}_${it.key}`);
            const marca = (op: string) => (valor === op ? "X" : "");
            return `<tr>
              <td class="label">${esc(it.label)}</td>
              <td class="editable">${marca(vals[0])}</td>
              <td class="editable">${marca(vals[1])}</td>
              <td class="editable">${marca(vals[2])}</td>
            </tr>`;
          })
          .join("");
        return `<table><thead>
            <tr>
              <th style="width:40%">Verificación</th>
              <th>${esc(labels[0])}</th>
              <th>${esc(labels[1])}</th>
              <th>${esc(labels[2])}</th>
            </tr>
          </thead><tbody>${rows}</tbody></table>`;
      })
      .join("");
    return `${titulo ? `<div class="campo-texto"><b>${esc(titulo)}</b></div>` : ""}${tablas}`;
  };

  // Helper: campo radio (Convencional/Concavo, Cojinete/Rotula/Pin, etc.) -> linea simple
  const renderRadioLinea = (key: string, label: string): string => {
    const val = v(key);
    return `<tr><td class="label">${esc(label)}</td><td class="editable" colspan="2">${esc(val) || "—"}</td></tr>`;
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Helpers basados en CATALOGOS_EVALUACION — antes los hallazgos y
  // recomendaciones se hardcoreaban acá con keys "_g0_0", "_g1_1" que NUNCA
  // matcheaban con lo que guarda el form (que usa item.key del catálogo). Por
  // eso ninguna observación marcada por el evaluador aparecía en el Word.
  // Ahora iteramos sobre el mismo catálogo que usa el form (single source of
  // truth) — si el form lo guarda, el Word lo encuentra.
  // ──────────────────────────────────────────────────────────────────────────

  // Helper: arma el texto de un hallazgo marcado, incorporando la severidad,
  // las opciones múltiples elegidas y el campo libre. Si el texto contiene
  // "____", se reemplaza con las opciones (formato del catálogo original).
  const renderHallazgoMarcado = (itemKey: string, item: {
    texto: string;
    severidades?: string[];
    opcionesMultiples?: string[];
    campoLibre?: string;
  }): string => {
    let texto = item.texto;
    // Opciones múltiples: el form guarda `${itemKey}_op_<slug>` donde slug es
    // el nombre minúsculas y espacios→guion bajo.
    if (item.opcionesMultiples) {
      const elegidas = item.opcionesMultiples.filter((op) =>
        !!datos[`${itemKey}_op_${op.replace(/\s+/g, "_").toLowerCase()}`],
      );
      if (elegidas.length > 0) {
        if (texto.includes("____")) texto = texto.replace("____", elegidas.join(", "));
        else texto += ` (${elegidas.join(", ")})`;
      }
    }
    // Campo libre (ej. "Indicar medida")
    if (item.campoLibre) {
      const libre = v(`${itemKey}_libre`);
      if (libre) {
        if (texto.includes("____")) texto = texto.replace("____", libre);
        else texto += ` — ${libre}`;
      }
    }
    // Severidad (al final, entre paréntesis)
    if (item.severidades) {
      const sev = v(`${itemKey}_sev`);
      if (sev) texto += ` [${sev}]`;
    }
    return esc(texto);
  };

  // Renderiza los hallazgos del CATÁLOGO para un componente. Solo aparecen los
  // que el evaluador marcó. `componentePrefix` es lo mismo que pasa el form a
  // HallazgosCatalogo en `prefix=` (ej. `${p}_cil`); `filtros` son los prefijos
  // de grupo que matchean este componente (ej. ["cil_"] para cilindro).
  // `sujecion` filtra los grupos *_cojinete/_rotula/_pin para mostrar solo el
  // que el usuario eligió en la pregunta global (mismo criterio del form).
  const renderHallazgosCatalogo = (
    componentePrefix: string,
    filtros: string[],
    sujecion?: string,
  ): string => {
    const cat = CATALOGOS_EVALUACION[modeloEvaluacion];
    if (!cat) return "";
    const SUJECION_SLUG: Record<string, string> = {
      "Cojinete": "cojinete",
      "Rótula": "rotula",
      "Pin directo": "pin",
    };
    const todosSlugs = Object.values(SUJECION_SLUG);
    const elegido = sujecion ? SUJECION_SLUG[sujecion] : undefined;

    const lineas: string[] = [];
    for (const [groupKey, group] of Object.entries(cat.hallazgos)) {
      // Filtro por prefijo de grupo
      if (!filtros.some((f) => groupKey.startsWith(f))) continue;
      // Filtro por sujeción (cojinete/rotula/pin)
      const esGrupoSujecion = todosSlugs.some((s) => groupKey.endsWith(`_${s}`));
      if (esGrupoSujecion) {
        if (!elegido) continue;                // sin elección → ocultar todos
        if (!groupKey.endsWith(`_${elegido}`)) continue; // solo el elegido
      }
      for (const item of group.items) {
        const itemKey = `${componentePrefix}_${groupKey}_${item.key}`;
        if (!datos[itemKey]) continue;
        lineas.push(`<li>${renderHallazgoMarcado(itemKey, item)}</li>`);
      }
    }
    if (lineas.length === 0) return "";
    return `<div class="hallazgos"><b>Hallazgos encontrados:</b><ul>${lineas.join("")}</ul></div>`;
  };

  // Renderiza recomendaciones del CATÁLOGO (estándar + no estándar) para un
  // componente. El form usa el patrón `${p}_recom_${componente}_est_${itemKey}`
  // y `${p}_recom_${componente}_no_${itemKey}` — replicamos eso.
  const renderRecomendacionesCatalogo = (componente: string): string => {
    const cat = CATALOGOS_EVALUACION[modeloEvaluacion];
    if (!cat) return "";
    const recoms = cat.recomendaciones[componente];
    if (!recoms) return "";

    const linea = (subPrefix: "est" | "no", item: {
      key: string;
      texto: string;
      subOpciones?: string[];
      cantidad?: boolean;
      omitirSubOpEnInforme?: boolean;
    }): string | null => {
      const base = `${p}_recom_${componente}_${subPrefix}_${item.key}`;
      if (!datos[base]) return null;
      let texto = item.texto;
      // Sub-opción (radio, ej. COJINETE / ROTULA)
      if (item.subOpciones && !item.omitirSubOpEnInforme) {
        const sub = v(`${base}_sub`);
        if (sub) {
          if (texto.includes("____")) texto = texto.replace("____", sub);
          else texto += ` (${sub})`;
        }
      }
      // Cantidad numérica (ej. "REALIZAR CAMBIO DE ___ PERNOS")
      if (item.cantidad) {
        const cant = v(`${base}_cant`);
        if (cant) {
          if (texto.includes("___")) texto = texto.replace("___", cant);
          else texto += ` × ${cant}`;
        }
      }
      return `<li>${esc(texto)}</li>`;
    };

    const lineasEst = recoms.estandar
      .map((it) => linea("est", it))
      .filter((x): x is string => x !== null);
    const lineasNo = recoms.noEstandar
      .map((it) => linea("no", it))
      .filter((x): x is string => x !== null);

    if (lineasEst.length === 0 && lineasNo.length === 0) return "";
    let html = `<div class="campo-texto"><b>Recomendaciones — ${esc(recoms.nombre)}</b></div>`;
    if (lineasEst.length > 0) {
      html += `<div class="recom-grupo"><div class="recom-sub">Estándar</div><ul>${lineasEst.join("")}</ul></div>`;
    }
    if (lineasNo.length > 0) {
      html += `<div class="recom-grupo"><div class="recom-sub">No estándar</div><ul>${lineasNo.join("")}</ul></div>`;
    }
    return html;
  };

  // Helper: render de imagenes subidas (max 6). SIN tabla — bloques continuos.
  // Cada imagen ya viene re-escalada a 302 px de ANCHO (= 8 cm) por el
  // pre-proceso arriba; el alto es proporcional para no deformar.
  //
  // Triple seguro contra "imágenes salen en otro tamaño":
  //   1) Píxel real de la imagen: 302 px de ancho (re-escalada). Word
  //      renderiza al tamaño embedido por default.
  //   2) HTML attrs width/height: redundantes con el tamaño embedido. Word
  //      los respeta aunque ignore CSS.
  //   3) CSS width: 8cm + height: auto: para navegadores modernos y casos edge.
  const renderImagenesSubidas = (prefix: string): string => {
    const imgs = ((datos[`${prefix}_imagenes`] as { name: string; data: string; w?: number; h?: number }[] | undefined) || []).slice(0, 6);
    if (!imgs.length) return "";
    const imgStyle = "width:8cm;height:auto;";
    const blocks = imgs.map((img) => {
      const w = img.w && img.w > 0 ? img.w : 302;
      const h = img.h && img.h > 0 ? img.h : 226;  // fallback ratio 4:3
      // Sin caption — el user pidió que las imágenes vayan continuas sin
      // texto de nombre debajo.
      return `<div class="foto-bloque"><img src="${img.data}" width="${w}" height="${h}" style="${imgStyle}" /></div>`;
    }).join("");
    return `
      <div class="fotos-subidas">
        <div class="fotos-titulo">Evidencia fotografica</div>
        ${blocks}
      </div>
    `;
  };

  // Helper: seccion con imagen y medidas
  const renderSeccionComponente = (
    numSec: number,
    titulo: string,
    imgSrc: string,
    imgLabel: string,
    medidasHTML: string,
    prefix: string,
    hallazgosChecks: { key: string; texto: string }[] = []
  ): string => {
    const resultado = v(`${prefix}_resultado`);
    const recomendaciones = v(`${prefix}_recomendaciones`);
    const hallazgosMarcados = hallazgosChecks.filter((h) => v(h.key));

    // Si hay imagen Y medidas: layout lado a lado (imagen | tabla)
    // Si solo hay imagen: imagen centrada
    // Si solo hay medidas: tabla a ancho completo
    let cabeceraHTML = "";
    if (imgSrc && medidasHTML) {
      cabeceraHTML = `
        <table class="seccion-layout"><tr>
          <td class="seccion-img-cell">
            <div class="img-ref-wrap"><img src="${imgSrc}" /><div class="img-caption">Referencia: ${esc(imgLabel)}</div></div>
          </td>
          <td class="seccion-med-cell">
            <table><thead><tr><th>Parametro</th><th>X</th><th>Y</th></tr></thead><tbody>${medidasHTML}</tbody></table>
          </td>
        </tr></table>
      `;
    } else if (imgSrc) {
      cabeceraHTML = `<div class="img-ref-wrap solo"><img src="${imgSrc}" /><div class="img-caption">Referencia: ${esc(imgLabel)}</div></div>`;
    } else if (medidasHTML) {
      cabeceraHTML = `<table><thead><tr><th>Parametro</th><th>X</th><th>Y</th></tr></thead><tbody>${medidasHTML}</tbody></table>`;
    }

    return `
      <h2><span class="section-num">${numSec}</span> ${esc(titulo)}</h2>
      ${cabeceraHTML}
      ${
        hallazgosMarcados.length > 0
          ? `<div class="hallazgos"><b>Hallazgos encontrados:</b><ul>${hallazgosMarcados.map((h) => `<li>${esc(h.texto)}</li>`).join("")}</ul></div>`
          : ""
      }
      ${renderImagenesSubidas(prefix)}
      ${resultado ? `<div class="campo-texto"><b>Resultado</b><div class="textarea-box">${esc(resultado)}</div></div>` : ""}
      ${recomendaciones ? `<div class="campo-texto"><b>Recomendaciones</b><div class="textarea-box">${esc(recomendaciones)}</div></div>` : ""}
    `;
  };

  // Prefijo del modelo — DEBE matchear exactamente el map del form
  // (EvaluacionFormulario.tsx ~línea 1390). Si se desalinea, el form guarda
  // bajo "t9_..." pero generarWord busca bajo "t1_..." y NO encuentra nada.
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
  const p = prefijos[modeloEvaluacion] || "t1";

  // Armar secciones
  let seccionesHTML = "";
  let numSec = 2;
  let saltarEstandar = false;

  // ── TELESCOPICO: Cilindro principal, Vastago principal, Etapas dinamicas, Tapas secundarias ──
  if (modeloEvaluacion === "cil_telescopico") {
    // ─── Cilindro principal ───
    const tipoAnclajeCil = v(`${p}_cil_tipo_anclaje`);
    const conCancamo = tipoAnclajeCil === "Con Cáncamo";
    const medidasCilTelBase = [
      renderMedida(`${p}_cil_a1`, "A1 (Interior)", "xy"),
      renderMedida(`${p}_cil_a2`, "A2 (Interior)", "xy"),
      renderMedida(`${p}_cil_a3`, "A3 (Interior)", "xy"),
      renderMedida(`${p}_cil_a4`, "A4 (Interior)", "xy"),
      renderMedida(`${p}_cil_dsal`, "Diametro Salida (B)", "xy"),
      renderMedida(`${p}_cil_dext`, "Diametro Exterior (C)", "xy"),
      renderMedida(`${p}_cil_lbru`, "Longitud Bruñido (D)", "single"),
      renderMedida(`${p}_cil_ltot`, "Longitud Total (E)", "single"),
      renderRadioLinea(`${p}_cil_tipo_anclaje`, "Tipo de anclaje"),
    ].join("");
    const medidasCilTelExtra = conCancamo
      ? [
          renderMedida(`${p}_cil_dojo_f`, "Diámetro Ojo F", "xy"),
          renderRadioLinea(`${p}_cil_elem_sujecion`, "Elemento de sujeción"),
          renderMedida(`${p}_cil_dint_g`, "Diám. Int. G", "xy"),
          renderMedida(`${p}_cil_ancho_ojo`, "Ancho de Ojo", "xy"),
        ].join("")
      : "";
    seccionesHTML += renderSeccionComponente(
      numSec++,
      "Cilindro Principal (Botella)",
      imgCilindro,
      "Cilindro Principal",
      medidasCilTelBase + medidasCilTelExtra,
      `${p}_cil`,
      []
    );
    seccionesHTML += renderChecksTable(
      `${p}_cil`,
      [
        { key: "tomas", label: "Tomas" },
        { key: "roscada", label: "Estado de sup. Roscada" },
        { key: "estado_cancamo", label: "Estado de cáncamo" },
        { key: "ndt", label: "Pasa a NDT", tipo: "sn" },
        { key: "placa_conectores", label: "Placa / Conectores", tipo: "ci" },
      ],
      "Checks - Cilindro Principal"
    );
    {
      const placaComentTel = v(`${p}_cil_placa_conectores_coment`);
      if (placaComentTel) {
        seccionesHTML += `<div class="campo-texto"><b>Comentario — Placa / Conectores</b><div class="textarea-box">${esc(placaComentTel)}</div></div>`;
      }
    }
    // Hallazgos + recomendaciones del catálogo para Cilindro Principal
    {
      const sujCil = v(`${p}_cil_elem_sujecion`) || v(`${p}_elem_sujecion`) || undefined;
      seccionesHTML += renderHallazgosCatalogo(`${p}_cil`, ["cil_"], sujCil);
      seccionesHTML += renderRecomendacionesCatalogo("cilindro");
    }

    // ─── Vastago principal ───
    const medidasVasTel = [
      renderMedida(`${p}_vas_desp`, "Diametro Espiga (A)", "xy"),
      renderMedida(`${p}_vas_dext`, "Diametro Exterior (B)", "xy"),
      renderMedida(`${p}_vas_dsell`, "Diametro Sellado (C)", "xy"),
      renderMedida(`${p}_vas_dcoj`, "Diametro Cojinete (D)", "xy"),
      renderMedida(`${p}_vas_lcro`, "Longitud Cromo (E)", "single"),
      renderMedida(`${p}_vas_ltot`, "Longitud Total (F)", "single"),
      renderMedida(`${p}_vas_long_espiga_g`, "Longitud de Espiga G", "single"),
      renderMedida(`${p}_vas_dext_ojo_h`, "Diám. Ext. Ojo H", "xy"),
      renderRadioLinea(`${p}_vas_elem_sujecion`, "Elemento de sujeción"),
      renderMedida(`${p}_vas_dint_ojo_i`, "Diám. Int. Ojo I", "xy"),
      renderMedida(`${p}_vas_dint_j`, "Diám. Int. J", "xy"),
      renderMedida(`${p}_vas_ancho_ojo`, "Ancho de Ojo", "xy"),
    ].join("");
    seccionesHTML += renderSeccionComponente(
      numSec++,
      "Vástago Principal",
      imgVastago,
      "Vástago Principal",
      medidasVasTel,
      `${p}_vas`,
      []
    );
    // Flexion / Esp. Cromo vastago principal
    const tflxB = v(`${p}_vas_flexion_b`);
    const tflxC = v(`${p}_vas_flexion_c`);
    const tflxD = v(`${p}_vas_flexion_d`);
    const tecB = v(`${p}_vas_esp_cromo_b`);
    const tecC = v(`${p}_vas_esp_cromo_c`);
    const tecD = v(`${p}_vas_esp_cromo_d`);
    if (tflxB || tflxC || tflxD || tecB || tecC || tecD) {
      seccionesHTML += `
        <div class="campo-texto"><b>Flexión y Espesor de Cromo (Vástago Principal)</b></div>
        <table><thead>
          <tr><th>Parámetro</th><th>B</th><th>C</th><th>D</th></tr>
        </thead><tbody>
          <tr><td class="label">Flexión</td><td class="editable">${esc(tflxB) || "—"}</td><td class="editable">${esc(tflxC) || "—"}</td><td class="editable">${esc(tflxD) || "—"}</td></tr>
          <tr><td class="label">Esp. Cromo [mil]</td><td class="editable">${esc(tecB) || "—"}</td><td class="editable">${esc(tecC) || "—"}</td><td class="editable">${esc(tecD) || "—"}</td></tr>
        </tbody></table>
      `;
    }
    seccionesHTML += renderChecksTable(
      `${p}_vas`,
      [
        { key: "estado_cromo", label: "Estado del cromo" },
        { key: "chk_estado_cancamo", label: "Estado de cáncamo" },
        { key: "ndt", label: "Pasa a NDT", tipo: "sn" },
        { key: "sensor", label: "Sensor", tipo: "sn" },
      ],
      "Checks - Vástago Principal"
    );
    // Hallazgos + recomendaciones del catálogo para Vástago Principal
    {
      const sujVas = v(`${p}_vas_elem_sujecion`) || v(`${p}_elem_sujecion`) || undefined;
      seccionesHTML += renderHallazgosCatalogo(`${p}_vas`, ["vas_"], sujVas);
      seccionesHTML += renderRecomendacionesCatalogo("vastago");
    }

    // ─── Etapas ───
    const numEtapas = Number(datos[`${p}_num_etapas`] || 2);
    for (let i = 1; i <= numEtapas; i++) {
      const medidas = [
        renderMedida(`${p}_etapa${i}_cil_a1`, "A1 (Interior)", "xy"),
        renderMedida(`${p}_etapa${i}_cil_a2`, "A2 (Interior)", "xy"),
        renderMedida(`${p}_etapa${i}_cil_a3`, "A3 (Interior)", "xy"),
        renderMedida(`${p}_etapa${i}_cil_a4`, "A4 (Interior)", "xy"),
        renderMedida(`${p}_etapa${i}_dext`, "Diametro Exterior (B)", "xy"),
        renderMedida(`${p}_etapa${i}_dcro`, "Diametro Cromo (C)", "xy"),
        renderMedida(`${p}_etapa${i}_lcro`, "Longitud Cromo (D)", "single"),
        renderMedida(`${p}_etapa${i}_lbru`, "Longitud Bruñido (E)", "single"),
        renderMedida(`${p}_etapa${i}_ltot`, "Longitud Total (F)", "single"),
      ].join("");
      seccionesHTML += renderSeccionComponente(numSec++, `Etapa ${i} - Cuerpo intermedio`, imgCilindro, `Etapa ${i}`, medidas, `${p}_etapa${i}`, []);

      // Cuerpo intermedio: 3 lecturas X/Y (Interior y Exterior)
      const dintRows = [1, 2, 3]
        .map((n) => {
          const x = v(`${p}_etapa${i}_cuerpo_dint_${n}_x`);
          const y = v(`${p}_etapa${i}_cuerpo_dint_${n}_y`);
          return `<tr><td class="label">Diám. Interior - Lectura ${n}</td><td class="editable">${esc(x) || "—"}</td><td class="editable">${esc(y) || "—"}</td></tr>`;
        })
        .join("");
      const dextRows = [1, 2, 3]
        .map((n) => {
          const x = v(`${p}_etapa${i}_cuerpo_dext_${n}_x`);
          const y = v(`${p}_etapa${i}_cuerpo_dext_${n}_y`);
          return `<tr><td class="label">Diám. Exterior - Lectura ${n}</td><td class="editable">${esc(x) || "—"}</td><td class="editable">${esc(y) || "—"}</td></tr>`;
        })
        .join("");
      seccionesHTML += `
        <div class="campo-texto"><b>Cuerpo Intermedio - 3 lecturas X/Y (Etapa ${i})</b></div>
        <table><thead>
          <tr><th>Parámetro</th><th>X</th><th>Y</th></tr>
        </thead><tbody>${dintRows}${dextRows}</tbody></table>
      `;

      // Flexion y Esp. Cromo 1/2/3
      const cflx1 = v(`${p}_etapa${i}_cuerpo_flexion_1`);
      const cflx2 = v(`${p}_etapa${i}_cuerpo_flexion_2`);
      const cflx3 = v(`${p}_etapa${i}_cuerpo_flexion_3`);
      const cec1 = v(`${p}_etapa${i}_cuerpo_esp_cromo_1`);
      const cec2 = v(`${p}_etapa${i}_cuerpo_esp_cromo_2`);
      const cec3 = v(`${p}_etapa${i}_cuerpo_esp_cromo_3`);
      if (cflx1 || cflx2 || cflx3 || cec1 || cec2 || cec3) {
        seccionesHTML += `
          <div class="campo-texto"><b>Flexión y Espesor de Cromo (Etapa ${i})</b></div>
          <table><thead>
            <tr><th>Parámetro</th><th>1</th><th>2</th><th>3</th></tr>
          </thead><tbody>
            <tr><td class="label">Flexión</td><td class="editable">${esc(cflx1) || "—"}</td><td class="editable">${esc(cflx2) || "—"}</td><td class="editable">${esc(cflx3) || "—"}</td></tr>
            <tr><td class="label">Esp. Cromo [mil]</td><td class="editable">${esc(cec1) || "—"}</td><td class="editable">${esc(cec2) || "—"}</td><td class="editable">${esc(cec3) || "—"}</td></tr>
          </tbody></table>
        `;
      }

      // Checks por etapa
      seccionesHTML += renderChecksTable(
        `${p}_etapa${i}`,
        [
          { key: "estado_cromo", label: "Estado del cromo" },
          { key: "sup_roscada", label: "Est. de sup. Roscada" },
          { key: "ndt", label: "Pasa a NDT", tipo: "sn" },
          { key: "diam_salida_roscado", label: "Diám. Salida Roscado", tipo: "sn" },
        ],
        `Checks - Etapa ${i}`
      );
    }

    // ─── Tapa Roscada Secundaria (estructurada) ───
    seccionesHTML += renderSeccionComponente(
      numSec++,
      "Tapa Roscada Secundaria",
      imgTapa,
      "Tapa Roscada Secundaria",
      [
        renderMedida(`${p}_tapa_sec_a`, "Medida A", "single"),
        renderMedida(`${p}_tapa_sec_b`, "Medida B", "single"),
        renderMedida(`${p}_tapa_sec_c`, "Medida C", "single"),
        renderMedida(`${p}_tapa_sec_d`, "Medida D", "single"),
      ].join(""),
      `${p}_tapa_sec`,
      []
    );
    seccionesHTML += renderChecksTable(
      `${p}_tapa_sec`,
      [
        { key: "sup_roscada", label: "Est. de sup. Roscada" },
        { key: "ndt", label: "Pasa a NDT", tipo: "sn" },
      ],
      "Checks - Tapa Roscada Secundaria"
    );
    const tapaSec = v(`${p}_tapa_secundaria`);
    if (tapaSec) {
      seccionesHTML += `<div class="campo-texto"><b>Detalle adicional - Tapa roscada secundaria</b><div class="textarea-box">${esc(tapaSec)}</div></div>`;
    }
    // Hallazgos del catálogo: telescópico usa grupo "tapa_roscada"
    seccionesHTML += renderHallazgosCatalogo(`${p}_tapa_sec`, ["tapa_roscada"]);

    // ─── Tapa Posterior de Sujeción (estructurada) ───
    seccionesHTML += renderSeccionComponente(
      numSec++,
      "Tapa Posterior de Sujeción",
      imgTapa,
      "Tapa Posterior de Sujeción",
      [
        renderMedida(`${p}_tapa_post_dsell`, "Diám. Sellado", "single"),
        renderMedida(`${p}_tapa_post_dint_ojo`, "Diám. Int. Ojo", "single"),
        renderMedida(`${p}_tapa_post_dint_rotula`, "Diám. Int. Rótula", "single"),
        renderMedida(`${p}_tapa_post_ancho_ojo`, "Ancho de Ojo", "single"),
      ].join(""),
      `${p}_tapa_post`,
      []
    );
    seccionesHTML += renderChecksTable(
      `${p}_tapa_post`,
      [
        { key: "est_soldadura", label: "Est. de soldadura" },
        { key: "ndt", label: "Pasa a NDT", tipo: "sn" },
      ],
      "Checks - Tapa Posterior"
    );
    const tapaPost = v(`${p}_tapa_posterior`);
    if (tapaPost) {
      seccionesHTML += `<div class="campo-texto"><b>Detalle adicional - Tapa posterior</b><div class="textarea-box">${esc(tapaPost)}</div></div>`;
    }
    // Hallazgos del catálogo: telescópico usa grupo "tapa_posterior"
    seccionesHTML += renderHallazgosCatalogo(`${p}_tapa_post`, ["tapa_posterior"]);

    // ─── Tapa (main) ───
    // El telescópico ALSO renderiza una sección de Tapa "principal" además de
    // las secundarias (T1, T2). Tiene su propio TablaChecks en el form.
    seccionesHTML += renderSeccionComponente(
      numSec++,
      "Tapa",
      imgTapa,
      "Tapa",
      [
        renderMedida(`${p}_tapa_dext`, "Diámetro Exterior (A)", "single"),
        renderMedida(`${p}_tapa_dint`, "Diámetro Interior (B)", "single"),
        renderMedida(`${p}_tapa_dsell`, "Diámetro Sellado (C)", "single"),
        renderMedida(`${p}_tapa_ltot`, "Longitud Total (D)", "single"),
      ].join(""),
      `${p}_tapa`,
      []
    );
    seccionesHTML += renderChecksTable(
      `${p}_tapa`,
      [
        { key: "ndt", label: "Pasa NDT", tipo: "sn" },
        { key: "ext_roscado", label: "Exterior roscado", tipo: "sn" },
        { key: "sup_roscada", label: "Estado de superficie Roscada" },
      ],
      "Checks - Tapa"
    );
    // Hallazgos + recomendaciones del catálogo para Tapa main
    seccionesHTML += renderHallazgosCatalogo(`${p}_tapa`, ["tapa"]);
    seccionesHTML += renderRecomendacionesCatalogo("tapa");

    // ─── Émbolo (último del telescópico) ───
    seccionesHTML += renderSeccionComponente(
      numSec++,
      "Émbolo",
      imgPiston,
      "Émbolo (A, B, D)",
      [
        renderMedida(`${p}_emb_dext`, "Diámetro Exterior (A)", "single"),
        renderMedida(`${p}_emb_dint`, "Diámetro Interior (B)", "single"),
        renderMedida(`${p}_emb_ltot`, "Longitud Total (D)", "single"),
      ].join(""),
      `${p}_emb`,
      []
    );
    seccionesHTML += renderChecksTable(
      `${p}_emb`,
      [
        { key: "ndt", label: "Pasa NDT", tipo: "sn" },
        { key: "int_roscado", label: "Interior roscado", tipo: "sn" },
        { key: "sup_roscada", label: "Estado de superficie Roscada" },
      ],
      "Checks - Émbolo"
    );
    // Hallazgos + recomendaciones del catálogo para Émbolo del telescópico
    seccionesHTML += renderHallazgosCatalogo(`${p}_emb`, ["embolo"]);
    seccionesHTML += renderRecomendacionesCatalogo("embolo");

    saltarEstandar = true;
  }

  // ── RUEDA DELANTERA (segun Excel tipo 7) ──
  if (modeloEvaluacion === "rueda_delantera") {
    // HUB
    const medidasHub = [
      renderMedida(`${p}_hub_a`, "A - Alojamiento pista rodamiento mayor", "xy"),
      renderMedida(`${p}_hub_b`, "B - Alojamiento pista rodamiento menor", "xy"),
    ].join("");
    seccionesHTML += renderSeccionComponente(numSec++, "HUB (Cubo)", imgHub, "Hub", medidasHub, `${p}_hub`, []);
    seccionesHTML += renderHallazgosCatalogo(`${p}_hub`, ["hub"]);
    seccionesHTML += renderRecomendacionesCatalogo("hub");

    // SPINDLE
    const medidasSpi = [
      renderMedida(`${p}_spi_a`, "A - Asiento rodamiento mayor", "xy"),
      renderMedida(`${p}_spi_b`, "B - Asiento rodamiento menor", "xy"),
    ].join("");
    seccionesHTML += renderSeccionComponente(numSec++, "SPINDLE (Muñon)", imgSpindle, "Spindle", medidasSpi, `${p}_spi`, []);
    seccionesHTML += renderHallazgosCatalogo(`${p}_spi`, ["spindle"]);
    seccionesHTML += renderRecomendacionesCatalogo("spindle");

    // CONJUNTO DE FRENO
    seccionesHTML += renderSeccionComponente(numSec++, "CONJUNTO DE FRENO", imgConjFreno, "Conjunto de Freno", "", `${p}_freno`, []);
    seccionesHTML += renderHallazgosCatalogo(`${p}_freno`, ["conjunto_freno"]);
    seccionesHTML += renderRecomendacionesCatalogo("conjunto_freno");

    // CAJA DE FRENO
    seccionesHTML += renderSeccionComponente(numSec++, "CAJA DE FRENO", imgPistonFreno, "Pistón de Freno", "", `${p}_caja`, []);
    seccionesHTML += renderHallazgosCatalogo(`${p}_caja`, ["caja_freno"]);
    seccionesHTML += renderRecomendacionesCatalogo("caja_freno");

    // GENERAL
    seccionesHTML += renderSeccionComponente(numSec++, "GENERAL", "", "", "", `${p}_gen`, []);
    seccionesHTML += renderHallazgosCatalogo(`${p}_gen`, ["general"]);
    seccionesHTML += renderRecomendacionesCatalogo("general");

    saltarEstandar = true;
  }

  // ── FRENO DE SERVICIO & PARQUEO (tipo 9) ──
  // Sub-componentes: Housing + Spindle (con medidas) + Sprocket + 2 pistones de
  // freno (servicio + parqueo, ambos solo con hallazgos y recomendaciones).
  if (modeloEvaluacion === "freno_servicio_parqueo") {
    // HOUSING (con REF.NP + medidas A/B)
    const refNpHousing = v(`${p}_housing_ref_np`);
    const medidasHousing = [
      ...(refNpHousing ? [`<tr><td class="label">REF. N/P</td><td class="editable" colspan="2">${esc(refNpHousing)}</td></tr>`] : []),
      renderMedida(`${p}_housing_a`, "Diám. Alojamiento 1 (A)", "xy"),
      renderMedida(`${p}_housing_b`, "Diám. Alojamiento 2 (B)", "xy"),
    ].join("");
    seccionesHTML += renderSeccionComponente(numSec++, "Housing", imgHub, "Housing (A, B)", medidasHousing, `${p}_housing`, []);
    seccionesHTML += renderHallazgosCatalogo(`${p}_housing`, ["housing"]);
    seccionesHTML += renderRecomendacionesCatalogo("housing");

    // SPINDLE (con REF.NP + medidas A/L)
    const refNpSpindle = v(`${p}_spindle_ref_np`);
    const medidasSpindle = [
      ...(refNpSpindle ? [`<tr><td class="label">REF. N/P</td><td class="editable" colspan="2">${esc(refNpSpindle)}</td></tr>`] : []),
      renderMedida(`${p}_spindle_a`, "Diám. asiento rodamiento (A)", "xy"),
      renderMedida(`${p}_spindle_l`, "Longitud (L)", "single"),
    ].join("");
    seccionesHTML += renderSeccionComponente(numSec++, "Spindle", imgSpindle, "Spindle (A, L)", medidasSpindle, `${p}_spindle`, []);
    seccionesHTML += renderHallazgosCatalogo(`${p}_spindle`, ["spindle"]);
    seccionesHTML += renderRecomendacionesCatalogo("spindle");

    // SPROCKET (solo hallazgos + recomendaciones, sin medidas)
    seccionesHTML += renderSeccionComponente(numSec++, "Sprocket", "", "", "", `${p}_sprocket`, []);
    seccionesHTML += renderHallazgosCatalogo(`${p}_sprocket`, ["sprocket"]);
    seccionesHTML += renderRecomendacionesCatalogo("sprocket");

    // PISTÓN FRENO SERVICIO
    seccionesHTML += renderSeccionComponente(numSec++, "Pistón Freno Servicio", imgPistonFreno, "Pistón Freno Servicio", "", `${p}_piston_servicio`, []);
    seccionesHTML += renderHallazgosCatalogo(`${p}_piston_servicio`, ["piston_servicio"]);
    seccionesHTML += renderRecomendacionesCatalogo("piston_servicio");

    // PISTÓN FRENO PARQUEO
    seccionesHTML += renderSeccionComponente(numSec++, "Pistón Freno Parqueo", imgPistonFreno, "Pistón Freno Parqueo", "", `${p}_piston_parqueo`, []);
    seccionesHTML += renderHallazgosCatalogo(`${p}_piston_parqueo`, ["piston_parqueo"]);
    seccionesHTML += renderRecomendacionesCatalogo("piston_parqueo");

    saltarEstandar = true;
  }

  // ── ACUMULADOR DE VEJIGA ──
  if (modeloEvaluacion === "acum_vejiga") {
    const medidas = [
      renderMedida(`${p}_dext`, "Diametro Exterior (A) - simple", "single"),
      renderMedida(`${p}_dint`, "Diametro Interior (B)", "single"),
      renderMedida(`${p}_ltot`, "Longitud Total (C)", "single"),
      renderMedida(`${p}_dsal1`, "Diametro salida 1 - simple", "single"),
      renderMedida(`${p}_dsal2`, "Diametro salida 2 - simple", "single"),
      // Pares X/Y (segun Excel)
      renderMedida(`${p}_acumv_dsal1`, "Diámetro de Salida 1 (A)", "xy"),
      renderMedida(`${p}_acumv_dsal2`, "Diámetro de Salida 2 (B)", "xy"),
      renderMedida(`${p}_acumv_dext`, "Diámetro Exterior (C)", "xy"),
      renderMedida(`${p}_acumv_volumen_e`, "Volumen (E) [GL]", "single"),
    ].join("");
    seccionesHTML += renderSeccionComponente(numSec++, "Acumulador de Vejiga", imgCilindro, "Acumulador (A,B,C,E)", medidas, `${p}_acum`, []);
    seccionesHTML += renderChecksTable(
      `${p}_acum`,
      [
        { key: "valv_muelle", label: "Válvula hidráulica de muelle" },
        { key: "estado_vejiga", label: "Estado vejiga" },
        { key: "ndt", label: "Pasa a NDT", tipo: "sn" },
      ],
      "Checks - Acumulador de Vejiga"
    );
    saltarEstandar = true;
  }

  // Campos adicionales especificos (antes de las secciones estandar)
  if (modeloEvaluacion === "cil_pivotado") {
    seccionesHTML += `<h2><span class="section-num">${numSec++}</span> Campos adicionales - Cilindro Pivotado</h2>
      <table><tbody>
        <tr><td class="label">Diametro exterior cojinete</td><td class="editable">${esc(v(`${p}_pivot_dext_cojinete`)) || "—"}</td>
            <td class="label">Diametro exterior pivotante</td><td class="editable">${esc(v(`${p}_pivot_dext_pivotante`)) || "—"}</td></tr>
        <tr><td class="label">Longitud pivotante</td><td class="editable">${esc(v(`${p}_pivot_l_pivotante`)) || "—"}</td>
            <td class="label">Estado trunnion</td><td class="editable">${esc(v(`${p}_pivot_estado_trunnion`)) || "—"}</td></tr>
        <tr><td class="label">Prueba estanqueidad</td><td class="editable" colspan="3">${esc(v(`${p}_pivot_estanqueidad`)) || "—"}</td></tr>
      </tbody></table>`;
  }
  if (modeloEvaluacion === "cil_doble_vastago") {
    const sujecion = v(`${p}_doble_soporte_sujecion`);
    seccionesHTML += `<h2><span class="section-num">${numSec++}</span> Campos adicionales - Doble Vastago</h2>
      ${sujecion ? `<div class="campo-texto"><b>Soporte de sujecion</b><div class="textarea-box">${esc(sujecion)}</div></div>` : ""}
      <table><tbody>
        <tr><td class="label">Diametro vastago extremo 2</td><td class="editable">${esc(v(`${p}_doble_dv2`)) || "—"}</td>
            <td class="label">Longitud vastago extremo 2</td><td class="editable">${esc(v(`${p}_doble_lv2`)) || "—"}</td></tr>
      </tbody></table>`;
  }
  if (modeloEvaluacion === "acum_embolo") {
    seccionesHTML += `<h2><span class="section-num">${numSec++}</span> Campos adicionales - Acumulador de Embolo</h2>
      <table><tbody>
        <tr><td class="label">Volumen (GL)</td><td class="editable">${esc(v(`${p}_acum_vol`)) || "—"}</td>
            <td class="label">Presion N2 (PSI)</td><td class="editable">${esc(v(`${p}_acum_presion_n2`)) || "—"}</td></tr>
      </tbody></table>`;
  }
  if (modeloEvaluacion === "suspension_delantera") {
    seccionesHTML += `<h2><span class="section-num">${numSec++}</span> Campos adicionales - Suspension Delantera</h2>
      <table><tbody>
        <tr><td class="label">Carga nitrogeno (PSI)</td><td class="editable">${esc(v(`${p}_susp_n2`)) || "—"}</td>
            <td class="label">Carga aceite (L)</td><td class="editable">${esc(v(`${p}_susp_aceite`)) || "—"}</td>
            <td class="label">Altura nominal</td><td class="editable">${esc(v(`${p}_susp_altura`)) || "—"}</td></tr>
      </tbody></table>`;
  }

  if (!saltarEstandar) {
    // Detectar variantes
    const esCilHidraulico =
      modeloEvaluacion === "cil_vastago_simple" ||
      modeloEvaluacion === "cil_pivotado" ||
      modeloEvaluacion === "cil_doble_vastago";
    const esPivotado = modeloEvaluacion === "cil_pivotado";
    const esDobleVastago = modeloEvaluacion === "cil_doble_vastago";

    // Cilindro - medidas base
    const medidasCilBase = [
      renderMedida(`${p}_cil_a1`, "A1 (Interior)", "xy"),
      renderMedida(`${p}_cil_a2`, "A2 (Interior)", "xy"),
      renderMedida(`${p}_cil_a3`, "A3 (Interior)", "xy"),
      renderMedida(`${p}_cil_a4`, "A4 (Interior)", "xy"),
      renderMedida(`${p}_cil_dsal`, "Diametro Salida (B)", "xy"),
      renderMedida(`${p}_cil_dext`, "Diametro Exterior (C)", "xy"),
      renderMedida(`${p}_cil_lbru`, "Longitud Bruñido (D)", "single"),
      renderMedida(`${p}_cil_ltot`, "Longitud Total (E)", "single"),
    ].join("");
    // Extras de cancamo y elemento de sujecion (solo CHVS/CHP/CHPDV)
    const medidasCilExtra = esCilHidraulico
      ? [
          renderRadioLinea(`${p}_cil_tipo_cancamo`, "Tipo de cáncamo"),
          renderMedida(`${p}_cil_dojo_f`, "Diámetro Ojo F", "xy"),
          renderRadioLinea(`${p}_cil_elem_sujecion`, "Elemento de sujeción"),
          renderMedida(`${p}_cil_dint_g`, "Diám. Int. G", "xy"),
          renderMedida(`${p}_cil_ancho_ojo`, "Ancho de Ojo", "xy"),
        ].join("")
      : "";
    const medidasCil = medidasCilBase + medidasCilExtra;
    // Lee la elección global de sujeción para filtrar los grupos cojinete/rotula/pin
    const sujecionGlobal = v(`${p}_cil_elem_sujecion`) || v(`${p}_elem_sujecion`) || undefined;
    seccionesHTML += renderSeccionComponente(numSec++, "Cilindro (Botella)", imgCilindro, "Cilindro (A1-A4, C, D, E)", medidasCil, `${p}_cil`, []);
    // Hallazgos del catálogo + recomendaciones — mismo filtro que pasa el form
    // a HallazgosCatalogo: ["cil_", "acumulador"] (acumulador para acum_vejiga).
    seccionesHTML += renderHallazgosCatalogo(`${p}_cil`, ["cil_", "acumulador"], sujecionGlobal);
    seccionesHTML += renderRecomendacionesCatalogo(modeloEvaluacion === "acum_vejiga" ? "acumulador" : "cilindro");

    // Extras CHP: dos lecturas X/Y de cojinete y pivotante + longitud pivotante
    if (esPivotado) {
      const cojX1 = v(`${p}_cil_dext_cojinete_g_1_x`);
      const cojY1 = v(`${p}_cil_dext_cojinete_g_1_y`);
      const cojX2 = v(`${p}_cil_dext_cojinete_g_2_x`);
      const cojY2 = v(`${p}_cil_dext_cojinete_g_2_y`);
      const pivX1 = v(`${p}_cil_dext_pivotante_1_x`);
      const pivY1 = v(`${p}_cil_dext_pivotante_1_y`);
      const pivX2 = v(`${p}_cil_dext_pivotante_2_x`);
      const pivY2 = v(`${p}_cil_dext_pivotante_2_y`);
      const longPiv = v(`${p}_cil_long_pivotante`);
      seccionesHTML += `
        <div class="campo-texto"><b>Cilindro Pivotado - Dos lecturas X/Y</b></div>
        <table><thead>
          <tr><th>Parámetro</th><th>Lectura</th><th>X</th><th>Y</th></tr>
        </thead><tbody>
          <tr><td class="label" rowspan="2">Diám. Ext. Cojinete G</td><td class="editable">Lectura 1</td><td class="editable">${esc(cojX1) || "—"}</td><td class="editable">${esc(cojY1) || "—"}</td></tr>
          <tr><td class="editable">Lectura 2</td><td class="editable">${esc(cojX2) || "—"}</td><td class="editable">${esc(cojY2) || "—"}</td></tr>
          <tr><td class="label" rowspan="2">Diám. Ext. Pivotante</td><td class="editable">Lectura 1</td><td class="editable">${esc(pivX1) || "—"}</td><td class="editable">${esc(pivY1) || "—"}</td></tr>
          <tr><td class="editable">Lectura 2</td><td class="editable">${esc(pivX2) || "—"}</td><td class="editable">${esc(pivY2) || "—"}</td></tr>
          <tr><td class="label" colspan="2">Longitud de Pivotante</td><td class="editable" colspan="2">${esc(longPiv) || "—"}</td></tr>
        </tbody></table>
      `;
    }

    // Checks de cilindro - segun variante
    if (esCilHidraulico || modeloEvaluacion === "suspension_delantera") {
      const cilChecks: CheckItem[] = [
        { key: "tomas", label: "Tomas" },
        { key: "roscada", label: "Estado de sup. Roscada" },
      ];
      if (esCilHidraulico) {
        cilChecks.push(
          { key: "bocina_stop_1", label: "Bocina STOP 1" },
          { key: "bocina_stop_2", label: "Bocina STOP 2" },
          { key: "estado_cancamo", label: "Estado de cáncamo" }
        );
      }
      if (esPivotado) {
        cilChecks.push(
          { key: "estado_trunnion", label: "Estado de trunnion" },
          { key: "pasa_estanqueidad", label: "Pasa prueba de estanqueidad", tipo: "sn" }
        );
      }
      if (esDobleVastago) {
        cilChecks.push(
          { key: "estado_soporte_sujecion", label: "Estado de soporte de sujeción" },
          { key: "pasa_estanqueidad", label: "Pasa prueba de estanqueidad", tipo: "sn" }
        );
      }
      if (modeloEvaluacion === "suspension_delantera") {
        cilChecks.push({ key: "est_cartelas", label: "Est. de cartelas" });
      }
      cilChecks.push({ key: "ndt", label: "Pasa a NDT", tipo: "sn" });
      cilChecks.push({ key: "placa_conectores", label: "Placa / Conectores", tipo: "ci" });
      seccionesHTML += renderChecksTable(`${p}_cil`, cilChecks, "Checks - Cilindro");
      // Comentario libre asociado al check "Placa / Conectores" (solo si tiene texto).
      const placaComent = v(`${p}_cil_placa_conectores_coment`);
      if (placaComent) {
        seccionesHTML += `<div class="campo-texto"><b>Comentario — Placa / Conectores</b><div class="textarea-box">${esc(placaComent)}</div></div>`;
      }
    }

    // Vastago
    if (!modeloEvaluacion.startsWith("acum")) {
      const muestraCancamoVastago = esCilHidraulico; // CHVS/CHP/CHPDV
      const medidasVasBase = [
        renderMedida(`${p}_vas_desp`, "Diametro Espiga (A)", "xy"),
        renderMedida(`${p}_vas_dext`, "Diametro Exterior (B)", "xy"),
        renderMedida(`${p}_vas_dsell`, "Diametro Sellado (C)", "xy"),
        renderMedida(`${p}_vas_dcoj`, "Diametro Cojinete (D)", "xy"),
        renderMedida(`${p}_vas_lcro`, "Longitud Cromo (E)", "single"),
        renderMedida(`${p}_vas_ltot`, "Longitud Total (F)", "single"),
        renderMedida(`${p}_vas_long_espiga_g`, "Longitud de Espiga G", "single"),
      ].join("");
      const medidasVasExtra = [
        ...(muestraCancamoVastago ? [renderRadioLinea(`${p}_vas_tipo_cancamo`, "Tipo de cáncamo")] : []),
        renderMedida(`${p}_vas_dext_ojo_h`, "Diám. Ext. Ojo H", "xy"),
        renderRadioLinea(`${p}_vas_elem_sujecion`, "Elemento de sujeción"),
        renderMedida(`${p}_vas_dint_ojo_i`, "Diám. Int. Ojo I", "xy"),
        renderMedida(`${p}_vas_dint_j`, "Diám. Int. J", "xy"),
        renderMedida(`${p}_vas_ancho_ojo`, "Ancho de Ojo", "xy"),
      ].join("");
      const medidasVas = medidasVasBase + medidasVasExtra;
      seccionesHTML += renderSeccionComponente(numSec++, "Vastago", imgVastago, "Vastago (A-J)", medidasVas, `${p}_vas`, []);
      // Hallazgos del catálogo para vástago + recomendaciones componente "vastago"
      seccionesHTML += renderHallazgosCatalogo(`${p}_vas`, ["vas_"], sujecionGlobal);
      seccionesHTML += renderRecomendacionesCatalogo("vastago");

      // Flexion y Esp. Cromo (B, C, D)
      const flxB = v(`${p}_vas_flexion_b`);
      const flxC = v(`${p}_vas_flexion_c`);
      const flxD = v(`${p}_vas_flexion_d`);
      const ecB = v(`${p}_vas_esp_cromo_b`);
      const ecC = v(`${p}_vas_esp_cromo_c`);
      const ecD = v(`${p}_vas_esp_cromo_d`);
      if (flxB || flxC || flxD || ecB || ecC || ecD) {
        seccionesHTML += `
          <div class="campo-texto"><b>Flexión y Espesor de Cromo (Vástago)</b></div>
          <table><thead>
            <tr><th>Parámetro</th><th>B</th><th>C</th><th>D</th></tr>
          </thead><tbody>
            <tr><td class="label">Flexión</td><td class="editable">${esc(flxB) || "—"}</td><td class="editable">${esc(flxC) || "—"}</td><td class="editable">${esc(flxD) || "—"}</td></tr>
            <tr><td class="label">Esp. Cromo [mil]</td><td class="editable">${esc(ecB) || "—"}</td><td class="editable">${esc(ecC) || "—"}</td><td class="editable">${esc(ecD) || "—"}</td></tr>
          </tbody></table>
        `;
      }

      // Checks de vastago
      const vasChecks: CheckItem[] = [
        { key: "estado_cromo", label: "Estado del cromo" },
      ];
      if (muestraCancamoVastago) {
        vasChecks.push({ key: "chk_estado_cancamo", label: "Estado de cáncamo" });
      }
      vasChecks.push(
        { key: "ndt", label: "Pasa a NDT", tipo: "sn" },
        { key: "sensor", label: "Sensor", tipo: "sn" }
      );
      seccionesHTML += renderChecksTable(`${p}_vas`, vasChecks, "Checks - Vástago");
    }

    // Tapa (incluye SD ahora)
    if (!modeloEvaluacion.startsWith("acum")) {
      const tapaA1 = v(`${p}_tapa_dext`);
      const tapaB1 = v(`${p}_tapa_dint`);
      const tapaC1 = v(`${p}_tapa_dsell`);
      const tapaD1 = v(`${p}_tapa_ltot`);

      let medidasTapaHTML = "";
      if (esDobleVastago) {
        // Tabla con 2 juegos: A | B | C | D
        const tapaA2 = v(`${p}_tapa_a2`);
        const tapaB2 = v(`${p}_tapa_b2`);
        const tapaC2 = v(`${p}_tapa_c2`);
        const tapaD2 = v(`${p}_tapa_d2`);
        medidasTapaHTML = `
          <table><thead>
            <tr>
              <th>Tapa</th>
              <th>A (Diám. Exterior)</th>
              <th>B (Diám. Interior)</th>
              <th>C (Diám. Sellado)</th>
              <th>D (Longitud Total)</th>
            </tr>
          </thead><tbody>
            <tr><td class="label">Juego 1</td><td class="editable">${esc(tapaA1) || "—"}</td><td class="editable">${esc(tapaB1) || "—"}</td><td class="editable">${esc(tapaC1) || "—"}</td><td class="editable">${esc(tapaD1) || "—"}</td></tr>
            <tr><td class="label">Juego 2</td><td class="editable">${esc(tapaA2) || "—"}</td><td class="editable">${esc(tapaB2) || "—"}</td><td class="editable">${esc(tapaC2) || "—"}</td><td class="editable">${esc(tapaD2) || "—"}</td></tr>
          </tbody></table>
        `;
      } else {
        const medidasTapa = [
          renderMedida(`${p}_tapa_dext`, "Diametro Exterior (A)", "single"),
          renderMedida(`${p}_tapa_dint`, "Diametro Interior (B)", "single"),
          renderMedida(`${p}_tapa_dsell`, "Diametro Sellado (C)", "single"),
          renderMedida(`${p}_tapa_ltot`, "Longitud Total (D)", "single"),
        ].join("");
        medidasTapaHTML = medidasTapa;
      }

      // Renderizar con layout estandar (imagen + medidas a la derecha)
      // Para doble vastago, medidasTapaHTML ya es una tabla completa (no formato fila X/Y),
      // por eso renderizamos manualmente cuando es esDobleVastago.
      if (esDobleVastago) {
        seccionesHTML += `
          <h2><span class="section-num">${numSec++}</span> Tapa</h2>
          <table class="seccion-layout"><tr>
            <td class="seccion-img-cell">
              <div class="img-ref-wrap"><img src="${imgTapa}" /><div class="img-caption">Referencia: Tapa (A, B, C, D)</div></div>
            </td>
            <td class="seccion-med-cell">${medidasTapaHTML}</td>
          </tr></table>
        `;
        seccionesHTML += renderImagenesSubidas(`${p}_tapa`);
        const resTapa = v(`${p}_tapa_resultado`);
        const recTapa = v(`${p}_tapa_recomendaciones`);
        if (resTapa) seccionesHTML += `<div class="campo-texto"><b>Resultado</b><div class="textarea-box">${esc(resTapa)}</div></div>`;
        if (recTapa) seccionesHTML += `<div class="campo-texto"><b>Recomendaciones</b><div class="textarea-box">${esc(recTapa)}</div></div>`;
      } else {
        seccionesHTML += renderSeccionComponente(numSec++, "Tapa", imgTapa, "Tapa (A, B, C, D)", medidasTapaHTML, `${p}_tapa`, []);
      }
      // Hallazgos del catálogo (grupos "tapa") + recomendaciones componente "tapa"
      seccionesHTML += renderHallazgosCatalogo(`${p}_tapa`, ["tapa"]);
      seccionesHTML += renderRecomendacionesCatalogo("tapa");

      // Checks de tapa (todos los modelos con tapa)
      const tapaChecks: CheckItem[] = [
        { key: "ndt", label: "Pasa a NDT", tipo: "sn" },
        { key: "ext_roscado", label: "Exterior roscado", tipo: "sn" },
      ];
      seccionesHTML += renderChecksTable(`${p}_tapa`, tapaChecks, "Checks - Tapa");
    }

    // Piston/Embolo
    const medidasPis = [
      renderMedida(`${p}_pis_dext`, "Diametro Exterior (A)", "single"),
      renderMedida(`${p}_pis_dint`, "Diametro Interior (B)", "single"),
      renderMedida(`${p}_pis_ltot`, "Longitud (C)", "single"),
    ].join("");
    seccionesHTML += renderSeccionComponente(numSec++, modeloEvaluacion === "acum_embolo" ? "Embolo" : "Piston", imgPiston, "Piston (A, B, C)", medidasPis, `${p}_pis`, []);
    // Hallazgos del catálogo (grupos "embolo") + recomendaciones componente "embolo"
    seccionesHTML += renderHallazgosCatalogo(`${p}_pis`, ["embolo"]);
    seccionesHTML += renderRecomendacionesCatalogo("embolo");
    // Checks del Pistón / Émbolo — todos los modelos estándar los tienen.
    // El form usa `${p}_pis` también para el émbolo del acumulador, por eso
    // estos labels son genéricos ("interior roscado" aplica a ambos).
    seccionesHTML += renderChecksTable(
      `${p}_pis`,
      [
        { key: "ndt", label: "Pasa NDT", tipo: "sn" },
        { key: "int_roscado", label: "Interior roscado", tipo: "sn" },
      ],
      `Checks - ${modeloEvaluacion === "acum_embolo" ? "Émbolo" : "Pistón"}`
    );
  }

  // ── HTML completo ──
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
@page { size: A4 landscape; margin: 1.5cm 1.2cm; }
body { font-family: Calibri, Arial, sans-serif; font-size: 9pt; margin: 0; color: #222; line-height: 1.4; }

.header-corp { width: 100%; border-bottom: 3pt solid ${AZUL}; margin-bottom: 12pt; padding-bottom: 8pt; }
.header-corp td { border: none; padding: 0; vertical-align: middle; }
.header-corp .logo-cell { width: 75pt; text-align: left; }
.header-corp .logo-cell img { width: 65pt; height: auto; max-height: 30pt; }
.header-corp .titulo-cell { text-align: center; padding: 0 10pt; }
.header-corp .titulo-cell h1 { font-size: 14pt; color: ${AZUL}; margin: 0 0 3pt; letter-spacing: 1.5pt; font-weight: bold; text-transform: uppercase; }
.header-corp .titulo-cell p { font-size: 9pt; color: #555; margin: 0; }
.header-corp .info-cell { text-align: right; font-size: 8.5pt; color: #444; width: 150pt; line-height: 1.6; }
.header-corp .info-cell b { color: ${AZUL}; }

h2 { font-size: 10.5pt; background: ${AZUL}; color: #fff; padding: 5pt 10pt; margin: 14pt 0 6pt; }
.section-num { display: inline-block; background: #fff; color: ${AZUL}; border: 1.5pt solid #fff; border-radius: 50%; width: 16pt; height: 16pt; text-align: center; line-height: 16pt; font-weight: bold; font-size: 8pt; margin-right: 5pt; }

table { border-collapse: collapse; width: 100%; margin: 4pt 0 8pt; }
th, td { border: 0.5pt solid #bbb; padding: 3pt 6pt; font-size: 8.5pt; vertical-align: top; }
th { background: ${AZUL}; color: #fff; font-weight: 600; text-align: center; font-size: 8pt; letter-spacing: 0.3pt; }
td.label { font-weight: 600; background: ${GRIS_FONDO}; color: #333; white-space: nowrap; width: 30%; }
td.editable { color: ${AZUL_CLARO}; font-weight: 600; text-align: center; }

.img-ref-wrap { text-align: center; margin: 0; padding: 8pt; border: 1pt solid #cfd8e3; background: #fafcff; border-radius: 3pt; }
.img-ref-wrap img { width: auto; height: auto; max-width: 100%; max-height: 180pt; display: block; margin: 0 auto; }
.img-ref-wrap .img-caption { font-size: 8.5pt; color: ${AZUL}; margin-top: 6pt; font-weight: 700; letter-spacing: 0.5pt; text-transform: uppercase; }

/* Layout 2 columnas: imagen | medidas (lado a lado en A4 horizontal) */
.seccion-layout { width: 100%; border-collapse: separate; border-spacing: 0; margin: 6pt 0 8pt; }
.seccion-layout > tbody > tr > td { border: none; padding: 0; vertical-align: top; }
.seccion-layout td.seccion-img-cell { width: 35%; padding-right: 10pt; }
.seccion-layout td.seccion-med-cell { width: 65%; }
/* Cuando va sola la imagen (sin medidas), centrarla con ancho moderado */
.img-ref-wrap.solo { width: 55%; margin: 10pt auto; }

.fotos-subidas { margin: 10pt 0 12pt; }
.fotos-titulo { font-size: 9pt; color: ${AZUL}; font-weight: 700; padding: 5pt 8pt; background: ${GRIS_FONDO}; border-left: 4pt solid ${AZUL}; margin-bottom: 6pt; letter-spacing: 0.4pt; }
/* Bloque por foto: SIN tabla, SIN caption, SIN borde — el user pidió que
   las imágenes vayan continuas. Margen vertical mínimo (2pt) para que se
   vean pegadas pero no superpuestas. */
.foto-bloque { text-align: center; margin: 2pt 0; page-break-inside: avoid; }
.foto-bloque img { width: 8cm; height: auto; display: block; margin: 0 auto; }

.hallazgos { margin: 6pt 0; padding: 4pt 8pt; border-left: 3pt solid #c0392b; background: #fef5f5; }
.hallazgos b { color: #c0392b; font-size: 9pt; }
.hallazgos ul { margin: 3pt 0 3pt 14pt; padding: 0; }
.hallazgos li { font-size: 8.5pt; margin-bottom: 2pt; color: #333; }

/* Recomendaciones del catálogo — bloque azul para diferenciarlas de los
   hallazgos (rojo). Se separan en Estándar / No estándar igual que el form. */
.recom-grupo { margin: 4pt 0 4pt 6pt; padding: 3pt 8pt; border-left: 3pt solid ${AZUL_CLARO}; background: #f0f6ff; }
.recom-grupo .recom-sub { font-size: 7.5pt; font-weight: 700; color: ${AZUL_CLARO}; text-transform: uppercase; letter-spacing: 0.5pt; margin-bottom: 2pt; }
.recom-grupo ul { margin: 2pt 0 2pt 14pt; padding: 0; }
.recom-grupo li { font-size: 8.5pt; margin-bottom: 2pt; color: #333; }

.campo-texto { margin: 5pt 0; }
.campo-texto b { font-size: 8.5pt; color: ${AZUL}; display: block; margin-bottom: 2pt; }
.textarea-box { border: 0.5pt solid #bbb; min-height: 30pt; padding: 5pt 8pt; background: #fafafa; font-size: 8.5pt; color: #333; }

.footer { border-top: 2pt solid ${AZUL}; margin-top: 16pt; padding-top: 6pt; text-align: center; }
.footer .empresa { font-size: 8pt; color: ${AZUL}; font-weight: 600; letter-spacing: 0.5pt; }
.footer .detalle { font-size: 7pt; color: #999; margin-top: 2pt; }
</style></head><body>

<table class="header-corp"><tr>
    <td class="logo-cell">${logoB64 ? `<img src="${logoB64}" />` : `<b style="font-size:14pt;color:${AZUL};letter-spacing:1pt">EMPRESA</b>`}</td>
    <td class="titulo-cell">
        <h1>Hoja de Evaluacion Tecnica</h1>
        <p>${esc(tituloModelo)}</p>
    </td>
    <td class="info-cell">
        <b>OT:</b> ${esc(otNumero)}<br/>
        <b>Fecha:</b> ${esc(fechaEvaluacion || fechaHoy)}<br/>
        <b>Evaluador:</b> ${esc(evaluadoPor)}<br/>
        <b>Supervisor:</b> ${esc(supervisor)}<br/>
        <b>Sistema:</b> ${esc(sistemaMedicion)}
    </td>
</tr></table>

<h2><span class="section-num">1</span> Datos Generales</h2>
<table><tbody>
    <tr><td class="label">Cliente</td><td class="editable">${esc(clienteNombre)}</td><td class="label">Codigo Reparacion</td><td class="editable">${esc(ot?.codigo_reparacion?.codigo)}</td></tr>
    <tr><td class="label">Fabricante</td><td class="editable">${esc(ot?.fabricante?.nombre)}</td><td class="label">Flota</td><td class="editable">${esc(ot?.cod_rep_flota)}</td></tr>
    <tr><td class="label">Tipo</td><td class="editable">${esc(ot?.tipo)}</td><td class="label">N/P</td><td class="editable">${esc(ot?.np)}</td></tr>
    <tr><td class="label">Equipo</td><td class="editable">${esc(ot?.equipo_codigo)}</td><td class="label">Posicion</td><td class="editable">${esc(ot?.cod_rep_posicion)}</td></tr>
    <tr><td class="label">Descripcion</td><td class="editable" colspan="3">${esc(ot?.descripcion)}</td></tr>
</tbody></table>

${seccionesHTML}

${
  resultadoGeneral || recomendacionesGeneral
    ? `<h2><span class="section-num">${numSec}</span> Conclusiones Generales</h2>
       ${resultadoGeneral ? `<div class="campo-texto"><b>Resultado general</b><div class="textarea-box">${esc(resultadoGeneral)}</div></div>` : ""}
       ${recomendacionesGeneral ? `<div class="campo-texto"><b>Recomendaciones</b><div class="textarea-box">${esc(recomendacionesGeneral)}</div></div>` : ""}`
    : ""
}

<div class="footer">
    <div class="empresa">Hoja de Evaluacion Tecnica</div>
    <div class="detalle">Hoja de Evaluacion Tecnica — ${esc(otNumero)} — Generado el ${fechaHoy}</div>
</div>

</body></html>`;

  const blob = new Blob(["\ufeff" + html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Evaluacion-${otNumero}-${fechaHoy.replace(/\//g, "")}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
