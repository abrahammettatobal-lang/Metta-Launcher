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
  return (
    <div className={cx("glass relative overflow-hidden p-5", className)}>
      <div className="flex items-center gap-2.5 text-ink-faint">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-canvas-deep/60 text-gold-300">
          {icon}
        </span>
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.2em]">
          {label}
        </span>
      </div>
      <div className="mt-3 font-display text-[22px] font-semibold leading-none tracking-tight text-ink">
        {value}
      </div>
      {hint && (
        <div className="mt-1.5 text-[11.5px] font-medium text-ink-muted">{hint}</div>
      )}
      {progress && progress.max > 0 && (
        <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-canvas-deep">
          <div
            className="h-full rounded-full bg-gradient-to-r from-gold-400 to-gold-200"
            style={{
              width: `${Math.min(100, (progress.current / progress.max) * 100)}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}
