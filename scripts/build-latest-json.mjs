#!/usr/bin/env node
/**
 * Combina assets firmados de un GitHub Release en latest.json para el updater de Tauri.
 * Uso: node scripts/build-latest-json.mjs <directorio-con-assets> <tag-version>
 */
import fs from "node:fs";
import path from "node:path";

const assetsDir = process.argv[2];
const version = (process.argv[3] ?? "").replace(/^v/, "");
const repo =
  process.env.GITHUB_REPOSITORY ?? "abrahammettatobal-lang/Metta-Launcher";

if (!assetsDir || !version) {
  console.error(
    "Uso: node scripts/build-latest-json.mjs <assets-dir> <version>",
  );
  process.exit(1);
}

const files = fs.readdirSync(assetsDir);
const platforms = {};

function readSig(baseName) {
  const sigPath = path.join(assetsDir, `${baseName}.sig`);
  if (!fs.existsSync(sigPath)) return null;
  return fs.readFileSync(sigPath, "utf8").trim();
}

function addPlatform(key, fileName) {
  const sig = readSig(fileName);
  if (!sig) {
    console.warn(`Sin firma para ${fileName}, omitiendo ${key}`);
    return;
  }
  platforms[key] = {
    signature: sig,
    url: `https://github.com/${repo}/releases/download/v${version}/${encodeURIComponent(fileName)}`,
  };
}

for (const f of files) {
  if (f.endsWith(".sig")) continue;
  const lower = f.toLowerCase();
  if (lower.endsWith(".appimage")) {
    addPlatform("linux-x86_64", f);
  } else if (lower.endsWith("-setup.exe") || lower.endsWith("_x64-setup.exe")) {
    addPlatform("windows-x86_64", f);
  } else if (lower.endsWith(".msi")) {
    if (!platforms["windows-x86_64"]) addPlatform("windows-x86_64", f);
  } else if (lower.endsWith(".app.tar.gz")) {
    if (lower.includes("aarch64") || lower.includes("arm64")) {
      addPlatform("darwin-aarch64", f);
    } else {
      addPlatform("darwin-x86_64", f);
    }
  }
}

if (Object.keys(platforms).length === 0) {
  console.error("No se encontraron assets firmados compatibles.");
  process.exit(1);
}

const manifest = {
  version,
  notes: `Metta Launcher v${version}`,
  pub_date: new Date().toISOString(),
  platforms,
};

const out = path.join(assetsDir, "latest.json");
fs.writeFileSync(out, JSON.stringify(manifest, null, 2));
console.log(`Generado ${out} con plataformas: ${Object.keys(platforms).join(", ")}`);
