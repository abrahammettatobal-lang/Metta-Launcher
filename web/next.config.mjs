/** @type {import('next').NextConfig} */
const isGhPages = process.env.DEPLOY_TARGET === "gh-pages";
const repo = "Metta-Launcher";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Railway / producción: servidor Node con API routes.
  // GitHub Pages: export estático con basePath del repo.
  ...(isGhPages
    ? { output: "export", images: { unoptimized: true } }
    : { output: "standalone" }),
  trailingSlash: true,
  basePath: isGhPages ? `/${repo}` : "",
  assetPrefix: isGhPages ? `/${repo}/` : "",
  reactStrictMode: true,
};

export default nextConfig;
