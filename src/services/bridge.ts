import { invoke } from "@tauri-apps/api/core";

export type LoaderType = "vanilla" | "fabric" | "forge" | "neoforge";

export interface AppPaths {
  appDataDir: string;
  dbPath: string;
  defaultLauncherRoot: string;
  launcherRoot: string;
}

export async function appPaths(): Promise<AppPaths> {
  return invoke("app_paths");
}

export async function settingGet(key: string): Promise<string | null> {
  const v = await invoke<string | null>("setting_get", { key });
  return v ?? null;
}

export async function settingSet(key: string, value: string): Promise<void> {
  await invoke("setting_set", { key, value });
}

export async function launcherSetRoot(path: string): Promise<void> {
  await invoke("launcher_set_root", { path });
}

export async function logAppend(
  source: string,
  level: string,
  message: string,
  instanceId?: string,
): Promise<void> {
  await invoke("log_append", { source, level, message, instanceId });
}

export async function logsQuery(
  limit: number,
  level?: string,
  source?: string,
): Promise<
  Array<{
    id: number;
    source: string;
    instanceId: string | null;
    level: string;
    message: string;
    createdAt: string;
  }>
> {
  return invoke("logs_query", { limit, level, source });
}

export async function logsClear(): Promise<void> {
  await invoke("logs_clear");
}

