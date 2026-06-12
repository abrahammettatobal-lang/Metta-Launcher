import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { cx } from "./cx";
import {
  IconActivity,
  IconBedrock,
  IconClock,
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
import { accountsList, type AccountRow } from "../services/bridge";
import { Avatar } from "./Avatar";
import { getVersion } from "@tauri-apps/api/app";
import { SponsorBadge } from "../components/sponsors/SponsorBadge";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  badge?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

function buildGroups(): NavGroup[] {
  const library: NavItem[] = [
    { to: "/instances", label: "Instancias", icon: <IconCubes /> },
    { to: "/create", label: "Nueva", icon: <IconPlus /> },
    { to: "/mods", label: "Mods", icon: <IconPuzzle /> },
  ];
  if (isWindowsClient()) {
    library.splice(1, 0, {
      to: "/bedrock",
      label: "Bedrock",
      icon: <IconBedrock />,
      badge: "Win",
    });
  }
  return [
    {
      label: "Principal",
      items: [{ to: "/", label: "Inicio", icon: <IconHome /> }],
    },
    { label: "Biblioteca", items: library },
    {
      label: "Cuenta",
      items: [{ to: "/accounts", label: "Perfiles", icon: <IconUser /> }],
    },
    {
      label: "Sistema",
      items: [
        { to: "/history", label: "Historial", icon: <IconClock /> },
        { to: "/logs", label: "Registros", icon: <IconTerminal /> },
        { to: "/diagnostics", label: "Diagnóstico", icon: <IconActivity /> },
        { to: "/settings", label: "Ajustes", icon: <IconSliders /> },
      ],
    },
  ];
}

const GROUPS = buildGroups();

export interface SidebarStatus {
  text: string;
  variant: "idle" | "playing" | "busy" | "error";
}

interface SidebarProps {
  status?: SidebarStatus;
}

export function Sidebar({ status }: SidebarProps) {
  const loc = useLocation();
  const [account, setAccount] = useState<AccountRow | null>(null);
  const [version, setVersion] = useState("…");

  useEffect(() => {
    void getVersion().then(setVersion).catch(() => setVersion("0.7.0"));
  }, []);

  useEffect(() => {
    void accountsList().then((a) =>
      setAccount(a.find((x) => x.isActive) ?? null),
    );
  }, [loc.pathname]);

  return (
    <aside className="relative z-10 flex w-[15.5rem] shrink-0 flex-col py-4 pl-4 pr-2">
      <div className="sidebar-panel flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-4 pt-5">
          <div className="relative shrink-0">
            <span className="pointer-events-none absolute -inset-2 rounded-2xl bg-gold-500/18 blur-lg" />
            <MettaMark size={40} className="relative rounded-[11px]" />
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="font-display text-[15px] font-bold tracking-tight text-ink">
              Metta
            </div>
            <div className="text-[10px] font-medium uppercase tracking-[0.28em] text-gold-300/80">
              Launcher
            </div>
          </div>
          <span className="rounded-md border border-line-gold bg-gold-haze/30 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-gold-200">
            {version}
          </span>
        </div>

        <nav className="scrollbar-thin mt-5 flex-1 space-y-5 overflow-y-auto px-2 pb-3">
          {GROUPS.map((group) => (
            <div key={group.label}>
              <div className="mb-1.5 px-2 text-[9.5px] font-semibold uppercase tracking-[0.22em] text-ink-faint/90">
                {group.label}
              </div>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <NavRow key={item.to} item={item} />
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="mt-auto space-y-2.5 border-t border-line/80 px-3 py-4">
          {account ? (
            <NavLink
              to="/accounts"
              className="group flex items-center gap-2.5 rounded-xl border border-transparent px-2 py-2 transition-all duration-200 hover:border-line hover:bg-canvas-raised/50"
            >
              <Avatar
                name={account.username}
                size={34}
                src={
                  account.kind === "microsoft"
                    ? `https://minotar.net/helm/${account.username}/64.png`
                    : undefined
                }
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-medium text-ink">
                  {account.username}
                </div>
                <div className="truncate text-[9.5px] uppercase tracking-[0.16em] text-ink-faint">
                  {account.kind === "microsoft" ? "Microsoft" : "Local"}
                </div>
              </div>
            </NavLink>
          ) : (
            <NavLink
              to="/accounts"
              className="flex items-center gap-2 rounded-xl border border-dashed border-line/80 px-3 py-2.5 text-[11.5px] text-ink-muted transition hover:border-gold-500/30 hover:text-gold-200"
            >
              <IconUser width={14} height={14} />
              Iniciar sesión
            </NavLink>
          )}
          <SponsorBadge compact />
          <StatusBlock status={status} />
        </div>
      </div>
    </aside>
  );
}

function NavRow({ item }: { item: NavItem }) {
  const loc = useLocation();
  const active =
    item.to === "/"
      ? loc.pathname === "/"
      : loc.pathname.startsWith(item.to);

  return (
    <li>
      <NavLink
        to={item.to}
        className={() =>
          cx(
            "nav-item group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium",
            active ? "nav-item-active text-ink" : "text-ink-muted",
          )
        }
      >
        {active && (
          <motion.span
            layoutId="nav-active"
            className="absolute inset-0 rounded-xl border border-line-gold/40 bg-canvas-card/90 shadow-innerline"
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
          />
        )}
        <span
          className={cx(
            "relative z-[1] flex h-7 w-7 items-center justify-center rounded-lg border transition-colors duration-200",
            active
              ? "border-gold-500/35 bg-gold-haze/40 text-gold-200"
              : "border-transparent bg-transparent text-ink-muted group-hover:border-line group-hover:bg-canvas-raised/60 group-hover:text-ink",
          )}
        >
          {item.icon}
        </span>
        <span className="relative z-[1] flex-1 tracking-tight">{item.label}</span>
        {item.badge && (
          <span className="relative z-[1] rounded-md border border-line bg-canvas-deep/80 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wider text-ink-faint">
            {item.badge}
          </span>
        )}
      </NavLink>
    </li>
  );
}

function StatusBlock({ status }: { status?: SidebarStatus }) {
  if (!status || status.variant === "idle") {
    return (
      <div className="flex items-center gap-2 px-1 py-0.5">
        <span className="h-1.5 w-1.5 rounded-full bg-ink-dim" />
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-ink-faint">
          Listo
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
    <div className="rounded-xl border border-line/60 bg-canvas-deep/50 px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2 shrink-0">
          <span
            className={cx(
              "absolute inset-0 animate-ping rounded-full opacity-50",
              dotBg,
            )}
          />
          <span className={cx("relative h-2 w-2 rounded-full", dotBg)} />
        </span>
        <span
          className={cx(
            "text-[9.5px] font-semibold uppercase tracking-[0.18em]",
            tone,
          )}
        >
          {status.variant === "playing"
            ? "Jugando"
            : status.variant === "error"
              ? "Error"
              : "Procesando"}
        </span>
      </div>
      <p className="mt-1 truncate pl-4 text-[11px] text-ink-soft">{status.text}</p>
    </div>
  );
}
