import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface RecorderSettings {
  outputDir: string;
  fps: number;
  resolution: string;
  bitrateMbps: number;
  qualityPreset: string;
  format: string;
  codec: string;
  audioMode: string;
  micDevice: string | null;
  gameAudioDevice: string | null;
  captureMode: string;
  monitorIndex: number;
  recordCursor: boolean;
  variableFrameRate: boolean;
  encoderPreference: string;
  overlayFps: boolean;
  overlayDuration: boolean;
  overlayLogo: boolean;
  overlayDate: boolean;
  overlayTime: boolean;
  autoRecordOnLaunch: boolean;
  autoStopOnExit: boolean;
  countdownSeconds: number;
  splitSizeGb: number | null;
  maxFileSizeGb: number | null;
  hotkeyToggle: string;
  hotkeyPause: string;
  hotkeyScreenshot: string;
}

export interface RecorderStatus {
  phase: string;
  elapsedSecs: number;
  fileSizeBytes: number;
  filePath: string;
  fps: number;
  targetFps: number;
  bitrateKbps: number;
  encoder: string;
  resolution: string;
  droppedFrames: number;
  cpuUsagePct: number;
  gpuUsagePct: number;
  diskFreeBytes: number;
  micLevel: number;
  captureMode: string;
  windowTitle: string | null;
  estimatedFinalSizeBytes: number;
}

export interface EncoderInfo {
  id: string;
  label: string;
  kind: string;
  available: boolean;
}

export interface AudioDeviceInfo {
  id: string;
  name: string;
  kind: string;
}

export interface MonitorInfo {
  index: number;
  name: string;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  primary: boolean;
}

export interface MinecraftWindowInfo {
  found: boolean;
  hwnd: number | null;
  title: string | null;
  width: number;
  height: number;
  pid: number | null;
}

export interface GameStatus {
  running: boolean;
  pid: number | null;
}

export interface HardwareProbe {
  ffmpegAvailable: boolean;
  gameAudioAvailable: boolean;
  encoders: EncoderInfo[];
  audioDevices: AudioDeviceInfo[];
  error: string | null;
}

export async function recorderFfmpegStatus(): Promise<{
  installed: boolean;
  bundled: boolean;
  audioCapable: boolean;
  path: string | null;
}> {
  return invoke("recorder_ffmpeg_status");
}

export async function recorderInstallFfmpeg(): Promise<{ path: string }> {
  return invoke("recorder_install_ffmpeg");
}

export function subscribeFfmpegInstall(
  cb: (payload: {
    phase: string;
    message: string;
    progress: number;
    total: number | null;
  }) => void,
): Promise<UnlistenFn> {
  return listen("recorder://ffmpeg-install", (e) => cb(e.payload as never));
}

export async function recorderProbeHardware(): Promise<HardwareProbe> {
  return invoke("recorder_probe_hardware");
}

export async function recorderGetSettings(): Promise<RecorderSettings> {
  return invoke("recorder_get_settings");
}

export async function recorderSaveSettings(
  settings: RecorderSettings,
): Promise<void> {
  await invoke("recorder_save_settings", { settings });
}

export async function recorderGetStatus(): Promise<RecorderStatus> {
  return invoke("recorder_get_status");
}

export async function recorderDetectEncoders(): Promise<EncoderInfo[]> {
  return invoke("recorder_detect_encoders");
}

export async function recorderListAudioDevices(): Promise<AudioDeviceInfo[]> {
  return invoke("recorder_list_audio_devices");
}

export async function recorderListMonitors(): Promise<MonitorInfo[]> {
  return invoke("recorder_list_monitors");
}

export async function recorderFindMinecraftWindow(): Promise<MinecraftWindowInfo> {
  return invoke("recorder_find_minecraft_window");
}

export async function recorderGetGameStatus(): Promise<GameStatus> {
  return invoke("recorder_get_game_status");
}

