import { motion } from "framer-motion";
import { formatBytes } from "../../utils/format";
import type { RecorderStatus } from "../../services/recorder/recorderService";
import { formatDuration } from "../../services/recorder/recorderService";

interface RecorderStatusProps {
  status: RecorderStatus;
  countdown: number | null;
}

export function RecorderStatusPanel({ status, countdown }: RecorderStatusProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat
        label="Estado"
        value={
          status.phase === "countdown" && countdown
            ? `Inicio en ${countdown}s`
            : phaseLabel(status.phase)
        }
        pulse={status.phase === "recording"}
      />
      <Stat label="Tiempo" value={formatDuration(status.elapsedSecs)} />
      <Stat
        label="Tamaño"
        value={formatBytes(status.fileSizeBytes)}
        sub={
          status.estimatedFinalSizeBytes > 0
            ? `Est. ${formatBytes(status.estimatedFinalSizeBytes)}`
            : undefined
        }
      />
      <Stat label="FPS" value={`${status.fps} / ${status.targetFps}`} />
      <Stat
        label="Bitrate"
        value={`${Math.round(status.bitrateKbps / 1000)} Mbps`}
      />
      <Stat label="Encoder" value={status.encoder || "—"} />
      <Stat label="Resolución" value={status.resolution || "—"} />
      <Stat
        label="Espacio libre"
        value={formatBytes(status.diskFreeBytes)}
      />
      <Stat
        label="Frames perdidos"
        value={String(status.droppedFrames)}
        warn={status.droppedFrames > 0}
      />
      <Stat
        label="Captura"
        value={
          status.captureMode === "window"
            ? status.windowTitle ?? "Ventana Minecraft"
            : "Monitor completo"
        }
      />
      <Stat label="CPU" value={`${status.cpuUsagePct.toFixed(0)}%`} />
      <Stat label="GPU" value={`${status.gpuUsagePct.toFixed(0)}%`} />
    </div>
  );
}

function phaseLabel(phase: string): string {
  switch (phase) {
    case "recording":
      return "Grabando";
    case "paused":
      return "Pausado";
    case "countdown":
      return "Preparando…";
    case "stopping":
      return "Finalizando…";
    default:
      return "Inactivo";
  }
}

function Stat({
  label,
  value,
  sub,
  pulse,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  pulse?: boolean;
  warn?: boolean;
}) {
  return (
    <motion.div
      layout
      className="rounded-xl border border-line/70 bg-canvas-deep/50 px-3 py-2.5"
    >
      <div className="flex items-center gap-2">
        {pulse && (
          <span className="relative flex h-2 w-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-red-400 opacity-60" />
            <span className="relative h-2 w-2 rounded-full bg-red-500" />
          </span>
        )}
        <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
          {label}
        </span>
      </div>
      <div
        className={
          warn
            ? "mt-1 text-[14px] font-semibold text-amber-300"
            : "mt-1 text-[14px] font-semibold text-ink"
        }
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-ink-muted">{sub}</div>}
    </motion.div>
  );
}

export function RecIndicator({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="inline-flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-red-300"
    >
      <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
      REC
    </motion.span>
  );
}
