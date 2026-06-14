import {
  downloadFileCmd,
  extractZipCmd,
  missingPathsCmd,
  mkdirAllCmd,
  writeTextFile,
} from "../bridge";
import { detectMcOs } from "./os";
import { resolveMcArch } from "../platform";
import type { LibraryEntry } from "./libraryService";
import { nativeArtifactsForOs } from "./libraryService";

export async function extractNativesForVersion(
  libraries: LibraryEntry[],
  os = detectMcOs(),
  _librariesRoot: string,
  nativesOutRel: string,
): Promise<number> {
  const out = nativesOutRel.replace(/\\/g, "/");
  await mkdirAllCmd(out);
  const arch = await resolveMcArch();

  const nativeLibs: Array<{
    relLib: string;
    stamp: string;
    url?: string;
    sha1?: string;
  }> = [];

  for (const lib of libraries) {
    const nat = nativeArtifactsForOs(lib, os, arch);
    if (!nat) continue;
    const relLib = `shared/libraries/${nat.relPath}`.replace(/\\/g, "/");
    const stamp = `${out}/.${nat.relPath.replace(/[^\w.-]+/g, "_")}.extracted`;
    nativeLibs.push({ relLib, stamp, url: nat.url, sha1: nat.sha1 ?? undefined });
  }

  if (nativeLibs.length === 0) return 0;

  const libPaths = nativeLibs.map((n) => n.relLib);
  const stampPaths = nativeLibs.map((n) => n.stamp);
  const missingLibs = new Set(await missingPathsCmd(libPaths));
  const missingStamps = new Set(await missingPathsCmd(stampPaths));

  for (const nat of nativeLibs) {
    if (missingLibs.has(nat.relLib)) {
      if (!nat.url) continue;
      await downloadFileCmd(`native-${nat.relLib}`, nat.url, nat.relLib, nat.sha1 ?? null);
    }
    if (missingStamps.has(nat.stamp)) {
      await extractZipCmd(nat.relLib, out);
      await writeTextFile(nat.stamp, "ok");
    }
  }

  return nativeLibs.length;
}
