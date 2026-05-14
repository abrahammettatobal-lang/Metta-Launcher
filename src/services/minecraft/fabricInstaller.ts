import { downloadFileCmd, mkdirAllCmd, pathExists, writeTextFile } from "../bridge";
import {
  getMinecraftVersionEntry,
  ensureVanillaVersionJson,
  resolveVersionInheritance,
  type MinecraftVersionJson,
  type ResolvedMinecraftVersion,
} from "./mojangManifestService";

// ─── Fabric Meta API ──────────────────────────────────────────────────────────

const FABRIC_META_BASE = "https://meta.fabricmc.net/v2";

export interface FabricGameVersion {
  version: string;
  stable: boolean;
}

export interface FabricLoaderVersion {
  loader: {
    separator: string;
    build: number;
    maven: string;
    version: string;
    stable: boolean;
  };
  intermediary: { maven: string; version: string; stable: boolean };
  launcherMeta: {
    version: number;
    libraries: {
      client: Array<{ name: string; url: string }>;
      common: Array<{ name: string; url: string }>;
      server: Array<{ name: string; url: string }>;
    };
    mainClass: { client: string; server: string };
  };
}

/**
 * Lists Fabric-compatible Minecraft game versions from Fabric Meta.
 */
export async function getFabricGameVersions(): Promise<FabricGameVersion[]> {
  const url = `${FABRIC_META_BASE}/versions/game`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`[FabricMeta] HTTP ${res.status} listing Fabric game versions: ${url}`);
  }
  return res.json() as Promise<FabricGameVersion[]>;
}

/**
 * Lists stable Fabric loader versions compatible with a given Minecraft version.
 * Throws a descriptive error if no loaders are found for that version.
 */
