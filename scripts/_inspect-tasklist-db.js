// Inspecciona lo que hay actualmente en BD sobre task lists.
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  const tlCount = await p.taskList.count();
  const tliCount = await p.taskListItem.count();
  console.log("TaskList rows:", tlCount);
  console.log("TaskListItem rows:", tliCount);

  if (tlCount > 0) {
    const sample = await p.taskList.findMany({
      take: 5,
      select: { id: true, maquina_taller: true, actividad_codigo: true, descripcion: true },
    });
    console.log("\nSample TaskList:");
    for (const s of sample) {
      console.log(`  id=${s.id} [${s.actividad_codigo}] ${s.maquina_taller} | ${s.descripcion.slice(0, 60)}`);
    }

    const maquinas = await p.taskList.groupBy({ by: ["maquina_taller"], _count: true });
    console.log(`\nMáquinas distintas en task_list (${maquinas.length}):`);
    for (const m of maquinas.slice(0, 35)) {
      console.log(`  ${m.maquina_taller}  (${m._count} tasks)`);
    }

    const pms = await p.taskList.groupBy({ by: ["actividad_codigo"], _count: true });
    console.log("\nNiveles PM:");
    for (const pm of pms) console.log(`  ${pm.actividad_codigo}: ${pm._count} tasks`);
  }

  const estr = await p.estrategia.findMany({
    where: { codigo: { in: ["PM1", "PM2", "PM3", "PM4"] } },
    select: { codigo: true, descripcion: true, equipo_codigo: true },
  });
  console.log(`\nEstrategias PM existentes (${estr.length}):`);
  for (const e of estr) {
    console.log(`  ${e.codigo} | equipo=${e.equipo_codigo ?? "(null)"} | ${e.descripcion.slice(0, 50)}`);
  }

  // Equipos cuya descripción contenga "Banco" o "Torno" o "Prensa" — para ver
  // si alguno ya está catalogado y evitar duplicar.
  const equiposPosibles = await p.equipo.findMany({
    where: {
      OR: [
        { descripcion: { contains: "Banco de Pruebas", mode: "insensitive" } },
        { descripcion: { contains: "Torno", mode: "insensitive" } },
        { descripcion: { contains: "Prensa", mode: "insensitive" } },
        { descripcion: { contains: "Soldar", mode: "insensitive" } },
        { descripcion: { contains: "Mandrinadora", mode: "insensitive" } },
      ],
    },
    select: { codigo: true, descripcion: true },
  });
  console.log(`\nEquipos en BD que parecen máquinas de taller (${equiposPosibles.length}):`);
  for (const e of equiposPosibles) console.log(`  ${e.codigo}  ${e.descripcion}`);

  await p.$disconnect();
})();
