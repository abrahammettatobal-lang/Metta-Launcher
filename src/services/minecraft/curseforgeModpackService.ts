import {
  curseforgeFindCompatibleFile,
  curseforgeGetDownloadInfo,
  downloadFileCmd,
  type CurseForgeDownloadInfo,
  extractArchiveCmd,
  instanceDelete,
  instanceSave,
  modpackCopyOverrides,
  modpackDetectRoot,
  modpackReadManifest,
  mkdirAllCmd,
  removeDirRecursive,
  settingGet,
  appPaths,
  type InstanceRow,
  type LoaderType,
} from "../bridge";
import { fullPath } from "../../utils/full-path";
import { prepareNewInstancePaths } from "../launchInstance";
import { validateFabricLoaderForMc } from "./fabricMeta";
import { normalizeModpackModFileName } from "./modpackModFiles";
import {
  importBundledModpackFromPath,
  importBundledModpackFromZip,
} from "./bundledModpackService";
import { modpackInspectZip } from "../bridge";

export interface CurseForgeModpackManifest {
  manifestType: string;
  manifestVersion: number;
  name: string;
  version: string;
  author?: string;
  minecraft: {
    version: string;
    recommendedRam?: number;
    modLoaders?: Array<{ id: string; primary?: boolean }>;
  };
  files: Array<{
    projectID: number;
    fileID: number;
    required?: boolean;
  }>;
}

export interface ModpackImportProgress {
  phase: "detect" | "prepare" | "mods" | "overrides" | "done" | "error";
  message: string;
  current: number;
  total: number;
}

export interface ParsedModpackMeta {
  name: string;
  version: string;
  minecraftVersion: string;
  loaderType: LoaderType;
  loaderVersion: string;
  minRamMb: number;
  maxRamMb: number;
  fileCount: number;
}

function parseLoader(modLoaderId: string): { type: LoaderType; version: string } {
  const lower = modLoaderId.toLowerCase();
  if (lower.startsWith("fabric-") || lower.startsWith("fabric-loader-")) {
    const prefix = lower.startsWith("fabric-loader-") ? "fabric-loader-" : "fabric-";
    return { type: "fabric", version: modLoaderId.slice(prefix.length) };
  }
  if (lower.startsWith("neoforge-")) {
    return { type: "neoforge", version: modLoaderId.slice("neoforge-".length) };
  }
  if (lower.startsWith("forge-")) {
    return { type: "forge", version: modLoaderId.slice("forge-".length) };
  }
  return { type: "vanilla", version: "" };
}

const CURSEFORGE_INCOMPATIBLE_RELATION = 5;

function shouldInstallCurseForgeDependency(relationType: number): boolean {
  return relationType === 1 || relationType === 3 || relationType === 6;
}

function incompatibilityKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function recordIncompatibilities(
  ownerProjectId: number,
  dependencies: CurseForgeDownloadInfo["dependencies"],
  incompatiblePairs: Set<string>,
) {
  for (const dep of dependencies) {
    if (dep.relationType !== CURSEFORGE_INCOMPATIBLE_RELATION) continue;
    incompatiblePairs.add(incompatibilityKey(ownerProjectId, dep.projectId));
  }
}

function isIncompatibleWithAny(
  projectId: number,
  others: Iterable<number>,
  incompatiblePairs: Set<string>,
): boolean {
  for (const other of others) {
    if (other === projectId) continue;
    if (incompatiblePairs.has(incompatibilityKey(projectId, other))) return true;
  }
  return false;
}

function queueCurseForgeDependencies(
  info: CurseForgeDownloadInfo,
  manifestProjectIds: Set<number>,
  installedProjects: Set<number>,
  incompatiblePairs: Set<string>,
  depQueue: number[],
  seenDeps: Set<number>,
) {
  recordIncompatibilities(info.projectId, info.dependencies, incompatiblePairs);
  for (const dep of info.dependencies) {
    if (!shouldInstallCurseForgeDependency(dep.relationType)) continue;
    if (manifestProjectIds.has(dep.projectId) || installedProjects.has(dep.projectId)) {
      continue;
    }
    if (
      isIncompatibleWithAny(dep.projectId, manifestProjectIds, incompatiblePairs) ||
      isIncompatibleWithAny(dep.projectId, installedProjects, incompatiblePairs)
    ) {
      continue;
    }
    if (seenDeps.has(dep.projectId)) continue;
    seenDeps.add(dep.projectId);
    depQueue.push(dep.projectId);
  }
}