export async function recorderStart(
  settings?: RecorderSettings,
): Promise<void> {
  await invoke("recorder_start", { settings: settings ?? null });
}

export async function recorderStop(): Promise<void> {
  await invoke("recorder_stop");
}

export async function recorderPause(): Promise<void> {
  await invoke("recorder_pause");
}

export async function recorderResume(): Promise<void> {
  await invoke("recorder_resume");
}

export async function recorderScreenshot(
  settings?: RecorderSettings,
): Promise<string> {
  return invoke("recorder_screenshot", { settings: settings ?? null });
}

export function subscribeRecorderStatus(
  cb: (status: RecorderStatus) => void,
): Promise<UnlistenFn> {
  return listen<RecorderStatus>("recorder://status", (e) => cb(e.payload));
}

export function subscribeRecorderStarted(
  cb: (payload: { filePath: string; encoder: string; captureMode: string }) => void,
): Promise<UnlistenFn> {
  return listen("recorder://started", (e) => cb(e.payload as never));
}

export function subscribeRecorderStopped(
  cb: (payload: {
    filePath: string;
    durationSecs: number;
    fileSizeBytes: number;
    success: boolean;
  }) => void,
): Promise<UnlistenFn> {
  return listen("recorder://stopped", (e) => cb(e.payload as never));
}

export function subscribeRecorderError(
  cb: (payload: { code: string; message: string }) => void,
): Promise<UnlistenFn> {
  return listen("recorder://error", (e) => cb(e.payload as never));
}

export function subscribeRecorderCountdown(
  cb: (payload: { secondsLeft: number }) => void,
): Promise<UnlistenFn> {
  return listen("recorder://countdown", (e) => cb(e.payload as never));
}

export function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export type RecorderPresetId = "balanced" | "performance" | "quality" | "stream";

export const RECORDER_PRESETS: Record<
  RecorderPresetId,
  {
    label: string;
    hint: string;
    patch: Partial<RecorderSettings>;
  }
> = {
  balanced: {
    label: "Equilibrado",
    hint: "30 FPS · 20 Mbps",
    patch: {
      fps: 30,
      bitrateMbps: 20,
      qualityPreset: "high",
      resolution: "original",
      encoderPreference: "auto",
      format: "mp4",
      codec: "h264",
    },
  },
  performance: {
    label: "Rendimiento",
    hint: "Menos carga de PC",
    patch: {
      fps: 30,
      bitrateMbps: 10,
      qualityPreset: "medium",
      resolution: "1920x1080",
      encoderPreference: "auto",
      format: "mp4",
      codec: "h264",
    },
  },
  quality: {
    label: "Alta calidad",
    hint: "60 FPS · 40 Mbps",
    patch: {
      fps: 60,
      bitrateMbps: 40,
      qualityPreset: "high",
      resolution: "original",
      encoderPreference: "auto",
      format: "mkv",
      codec: "h264",
    },
  },
  stream: {
    label: "Clips / Shorts",
    hint: "1080p ligero",
    patch: {
      fps: 60,
      bitrateMbps: 12,
      qualityPreset: "medium",
      resolution: "1920x1080",
      encoderPreference: "auto",
      format: "mp4",
      codec: "h264",
    },
  },
};

export function normalizeHotkey(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function eventMatchesHotkey(e: KeyboardEvent, hotkey: string): boolean {
  const target = normalizeHotkey(hotkey);
  if (!target) return false;
  const parts = target.split("+").filter(Boolean);
  const keyPart = parts[parts.length - 1] ?? "";
  const needCtrl = parts.includes("CTRL") || parts.includes("CONTROL");
  const needAlt = parts.includes("ALT");
  const needShift = parts.includes("SHIFT");
  if (!!e.ctrlKey !== needCtrl) return false;
  if (!!e.altKey !== needAlt) return false;
  if (!!e.shiftKey !== needShift) return false;
  const pressed = e.key.length === 1 ? e.key.toUpperCase() : e.key.toUpperCase();
  return pressed === keyPart;
}
