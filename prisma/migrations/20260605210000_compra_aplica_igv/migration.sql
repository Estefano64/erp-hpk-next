-- Flag por-OC para crear ordenes de compra sin IGV (exoneradas, importaciones,
-- servicios sin IGV, proveedores no domiciliados, etc.). Cuando es false, el
-- backend calcula impuesto=0 y el PDF de la OC omite la linea de IGV.
-- Default true → las OCs historicas siguen comportandose igual que antes.
ALTER TABLE "compras"
ADD COLUMN "aplica_igv" BOOLEAN NOT NULL DEFAULT true;
