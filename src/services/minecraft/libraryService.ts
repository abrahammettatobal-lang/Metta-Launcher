import type { McOs } from "./os";

export interface LibraryDownloads {
  artifact?: { path: string; sha1: string; size: number; url: string };
  classifiers?: Record<string, { path: string; sha1: string; size: number; url: string }>;
}

export interface LibraryEntry {
  name?: string;
  downloads?: LibraryDownloads;
  rules?: Array<{
    action: "allow" | "disallow";
    os?: { name?: string };
    features?: Record<string, boolean>;
  }>;
  natives?: Record<string, string>;
}

export interface McVersionJson {
  id: string;
  /** Present on Mojang manifests (release, snapshot, …). */
  type?: string;
  inheritsFrom?: string;
  mainClass: string;
  minecraftArguments?: string;
  arguments?: {
    game?: Array<string | { rules: LibraryEntry["rules"]; value: string | string[] }>;
    jvm?: Array<string | { rules: LibraryEntry["rules"]; value: string | string[] }>;
  };
  libraries: LibraryEntry[];
  assetIndex?: { id: string; sha1: string; size: number; totalSize: number; url: string };
  assets?: string;
  downloads?: { client?: { sha1: string; size: number; url: string } };
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
    return { relPath: rel, url: `https://libraries.minecraft.net/${rel}` };
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

export async function mergeInheritedVersionJson(
  base: McVersionJson,
): Promise<McVersionJson> {
  let cur: McVersionJson = { ...base };
  const chain: McVersionJson[] = [cur];
  while (cur.inheritsFrom) {
    const pid = cur.inheritsFrom;
    const url = `https://piston-meta.mojang.com/v1/packages/${pid}/${pid}.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`No se pudo resolver herencia ${pid}: HTTP ${res.status}`);
    const parent = (await res.json()) as McVersionJson;
    chain.push(parent);
    cur = parent;
  }
  const merged: McVersionJson = { ...chain[chain.length - 1] };
  for (let i = chain.length - 2; i >= 0; i--) {
    const ch = chain[i];
    merged.id = ch.id;
    merged.mainClass = ch.mainClass;
    merged.minecraftArguments = ch.minecraftArguments ?? merged.minecraftArguments;
    merged.arguments = {
      jvm: [...(merged.arguments?.jvm ?? []), ...(ch.arguments?.jvm ?? [])],
      game: [...(merged.arguments?.game ?? []), ...(ch.arguments?.game ?? [])],
    };
    merged.libraries = [...(merged.libraries ?? []), ...(ch.libraries ?? [])];
    merged.downloads = { ...merged.downloads, ...ch.downloads };
    if (ch.assetIndex) merged.assetIndex = ch.assetIndex;
    if (ch.assets) merged.assets = ch.assets;
  }
  return merged;
}
