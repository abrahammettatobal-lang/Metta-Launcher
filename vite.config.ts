import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const host = process.env.TAURI_DEV_HOST;

/** Tauri's asset protocol does not send CORS headers; WebKit drops crossorigin assets. */
function stripCrossoriginForTauri(): Plugin {
  return {
    name: "strip-crossorigin-for-tauri",
    apply: "build",
    transformIndexHtml(html) {
      return html
        .replace(/\s+crossorigin(?:="[^"]*")?/g, "")
        .replace(/<link rel="modulepreload"[^>]*>\s*/g, "");
    },
  };
}

export default defineConfig(() => ({
  // Required for Tauri production builds (tauri:// / asset protocol).
  base: "./",
  plugins: [react(), stripCrossoriginForTauri()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target:
      process.env.TAURI_ENV_PLATFORM === "windows"
        ? "chrome105"
        : ["es2020", "safari14"],
    minify: process.env.TAURI_ENV_DEBUG ? false : ("esbuild" as const),
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    modulePreload: {
      polyfill: false,
    },
    cssTarget: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari14",
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || "127.0.0.1",
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
