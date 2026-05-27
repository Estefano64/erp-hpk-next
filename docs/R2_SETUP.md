# Cloudflare R2 — Setup y uso en el ERP

Este documento describe la integración del ERP con **Cloudflare R2** (almacenamiento S3-compatible) para todos los adjuntos: facturas, guías de remisión, informes de evaluación, fotos y documentos de OT, adjuntos de requerimientos.

## Modelo de seguridad

- **Ningún archivo es público.** Todos los accesos van por **presigned URLs** con expiración corta (upload 5min, download 10min).
- Las credenciales R2 (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) viven **solo en el servidor** (variables de entorno). El navegador nunca las ve.
- **El cliente NUNCA decide el path en R2.** Cada módulo expone su propio endpoint `upload-url` que valida acceso al recurso padre (vía `assertOTAccess`), carga datos de BD, arma la key con `R2Keys.X(...)` y devuelve la URL firmada.
- Los endpoints `/api/r2/download-url` y `/api/r2/delete` validan que la `key` pertenezca a un recurso registrado en la BD (defensa contra "te paso una key cualquiera y la firmás").
- Las columnas `*_key` en la BD guardan **solo la object key**, no la URL.

## Variables de entorno

En `.env.local`:

```env
R2_ACCOUNT_ID=<tu-account-id-de-cloudflare>
R2_ACCESS_KEY_ID=<access-key-id-del-token-R2>
R2_SECRET_ACCESS_KEY=<secret-del-token-R2>
R2_BUCKET_NAME=hpyk-erp-files
R2_ENDPOINT=https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
```

> ⚠️ **No comitear** valores reales en `.env.example`. Si por error te pasó, **rotar el token** en Cloudflare y re-commitear `.env.example` con placeholders.

## Crear el bucket y el token API

1. Cloudflare Dashboard → **R2** → **Create bucket** → nombre: `hpyk-erp-files` (o el que prefieras).
2. R2 → **Manage R2 API Tokens** → **Create API Token**:
   - Permissions: **Object Read & Write**
   - Specify bucket: `hpyk-erp-files`
3. Copiar `Access Key ID` y `Secret Access Key` a `.env.local`.

## CORS del bucket

Sin CORS, el navegador no puede hacer `PUT` directo a R2 con la URL firmada. En el dashboard R2 → bucket → **Settings** → **CORS Policy**, pegar:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "http://192.168.1.18:3000",
      "https://TU-DOMINIO-PRODUCCION.com"
    ],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

## Estructura de carpetas (R2)

Todo gira alrededor de la **OT**:

```
hpyk-erp-files/
└── ordenes-trabajo/
    └── <otCodigo>/                      # OT.ot o fallback "OT-{id}"
        ├── adjuntos/                    → OtAdjunto
        │   └── {timestamp}-{uuid}-{filename}
        ├── evaluaciones/                → EvaluacionTecnica.informe_key
        │   └── {timestamp}-{uuid}-{filename}
        ├── requerimientos/
        │   └── <reqId>/                 → OTRepuestoAdjunto
        │       └── {timestamp}-{uuid}-{filename}
        └── compras/
            └── <ocCodigo>/              # Compra.numero_po
                ├── guia/
                └── factura/

└── compras-sueltas/                     # Fallback: Compra.ot_id == null
    └── <ocCodigo>/
        ├── guia/
        └── factura/
```

**Reglas para construir el `otCodigo`**:
- Si `OrdenTrabajo.ot` está poblado → usar tal cual (ej. `OT-25-001`).
- Si está NULL → fallback `OT-{id}` (ej. `OT-42`).
- En ambos casos se sanitiza (`[^A-Za-z0-9._-]` → `_`) por defensa.

**Casos borde**:
- Compra sin OT (`Compra.ot_id == null`) → namespace paralelo `compras-sueltas/`.
- Cliente que firme upload bajo una OT y luego intente registrar en otra → bloqueado: cada POST de registro valida `key.startsWith(R2Keys.X(...) + "/")`.

## API endpoints

### Por módulo (upload + registro + delete)

