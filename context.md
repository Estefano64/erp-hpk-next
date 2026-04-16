# CONTEXT.md — ERP Mantenimiento Industrial

## Stack
- Frontend + API: Next.js 14 (App Router) + TypeScript
- ORM: Prisma
- DB: PostgreSQL 
- UI: Ant Design
- Auth: NextAuth.js con JWT strategy
- Validación: Zod
- Estado global: Zustand

## Estructura de carpetas
src/
├── app/
│   ├── (auth)/login/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx              ← sidebar + navbar
│   │   ├── dashboard/page.tsx
│   │   ├── ordenes-trabajo/
│   │   │   ├── page.tsx            ← lista OTs
│   │   │   ├── [id]/page.tsx       ← detalle OT
│   │   │   └── nueva/page.tsx
│   │   ├── equipos/page.tsx
│   │   ├── materiales/page.tsx
│   │   ├── proveedores/page.tsx
│   │   ├── compras/page.tsx
│   │   └── reportes/page.tsx
│   └── api/
│       ├── auth/[...nextauth]/route.ts
│       ├── ordenes-trabajo/
│       │   ├── route.ts            ← GET list, POST create
│       │   └── [id]/route.ts       ← GET one, PUT, DELETE
│       ├── equipos/route.ts
│       ├── materiales/route.ts
│       ├── proveedores/route.ts
│       └── compras/route.ts
├── lib/
│   ├── prisma.ts                   ← singleton PrismaClient
│   ├── auth.ts                     ← NextAuth config
│   └── services/
│       ├── ordenTrabajoService.ts
│       ├── equipoService.ts
│       └── materialService.ts
├── components/
│   ├── ui/                         ← wrappers sobre Ant Design
│   └── modules/                    ← componentes por módulo
└── types/
    └── index.ts                    ← tipos compartidos

## Modelo central del negocio
OrdenTrabajo es el modelo principal. Casi todo se relaciona con él:
- Tiene Cliente, CodigoReparacion, Fabricante
- Tiene estados: ot_status, recursos_status, taller_status
- Tiene submodelos: OTRepuesto, OTHistorial, PlanificacionOT, Compra

## Convenciones
- Nombres de archivos: kebab-case (orden-trabajo.ts)
- Componentes React: PascalCase
- Variables y funciones: camelCase
- Campos DB heredados del schema piloto: snake_case (respetar)
- Nuevos campos: camelCase en Prisma, snake_case en @@map
- API responses siempre: { data, total?, page?, error? }
- HTTP status: 200 GET ok, 201 POST created, 400 validation,
  401 unauth, 404 not found, 500 server error
- Siempre usar Zod para validar body en POST y PUT
- Siempre manejar try/catch en todas las API Routes

## Módulos prioritarios 
1. Auth (login + roles)
2. Órdenes de Trabajo (módulo central)
3. Materiales / Repuestos
4. Proveedores
5. Compras
6. Reportes básicos (OTs por estado, stock crítico)
