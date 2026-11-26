// Build de navegador de exceljs (el entry por defecto usa APIs de Node).
// Los tipos son los mismos del paquete principal.
declare module "exceljs/dist/exceljs.min.js" {
  import ExcelJS from "exceljs";
  export default ExcelJS;
}
