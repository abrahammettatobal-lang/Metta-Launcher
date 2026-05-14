import {
  downloadFileCmd,
  extractZipCmd,
  mkdirAllCmd,
  pathExists,
  writeTextFile,
} from "../bridge";
import type { McOs } from "./os";
import type { LibraryEntry } from "./libraryService";
import { nativeArtifactForOs } from "./libraryService";

export async function extractNativesForVersion(
  libraries: LibraryEntry[],
  os: McOs,
  _librariesRoot: string,
  nativesOutRel: string,
): Promise<void> {
  const out = nativesOutRel.replace(/\\/g, "/");
  await mkdirAllCmd(out);
  for (const lib of libraries) {
    const nat = nativeArtifactForOs(lib, os);
    if (!nat) continue;
    const relLib = `shared/libraries/${nat.relPath}`.replace(/\\/g, "/");
    if (!(await pathExists(relLib))) {
      if (!nat.url) continue;
      await downloadFileCmd(`native-${nat.relPath}`, nat.url, relLib, nat.sha1 ?? null);
    }
    const stamp = `${out}/.${nat.relPath.replace(/[^\w.-]+/g, "_")}.extracted`;
    if (await pathExists(stamp)) continue;
    await extractZipCmd(relLib, out);
    await writeTextFile(stamp, "ok");
  }
}
