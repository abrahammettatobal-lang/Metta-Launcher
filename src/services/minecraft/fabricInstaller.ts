import { downloadFileCmd, mkdirAllCmd, readTextFile, writeTextFile } from "../bridge";
import type { McVersionJson } from "./libraryService";
import { mergeInheritedVersionJson } from "./libraryService";

export async function fetchFabricProfileJsonUrl(
  mcVersion: string,
  loaderVersion: string,
): Promise<string> {
  const u = `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`;
  const res = await fetch(u);
  if (!res.ok) throw new Error(`Fabric meta HTTP ${res.status} for ${mcVersion} loader ${loaderVersion}`);
  return u;
}

export async function installFabricSide(
  mcVersion: string,
  loaderVersion: string,
): Promise<McVersionJson> {
  const url = await fetchFabricProfileJsonUrl(mcVersion, loaderVersion);
  const rel = `shared/version_profiles/fabric-${mcVersion}-${loaderVersion}.json`;
  await mkdirAllCmd("shared/version_profiles");
  await downloadFileCmd(`fabric-profile-${mcVersion}-${loaderVersion}`, url, rel, undefined);
  const raw = JSON.parse(await readTextFile(rel)) as McVersionJson;
  const merged = await mergeInheritedVersionJson(raw);
  await writeTextFile(rel, JSON.stringify(merged, null, 2));
  return merged;
}
