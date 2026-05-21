# Metta Launcher — Sitio web oficial

Landing page de producción para Metta Launcher. **Next.js 14** (App Router),
TypeScript, Tailwind CSS y Framer Motion.

## Desarrollo local

```bash
cd web
npm install
cp .env.example .env.local   # opcional: NEXT_PUBLIC_SITE_URL
npm run dev
# http://localhost:3030
```

## Despliegue en Railway (recomendado)

Railway ejecuta Next.js como **servidor Node** (`output: "standalone"`), no
como sitio estático. Eso permite:

- Uptime estable frente a CDNs gratuitos inestables
- **API routes** bajo `app/api/` (ya incluye `/api/health` y `/api/v1`)
- Variables de entorno y dominio propio
- Escalar o añadir servicios (DB, Redis) en el mismo proyecto

### Pasos

1. Crea un proyecto en [Railway](https://railway.com) → **Deploy from GitHub**.
2. Selecciona este repositorio.
3. En **Settings → Root Directory** pon: `web`
4. **Networking → Public Networking → Generate Domain** (o asigna):
   `metta-launcher.railway.app`
5. Variables (Settings → Variables):
   - `NEXT_PUBLIC_SITE_URL` = `https://metta-launcher.railway.app`
   - `PORT` lo asigna Railway automáticamente; no hace falta definirlo.
6. Deploy. Railway usa `railway.json` + `nixpacks.toml` en `web/`.
7. Comprueba:
   - Sitio: https://metta-launcher.railway.app
   - Health: https://metta-launcher.railway.app/api/health/

### Otro dominio custom

Settings → Networking → **Custom Domain** → apunta CNAME y actualiza
`NEXT_PUBLIC_SITE_URL` con la URL final.

### Añadir APIs nuevas

Crea rutas en `web/app/api/`, por ejemplo:

```
app/api/v1/news/route.ts
app/api/v1/stats/route.ts
```

Reinicia el servicio en Railway tras cada deploy (automático con push a `main`).

## GitHub Pages (opcional / respaldo)

Solo export estático, **sin API routes**:

```bash
npm run build:static
# genera ./out con basePath /Metta-Launcher
```

El workflow `.github/workflows/web-deploy.yml` publica en Pages cuando cambia
`web/**`. Para producción principal usa Railway.

## Estructura

```
web/
  app/
    api/health/     # Health check (Railway)
    api/v1/         # API v1 (extensible)
    page.tsx        # Landing
  components/
  data/downloads.ts # Versión y URLs de release
  lib/
  railway.json
  nixpacks.toml
```

## Actualizar versión de descargas

Editar `data/downloads.ts`:

```ts
export const RELEASE_VERSION = "0.3.1";
```

Todas las URLs de assets se regeneran desde esa constante.
