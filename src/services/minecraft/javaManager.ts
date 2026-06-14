import {
  downloadFileCmd,
  extractArchiveCmd,
  javaDetect,
  listDirCmd,
  mkdirAllCmd,
  pathExists,
  recommendedJava,
  settingGet,
  settingSet,
  type JavaCandidate,
} from "../bridge";
import { fullPath, simplifyPath } from "../../utils/full-path";
import { detectMcOs } from "./os";
import { getHostPlatform, mapHostArch } from "../platform";

export interface JavaEnsureResult {
  javaPath: string;
  wasDownloaded: boolean;
}

/** Busca java(.exe) dentro de una carpeta extraída (Adoptium anida jdk-21.x/). */
async function findJavaBinary(extractDir: string): Promise<string> {
  const os = detectMcOs();
  const binName = os === "windows" ? "java.exe" : "java";

  async function walk(rel: string, depth: number): Promise<string | null> {
    if (depth > 5) return null;
    const entries = await listDirCmd(rel);
    for (const e of entries) {
      if (!e.isDir && e.name.toLowerCase() === binName.toLowerCase()) {
        return `${rel}/${e.name}`.replace(/\\/g, "/");
      }
    }
    for (const e of entries) {
      if (e.isDir) {
        const sub = `${rel}/${e.name}`.replace(/\\/g, "/");
        const found = await walk(sub, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }

  const found = await walk(extractDir, 0);
  if (!found) {
    throw new Error(
      "[JavaManager] No se encontró java después de extraer Temurin. Borra shared/java e intenta de nuevo.",
    );
  }
  return found;
}

async function normalizeJavaPath(path: string): Promise<string> {
  const trimmed = simplifyPath(path);
  if (/^[a-zA-Z]:\//.test(trimmed) || trimmed.startsWith("/")) {
    return trimmed;
  }
  return fullPath(trimmed);
}

function parseJavaMajor(version: string | null | undefined): number | null {
  if (!version) return null;
  const m = version.match(/version "(\d+)/);
  return m ? Number(m[1]) : null;
}

function parseJavaMajorFromPath(path: string): number | null {
  const m = path.match(/jdk-(\d+)/i) || path.match(/jre-(\d+)/i);
  return m ? Number(m[1]) : null;
}

function javaMajorForPath(path: string, candidates: JavaCandidate[]): number | null {
  const norm = path.replace(/\\/g, "/").toLowerCase();
  const cand = candidates.find((c) => c.path.replace(/\\/g, "/").toLowerCase() === norm);
  return parseJavaMajor(cand?.version ?? null) ?? parseJavaMajorFromPath(path);
}

/** Java must be >= recommended and not more than one major ahead. */
function isJavaMajorSuitable(major: number | null, recommendedMajor: number): boolean {
  if (major === null) return false;
  if (major < recommendedMajor) return false;
  if (major > recommendedMajor + 1) return false;
  return true;
}

function pickBestJavaCandidate(
  candidates: JavaCandidate[],
  recommendedMajor: number,
): JavaCandidate | null {
  let best: { c: JavaCandidate; score: number } | null = null;
  for (const c of candidates) {
    const major = parseJavaMajor(c.version) ?? parseJavaMajorFromPath(c.path);
    if (major === null || !isJavaMajorSuitable(major, recommendedMajor)) continue;

    let score = 0;
    if (major === recommendedMajor) score = 100;
    else if (major === recommendedMajor + 1) score = 90;
    else if (major === 21 && recommendedMajor <= 21) score = 85;
    else if (major === 17 && recommendedMajor <= 17) score = 80;
    else score = 50;

    if (!best || score > best.score) best = { c, score };
  }
  return best?.c ?? null;
}

// Adoptium Temurin API — get latest LTS release for the given major version
const ADOPTIUM_API = "https://api.adoptium.net/v3";

/** Map Minecraft OS → Adoptium OS name */
function adoptiumOs(): string {
  const os = detectMcOs();
  if (os === "osx") return "mac";
  return os; // "windows" | "linux" match Adoptium
}

/** Map process.arch → Adoptium architecture (uses Rust host arch on macOS). */
async function adoptiumArch(): Promise<string> {
  const host = await getHostPlatform();
  const arch = mapHostArch(host.arch);
  return arch === "arm64" ? "aarch64" : "x64";
}

/** Fetch the latest Adoptium Temurin download URL for the given major version. */
async function fetchTemurinUrl(major: number): Promise<{ url: string; name: string }> {
  const os = adoptiumOs();
  const arch = await adoptiumArch();
  const imageType = "jdk";
  const url =
    `${ADOPTIUM_API}/assets/latest/${major}/hotspot` +
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

async function downloadBundledJava(
  major: number,
  onStep?: (msg: string) => void,
): Promise<string> {
  onStep?.(`[Java] Descargando Temurin ${major} LTS desde Adoptium…`);
  const { url, name } = await fetchTemurinUrl(major);

  const javaDir = "shared/java";
  await mkdirAllCmd(javaDir);

  const archiveRel = `${javaDir}/${name}`;
  const extractDir = `${javaDir}/temurin-${major}`;

  if (!(await pathExists(archiveRel))) {
    onStep?.(`[Java] Downloading ${name}…`);
    await downloadFileCmd(`java-temurin-${major}`, url, archiveRel, null);
  }

  onStep?.("[Java] Extracting Java…");
  await mkdirAllCmd(extractDir);
  await extractArchiveCmd(archiveRel, extractDir);

  const javaRel = await findJavaBinary(extractDir);
  const javaPath = await fullPath(javaRel);
  onStep?.(`[Java] Java ready at ${javaPath}`);
  await settingSet("javaPath", javaPath);
  return javaPath;
}

/**
 * Returns the path to a usable java binary.
 * Order of preference:
 *  1. Instance-specific javaPath (if compatible)
 *  2. Global "javaPath" setting (if compatible)
 *  3. Best system Java for this MC version
 *  4. Auto-download Temurin 21 from Adoptium
 */
export async function ensureJava(
  instanceJavaPath: string | null,
  minecraftVersion: string,
  onStep?: (msg: string) => void,
): Promise<JavaEnsureResult> {
  const recommendedMajor = await recommendedJava(minecraftVersion);
  onStep?.(`[Java] MC ${minecraftVersion} requiere Java ${recommendedMajor}`);
  const candidates = await javaDetect();

  async function tryPath(raw: string, source: string): Promise<string | null> {
    const javaPath = await normalizeJavaPath(raw);
    const major = javaMajorForPath(javaPath, candidates);
    if (!isJavaMajorSuitable(major, recommendedMajor)) {
      const majorLabel = major ?? "?";
      onStep?.(
        `[Java] ${source} (Java ${majorLabel}) no es compatible con MC ${minecraftVersion}; se recomienda Java ${recommendedMajor}.`,
      );
      return null;
    }
    onStep?.(`[Java] Using ${source}: ${javaPath}`);
    return javaPath;
  }

  if (instanceJavaPath) {
    const resolved = await tryPath(instanceJavaPath, "instance Java");
    if (resolved) return { javaPath: resolved, wasDownloaded: false };
  }

  const savedPath = await settingGet("javaPath");
  if (savedPath) {
    const resolved = await tryPath(savedPath, "saved Java");
    if (resolved) return { javaPath: resolved, wasDownloaded: false };
    await settingSet("javaPath", "");
  }

  onStep?.("[Java] Detecting system Java installations…");
  const best = pickBestJavaCandidate(candidates, recommendedMajor);
  if (best) {
    onStep?.(`[Java] Found system Java: ${best.path} (${best.version ?? "unknown"})`);
    await settingSet("javaPath", best.path);
    return { javaPath: best.path, wasDownloaded: false };
  }

  onStep?.(`[Java] No compatible Java found — downloading Temurin ${recommendedMajor} LTS…`);
  const javaPath = await downloadBundledJava(recommendedMajor, onStep);
  return { javaPath, wasDownloaded: true };
}
