import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { cx } from "./cx";
import {
  IconBedrock,
  IconCubes,
  IconHome,
  IconPlus,
  IconPuzzle,
  IconSliders,
  IconTerminal,
  IconUser,
  MettaMark,
} from "./icons";
import type { ReactNode } from "react";
import { isWindowsClient } from "../services/bedrock";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

const BASE_NAV: NavItem[] = [
  { to: "/", label: "Inicio", icon: <IconHome /> },
  { to: "/instances", label: "Instancias", icon: <IconCubes /> },
  { to: "/create", label: "Nueva", icon: <IconPlus /> },
  { to: "/mods", label: "Mods", icon: <IconPuzzle /> },
  { to: "/accounts", label: "Cuentas", icon: <IconUser /> },
  { to: "/logs", label: "Registros", icon: <IconTerminal /> },
  { to: "/settings", label: "Ajustes", icon: <IconSliders /> },
];

// Bedrock entry is Windows-only; we keep it visually grouped with Instancias.
function buildNav(): NavItem[] {
  if (!isWindowsClient()) return BASE_NAV;
  const before = BASE_NAV.slice(0, 2); // Inicio, Instancias
  const after = BASE_NAV.slice(2);
  return [
    ...before,
    { to: "/bedrock", label: "Bedrock", icon: <IconBedrock /> },
    ...after,
  ];
}

const NAV = buildNav();

export interface SidebarStatus {
  text: string;
  variant: "idle" | "playing" | "busy" | "error";
}

interface SidebarProps {
  status?: SidebarStatus;
}

export function Sidebar({ status }: SidebarProps) {
  const loc = useLocation();
  return (
    <aside className="relative z-10 flex w-[16rem] shrink-0 flex-col px-4 py-5">
      <div className="glass-deep flex flex-1 flex-col overflow-hidden p-5">
        {/* Brand */}
        <div className="mb-6 flex items-center gap-3">
          <div className="relative shrink-0">
            <span className="pointer-events-none absolute -inset-1.5 rounded-[18px] bg-gold-500/22 blur-md" />
            <span className="pointer-events-none absolute -inset-px rounded-[14px] ring-1 ring-gold-500/35" />
            <MettaMark size={44} className="relative rounded-[12px]" />
          </div>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="font-display text-[15.5px] font-bold tracking-[0.005em] text-ink">
              Metta
            </span>
            <span className="font-display text-[10.5px] font-semibold uppercase tracking-[0.32em] text-gold-300/95">
              Launcher
            </span>
          </div>
        </div>

        <div className="mb-5 h-px w-full bg-gradient-to-r from-transparent via-line-strong to-transparent" />

        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => {
            const active =
              item.to === "/"
                ? loc.pathname === "/"
                : loc.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={() =>
                  cx(
                    "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-all duration-200 ease-soft",
                    active
                      ? "text-ink"
                      : "text-ink-muted hover:bg-canvas-raised/55 hover:text-ink",
                  )
                }
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 -z-10 rounded-xl border border-line bg-canvas-card/85 shadow-innerline"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-[2px] -translate-x-1 -translate-y-1/2 rounded-full bg-gradient-to-b from-gold-200 to-gold-500 shadow-[0_0_12px_2px_rgba(228,188,60,0.55)]" />
                )}
                <span
                  className={cx(
                    "flex h-4 w-4 items-center justify-center transition-colors duration-200",
                    active ? "text-gold-300" : "text-ink-muted group-hover:text-ink",
                  )}
                >
                  {item.icon}
                </span>
                <span className="tracking-tight">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Status footer */}
        <div className="mt-5 border-t border-line pt-4">
          <StatusBlock status={status} />
        </div>
      </div>
    </aside>
  );
}

function StatusBlock({ status }: { status?: SidebarStatus }) {
  if (!status || status.variant === "idle") {
    return (
      <div className="flex items-center gap-2.5 px-1">
        <span className="relative flex h-2 w-2">
          <span className="absolute inset-0 rounded-full bg-ink-dim" />
        </span>
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
          En reposo
        </span>
      </div>
    );
  }
  const tone =
    status.variant === "playing"
      ? "text-emerald-300"
      : status.variant === "error"
        ? "text-red-300"
        : "text-gold-300";
  const dotBg =
    status.variant === "playing"
      ? "bg-emerald-400"
      : status.variant === "error"
        ? "bg-red-400"
        : "bg-gold-400";
  return (
    <div className="flex items-center gap-2.5 px-1">
      <span className="relative flex h-2 w-2">
        <span
          className={cx(
            "absolute inset-0 animate-ping rounded-full opacity-60",
            dotBg,
          )}
        />
        <span className={cx("relative h-2 w-2 rounded-full", dotBg)} />
      </span>
      <div className="flex min-w-0 flex-col">
        <span
          className={cx(
            "text-[10.5px] font-semibold uppercase tracking-[0.2em]",
            tone,
          )}
        >
          {status.variant === "playing"
            ? "Jugando"
            : status.variant === "error"
              ? "Error"
              : "Procesando"}
        </span>
        <span className="truncate text-[11.5px] font-medium text-ink-soft">
          {status.text}
        </span>
      </div>
    </div>
  );
}