export async function readModpackManifest(
  packRoot: string,
): Promise<CurseForgeModpackManifest> {
  const raw = await modpackReadManifest(packRoot);
  const parsed = JSON.parse(raw) as CurseForgeModpackManifest;
  if (parsed.manifestType !== "minecraftModpack") {
    throw new Error("El manifest.json no es un modpack de Minecraft reconocido.");
  }
  return parsed;
}

export function parseModpackMeta(manifest: CurseForgeModpackManifest): ParsedModpackMeta {
  const primary =
    manifest.minecraft.modLoaders?.find((l) => l.primary) ??
    manifest.minecraft.modLoaders?.[0];
  const loader = primary
    ? parseLoader(primary.id)
    : { type: "vanilla" as const, version: "" };
  const recommended = manifest.minecraft.recommendedRam ?? 4096;
  const maxRamMb = Math.max(1024, Math.ceil(recommended / 512) * 512);
  const minRamMb = Math.max(512, Math.min(Math.floor(maxRamMb * 0.25), maxRamMb));

  return {
    name: manifest.name,
    version: manifest.version,
    minecraftVersion: manifest.minecraft.version,
    loaderType: loader.type,
    loaderVersion: loader.version,
    minRamMb,
    maxRamMb,
    fileCount: manifest.files?.length ?? 0,
  };
}


export async function detectModpack(inputPath: string) {
  return modpackDetectRoot(inputPath);
}

export async function detectModpackRoot(inputPath: string): Promise<string> {
  const detected = await modpackDetectRoot(inputPath);
  return detected.packRoot;
}

export async function isCurseForgeModpack(inputPath: string): Promise<boolean> {
  try {
    const detected = await modpackDetectRoot(inputPath);
    if (detected.kind !== "curseforge") return false;
    const manifest = await readModpackManifest(detected.packRoot);
    return manifest.manifestType === "minecraftModpack";
  } catch {
    return false;
  }
}

export async function isImportableModpack(inputPath: string): Promise<boolean> {
  try {
    const detected = await modpackDetectRoot(inputPath);
    return detected.kind === "curseforge" || detected.kind === "bundled";
  } catch {
    return false;
  }
}

async function importDetectedModpackFromPath(
  inputPath: string,
  instanceName: string,
  onProgress?: (p: ModpackImportProgress) => void,
): Promise<InstanceRow> {
  const detected = await modpackDetectRoot(inputPath);
  if (detected.kind === "bundled") {
    return importBundledModpackFromPath(inputPath, instanceName, onProgress);
  }
  return installCurseForgeModpack(detected.packRoot, instanceName, onProgress);
}

