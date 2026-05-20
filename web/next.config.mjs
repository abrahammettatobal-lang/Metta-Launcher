/** @type {import('next').NextConfig} */
const isGhPages = process.env.DEPLOY_TARGET === "gh-pages";
const repo = "Metta-Launcher";

const nextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  basePath: isGhPages ? `/${repo}` : "",
  assetPrefix: isGhPages ? `/${repo}/` : "",
  reactStrictMode: true,
};

export default nextConfig;
