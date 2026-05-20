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

/** Compare NeoForge versions newest-first using a numeric component split. */
function cmpVersion(a: string, b: string): number {
  const pa = a.split(/[.\-]/).map((s) => Number(s) || 0);
  const pb = b.split(/[.\-]/).map((s) => Number(s) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const av = pa[i] ?? 0;
    const bv = pb[i] ?? 0;
    if (av !== bv) return bv - av;
  }
  return 0;
}

/**
 * Map a Minecraft version like "1.21.1" to the NeoForge series prefix "21.1.".
 * NeoForge encodes MC version as the first two numeric segments (after dropping "1.").
 */
function neoSeriesPrefix(mcVersion: string): string | null {
  const m = mcVersion.match(/^1\.(\d+)(?:\.(\d+))?/);
  if (!m) return null;
  const minor = m[1];
  const patch = m[2] ?? "0";
  return `${minor}.${patch}.`;
}

export async function listNeoForgeVersions(
  mcVersion?: string,
): Promise<string[]> {
  const url =
    "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`NeoForge metadata HTTP ${res.status}`);
  const xml = await res.text();
  // Only grab versions inside <versioning><versions>…</versions></versioning>
  // to avoid <latest>/<release> tags that share the <version> name nowhere
  // but be safe regardless.
  const block = xml.match(/<versions>([\s\S]+?)<\/versions>/);
  const body = block ? block[1] : xml;
  const all: string[] = [];
  const re = /<version>([^<]+)<\/version>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const v = m[1].trim();
    if (v) all.push(v);
  }
  // Drop beta builds for the picker.
  const stable = all.filter((v) => !/-beta|-rc|-pre/i.test(v));
  stable.sort(cmpVersion);
  if (mcVersion) {
    const prefix = neoSeriesPrefix(mcVersion);
    if (prefix) {
      const filtered = stable.filter((v) => v.startsWith(prefix));
      if (filtered.length) return filtered;
    }
  }
  return stable.slice(0, 200);
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
  const verDir = `versions`;
  const vers = await listDirCmd(verDir);
  const dir = vers.find((e) => e.isDir);
  if (!dir) throw new Error("NeoForge installer did not create versions/");
  const jsonPath = `${verDir}/${dir.name}/${dir.name}.json`;
  const txt = await readTextFile(jsonPath);
  return JSON.parse(txt) as McVersionJson;
}
