import type { ReactNode } from "react";
import { cx } from "./cx";

interface StatTileProps {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  progress?: { current: number; max: number };
  className?: string;
}

export function StatTile({
  icon,
  label,
  value,
  hint,
  progress,
  className,
}: StatTileProps) {
  const pct =
    progress && progress.max > 0
      ? Math.min(100, (progress.current / progress.max) * 100)
      : 0;

  return (
    <div className={cx("glass surface-interactive relative overflow-hidden p-5", className)}>
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gold-500/8 blur-2xl" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-line-gold/30 bg-canvas-deep/70 text-gold-300 shadow-innerline">
            {icon}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-faint">
            {label}
          </span>
        </div>
      </div>
      <div className="relative mt-3 font-display text-[1.65rem] font-semibold leading-none tracking-tight text-ink">
        {value}
      </div>
      {hint && (
        <div className="relative mt-1.5 text-[11.5px] font-medium text-ink-muted">
          {hint}
        </div>
      )}
      {progress && progress.max > 0 && (
        <div className="relative mt-4">
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
