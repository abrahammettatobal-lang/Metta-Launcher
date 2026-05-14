import {
  appPaths,
  getLaunchSession,
  instancesList,
  logAppend,
  mkdirAllCmd,
  settingGet,
  spawnJavaGame,
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
import {
  progressPreparing,
  progressJava,
  progressLibraries,
  progressAssets,
  progressNatives,
  progressLoader,
  progressStarting,
  progressRunning,
  resetLaunchProgress,
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

export async function launchInstance(instanceId: string): Promise<void> {
  resetLaunchProgress();

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

  // ─── Java ───────────────────────────────────────────────────────────────────
  progressJava("Buscando Java instalado…");
  const { javaPath } = await ensureJava(inst.javaPath, async (msg) => {
    progressJava(msg);
    await logAppend("launcher", "info", msg, instanceId);
  });
  await logAppend("launcher", "info", `[Java] Using: ${javaPath}`, instanceId);

  // ─── Installation ────────────────────────────────────────────────────────────
  let merged: McVersionJson;

  if (inst.loaderType === "vanilla") {
    progressLibraries("Vanilla: instalando librerías…");
    merged = await installVanillaSide(inst.minecraftVersion, os, nativesRel, async (m) => {
      if (m.startsWith("assets ")) {
        const [, rest] = m.split(" ");
        const [d, t] = rest.split("/");
        progressAssets(Number(d), Number(t));
      } else if (m.includes("native")) {
        progressNatives(m);
      } else if (m.includes("librar")) {
        progressLibraries(m);
      }
      await logAppend("launcher", "info", m, instanceId);
    });
  } else if (inst.loaderType === "fabric") {
    progressLibraries("Vanilla: instalando librerías base…");
    await installVanillaSide(inst.minecraftVersion, os, nativesRel, async (m) => {
      if (m.startsWith("assets ")) {
        const [, rest] = m.split(" ");
        const [d, t] = rest.split("/");
        progressAssets(Number(d), Number(t));
      } else if (m.includes("native")) {
        progressNatives(m);
      } else if (m.includes("librar")) {
        progressLibraries(m);
      }
      await logAppend("launcher", "info", m, instanceId);
    });
    progressLoader(`Fabric: instalando loader ${inst.loaderVersion}…`);
    merged = await installFabricSide(inst.minecraftVersion, inst.loaderVersion);
  } else if (inst.loaderType === "forge") {
    progressLibraries("Vanilla: instalando librerías base…");
    await installVanillaSide(inst.minecraftVersion, os, nativesRel, async () => undefined);
    progressLoader(`Forge: instalando loader ${inst.loaderVersion}…`);
    merged = await installForgeSide(javaPath, root, inst.minecraftVersion, inst.loaderVersion);
    merged = await mergeInheritedVersionJson(merged);
  } else if (inst.loaderType === "neoforge") {
    progressLibraries("Vanilla: instalando librerías base…");
    await installVanillaSide(inst.minecraftVersion, os, nativesRel, async () => undefined);
    progressLoader(`NeoForge: instalando loader ${inst.loaderVersion}…`);
    merged = await installNeoForgeSide(javaPath, root, inst.loaderVersion);
    merged = await mergeInheritedVersionJson(merged);
  } else {
    throw new Error("Unknown loader");
  }

  // ─── Classpath ───────────────────────────────────────────────────────────────
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

  const session = await getLaunchSession(active.id);
  const uuid = uuidWithHyphens(session.uuid);
  const versionType = merged.type ?? "release";

  const rep: LaunchReplacements = {
    auth_player_name: session.username,
    auth_uuid: uuid,
    auth_access_token: session.accessToken,
    auth_xuid: "",
    version_type: versionType,
    user_type: session.userType,
    version_name: merged.id,
    game_directory: abs(root, inst.instancePath),
    assets_root: abs(root, "shared/assets"),
    assets_index_name: merged.assetIndex?.id ?? "legacy",
    launcher_name: "MettaLauncher",
    launcher_version: "0.1.0",
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

  progressStarting(`Iniciando Java en ${javaPath}…`);
  await logAppend("launcher", "info", `Starting Java: ${javaPath}`, instanceId);
  await spawnJavaGame({
    javaPath,
    cwd: rep.game_directory,
    args: argv,
    env: [["METTA_LAUNCHER", "1"]],
  });
  progressRunning();
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
