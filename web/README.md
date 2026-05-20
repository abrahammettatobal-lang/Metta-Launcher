# Metta Launcher — Sitio web oficial

Landing page de producción para Metta Launcher. Construida con **Next.js 14**
(App Router), **TypeScript**, **Tailwind CSS** y **Framer Motion**.

## Desarrollo

```bash
cd web
npm install
npm run dev
# http://localhost:3030
```

## Build estático

```bash
npm run build
# Output en ./out
```

El sitio se exporta como HTML estático (`output: "export"` en
`next.config.mjs`), así que puede servirse desde cualquier CDN (Vercel,
Netlify, GitHub Pages, Cloudflare Pages, S3…).

## Despliegue a GitHub Pages

Está automatizado: cada `push` a `main` que toque `web/**` dispara el workflow
`.github/workflows/web-deploy.yml`, que construye con `DEPLOY_TARGET=gh-pages`
(añade el `basePath` correcto) y publica `web/out/` en GitHub Pages.

Habilitar una vez en Settings → Pages → Source: **GitHub Actions**.

## Estructura

```
web/
  app/              # App Router (layout, page, globals)
  components/       # UI components (Hero, FeatureGrid, …)
  data/             # Catálogo de descargas
  lib/              # Utilidades (detectPlatform)
  public/           # Logo, favicon, OG image
```

## Actualizar la versión publicada

Editar `data/downloads.ts`:

```ts
export const RELEASE_VERSION = "0.3.1";
```

Las URLs de los assets de cada plataforma se construyen automáticamente a
partir de esa constante.
