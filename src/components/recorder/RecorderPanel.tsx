import { motion } from "framer-motion";
import {
  formatDuration,
  type RecorderSettings,
  type RecorderStatus,
} from "../../services/recorder/recorderService";
import { formatBytes } from "../../utils/format";
import { MicLevelMeter } from "./RecorderSettings";
import { RecIndicator } from "./RecorderStatus";

interface RecorderPanelProps {
  status: RecorderStatus;
  settings: RecorderSettings;
  countdown: number | null;
  busy: boolean;
  mcFound: boolean;
  gameRunning: boolean;
  ffmpegReady: boolean;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onScreenshot: () => void;
  onOpenFolder: () => void;
  onRefreshTarget: () => void;
}

export function RecorderPanel({
  status,
  settings,
  countdown,
  busy,
  mcFound,
  gameRunning,
  ffmpegReady,
  onStart,
  onStop,
  onPause,
  onResume,
  onScreenshot,
  onOpenFolder,
  onRefreshTarget,
}: RecorderPanelProps) {
  const active =
    status.phase === "recording" ||
    status.phase === "paused" ||
    status.phase === "countdown";
  const timer =
    status.phase === "countdown" && countdown != null
      ? `00:0${Math.max(0, countdown)}`.slice(-5)
      : formatDuration(status.elapsedSecs);

  return (
    <div className="overflow-hidden rounded-2xl border border-line-gold/35 bg-[linear-gradient(145deg,#1f1712_0%,#15171a_48%,#121418_100%)] shadow-ambient">
      <div className="border-b border-line/40 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold-300/80">
              Game Recorder
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h2 className="font-display text-[28px] font-bold leading-none tracking-tight text-ink">
                {status.phase === "recording"
                  ? "Grabando"
                  : status.phase === "paused"
                    ? "En pausa"
                    : status.phase === "countdown"
                      ? "Cuenta atrás"
                      : "Listo para grabar"}
              </h2>
              <RecIndicator active={status.phase === "recording"} />
            </div>
            <p className="mt-2 max-w-xl text-[12.5px] text-ink-muted">
              {settings.captureMode === "window"
                ? "Captura la ventana de Minecraft"
                : `Captura el monitor ${settings.monitorIndex + 1}`}
              {" · "}
              {settings.fps} FPS · {settings.bitrateMbps} Mbps ·{" "}
              {settings.format.toUpperCase()}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="font-mono text-[34px] font-semibold leading-none tracking-tight text-ink tabular-nums">
              {timer}
            </div>
            <div className="text-[11px] text-ink-faint">
              {active
                ? status.fileSizeBytes > 0
                  ? formatBytes(status.fileSizeBytes)
                  : "Preparando archivo…"
                : "Sin sesión activa"}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <StatusChip
            ok={ffmpegReady}
            label={ffmpegReady ? "FFmpeg listo" : "FFmpeg pendiente"}
          />
          <StatusChip
            ok={gameRunning || mcFound}
            label={
              mcFound
                ? "Minecraft detectado"
                : gameRunning
                  ? "Juego en marcha"
                  : "Minecraft no detectado"
            }
          />
          <StatusChip
            ok={settings.audioMode !== "none"}
            label={
              settings.audioMode === "both"
                ? "Juego + mic"
                : settings.audioMode === "game"
                  ? "Audio del juego"
                  : settings.audioMode === "mic"
                    ? "Solo micrófono"
                    : "Sin audio"
            }
          />
          <StatusChip
            ok
            label={`Atajos ${settings.hotkeyToggle} / ${settings.hotkeyPause} / ${settings.hotkeyScreenshot}`}
          />
        </div>
      </div>

      <div className="px-5 py-5 sm:px-6">
        {!mcFound && settings.captureMode === "window" && !active && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[12px] text-amber-100">
            <span>
              No se encontró Minecraft. Inicia el juego o cambia a captura de
              monitor.
            </span>
            <button type="button" className="btn" onClick={onRefreshTarget}>
              Reintentar detección
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {!active ? (
            <motion.button
              type="button"
              whileTap={{ scale: 0.98 }}
              disabled={busy || !ffmpegReady}
              className="btn-gold inline-flex min-w-[220px] items-center justify-center gap-2 px-6 py-3 text-[14px] font-semibold disabled:opacity-50"
              onClick={onStart}
            >
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.18)]" />
              Iniciar grabación
            </motion.button>
          ) : (
            <>
              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                className="inline-flex min-w-[200px] items-center justify-center gap-2 rounded-xl border border-red-500/40 bg-red-500/15 px-6 py-3 text-[14px] font-semibold text-red-100 hover:bg-red-500/25"
                onClick={onStop}
              >
                ■ Detener
              </motion.button>
              {status.phase === "recording" ? (
                <button type="button" className="btn" onClick={onPause}>
                  ⏸ Pausar
                </button>
              ) : status.phase === "paused" ? (
                <button type="button" className="btn" onClick={onResume}>
                  ▶ Reanudar
                </button>
              ) : countdown != null ? (
                <span className="rounded-xl border border-gold-500/30 bg-gold-haze/20 px-4 py-2 text-[13px] text-gold-100">
                  Empieza en {countdown}s — pulsa Detener para cancelar
                </span>
              ) : null}
            </>
          )}

          <button type="button" className="btn" onClick={onScreenshot}>
            Captura
          </button>
          <button type="button" className="btn" onClick={onOpenFolder}>
            Abrir carpeta
          </button>

          <div className="ml-auto min-w-[160px]">
            <MicLevelMeter level={status.micLevel} />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={
        ok
          ? "inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-200"
          : "inline-flex items-center gap-1.5 rounded-lg border border-line/60 bg-canvas-deep/50 px-2.5 py-1 text-[10px] font-medium text-ink-muted"
      }
    >
      <span
        className={
          ok
            ? "h-1.5 w-1.5 rounded-full bg-emerald-400"
            : "h-1.5 w-1.5 rounded-full bg-ink-dim"
        }
      />
      {label}
    </span>
  );
}
