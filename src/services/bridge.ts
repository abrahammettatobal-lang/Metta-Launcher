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
  await invoke("extract_zip_cmd", { zipPath, destDir });
}

export async function runJavaJar(payload: {
  javaPath: string;
  jarPath: string;
  workDir: string;
  args: string[];
}): Promise<string> {
  return invoke("run_java_jar", { req: payload });
}

export async function spawnJavaGame(payload: {
  javaPath: string;
  cwd: string;
  args: string[];
  env: [string, string][];
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
