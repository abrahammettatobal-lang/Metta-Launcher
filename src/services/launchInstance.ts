import {
  appPaths,
  getLaunchSession,
  instancesList,
  logAppend,
  mkdirAllCmd,
  settingGet,
  spawnJavaGame,
  stopJavaGame,
  accountsList,
} from "./bridge";
import type { InstanceRow } from "./bridge";
import { installFabricSide } from "./minecraft/fabricInstaller";
import { installForgeSide } from "./minecraft/forgeInstaller";
import { installNeoForgeSide } from "./minecraft/neoforgeInstaller";
import { buildLaunchCommand, type LaunchReplacements } from "./minecraft/launchCommandService";
import {
  libraryArtifactRef,
  mergeInheritedVersionJson,
  type McVersionJson,
} from "./minecraft/libraryService";
import { detectMcOs } from "./minecraft/os";
import { installVanillaSide } from "./minecraft/vanillaInstaller";
import { uuidWithHyphens } from "./minecraft/uuidFmt";
import { ensureJava } from "./minecraft/javaManager";
import { writeLaunchCache } from "./minecraft/launchCache";
import {
  profiler,
  progressPreparing,
  progressJava,
  progressLibraries,
  progressAssets,
  progressNatives,
  progressLoader,
  progressStarting,
  progressRunning,
  resetLaunchProgress,
  isLaunchAborted,
  resetAbortFlag,
  abortLaunch,
} from "./launchProgress";

export { listForgeVersions } from "./minecraft/forgeInstaller";
export { listNeoForgeVersions } from "./minecraft/neoforgeInstaller";

function abs(root: string, rel: string): string {
  const a = root.replace(/\\/g, "/").replace(/\/+$/, "");
  const b = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  return `${a}/${b}`;
}