| Acción | Endpoint |
|---|---|
| Pedir upload URL para adjunto OT | `POST /api/ordenes-trabajo/[id]/adjuntos/upload-url` |
| Registrar adjunto OT en BD | `POST /api/ordenes-trabajo/[id]/adjuntos` |
| Borrar adjunto OT (R2 + BD) | `DELETE /api/ordenes-trabajo/[id]/adjuntos?adjuntoId=X` |
| Pedir upload URL para requerimiento | `POST /api/requerimientos/[id]/adjuntos/upload-url` |
| Registrar adjunto de requerimiento | `POST /api/requerimientos/[id]/adjuntos` |
| Borrar adjunto de requerimiento | `DELETE /api/requerimientos/[id]/adjuntos` (body: `{adjunto_id}`) |
| Pedir upload URL guía/factura | `POST /api/compras/[id]/guia/upload-url?tipo=guia\|factura` |
| Registrar guía/factura | `POST /api/compras/[id]/guia?tipo=guia\|factura` |
| Borrar guía/factura | `DELETE /api/compras/[id]/guia?tipo=guia\|factura` |
| Pedir upload URL informe | `POST /api/evaluaciones/[id]/informe/upload-url` |
| Registrar informe | `POST /api/evaluaciones/[id]/informe` |
| Borrar informe | `DELETE /api/evaluaciones/[id]/informe` |

Todos los `DELETE` borran **primero de R2, después de BD** para no dejar archivos huérfanos.

### Genéricos (download + cleanup)

- `POST /api/r2/download-url` — body `{ key, resource, resourceId }`. Devuelve `{ downloadUrl }` válida 10 min. Verifica que la key esté ligada al recurso indicado.
- `POST /api/r2/delete` — body `{ key }`. **Solo huérfanos**: si la key está en algún registro, devuelve 409. Para borrado completo, usar el endpoint del módulo.

> ⚠️ El endpoint genérico `/api/r2/upload-url` fue eliminado. La generación de upload URL siempre pasa por el endpoint del módulo, que arma el path desde el servidor.

## Permisos por OT (TODO)

Hoy `src/lib/r2-server.ts → assertOTAccess(req, otId)` solo chequea sesión + existencia de la OT. Cuando se complete la matriz en `docs/AREAS_Y_PERMISOS.txt`, agregar ahí las reglas por rol. Todos los endpoints upload-url ya pasan por ese helper, así que el cambio se hace en un solo lugar.

## Uso desde React

### Subir un adjunto OT

```tsx
import { uploadToR2 } from "@/lib/r2-client";

const meta = await uploadToR2({
  file,
  uploadUrlEndpoint: `/api/ordenes-trabajo/${otId}/adjuntos/upload-url`,
  extra: { etapa: "recepcion" },
  onProgress: (pct) => console.log(pct),
});

await fetch(`/api/ordenes-trabajo/${otId}/adjuntos`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ...meta, etapa: "recepcion" }),
});
```

### Subir guía/factura de compra

```tsx
const meta = await uploadToR2({
  file,
  uploadUrlEndpoint: `/api/compras/${compraId}/guia/upload-url?tipo=guia`,
});
await fetch(`/api/compras/${compraId}/guia?tipo=guia`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(meta),
});
```

### Descargar / mostrar

```tsx
import { R2FileLink } from "@/components/R2FileLink";
import { R2Image } from "@/components/R2Image";

<R2FileLink resource="compra-guia" resourceId={compraId} r2Key={compra.guia_key}>
  Ver guía
</R2FileLink>

<R2Image resource="ot-adjunto" resourceId={adj.id} r2Key={adj.r2_key} alt={adj.nombre_archivo} />
```

## Troubleshooting

- **`R2_ENDPOINT no configurado`**: faltan vars en `.env.local`. Reiniciar `next dev`.
- **CORS error en el browser al hacer PUT a R2**: revisar la CORS policy del bucket. El origen del navegador debe estar en `AllowedOrigins`.
- **`key fuera del namespace de la OT`** en el POST de registro: alguien intentó registrar una key que no corresponde a la OT/compra/req del endpoint. Si pasa en condiciones normales (no atacante), revisar que el cliente esté usando el `uploadUrlEndpoint` correcto.
- **El upload sube a R2 pero el POST al backend falla**: el archivo queda huérfano en R2. Para limpiar: `POST /api/r2/delete` con `{ key }`.
