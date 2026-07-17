import { invoke } from "@tauri-apps/api/core";
import { listDirCmd, pathExists, removeFileCmd } from "../bridge";

/** CurseForge suele publicar mods como .zip; Fabric solo carga .jar en mods/. */
export function normalizeModpackModFileName(fileName: string): string {
  const safe = fileName.replace(/[/\\?%*:|"<>]/g, "_");
  if (/\.zip$/i.test(safe)) {
    return `${safe.slice(0, -4)}.jar`;
  }
  return safe;
}

/** Renombra mods .zip → .jar en instancias importadas antes de este fix. */
export async function repairModpackModExtensions(instancePath: string): Promise<number> {
  const rel = `${instancePath}/mods`.replace(/\\/g, "/");
  let entries;
  try {
    entries = await listDirCmd(rel);
  } catch {
    return 0;
  }

  let fixed = 0;
  for (const e of entries) {
    if (e.isDir || !/\.zip$/i.test(e.name)) continue;
    const jarName = `${e.name.slice(0, -4)}.jar`;
    const from = `${rel}/${e.name}`;
    const to = `${rel}/${jarName}`;
    if (await pathExists(to)) {
      await removeFileCmd(from);
    } else {
      await invoke("move_path_cmd", { from, to });
    }
    fixed += 1;
  }
  return fixed;
}
