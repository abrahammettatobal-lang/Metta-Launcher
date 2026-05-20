"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { downloads, RELEASE_URL, RELEASE_VERSION } from "@/data/downloads";
import {
  IconApple,
  IconExternal,
  IconLinux,
  IconWindows,
} from "./Icons";
import { detectPlatform, type Platform } from "@/lib/detectPlatform";
import { DownloadCard } from "./DownloadCard";

const TABS: Array<{
  id: Platform;
  label: string;
  icon: React.ComponentType<{ width?: number; height?: number }>;
}> = [
  { id: "windows", label: "Windows", icon: IconWindows },
  { id: "macos", label: "macOS", icon: IconApple },
  { id: "linux", label: "Linux", icon: IconLinux },
];

export function DownloadSection() {
  const [active, setActive] = useState<Platform>("windows");
  const [detected, setDetected] = useState<Platform>("unknown");

  useEffect(() => {
    const d = detectPlatform();
    setDetected(d.os);
    if (d.os !== "unknown") setActive(d.os);
  }, []);

  const group = useMemo(() => {
    if (active === "windows" || active === "macos" || active === "linux") {
      return downloads[active];
    }
    return downloads.windows;
  }, [active]);

  const primaries = group.assets.filter((a) => a.variant === "primary");
  const secondaries = group.assets.filter((a) => a.variant === "secondary");
  const advanced = group.assets.filter((a) => a.variant === "advanced");

  return (
    <section id="downloads" className="relative py-24 sm:py-28">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <div className="eyebrow">Descargas</div>
          <h2 className="h2 mt-3 text-balance">
            Elige tu plataforma. Sin tiendas, sin cuentas.
          </h2>
          <p className="lead mt-4 text-pretty">
            Todas las descargas se sirven directamente desde GitHub Releases del
            repositorio oficial de Metta Launcher.
          </p>
        </div>

        <div className="mx-auto mt-10 flex max-w-md items-center justify-center gap-1 rounded-2xl border border-line bg-canvas-raised/55 p-1 backdrop-blur-md">
          {TABS.map((t) => {
            const isActive = active === t.id;
            const isDetected = detected === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActive(t.id)}
                aria-pressed={isActive}
                aria-label={`Ver descargas para ${t.label}`}
                className={`relative flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-[12.5px] font-semibold tracking-tight transition-colors
                  ${
                    isActive
                      ? "bg-gold-gradient text-canvas shadow-gold"
                      : "text-ink-muted hover:text-ink"
                  }`}
              >
                <Icon width={14} height={14} />
                {t.label}
                {isDetected && !isActive && (
                  <span className="absolute right-2 top-1 inline-block h-1.5 w-1.5 rounded-full bg-gold-400" />
                )}
              </button>
            );
          })}
        </div>

        {detected !== "unknown" && (
          <div className="mt-4 text-center text-[12px] text-ink-muted">
            Detectamos que estás en{" "}
            <span className="text-ink">
              {detected === "windows"
                ? "Windows"
                : detected === "macos"
                  ? "macOS"
                  : "Linux"}
            </span>
            .
          </div>
        )}

        <motion.div
          key={group.os}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="mt-10 grid gap-6 lg:grid-cols-[2fr,1fr]"
        >
          <div className="glass p-6 sm:p-7">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-display text-[20px] font-semibold tracking-tight text-ink">
                  Metta Launcher{" "}
                  <span className="gold-text">v{RELEASE_VERSION}</span>
                </div>
                <div className="mt-1 text-[12.5px] text-ink-muted">
                  {group.description}
                </div>
              </div>
              <a
                href={RELEASE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-soft"
                aria-label="Abrir release en GitHub"
              >
                <IconExternal width={13} height={13} /> Ver release
              </a>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {primaries.map((a, i) => (
                <DownloadCard key={a.id} asset={a} emphasize={i === 0} />
              ))}
            </div>

            {secondaries.length > 0 && (
              <>
                <div className="mt-7 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-ink-faint">
                  Alternativas
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {secondaries.map((a) => (
                    <DownloadCard key={a.id} asset={a} />
                  ))}
                </div>
              </>
            )}

            {advanced.length > 0 && (
              <>
                <div className="mt-7 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-ink-faint">
                  Avanzado
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {advanced.map((a) => (
                    <DownloadCard key={a.id} asset={a} />
                  ))}
                </div>
              </>
            )}
          </div>

          <aside className="glass space-y-5 p-6 sm:p-7">
            <div>
              <div className="eyebrow">Otras plataformas</div>
              <div className="mt-3 space-y-2.5">
                {(["windows", "macos", "linux"] as const)
                  .filter((p) => p !== group.os)
                  .map((p) => {
                    const t = TABS.find((x) => x.id === p)!;
                    const Icon = t.icon;
                    return (
                      <button
                        type="button"
                        key={p}
                        onClick={() => setActive(p)}
                        className="flex w-full items-center justify-between rounded-xl border border-line bg-canvas-raised/40 px-3.5 py-2.5 text-left text-[12.5px] text-ink-soft transition-colors hover:border-gold-500/30 hover:text-ink"
                      >
                        <span className="inline-flex items-center gap-2">
                          <Icon width={14} height={14} />
                          {t.label}
                        </span>
                        <span className="text-ink-faint">→</span>
                      </button>
                    );
                  })}
              </div>
            </div>

            <div className="divider" />

            <div>
              <div className="eyebrow">Versionado</div>
              <p className="muted mt-2">
                Las versiones nuevas se publican como tags{" "}
                <span className="font-mono text-ink-soft">vX.Y.Z</span> en
                GitHub. Las descargas anteriores siempre quedan disponibles en
                el historial de releases.
              </p>
              <a
                href={`https://github.com/abrahammettatobal-lang/Metta-Launcher/releases`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-soft mt-3"
              >
                <IconExternal width={13} height={13} /> Historial de versiones
              </a>
            </div>
          </aside>
        </motion.div>
      </div>
    </section>
  );
}
