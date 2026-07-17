import {
  appPaths,
  extractArchiveCmd,
  instanceSave,
  modpackCopyTree,
  modpackCountModJars,
  modpackDetectRoot,
  modpackInspectZip,
  modpackPostprocessInstance,
  removeDirRecursive,
  type InstanceRow,
  type LoaderType,
  type ModpackDetectResult,
} from "../bridge";
import { prepareNewInstancePaths } from "../launchInstance";
import type { ModpackImportProgress } from "./curseforgeModpackService";

function defaultRamForMc(mc: string): { minRamMb: number; maxRamMb: number } {
  const minor = Number(mc.split(".")[1] ?? "20");
  if (minor <= 12) {
    return { minRamMb: 1024, maxRamMb: 4096 };
  }
  if (minor <= 16) {
    return { minRamMb: 2048, maxRamMb: 6144 };
  }
  return { minRamMb: 2048, maxRamMb: 8192 };
}

export function parseBundledDetectMeta(detect: ModpackDetectResult) {
  const minecraftVersion = detect.minecraftVersion ?? "1.20.1";
  const loaderType = (detect.loaderType ?? "forge") as LoaderType;
  const { minRamMb, maxRamMb } = defaultRamForMc(minecraftVersion);
  return {
    minecraftVersion,
    loaderType,
    loaderVersion: detect.loaderVersion ?? "",
    minRamMb,
    maxRamMb,
    modCount: detect.modCount,
    suggestedName: detect.suggestedName,
  };
}

function buildBundledInstanceRow(
  detect: ModpackDetectResult,
  instanceName: string,
): InstanceRow {
  const meta = parseBundledDetectMeta(detect);
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: instanceName.trim() || meta.suggestedName || "Modpack",
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
    lastPlayedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

async function finalizeBundledImport(
  row: InstanceRow,
  expectedModCount: number,
  onProgress?: (p: ModpackImportProgress) => void,
): Promise<InstanceRow> {
  const report = (p: ModpackImportProgress) => onProgress?.(p);
  const installedMods = await modpackCountModJars(row.instancePath);
  if (installedMods === 0) {
    throw new Error(
      "No se encontraron mods en la instancia tras extraer el modpack. " +
        "Comprueba que el ZIP incluya una carpeta mods/ con archivos .jar.",
    );
  }

  row = { ...row, updatedAt: new Date().toISOString() };
  await instanceSave(row);
  report({
    phase: "done",
    message:
      expectedModCount > 0
        ? `Modpack instalado (${installedMods} mods).`
        : `Modpack instalado (${installedMods} mods).`,
    current: 1,
    total: 1,
  });
  return row;
}

export async function installBundledModpack(
  packRoot: string,
  detect: ModpackDetectResult,
  instanceName: string,
  onProgress?: (p: ModpackImportProgress) => void,
): Promise<InstanceRow> {
  const report = (p: ModpackImportProgress) => onProgress?.(p);
  const meta = parseBundledDetectMeta(detect);

  report({
    phase: "prepare",
    message: `Preparando instancia (${meta.minecraftVersion}, ${meta.loaderType})…`,
    current: 0,
    total: 1,
  });

  let row = buildBundledInstanceRow(detect, instanceName);
  const root = (await appPaths()).launcherRoot;
  row = await prepareNewInstancePaths(root, row);

  async function cleanupFailedImport() {
    try {
      await removeDirRecursive(row.instancePath);
    } catch {
      /* ignore */
    }
  }

  try {
    report({
      phase: "mods",
      message: `Copiando archivos del modpack (${meta.modCount || "?"} mods)…`,
      current: 0,
      total: 1,
    });
    await modpackCopyTree(packRoot, row.instancePath);
    return finalizeBundledImport(row, meta.modCount, onProgress);
  } catch (e) {
    await cleanupFailedImport();
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(msg);
  }
}

export async function importBundledModpackFromPath(
  inputPath: string,
  instanceName: string,
  onProgress?: (p: ModpackImportProgress) => void,
): Promise<InstanceRow> {
  const detected = await modpackDetectRoot(inputPath);
  if (detected.kind !== "bundled") {
    throw new Error("La carpeta no es un modpack preempaquetado reconocido.");
  }
  return installBundledModpack(detected.packRoot, detected, instanceName, onProgress);
}

export async function importBundledModpackFromZip(
  zipPath: string,
  instanceName: string,
  onProgress?: (p: ModpackImportProgress) => void,
): Promise<InstanceRow> {
  const report = (p: ModpackImportProgress) => onProgress?.(p);

  report({
    phase: "detect",
    message: "Analizando modpack…",
    current: 0,
    total: 1,
  });

  const detected = await modpackInspectZip(zipPath);
  if (detected.kind !== "bundled") {
    throw new Error("El ZIP no es un modpack preempaquetado reconocido.");
  }

  const meta = parseBundledDetectMeta(detected);
  report({
    phase: "prepare",
    message: `Preparando instancia (${meta.minecraftVersion}, ${meta.loaderType})…`,
    current: 0,
    total: 1,
  });

  let row = buildBundledInstanceRow(detected, instanceName);
  const root = (await appPaths()).launcherRoot;
  row = await prepareNewInstancePaths(root, row);

  async function cleanupFailedImport() {
    try {
      await removeDirRecursive(row.instancePath);
    } catch {
      /* ignore */
    }
  }

  try {
    report({
      phase: "mods",
      message: `Extrayendo modpack (${meta.modCount || "?"} mods)…`,
      current: 0,
      total: 1,
    });
    await extractArchiveCmd(zipPath, row.instancePath);
    await modpackPostprocessInstance(row.instancePath);
    return finalizeBundledImport(row, meta.modCount, onProgress);
  } catch (e) {
    await cleanupFailedImport();
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(msg);
  }
}
