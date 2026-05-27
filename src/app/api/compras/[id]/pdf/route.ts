import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rutaFirmaDe } from "@/lib/firmas";

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
        orden_trabajo: { select: { ot: true } },
        ot_repuestos: {
          include: {
            material: { select: { codigo: true, descripcion: true, np: true, unidad_medida_codigo: true } },
            orden_trabajo: { select: { ot: true } },
          },
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

    const items = compra.ot_repuestos as typeof compra.ot_repuestos;
    type Item = (typeof compra.ot_repuestos)[number];
    const subtotal = Number(compra.subtotal || 0);
    const igv = Number(compra.impuesto || 0);
    const total = Number(compra.total || 0);
    const moneda = compra.moneda?.codigo || compra.moneda_codigo || "USD";
    const monedaLabel = moneda === "USD" ? "DOLARES" : moneda === "SOL" || moneda === "PEN" ? "SOLES" : moneda;
    const otReferencias = [...new Set(items.map((r: Item) => r.orden_trabajo?.ot).filter(Boolean))].join(", ");
    // Nombre del documento al guardar como PDF: "OC-{OT}-{PROVEEDOR}"
    // Sanitizar para que sea un nombre de archivo válido (sin /, \, :, espacios consecutivos).
    const otFile = [...new Set(items.map((r: Item) => r.orden_trabajo?.ot).filter(Boolean))]
      .join("_")
      .replace(/[^A-Za-z0-9\-_]/g, "");
    const provFile = (compra.proveedor?.nombre_comercial ?? compra.proveedor?.razon_social ?? "")
      .toUpperCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, "_")
      .replace(/[^A-Z0-9\-_]/g, "")
      .slice(0, 40);
    const tituloDocumento = ["OC", otFile || "SinOT", provFile || "SinProv"].join("-");

    // Firmas: si el nombre del usuario coincide con un archivo en public/firmas/
    // (mapeo en src/lib/firmas.ts), se renderiza la imagen sobre el nombre.
    // Si no coincide, solo se muestra el nombre como texto.
    const firmaElaboro = rutaFirmaDe(compra.usuario_solicita);
    const firmaAprobo = rutaFirmaDe(compra.usuario_aprueba);
    const renderFirma = (rutaImg: string | null, nombre: string) =>
      rutaImg
        ? `<img class="img-firma" src="${esc(rutaImg)}" alt="Firma" /><div class="nombre">${esc(nombre)}</div>`
        : `<div class="nombre">${esc(nombre)}</div>`;

    // Formar filas de items (minimo 8 filas para que luzca formal como la plantilla)
    const MIN_ROWS = 8;
    const itemsRows: string[] = [];
    items.forEach((r: Item, idx: number) => {
      const descripcion = r.material?.descripcion ?? r.descripcion ?? r.texto ?? "";
      const codigo = r.material?.codigo ?? r.material_codigo ?? "";
      const np = r.material?.np ?? "";
      const um = r.material?.unidad_medida_codigo ?? r.unidad_medida ?? "UN";
      const cant = Number(r.cantidad);
      const pu = r.precio_unitario ? Number(r.precio_unitario) : 0;
      const tot = cant * pu;

      itemsRows.push(`
        <tr>
          <td class="center">${idx + 1}</td>
          <td class="center">${cant}</td>
          <td class="center">${esc(np || codigo)}</td>
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
  @page { size: A4 portrait; margin: 1.2cm 1cm; }
  @media print { .no-print { display: none !important; } }

  body { font-family: Calibri, Arial, sans-serif; font-size: 9pt; color: #000; margin: 0; }
  .no-print { text-align:center; padding:12px; background:#e6f7ff; border-bottom:2px solid #1890ff; }
  .no-print button { background:#1890ff; color:#fff; border:none; padding:8px 20px; font-size:13px; cursor:pointer; border-radius:4px; }
  .no-print button:hover { background:#096dd9; }

  .container { max-width: 21cm; margin: 0 auto; padding: 10px; }

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
    padding: 6px; margin: 8px 0; font-size: 12pt; letter-spacing: 2pt;
  }

  /* Datos proveedor */
  .prov-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  .prov-table td { border: 1pt solid #333; padding: 3px 6px; font-size: 8.5pt; vertical-align: top; }
  .prov-table td.lbl { background: #f0f0f0; font-weight: bold; width: 12%; }
  .prov-table td.val { width: 38%; }

  /* Tabla items */
  .items-table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  .items-table th {
    background: #1C2B5B; color: #fff; padding: 4px; font-size: 8pt;
    border: 1pt solid #333; text-align: center; font-weight: 600;
  }
  .items-table td { border: 1pt solid #333; padding: 4px; font-size: 8.5pt; vertical-align: top; min-height: 20px; }
  .items-table td.center { text-align: center; }
  .items-table td.right { text-align: right; }
  .items-table td.desc { text-align: left; }

  /* Totales */
  .totales-table { width: 50%; margin-left: 50%; border-collapse: collapse; margin-top: 4px; }
  .totales-table td { border: 1pt solid #333; padding: 3px 8px; font-size: 8.5pt; }
  .totales-table td.lbl { background: #f0f0f0; font-weight: bold; width: 40%; text-align: right; }
  .totales-table td.val { text-align: right; width: 60%; }
  .totales-table tr.total-row td { background: #1C2B5B; color: #fff; font-weight: bold; font-size: 10pt; }

  /* Firmas */
  .firmas { margin-top: 18px; width: 100%; border-collapse: collapse; }
  .firmas td { border: 1pt solid #333; padding: 8px; font-size: 8pt; text-align: center; width: 33%; vertical-align: bottom; height: 110px; }
  .firmas .rol { font-weight: bold; color: #1C2B5B; margin-bottom: 4px; }
  .firmas .img-firma { max-height: 60px; max-width: 90%; object-fit: contain; display: block; margin: 0 auto 4px; }
  .firmas .nombre { margin-top: 4px; }

  /* Factura */
  .factura-box { margin-top: 12px; border: 1pt solid #333; padding: 8px; font-size: 8pt; background: #fafafa; }
  .factura-box .titulo { font-weight: bold; color: #1C2B5B; margin-bottom: 3px; }

  /* Notas */
  .notas { margin-top: 14px; font-size: 7.5pt; color: #333; line-height: 1.5; }
  .notas .titulo { font-weight: bold; margin-bottom: 4px; color: #1C2B5B; font-size: 8.5pt; }
  .notas ol { margin: 0; padding-left: 18px; }

  /* Pie */
  .pie {
    margin-top: 14px; padding-top: 4px;
    font-size: 7pt; color: #666;
    border-top: 1pt solid #ddd;
    display: flex; justify-content: space-between; align-items: center; gap: 8px;
  }
  .pie .usuario { text-align: left; font-weight: 600; color: #1C2B5B; }
  .pie .formato { text-align: right; }

  /* Pie fijo que aparece en cada página al imprimir */
  .pie-fijo {
    position: fixed; bottom: 0.3cm; left: 1cm; right: 1cm;
    font-size: 6.5pt; color: #666;
    border-top: 1pt solid #ddd; padding-top: 3px;
    display: flex; justify-content: space-between;
  }
  .pie-fijo .usuario { font-weight: 600; color: #1C2B5B; }
  @media screen { .pie-fijo { display: none; } }
</style>
</head>
<body>

<div class="no-print">
  <button onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button>
  <span style="margin-left:10px;font-size:11px;color:#666">
    (Usa "Guardar como PDF" en el diálogo de impresión)
  </span>
  <div style="margin-top:6px;font-size:11px;color:#cf1322">
    💡 En "Más configuraciones" del diálogo, <b>desmarca "Encabezados y pies"</b> para ocultar la URL del navegador (localhost/...).
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
          <tr><td class="lbl">REQ:</td><td>OPERACIONES</td></tr>
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
      <td class="val">CREDITO</td>
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
        <th style="width:14%">Nro. PARTE/COD</th>
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
      <td class="val">${moneda} 0.00</td>
    </tr>
    <tr>
      <td class="lbl">IGV (18%)</td>
      <td class="val">${moneda} ${igv.toFixed(2)}</td>
    </tr>
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
        ${renderFirma(firmaElaboro, compra.usuario_solicita ?? "")}
      </td>
      <td>
        <div class="rol">APROBADO POR:</div>
        ${renderFirma(firmaAprobo, compra.usuario_aprueba ?? "_______________")}
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
    <span class="usuario">Elaborado por: ${esc(compra.usuario_solicita ?? "—")}</span>
    <span class="formato">FORMATO OC - Versión: 01</span>
  </div>

</div>

<!-- Pie fijo que se repite en cada página impresa -->
<div class="pie-fijo">
  <span class="usuario">Elaborado por: ${esc(compra.usuario_solicita ?? "—")}</span>
  <span>OC ${esc(compra.numero_po)} · HP&amp;K INVERSIONES S.A.C.</span>
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
