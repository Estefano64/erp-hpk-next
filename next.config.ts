import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hosts adicionales permitidos durante `next dev` (HMR + assets).
  // Necesario para probar el ERP desde celular en la misma red WiFi.
  // Si tu IP local cambia (DHCP), agregala acá y reiniciá `npm run dev`.
  allowedDevOrigins: ["192.168.1.18"],

  // pdfkit (y su dep fontkit) son CommonJS y rompen el bundling de Turbopack
  // por incompatibilidad de @swc/helpers (`applyDecoratedDescriptor` no existe
  // en versiones nuevas). Marcándolos como external los carga directamente con
  // require de Node a runtime en lugar de empaquetarlos.
  serverExternalPackages: ["pdfkit", "fontkit"],
};

export default nextConfig;
