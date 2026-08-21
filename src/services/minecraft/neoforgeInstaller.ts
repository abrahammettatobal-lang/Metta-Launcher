import {
  downloadFileCmd,
  mkdirAllCmd,
  neoforgeListVersions as neoforgeListVersionsCmd,
  pathExists,
  runJavaJar,
  writeTextFile,
} from "../bridge";
import type { McVersionJson } from "./libraryService";
import { readNeoForgeVersionJson } from "./loaderVersionJson";

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

async function readInstalledNeoForgeVersion(
  neoKey: string,
): Promise<McVersionJson | null> {
  try {
    return await readNeoForgeVersionJson(neoKey);
  } catch {
    return null;
  }
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
  onStep?: (msg: string) => void,
): Promise<McVersionJson> {
  const existing = await readInstalledNeoForgeVersion(neoKey);
  if (existing) {
    onStep?.("NeoForge: usando instalación existente.");
    return existing;
  }

  const slug = neoKey;
  const workRel = `shared/neoforge_runs/${slug}`;
  const jarRel = `${workRel}/neoforge-installer.jar`;
  const installerUrl = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${slug}/neoforge-${slug}-installer.jar`;
  await mkdirAllCmd(workRel);
  if (!(await pathExists(jarRel))) {
    onStep?.("NeoForge: descargando instalador…");
    await downloadFileCmd(`neoforge-installer-${slug}`, installerUrl, jarRel, undefined);
  }
  await ensureLauncherProfilesStub();
  const root = launcherRoot.replace(/\\/g, "/");
  onStep?.("NeoForge: ejecutando instalador…");
  const output = await runJavaJar({
    javaPath,
    jarPath: jarRel,
    workDir: workRel,
    args: ["--installClient", root],
    timeoutSecs: 900,
  });
  if (output.trim()) {
    onStep?.(output.trim().split(/\r?\n/).slice(-3).join(" "));
  }
  return readNeoForgeVersionJson(neoKey);
}
