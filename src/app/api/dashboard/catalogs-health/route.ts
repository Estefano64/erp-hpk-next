import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/dashboard/catalogs-health
// Devuelve KPIs de completitud por catálogo. Para cada uno:
//   total: registros activos
//   gaps: [{ key, label, count, query }]
//     - key: id del gap (ej. "sin_precio")
//     - label: descripción humana ("Sin precio")
//     - count: cuántos registros tienen ese gap
//     - query: querystring para filtrar la página de listado
//
// Diseño: contar gaps en paralelo, no calcular nada complejo en cliente.
export async function GET() {
  try {
    const [
      // Material
      matTotal, matSinPrecio, matSinFab, matSinNp,
      // Cliente
      cliTotal, cliSinRuc, cliSinContacto, cliSinTel,
      // Proveedor
      provTotal, provSinContacto, provSinTel, provSinEmail,
      // CodigoReparacion (servicios para OTs)
      crTotal, crSinPrecio, crSinFab, crSinTareas,
      // Tareas de reparación (con cod_rep)
      tareaRepMacSinMat, tareaRepMacTotal,
      // Equipo
      eqTotal, eqSinFab, eqSinSerie, eqSinPrecio, eqSinUbic,
      // Mantenimiento taller (estrategias + tareas mantenimiento)
      estrTotal, estrSinEquipo, estrSinTareas,
      tareaMantSinMat, tareaMantMacTotal,
      // Servicios (separados)
      svcRepTotal, svcMntTotal,
      // Fabricante / Ubicacion (catálogos chicos, solo total)
      fabTotal, ubicTotal,
    ] = await Promise.all([
      prisma.material.count({ where: { activo: true } }),
      prisma.material.count({ where: { activo: true, OR: [{ precio: null }, { precio: 0 }] } }),
      prisma.material.count({ where: { activo: true, fabricante_codigo: null } }),
      prisma.material.count({ where: { activo: true, np: null } }),

      prisma.cliente.count({ where: { activo: true } }),
      prisma.cliente.count({ where: { activo: true, ruc: null } }),
      prisma.cliente.count({ where: { activo: true, contacto_principal: null } }),
      prisma.cliente.count({ where: { activo: true, telefono: null } }),

      prisma.proveedor.count({ where: { activo: true } }),
      prisma.proveedor.count({ where: { activo: true, contacto: null } }),
      prisma.proveedor.count({ where: { activo: true, telefono: null } }),
      prisma.proveedor.count({ where: { activo: true, email: null } }),

      prisma.codigoReparacion.count({ where: { activo: true } }),
      prisma.codigoReparacion.count({ where: { activo: true, OR: [{ precio: null }, { precio: 0 }] } }),
      prisma.codigoReparacion.count({ where: { activo: true, fabricante_codigo: null } }),
      prisma.codigoReparacion.count({ where: { activo: true, tareas: { none: {} } } }),

      prisma.tarea.count({ where: { cod_rep_codigo: { not: null }, tipo_codigo: "MAC", material_codigo: null } }),
      prisma.tarea.count({ where: { cod_rep_codigo: { not: null }, tipo_codigo: "MAC" } }),

      prisma.equipo.count({ where: { activo: true } }),
      prisma.equipo.count({ where: { activo: true, fabricante_codigo: null } }),
      prisma.equipo.count({ where: { activo: true, numero_serie: null } }),
      prisma.equipo.count({ where: { activo: true, OR: [{ precio: null }, { precio: 0 }] } }),
      prisma.equipo.count({ where: { activo: true, ubicacion_codigo: null } }),

      prisma.estrategia.count(),
      prisma.estrategia.count({ where: { equipo_codigo: null } }),
      prisma.estrategia.count({ where: { tareas: { none: {} } } }),
      prisma.tarea.count({ where: { estrategia_id: { not: null }, tipo_codigo: "MAC", material_codigo: null } }),
      prisma.tarea.count({ where: { estrategia_id: { not: null }, tipo_codigo: "MAC" } }),

      prisma.servicioReparacion.count({ where: { activo: true } }),
      prisma.servicioMantenimiento.count({ where: { activo: true } }),

      prisma.fabricante.count({ where: { activo: true } }),
      prisma.ubicacion.count({ where: { activo: true } }),
    ]);

    const data = [
      {
        key: "material",
        label: "Materiales",
        href: "/materiales",
        total: matTotal,
        gaps: [
          { key: "sin_precio", label: "Sin precio", count: matSinPrecio, href: "/materiales?gap=sin_precio" },
          { key: "sin_fabricante", label: "Sin fabricante", count: matSinFab, href: "/materiales?gap=sin_fabricante" },
          { key: "sin_np", label: "Sin Nº de Parte", count: matSinNp, href: "/materiales?gap=sin_np" },
        ],
      },
      {
        key: "cliente",
        label: "Clientes",
        href: "/clientes",
        total: cliTotal,
        gaps: [
          { key: "sin_ruc", label: "Sin RUC", count: cliSinRuc, href: "/clientes?gap=sin_ruc" },
          { key: "sin_contacto", label: "Sin contacto", count: cliSinContacto, href: "/clientes?gap=sin_contacto" },
          { key: "sin_telefono", label: "Sin teléfono", count: cliSinTel, href: "/clientes?gap=sin_telefono" },
        ],
      },
      {
        key: "proveedor",
        label: "Proveedores",
        href: "/proveedores",
        total: provTotal,
        gaps: [
          { key: "sin_contacto", label: "Sin contacto", count: provSinContacto, href: "/proveedores?gap=sin_contacto" },
          { key: "sin_telefono", label: "Sin teléfono", count: provSinTel, href: "/proveedores?gap=sin_telefono" },
          { key: "sin_email", label: "Sin email", count: provSinEmail, href: "/proveedores?gap=sin_email" },
        ],
      },
      {
        key: "codigo_reparacion",
        label: "Códigos de Reparación",
        href: "/codigos-reparacion",
        total: crTotal,
        gaps: [
          { key: "sin_tareas", label: "Sin tareas (template vacío)", count: crSinTareas },
          { key: "sin_precio", label: "Sin precio", count: crSinPrecio },
          { key: "sin_fabricante", label: "Sin fabricante", count: crSinFab },
          { key: "tareas_mac_sin_mat", label: "Tareas MAC sin material vinculado", count: tareaRepMacSinMat, denominator: tareaRepMacTotal },
        ],
      },
      {
        key: "servicio_reparacion",
        label: "Servicios de Reparación (OT)",
        href: "/catalogos/servicioReparacion",
        total: svcRepTotal,
        gaps: [],
      },
      {
        key: "equipo",
        label: "Equipos del Taller",
        href: "/mantenimiento/equipos",
        total: eqTotal,
        gaps: [
          { key: "sin_fabricante", label: "Sin fabricante", count: eqSinFab },
          { key: "sin_serie", label: "Sin Nº de serie", count: eqSinSerie },
          { key: "sin_precio", label: "Sin precio", count: eqSinPrecio },
          { key: "sin_ubicacion", label: "Sin ubicación", count: eqSinUbic },
        ],
      },
      {
        key: "estrategia",
        label: "Estrategias de Mantenimiento",
        href: "/catalogos/estrategia",
        total: estrTotal,
        gaps: [
          { key: "sin_equipo", label: "Sin equipo asignado", count: estrSinEquipo },
          { key: "sin_tareas", label: "Sin tareas (template vacío)", count: estrSinTareas },
          { key: "mac_sin_material", label: "Tareas MAC sin material vinculado", count: tareaMantSinMat, denominator: tareaMantMacTotal },
        ],
      },
      {
        key: "servicio_mantenimiento",
        label: "Servicios de Mantenimiento Taller",
        href: "/catalogos/servicioMantenimiento",
        total: svcMntTotal,
        gaps: [],
      },
      {
        key: "fabricante",
        label: "Fabricantes",
        href: "/catalogos/fabricante",
        total: fabTotal,
        gaps: [],
      },
      {
        key: "ubicacion",
        label: "Ubicaciones",
        href: "/catalogos/ubicacion",
        total: ubicTotal,
        gaps: [],
      },
    ];

    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/dashboard/catalogs-health error:", error);
    return NextResponse.json({ error: "Error al calcular salud de catálogos" }, { status: 500 });
  }
}
