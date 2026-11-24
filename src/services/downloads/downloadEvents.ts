import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** Dispose a native listener even if registration finishes after unmount. */
export function onNativeEvent(registration: Promise<UnlistenFn>): () => void {
  let disposed = false;
  let stop: UnlistenFn | undefined;
  void registration.then(fn => {
    if (disposed) fn(); else stop = fn;
  }).catch(error => console.warn("[Metta] Registro de evento", error));
  return () => { disposed = true; stop?.(); };
}

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
  instanceId: string;
  stream: "stdout" | "stderr";
  line: string;
  timestamp: string;
}

export function subscribeGameLog(cb: (l: GameLogLine) => void): Promise<UnlistenFn> {
  return listen<GameLogLine>("game-log", (ev) => cb(ev.payload));
}

export interface GameExit {
  instanceId: string;
  code: number | null;
  success: boolean;
  logTail?: string[];
  stderrTail?: string[];
}

export function subscribeGameExit(cb: (e: GameExit) => void): Promise<UnlistenFn> {
  return listen<GameExit>("game-exit", (ev) => cb(ev.payload));
}
