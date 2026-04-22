import { MODELOS_EVALUACION } from "./EvaluacionFormulario";

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

export async function generarWordEvaluacion(args: GenerarWordArgs) {
  const { ot, modeloEvaluacion, sistemaMedicion, fechaEvaluacion, evaluadoPor, datos, resultadoGeneral, recomendacionesGeneral } = args;

  const modelo = MODELOS_EVALUACION.find((m) => m.value === modeloEvaluacion);
  const tituloModelo = modelo?.label || "Cilindro hidraulico vastago simple";
  const fechaHoy = new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const otNumero = ot?.ot || "N-D";

  // Cargar imagenes de referencia segun el modelo
  const [logoB64, imgCilindro, imgVastago, imgTapa, imgPiston] = await Promise.all([
    imagenABase64("/LOGO-HPK-INVERSIONEs.png"),
    imagenABase64("/Cilindro.png"),
    imagenABase64("/Vastago.png"),
    imagenABase64("/Tapa.png"),
    imagenABase64("/Piston.png"),
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

  // Helper: render de imagenes subidas (max 6, grilla 3x2, altura uniforme)
  const renderImagenesSubidas = (prefix: string): string => {
    const imgs = ((datos[`${prefix}_imagenes`] as { name: string; data: string }[] | undefined) || []).slice(0, 6);
    if (!imgs.length) return "";
    const COLS = 3;
    const cells = imgs.map(
      (img) =>
        `<td class="foto-cell"><div class="foto-img-wrap"><img src="${img.data}" /></div><div class="foto-caption">${esc(
          img.name || ""
        )}</div></td>`
    );
    // Completar la ultima fila con celdas vacias para que la grilla quede ordenada
    while (cells.length % COLS !== 0) {
      cells.push('<td class="foto-cell foto-vacia"></td>');
    }
    const rows: string[] = [];
    for (let i = 0; i < cells.length; i += COLS) {
      rows.push(`<tr>${cells.slice(i, i + COLS).join("")}</tr>`);
    }
    return `
      <div class="fotos-subidas">
        <div class="fotos-titulo">Evidencia fotografica</div>
        <table class="tabla-fotos"><tbody>${rows.join("")}</tbody></table>
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

    return `
      <h2><span class="section-num">${numSec}</span> ${esc(titulo)}</h2>
      ${imgSrc ? `<div class="img-ref-wrap"><img src="${imgSrc}" /><div class="img-caption">Referencia: ${esc(imgLabel)}</div></div>` : ""}
      ${medidasHTML ? `<table><thead><tr><th>Parametro</th><th>X</th><th>Y</th></tr></thead><tbody>${medidasHTML}</tbody></table>` : ""}
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

  // Prefijo del modelo
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
  const p = prefijos[modeloEvaluacion] || "t1";

  // Armar secciones
  let seccionesHTML = "";
  let numSec = 2;
  let saltarEstandar = false;

  // ── TELESCOPICO: Etapas dinamicas ──
  if (modeloEvaluacion === "cil_telescopico") {
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
    }
    // Tapas secundarias
    const tapaSec = v(`${p}_tapa_secundaria`);
    const tapaPost = v(`${p}_tapa_posterior`);
    if (tapaSec || tapaPost) {
      seccionesHTML += `<h2><span class="section-num">${numSec++}</span> Tapas Secundarias</h2>`;
      if (tapaSec) seccionesHTML += `<div class="campo-texto"><b>Tapa roscada secundaria</b><div class="textarea-box">${esc(tapaSec)}</div></div>`;
      if (tapaPost) seccionesHTML += `<div class="campo-texto"><b>Tapa posterior de sujecion</b><div class="textarea-box">${esc(tapaPost)}</div></div>`;
    }
    saltarEstandar = true;
  }

  // ── RUEDA DELANTERA (segun Excel tipo 7) ──
  if (modeloEvaluacion === "rueda_delantera") {
    // HUB
    const medidasHub = [
      renderMedida(`${p}_hub_a`, "A - Alojamiento pista rodamiento mayor", "xy"),
      renderMedida(`${p}_hub_b`, "B - Alojamiento pista rodamiento menor", "xy"),
    ].join("");
    const hallazgosHub = [
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
    ].map((texto, idx) => ({ key: `${p}_hub_g0_${idx}`, texto }));
    seccionesHTML += renderSeccionComponente(numSec++, "HUB (Cubo)", imgCilindro, "Hub", medidasHub, `${p}_hub`, hallazgosHub);

    // SPINDLE
    const medidasSpi = [
      renderMedida(`${p}_spi_a`, "A - Asiento rodamiento mayor", "xy"),
      renderMedida(`${p}_spi_b`, "B - Asiento rodamiento menor", "xy"),
    ].join("");
    const hallazgosSpi = [
      "Presenta picaduras en asiento de rodamiento",
      "Presenta rayaduras en asiento de rodamiento",
      "Daños en alojamientos roscados",
      "Presenta daños en alojamiento conico",
      "Presenta corrosion en alojamiento conico",
      "Presenta picaduras en alojamiento conico",
      "Alojamientos roscados de pernos de sujecion de bastidor",
    ].map((texto, idx) => ({ key: `${p}_spi_g0_${idx}`, texto }));
    seccionesHTML += renderSeccionComponente(numSec++, "SPINDLE (Muñon)", imgVastago, "Spindle", medidasSpi, `${p}_spi`, hallazgosSpi);

    // CONJUNTO DE FRENO
    const hallazgosFreno = [
      "Piston de freno presenta rayaduras en alojamientos de sellos",
      "Presenta desgaste en resortes de retraccion",
      "Pernos de sujecion llegaron elongados",
      "Sellos presentan desgaste",
    ].map((texto, idx) => ({ key: `${p}_freno_g0_${idx}`, texto }));
    seccionesHTML += renderSeccionComponente(numSec++, "CONJUNTO DE FRENO", "", "", "", `${p}_freno`, hallazgosFreno);

    // CAJA DE FRENO
    const hallazgosCaja = [
      "Presenta rayas en asientos de sellos",
      "Alojamientos roscados presentan contaminacion",
    ].map((texto, idx) => ({ key: `${p}_caja_g0_${idx}`, texto }));
    seccionesHTML += renderSeccionComponente(numSec++, "CAJA DE FRENO", "", "", "", `${p}_caja`, hallazgosCaja);

    // GENERAL
    const hallazgosGen = [
      "Discos de friccion presentan desgaste",
      "Discos de friccion presentan marcas de temperatura (recalentamiento)",
      "Placas separadoras presentan rayas circulares",
      "Placas separadoras presentan desgaste",
      "Placas separadoras presentan manchas de sobrecalentamiento",
      "Dumpers presentan desgaste y daños por temperatura",
    ].map((texto, idx) => ({ key: `${p}_gen_g0_${idx}`, texto }));
    seccionesHTML += renderSeccionComponente(numSec++, "GENERAL", "", "", "", `${p}_gen`, hallazgosGen);

    saltarEstandar = true;
  }

  // ── ACUMULADOR DE VEJIGA ──
  if (modeloEvaluacion === "acum_vejiga") {
    const medidas = [
      renderMedida(`${p}_dext`, "Diametro Exterior (A)", "single"),
      renderMedida(`${p}_dint`, "Diametro Interior (B)", "single"),
      renderMedida(`${p}_ltot`, "Longitud Total (C)", "single"),
      renderMedida(`${p}_dsal1`, "Diametro salida 1", "single"),
      renderMedida(`${p}_dsal2`, "Diametro salida 2", "single"),
    ].join("");
    seccionesHTML += renderSeccionComponente(numSec++, "Acumulador de Vejiga", imgCilindro, "Acumulador (A,B,C)", medidas, `${p}_acum`, []);
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
    // Cilindro
    const medidasCil = [
      renderMedida(`${p}_cil_a1`, "A1 (Interior)", "xy"),
      renderMedida(`${p}_cil_a2`, "A2 (Interior)", "xy"),
      renderMedida(`${p}_cil_a3`, "A3 (Interior)", "xy"),
      renderMedida(`${p}_cil_a4`, "A4 (Interior)", "xy"),
      renderMedida(`${p}_cil_dsal`, "Diametro Salida (B)", "xy"),
      renderMedida(`${p}_cil_dext`, "Diametro Exterior (C)", "xy"),
      renderMedida(`${p}_cil_lbru`, "Longitud Bruñido (D)", "single"),
      renderMedida(`${p}_cil_ltot`, "Longitud Total (E)", "single"),
    ].join("");
    const hallazgosCil = [
      ["Cilindro Interior", ["Presenta rayaduras axiales en interior", "Presenta rayaduras radiales en interior", "Diametro interior presenta deformacion", "Medida interna fuera de tolerancia", "Diametro interior muestra desgaste", "Diametro de sellado muestra desgaste"]],
      ["Cilindro Exterior", ["Presenta golpes en el exterior del cilindro", "Presenta desgaste en exterior del cilindro", "Presenta deformacion en exterior de cilindro", "Presenta depositos de soldadura ajenos al diseño"]],
    ].flatMap(([, items], gi) =>
      (items as string[]).map((texto, idx) => ({ key: `${p}_cil_g${gi}_${idx}`, texto }))
    );
    seccionesHTML += renderSeccionComponente(numSec++, "Cilindro (Botella)", imgCilindro, "Cilindro (A1-A4, C, D, E)", medidasCil, `${p}_cil`, hallazgosCil);

    // Vastago
    if (!modeloEvaluacion.startsWith("acum")) {
      const medidasVas = [
        renderMedida(`${p}_vas_desp`, "Diametro Espiga (A)", "xy"),
        renderMedida(`${p}_vas_dext`, "Diametro Exterior (B)", "xy"),
        renderMedida(`${p}_vas_dsell`, "Diametro Sellado (C)", "xy"),
        renderMedida(`${p}_vas_dcoj`, "Diametro Cojinete (D)", "xy"),
        renderMedida(`${p}_vas_lcro`, "Longitud Cromo (E)", "single"),
        renderMedida(`${p}_vas_ltot`, "Longitud Total (F)", "single"),
      ].join("");
      const hallazgosVas = [
        ["Cojinete", ["Presenta corrosion en exterior de cojinete", "Presenta picaduras en exterior de cojinete", "Presenta desgaste en exterior de cojinete", "Cojinete llego fisurado", "Llego sin cojinete"]],
        ["Rotula", ["Presenta corrosion en interior de rotula", "Presenta picaduras en interior de rotula", "Presenta desgaste en interior de rotula"]],
      ].flatMap(([, items], gi) =>
        (items as string[]).map((texto, idx) => ({ key: `${p}_vas_g${gi}_${idx}`, texto }))
      );
      seccionesHTML += renderSeccionComponente(numSec++, "Vastago", imgVastago, "Vastago (A-J)", medidasVas, `${p}_vas`, hallazgosVas);
    }

    // Tapa
    if (!modeloEvaluacion.startsWith("acum") && modeloEvaluacion !== "suspension_delantera") {
      const medidasTapa = [
        renderMedida(`${p}_tapa_dext`, "Diametro Exterior (A)", "single"),
        renderMedida(`${p}_tapa_dint`, "Diametro Interior (B)", "single"),
        renderMedida(`${p}_tapa_dsell`, "Diametro Sellado (C)", "single"),
        renderMedida(`${p}_tapa_ltot`, "Longitud Total (D)", "single"),
      ].join("");
      const hallazgosTapa = [
        ["Tapa", ["Tapa presenta rayaduras", "Tapa presenta deformacion", "Tapa fuera de tolerancia", "Roscas de tapa danadas"]],
      ].flatMap(([, items], gi) =>
        (items as string[]).map((texto, idx) => ({ key: `${p}_tapa_g${gi}_${idx}`, texto }))
      );
      seccionesHTML += renderSeccionComponente(numSec++, "Tapa", imgTapa, "Tapa (A, B, C, D)", medidasTapa, `${p}_tapa`, hallazgosTapa);
    }

    // Piston/Embolo
    const medidasPis = [
      renderMedida(`${p}_pis_dext`, "Diametro Exterior (A)", "single"),
      renderMedida(`${p}_pis_dint`, "Diametro Interior (B)", "single"),
      renderMedida(`${p}_pis_ltot`, "Longitud (C)", "single"),
    ].join("");
    const hallazgosPis = [
      ["Piston / Embolo", ["Piston presenta rayaduras", "Piston presenta deformacion", "Piston fuera de tolerancia", "Canales de sellos danados"]],
    ].flatMap(([, items], gi) =>
      (items as string[]).map((texto, idx) => ({ key: `${p}_pis_g${gi}_${idx}`, texto }))
    );
    seccionesHTML += renderSeccionComponente(numSec++, modeloEvaluacion === "acum_embolo" ? "Embolo" : "Piston", imgPiston, "Piston (A, B, C)", medidasPis, `${p}_pis`, hallazgosPis);
  }

  // ── HTML completo ──
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
@page { size: A4 landscape; margin: 1.5cm 1.2cm; }
body { font-family: Calibri, Arial, sans-serif; font-size: 9pt; margin: 0; color: #222; line-height: 1.4; }

.header-corp { width: 100%; border-bottom: 3pt solid ${AZUL}; margin-bottom: 12pt; padding-bottom: 8pt; }
.header-corp td { border: none; padding: 0; vertical-align: middle; }
.header-corp .logo-cell { width: 95pt; text-align: left; }
.header-corp .logo-cell img { width: 85pt; height: auto; max-height: 40pt; }
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

.img-ref-wrap { text-align: center; margin: 6pt auto; padding: 4pt; border: 1pt solid #ddd; background: #fafcff; width: 45%; }
.img-ref-wrap img { width: 140pt; height: auto; max-height: 90pt; }
.img-ref-wrap .img-caption { font-size: 7.5pt; color: ${AZUL}; margin-top: 3pt; font-weight: 600; letter-spacing: 0.3pt; }

.fotos-subidas { margin: 6pt 0 8pt; }
.fotos-titulo { font-size: 8.5pt; color: ${AZUL}; font-weight: 700; padding: 3pt 6pt; background: ${GRIS_FONDO}; border-left: 3pt solid ${AZUL}; margin-bottom: 4pt; letter-spacing: 0.3pt; }
.tabla-fotos { width: 100%; border-collapse: collapse; table-layout: fixed; }
.tabla-fotos td.foto-cell { border: 0.5pt solid #ccc; padding: 4pt; width: 33.33%; text-align: center; background: #fff; vertical-align: top; }
.tabla-fotos td.foto-vacia { border: 0; background: transparent; }
.foto-img-wrap { width: 100%; height: 110pt; line-height: 110pt; text-align: center; overflow: hidden; }
.foto-img-wrap img { height: 110pt; width: auto; max-width: 100%; vertical-align: middle; }
.foto-caption { font-size: 7pt; color: #666; margin-top: 3pt; font-style: italic; line-height: 1.2; max-height: 16pt; overflow: hidden; }

.hallazgos { margin: 6pt 0; padding: 4pt 8pt; border-left: 3pt solid #c0392b; background: #fef5f5; }
.hallazgos b { color: #c0392b; font-size: 9pt; }
.hallazgos ul { margin: 3pt 0 3pt 14pt; padding: 0; }
.hallazgos li { font-size: 8.5pt; margin-bottom: 2pt; color: #333; }

.campo-texto { margin: 5pt 0; }
.campo-texto b { font-size: 8.5pt; color: ${AZUL}; display: block; margin-bottom: 2pt; }
.textarea-box { border: 0.5pt solid #bbb; min-height: 30pt; padding: 5pt 8pt; background: #fafafa; font-size: 8.5pt; color: #333; }

.footer { border-top: 2pt solid ${AZUL}; margin-top: 16pt; padding-top: 6pt; text-align: center; }
.footer .empresa { font-size: 8pt; color: ${AZUL}; font-weight: 600; letter-spacing: 0.5pt; }
.footer .detalle { font-size: 7pt; color: #999; margin-top: 2pt; }
</style></head><body>

<table class="header-corp"><tr>
    <td class="logo-cell">${logoB64 ? `<img src="${logoB64}" />` : `<b style="font-size:20pt;color:${AZUL}">HP&K</b>`}</td>
    <td class="titulo-cell">
        <h1>Hoja de Evaluacion Tecnica</h1>
        <p>${esc(tituloModelo)}</p>
    </td>
    <td class="info-cell">
        <b>OT:</b> ${esc(otNumero)}<br/>
        <b>Fecha:</b> ${esc(fechaEvaluacion || fechaHoy)}<br/>
        <b>Evaluador:</b> ${esc(evaluadoPor)}<br/>
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
    <div class="empresa">HP&K INVERSIONES S.A.C.</div>
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
