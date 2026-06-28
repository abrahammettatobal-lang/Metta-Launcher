import {
  downloadFileCmd,
  forgeListVersions as forgeListVersionsCmd,
  listDirCmd,
  mkdirAllCmd,
  pathExists,
  readTextFile,
  runJavaJar,
  writeTextFile,
} from "../bridge";
import type { McVersionJson } from "./libraryService";

/** Forge's installer aborts if there isn't a `launcher_profiles.json` at the root.
 * The file just has to exist with a valid empty-profiles JSON. */
async function ensureLauncherProfilesStub(): Promise<void> {
  const rel = "launcher_profiles.json";
  if (await pathExists(rel)) return;
  const stub = {
    profiles: {},
    selectedProfile: "",
    clientToken: "00000000-0000-0000-0000-000000000000",
    authenticationDatabase: {},
    launcherVersion: { name: "MettaLauncher", format: 21 },
  };
  await writeTextFile(rel, JSON.stringify(stub, null, 2));
}

function forgeVersionFolderCandidates(forgeKey: string): string[] {
  const parts = forgeKey.split("-");
  const mc = parts[0];
  const forgeVer = parts.slice(1).join("-");
  const out = [forgeKey];
  if (forgeVer) {
    out.push(`${mc}-forge-${forgeVer}`);
  }
  return out;
}

async function readVersionJsonFromCandidates(
  candidates: string[],
): Promise<McVersionJson> {
  const verDir = "versions";
  const vers = await listDirCmd(verDir);
  const dirs = vers.filter((e) => e.isDir).map((e) => e.name);

  for (const candidate of candidates) {
    if (!dirs.includes(candidate)) continue;
    const jsonPath = `${verDir}/${candidate}/${candidate}.json`;
    if (!(await pathExists(jsonPath))) continue;
    const txt = await readTextFile(jsonPath);
    return JSON.parse(txt) as McVersionJson;
  }

  for (const dir of dirs) {
    for (const candidate of candidates) {
      if (!dir.includes(candidate) && !candidate.includes(dir)) continue;
      const jsonPath = `${verDir}/${dir}/${dir}.json`;
      if (!(await pathExists(jsonPath))) continue;
      const txt = await readTextFile(jsonPath);
      return JSON.parse(txt) as McVersionJson;
    }
  }

  throw new Error(
    `Forge installer did not create a known version folder (${candidates.join(", ")})`,
  );
}

export async function listForgeVersions(mc: string): Promise<string[]> {
  return forgeListVersionsCmd(mc);
}

export async function installForgeSide(
  javaPath: string,
  launcherRoot: string,
  _mc: string,
  forgeKey: string,
): Promise<McVersionJson> {
  const slug = forgeKey;
  const workRel = `shared/forge_runs/${slug}`;
  const jarRel = `${workRel}/forge-installer.jar`;
  const installerUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${slug}/forge-${slug}-installer.jar`;
  await mkdirAllCmd(workRel);
  if (!(await pathExists(jarRel))) {
    await downloadFileCmd(`forge-installer-${slug}`, installerUrl, jarRel, undefined);
  }
  await ensureLauncherProfilesStub();
  const root = launcherRoot.replace(/\\/g, "/");
  await runJavaJar({
    javaPath,
    jarPath: jarRel,
    workDir: workRel,
    args: ["--installClient", root],
  });
  return readVersionJsonFromCandidates(forgeVersionFolderCandidates(forgeKey));
}
