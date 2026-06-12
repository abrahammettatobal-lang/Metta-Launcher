import {
  downloadFileCmd,
  missingPathsCmd,
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
  onStep?: (msg: string, done?: number, total?: number) => void,
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
  await ensureLibrariesDownloaded(merged, os, onStep);

  onStep?.("Extracting natives…");
  const nativeCount = await extractNativesForVersion(merged.libraries, os, "", nativesRel);
  onStep?.(`Extracted ${nativeCount} native bundles`);

  const idx = merged.assetIndex;
  if (!idx) throw new Error("Version JSON missing assetIndex");
  onStep?.("Asset index…");
  const indexData = await ensureAssetIndex("", idx.id, idx.url, idx.sha1);
  onStep?.("Asset objects…");
  await ensureAssetObjects(
    "",
    indexData,
    (d, t) => onStep?.(`assets ${d}/${t}`),
    idx.id,
    idx.sha1,
  );

  return merged;
}

/** Download any library artifacts from a merged version JSON that are not on disk yet. */
export async function ensureLibrariesDownloaded(
  merged: McVersionJson,
  os: McOs,
  onStep?: (msg: string, done?: number, total?: number) => void,
): Promise<void> {
  const libDownloads: Array<{ rel: string; url: string; sha1?: string; label: string }> = [];
  for (const lib of merged.libraries) {
    const art = libraryArtifactRef(lib, os);
    if (!art?.url) continue;
    libDownloads.push({
      rel: `shared/libraries/${art.relPath}`.replace(/\\/g, "/"),
      url: art.url,
      sha1: art.sha1,
      label: lib.name ?? art.relPath.split("/").pop() ?? art.relPath,
    });
  }
  const missingLibs = new Set(await missingPathsCmd(libDownloads.map((l) => l.rel)));
  const pending = libDownloads.filter((l) => missingLibs.has(l.rel));
  if (pending.length === 0) return;

  onStep?.("Downloading libraries…", 0, pending.length);
  let done = 0;
  for (const lib of pending) {
    onStep?.(`Downloading ${lib.label}…`, done, pending.length);
    await downloadFileCmd(`lib-${lib.rel}`, lib.url, lib.rel, lib.sha1 ?? null);
    done += 1;
    onStep?.(`Downloaded ${lib.label}`, done, pending.length);
  }
}
