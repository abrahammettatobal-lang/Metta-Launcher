import {
  downloadFileCmd,
  listDirCmd,
  mkdirAllCmd,
  pathExists,
  readTextFile,
  runJavaJar,
} from "../bridge";
import type { McVersionJson } from "./libraryService";

export async function listNeoForgeVersions(): Promise<string[]> {
  const res = await fetch(
    "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml",
  );
  if (!res.ok) throw new Error(`NeoForge metadata HTTP ${res.status}`);
  const xml = await res.text();
  const out: string[] = [];
  const re = /<version>([^<]+)<\/version>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    out.push(m[1]);
  }
  out.sort().reverse();
  return out.slice(0, 200);
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
  if (!dir) throw new Error("NeoForge installer did not create versions/");
  const jsonPath = `${verDir}/${dir.name}/${dir.name}.json`;
  const txt = await readTextFile(jsonPath);
  return JSON.parse(txt) as McVersionJson;
}
