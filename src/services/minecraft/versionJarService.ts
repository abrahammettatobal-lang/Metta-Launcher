import { pathExists, ensureLaunchableClientJar } from "../bridge";
import type { McVersionJson } from "./libraryService";

function abs(root: string, rel: string): string {
  const a = root.replace(/\\/g, "/").replace(/\/+$/, "");
  const b = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  return `${a}/${b}`;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").toLowerCase();
}

export interface ClientJarResolution {
  absPath: string;
  /** Human-readable note when a different jar was chosen than configured. */
  fallbackNote?: string;
}

/**
 * Resolves the client/version JAR for classpath and ${primary_jar}.
 * Legacy Forge/NeoForge (<1.20) ship a patched jar under `versions/{loaderId}/`.
 * Modern NeoForge inherits the vanilla client jar from `versions/{mcVersion}/`.
 */
export async function resolveVersionJarRel(
  merged: McVersionJson,
  minecraftVersion: string,
  loaderType: string,
): Promise<string> {
  const candidates: string[] = [];

  if (loaderType === "vanilla" || loaderType === "fabric") {
    // Official Mojang client lives under shared/versions/. Do not pick
    // versions/{mc}/ — NeoForge leaves a bundle-format jar there that breaks vanilla Main.
    candidates.push(
      `shared/versions/${minecraftVersion}/${minecraftVersion}.jar`,
      `shared/versions/${merged.id}/${merged.id}.jar`,
    );
  } else if (loaderType === "forge" || loaderType === "neoforge") {
    candidates.push(
      `versions/${merged.id}/${merged.id}.jar`,
      `shared/versions/${merged.id}/${merged.id}.jar`,
      `shared/versions/${minecraftVersion}/${minecraftVersion}.jar`,
      `versions/${minecraftVersion}/${minecraftVersion}.jar`,
    );
  } else {
    candidates.push(
      `shared/versions/${minecraftVersion}/${minecraftVersion}.jar`,
      `shared/versions/${merged.id}/${merged.id}.jar`,
      `versions/${minecraftVersion}/${minecraftVersion}.jar`,
      `versions/${merged.id}/${merged.id}.jar`,
    );
  }

  const seen = new Set<string>();
  for (const rel of candidates) {
    if (seen.has(rel)) continue;
    seen.add(rel);
    if (await pathExists(rel)) return rel;
  }

  throw new Error(
    `No se encontró client.jar para ${loaderType} (${merged.id}, MC ${minecraftVersion}). ` +
      "Reinstala el loader o la versión base de Minecraft.",
  );
}

async function resolveCustomClientJar(
  root: string,
  _minecraftVersion: string,
  customClientJar: string,
): Promise<ClientJarResolution> {
  const normalized = customClientJar.replace(/\\/g, "/");
  const checkPath = normalized;
  if (!(await pathExists(checkPath))) {
    throw new Error(`No se encontró el client.jar personalizado: ${customClientJar}`);
  }

  const launchable = await ensureLaunchableClientJar(checkPath);
  return {
    absPath: launchable.absPath,
    fallbackNote: launchable.note ?? undefined,
  };
}

/** Absolute path to the client JAR, including custom/modified clients. */
export async function resolveClientJarAbs(
  root: string,
  minecraftVersion: string,
  loaderType: string,
  merged: McVersionJson,
  customClientJar?: string | null,
): Promise<string> {
  const resolved = await resolveClientJarResolution(
    root,
    minecraftVersion,
    loaderType,
    merged,
    customClientJar,
  );
  return resolved.absPath;
}

export async function resolveClientJarResolution(
  root: string,
  minecraftVersion: string,
  loaderType: string,
  merged: McVersionJson,
  customClientJar?: string | null,
): Promise<ClientJarResolution> {
  if (loaderType === "custom") {
    const jar = customClientJar?.trim();
    if (!jar) {
      throw new Error(
        "Esta instancia usa un client.jar personalizado pero no tiene ruta configurada.",
      );
    }
    return resolveCustomClientJar(root, minecraftVersion, jar);
  }

  const rel = await resolveVersionJarRel(merged, minecraftVersion, loaderType);
  return { absPath: abs(root, rel) };
}

/** True when two paths refer to the same file (case-insensitive on Windows). */
export function sameClientJarPath(a: string, b: string): boolean {
  return normalizePath(a) === normalizePath(b);
}
