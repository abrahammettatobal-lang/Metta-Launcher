import {
  dirDiskUsage,
  listDirCmd,
  modParseMetadata,
  pathExists,
  removeFileCmd,
  type ModMetadata,
} from "./bridge";
import { invoke } from "@tauri-apps/api/core";
import { fullPath } from "../utils/full-path";

export interface ModEntry {
  fileName: string;
  relPath: string;
  size: number;
  enabled: boolean;
  metadata?: ModMetadata;
  duplicateOf?: string;
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
  await enrichModMetadata(out, instancePath);
  markDuplicates(out);
  return out;
}

async function enrichModMetadata(
  mods: ModEntry[],
  instancePath: string,
): Promise<void> {
  await Promise.all(
    mods.map(async (m) => {
      if (!m.enabled && !m.fileName.endsWith(".jar")) return;
      try {
        const abs = await fullPath(`${instancePath}/mods/${m.fileName}`);
        m.metadata = await modParseMetadata(abs);
      } catch {
        /* sin metadata */
      }
    }),
  );
}

function markDuplicates(mods: ModEntry[]): void {
  const byKey = new Map<string, ModEntry[]>();
  for (const m of mods) {
    const key =
      m.metadata?.modId?.toLowerCase() ??
      m.fileName.replace(/\.jar$/i, "").toLowerCase();
    const list = byKey.get(key) ?? [];
    list.push(m);
    byKey.set(key, list);
  }
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const primary = group[0]!.fileName;
    for (let i = 1; i < group.length; i++) {
      group[i]!.duplicateOf = primary;
    }
  }
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
