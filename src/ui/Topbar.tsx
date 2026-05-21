import type { ReactNode } from "react";

interface TopbarProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function Topbar({ eyebrow, title, subtitle, actions }: TopbarProps) {
  return (
    <header className="page-header mb-7">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          {eyebrow && <div className="h-section mb-2">{eyebrow}</div>}
          <h1 className="page-title text-balance">{title}</h1>
          {subtitle && (
            <p className="page-subtitle mt-1.5 max-w-2xl text-balance">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
      <div className="page-header-line mt-5" aria-hidden />
    </header>
  );
}
