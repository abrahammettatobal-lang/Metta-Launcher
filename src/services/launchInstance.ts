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
import { installFabric } from "./minecraft/fabricInstaller";
import { installForgeSide } from "./minecraft/forgeInstaller";
import { installNeoForgeSide } from "./minecraft/neoforgeInstaller";
import { buildLaunchCommand, type LaunchReplacements } from "./minecraft/launchCommandService";
import {
  libraryArtifactRef,
  type McVersionJson,
  type LibraryEntry,
} from "./minecraft/libraryService";
import { detectMcOs } from "./minecraft/os";
import { installVanillaSide } from "./minecraft/vanillaInstaller";
import { uuidWithHyphens } from "./minecraft/uuidFmt";

import { mergeInheritedVersionJson } from "./minecraft/libraryService";

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
  await mkdirAllCmd(inst.instancePath);
  await mkdirAllCmd(`${inst.instancePath}/mods`);
  await mkdirAllCmd(`${inst.instancePath}/config`);
  await mkdirAllCmd(`${inst.instancePath}/saves`);
  await mkdirAllCmd(`${inst.instancePath}/resourcepacks`);
  await mkdirAllCmd(`${inst.instancePath}/shaderpacks`);

  let merged: McVersionJson;
  // Track which version ID to use for the client.jar path
  // For Fabric, the client.jar is always from the vanilla version, not the fabric version
  let vanillaVersionId = inst.minecraftVersion;
  // Track the actual version id that was launched (for logging)
  let launchedVersionId = inst.minecraftVersion;

  if (inst.loaderType === "vanilla") {
    await logAppend("launcher", "info", `[VanillaInstaller] Installing Minecraft ${inst.minecraftVersion}`, instanceId);
    merged = await installVanillaSide(inst.minecraftVersion, os, nativesRel, async (m) => {
      await logAppend("launcher", "info", m, instanceId);
    });
    vanillaVersionId = inst.minecraftVersion;
    launchedVersionId = inst.minecraftVersion;

  } else if (inst.loaderType === "fabric") {
    await logAppend(
      "launcher",
      "info",
      `[FabricInstaller] Installing Fabric ${inst.loaderVersion || "latest"} for Minecraft ${inst.minecraftVersion}`,
      instanceId
    );

    // Install vanilla side first (downloads client.jar, assets, native libraries)
    await logAppend("launcher", "info", `[VanillaInstaller] Installing vanilla side for ${inst.minecraftVersion}`, instanceId);
    await installVanillaSide(inst.minecraftVersion, os, nativesRel, async (m) => {
      await logAppend("launcher", "info", m, instanceId);
    });

    // Install Fabric (validates, downloads profile, resolves inheritance)
    const { fabricVersionId, resolved } = await installFabric(
      inst.minecraftVersion,
      inst.loaderVersion || undefined,
      async (m) => {
        await logAppend("launcher", "info", m, instanceId);
      }
    );

    // Convert ResolvedMinecraftVersion to McVersionJson shape
    merged = {
      id: resolved.id,
      type: resolved.type,
      mainClass: resolved.mainClass ?? "",
      minecraftArguments: resolved.minecraftArguments,
      arguments: resolved.arguments as McVersionJson["arguments"],
      libraries: (resolved.libraries ?? []) as LibraryEntry[],
      assetIndex: resolved.assetIndex,
      assets: resolved.assets,
      downloads: resolved.downloads,
      javaVersion: resolved.javaVersion,
      logging: resolved.logging,
    };

    vanillaVersionId = inst.minecraftVersion;
    launchedVersionId = fabricVersionId;
    await logAppend("launcher", "info", `[FabricInstaller] Using version ID: ${fabricVersionId}`, instanceId);

  } else if (inst.loaderType === "forge") {
    const java = inst.javaPath || (await settingGet("javaPath")) || "java";
    await installVanillaSide(inst.minecraftVersion, os, nativesRel, async () => undefined);
    const forgeMerged = await installForgeSide(java, root, inst.minecraftVersion, inst.loaderVersion);
    merged = await mergeInheritedVersionJson(forgeMerged);
    vanillaVersionId = inst.minecraftVersion;
    launchedVersionId = merged.id;

  } else if (inst.loaderType === "neoforge") {
    const java = inst.javaPath || (await settingGet("javaPath")) || "java";
    await installVanillaSide(inst.minecraftVersion, os, nativesRel, async () => undefined);
    const neoforgeMerged = await installNeoForgeSide(java, root, inst.loaderVersion);
    merged = await mergeInheritedVersionJson(neoforgeMerged);
    vanillaVersionId = inst.minecraftVersion;
    launchedVersionId = merged.id;

  } else {
    throw new Error("Unknown loader");
  }

  // ─── Build classpath ────────────────────────────────────────────────────────
  const cpSep = os === "windows" ? ";" : ":";
  const cpParts: string[] = [];
  const seen = new Set<string>();

  // Add all merged libraries (Fabric + Vanilla combined, deduped)
  for (const lib of merged.libraries ?? []) {
    const a = libraryArtifactRef(lib as LibraryEntry, os);
    if (!a) continue;
    const absPath = abs(root, `shared/libraries/${a.relPath}`);
    if (seen.has(absPath)) continue;
    seen.add(absPath);
    cpParts.push(absPath);
  }

  // Add vanilla client.jar (always from the vanilla version, not Fabric)
  const clientJar = abs(root, `shared/versions/${vanillaVersionId}/${vanillaVersionId}.jar`);
  if (!seen.has(clientJar)) {
    seen.add(clientJar);
    cpParts.push(clientJar);
  }

  const classpath = cpParts.join(cpSep);

  await logAppend(
    "launcher",
    "info",
    `[LaunchCommand] Classpath has ${cpParts.length} entries`,
    instanceId
  );

  // ─── Build session and replacements ─────────────────────────────────────────
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
    version_name: launchedVersionId,
    game_directory: abs(root, inst.instancePath),
    assets_root: abs(root, "shared/assets"),
    assets_index_name: merged.assetIndex?.id ?? "legacy",
    launcher_name: "MettaLauncher",
    launcher_version: "0.1.0",
    classpath,
    library_directory: abs(root, "shared/libraries"),
    natives_directory: abs(root, nativesRel),
    primary_jar: clientJar,
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

  const javaPath = inst.javaPath || (await settingGet("javaPath")) || "java";

  await logAppend(
    "launcher",
    "info",
    `[LaunchCommand] Building launch command for ${launchedVersionId} with mainClass: ${merged.mainClass}`,
    instanceId
  );

  const argv = buildLaunchCommand(
    merged,
    os,
    rep,
    extraJvm,
    extraGame,
    Number(inst.minRamMb),
    Number(inst.maxRamMb),
  );

  await logAppend("launcher", "info", `[LaunchCommand] Starting Java: ${javaPath}`, instanceId);
  await logAppend(
    "launcher",
    "info",
    `[LaunchCommand] Args[0..4]: ${argv.slice(0, 4).join(" ")}`,
    instanceId
  );

  await spawnJavaGame({
    javaPath,
    cwd: rep.game_directory,
    args: argv,
    env: [["METTA_LAUNCHER", "1"]],
  });
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
