import type { RecorderSettings, RecorderStatus } from "../../services/recorder/recorderService";
import { formatDuration } from "../../services/recorder/recorderService";

interface RecorderOverlayProps {
  settings: RecorderSettings;
  status: RecorderStatus;
}

export function RecorderOverlay({ settings, status }: RecorderOverlayProps) {
  const show =
    status.phase === "recording" &&
    (settings.overlayFps ||
      settings.overlayDuration ||
      settings.overlayLogo ||
      settings.overlayDate ||
      settings.overlayTime);

  if (!show) return null;

  const now = new Date();

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[9999] rounded-xl border border-line-gold/40 bg-black/70 px-4 py-3 backdrop-blur-md">
      <div className="flex flex-col gap-1 text-[11px] text-ink">
        {settings.overlayLogo && (
          <div className="font-display text-[10px] font-bold uppercase tracking-[0.25em] text-gold-300">
            Metta Launcher
          </div>
        )}
        {settings.overlayDuration && (
          <div>{formatDuration(status.elapsedSecs)}</div>
        )}
        {settings.overlayFps && (
          <div>
            {status.fps} FPS · {Math.round(status.bitrateKbps / 1000)} Mbps
          </div>
        )}
        {settings.overlayDate && (
          <div>
            {now.toLocaleDateString("es", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </div>
        )}
        {settings.overlayTime && (
          <div>
            {now.toLocaleTimeString("es", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </div>
        )}
      </div>
    </div>
  );
}
