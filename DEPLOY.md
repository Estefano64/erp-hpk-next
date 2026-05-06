# Deploy en Railway — guía paso a paso

Este documento describe cómo desplegar el ERP en Railway para que el equipo pruebe y llene catálogos.

> **Estado**: deploy de testing. NO usar todavía para datos críticos hasta que se complete el plan de file-uploads (ver "Limitaciones" al final).

## 1. Prerrequisitos

- Cuenta en [railway.app](https://railway.app) (login con GitHub recomendado)
- Repo `erp-hpk-next` ya en GitHub (✓ ya está)
- Acceso al repo desde la cuenta de Railway

## 2. Crear el proyecto en Railway

1. Login en Railway → **New Project** → **Deploy from GitHub repo**
2. Elegir `Estefano64/erp-hpk-next` (autorizá si pide permiso)
3. Elegir branch: `Feat/Juntando-Proyecto`
4. Railway detecta automáticamente Next.js y empieza el build

> El build inicial va a **fallar** porque falta `DATABASE_URL`. Es esperado. Continuá con el paso 3.

## 3. Provisionar Postgres

1. En el dashboard del proyecto → **+ New** → **Database** → **Add PostgreSQL**
2. Railway crea la DB y expone `DATABASE_URL` como referencia interna
3. Volvé al servicio del app → **Variables** → **+ New Variable** → **Add Reference** → seleccioná `DATABASE_URL` del Postgres recién creado

## 4. Variables de entorno

En el servicio del app → **Variables**, agregar:

| Variable | Valor | Cómo obtenerlo |
|---|---|---|
| `DATABASE_URL` | (referencia al Postgres del paso 3) | Auto |
| `NEXTAUTH_SECRET` | string aleatorio | `openssl rand -base64 32` o usar https://generate-secret.vercel.app/32 |
| `NEXTAUTH_URL` | `https://<tu-app>.up.railway.app` | Lo da Railway tras el primer deploy en **Settings → Networking → Generate Domain** |

> **Importante**: `NEXTAUTH_URL` requiere que primero generes el dominio público en **Settings → Networking**. Si no lo seteás, la app falla al login.

## 5. Configurar comando de start

En **Settings → Deploy → Start Command**, reemplazar el default por:

```
npm run start:prod
```

Eso corre `prisma migrate deploy` antes de `next start`, aplicando todas las migraciones automáticamente en cada deploy.

## 6. Redeploy

Click en **Deploy** o pushear a la branch. El build debería:

1. Instalar deps (`npm install`) → corre `postinstall` que hace `prisma generate`
2. Buildear (`next build`)
3. Al boot: `prisma migrate deploy` aplica las 31 migraciones
4. `next start` levanta el server

## 7. Seedear el primer usuario admin

La DB queda vacía. Para crear el admin (`admin@empresa.com` / `admin123`) y los catálogos básicos:

**Opción A** — desde tu máquina apuntando a la DB de Railway:

```bash
# 1. Copiá el DATABASE_URL público de Railway (Postgres → Connect → Public Network)
# 2. En tu terminal:
DATABASE_URL="postgresql://..." npx prisma db seed
```

**Opción B** — desde Railway shell:

```bash
# En el servicio del app → click en los 3 puntitos → Open Shell
npx prisma db seed
```

## 8. Acceso del equipo

- URL: la que Railway generó en paso 4
- Login inicial: `admin@empresa.com` / `admin123`
- **Cambiar la contraseña antes de compartir** (desde el módulo de usuarios o `/api/me`)

## 9. Llenar catálogos

El landing en `/catalogos` muestra el estado de completitud. El equipo puede:

- Importar masivamente Excel: **Materiales**, **Clientes**, **Proveedores** (botón "Importar Excel")
- Crear uno por uno desde "Nuevo"
- Editar inline en la tabla de Materiales (precio, NP, fabricante)

## Limitaciones de este deploy de testing

### File uploads (CRÍTICO)

3 endpoints escriben archivos al filesystem local (`public/uploads/...`):
- `/api/compras/[id]/guia` — guías de compras
- `/api/evaluaciones/[id]/informe` — informes de evaluación
- `/api/ordenes-trabajo/[id]/adjuntos` — adjuntos de OT

**En Railway estos archivos se PIERDEN en cada redeploy** (filesystem ephemeral).

**Solución temporal (v1 de testing)**: agregar un Volume.

1. En el servicio → **Settings → Volumes → New Volume**
2. Mount path: `/app/public/uploads`
3. Size: 5 GB es suficiente para empezar
4. Redeploy

> Aunque el Volume persiste, sigue siendo single-instance. Si Railway escala a múltiples replicas, los uploads serán inconsistentes. **Para producción, migrar a S3/R2**.

### Otras consideraciones

- **Backups**: Railway hace backups del Postgres automáticamente, pero **chequeá la frecuencia** en Settings.
- **Logs**: Railway retiene 7 días por default. Para más, configurar log drain.
- **Costo**: Hobby plan ($5/mes) cubre el equipo en testing. Si crece el uso, escalar al plan Pro.

## Próximos pasos (después del primer round de testing)

1. Migrar uploads a S3/R2 (Cloudflare R2 es más barato)
2. Configurar dominio custom (`erp.tudominio.com`)
3. Setup CI: lint + tests automáticos en cada PR
4. Backups automáticos a otro servicio (s3 sync diario)
5. Monitoring: Sentry para errores, métrica básica de Postgres
