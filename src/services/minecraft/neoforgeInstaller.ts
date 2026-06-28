import {
  downloadFileCmd,
  listDirCmd,
  mkdirAllCmd,
  neoforgeListVersions as neoforgeListVersionsCmd,
  pathExists,
  readTextFile,
  runJavaJar,
  writeTextFile,
} from "../bridge";
import type { McVersionJson } from "./libraryService";

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

function neoVersionFolderCandidates(neoKey: string): string[] {
  return [neoKey, `neoforge-${neoKey}`];
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
    `NeoForge installer did not create a known version folder (${candidates.join(", ")})`,
  );
}

export async function listNeoForgeVersions(
  mcVersion?: string,
): Promise<string[]> {
  return neoforgeListVersionsCmd(mcVersion);
}

export async function installNeoForgeSide(
  javaPath: string,
  launcherRoot: string,
  neoKey: string,
): Promise<McVersionJson> {
  const slug = neoKey;
  const workRel = `shared/neoforge_runs/${slug}`;
  const jarRel = `${workRel}/neoforge-installer.jar`;
  const installerUrl = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${slug}/neoforge-${slug}-installer.jar`;
  await mkdirAllCmd(workRel);
  if (!(await pathExists(jarRel))) {
    await downloadFileCmd(`neoforge-installer-${slug}`, installerUrl, jarRel, undefined);
  }
  await ensureLauncherProfilesStub();
  const root = launcherRoot.replace(/\\/g, "/");
  await runJavaJar({
    javaPath,
    jarPath: jarRel,
    workDir: workRel,
    args: ["--installClient", root],
  });
  return readVersionJsonFromCandidates(neoVersionFolderCandidates(neoKey));
}
