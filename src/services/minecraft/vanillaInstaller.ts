import {
  downloadFileCmd,
  mkdirAllCmd,
  pathExists,
  readTextFile,
  writeTextFile,
} from "../bridge";
import { ensureAssetIndex, ensureAssetObjects } from "./assetService";
import {
  libraryArtifactRef,
  type McVersionJson,
  type LibraryEntry,
} from "./libraryService";
import { extractNativesForVersion } from "./nativesService";
import type { McOs } from "./os";
import {
  getMinecraftVersionEntry,
  resolveVersionInheritance,
  getMojangVersionManifest,
} from "./mojangManifestService";

// Re-export for files that import from here
export { getMojangVersionManifest as fetchVersionManifest };

export async function installVanillaSide(
  minecraftVersion: string,
  os: McOs,
  nativesRel: string,
  onStep?: (msg: string) => Promise<void> | void,
): Promise<McVersionJson> {
  await onStep?.("Fetching manifest…");
  console.log(`[VanillaInstaller] Installing Minecraft ${minecraftVersion}`);

  // Step 1: Get the version entry from the manifest (validates version exists)
  const entry = await getMinecraftVersionEntry(minecraftVersion);
  console.log(
    `[MojangManifest] Minecraft ${minecraftVersion} found in manifest, URL: ${entry.url}`
  );

  await onStep?.("Downloading version JSON…");

  // Step 2: Download (or load from cache) the version JSON using the official URL
  const vRel = `shared/versions/${minecraftVersion}/${minecraftVersion}.json`;
  await mkdirAllCmd(`shared/versions/${minecraftVersion}`);

  let rawJson: McVersionJson;
  if (await pathExists(vRel)) {
    console.log(`[VanillaInstaller] Loading cached version JSON for ${minecraftVersion}`);
    rawJson = JSON.parse(await readTextFile(vRel)) as McVersionJson;
  } else {
    console.log(
      `[MojangManifest] Downloading version JSON from official URL: ${entry.url}`
    );
    await downloadFileCmd(
      `version-json-${minecraftVersion}`,
      entry.url,
      vRel,
      entry.sha1 ?? undefined
    );
    rawJson = JSON.parse(await readTextFile(vRel)) as McVersionJson;
  }

  // Step 3: Resolve inheritance if needed (vanilla versions usually don't inherit)
  let merged: McVersionJson;
  if (rawJson.inheritsFrom) {
    console.log(
      `[InheritanceResolver] ${minecraftVersion} inheritsFrom ${rawJson.inheritsFrom}, resolving...`
    );
    const resolved = await resolveVersionInheritance(minecraftVersion);
    merged = {
      id: resolved.id,
      type: resolved.type,
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
  } else {
    merged = rawJson;
  }

  // Save the resolved JSON back to disk
  await writeTextFile(vRel, JSON.stringify(merged, null, 2));

  // Step 4: Download client.jar
  const client = merged.downloads?.client;
  if (!client?.url) throw new Error(`[VanillaInstaller] Version JSON for ${minecraftVersion} missing client.jar URL`);
  const jarRel = `shared/versions/${minecraftVersion}/${minecraftVersion}.jar`;
  if (!(await pathExists(jarRel))) {
    await onStep?.("Downloading client.jar…");
    console.log(`[VanillaInstaller] Downloading client.jar from: ${client.url}`);
    await downloadFileCmd(`client-${minecraftVersion}`, client.url, jarRel, client.sha1);
  }

  // Step 5: Download libraries
  await onStep?.("Downloading libraries…");
  for (const lib of merged.libraries ?? []) {
    const art = libraryArtifactRef(lib as LibraryEntry, os);
    if (!art) continue;
    const rel = `shared/libraries/${art.relPath}`;
    if (await pathExists(rel)) continue;
    if (!art.url) continue;
    console.log(`[VanillaInstaller] Downloading library: ${(lib as LibraryEntry).name ?? art.relPath}`);
    await downloadFileCmd(`lib-${art.relPath}`, art.url, rel, art.sha1 ?? null);
  }

  // Step 6: Extract natives
  await onStep?.("Extracting natives…");
  await extractNativesForVersion(merged.libraries as LibraryEntry[] ?? [], os, "", nativesRel);

  // Step 7: Download asset index and objects
  const idx = merged.assetIndex;
  if (!idx) throw new Error(`[VanillaInstaller] Version JSON for ${minecraftVersion} missing assetIndex`);
  await onStep?.("Asset index…");
  const indexData = await ensureAssetIndex("", idx.id, idx.url, idx.sha1);
  await onStep?.("Asset objects…");
  await ensureAssetObjects("", indexData, (d, t) => onStep?.(`assets ${d}/${t}`));

  console.log(`[VanillaInstaller] Minecraft ${minecraftVersion} installed successfully`);
  return merged;
}
