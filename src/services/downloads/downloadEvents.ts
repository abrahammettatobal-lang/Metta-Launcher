import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface DownloadProgress {
  id: string;
  url: string;
  destPath: string;
  received: number;
  total: number | null;
  state: string;
  error: string | null;
}

export function subscribeDownloadProgress(
  cb: (p: DownloadProgress) => void,
): Promise<UnlistenFn> {
  return listen<DownloadProgress>("download://progress", (ev) => cb(ev.payload));
}

export interface GameLogLine {
  stream: string;
  line: string;
}

export function subscribeGameLog(cb: (l: GameLogLine) => void): Promise<UnlistenFn> {
  return listen<GameLogLine>("game-log", (ev) => cb(ev.payload));
}

export interface GameExit {
  code: number | null;
  success: boolean;
}

export function subscribeGameExit(cb: (e: GameExit) => void): Promise<UnlistenFn> {
  return listen<GameExit>("game-exit", (ev) => cb(ev.payload));
}
