import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Topbar } from "../ui/Topbar";
import { Card } from "../ui/Card";
import { RecorderPanel } from "../components/recorder/RecorderPanel";
import { RecorderSettingsPanel } from "../components/recorder/RecorderSettings";
import { RecorderStatusPanel } from "../components/recorder/RecorderStatus";
import { RecordingsGallery } from "../components/recorder/RecordingsGallery";
import { RecorderOverlay } from "../components/recorder/RecorderOverlay";
import {
  recorderFindMinecraftWindow,
  recorderFfmpegStatus,
  recorderGetSettings,
  recorderGetStatus,
  recorderInstallFfmpeg,
  recorderListMonitors,
  recorderPause,
  recorderProbeHardware,
  recorderResume,
  recorderSaveSettings,
  recorderScreenshot,
  recorderStart,
  recorderStop,
  subscribeFfmpegInstall,
  subscribeRecorderCountdown,
  subscribeRecorderError,
  subscribeRecorderStarted,
  subscribeRecorderStatus,
  subscribeRecorderStopped,
  type AudioDeviceInfo,
  type EncoderInfo,
  type MonitorInfo,
  type RecorderSettings,
  type RecorderStatus,
} from "../services/recorder/recorderService";
import {
  recordingDelete,
  recordingOpen,
  recordingRename,
  recordingReveal,
  recordingSharePath,
  recordingsList,
  type RecordingItem,
} from "../services/recorder/recordingsService";
import { subscribeDownloadProgress } from "../services/downloads/downloadEvents";
import { tap } from "../utils/tap";
import { toastGlobal } from "../ui/Toast";

const idleStatus: RecorderStatus = {
  phase: "idle",
  elapsedSecs: 0,
  fileSizeBytes: 0,
  filePath: "",
  fps: 0,
  targetFps: 60,
  bitrateKbps: 0,
  encoder: "",
  resolution: "",
  droppedFrames: 0,
  cpuUsagePct: 0,
  gpuUsagePct: 0,
  diskFreeBytes: 0,
  micLevel: 0,
  captureMode: "window",
  windowTitle: null,
  estimatedFinalSizeBytes: 0,
};

const MemoSettings = memo(RecorderSettingsPanel);
const MemoStatus = memo(RecorderStatusPanel);

type InstallProgressState = {
  received: number;
  total: number | null;
  state: string;
  error: string | null;
};

function formatInstallProgress(p: InstallProgressState): number | null {
  if (p.state === "completed") return 100;
  if (p.total && p.total > 0) {
    return Math.min(100, Math.round((p.received / p.total) * 100));
  }
  return null;
}

