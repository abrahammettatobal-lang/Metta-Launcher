import {
  downloadFileCmd,
  forgeListVersions as forgeListVersionsCmd,
  mkdirAllCmd,
  pathExists,
  removeFileCmd,
  runJavaJar,
  writeTextFile,
} from "../bridge";
import { subscribeDownloadProgress } from "../downloads/downloadEvents";
import type { McVersionJson } from "./libraryService";
import { readForgeVersionJson } from "./loaderVersionJson";

/** Maven Forge expects `{mc}-{forge}`, e.g. `1.20.1-47.4.20`. CurseForge often stores only `47.4.20`. */
export function normalizeForgeKey(mc: string, forgeKey: string): string {
  let key = forgeKey.trim();
  if (key.toLowerCase().startsWith("forge-")) {
    key = key.slice("forge-".length);
  }
  if (!key) return key;
  const mcPrefix = `${mc}-`;
  if (key.startsWith(mcPrefix)) return key;
  if (/^\d+\.\d+(?:\.\d+)?-\d/.test(key)) return key;
  return `${mcPrefix}${key}`;
}

async function downloadForgeInstaller(
  slug: string,
  installerUrl: string,
  jarRel: string,
  onStep?: (msg: string) => void,
): Promise<void> {
  const downloadId = `forge-installer-${slug}`;
  onStep?.(`Forge: descargando instalador desde Maven…`);
  const unlisten = await subscribeDownloadProgress((p) => {
    if (p.id !== downloadId) return;
    if (p.state === "downloading") {
      if (p.total && p.total > 0) {
        const pct = Math.min(100, Math.round((p.received / p.total) * 100));
        onStep?.(`Forge: descargando instalador… ${pct}%`);
      } else if (p.received > 0) {
        const mb = (p.received / (1024 * 1024)).toFixed(1);
        onStep?.(`Forge: descargando instalador… ${mb} MB`);
      }
    } else if (p.state === "failed" && p.error) {
      onStep?.(`Forge: error de descarga — ${p.error.split("\n")[0]}`);
    }
  });
  try {
    await downloadFileCmd(downloadId, installerUrl, jarRel, undefined);
  } catch (e) {
    await removeFileCmd(jarRel).catch(() => {});
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `No se pudo descargar el instalador de Forge (${slug}).\n` +
        `URL: ${installerUrl}\n` +
        `${msg}\n` +
        "Comprueba tu conexión o elige otra versión de Forge en la instancia.",
    );
  } finally {
    unlisten();
  }
}

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
  const out = new Set<string>([forgeKey]);
  if (parts.length >= 2) {
    const forgeVer = parts.slice(1).join("-");
    out.add(`${mc}-forge-${forgeVer}`);
    const legacyForge = forgeVer.match(/^(\d+\.\d+\.\d+\.\d+)/);
    if (legacyForge) {
      out.add(`${mc}-Forge${legacyForge[1]}`);
    }
  }
  return [...out];
}

async function readInstalledForgeVersion(
  forgeKey: string,
): Promise<McVersionJson | null> {
  try {
    return await readVersionJsonFromCandidates(forgeVersionFolderCandidates(forgeKey));
  } catch {
    return null;
  }
}

async function readVersionJsonFromCandidates(
  candidates: string[],
): Promise<McVersionJson> {
  return readForgeVersionJson(candidates);
}

export async function listForgeVersions(mc: string): Promise<string[]> {
  return forgeListVersionsCmd(mc);
}

export async function installForgeSide(
  javaPath: string,
  launcherRoot: string,
  mc: string,
  forgeKey: string,
  onStep?: (msg: string) => void,
): Promise<McVersionJson> {
  const slug = normalizeForgeKey(mc, forgeKey);
  if (slug !== forgeKey.trim()) {
    onStep?.(`Forge: versión normalizada a ${slug}.`);
  }

  const existing = await readInstalledForgeVersion(slug);
  if (existing) {
    onStep?.("Forge: usando instalación existente.");
    return existing;
  }

  const workRel = `shared/forge_runs/${slug}`;
  const jarRel = `${workRel}/forge-installer.jar`;
  const installerUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${slug}/forge-${slug}-installer.jar`;
  await mkdirAllCmd(workRel);

  if (!(await pathExists(jarRel))) {
    await downloadForgeInstaller(slug, installerUrl, jarRel, onStep);
  }
  await ensureLauncherProfilesStub();
  const root = launcherRoot.replace(/\\/g, "/");
  onStep?.("Forge: ejecutando instalador (en 1.7.10 puede tardar varios minutos)…");
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
  return readVersionJsonFromCandidates(forgeVersionFolderCandidates(slug));
}
