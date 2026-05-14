import {
  downloadFileCmd,
  mkdirAllCmd,
  pathExists,
  readTextFile,
  writeTextFile,
} from "../bridge";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MojangVersionEntry {
  id: string;
  type: "release" | "snapshot" | "old_beta" | "old_alpha";
  url: string;
  time: string;
  releaseTime: string;
  sha1?: string;
  complianceLevel?: number;
}

export interface MojangVersionManifest {
  latest: { release: string; snapshot: string };
  versions: MojangVersionEntry[];
}

export interface ArgumentRule {
  action: "allow" | "disallow";
  os?: { name?: string; version?: string; arch?: string };
  features?: Record<string, boolean>;
}

export interface LibraryDownloads {
  artifact?: { path: string; sha1: string; size: number; url: string };
  classifiers?: Record<string, { path: string; sha1: string; size: number; url: string }>;
}

export interface MinecraftLibrary {
  name?: string;
  downloads?: LibraryDownloads;
  rules?: Array<{
    action: "allow" | "disallow";
    os?: { name?: string };
    features?: Record<string, boolean>;
  }>;
  natives?: Record<string, string>;
  url?: string;
}

export interface MinecraftVersionJson {
  id: string;
  type?: string;
  inheritsFrom?: string;
  mainClass?: string;
  minecraftArguments?: string;
  arguments?: {
    game?: Array<string | { rules?: ArgumentRule[]; value: string | string[] }>;
    jvm?: Array<string | { rules?: ArgumentRule[]; value: string | string[] }>;
  };
  libraries?: MinecraftLibrary[];
  downloads?: {
    client?: { sha1: string; size: number; url: string };
    client_mappings?: { sha1: string; size: number; url: string };
  };
  assetIndex?: {
    id: string;
    sha1: string;
    size: number;
    totalSize: number;
    url: string;
  };
  assets?: string;
  javaVersion?: { component: string; majorVersion: number };
  logging?: unknown;
}

export interface ResolvedMinecraftVersion extends MinecraftVersionJson {
  libraries: MinecraftLibrary[];
  resolvedParents: string[];
}

// ─── Manifest ─────────────────────────────────────────────────────────────────

const MANIFEST_URL =
  "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

let _manifestCache: MojangVersionManifest | null = null;

/**
 * Fetches (and caches in-memory) the official Mojang version manifest.
 * Never hardcodes individual version URLs.
 */
export async function getMojangVersionManifest(): Promise<MojangVersionManifest> {
  if (_manifestCache) return _manifestCache;
  console.log("[MojangManifest] Downloading version_manifest_v2.json");
  const res = await fetch(MANIFEST_URL);
  if (!res.ok) {
    throw new Error(
      `[MojangManifest] HTTP ${res.status} fetching manifest: ${MANIFEST_URL}`
    );
  }
  _manifestCache = (await res.json()) as MojangVersionManifest;
  return _manifestCache;
}

/**
 * Finds and returns the manifest entry for a specific Minecraft version.
 * Throws a descriptive error if the version doesn't exist in the manifest.
 */
export async function getMinecraftVersionEntry(
  versionId: string
): Promise<MojangVersionEntry> {
  const manifest = await getMojangVersionManifest();
  const entry = manifest.versions.find((v) => v.id === versionId);
  if (!entry) {
    throw new Error(
      `[MojangManifest] Minecraft ${versionId} no existe en el manifest oficial de Mojang. ` +
        `Verifica que el ID de versión sea exacto.`
    );
  }
  console.log(`[MojangManifest] Found Minecraft version ${versionId} at: ${entry.url}`);
  return entry;
}

/**
 * Downloads the version JSON for a Minecraft version using the EXACT url
 * from the manifest entry. Never constructs URLs manually.
 * Saves to: shared/versions/{versionId}/{versionId}.json
 */
export async function downloadVanillaVersionJson(
  versionId: string
): Promise<MinecraftVersionJson> {
  const entry = await getMinecraftVersionEntry(versionId);
  const rel = `shared/versions/${versionId}/${versionId}.json`;
  await mkdirAllCmd(`shared/versions/${versionId}`);
  console.log(
    `[MojangManifest] Downloading version JSON from official URL: ${entry.url}`
  );
  await downloadFileCmd(
    `version-json-${versionId}`,
    entry.url,
    rel,
    entry.sha1 ?? undefined
  );
  const text = await readTextFile(rel);
  return JSON.parse(text) as MinecraftVersionJson;
}

/**
 * Returns the vanilla version JSON, loading from disk if already cached,
 * or downloading it from the official manifest URL otherwise.
 */
export async function ensureVanillaVersionJson(
  versionId: string
): Promise<MinecraftVersionJson> {
  const rel = `shared/versions/${versionId}/${versionId}.json`;
  if (await pathExists(rel)) {
    console.log(`[MojangManifest] Loading cached version JSON for ${versionId}`);
    const text = await readTextFile(rel);
    const parsed = JSON.parse(text) as MinecraftVersionJson;
    // If the cached file is already merged (no inheritsFrom) return it directly
    return parsed;
  }
  return downloadVanillaVersionJson(versionId);
}

// ─── Inheritance Resolver ─────────────────────────────────────────────────────

/**
 * Recursively resolves version inheritance.
 * - Loads child JSON from disk
 * - If it has `inheritsFrom`, downloads parent from OFFICIAL Mojang URL (not hardcoded)
 * - Merges parent into child
 * - Detects cycles
 */
