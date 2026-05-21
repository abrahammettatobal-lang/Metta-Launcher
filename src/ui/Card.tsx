import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
  variant?: "glass" | "soft" | "deep";
  padding?: "default" | "tight" | "none";
  interactive?: boolean;
}

export function Card({
  title,
  eyebrow,
  action,
  variant = "glass",
  padding = "default",
  interactive = false,
  className,
  children,
  ...rest
}: CardProps) {
  const variantCls =
    variant === "deep"
      ? "glass-deep"
      : variant === "soft"
        ? "glass-soft"
        : "glass";
  const padCls =
    padding === "none" ? "" : padding === "tight" ? "p-4" : "p-5";

  return (
    <div
      className={cx(
        variantCls,
        padCls,
        interactive && "surface-interactive",
        className,
      )}
      {...rest}
    >
      {(title || eyebrow || action) && (
        <div className="mb-4 flex items-start justify-between gap-3 border-b border-line/50 pb-3.5">
          <div className="min-w-0">
            {eyebrow && <div className="h-section mb-1">{eyebrow}</div>}
            {title && (
              <div className="font-display text-[15px] font-semibold tracking-tight text-ink">
                {title}
              </div>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