export async function getFabricLoaderVersions(
  minecraftVersion: string
): Promise<FabricLoaderVersion[]> {
  const url = `${FABRIC_META_BASE}/versions/loader/${encodeURIComponent(minecraftVersion)}`;
  console.log(`[FabricInstaller] Fetching loader versions for MC ${minecraftVersion}: ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `[FabricMeta] HTTP ${res.status} listing loaders for Minecraft ${minecraftVersion}: ${url}`
    );
  }
  const all = (await res.json()) as FabricLoaderVersion[];
  if (!all.length) {
    throw new Error(
      `[FabricMeta] Fabric todavía no tiene loader compatible para Minecraft ${minecraftVersion}`
    );
  }
  return all;
}

/**
 * Returns only stable loader version strings for a given Minecraft version.
 * Falls back to all versions if no stable ones exist.
 */
export async function getStableFabricLoaderVersionStrings(
  minecraftVersion: string
): Promise<string[]> {
  const all = await getFabricLoaderVersions(minecraftVersion);
  const stable = all.filter((l) => l.loader.stable).map((l) => l.loader.version);
  if (stable.length) return stable;
  return all.map((l) => l.loader.version);
}

/**
 * Downloads the Fabric loader profile JSON for a specific MC + loader version.
 * URL: https://meta.fabricmc.net/v2/versions/loader/{mc}/{loader}/profile/json
 * Saves to: shared/versions/fabric-loader-{loader}-{mc}/fabric-loader-{loader}-{mc}.json
 *
 * Returns the parsed raw Fabric profile JSON (with inheritsFrom still set).
 */
export async function downloadFabricProfile(
  minecraftVersion: string,
  loaderVersion: string
): Promise<MinecraftVersionJson> {
  const fabricId = `fabric-loader-${loaderVersion}-${minecraftVersion}`;
  const url = `${FABRIC_META_BASE}/versions/loader/${encodeURIComponent(minecraftVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`;
  const rel = `shared/versions/${fabricId}/${fabricId}.json`;

  console.log(`[FabricInstaller] Downloading Fabric profile: ${url}`);
  await mkdirAllCmd(`shared/versions/${fabricId}`);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `[FabricMeta] HTTP ${res.status} downloading Fabric profile for MC ${minecraftVersion} loader ${loaderVersion}: ${url}`
    );
  }
  const profileJson = (await res.json()) as MinecraftVersionJson;

  // Normalize id to our fabric version id
  profileJson.id = fabricId;

  await writeTextFile(rel, JSON.stringify(profileJson, null, 2));
  console.log(`[FabricInstaller] Saved Fabric profile to: ${rel}`);

  return profileJson;
}

// ─── Main Install ─────────────────────────────────────────────────────────────

/**
 * Full Fabric installation flow:
 * 1. Validates the Minecraft version exists in Mojang's manifest
 * 2. Verifies Fabric has a compatible loader
 * 3. Downloads the Fabric profile JSON
 * 4. Ensures the vanilla parent version is downloaded from the official manifest URL
 * 5. Resolves inheritsFrom recursively
 * 6. Downloads all Fabric libraries
 * 7. Returns the resolved (merged) version JSON and the Fabric version ID
 */
export async function installFabric(
  minecraftVersion: string,
  loaderVersion?: string,
  onStep?: (msg: string) => void
): Promise<{ fabricVersionId: string; resolved: ResolvedMinecraftVersion }> {
  onStep?.(`[FabricInstaller] Installing Fabric for Minecraft ${minecraftVersion}`);

  // Step 1: Validate Minecraft version in Mojang manifest
  onStep?.(`[MojangManifest] Validating Minecraft version ${minecraftVersion}`);
  await getMinecraftVersionEntry(minecraftVersion);
  console.log(`[MojangManifest] Minecraft ${minecraftVersion} confirmed in official manifest`);

  // Step 2: Get compatible loader versions
  onStep?.(`[FabricInstaller] Fetching compatible loaders for ${minecraftVersion}`);
  const loaderVersions = await getFabricLoaderVersions(minecraftVersion);
  const stableLoaders = loaderVersions.filter((l) => l.loader.stable);
  const allLoaders = loaderVersions;

  let selectedLoader: string;
  if (loaderVersion) {
    // Validate requested loader exists
    const found =
      loaderVersions.find((l) => l.loader.version === loaderVersion) ?? null;
    if (!found) {
      throw new Error(
        `[FabricInstaller] Loader ${loaderVersion} no está disponible para Minecraft ${minecraftVersion}. ` +
          `Loaders disponibles: ${allLoaders
            .slice(0, 5)
            .map((l) => l.loader.version)
            .join(", ")}`
      );
    }
    selectedLoader = loaderVersion;
  } else {
    // Pick latest stable, fallback to latest
    const candidates = stableLoaders.length ? stableLoaders : allLoaders;
    selectedLoader = candidates[0].loader.version;
  }

  console.log(`[FabricInstaller] Installing Fabric ${selectedLoader} for Minecraft ${minecraftVersion}`);
  onStep?.(`[FabricInstaller] Installing Fabric ${selectedLoader} for Minecraft ${minecraftVersion}`);

  const fabricId = `fabric-loader-${selectedLoader}-${minecraftVersion}`;

  // Step 3: Download Fabric profile JSON
  onStep?.(`[FabricInstaller] Downloading Fabric profile JSON`);
  const fabricProfile = await downloadFabricProfile(minecraftVersion, selectedLoader);

  // Step 4: Ensure vanilla parent is downloaded from official Mojang manifest URL
  const parentId = fabricProfile.inheritsFrom ?? minecraftVersion;
  onStep?.(`[InheritanceResolver] Downloading vanilla parent: ${parentId}`);
  console.log(`[InheritanceResolver] Ensuring vanilla version ${parentId} is installed`);
  await ensureVanillaVersionJson(parentId);
  console.log(`[InheritanceResolver] Parent ${parentId} ready`);

  // Step 5: Resolve full inheritance chain
  onStep?.(`[InheritanceResolver] Resolving inheritance for ${fabricId}`);
  console.log(`[InheritanceResolver] Resolving inheritance chain for ${fabricId}`);
  const resolved = await resolveVersionInheritance(fabricId);

  // Step 6: Download Fabric-specific libraries
  onStep?.(`[FabricInstaller] Downloading Fabric libraries`);
  await downloadFabricLibraries(fabricProfile, onStep);

  console.log(`[FabricInstaller] Fabric ${selectedLoader} for MC ${minecraftVersion} installed successfully`);
  onStep?.(`[FabricInstaller] Installation complete: ${fabricId}`);

  return { fabricVersionId: fabricId, resolved };
}

/**
 * Downloads libraries defined in a Fabric profile.
 * Fabric libraries may use a custom maven URL field or the Fabric maven.
 */
async function downloadFabricLibraries(
  profile: MinecraftVersionJson,
  onStep?: (msg: string) => void
): Promise<void> {
  const libs = profile.libraries ?? [];
  for (const lib of libs) {
    if (!lib.name) continue;

    // If downloads.artifact is present, use it
    if (lib.downloads?.artifact) {
      const art = lib.downloads.artifact;
      const rel = `shared/libraries/${art.path}`;
      if (await pathExists(rel)) continue;
      onStep?.(`[FabricInstaller] Downloading library: ${lib.name}`);
      await mkdirAllCmd(rel.substring(0, rel.lastIndexOf("/")));
      await downloadFileCmd(`fabric-lib-${lib.name}`, art.url, rel, art.sha1);
      continue;
    }

    // Otherwise build path from maven name and custom url
    const mavenPath = mavenNameToPath(lib.name);
    if (!mavenPath) continue;
    const rel = `shared/libraries/${mavenPath}`;
    if (await pathExists(rel)) continue;

    // Use lib.url (Fabric custom maven) or fall back to libraries.minecraft.net
    const baseUrl = (lib as { url?: string }).url ?? "https://libraries.minecraft.net/";
    const libUrl = `${baseUrl.replace(/\/$/, "")}/${mavenPath}`;

    onStep?.(`[FabricInstaller] Downloading library: ${lib.name}`);
    const dir = rel.substring(0, rel.lastIndexOf("/"));
    await mkdirAllCmd(dir);
    try {
      await downloadFileCmd(`fabric-lib-${lib.name}`, libUrl, rel, undefined);
    } catch (err) {
      console.warn(
        `[FabricInstaller] Could not download library ${lib.name} from ${libUrl}: ${err}`
      );
    }
  }
}

function mavenNameToPath(name: string): string | null {
  const parts = name.split(":");
  if (parts.length < 3) return null;
  const [group, artifact, version, classifier] = parts;
  const groupPath = group.replace(/\./g, "/");
  if (classifier) {
    return `${groupPath}/${artifact}/${version}/${artifact}-${version}-${classifier}.jar`;
  }
  return `${groupPath}/${artifact}/${version}/${artifact}-${version}.jar`;
}

// ─── Legacy compat ────────────────────────────────────────────────────────────

/**
 * @deprecated Use installFabric() instead.
 * Kept for backward compatibility with existing code.
 */
export async function installFabricSide(
  mcVersion: string,
  loaderVersion: string
): Promise<ResolvedMinecraftVersion> {
  const { resolved } = await installFabric(mcVersion, loaderVersion);
  return resolved;
}

/** @deprecated Use getStableFabricLoaderVersionStrings() instead */
export async function fetchFabricLoaderVersions(): Promise<string[]> {
  // This signature is used by the UI: returns stable loader versions
  // We need a minecraft version; since this is legacy, use the latest stable release approach
  // The UI should call getStableFabricLoaderVersionStrings(mcVersion) directly
  const res = await fetch(`${FABRIC_META_BASE}/versions/loader`);
  if (!res.ok) throw new Error(`[FabricMeta] HTTP ${res.status} listing loader versions`);
  const rows = (await res.json()) as Array<{ version: string; stable: boolean }>;
  const stable = rows.filter((r) => r.stable).map((r) => r.version);
  return stable.length ? stable : rows.slice(0, 40).map((r) => r.version);
}
