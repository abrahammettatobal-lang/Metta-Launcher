import {
  downloadFileCmd,
  mkdirAllCmd,
  pathExists,
  readTextFile,
  writeTextFile,
} from "../bridge";
import type { McVersionJson } from "./libraryService";
import { mergeInheritedVersionJson } from "./libraryService";

function fabricProfileRel(mcVersion: string, loaderVersion: string): string {
  return `shared/version_profiles/fabric-${mcVersion}-${loaderVersion}.json`;
}

export async function fetchFabricProfileJsonUrl(
  mcVersion: string,
  loaderVersion: string,
): Promise<string> {
  const u = `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`;
  const res = await fetch(u);
  if (!res.ok) throw new Error(`Fabric meta HTTP ${res.status} for ${mcVersion} loader ${loaderVersion}`);
  return u;
}

export async function loadFabricSide(
  mcVersion: string,
  loaderVersion: string,
): Promise<McVersionJson | null> {
  const rel = fabricProfileRel(mcVersion, loaderVersion);
  if (!(await pathExists(rel))) return null;
  try {
    const raw = JSON.parse(await readTextFile(rel)) as McVersionJson;
    return mergeInheritedVersionJson(raw);
  } catch {
    return null;
  }
}

export async function installFabricSide(
  mcVersion: string,
  loaderVersion: string,
): Promise<McVersionJson> {
  const rel = fabricProfileRel(mcVersion, loaderVersion);
  const cached = await loadFabricSide(mcVersion, loaderVersion);
  if (cached) return cached;

  const url = await fetchFabricProfileJsonUrl(mcVersion, loaderVersion);
  await mkdirAllCmd("shared/version_profiles");
  await downloadFileCmd(`fabric-profile-${mcVersion}-${loaderVersion}`, url, rel, undefined);
  const raw = JSON.parse(await readTextFile(rel)) as McVersionJson;
  const merged = await mergeInheritedVersionJson(raw);
  await writeTextFile(rel, JSON.stringify(merged, null, 2));
  return merged;
}
