import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hosts adicionales permitidos durante `next dev` (HMR + assets).
  // Necesario para probar el ERP desde celular en la misma red WiFi.
  // Si tu IP local cambia (DHCP), agregala acá y reiniciá `npm run dev`.
  allowedDevOrigins: ["192.168.1.18"],
};

export default nextConfig;
