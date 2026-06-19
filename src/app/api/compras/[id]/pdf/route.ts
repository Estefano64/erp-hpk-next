import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rutaFirmaDe, nombreParaFirma } from "@/lib/firmas";
import { formatOtCodigo, formatOtInternaCodigo } from "@/lib/ot-formato";
import { areaTallerLabel } from "@/lib/areas-taller";

type Params = { params: Promise<{ id: string }> };

// GET — HTML imprimible de la OC (plantilla OC 2026 estilo Ferreyros)
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const compra = await prisma.compra.findUnique({
      where: { id: Number(id) },
      include: {
        proveedor: true,
        ubicacion: true,
        moneda: true,
        orden_trabajo: { select: { ot: true, tipo_codigo: true } },
        ot_repuestos: {
          include: {
            // `fabricante.nombre` se usa solo en este endpoint para limpiar la
            // descripción del PDF: si la `descripcion` del material termina con
            // ", {fabricante}", se quita ese sufijo (decisión del user — el
            // dato sigue intacto en la BD, solo cambia el render de la OC).
            material: {
              select: {
                codigo: true, descripcion: true, np: true, unidad_medida_codigo: true,
                fabricante: { select: { nombre: true } },
              },
            },
            orden_trabajo: { select: { ot: true, tipo_codigo: true } },
            // Para OCs derivadas de OT interna — el header de la plantilla
            // debe mostrar el código OIXXXXYY y el área del taller.
            orden_trabajo_interna: { select: { ot: true, area_taller: true } },
          },
          // Orden reproducible — mismo criterio que el editor de OC. Primero
          // `oc_orden_item` (posición que el user dejó al guardar en el
          // editor), luego fallback a `nro_req` → `item_req` → `id` para
          // OCs legacy que aún no tienen oc_orden_item seteado.
          orderBy: [
            { oc_orden_item: { sort: "asc", nulls: "last" } },
            { nro_req: "asc" },
            { item_req: "asc" },
            { id: "asc" },
          ],
        },
        // Items directos sin OT (catálogo): OCs "abiertas", OCs sueltas, etc.
        // Antes el PDF solo leía ot_repuestos → si la OC tenía sus items en
        // CompraDetalle el PDF salía en blanco. Ahora incluimos detalles para
        // poder mergearlos en la tabla del PDF.
        detalles: {
          include: {
            material: {
              select: {
                codigo: true, descripcion: true, np: true, unidad_medida_codigo: true,
                fabricante: { select: { nombre: true } },
              },
            },
          },
          orderBy: { id: "asc" },
        },
      },
    });

    if (!compra) {
      return NextResponse.json({ error: "OC no encontrada" }, { status: 404 });
    }

    const esc = (s: unknown) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const fmtDate = (d: Date | string | null | undefined) => {
      if (!d) return "";
      return new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
    };

    // Limpia la descripción del material para la plantilla de OC: si termina
    // con ", {fabricante}" (insensible a mayúsculas/espacios), quita ese
    // sufijo. La descripción almacenada en BD suele tener formato
    // "{nombre}, {N/P}, {FABRICANTE}" — en la OC el fabricante es ruido
    // visual (no aporta al proveedor que recibe el documento). NO modifica
    // la BD, solo el render del HTML.
    const quitarFabricanteDeDesc = (desc: string, fab?: string | null) => {
      const d = desc.trim();
      const f = (fab ?? "").trim();
      if (!f) return d;
      const re = new RegExp(`\\s*,\\s*${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
      return d.replace(re, "").trim();
    };

    // Items totales = ot_repuestos (con OT vinculada) + detalles directos
    // (sin OT, ej. OCs abiertas). Los `detalles` se mapean al mismo shape
    // que ot_repuestos para reusar el render. Los campos que no aplican a
    // un CompraDetalle (nro_req, item_req, orden_trabajo, etc.) van como null
    // y la plantilla los maneja como "" en la columna OT.
    type RepItem = (typeof compra.ot_repuestos)[number];
    const itemsDetalles = compra.detalles.map((d) => ({
      id: -d.id, // negativo para no chocar con id de ot_repuestos
      nro_req: null,
      item_req: null,
      ot_id: null,
      orden_trabajo_interna_id: null,
      material_id: d.material_id,
      material_codigo: d.material?.codigo ?? null,
      descripcion: d.material?.descripcion ?? null,
      texto: null,
      cantidad: d.cantidad,
      precio_unitario: d.precio_unitario,
      unidad_medida: d.material?.unidad_medida_codigo ?? null,
      material: d.material,
      orden_trabajo: null,
      orden_trabajo_interna: null,
    })) as unknown as RepItem[];
    // Si la OC tiene OTRepuesto, esos llevan prioridad (son los items "reales"
    // con vínculo a OT). Si NO tiene OTRepuesto, caemos a detalles. NO
    // mezclamos para evitar duplicados — la mayoría de las OCs tienen items
    // SOLO en una de las dos tablas.
    const items = compra.ot_repuestos.length > 0 ? compra.ot_repuestos : itemsDetalles;
    type Item = RepItem;
    const subtotal = Number(compra.subtotal || 0);
    const descuento = Number(compra.descuento || 0);
    const igv = Number(compra.impuesto || 0);
    const total = Number(compra.total || 0);
    // Si la OC está marcada como exonerada de IGV, no mostramos la línea de
    // IGV en la tabla de totales. Default true para compatibilidad con OCs
    // viejas (cuando el campo no existía).
    const aplicaIgv = compra.aplica_igv ?? true;
    const moneda = compra.moneda?.codigo || compra.moneda_codigo || "USD";
    const monedaLabel = moneda === "USD" ? "DOLARES" : moneda === "SOL" || moneda === "PEN" ? "SOLES" : moneda;
    // Códigos de OT formateados (V/S/REP para externas, OI para internas).
    // Junta sin duplicados — una OC puede mezclar items de varias OTs.
    const otCodigosFormateados = [
      ...new Set(
        items.flatMap((r: Item) => {
          const codes: string[] = [];
          if (r.orden_trabajo?.ot != null) {
            const c = formatOtCodigo(r.orden_trabajo.ot, r.orden_trabajo.tipo_codigo, "");
            if (c) codes.push(c);
          }
          if (r.orden_trabajo_interna?.ot != null) {
            const c = formatOtInternaCodigo(r.orden_trabajo_interna.ot, "");
            if (c) codes.push(c);
          }
          return codes;
        }),
      ),
    ];
    const otReferencias = otCodigosFormateados.join(", ");
    // Nombre del documento al guardar como PDF: "{NumeroOC}-{OT}-{PROVEEDOR}"
    // Sanitizar para que sea un nombre de archivo válido (sin /, \, :, espacios consecutivos).
    const ocFile = compra.numero_po.replace(/[^A-Za-z0-9\-_]/g, "");
    const otFile = otCodigosFormateados
      .join("_")
      .replace(/[^A-Za-z0-9\-_]/g, "");
    const provFile = (compra.proveedor?.nombre_comercial ?? compra.proveedor?.razon_social ?? "")
      .toUpperCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, "_")
      .replace(/[^A-Z0-9\-_]/g, "")
      .slice(0, 40);
    const tituloDocumento = [ocFile, otFile || "SinOT", provFile || "SinProv"].join("-");

    // Campo "REQ" del header de la plantilla:
    //   - Si la OC tiene items de OT interna → mostrar el ÁREA del taller
    //     (ej. "1.3.4. Infraestructura"). Si hay varias áreas distintas se
    //     listan separadas por coma.
    //   - Si solo tiene items de OT externa → "OPERACIONES" (legacy).
    const areasTallerSet = new Set<string>();
    for (const it of items as Item[]) {
      const area = it.orden_trabajo_interna?.area_taller;
      if (area) areasTallerSet.add(area);
    }
    const reqHeaderLabel = areasTallerSet.size > 0
      ? [...areasTallerSet].map((a) => areaTallerLabel(a)).join(", ")
      : "OPERACIONES";

    // Forma de pago: usa los campos de la OC si están seteados. Sino "CREDITO"
    // por compat con OCs anteriores al campo tipo_pago.
    let formaPagoLabel = "CREDITO";
    if (compra.tipo_pago) {
      const tp = compra.tipo_pago;
      if (tp === "CONTADO") formaPagoLabel = "CONTADO";
      else if (tp === "CREDITO") formaPagoLabel = compra.dias_credito && compra.dias_credito > 0
        ? `CRÉDITO ${compra.dias_credito} DÍAS`
        : "CRÉDITO";
      else if (tp === "TRANSFERENCIA") formaPagoLabel = "TRANSFERENCIA";
      else formaPagoLabel = tp;
    }

    // Firmas: si el nombre del usuario coincide con un archivo en public/firmas/
    // (mapeo en src/lib/firmas.ts), se renderiza la imagen sobre el nombre.
    // Si no coincide, solo se muestra el nombre como texto. Para nombres
    // genéricos como "Logistica" se usa el alias (Miriam) tanto en la firma
    // como en el rótulo, así no quedan en blanco en OCs viejas.
    const firmaElaboro = rutaFirmaDe(compra.usuario_solicita);
    const firmaAprobo = rutaFirmaDe(compra.usuario_aprueba);
    const nombreElaboro = nombreParaFirma(compra.usuario_solicita);
    const nombreAprobo = nombreParaFirma(compra.usuario_aprueba);
    const renderFirma = (rutaImg: string | null, nombre: string) =>
      rutaImg
        ? `<img class="img-firma" src="${esc(rutaImg)}" alt="Firma" /><div class="nombre">${esc(nombre)}</div>`
        : `<div class="nombre">${esc(nombre)}</div>`;

    // Filas mínimas dinámicas — antes era fijo en 8 lo que agregaba muchas
    // filas vacías cuando la OC tenía pocos items, empujando el documento a
    // 2 páginas. Ahora ajustamos al número de items con mínimo 5 (para que
    // la tabla mantenga estética sin perder compactidad).
    const MIN_ROWS = Math.max(5, items.length);
    const itemsRows: string[] = [];
    items.forEach((r: Item, idx: number) => {
      // Override por OC: si el user editó algún campo en /compras/[id]/editar
      // se persistió en oc_* y prevalece sobre el del req. Cast a `any` porque
      // el tipo inferido de ot_repuestos no incluye las columnas nuevas si
      // este endpoint se compiló antes del prisma generate.
      const rAny = r as unknown as {
        oc_descripcion?: string | null;
        oc_cantidad?: string | number | null;
        oc_precio_unitario?: string | number | null;
        oc_unidad_medida?: string | null;
      };
      const descCruda = rAny.oc_descripcion
        ?? r.material?.descripcion
        ?? r.descripcion
        ?? r.texto
        ?? "";
      const descripcion = quitarFabricanteDeDesc(descCruda, r.material?.fabricante?.nombre);
      const codigo = r.material?.codigo ?? r.material_codigo ?? "";
      const np = r.material?.np ?? "";
      const um = rAny.oc_unidad_medida
        ?? r.material?.unidad_medida_codigo
        ?? r.unidad_medida
        ?? "UN";
      const cant = Number(rAny.oc_cantidad ?? r.cantidad);
      const pu = Number(rAny.oc_precio_unitario ?? r.precio_unitario ?? 0);
      const tot = cant * pu;

      // Plantilla 2026: la columna "OT" muestra el código formateado de la OT
      // a la que pertenece el ítem (externa o interna). Cae al N/P o código de
      // material como fallback si el item no tiene OT (caso raro: items libres
      // creados sin vinculación).
      const otCodigoItem = r.orden_trabajo?.ot != null
        ? formatOtCodigo(r.orden_trabajo.ot, r.orden_trabajo.tipo_codigo, "")
        : r.orden_trabajo_interna?.ot != null
        ? formatOtInternaCodigo(r.orden_trabajo_interna.ot, "")
        : "";
      const colOt = otCodigoItem || np || codigo;

      itemsRows.push(`
        <tr>
          <td class="center">${idx + 1}</td>
          <td class="center">${cant}</td>
          <td class="center">${esc(colOt)}</td>
          <td class="desc">${esc(descripcion)}</td>
          <td class="center">${esc(um)}</td>
          <td class="center">${fmtDate(compra.fecha_entrega_esperada) || "-"}</td>
          <td class="right">${pu ? pu.toFixed(2) : "-"}</td>
          <td class="right">${tot ? tot.toFixed(2) : "-"}</td>
        </tr>
      `);
    });
    // Filas vacias para llenar hasta MIN_ROWS
    for (let i = items.length; i < MIN_ROWS; i++) {
      itemsRows.push(`
        <tr>
          <td class="center">${i + 1}</td>
          <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
        </tr>
      `);
    }

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${esc(tituloDocumento)}</title>
<style>
  /* Márgenes pequeños — maximizan el área útil para que toda la OC entre en
     1 página A4 aún con header/footer del navegador activos. */
  @page { size: A4 portrait; margin: 0.7cm 0.8cm; }
  @media print { .no-print { display: none !important; } }

  body { font-family: Calibri, Arial, sans-serif; font-size: 9pt; color: #000; margin: 0; }
  .no-print { text-align:center; padding:12px; background:#e6f7ff; border-bottom:2px solid #1890ff; }
  .no-print button { background:#1890ff; color:#fff; border:none; padding:8px 20px; font-size:13px; cursor:pointer; border-radius:4px; }
  .no-print button:hover { background:#096dd9; }

  .container { max-width: 21cm; margin: 0 auto; padding: 4px; }

  /* Cabecera */
  .header-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  .header-table td { vertical-align: top; padding: 2px 4px; font-size: 8.5pt; border: none; }
  .company-info { width: 60%; }
  .company-header { display: flex; align-items: center; gap: 14px; }
  .company-logo { width: 160px; height: auto; max-height: 95px; object-fit: contain; flex-shrink: 0; }
  .company-text { flex: 1; min-width: 0; }
  .company-text .company-name { font-size: 13pt; font-weight: bold; color: #1C2B5B; line-height: 1.1; }
  .company-data { font-size: 8pt; color: #333; line-height: 1.4; margin-top: 4px; }
  .oc-info { width: 40%; }
  .oc-info table { width: 100%; border-collapse: collapse; }
  .oc-info td { border: 1pt solid #333; padding: 3px 6px; font-size: 8.5pt; }
  .oc-info .lbl { background: #f0f0f0; font-weight: bold; width: 45%; }

  /* Titulo */
  h1.titulo {
    background: #1C2B5B; color: #fff; text-align: center;
    padding: 4px; margin: 4px 0; font-size: 11pt; letter-spacing: 2pt;
  }

  /* Datos proveedor */
  .prov-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  .prov-table td { border: 1pt solid #333; padding: 3px 6px; font-size: 8.5pt; vertical-align: top; }
  .prov-table td.lbl { background: #f0f0f0; font-weight: bold; width: 12%; }
  .prov-table td.val { width: 38%; }

  /* Tabla items */
  .items-table { width: 100%; border-collapse: collapse; margin: 4px 0; }
  .items-table th {
    background: #1C2B5B; color: #fff; padding: 3px; font-size: 7.5pt;
    border: 1pt solid #333; text-align: center; font-weight: 600;
  }
  .items-table td { border: 1pt solid #333; padding: 2px 4px; font-size: 8pt; vertical-align: top; }
  .items-table td.center { text-align: center; }
  .items-table td.right { text-align: right; }
  .items-table td.desc { text-align: left; }

  /* Totales */
  .totales-table { width: 50%; margin-left: 50%; border-collapse: collapse; margin-top: 4px; }
  .totales-table td { border: 1pt solid #333; padding: 3px 8px; font-size: 8.5pt; }
  .totales-table td.lbl { background: #f0f0f0; font-weight: bold; width: 40%; text-align: right; }
  .totales-table td.val { text-align: right; width: 60%; }
  .totales-table tr.total-row td { background: #1C2B5B; color: #fff; font-weight: bold; font-size: 10pt; }

  /* Firmas — alturas reducidas para que toda la OC entre en 1 página. */
  .firmas { margin-top: 8px; width: 100%; border-collapse: collapse; }
  .firmas td { border: 1pt solid #333; padding: 4px; font-size: 8pt; text-align: center; width: 33%; vertical-align: bottom; height: 70px; }
  .firmas .rol { font-weight: bold; color: #1C2B5B; margin-bottom: 2px; font-size: 7.5pt; }
  .firmas .img-firma { max-height: 40px; max-width: 90%; object-fit: contain; display: block; margin: 0 auto 2px; }
  .firmas .nombre { margin-top: 2px; }

  /* Factura */
  .factura-box { margin-top: 6px; border: 1pt solid #333; padding: 4px 6px; font-size: 7.5pt; background: #fafafa; line-height: 1.3; }
  .factura-box .titulo { font-weight: bold; color: #1C2B5B; margin-bottom: 2px; }

  /* Notas — fuente y line-height más chicos para no inflar la última página. */
  .notas { margin-top: 6px; font-size: 6.5pt; color: #333; line-height: 1.3; }
  .notas .titulo { font-weight: bold; margin-bottom: 2px; color: #1C2B5B; font-size: 7.5pt; }
  .notas ol { margin: 0; padding-left: 14px; }
  .notas li { margin-bottom: 1px; }

  /* Pie único con Elaborado por + Aprobado por (información clave) y formato. */
  .pie {
    margin-top: 6px; padding-top: 3px;
    font-size: 7pt; color: #333;
    border-top: 1pt solid #ddd;
    display: flex; justify-content: space-between; align-items: center; gap: 8px;
  }
  .pie .usuario { text-align: left; font-weight: 600; color: #1C2B5B; }
  .pie .aprobador { text-align: center; font-weight: 600; color: #1C2B5B; }
  .pie .formato { text-align: right; }
</style>
</head>
<body>

<div class="no-print">
  <button onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button>
  <span style="margin-left:10px;font-size:11px;color:#666">
    (Usa "Guardar como PDF" en el diálogo de impresión)
  </span>
  <div style="margin-top:6px;font-size:12px;color:#cf1322;font-weight:600">
    ⚠️ IMPORTANTE: en el diálogo de impresión abrí <b>"Más configuraciones"</b> y
    <b>DESMARCÁ "Encabezados y pies de página"</b>. Sin eso, el navegador agrega
    la URL arriba y la fecha abajo — y el documento se va a 2 páginas.
  </div>
</div>

<div class="container">

  <!-- Cabecera corporativa -->
  <table class="header-table">
    <tr>
      <td class="company-info">
        <div class="company-header">
          <img src="/LOGO-HPK-INVERSIONEs.png" alt="HpyK" class="company-logo" />
          <div class="company-text">
            <div class="company-name">HP&amp;K INVERSIONES S.A.C.</div>
            <div class="company-data">
              Parque Industrial Río Seco Mz C lote 17,<br/>
              Cerro Colorado - Arequipa - Perú<br/>
              ventas@hpkinv.com
            </div>
          </div>
        </div>
      </td>
      <td class="oc-info">
        <table>
          <tr><td class="lbl">ORDEN DE COMPRA N°:</td><td><b>${esc(compra.numero_po)}</b></td></tr>
          <tr><td class="lbl">Proyecto:</td><td>AREQUIPA</td></tr>
          <tr><td class="lbl">OT:</td><td>${esc(otReferencias || "-")}</td></tr>
          <tr><td class="lbl">${areasTallerSet.size > 0 ? "Área:" : "REQ:"}</td><td>${esc(reqHeaderLabel)}</td></tr>
        </table>
      </td>
    </tr>
  </table>

  <!-- Titulo -->
  <h1 class="titulo">ORDEN DE COMPRA</h1>

  <!-- Datos proveedor -->
  <table class="prov-table">
    <tr>
      <td class="lbl">Señor (es):</td>
      <td class="val">${esc(compra.proveedor?.razon_social ?? "-")}</td>
      <td class="lbl">Ruc:</td>
      <td class="val">${esc(compra.proveedor?.ruc ?? "-")}</td>
    </tr>
    <tr>
      <td class="lbl">Dirección:</td>
      <td class="val">${esc(compra.proveedor?.direccion ?? "-")}</td>
      <td class="lbl">Fecha Emisión:</td>
      <td class="val">${fmtDate(compra.fecha_solicitud)}</td>
    </tr>
    <tr>
      <td class="lbl">Teléfono:</td>
      <td class="val">${esc(compra.proveedor?.telefono ?? "-")}</td>
      <td class="lbl">Ref. Pedido:</td>
      <td class="val">${esc(compra.numero_req ?? "-")}</td>
    </tr>
    <tr>
      <td class="lbl">Atención:</td>
      <td class="val">${esc(compra.proveedor?.contacto ?? "-")}</td>
      <td class="lbl">Moneda:</td>
      <td class="val">${esc(monedaLabel)}</td>
    </tr>
    <tr>
      <td class="lbl">E-mail:</td>
      <td class="val">${esc(compra.proveedor?.email ?? "-")}</td>
      <td class="lbl">Forma de pago:</td>
      <td class="val">${esc(formaPagoLabel)}</td>
    </tr>
    <tr>
      <td class="lbl">Lugar entrega:</td>
      <td class="val" colspan="3">Parque Industrial Río Seco Mz C lote 17, Cerro Colorado - Arequipa - Perú</td>
    </tr>
  </table>

  <!-- Items -->
  <table class="items-table">
    <thead>
      <tr>
        <th style="width:5%">ITEM</th>
        <th style="width:7%">CANT.</th>
        <th style="width:14%">OT</th>
        <th style="width:38%">DESCRIPCION</th>
        <th style="width:6%">UN</th>
        <th style="width:10%">F. ENTREGA</th>
        <th style="width:10%">V.UNITARIO</th>
        <th style="width:10%">V. TOTAL</th>
      </tr>
    </thead>
    <tbody>
      ${itemsRows.join("")}
    </tbody>
  </table>

  <!-- Totales -->
  <table class="totales-table">
    <tr>
      <td class="lbl">Subtotal</td>
      <td class="val">${moneda} ${subtotal.toFixed(2)}</td>
    </tr>
    <tr>
      <td class="lbl">Descuento</td>
      <td class="val">${moneda} ${descuento.toFixed(2)}</td>
    </tr>
    ${aplicaIgv ? `
    <tr>
      <td class="lbl">IGV (18%)</td>
      <td class="val">${moneda} ${igv.toFixed(2)}</td>
    </tr>` : `
    <tr>
      <td class="lbl">IGV</td>
      <td class="val"><i>Exonerado</i></td>
    </tr>`}
    <tr class="total-row">
      <td class="lbl" style="color:#fff">TOTAL</td>
      <td class="val">${moneda} ${total.toFixed(2)}</td>
    </tr>
  </table>

  <!-- Nota factura -->
  <div class="factura-box">
    <div class="titulo">Facturar a:</div>
    <div>HP&amp;K INVERSIONES S.A.C.</div>
    <div>Parque Industrial Río Seco Mz C lote 17, Cerro Colorado - Arequipa - Perú</div>
    <div style="margin-top:4px"><b>Entregar en:</b> Parque Industrial Río Seco Mz C lote 17, Cerro Colorado - Arequipa - Perú</div>
  </div>

  <!-- Firmas -->
  <table class="firmas">
    <tr>
      <td>
        <div class="rol">ELABORADO POR:</div>
        ${renderFirma(firmaElaboro, nombreElaboro ?? compra.usuario_solicita ?? "")}
      </td>
      <td>
        <div class="rol">APROBADO POR:</div>
        ${renderFirma(firmaAprobo, nombreAprobo ?? compra.usuario_aprueba ?? "_______________")}
      </td>
      <td>
        <div class="rol">ACEPTADO POR:</div>
        <div class="nombre">PROVEEDOR</div>
      </td>
    </tr>
  </table>

  <!-- Notas -->
  <div class="notas">
    <div class="titulo">Notas Importantes:</div>
    <ol>
      <li>Esta ORDEN DE COMPRA tiene validez hasta la fecha indicada como "Fecha Entrega Proveedor". De no cumplir con la fecha acordada, esta ORDEN DE COMPRA quedará ANULADA.</li>
      <li>Al momento de entregar el servicio y/o bien, adjuntar GUÍA DE REMISIÓN ORIGINAL, 01 fotocopia de la ORDEN DE COMPRA, 01 fotocopia de certificados o informes según corresponda.</li>
      <li>La FACTURA ORIGINAL se entregará con copia SUNAT y NEGOCIABLE, 01 fotocopia de GUÍA DE REMISIÓN, 01 fotocopia de la ORDEN DE COMPRA y 01 fotocopia de la COTIZACIÓN.</li>
      <li>Es obligatorio escribir en la Factura el número de Orden de Compra y el número de Guía de Remisión.</li>
      <li>La recepción de esta Orden de Compra implica la aceptación y conformidad de los términos y condiciones particulares del servicio, compra y suministros.</li>
      <li>Asimismo, el Proveedor declara haber leído y aceptar lo señalado en el presente documento.</li>
    </ol>
  </div>

  <div class="pie">
    <span class="usuario">Elaborado por: ${esc(nombreElaboro ?? compra.usuario_solicita ?? "—")}</span>
    <span class="aprobador">Aprobado por: ${esc(nombreAprobo ?? compra.usuario_aprueba ?? "—")}</span>
    <span class="formato">FORMATO OC - Versión: 01</span>
  </div>

</div>

<script>
  // Auto-abrir dialogo de impresion
  setTimeout(() => { window.print(); }, 400);
</script>

</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    console.error("GET /api/compras/[id]/pdf error:", error);
    return NextResponse.json({ error: "Error al generar PDF" }, { status: 500 });
  }
}