export async function installCurseForgeModpack(
  packRoot: string,
  instanceName: string,
  onProgress?: (p: ModpackImportProgress) => void,
): Promise<InstanceRow> {
  const report = (p: ModpackImportProgress) => onProgress?.(p);

  report({
    phase: "detect",
    message: "Leyendo manifest…",
    current: 0,
    total: 1,
  });

  const manifest = await readModpackManifest(packRoot);
  const meta = parseModpackMeta(manifest);

  const apiKey = (await settingGet("curseforgeApiKey"))?.trim() ?? "";
  if (!apiKey) {
    throw new Error(
      "Configura tu CurseForge API Key en Ajustes → Integraciones para descargar mods del modpack.",
    );
  }

  if (meta.loaderType === "fabric" && meta.loaderVersion) {
    await validateFabricLoaderForMc(meta.minecraftVersion, meta.loaderVersion);
  }

  report({
    phase: "prepare",
    message: "Creando instancia…",
    current: 0,
    total: 1,
  });

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  let row: InstanceRow = {
    id,
    name: instanceName.trim() || `${meta.name} ${meta.version}`,
    minecraftVersion: meta.minecraftVersion,
    loaderType: meta.loaderType,
    loaderVersion: meta.loaderVersion,
    instancePath: "",
    icon: "default",
    minRamMb: meta.minRamMb,
    maxRamMb: meta.maxRamMb,
    javaPath: null,
    jvmArgs: "",
    gameArgs: "",
    gameResolution: null,
    customClientJar: null,
    lastPlayedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  const root = (await appPaths()).launcherRoot;
  row = await prepareNewInstancePaths(root, row);
  await mkdirAllCmd(`${row.instancePath}/mods`);
  await instanceSave(row);

  const files = manifest.files ?? [];
  const manifestProjectIds = new Set(files.map((f) => f.projectID));
  const installedProjects = new Set<number>();
  const incompatiblePairs = new Set<string>();
  const depQueue: number[] = [];
  const seenDeps = new Set<number>();
  const skippedDeps = new Set<number>();
  let completed = 0;
  const concurrency = 2;
  let nextIndex = 0;

  async function downloadModFile(info: CurseForgeDownloadInfo) {
    const safeName = normalizeModpackModFileName(info.fileName);
    const dest = `${row.instancePath}/mods/${safeName}`;
    await downloadFileCmd(
      `modpack-${id}-${info.fileId}`,
      info.downloadUrl,
      dest,
      null,
      apiKey,
    );
    installedProjects.add(info.projectId);
    queueCurseForgeDependencies(
      info,
      manifestProjectIds,
      installedProjects,
      incompatiblePairs,
      depQueue,
      seenDeps,
    );
    completed += 1;
    report({
      phase: "mods",
      message:
        depQueue.length > 0
          ? `Descargando mods (${completed}, +${depQueue.length} deps pendientes)…`
          : `Descargando mods (${completed})…`,
      current: completed,
      total: completed + depQueue.length,
    });
  }

  async function cleanupFailedImport() {
    try {
      await instanceDelete(row.id);
    } catch {
      /* ignore */
    }
    try {
      await removeDirRecursive(row.instancePath);
    } catch {
      /* ignore */
    }
  }

  try {
    async function worker() {
      while (nextIndex < files.length) {
        const idx = nextIndex++;
        const file = files[idx];
        if (installedProjects.has(file.projectID)) continue;
        const info = await curseforgeGetDownloadInfo(
          file.projectID,
          file.fileID,
          apiKey,
        );
        await downloadModFile(info);
      }
    }

    if (files.length > 0) {
      await Promise.all(
        Array.from({ length: Math.min(concurrency, files.length) }, () => worker()),
      );
    }

    while (depQueue.length > 0) {
      const projectID = depQueue.shift()!;
      if (installedProjects.has(projectID) || skippedDeps.has(projectID)) continue;
      if (
        isIncompatibleWithAny(projectID, manifestProjectIds, incompatiblePairs) ||
        isIncompatibleWithAny(projectID, installedProjects, incompatiblePairs)
      ) {
        skippedDeps.add(projectID);
        report({
          phase: "mods",
          message: `Dependencia omitida (incompatible con mods del modpack): proyecto ${projectID}`,
          current: completed,
          total: completed + depQueue.length,
        });
        continue;
      }
      try {
        const info = await curseforgeFindCompatibleFile(
          projectID,
          meta.minecraftVersion,
          meta.loaderType,
          apiKey,
        );
        await downloadModFile(info);
      } catch (e) {
        skippedDeps.add(projectID);
        const msg = e instanceof Error ? e.message : String(e);
        report({
          phase: "mods",
          message: `Dependencia omitida: ${msg}`,
          current: completed,
          total: completed + depQueue.length,
        });
      }
    }

    report({
      phase: "overrides",
      message: "Copiando configs del modpack…",
      current: completed,
      total: completed,
    });
    await modpackCopyOverrides(packRoot, row.instancePath);

    row = { ...row, updatedAt: new Date().toISOString() };
    await instanceSave(row);

    report({
      phase: "done",
      message: "Modpack instalado.",
      current: completed,
      total: completed,
    });

    return row;
  } catch (e) {
    await cleanupFailedImport();
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(msg);
  }
}

export async function importModpackFromPath(
  inputPath: string,
  instanceName: string,
  onProgress?: (p: ModpackImportProgress) => void,
): Promise<InstanceRow> {
  return importDetectedModpackFromPath(inputPath, instanceName, onProgress);
}

export async function importModpackFromZip(
  zipPath: string,
  instanceName: string,
  onProgress?: (p: ModpackImportProgress) => void,
): Promise<InstanceRow> {
  onProgress?.({
    phase: "detect",
    message: "Analizando modpack…",
    current: 0,
    total: 1,
  });

  let inspected;
  try {
    inspected = await modpackInspectZip(zipPath);
  } catch {
    inspected = null;
  }

  if (inspected?.kind === "bundled") {
    return importBundledModpackFromZip(zipPath, instanceName, onProgress);
  }

  onProgress?.({
    phase: "detect",
    message: "Extrayendo modpack CurseForge…",
    current: 0,
    total: 1,
  });

  const tempId = crypto.randomUUID();
  const tempRel = `shared/tmp/modpack-${tempId}`;
  await mkdirAllCmd(tempRel);
  try {
    await extractArchiveCmd(zipPath, tempRel);
    const absTemp = await fullPath(tempRel);
    const detected = await modpackDetectRoot(absTemp);
    if (detected.kind === "bundled") {
      return importBundledModpackFromPath(absTemp, instanceName, onProgress);
    }
    return installCurseForgeModpack(detected.packRoot, instanceName, onProgress);
  } finally {
    try {
      await removeDirRecursive(tempRel);
    } catch {
      /* ignore */
    }
  }
}