function parseJvmExtra(s: string): string[] {
  return s
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseGameExtra(s: string): string[] {
  return s
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * Tracks the currently-active launch task so that a second `launchInstance`
 * call automatically cancels its predecessor (in-flight install or already
 * running game) before starting.
 */
let _currentLaunch: Promise<void> | null = null;

/**
 * Cancel any launch / running game and wait for it to fully tear down.
 * Safe to call from anywhere; never throws.
 */
export async function cancelCurrentLaunch(): Promise<void> {
  abortLaunch();
  try {
    await stopJavaGame();
  } catch (e) {
    console.warn("[launch] stopJavaGame failed (likely no process):", e);
  }
  if (_currentLaunch) {
    try {
      await _currentLaunch;
    } catch {
      /* expected — prior launch threw after abort */
    }
  }
}

export async function launchInstance(instanceId: string): Promise<void> {
  // Politely cancel anything already in flight (install pipeline OR a running
  // game process). We do not want concurrent launches.
  if (_currentLaunch) {
    progressPreparing("Cancelando instancia previa…");
    await logAppend(
      "launcher",
      "info",
      "Cancelando instancia previa antes de lanzar una nueva",
      instanceId,
    );
    await cancelCurrentLaunch();
  } else {
    // No tracked launch task, but there might still be a stale game process.
    try {
      await stopJavaGame();
    } catch {
      /* noop — usually nothing was running */
    }
  }

  const task = runLaunchPipeline(instanceId);
  _currentLaunch = task;
  // Clear the slot when the launch finishes — only if we're still the
  // active task (a later launch may have replaced us in the meantime).
  void task.finally(() => {
    if (_currentLaunch === task) _currentLaunch = null;
  });
  return task;
}

async function log(level: string, msg: string, instanceId: string) {
  console.log(`[launch/${level}] ${msg}`);
  await logAppend("launcher", level, msg, instanceId);
}

async function runLaunchPipeline(instanceId: string): Promise<void> {
  resetLaunchProgress();
  resetAbortFlag();

  const checkAbort = () => {
    if (isLaunchAborted()) {
      progressPreparing("Lanzamiento cancelado");
      throw new Error("Lanzamiento cancelado por el usuario");
    }
  };

  // ─── Preparing ──────────────────────────────────────────────────────────────
  profiler.start("Preparando");
  const paths = await appPaths();
  const root = paths.launcherRoot;
  const list = await instancesList();
  const inst = list.find((i) => i.id === instanceId);
  if (!inst) throw new Error("Instance not found");
  const accounts = await accountsList();
  const active = accounts.find((a) => a.isActive);
  if (!active) throw new Error("No active account");

  const os = detectMcOs();
  const nativesRel = `${inst.instancePath}/natives`.replace(/\\/g, "/");

  progressPreparing("Creando carpetas de instancia…");
  await mkdirAllCmd(inst.instancePath);
  await mkdirAllCmd(`${inst.instancePath}/mods`);
  await mkdirAllCmd(`${inst.instancePath}/config`);
  await mkdirAllCmd(`${inst.instancePath}/saves`);
  await mkdirAllCmd(`${inst.instancePath}/resourcepacks`);
  await mkdirAllCmd(`${inst.instancePath}/shaderpacks`);
  profiler.end("Preparando");

  // ─── Java ───────────────────────────────────────────────────────────────────
  checkAbort();
  profiler.start("Java");
  progressJava("Buscando Java instalado…");
  const { javaPath } = await ensureJava(inst.javaPath, async (msg) => {
    progressJava(msg);
    await log("info", msg, instanceId);
  });
  await log("info", `[Java] Using: ${javaPath}`, instanceId);
  profiler.end("Java");

  // ─── Installation ────────────────────────────────────────────────────────────
  checkAbort();
  let merged: McVersionJson;

  if (inst.loaderType === "vanilla") {
    profiler.start("Librerías");
    progressLibraries("Vanilla: instalando librerías…");
    merged = await installVanillaSide(inst.minecraftVersion, os, nativesRel, async (m) => {
      if (m.startsWith("assets ")) {
        const [, rest] = m.split(" ");
        const [d, t] = rest.split("/");
        if (t && d) {
          profiler.end("Librerías");
          profiler.start("Assets");
          progressAssets(Number(d), Number(t));
        }
      } else if (m.includes("native")) {
        profiler.end("Assets");
        profiler.start("Natives");
        progressNatives(m);
      } else if (m.includes("librar")) {
        progressLibraries(m);
      }
      await log("info", m, instanceId);
    });
    profiler.end("Natives");
  } else if (inst.loaderType === "fabric") {
    profiler.start("Librerías");
    progressLibraries("Vanilla: instalando librerías base…");
    await installVanillaSide(inst.minecraftVersion, os, nativesRel, async (m) => {
      if (m.startsWith("assets ")) {
        const [, rest] = m.split(" ");
        const [d, t] = rest.split("/");
        if (t && d) {
          profiler.end("Librerías");
          profiler.start("Assets");
          progressAssets(Number(d), Number(t));
        }
      } else if (m.includes("native")) {
        profiler.end("Assets");
        profiler.start("Natives");
        progressNatives(m);
      } else if (m.includes("librar")) {
        progressLibraries(m);
      }
      await log("info", m, instanceId);
    });
    profiler.end("Natives");
    profiler.start("Loader");
    progressLoader(`Fabric: instalando loader ${inst.loaderVersion}…`);
    merged = await installFabricSide(inst.minecraftVersion, inst.loaderVersion);
    profiler.end("Loader");
  } else if (inst.loaderType === "forge") {
    profiler.start("Librerías");
    progressLibraries("Vanilla: instalando librerías base…");
    await installVanillaSide(inst.minecraftVersion, os, nativesRel, async () => undefined);
    profiler.end("Librerías");
    profiler.start("Loader");
    progressLoader(`Forge: instalando loader ${inst.loaderVersion}…`);
    merged = await installForgeSide(javaPath, root, inst.minecraftVersion, inst.loaderVersion);
    merged = await mergeInheritedVersionJson(merged);
    profiler.end("Loader");
  } else if (inst.loaderType === "neoforge") {
    profiler.start("Librerías");
    progressLibraries("Vanilla: instalando librerías base…");
    await installVanillaSide(inst.minecraftVersion, os, nativesRel, async () => undefined);
    profiler.end("Librerías");
    profiler.start("Loader");
    progressLoader(`NeoForge: instalando loader ${inst.loaderVersion}…`);
    merged = await installNeoForgeSide(javaPath, root, inst.loaderVersion);
    merged = await mergeInheritedVersionJson(merged);
    profiler.end("Loader");
  } else {
    throw new Error("Unknown loader");
  }

  // ─── Classpath ───────────────────────────────────────────────────────────────
  checkAbort();
  profiler.start("Classpath");
  const cpSep = os === "windows" ? ";" : ":";
  const seen = new Set<string>();
  const cpParts: string[] = [];
  for (const lib of merged.libraries) {
    const a = libraryArtifactRef(lib, os);
    if (!a) continue;
    const p = abs(root, `shared/libraries/${a.relPath}`);
    if (seen.has(p)) continue;
    seen.add(p);
    cpParts.push(p);
  }
  cpParts.push(abs(root, `shared/versions/${inst.minecraftVersion}/${inst.minecraftVersion}.jar`));
  const classpath = cpParts.join(cpSep);
  profiler.end("Classpath");

  const session = await getLaunchSession(active.id);
  const uuid = uuidWithHyphens(session.uuid);
  const versionType = merged.type ?? "release";

  const rep: LaunchReplacements = {
    auth_player_name: session.username,
    auth_uuid: uuid,
    auth_access_token: session.accessToken,
    auth_xuid: session.xuid ?? "",
    version_type: versionType,
    user_type: session.userType,
    version_name: merged.id,
    game_directory: abs(root, inst.instancePath),
    assets_root: abs(root, "shared/assets"),
    assets_index_name: merged.assetIndex?.id ?? "legacy",
    launcher_name: "MettaLauncher",
    launcher_version: "0.4.0",
    classpath,
    library_directory: abs(root, "shared/libraries"),
    natives_directory: abs(root, nativesRel),
    primary_jar: abs(root, `shared/versions/${inst.minecraftVersion}/${inst.minecraftVersion}.jar`),
    clientid: "metta",
  };

  const globalJvm = (await settingGet("globalJvmArgs")) || "";
  const extraJvm = [...parseJvmExtra(globalJvm), ...parseJvmExtra(inst.jvmArgs)];
  const extraGame = parseGameExtra(inst.gameArgs);
  const res = inst.gameResolution;
  if (res && res.includes("x")) {
    const [w, h] = res.split("x");
    extraGame.push("--width", w.trim(), "--height", h.trim());
  }

  const argv = buildLaunchCommand(
    merged,
    os,
    rep,
    extraJvm,
    extraGame,
    Number(inst.minRamMb),
    Number(inst.maxRamMb),
  );

  // ─── Log profiler timings ────────────────────────────────────────────────────
  profiler.start("Proceso Java");
  for (const line of profiler.summary()) {
    await log("info", line, instanceId);
  }

  checkAbort();
  progressStarting(`Iniciando Java en ${javaPath}…`);
  await log("info", `Starting Java: ${javaPath}`, instanceId);
  await spawnJavaGame({
    javaPath,
    cwd: rep.game_directory,
    args: argv,
    env: [["METTA_LAUNCHER", "1"]],
    instanceId,
  });
  profiler.end("Proceso Java");
  progressRunning();

  // Persist launch cache for future fast-path validation
  try {
    await writeLaunchCache(inst.instancePath, {
      mcVersion: inst.minecraftVersion,
      loaderType: inst.loaderType,
      loaderVersion: inst.loaderVersion,
      javaPath,
      javaValidatedAt: new Date().toISOString(),
      lastSuccessfulLaunch: new Date().toISOString(),
    });
  } catch {
    // Cache write failure is non-critical
  }

  // Honor user preference: minimize the launcher window while the game runs.
  const closeOnLaunch = (await settingGet("closeOnLaunch")) === "true";
  if (closeOnLaunch) {
    try {
      const win = (await import("@tauri-apps/api/window")).getCurrentWindow();
      await win.minimize();
    } catch (e) {
      await log("warn", `No se pudo minimizar la ventana: ${e}`, instanceId);
    }
  }
}

export async function prepareNewInstancePaths(
  _root: string,
  row: InstanceRow,
): Promise<InstanceRow> {
  const base = `instances/${row.id}`;
  const next = { ...row, instancePath: base };
  await mkdirAllCmd(base);
  return next;
}
