# Metta Launcher — Sitio web oficial

Landing page de producción. **Next.js 14**, TypeScript, Tailwind CSS, Framer Motion.

## Desarrollo local

```bash
cd web
npm install
cp .env.example .env.local   # opcional
npm run dev
# http://localhost:3030
```

## Despliegue en Vercel (recomendado)

Vercel es el hosting nativo de Next.js: deploy automático, CDN global, SSL y
**API routes** (`app/api/`) como funciones serverless.

### Pasos

1. [vercel.com](https://vercel.com) → **Add New Project** → importa el repo de GitHub.
2. **Root Directory:** `web` (importante: el proyecto Next está en esa carpeta).
3. Framework: **Next.js** (detectado automáticamente).
4. **Environment Variables** (Production):
   - `NEXT_PUBLIC_SITE_URL` = `https://metta-launcher.vercel.app`
     (o tu dominio custom tras configurarlo).
5. **Deploy**. Cada push a `main` que toque `web/**` redeploya solo.

### Comprobar

- Sitio: https://metta-launcher.vercel.app
- Health: https://metta-launcher.vercel.app/api/health/

### Dominio custom

Project → **Settings → Domains** → añade tu dominio y actualiza
`NEXT_PUBLIC_SITE_URL` en Variables de entorno.

### Añadir APIs

Crea rutas en `web/app/api/`, por ejemplo `app/api/v1/news/route.ts`.
Vercel las publica como serverless functions sin configuración extra.

## GitHub Pages (opcional)

Solo HTML estático, sin APIs:

```bash
npm run build:static
```

Workflow: `.github/workflows/web-deploy.yml`.

## Estructura

```
web/
  app/api/          # health, v1, futuras APIs
  components/
  data/downloads.ts # versión y URLs de release
  vercel.json
```

## Versión de descargas

Editar `RELEASE_VERSION` en `data/downloads.ts`.
