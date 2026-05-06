import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

async function main() {
  const candidates = [
    "Torno SP6-3000",
    "Torno JP MAC",
    "Máquina de Soldar Lincoln 350 XL Construction",
    "Máquina de Soldar Lincoln 350 XP Power Conect",
    "Maquina de Soldar Powertec 450",
    "Montacargas",
  ];
  for (const name of candidates) {
    const words = name.split(/\s+/).filter((w) => w.length > 2);
    const eqs = await p.equipo.findMany({
      where: { OR: words.map((w) => ({ descripcion: { contains: w, mode: "insensitive" as const } })) },
      select: { codigo: true, descripcion: true },
      take: 5,
    });
    console.log("Buscando:", name);
    for (const e of eqs) console.log("  ?", e.codigo, e.descripcion);
    console.log("");
  }
  await p.$disconnect();
}

main();
