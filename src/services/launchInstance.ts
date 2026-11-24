import {
  appPaths,
  getLaunchSession,
  instancesList,
  logAppend,
  mkdirAllCmd,
  settingGet,
  spawnJavaGame,
  stopJavaGame,
  modpackCountModJars,
  accountsList,
} from "./bridge";
import type { InstanceRow } from "./bridge";
import { installFabricSide } from "./minecraft/fabricInstaller";
import { installForgeSide, listForgeVersions, normalizeForgeKey } from "./minecraft/forgeInstaller";
import { installNeoForgeSide } from "./minecraft/neoforgeInstaller";
import { buildLaunchCommand, filterLaunchArgsForJava, type LaunchReplacements } from "./minecraft/launchCommandService";
import {
  libraryArtifactRef,
  mergeInheritedVersionJson,
  type McVersionJson,
} from "./minecraft/libraryService";
import { detectMcOs } from "./minecraft/os";
import { installVanillaSide, ensureLibrariesDownloaded } from "./minecraft/vanillaInstaller";
import { uuidWithHyphens } from "./minecraft/uuidFmt";
import { ensureJava } from "./minecraft/javaManager";
import { writeLaunchCache } from "./minecraft/launchCache";
import { simplifyPath } from "../utils/full-path";
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
  progressError,
  resetLaunchProgress,
  isLaunchAborted,
  resetAbortFlag,
  abortLaunch,
} from "./launchProgress";
import { recorderGetSettings, recorderStart } from "./recorder/recorderService";
import { repairModpackModExtensions } from "./minecraft/modpackModFiles";
import {
  resolveLibraryRel,
  libraryDirectoryRel,
  loaderUsesLegacyLibraryRoot,
} from "./minecraft/libraryPathService";
import { resolveClientJarResolution } from "./minecraft/versionJarService";

export { listForgeVersions } from "./minecraft/forgeInstaller";
export { listNeoForgeVersions } from "./minecraft/neoforgeInstaller";

