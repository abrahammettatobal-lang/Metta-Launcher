import { dirDiskUsage, listDirCmd, pathExists, removeFileCmd } from "./bridge";
import { invoke } from "@tauri-apps/api/core";

export interface ModEntry {
  fileName: string;
  relPath: string;
  size: number;
  enabled: boolean;
}

export async function listMods(instancePath: string): Promise<ModEntry[]> {
  const rel = `${instancePath}/mods`.replace(/\\/g, "/");
  const entries = await listDirCmd(rel);
  const out: ModEntry[] = [];
  for (const e of entries) {
    if (e.isDir) continue;
    const lower = e.name.toLowerCase();
    if (!lower.endsWith(".jar") && !lower.endsWith(".disabled")) continue;
    const enabled = !lower.endsWith(".disabled");
    const fileName = enabled ? e.name : e.name.replace(/\.disabled$/i, "");
    out.push({
      fileName,
      relPath: `${rel}/${e.name}`.replace(/\\/g, "/"),
      size: e.size ?? 0,
      enabled,
    });
  }
  out.sort((a, b) => a.fileName.localeCompare(b.fileName));
  return out;
}

export async function movePath(from: string, to: string): Promise<void> {
  await invoke("move_path_cmd", { from, to });
}

export async function setModEnabled(
  instancePath: string,
  fileName: string,
  enabled: boolean,
): Promise<void> {
  const base = `${instancePath}/mods`.replace(/\\/g, "/");
  const jar = `${base}/${fileName}`;
  const dis = `${base}/${fileName}.disabled`;
  if (enabled) {
    if (await pathExists(dis)) await movePath(dis, jar);
  } else {
    if (await pathExists(jar)) await movePath(jar, dis);
  }
}

export async function deleteMod(relPath: string): Promise<void> {
  await removeFileCmd(relPath);
}

export async function modFolderDisk(instancePath: string): Promise<number> {
  const rel = `${instancePath}/mods`.replace(/\\/g, "/");
  return dirDiskUsage(rel);
}
