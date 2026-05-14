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
  mergeInheritedVersionJson,
  type McVersionJson,
} from "./libraryService";
import { extractNativesForVersion } from "./nativesService";
import type { McOs } from "./os";
import { fetchVersionJsonUrl, fetchVersionManifest } from "./versionManifestService";

export async function installVanillaSide(
  minecraftVersion: string,
  os: McOs,
  nativesRel: string,
  onStep?: (msg: string) => void,
): Promise<McVersionJson> {
  onStep?.("Fetching manifest…");
  const man = await fetchVersionManifest();
  const vUrl = await fetchVersionJsonUrl(man, minecraftVersion);
  onStep?.("Downloading version JSON…");
  const vRel = `shared/versions/${minecraftVersion}/${minecraftVersion}.json`;
  await mkdirAllCmd(`shared/versions/${minecraftVersion}`);
  await downloadFileCmd(`version-json-${minecraftVersion}`, vUrl, vRel, undefined);
  const raw = JSON.parse(await readTextFile(vRel)) as McVersionJson;
  const merged = await mergeInheritedVersionJson(raw);
  await writeTextFile(vRel, JSON.stringify(merged, null, 2));

  const client = merged.downloads?.client;
  if (!client?.url) throw new Error("Version JSON missing client.jar");
  const jarRel = `shared/versions/${minecraftVersion}/${minecraftVersion}.jar`;
  if (!(await pathExists(jarRel))) {
    onStep?.("Downloading client.jar…");
    await downloadFileCmd(`client-${minecraftVersion}`, client.url, jarRel, client.sha1);
  }

  onStep?.("Downloading libraries…");
  for (const lib of merged.libraries) {
    const art = libraryArtifactRef(lib, os);
    if (!art) continue;
    const rel = `shared/libraries/${art.relPath}`;
    if (await pathExists(rel)) continue;
    if (!art.url) continue;
    await downloadFileCmd(`lib-${art.relPath}`, art.url, rel, art.sha1 ?? null);
  }

  onStep?.("Extracting natives…");
  await extractNativesForVersion(merged.libraries, os, "", nativesRel);

  const idx = merged.assetIndex;
  if (!idx) throw new Error("Version JSON missing assetIndex");
  onStep?.("Asset index…");
  const indexData = await ensureAssetIndex("", idx.id, idx.url, idx.sha1);
  onStep?.("Asset objects…");
  await ensureAssetObjects("", indexData, (d, t) => onStep?.(`assets ${d}/${t}`));

  return merged;
}