export interface InstanceRow {
  id: string;
  name: string;
  minecraftVersion: string;
  loaderType: LoaderType;
  loaderVersion: string;
  instancePath: string;
  icon: string;
  minRamMb: number;
  maxRamMb: number;
  javaPath: string | null;
  jvmArgs: string;
  gameArgs: string;
  gameResolution: string | null;
  lastPlayedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function instancesList(): Promise<InstanceRow[]> {
  return invoke("instances_list");
}

export async function instanceGet(id: string): Promise<InstanceRow | null> {
  return invoke("instance_get", { id });
}

export async function instanceSave(row: InstanceRow): Promise<void> {
  await invoke("instance_save", { row });
}

export async function instanceDelete(id: string): Promise<void> {
  await invoke("instance_delete", { id });
}

/** Re-scan `instances/` on disk and import folders missing from the database. */
export async function instancesSync(): Promise<number> {
  return invoke("instances_sync");
}

export interface AccountRow {
  id: string;
  kind: string;
  username: string;
  uuid: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function accountsList(): Promise<AccountRow[]> {
  return invoke("accounts_list");
}

export async function accountDelete(id: string): Promise<void> {
  await invoke("account_delete", { id });
}

export async function accountSetActive(id: string): Promise<void> {
  await invoke("account_set_active", { id });
}

export async function accountAddOffline(username: string): Promise<AccountRow> {
  return invoke("account_add_offline", { payload: { username } });
}

export interface DeviceCodeStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export type MicrosoftAuthOutcome =
  | { kind: "pending" }
  | { kind: "success"; accountId: string; username: string; uuid: string }
  | { kind: "error"; message: string };

export async function getLaunchSession(accountId: string): Promise<{
  accessToken: string;
  uuid: string;
  username: string;
  userType: string;
  xuid: string;
}> {
  return invoke("get_launch_session", { accountId });
}

export async function microsoftDeviceStart(): Promise<DeviceCodeStart> {
  return invoke("microsoft_device_start");
}

export async function microsoftDevicePoll(
  deviceCode: string,
): Promise<MicrosoftAuthOutcome> {
  return invoke("microsoft_device_poll", { deviceCode });
}

export async function downloadFileCmd(
  id: string,
  url: string,
  destPath: string,
  sha1?: string | null,
): Promise<void> {
  await invoke("download_file_cmd", {
    id,
    url,
    destPath,
    sha1: sha1 ?? null,
  });
}

export async function readTextFile(path: string): Promise<string> {
  return invoke("read_text_file", { path });
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  await invoke("write_text_file", { path, content });
}

export async function writeBinaryFile(path: string, data: Uint8Array): Promise<void> {
  await invoke("write_binary_file", { path, data: Array.from(data) });
}

export async function pathExists(path: string): Promise<boolean> {
  return invoke("path_exists", { path });
}

/** One IPC round-trip to find which relative paths are missing (not regular files). */
export async function missingPathsCmd(paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  return invoke("missing_paths_cmd", { paths });
}

export async function mkdirAllCmd(path: string): Promise<void> {
  await invoke("mkdir_all_cmd", { path });
}

export async function removeFileCmd(path: string): Promise<void> {
  await invoke("remove_file_cmd", { path });
}

export async function removeDirRecursive(path: string): Promise<void> {
  await invoke("remove_dir_recursive", { path });
}

export interface DirEntryInfo {
  name: string;
  path: string;
  isDir: boolean;
  size: number | null;
}

export async function listDirCmd(path: string): Promise<DirEntryInfo[]> {
  return invoke("list_dir_cmd", { path });
}

export async function dirDiskUsage(path: string): Promise<number> {
  return invoke("dir_disk_usage", { path });
}

export async function sha1FileCmd(path: string): Promise<string> {
  return invoke("sha1_file_cmd", { path });
}

export async function extractZipCmd(zipPath: string, destDir: string): Promise<void> {
  await invoke("extract_archive_cmd", { archivePath: zipPath, destDir });
}

export async function extractArchiveCmd(archivePath: string, destDir: string): Promise<void> {
  await invoke("extract_archive_cmd", { archivePath, destDir });
}

export interface HostPlatform {
  os: string;
  arch: string;
}

export async function hostPlatform(): Promise<HostPlatform> {
  return invoke("host_platform");
}

export async function openDevtools(): Promise<void> {
  await invoke("open_devtools");
}

export async function runJavaJar(payload: {
  javaPath: string;
  jarPath: string;
  workDir: string;
  args: string[];
}): Promise<string> {
  return invoke("run_java_jar", { req: payload });
}

export async function forgeListVersions(mcVersion: string): Promise<string[]> {
  return invoke("forge_list_versions", { mcVersion });
}

export async function neoforgeListVersions(mcVersion?: string): Promise<string[]> {
  return invoke("neoforge_list_versions", { mcVersion: mcVersion ?? null });
}

export async function spawnJavaGame(payload: {
  javaPath: string;
  cwd: string;
  args: string[];
  env: [string, string][];
  instanceId?: string;
}): Promise<void> {
  await invoke("spawn_java_game", { req: payload });
}

export async function stopJavaGame(): Promise<void> {
  await invoke("stop_java_game");
}

export interface JavaCandidate {
  path: string;
  version: string | null;
}

export async function javaDetect(): Promise<JavaCandidate[]> {
  return invoke("java_detect");
}

export async function applyMicrosoftSkin(payload: {
  accountId: string;
  skinUrl: string;
  variant: "classic" | "slim";
}): Promise<void> {
  return invoke("apply_microsoft_skin", payload);
}

export async function resetMicrosoftSkin(accountId: string): Promise<void> {
  return invoke("reset_microsoft_skin", { accountId });
}

export interface ResolvedSkin {
  uuid: string;
  name: string;
  skinUrl: string;
  model: "classic" | "slim";
  skinBytes: number[];
}

export async function resolveMinecraftSkin(
  username: string,
): Promise<ResolvedSkin> {
  return invoke("resolve_minecraft_skin", { username });
}

export async function accountLogout(accountId: string): Promise<void> {
  await invoke("account_logout", { accountId });
}

export async function instanceTouchLastPlayed(id: string): Promise<void> {
  await invoke("instance_touch_last_played", { id });
}

export interface LaunchHistoryRow {
  id: number;
  instanceId: string;
  instanceName: string | null;
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  success: boolean;
}

export async function launchHistoryList(limit = 20): Promise<LaunchHistoryRow[]> {
  return invoke("launch_history_list", { limit });
}

export interface SystemDiagnostic {
  os: string;
  arch: string;
  javaCandidates: JavaCandidate[];
  launcherRoot: string;
  appDataDir: string;
  tauriVersion: string;
  launcherVersion: string;
}

export async function systemDiagnose(): Promise<SystemDiagnostic> {
  return invoke("system_diagnose");
}

export interface NetworkEndpoint {
  name: string;
  url: string;
  ok: boolean;
  latencyMs: number | null;
  error: string | null;
}

export async function networkCheck(): Promise<NetworkEndpoint[]> {
  return invoke("network_check");
}

export interface CacheClearResult {
  removedFiles: number;
  freedBytes: number;
  paths: string[];
}

export async function cacheClear(includeOldLogs: boolean): Promise<CacheClearResult> {
  return invoke("cache_clear", { includeOldLogs });
}

export interface RepairCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface RepairReport {
  checks: RepairCheck[];
  fixed: number;
  errors: string[];
}

export async function instanceRepair(
  instancePath: string,
  minecraftVersion: string,
): Promise<RepairReport> {
  return invoke("instance_repair", { instancePath, minecraftVersion });
}

export interface BackupInfo {
  path: string;
  sizeBytes: number;
  createdAt: string;
}

export async function instanceBackup(
  instancePath: string,
  name: string,
): Promise<BackupInfo> {
  return invoke("instance_backup", { instancePath, name });
}

export interface LauncherUpdateInfo {
  currentVersion: string;
  latestVersion: string | null;
  releaseUrl: string | null;
  changelog: string | null;
  updateAvailable: boolean;
}

export async function launcherCheckUpdate(): Promise<LauncherUpdateInfo> {
  return invoke("launcher_check_update");
}

export async function recommendedJava(minecraftVersion: string): Promise<number> {
  return invoke("recommended_java", { minecraftVersion });
}

export interface ModMetadata {
  modId: string | null;
  name: string | null;
  version: string | null;
  loader: string | null;
}

export async function modParseMetadata(jarPath: string): Promise<ModMetadata> {
  return invoke("mod_parse_metadata", { jarPath });
}

export interface BackupListItem {
  path: string;
  name: string;
  sizeBytes: number;
  modifiedAt: string;
}

export async function backupsList(): Promise<BackupListItem[]> {
  return invoke("backups_list");
}

export async function instanceRestoreBackup(
  zipPath: string,
  instancePath: string,
): Promise<void> {
  await invoke("instance_restore_backup", { zipPath, instancePath });
}

export async function instanceImportZip(
  zipPath: string,
  folderName: string,
): Promise<string> {
  return invoke("instance_import_zip", { zipPath, folderName });
}
