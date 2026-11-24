import type { ReactNode } from "react";
import { cx } from "./cx";

interface EmptyProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function Empty({ icon, title, description, action, className }: EmptyProps) {
  return (
    <div
      className={cx(
        "relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-line/70 bg-canvas-raised/25 px-6 py-14 text-center",
        className,
      )}
    >
      {icon && (
        <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-line-gold/25 bg-canvas-card/80 text-gold-300 shadow-plate">
          {icon}
        </div>
      )}
      <h3 className="relative font-display text-[15px] font-semibold tracking-tight text-ink">
        {title}
      </h3>
      {description && (
        <p className="relative mt-2 max-w-sm text-[12.5px] leading-relaxed text-ink-muted">
          {description}
        </p>
      )}
      {action && <div className="relative mt-5">{action}</div>}
    </div>
  );
}
