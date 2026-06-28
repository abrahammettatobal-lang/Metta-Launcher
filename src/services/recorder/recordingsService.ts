import { invoke } from "@tauri-apps/api/core";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";

export interface RecordingItem {
  id: string;
  name: string;
  path: string;
  thumbPath: string | null;
  createdAt: string;
  durationSecs: number | null;
  width: number | null;
  height: number | null;
  sizeBytes: number;
}

export async function recordingsList(): Promise<RecordingItem[]> {
  return invoke("recorder_list_recordings");
}

export async function recordingDelete(path: string): Promise<void> {
  await invoke("recorder_delete_recording", { path });
}

export async function recordingRename(
  path: string,
  newName: string,
): Promise<string> {
  return invoke("recorder_rename_recording", { path, newName });
}

export async function recordingOpen(path: string): Promise<void> {
  await openPath(path);
}

export async function recordingReveal(path: string): Promise<void> {
  await revealItemInDir(path);
}

export async function recordingSharePath(path: string): Promise<void> {
  await navigator.clipboard.writeText(path);
}
