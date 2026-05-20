import {
  downloadFileCmd,
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

export async function listForgeVersions(mc: string): Promise<string[]> {
  const res = await fetch(
    "https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml",
  );
  if (!res.ok) throw new Error(`Forge metadata HTTP ${res.status}`);
  const xml = await res.text();
  const out: string[] = [];
  const re = /<version>([^<]+)<\/version>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[1].startsWith(`${mc}-`)) out.push(m[1]);
  }
  out.sort();
  return out;
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
  // Forge's installer refuses to run if there is no launcher_profiles.json in
  // the install target. Write a minimal stub before invoking the jar.
  await ensureLauncherProfilesStub();
  const root = launcherRoot.replace(/\\/g, "/");
  await runJavaJar({
    javaPath,
    jarPath: jarRel,
    workDir: workRel,
    args: ["--installClient", root],
  });
  const verDir = `versions`;
  const vers = await listDirCmd(verDir);
  const dir = vers.find((e) => e.isDir);
  if (!dir) throw new Error("Forge installer did not create versions/");
  const jsonPath = `${verDir}/${dir.name}/${dir.name}.json`;
  const txt = await readTextFile(jsonPath);
  return JSON.parse(txt) as McVersionJson;
}
