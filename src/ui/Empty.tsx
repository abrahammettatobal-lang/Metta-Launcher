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
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-line/80 bg-canvas-raised/30 px-6 py-12 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-canvas-deep/70 text-gold-300 shadow-innerline">
          {icon}
        </div>
      )}
      <h3 className="font-display text-[15px] font-semibold tracking-tight text-ink">
        {title}
      </h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-ink-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
