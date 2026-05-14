import type { McOs } from "./os";
import { writeTextFile, mkdirAllCmd } from "../bridge";
import {
  ensureVanillaVersionJson,
  resolveVersionInheritance,
} from "./mojangManifestService";



export interface LibraryDownloads {
  artifact?: { path: string; sha1: string; size: number; url: string };
  classifiers?: Record<string, { path: string; sha1: string; size: number; url: string }>;
}

export interface LibraryEntry {
  name?: string;
  url?: string;
  downloads?: LibraryDownloads;
  rules?: Array<{
    action: "allow" | "disallow";
    os?: { name?: string };
    features?: Record<string, boolean>;
  }>;
  natives?: Record<string, string>;
}

// McVersionJson is now exported from mojangManifestService, but keep this interface
// for files that import it directly from libraryService
export interface McVersionJson {
  id: string;
  type?: string;
  inheritsFrom?: string;
  mainClass?: string;
  minecraftArguments?: string;
  arguments?: {
    game?: Array<string | { rules?: LibraryEntry["rules"]; value: string | string[] }>;
    jvm?: Array<string | { rules?: LibraryEntry["rules"]; value: string | string[] }>;
  };
  libraries: LibraryEntry[];
  assetIndex?: { id: string; sha1: string; size: number; totalSize: number; url: string };
  assets?: string;
  downloads?: { client?: { sha1: string; size: number; url: string } };
  javaVersion?: { component: string; majorVersion: number };
  logging?: unknown;
}

function ruleApplies(
  rules: LibraryEntry["rules"] | undefined,
  os: McOs,
  features: Record<string, boolean>,
): boolean {
  if (!rules?.length) return true;
  let allowed = false;
  for (const r of rules) {
    let ok = true;
    if (r.os?.name && r.os.name !== os) ok = false;
    if (r.features) {
      for (const [k, need] of Object.entries(r.features)) {
        if (!!features[k] !== need) ok = false;
      }
    }
    if (!ok) continue;
    if (r.action === "allow") allowed = true;
    if (r.action === "disallow") return false;
  }
  return allowed;
}

export function libraryAllowed(lib: LibraryEntry, os: McOs): boolean {
  return ruleApplies(lib.rules, os, { has_custom_resolution: false });
}

function mavenPathFromName(name: string): string {
  const parts = name.split(":");
  if (parts.length < 3) throw new Error(`Nombre de librería inválido: ${name}`);
  const [group, artifact, version, classifierMaybe, extMaybe] = parts;
  const groupPath = group.replace(/\./g, "/");
  const ext = extMaybe || "jar";
  if (classifierMaybe) {
    return `${groupPath}/${artifact}/${version}/${artifact}-${version}-${classifierMaybe}.${ext}`;
  }
  return `${groupPath}/${artifact}/${version}/${artifact}-${version}.${ext}`;
}

export function libraryArtifactRef(
  lib: LibraryEntry,
  os: McOs,
): { relPath: string; sha1?: string; url?: string } | null {
  if (!libraryAllowed(lib, os)) return null;
  if (lib.downloads?.artifact) {
    return {
      relPath: lib.downloads.artifact.path,
      sha1: lib.downloads.artifact.sha1,
      url: lib.downloads.artifact.url,
    };
  }
  if (lib.name) {
    const rel = mavenPathFromName(lib.name);
    // Use lib.url as base if present (for Fabric maven repos), otherwise use Minecraft maven
    const baseUrl = lib.url
      ? lib.url.replace(/\/$/, "")
      : "https://libraries.minecraft.net";
    return { relPath: rel, url: `${baseUrl}/${rel}` };
  }
  return null;
}

export function nativeArtifactForOs(
  lib: LibraryEntry,
  os: McOs,
): { relPath: string; sha1?: string; url?: string } | null {
  if (!lib.natives || !libraryAllowed(lib, os)) return null;
  const key = os === "windows" ? "windows" : os === "osx" ? "osx" : "linux";
  const classifierKey = lib.natives[key];
  if (!classifierKey || !lib.downloads?.classifiers) return null;
  const ck = classifierKey.replace("${arch}", "64");
  const c = lib.downloads.classifiers[ck];
  if (!c) return null;
  return { relPath: c.path, sha1: c.sha1, url: c.url };
}

/**
 * Resolves version inheritance using the official Mojang manifest.
 * NEVER constructs version URLs manually — always uses the manifest's `url` field.
 *
 * @deprecated Prefer resolveVersionInheritance() from mojangManifestService directly.
 */
export async function mergeInheritedVersionJson(
  base: McVersionJson,
): Promise<McVersionJson> {
  // If this JSON doesn't inherit from anything, return it as-is
  if (!base.inheritsFrom) {
    return base;
  }

  const parentId = base.inheritsFrom;
  console.log(
    `[InheritanceResolver] mergeInheritedVersionJson: resolving parent "${parentId}" ` +
      `for version "${base.id}" using official Mojang manifest`
  );

  // Ensure parent vanilla JSON is available (downloads from manifest URL if needed)
  await ensureVanillaVersionJson(parentId);

  // Resolve full chain through the new service
  // We need to save the child JSON first so resolveVersionInheritance can load it

  const childRel = `shared/versions/${base.id}/${base.id}.json`;
  await mkdirAllCmd(`shared/versions/${base.id}`);
  await writeTextFile(childRel, JSON.stringify(base, null, 2));

  const resolved = await resolveVersionInheritance(base.id);

  // Convert ResolvedMinecraftVersion back to McVersionJson shape
  return {
    id: resolved.id,
    type: resolved.type,
    inheritsFrom: undefined, // already resolved
    mainClass: resolved.mainClass ?? "",
    minecraftArguments: resolved.minecraftArguments,
    arguments: resolved.arguments as McVersionJson["arguments"],
    libraries: (resolved.libraries ?? []) as LibraryEntry[],
    assetIndex: resolved.assetIndex,
    assets: resolved.assets,
    downloads: resolved.downloads,
    javaVersion: resolved.javaVersion,
    logging: resolved.logging,
  };
}