export function RecordingPage() {
  const [settings, setSettings] = useState<RecorderSettings | null>(null);
  const [status, setStatus] = useState<RecorderStatus>(idleStatus);
  const [encoders, setEncoders] = useState<EncoderInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<AudioDeviceInfo[]>([]);
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ffmpegInstalled, setFfmpegInstalled] = useState(false);
  const [gameAudioAvailable, setGameAudioAvailable] = useState(false);
  const [installingFfmpeg, setInstallingFfmpeg] = useState(false);
  const [installMessage, setInstallMessage] = useState<string | null>(null);
  const [installProgress, setInstallProgress] =
    useState<InstallProgressState | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [mcFound, setMcFound] = useState(false);
  const [saved, setSaved] = useState(false);
  const [galleryLoaded, setGalleryLoaded] = useState(false);

  const settingsRef = useRef<RecorderSettings | null>(null);
  const statusRef = useRef(status);
  const saveTimer = useRef<number | null>(null);

  statusRef.current = status;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [s, st, mon, ff] = await Promise.all([
        recorderGetSettings(),
        recorderGetStatus(),
        recorderListMonitors(),
        recorderFfmpegStatus(),
      ]);
      if (cancelled) return;
      setSettings(s);
      settingsRef.current = s;
      setStatus(st);
      setMonitors(mon);
      setFfmpegInstalled(ff.installed);
      setGameAudioAvailable(ff.audioCapable);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unsubs: Array<() => void> = [];
    let mounted = true;

    void (async () => {
      unsubs.push(
        await subscribeRecorderStatus((next) => {
          if (!mounted) return;
          if (next.phase === "idle" && statusRef.current.phase === "idle") return;
          setStatus(next);
        }),
      );
      unsubs.push(
        await subscribeRecorderCountdown((p) => {
          if (!mounted) return;
          setCountdown(p.secondsLeft);
          setStatus((prev) => ({ ...prev, phase: "countdown" }));
        }),
      );
      unsubs.push(
        await subscribeRecorderStarted((payload) => {
          if (!mounted) return;
          setCountdown(null);
          setStatus((prev) => ({
            ...prev,
            phase: "recording",
            filePath: payload.filePath,
            encoder: payload.encoder,
            captureMode: payload.captureMode,
          }));
          toastGlobal("success", "Grabación iniciada");
        }),
      );
      unsubs.push(
        await subscribeRecorderStopped((p) => {
          if (!mounted) return;
          setCountdown(null);
          setStatus(idleStatus);
          toastGlobal(
            p.success ? "success" : "error",
            p.success ? "Grabación guardada" : "La grabación terminó con errores",
          );
          setGalleryLoaded(false);
        }),
      );
      unsubs.push(
        await subscribeRecorderError((p) => {
          if (!mounted) return;
          toastGlobal("error", p.message);
          setCountdown(null);
          setStatus(idleStatus);
        }),
      );
      unsubs.push(
        await subscribeFfmpegInstall((p) => {
          if (!mounted) return;
          setInstallMessage(p.message);
          if (p.phase === "extracting") {
            setInstallProgress({
              received: 100,
              total: 100,
              state: "extracting",
              error: null,
            });
          } else if (p.phase === "done") {
            setFfmpegInstalled(true);
            setInstallingFfmpeg(false);
            setInstallMessage(null);
            setInstallProgress({
              received: 100,
              total: 100,
              state: "completed",
              error: null,
            });
            setInstallError(null);
            window.setTimeout(() => setInstallProgress(null), 2500);
          } else if (p.phase === "error") {
            setInstallingFfmpeg(false);
            setInstallError(p.message);
            setInstallProgress((prev) =>
              prev
                ? { ...prev, state: "failed", error: p.message }
                : {
                    received: 0,
                    total: null,
                    state: "failed",
                    error: p.message,
                  },
            );
          }
        }),
      );
      unsubs.push(
        await subscribeDownloadProgress((p) => {
          if (!mounted || p.id !== "ffmpeg-install") return;
          setInstallProgress({
            received: p.received,
            total: p.total,
            state: p.state,
            error: p.error,
          });
          if (p.state === "downloading") {
            setInstallMessage("Descargando FFmpeg…");
          }
          if (p.state === "failed" && p.error) {
            setInstallError(p.error);
            setInstallingFfmpeg(false);
            setInstallMessage(null);
          }
        }),
      );
    })();

    return () => {
      mounted = false;
      unsubs.forEach((u) => u());
    };
  }, []);

  const probeHardware = useCallback(async () => {
    setProbing(true);
    setProbeError(null);
    try {
      const probe = await recorderProbeHardware();
      setEncoders(probe.encoders);
      setAudioDevices(probe.audioDevices);
      if (probe.ffmpegAvailable) setFfmpegInstalled(true);
      setGameAudioAvailable(probe.gameAudioAvailable);
      if (probe.error) setProbeError(probe.error);
      if (!probe.ffmpegAvailable) {
        setProbeError(
          probe.error ??
            "FFmpeg no encontrado. Pulsa «Instalar FFmpeg» para instalarlo.",
        );
      }
    } catch (e) {
      setProbeError(String(e));
    } finally {
      setProbing(false);
    }
  }, []);

  const installFfmpeg = useCallback(async () => {
    setInstallingFfmpeg(true);
    setInstallMessage("Preparando instalación…");
    setInstallError(null);
    setInstallProgress({
      received: 0,
      total: null,
      state: "starting",
      error: null,
    });
    setProbeError(null);
    try {
      await recorderInstallFfmpeg();
      setFfmpegInstalled(true);
      setGameAudioAvailable(true);
      toastGlobal("success", "FFmpeg instalado correctamente");
      await probeHardware();
    } catch (e) {
      const msg = String(e);
      setInstallError(msg);
      setInstallProgress((prev) =>
        prev
          ? { ...prev, state: "failed", error: msg }
          : { received: 0, total: null, state: "failed", error: msg },
      );
      toastGlobal("error", msg);
    } finally {
      setInstallingFfmpeg(false);
    }
  }, [probeHardware]);

  const refreshMinecraft = useCallback(async () => {
    const mc = await recorderFindMinecraftWindow();
    setMcFound(mc.found);
  }, []);

  const loadGallery = useCallback(async () => {
    setLoadingGallery(true);
    try {
      setRecordings(await recordingsList());
      setGalleryLoaded(true);
    } finally {
      setLoadingGallery(false);
    }
  }, []);

  const toggleRecording = useCallback(async () => {
    const s = settingsRef.current;
    if (!s) return;
    const phase = statusRef.current.phase;
    setBusy(true);
    try {
      if (phase === "recording" || phase === "paused" || phase === "countdown") {
        await recorderStop();
        return;
      }
      await refreshMinecraft();
      await recorderStart(s);
      const st = await recorderGetStatus();
      setStatus(st);
    } catch (e) {
      toastGlobal("error", String(e));
    } finally {
      setBusy(false);
    }
  }, [refreshMinecraft]);

  const togglePause = useCallback(async () => {
    const phase = statusRef.current.phase;
    if (phase === "recording") await tap("Pausar", () => recorderPause());
    else if (phase === "paused") await tap("Reanudar", () => recorderResume());
  }, []);

  const takeScreenshot = useCallback(async () => {
    const s = settingsRef.current;
    if (!s) return;
    await tap("Captura", async () => {
      await refreshMinecraft();
      const path = await recorderScreenshot(s);
      toastGlobal("success", "Captura guardada");
      setGalleryLoaded(false);
      return path;
    });
  }, [refreshMinecraft]);

  const queueSaveSettings = useCallback((next: RecorderSettings) => {
    setSettings(next);
    settingsRef.current = next;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void recorderSaveSettings(next).then(() => {
        setSaved(true);
        window.setTimeout(() => setSaved(false), 1500);
      });
    }, 600);
  }, []);

  if (!settings) {
    return (
      <Card padding="tight">
        <p className="text-[13px] text-ink-muted">Cargando grabador…</p>
      </Card>
    );
  }

  const recordingActive =
    status.phase === "recording" ||
    status.phase === "paused" ||
    status.phase === "countdown";

  const progressPct =
    installProgress !== null ? formatInstallProgress(installProgress) : null;
  const progressLabel =
    installProgress?.state === "extracting"
      ? "Extrayendo FFmpeg…"
      : installProgress?.state === "completed"
        ? "Instalación completada"
        : installMessage ?? "Descargando FFmpeg…";

  const needsFfmpegForAudio =
    settings.audioMode !== "none" && !gameAudioAvailable;

  return (
    <div className="space-y-6">
      <Topbar
        eyebrow="Multimedia"
        title="Grabación"
        subtitle="Graba Minecraft sin OBS. Detecta FFmpeg solo cuando lo necesites."
        actions={
          saved ? (
            <span className="text-[11px] text-emerald-300">Guardado</span>
          ) : undefined
        }
      />

      <RecorderPanel
        status={status}
        settings={settings}
        countdown={countdown}
        busy={busy}
        mcFound={mcFound}
        onStart={() => void toggleRecording()}
        onStop={() => void toggleRecording()}
        onPause={() => void togglePause()}
        onResume={() => void togglePause()}
        onScreenshot={() => void takeScreenshot()}
      />

      {recordingActive && (
        <Card title="Estado en vivo">
          <MemoStatus status={status} countdown={countdown} />
        </Card>
      )}

      <Card
        title="Hardware y audio"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {(!ffmpegInstalled || needsFfmpegForAudio) && (
              <button
                type="button"
                className="btn-gold"
                disabled={installingFfmpeg || probing}
                onClick={() => void installFfmpeg()}
              >
                {installingFfmpeg ? "Instalando FFmpeg…" : "Instalar FFmpeg"}
              </button>
            )}
            <button
              type="button"
              className="btn"
              disabled={probing || installingFfmpeg}
              onClick={() => void probeHardware()}
            >
              {probing ? "Detectando…" : "Detectar FFmpeg"}
            </button>
          </div>
        }
      >
        {(installingFfmpeg || installProgress) && !installError && (
          <div className="mb-3 space-y-2">
            <div className="flex items-center justify-between gap-3 text-[11px] text-ink-muted">
              <span>{progressLabel}</span>
              <span className="tabular-nums text-gold-300">
                {progressPct !== null
                  ? `${progressPct}%`
                  : installProgress?.state === "extracting"
                    ? "…"
                    : "Calculando…"}
              </span>
            </div>
            <div className="progress-track h-2">
              <div
                className="progress-fill transition-[width] duration-300 ease-out"
                style={{
                  width:
                    progressPct !== null
                      ? `${progressPct}%`
                      : installProgress?.state === "extracting"
                        ? "100%"
                        : "8%",
                  opacity:
                    progressPct === null &&
                    installProgress?.state !== "extracting"
                      ? 0.45
                      : 1,
                }}
              />
            </div>
            {installProgress?.total && installProgress.total > 0 && (
              <p className="text-[10px] text-ink-muted">
                {(installProgress.received / (1024 * 1024)).toFixed(1)} MB /{" "}
                {(installProgress.total / (1024 * 1024)).toFixed(1)} MB
              </p>
            )}
          </div>
        )}
        {installError && (
          <p className="mb-3 whitespace-pre-wrap rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-100">
            {installError}
          </p>
        )}
        {!ffmpegInstalled && !installingFfmpeg && !installError && (
          <p className="mb-3 text-[12px] text-ink-muted">
            Si no tienes FFmpeg, pulsa «Instalar FFmpeg» para descargarlo
            automáticamente (~100 MB). El audio del juego se captura con WASAPI
            integrado en el launcher; FFmpeg solo se usa para vídeo y codificación.
            También funciona si lo instalaste con winget u otro método.
          </p>
        )}
        {probeError && (
          <p className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-100">
            {probeError}
          </p>
        )}
        {!probeError && encoders.length === 0 && !probing && (
          <p className="mb-3 text-[12px] text-ink-muted">
            Pulsa «Detectar FFmpeg» para listar encoders y micrófonos.
          </p>
        )}
        <MemoSettings
          settings={settings}
          encoders={encoders}
          audioDevices={audioDevices}
          monitors={monitors}
          onChange={queueSaveSettings}
        />
      </Card>

      <Card
        title="Mis grabaciones"
        action={
          <button
            type="button"
            className="btn"
            disabled={loadingGallery}
            onClick={() => void loadGallery()}
          >
            {galleryLoaded ? "Recargar" : "Cargar lista"}
          </button>
        }
      >
        {!galleryLoaded && !loadingGallery ? (
          <p className="text-[12px] text-ink-muted">
            Pulsa «Cargar lista» para ver tus videos guardados.
          </p>
        ) : (
          <RecordingsGallery
            items={recordings}
            loading={loadingGallery}
            onOpen={(p) => void tap("Abrir", () => recordingOpen(p))}
            onReveal={(p) => void tap("Carpeta", () => recordingReveal(p))}
            onRename={(p, n) =>
              void tap("Renombrar", async () => {
                await recordingRename(p, n);
                await loadGallery();
              })
            }
            onDelete={(p) =>
              void tap("Eliminar", async () => {
                await recordingDelete(p);
                await loadGallery();
              })
            }
            onShare={(p) =>
              void tap("Ruta copiada", async () => {
                await recordingSharePath(p);
              })
            }
          />
        )}
      </Card>

      {recordingActive && (
        <RecorderOverlay settings={settings} status={status} />
      )}
    </div>
  );
}