function abs(root: string, rel: string): string {
  const a = simplifyPath(root).replace(/\/+$/, "");
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

let activeGame: { id: string } | null = null;
let _currentLaunch: Promise<void> | null = null;

export function handleGameExit(instanceId: string): void {
  if (activeGame?.id === instanceId) {
    activeGame = null;
    resetLaunchProgress();
  }
}

/** Stop a running game and wait for an in-flight installation to unwind. */
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
  try {
    await task;
  } catch (error) {
    if (isLaunchAborted()) resetLaunchProgress();
    else progressError(error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    if (_currentLaunch === task) _currentLaunch = null;
  }
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
  if (active.kind === "offline") {
    await log(
      "warn",
      "Cuenta offline activa: servidores online (Hypixel, etc.) requieren inicio de sesión con Microsoft.",
      instanceId,
    );
  }

  const os = detectMcOs();
  const nativesRel = `${inst.instancePath}/natives`.replace(/\\/g, "/");

  progressPreparing("Creando carpetas de instancia…");
  await mkdirAllCmd(inst.instancePath);
  await mkdirAllCmd(`${inst.instancePath}/mods`);
  await mkdirAllCmd(`${inst.instancePath}/config`);
  await mkdirAllCmd(`${inst.instancePath}/saves`);
  await mkdirAllCmd(`${inst.instancePath}/resourcepacks`);
  await mkdirAllCmd(`${inst.instancePath}/shaderpacks`);
  if (inst.loaderType !== "vanilla") {
    const fixed = await repairModpackModExtensions(inst.instancePath);
    if (fixed > 0) {
      await log(
        "info",
        `Reparados ${fixed} mod(s): renombrados de .zip a .jar para que el loader los detecte.`,
        instanceId,
      );
    }
    const modCount = await modpackCountModJars(inst.instancePath);
    if (modCount === 0) {
      await log(
        "warn",
        "La carpeta mods/ está vacía. Importa un modpack o añade mods antes de jugar.",
        instanceId,
      );
    }
  }
  profiler.end("Preparando");

  const vanillaProgress = (instanceId: string) => async (m: string, done?: number, total?: number) => {
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
    } else if (
      m.includes("librar") ||
      m.startsWith("Downloading ") ||
      m.startsWith("Downloaded ") ||
      m.startsWith("Fetching ") ||
      m.startsWith("Using cached") ||
      m.startsWith("Asset ")
    ) {
      progressLibraries(m, done, total);
    }
    await log("info", m, instanceId);
  };

  // ─── Java ───────────────────────────────────────────────────────────────────
  checkAbort();
  profiler.start("Java");
  progressJava("Buscando Java instalado…");
  const { javaPath } = await ensureJava(inst.javaPath, inst.minecraftVersion, async (msg) => {
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
    merged = await installVanillaSide(
      inst.minecraftVersion,
      os,
      nativesRel,
      vanillaProgress(instanceId),
    );
    profiler.end("Natives");
  } else if (inst.loaderType === "custom") {
    if (!inst.customClientJar?.trim()) {
      throw new Error(
        "Configura la ruta del client.jar personalizado en la instancia antes de jugar.",
      );
    }
    profiler.start("Librerías");
    progressLibraries("Client modificado: librerías base (sin descargar client.jar)…");
    merged = await installVanillaSide(
      inst.minecraftVersion,
      os,
      nativesRel,
      vanillaProgress(instanceId),
      { skipClientJar: true },
    );
    profiler.end("Natives");
  } else if (inst.loaderType === "fabric") {
    profiler.start("Librerías");
    progressLibraries("Vanilla: instalando librerías base…");
    await installVanillaSide(
      inst.minecraftVersion,
      os,
      nativesRel,
      vanillaProgress(instanceId),
    );
    profiler.end("Natives");
    profiler.start("Loader");
    progressLoader(`Fabric: instalando loader ${inst.loaderVersion}…`);
    merged = await installFabricSide(inst.minecraftVersion, inst.loaderVersion);
    await ensureLibrariesDownloaded(merged, os, async (m, done, total) => {
      progressLibraries(m, done, total);
      await log("info", m, instanceId);
    });
    profiler.end("Loader");
  } else if (inst.loaderType === "forge") {
    profiler.start("Librerías");
    progressLibraries("Vanilla: instalando librerías base…");
    await installVanillaSide(
      inst.minecraftVersion,
      os,
      nativesRel,
      vanillaProgress(instanceId),
    );
    profiler.end("Natives");
    profiler.start("Loader");
    let forgeKey = normalizeForgeKey(inst.minecraftVersion, inst.loaderVersion.trim());
    if (!forgeKey) {
      progressLoader(`Forge: buscando versión para ${inst.minecraftVersion}…`);
      const versions = await listForgeVersions(inst.minecraftVersion);
      forgeKey = versions[0] ?? "";
      if (!forgeKey) {
        throw new Error(
          `No se encontró Forge para Minecraft ${inst.minecraftVersion}. ` +
            "Abre la instancia y elige una versión de Forge.",
        );
      }
    }
    progressLoader(`Forge: instalando ${forgeKey}…`);
    merged = await installForgeSide(
      javaPath,
      root,
      inst.minecraftVersion,
      forgeKey,
      async (msg) => {
        progressLoader(msg);
        await log("info", msg, instanceId);
      },
    );
    merged = await mergeInheritedVersionJson(merged);
    await ensureLibrariesDownloaded(merged, os, async (m, done, total) => {
      progressLibraries(m, done, total);
      await log("info", m, instanceId);
    });
    profiler.end("Loader");
  } else if (inst.loaderType === "neoforge") {
    profiler.start("Librerías");
    progressLibraries("Vanilla: instalando librerías base…");
    await installVanillaSide(
      inst.minecraftVersion,
      os,
      nativesRel,
      vanillaProgress(instanceId),
    );
    profiler.end("Natives");
    profiler.start("Loader");
    progressLoader(`NeoForge: instalando loader ${inst.loaderVersion}…`);
    merged = await installNeoForgeSide(
      javaPath,
      root,
      inst.loaderVersion,
      async (msg) => {
        progressLoader(msg);
        await log("info", msg, instanceId);
      },
    );
    merged = await mergeInheritedVersionJson(merged);
    await ensureLibrariesDownloaded(merged, os, async (m, done, total) => {
      progressLibraries(m, done, total);
      await log("info", m, instanceId);
    });
    profiler.end("Loader");
  } else {
    throw new Error("Unknown loader");
  }

  // ─── Classpath ───────────────────────────────────────────────────────────────
  checkAbort();
  profiler.start("Classpath");
  progressLibraries("Construyendo classpath…");
  const cpSep = os === "windows" ? ";" : ":";
  const seen = new Set<string>();
  const cpParts: string[] = [];
  for (const lib of merged.libraries) {
    const a = libraryArtifactRef(lib, os);
    if (!a) continue;
    const libRel = await resolveLibraryRel(a.relPath, {
      preferLegacyRoot: loaderUsesLegacyLibraryRoot(inst.loaderType),
    });
    if (!libRel) continue;
    const p = abs(root, libRel);
    if (seen.has(p)) continue;
    seen.add(p);
    cpParts.push(p);
  }
  if (inst.loaderType === "custom") {
    progressLibraries(
      "Preparando client.jar personalizado (reempaquetado la 1.ª vez puede tardar ~20 s)…",
    );
  }
  const clientJar = await resolveClientJarResolution(
    root,
    inst.minecraftVersion,
    inst.loaderType,
    merged,
    inst.customClientJar,
  );
  if (clientJar.fallbackNote) {
    await log("warn", clientJar.fallbackNote, instanceId);
  }
  const versionJarAbs = clientJar.absPath;
  cpParts.push(versionJarAbs);
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
    // Prism/CurseForge pass the vanilla MC version so Forge/NeoForge
    // `-DignoreList=${version_name}.jar` matches 1.21.1.jar, not neoforge-21.1.265.jar.
    version_name:
      inst.loaderType === "forge" || inst.loaderType === "neoforge"
        ? inst.minecraftVersion
        : merged.id,
    minecraft_version: inst.minecraftVersion,
    game_directory: abs(root, inst.instancePath),
    assets_root: abs(root, "shared/assets"),
    assets_index_name: merged.assetIndex?.id ?? "legacy",
    launcher_name: "MettaLauncher",
    launcher_version: "0.8.1",
    classpath,
    library_directory: abs(root, libraryDirectoryRel(inst.loaderType)),
    natives_directory: abs(root, nativesRel),
    primary_jar: versionJarAbs,
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

  const argv = filterLaunchArgsForJava(
    buildLaunchCommand(
      merged,
      os,
      rep,
      extraJvm,
      extraGame,
      Number(inst.minRamMb),
      Number(inst.maxRamMb),
    ),
    javaPath,
  );

  // ─── Log profiler timings ────────────────────────────────────────────────────
  profiler.start("Proceso Java");
  for (const line of profiler.summary()) {
    await log("info", line, instanceId);
  }

  checkAbort();
  progressStarting(`Iniciando Java en ${javaPath}…`);
  await log("info", `Starting Java: ${javaPath}`, instanceId);
  const gameRun = { id: instanceId };
  activeGame = gameRun;
  try {
    await spawnJavaGame({
      javaPath,
      cwd: rep.game_directory,
      args: argv,
      env: [["METTA_LAUNCHER", "1"]],
      instanceId,
    });
  } catch (error) {
    if (activeGame === gameRun) activeGame = null;
    throw error;
  }
  if (activeGame !== gameRun) return;
  profiler.end("Proceso Java");
  progressRunning();
  try {
    const rec = await recorderGetSettings();
    if (rec.autoRecordOnLaunch) {
      window.setTimeout(() => {
        if (activeGame === gameRun && !isLaunchAborted()) void recorderStart(rec).catch(console.warn);
      }, 8000);
    }
  } catch {
    /* grabación opcional */
  }

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
  if (closeOnLaunch && activeGame === gameRun) {
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
