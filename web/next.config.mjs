/** @type {import('next').NextConfig} */
const isGhPages = process.env.DEPLOY_TARGET === "gh-pages";
const repo = "Metta-Launcher";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Vercel: build estándar de Next.js (SSR + API routes serverless).
  // GitHub Pages: export estático con basePath del repo.
  ...(isGhPages ? { output: "export", images: { unoptimized: true } } : {}),
  trailingSlash: true,
  basePath: isGhPages ? `/${repo}` : "",
  assetPrefix: isGhPages ? `/${repo}/` : "",
  reactStrictMode: true,
};

export default nextConfig;
