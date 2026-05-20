import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Topbar } from "../ui/Topbar";
import { Card } from "../ui/Card";
import { Empty } from "../ui/Empty";
import {
  IconBedrock,
  IconBolt,
  IconCheck,
  IconCopy,
  IconFolder,
  IconLink,
  IconPlay,
  IconRefresh,
  IconShield,
  IconSparkle,
  IconX,
} from "../ui/icons";
import { tap } from "../utils/tap";
import {
  detectBedrock,
  isWindowsClient,
  launchBedrock,
  openBedrockBehaviorPacks,
  openBedrockResourcePacks,
  openBedrockRoot,
  openBedrockScreenshots,
  openBedrockSkinPacks,
  openBedrockWorlds,
  openStorePage,
} from "../services/bedrock";
import type {
  BedrockFolderKind,
  BedrockInstallation,
} from "../types/bedrock";

export function BedrockPage() {
  const supportedOs = isWindowsClient();
  const [info, setInfo] = useState<BedrockInstallation | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await detectBedrock();
      setInfo(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const installed = info?.installed === true;

  return (
    <div className="space-y-6">
      <Topbar
        eyebrow="Bedrock Edition"
        title="Minecraft Bedrock"
        subtitle="Detección, lanzamiento y acceso a las carpetas de Minecraft para Windows."
        actions={
          <>
            <button
              type="button"
              className="btn"
              disabled={loading}
              onClick={() => tap("Re-detectar", refresh)}
            >
              <IconRefresh width={14} height={14} />
              {loading ? "Detectando…" : "Re-detectar"}
            </button>
            {installed && (
              <button
                type="button"
                className="btn-gold"
                disabled={busy}
                onClick={() =>
                  tap("Lanzar Bedrock", async () => {
                    setBusy(true);
                    try {
                      await launchBedrock();
                    } finally {
                      setBusy(false);
                    }
                  })
                }
              >
                <IconPlay width={14} height={14} />
                Lanzar Bedrock
              </button>
            )}
          </>
        }
      />

      {!supportedOs ? (
        <Card>
          <Empty
            icon={<IconShield width={22} height={22} />}
            title="Solo disponible en Windows"
            description="Minecraft Bedrock se distribuye como UWP a través de Microsoft Store, por lo que únicamente puede gestionarse desde Windows 10/11."
          />
        </Card>
      ) : error ? (
        <Card>
          <Empty
            icon={<IconX width={22} height={22} />}
            title="Error al detectar Bedrock"
            description={error}
            action={
              <button
                type="button"
                className="btn"
                onClick={() => tap("Re-detectar", refresh)}
              >
                <IconRefresh width={14} height={14} /> Reintentar
              </button>
            }
          />
        </Card>
      ) : loading && !info ? (
        <Card>
          <div className="flex items-center gap-3 text-[12.5px] text-ink-muted">
            <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-gold-500/70" />
            Buscando instalación de Minecraft Bedrock…
          </div>
        </Card>
      ) : installed && info ? (
        <Installed info={info} busy={busy} />
      ) : (
        <NotInstalled info={info} />
      )}
    </div>
  );
}

function Installed({
  info,
  busy,
}: {
  info: BedrockInstallation;
  busy: boolean;
}) {
  const folders = useMemo(
    () =>
      [
        {
          key: "worlds" as BedrockFolderKind,
          label: "Mundos",
          desc: "minecraftWorlds",
          path: info.worldsPath,
          action: openBedrockWorlds,
        },
        {
          key: "resourcePacks" as BedrockFolderKind,
          label: "Resource packs",
          desc: "Texturas y aspectos",
          path: info.resourcePacksPath,
          action: openBedrockResourcePacks,
        },
        {
          key: "behaviorPacks" as BedrockFolderKind,
          label: "Behavior packs",
          desc: "Add-ons de comportamiento",
          path: info.behaviorPacksPath,
          action: openBedrockBehaviorPacks,
        },
        {
          key: "skinPacks" as BedrockFolderKind,
          label: "Skin packs",
          desc: "Aspectos de personaje",
          path: info.skinPacksPath,
          action: openBedrockSkinPacks,
        },
        {
          key: "screenshots" as BedrockFolderKind,
          label: "Capturas",
          desc: "Screenshots del juego",
          path: info.screenshotsPath,
          action: openBedrockScreenshots,
        },
        {
          key: "root" as BedrockFolderKind,
          label: "Datos de usuario",
          desc: "%LocalAppData%\\Packages",
          path: info.userDataPath,
          action: openBedrockRoot,
        },
      ].filter((f) => f.path),
    [info],
  );

  return (
    <div className="space-y-5">
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-3xl border border-line shadow-floating"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-[#0b1a14] via-canvas-deep to-[#1a1208]" />
        <div className="absolute inset-0 bg-gradient-to-r from-canvas-deep via-canvas-deep/80 to-transparent" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-glow to-transparent" />

        <div className="relative grid gap-8 p-7 sm:grid-cols-[1.05fr_1fr] sm:p-9">
          <div className="flex flex-col justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.32em] text-emerald-300/85">
                <IconBedrock width={12} height={12} /> Bedrock Edition
                <span className="pill-gold">
                  <IconCheck width={11} height={11} /> Instalado
                </span>
              </div>
              <h2 className="mt-3 font-display text-[28px] font-bold leading-[1.05] tracking-tight text-ink">
                Minecraft for Windows
              </h2>
              <p className="mt-2 max-w-md text-[12.5px] leading-relaxed text-ink-muted">
                Detectado mediante <span className="font-mono text-ink-soft">Microsoft.MinecraftUWP</span>.
                El juego se ejecuta dentro de su sandbox UWP usando tu cuenta
                Xbox del sistema.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Stat label="Versión" value={info.version ?? "—"} />
              <Stat label="Arquitectura" value={info.architecture ?? "—"} />
              <Stat
                label="Familia"
                value={info.packageFamily ?? "—"}
                mono
                small
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                className="btn-gold-lg"
                disabled={busy}
                onClick={() => tap("Lanzar Bedrock", launchBedrock)}
              >
                <IconPlay width={16} height={16} />
                {busy ? "Lanzando…" : "Jugar"}
              </motion.button>
              <button
                type="button"
                className="btn"
                onClick={() => tap("Abrir mundos", openBedrockWorlds)}
              >
                <IconFolder width={14} height={14} /> Mundos
              </button>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  tap("Abrir resource packs", openBedrockResourcePacks)
                }
              >
                <IconFolder width={14} height={14} /> Resource packs
              </button>
            </div>
          </div>

          <div className="relative hidden items-center justify-center sm:flex">
            <div className="relative aspect-square w-full max-w-[260px]">
              <div className="absolute inset-2 rounded-3xl border border-emerald-500/15 blur-[1px]" />
              <div className="absolute inset-10 rounded-3xl border border-emerald-500/25" />
              <div className="absolute inset-[24%] rounded-3xl border border-emerald-500/40 bg-gradient-to-br from-emerald-500/15 via-transparent to-transparent shadow-[0_0_60px_8px_rgba(20,184,120,0.20)]" />
              <div className="absolute inset-0 flex items-center justify-center">
                <IconBedrock
                  width={92}
                  height={92}
                  className="text-emerald-300/90 drop-shadow-[0_8px_24px_rgba(20,184,120,0.45)]"
                />
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <Card
          eyebrow="Carpetas"
          title="Acceso rápido"
          action={
            <span className="pill">
              <IconSparkle width={11} height={11} /> Explorer
            </span>
          }
        >
          <div className="grid gap-2">
            {folders.map((f) => (
              <FolderRow
                key={f.key}
                label={f.label}
                description={f.desc}
                path={f.path!}
                onClick={() => tap(`Abrir ${f.label}`, f.action)}
              />
            ))}
          </div>
        </Card>

        <Card eyebrow="Instalación" title="Detalles">
          <div className="space-y-1.5 text-[11px]">
            <DetailRow label="Paquete" value={info.packageFullName ?? "—"} mono />
            <DetailRow label="Editor" value={info.publisher ?? "—"} mono small />
            <DetailRow
              label="Install"
              value={info.installPath ?? "—"}
              mono
              small
            />
            <DetailRow
              label="Alias"
              value={info.executableAlias ?? "—"}
              mono
              small
            />
            <DetailRow
              label="Datos"
              value={info.userDataPath ?? "—"}
              mono
              small
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

function NotInstalled({ info }: { info: BedrockInstallation | null }) {
  return (
    <Card>
      <Empty
        icon={<IconBedrock width={26} height={26} />}
        title="Minecraft Bedrock no está instalado"
        description={
          info?.diagnostic ??
          "Instálalo desde Microsoft Store o la app Xbox para verlo aquí."
        }
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              className="btn-gold"
              onClick={() => tap("Abrir Microsoft Store", openStorePage)}
            >
              <IconLink width={14} height={14} /> Abrir Microsoft Store
            </button>
            <button
              type="button"
              className="btn"
              onClick={() =>
                tap("Re-detectar", async () => {
                  await detectBedrock();
                })
              }
            >
              <IconRefresh width={14} height={14} /> Re-detectar
            </button>
          </div>
        }
      />
    </Card>
  );
}

function Stat({
  label,
  value,
  mono,
  small,
}: {
  label: string;
  value: string;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-canvas-deep/55 px-3 py-2.5">
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
        {label}
      </div>
      <div
        className={
          (mono ? "font-mono " : "font-display ") +
          (small ? "text-[11px] " : "text-[13.5px] ") +
          "mt-0.5 truncate font-semibold tracking-tight text-ink"
        }
      >
        {value}
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
  small,
}: {
  label: string;
  value: string;
  mono?: boolean;
  small?: boolean;
}) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* noop */
    }
  };
  return (
    <div className="group flex items-start gap-2">
      <span className="w-16 shrink-0 pt-1 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
        {label}
      </span>
      <span
        className={
          (mono ? "font-mono " : "") +
          (small ? "text-[11px] " : "text-[12.5px] ") +
          "min-w-0 flex-1 truncate text-ink-soft"
        }
        title={value}
      >
        {value}
      </span>
      {value !== "—" && (
        <button
          type="button"
          onClick={copy}
          className="rounded-md p-1 text-ink-faint opacity-0 transition-opacity duration-150 hover:bg-canvas-card/80 hover:text-ink group-hover:opacity-100"
          aria-label={`Copiar ${label}`}
        >
          <IconCopy width={12} height={12} />
        </button>
      )}
    </div>
  );
}

function FolderRow({
  label,
  description,
  path,
  onClick,
}: {
  label: string;
  description: string;
  path: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-2xl border border-line bg-canvas-card/60 px-3.5 py-3 text-left transition-all duration-200 ease-soft hover:border-gold-500/40 hover:bg-canvas-card/85 hover:shadow-gold-soft"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line bg-canvas-deep/70 text-gold-300 transition-colors duration-200 group-hover:border-gold-500/40 group-hover:text-gold-200">
        <IconFolder width={15} height={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-display text-[13px] font-semibold tracking-tight text-ink">
            {label}
          </span>
          <span className="pill !py-0.5 !text-[10px]">
            <IconBolt width={10} height={10} /> {description}
          </span>
        </div>
        <div className="mt-0.5 truncate font-mono text-[10.5px] text-ink-faint">
          {path}
        </div>
      </div>
    </button>
  );
}