export async function resolveVersionInheritance(
  versionId: string,
  visited: Set<string> = new Set()
): Promise<ResolvedMinecraftVersion> {
  if (visited.has(versionId)) {
    throw new Error(
      `[InheritanceResolver] Cycle detected in inheritance chain: ${[...visited, versionId].join(" → ")}`
    );
  }
  visited.add(versionId);

  console.log(`[InheritanceResolver] Resolving version: ${versionId}`);
  const childJson = await ensureVanillaVersionJson(versionId);

  if (!childJson.inheritsFrom) {
    console.log(`[InheritanceResolver] ${versionId} has no parent, resolution complete`);
    return {
      ...childJson,
      libraries: childJson.libraries ?? [],
      resolvedParents: [],
    };
  }

  const parentId = childJson.inheritsFrom;
  console.log(`[InheritanceResolver] ${versionId} inheritsFrom ${parentId}`);

  // Ensure parent vanilla JSON is downloaded using official manifest URL
  await ensureVanillaVersionJson(parentId);

  // Recursively resolve parent
  const resolvedParent = await resolveVersionInheritance(parentId, visited);
  console.log(`[InheritanceResolver] Parent ${parentId} resolved successfully`);

  // Merge: parent fields first, child overrides
  const merged = mergeVersionJsons(resolvedParent, childJson);
  merged.resolvedParents = [parentId, ...resolvedParent.resolvedParents];

  return merged;
}

/**
 * Merges child JSON on top of parent JSON following Mojang's rules:
 * - Child overrides simple fields (id, mainClass, minecraftArguments)
 * - Libraries are combined: parent.libraries + child.libraries (deduped by name)
 * - arguments.game and arguments.jvm are combined: parent + child
 * - Asset info (assetIndex, assets, downloads, javaVersion, logging) comes from parent if child doesn't define them
 */
export function mergeVersionJsons(
  parent: ResolvedMinecraftVersion,
  child: MinecraftVersionJson
): ResolvedMinecraftVersion {
  // Deduplicate libraries by group:artifact:classifier (child wins on version conflict)
  // Format: group:artifact:version[:classifier]
  // Key: group:artifact[:classifier] — so version conflicts resolve but classifier variants are preserved
  const libMap = new Map<string, MinecraftLibrary>();
  
  const getLibKey = (lib: MinecraftLibrary) => {
    if (lib.name) {
      const parts = lib.name.split(":");
      if (parts.length >= 4) {
        // group:artifact:version:classifier → key = group:artifact:classifier
        return `${parts[0]}:${parts[1]}:${parts[3]}`;
      }
      if (parts.length >= 2) {
        // group:artifact:version → key = group:artifact
        return `${parts[0]}:${parts[1]}`;
      }
      return lib.name;
    }
    return JSON.stringify(lib);
  };

  for (const lib of parent.libraries ?? []) {
    libMap.set(getLibKey(lib), lib);
  }
  for (const lib of child.libraries ?? []) {
    libMap.set(getLibKey(lib), lib);
  }
  const mergedLibraries = [...libMap.values()];

  // Merge arguments
  const mergedGameArgs = [
    ...(parent.arguments?.game ?? []),
    ...(child.arguments?.game ?? []),
  ];
  const mergedJvmArgs = [
    ...(parent.arguments?.jvm ?? []),
    ...(child.arguments?.jvm ?? []),
  ];

  return {
    // Start with parent
    ...parent,
    // Child overrides scalar fields
    id: child.id,
    type: child.type ?? parent.type,
    mainClass: child.mainClass ?? parent.mainClass,
    // Legacy minecraftArguments: child overrides parent if it defines them
    minecraftArguments: child.minecraftArguments ?? parent.minecraftArguments,
    // Arguments merged: parent first, then child
    arguments:
      mergedGameArgs.length > 0 || mergedJvmArgs.length > 0
        ? { game: mergedGameArgs, jvm: mergedJvmArgs }
        : parent.arguments,
    // Libraries deduped
    libraries: mergedLibraries,
    // Downloads: parent has client.jar info, child may override
    downloads: { ...parent.downloads, ...child.downloads },
    // Asset info from parent unless child overrides
    assetIndex: child.assetIndex ?? parent.assetIndex,
    assets: child.assets ?? parent.assets,
    javaVersion: child.javaVersion ?? parent.javaVersion,
    logging: child.logging ?? parent.logging,
    // Keep resolvedParents from parent resolution
    resolvedParents: parent.resolvedParents,
  };
}

// ─── Legacy compatibility exports ─────────────────────────────────────────────

/** @deprecated Use getMojangVersionManifest() instead */
export async function fetchVersionManifest(): Promise<MojangVersionManifest> {
  return getMojangVersionManifest();
}

/** @deprecated Use getMinecraftVersionEntry(versionId).then(e => e.url) instead */
export async function fetchVersionJsonUrl(
  manifest: MojangVersionManifest,
  versionId: string
): Promise<string> {
  const entry = manifest.versions.find((v) => v.id === versionId);
  if (!entry?.url)
    throw new Error(`[MojangManifest] Version not found in manifest: ${versionId}`);
  return entry.url;
}

/** Save a version JSON to disk (used by fabric installer) */
export async function saveVersionJson(
  versionId: string,
  json: MinecraftVersionJson
): Promise<void> {
  const rel = `shared/versions/${versionId}/${versionId}.json`;
  await mkdirAllCmd(`shared/versions/${versionId}`);
  await writeTextFile(rel, JSON.stringify(json, null, 2));
}
