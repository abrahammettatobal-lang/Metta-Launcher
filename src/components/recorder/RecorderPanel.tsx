import { motion } from "framer-motion";
import type { RecorderSettings, RecorderStatus } from "../../services/recorder/recorderService";
import { MicLevelMeter } from "./RecorderSettings";
import { RecIndicator } from "./RecorderStatus";

interface RecorderPanelProps {
  status: RecorderStatus;
  settings: RecorderSettings;
  countdown: number | null;
  busy: boolean;
  mcFound: boolean;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onScreenshot: () => void;
}

export function RecorderPanel({
  status,
  settings,
  countdown,
  busy,
  mcFound,
  onStart,
  onStop,
  onPause,
  onResume,
  onScreenshot,
}: RecorderPanelProps) {
  const active =
    status.phase === "recording" ||
    status.phase === "paused" ||
    status.phase === "countdown";

  return (
    <div className="rounded-2xl border border-line-gold/30 bg-gradient-to-br from-canvas-card/90 to-canvas-deep/70 p-6 shadow-glow">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold-300/80">
            Game Recorder
          </div>
          <div className="mt-1 flex items-center gap-3">
            <h2 className="font-display text-2xl font-bold text-ink">
              {active ? "Grabación activa" : "Listo para grabar"}
            </h2>
            <RecIndicator active={status.phase === "recording"} />
          </div>
        </div>
        <MicLevelMeter level={status.micLevel} />
      </div>

      {!mcFound && settings.captureMode === "window" && !active && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-100">
          No se encontró Minecraft. Inicia el juego o cambia a captura de monitor.
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {!active ? (
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            disabled={busy}
            className="btn-gold inline-flex min-w-[220px] items-center justify-center gap-2 px-6 py-3 text-[14px] font-semibold"
            onClick={onStart}
          >
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
            Iniciar grabación
          </motion.button>
        ) : (
          <>
            <motion.button
              type="button"
              whileTap={{ scale: 0.98 }}
              className="inline-flex min-w-[200px] items-center justify-center gap-2 rounded-xl border border-red-500/40 bg-red-500/15 px-6 py-3 text-[14px] font-semibold text-red-100"
              onClick={onStop}
            >
              ■ Detener grabación
            </motion.button>
            {status.phase === "recording" ? (
              <button type="button" className="btn" onClick={onPause}>
                ⏸ Pausar
              </button>
            ) : status.phase === "paused" ? (
              <button type="button" className="btn" onClick={onResume}>
                ▶ Reanudar
              </button>
            ) : countdown ? (
              <span className="rounded-xl border border-gold-500/30 bg-gold-haze/20 px-4 py-2 text-[13px] text-gold-100">
                Inicio en {countdown}s…
              </span>
            ) : null}
          </>
        )}
        <button type="button" className="btn" onClick={onScreenshot}>
          Tomar captura
        </button>
      </div>
    </div>
  );
}
