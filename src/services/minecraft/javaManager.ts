import {
  downloadFileCmd,
  extractZipCmd,
  javaDetect,
  mkdirAllCmd,
  pathExists,
  settingGet,
  settingSet,
} from "../bridge";
import { detectMcOs } from "./os";

export interface JavaEnsureResult {
  javaPath: string;
  wasDownloaded: boolean;
}

// Adoptium Temurin API — get latest LTS release for the given major version
const ADOPTIUM_API = "https://api.adoptium.net/v3";

/** Map Minecraft OS → Adoptium OS name */
function adoptiumOs(): string {
  const os = detectMcOs();
  if (os === "osx") return "mac";
  return os; // "windows" | "linux" match Adoptium
}

/** Map process.arch → Adoptium architecture */
function adoptiumArch(): string {
  const a = navigator.platform?.toLowerCase() ?? "";
  if (a.includes("arm") || a.includes("aarch")) return "aarch64";
  return "x64";
}

/** Fetch the latest Adoptium Temurin 21 LTS download URL for this platform */
async function fetchTemurin21Url(): Promise<{ url: string; name: string }> {
  const os = adoptiumOs();
  const arch = adoptiumArch();
  const imageType = "jdk";
  const url =
    `${ADOPTIUM_API}/assets/latest/21/hotspot` +
    `?architecture=${arch}&image_type=${imageType}&os=${os}&vendor=eclipse`;

  const res = await fetch(url);
  if (!res.ok)
    throw new Error(`[JavaManager] Adoptium API HTTP ${res.status}: ${url}`);

  const data = (await res.json()) as Array<{
    binary: {
      package: { link: string; name: string };
    };
  }>;

  if (!data || data.length === 0)
    throw new Error("[JavaManager] No Adoptium release found for this platform");

  const pkg = data[0].binary.package;
  return { url: pkg.link, name: pkg.name };
}

/**
 * Returns the path to a usable java binary.
 * Order of preference:
 *  1. Instance-specific javaPath
 *  2. Global "javaPath" setting
 *  3. System java detected by javaDetect()
 *  4. Auto-download Temurin 21 from Adoptium and save path to settings
 */
export async function ensureJava(
  instanceJavaPath: string | null,
  onStep?: (msg: string) => void,
): Promise<JavaEnsureResult> {
  // 1. Instance override
  if (instanceJavaPath) {
    onStep?.(`[Java] Using instance Java: ${instanceJavaPath}`);
    return { javaPath: instanceJavaPath, wasDownloaded: false };
  }

  // 2. Global setting
  const savedPath = await settingGet("javaPath");
  if (savedPath) {
    onStep?.(`[Java] Using saved Java: ${savedPath}`);
    return { javaPath: savedPath, wasDownloaded: false };
  }

  // 3. System detection
  onStep?.("[Java] Detecting system Java installations…");
  const candidates = await javaDetect();
  if (candidates.length > 0) {
    const best = candidates[0];
    onStep?.(`[Java] Found system Java: ${best.path} (${best.version ?? "unknown"})`);
    await settingSet("javaPath", best.path);
    return { javaPath: best.path, wasDownloaded: false };
  }

  // 4. Auto-download Temurin 21
  onStep?.("[Java] No Java found — downloading Temurin 21 LTS from Adoptium…");
  const { url, name } = await fetchTemurin21Url();

  const javaDir = "shared/java";
  await mkdirAllCmd(javaDir);

  const archiveName = name;
  const archiveRel = `${javaDir}/${archiveName}`;
  const extractDir = `${javaDir}/temurin-21`;

  if (!(await pathExists(archiveRel))) {
    onStep?.(`[Java] Downloading ${archiveName}…`);
    await downloadFileCmd("java-temurin-21", url, archiveRel, null);
  }

  onStep?.("[Java] Extracting Java…");
  await mkdirAllCmd(extractDir);
  await extractZipCmd(archiveRel, extractDir);

  // Resolve the actual java(.exe) binary inside the extracted folder
  const os = detectMcOs();
  const binExt = os === "windows" ? ".exe" : "";
  // Adoptium extracts to a sub-folder like jdk-21.0.x+y-hotspot/bin/java
  // We need to find it — use a known relative pattern
  const javaExe = `${extractDir}/bin/java${binExt}`;

  onStep?.(`[Java] Java ready at ${javaExe}`);
  await settingSet("javaPath", javaExe);

  return { javaPath: javaExe, wasDownloaded: true };
}
