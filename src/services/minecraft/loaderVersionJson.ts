import { listDirCmd, pathExists, readTextFile } from "../bridge";
import type { McVersionJson } from "./libraryService";

function gameArgsFlat(v: McVersionJson): string[] {
  const game = v.arguments?.game;
  if (!game) return [];
  const out: string[] = [];
  for (const piece of game) {
    if (typeof piece === "string") out.push(piece);
    else if (Array.isArray(piece.value)) out.push(...piece.value);
    else if (typeof piece.value === "string") out.push(piece.value);
  }
  return out;
}

export function isNeoForgeVersionJson(v: McVersionJson): boolean {
  if (v.id.startsWith("neoforge-")) return true;
  if (v.mainClass?.includes("neoforged")) return true;
  return gameArgsFlat(v).some((a) => a.includes("fml.neoForgeVersion"));
}

export function isForgeVersionJson(v: McVersionJson): boolean {
  if (v.id.toLowerCase().includes("forge") && !v.id.startsWith("neoforge-")) return true;
  if (v.mainClass?.includes("minecraftforge") || v.mainClass?.includes("modlauncher")) return true;
  return gameArgsFlat(v).some((a) => a.includes("fml.forgeVersion") || a.includes("fml.mcVersion"));
}

async function readVersionJsonAt(folder: string): Promise<McVersionJson | null> {
  const jsonPath = `versions/${folder}/${folder}.json`;
  if (!(await pathExists(jsonPath))) return null;
  const txt = await readTextFile(jsonPath);
  return JSON.parse(txt) as McVersionJson;
}

export async function readNeoForgeVersionJson(neoKey: string): Promise<McVersionJson> {
  const candidates = neoKey.startsWith("neoforge-")
    ? [neoKey, neoKey.replace(/^neoforge-/, "")]
    : [`neoforge-${neoKey}`, neoKey];

  for (const folder of candidates) {
    const json = await readVersionJsonAt(folder);
    if (json && isNeoForgeVersionJson(json)) return json;
  }

  throw new Error(
    `NeoForge installer did not create a valid version folder for ${neoKey}`,
  );
}

export async function readForgeVersionJson(
  candidates: string[],
): Promise<McVersionJson> {
  const vers = await listDirCmd("versions");
  const dirs = new Set(vers.filter((e) => e.isDir).map((e) => e.name));

  for (const candidate of candidates) {
    if (!dirs.has(candidate)) continue;
    const json = await readVersionJsonAt(candidate);
    if (json && isForgeVersionJson(json)) return json;
  }

  const mc = candidates[0]?.split("-")[0];
  if (mc) {
    for (const dir of dirs) {
      if (!dir.startsWith(`${mc}-Forge`) && !dir.startsWith(`${mc}-forge`)) continue;
      const json = await readVersionJsonAt(dir);
      if (json && isForgeVersionJson(json)) return json;
    }
  }

  throw new Error(
    `Forge installer did not create a known version folder (${candidates.join(", ")})`,
  );
}
