import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const catalogs: [string, () => Promise<number>][] = [
    ["Moneda", () => p.moneda.count()],
    ["Planta", () => p.planta.count()],
    ["Area", () => p.area.count()],
    ["SubArea", () => p.subArea.count()],
    ["UnidadMedida", () => p.unidadMedida.count()],
    ["Fabricante", () => p.fabricante.count()],
    ["Categoria (material)", () => p.categoria.count()],
    ["Clasificacion", () => p.clasificacion.count()],
    ["Ubicacion", () => p.ubicacion.count()],
    ["StatusEquipo", () => p.statusEquipo.count()],
    ["TipoEquipo", () => p.tipoEquipo.count()],
    ["Criticidad", () => p.criticidad.count()],
    ["StatusEstrategia", () => p.statusEstrategia.count()],
    ["TipoEstrategia", () => p.tipoEstrategia.count()],
    ["TipoTarea", () => p.tipoTarea.count()],
    ["TipoCodRep", () => p.tipoCodRep.count()],
    ["CategoriaCodRep", () => p.categoriaCodRep.count()],
    ["FlotaEquipo", () => p.flotaEquipo.count()],
    ["Posicion", () => p.posicion.count()],
    ["Componente", () => p.componente.count()],
    ["OperacionReparacion", () => p.operacionReparacion.count()],
    ["StatusRequerimiento", () => p.statusRequerimiento.count()],
    ["StatusCotizacion", () => p.statusCotizacion.count()],
    ["StatusOC", () => p.statusOC.count()],
    ["Cliente", () => p.cliente.count()],
  ];
  for (const [name, fn] of catalogs) {
    const n = await fn();
    console.log((n === 0 ? "✗" : "✓").padEnd(2), name.padEnd(25), "count:", n);
  }
  await p.$disconnect();
}

main();
