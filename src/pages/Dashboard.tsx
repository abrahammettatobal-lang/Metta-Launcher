import { openPath } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import {
  accountsList,
  instancesList,
  launchHistoryList,
  logsQuery,
  settingGet,
} from "../services/bridge";
import type { AccountRow, InstanceRow } from "../services/bridge";
import {
  subscribeDownloadProgress,
  subscribeGameExit,
  subscribeGameLog,
} from "../services/downloads/downloadEvents";
import {
  subscribeLaunchProgress,
  type LaunchProgress,
} from "../services/launchProgress";
import { cancelCurrentLaunch, launchInstance } from "../services/launchInstance";
import { diagnoseLaunchFailure, type LaunchDiagnosis } from "../services/minecraft/errorDiagnostics";
import { logAppend } from "../services/bridge";
import { listMods } from "../services/modsService";
import { fetchMojangNews, type MojangNewsEntry } from "../services/mojangNews";
import { openUrl } from "@tauri-apps/plugin-opener";
import { tap } from "../utils/tap";
import { fullPath } from "../utils/full-path";
import { loaderLabel, relativeTime } from "../utils/format";
import { Hero } from "../ui/Hero";
import { StatTile } from "../ui/StatTile";
import { Card } from "../ui/Card";
import { Topbar } from "../ui/Topbar";
import { Avatar } from "../ui/Avatar";
import { Empty } from "../ui/Empty";
import {
  IconBolt,
  IconClock,
  IconCubes,
  IconDot,
  IconDownload,
  IconFolder,
  IconPuzzle,
  IconRam,
  IconShield,
  IconSparkle,
  IconX,
} from "../ui/icons";

export function Dashboard() {
  const nav = useNavigate();
  const [instances, setInstances] = useState<InstanceRow[]>([]);
  const [sel, setSel] = useState<string>("");
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [dl, setDl] = useState<string>("");
  const [logTail, setLogTail] = useState<
    Array<{ level: string; message: string; createdAt: string }>
  >([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<LaunchProgress | null>(null);
  const [modCounts, setModCounts] = useState<Record<string, number>>({});
  const [news, setNews] = useState<MojangNewsEntry[]>([]);
  const [history, setHistory] = useState<
    Array<{
      instanceName: string | null;
      startedAt: string;
      success: boolean;
    }>
  >([]);
  const [diagnosis, setDiagnosis] = useState<LaunchDiagnosis | null>(null);
  const recentGameLinesRef = useRef<string[]>([]);

  const load = useCallback(async () => {
    const [i, a, logs, hist] = await Promise.all([
      instancesList(),
      accountsList(),
      logsQuery(8, undefined, "launcher"),
      launchHistoryList(6),
    ]);
    setInstances(i);
    setAccounts(a);
    setHistory(
      hist.map((h) => ({
        instanceName: h.instanceName,
        startedAt: h.startedAt,
        success: h.success,
      })),
    );
    if (!sel && i[0]) setSel(i[0].id);
    setLogTail(logs);
  }, [sel]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void fetchMojangNews().then((n) => {
      if (!cancelled) setNews(n);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let u: (() => void) | undefined;
    void subscribeDownloadProgress((p) => {
      setDl(`${p.state} · ${p.received}/${p.total ?? "?"}`);
    }).then((fn) => {
      u = fn;
    });
    const unsubProgress = subscribeLaunchProgress((p) => {
      if (p.phase === "idle") {
        setProgress(null);
        return;
      }
      setProgress(p);
      if (p.phase === "done" || p.phase === "error") {
        setTimeout(() => setProgress(null), 2400);
      }
    });
    return () => {
      u?.();
      unsubProgress();
    };
  }, []);

  useEffect(() => {
    let a: (() => void) | undefined;
    let b: (() => void) | undefined;
    void (async () => {
      const verbose = (await settingGet("verboseGameLogs")) === "true";
      if (!verbose) return;
      const unsub = await subscribeGameLog((l) => {
        recentGameLinesRef.current = [...recentGameLinesRef.current.slice(-199), l.line];
        void logAppend("game", "info", `[${l.stream}] ${l.line}`, sel || undefined);
      });
      a = unsub;
    })();
    void subscribeGameExit((e) => {
      void logAppend(
        "launcher",
        e.success ? "info" : "error",
        `Juego terminado code=${e.code}`,
        sel || undefined,
      );
      if (!e.success) {
        const d = diagnoseLaunchFailure(recentGameLinesRef.current, e.code);
        if (d) setDiagnosis(d);
      } else {
        setDiagnosis(null);
      }
      recentGameLinesRef.current = [];
      setBusy(false);
      void load();
    }).then((y) => {
      b = y;
    });
    return () => {
      a?.();
      b?.();
    };
  }, [sel, load]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const out: Record<string, number> = {};
      for (const i of instances) {
        try {
          const m = await listMods(i.instancePath);
          out[i.id] = m.filter((x) => x.enabled).length;
        } catch {
          out[i.id] = 0;
        }
      }
      if (!cancelled) setModCounts(out);
    }
    if (instances.length) void run();
    return () => {
      cancelled = true;
    };
  }, [instances]);

  const cur = instances.find((x) => x.id === sel);
  const activeAcc = accounts.find((x) => x.isActive);
  const heroImage = news[0]?.wideImage ?? news[0]?.image ?? null;
  const lastPlayedInstances = useMemo(() => {
    return [...instances]
      .sort((a, b) => {
        const ta = a.lastPlayedAt ? new Date(a.lastPlayedAt).getTime() : 0;
        const tb = b.lastPlayedAt ? new Date(b.lastPlayedAt).getTime() : 0;
        return tb - ta;
      })
      .slice(0, 4);
  }, [instances]);

  async function handlePlay() {
    if (!cur) return;
    setBusy(true);
    try {
      await launchInstance(cur.id);
      setBusy(true);
    } catch {
      setBusy(false);
    }
  }

  const isLaunching =
    busy &&
    progress &&
    progress.phase !== "running" &&
    progress.phase !== "idle" &&
    progress.phase !== "done" &&
    progress.phase !== "error";

  return (
    <div className="space-y-6">
      <Topbar
        eyebrow="Inicio"
        title="Panel de control"
        subtitle="Selecciona una instancia, revisa el estado y lanza el juego."
        actions={
          <InstanceSwitcher
            instances={instances}
            selected={sel}
            onChange={setSel}
          />
        }
      />

      {/* Crash diagnosis banner */}
      <AnimatePresence>
        {diagnosis && (
          <motion.div
            key="diagnosis"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="relative overflow-hidden rounded-2xl border border-red-900/50 bg-red-950/25 p-5 backdrop-blur-sm"
          >
            <button
              type="button"
              onClick={() => setDiagnosis(null)}
              className="absolute right-4 top-4 rounded-lg p-1 text-ink-faint hover:text-ink"
            >
              <IconX width={14} height={14} />
            </button>
            <div className="flex items-start gap-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-900/40 text-[16px]">
                ⚠
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-0.5 text-[13px] font-semibold text-red-200">{diagnosis.title}</p>
                <p className="mb-3 text-[12px] text-red-300/80">{diagnosis.cause}</p>
                <ul className="space-y-1">
                  {diagnosis.suggestions.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-[11.5px] text-ink-muted">
                      <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold/60" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {cur ? (
        <Hero
          title={cur.name}
          subtitle={
            activeAcc
              ? `Sesión: ${activeAcc.username} · ${activeAcc.kind === "microsoft" ? "Microsoft" : "Local"}`
              : "Configura una cuenta en Perfiles para jugar en servidores Premium."
          }
          loaderLabel={loaderLabel(cur.loaderType, cur.loaderVersion)}
          versionLabel={cur.minecraftVersion}
          imageUrl={heroImage}
          onPlay={() => void tap("Jugar", async () => handlePlay())}
          onConfig={() => nav(`/instances/${cur.id}/edit`)}
          disabled={busy || !activeAcc}
          playing={progress?.phase === "running"}
          progress={
            isLaunching && progress?.percent !== null
              ? progress.percent
              : undefined
          }
          progressLabel={progress?.label}
          extra={
            <div className="flex flex-wrap items-center justify-between gap-3 text-[11.5px] text-ink-muted">
              <div className="flex items-center gap-2">
                <IconShield className="text-gold-300" width={14} height={14} />
                <span>
                  Java vía Metta · descarga verificada · arranque seguro
                </span>
              </div>
              {(isLaunching || progress?.phase === "running") && (
                <button
                  type="button"
                  onClick={() =>
                    tap("Cancelar", () => cancelCurrentLaunch())
                  }
                  className="btn-ghost text-[11.5px] !text-red-300 hover:!text-red-200"
                >
                  <IconX width={13} height={13} />{" "}
                  {progress?.phase === "running"
                    ? "Detener juego"
                    : "Cancelar lanzamiento"}
                </button>
              )}
            </div>
          }
        />
      ) : (
        <Empty
          icon={<IconCubes width={22} height={22} />}
          title="No tienes instancias todavía"
          description="Crea tu primera instancia para empezar a jugar."
          action={
            <Link to="/create" className="btn-gold">
              Crear instancia
            </Link>
          }
        />
      )}

      {/* Stat tiles */}
      {cur && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile
            icon={<IconRam width={15} height={15} />}
            label="RAM asignada"
            value={`${cur.maxRamMb} MB`}
            hint={`Mínimo ${cur.minRamMb} MB`}
            progress={{ current: cur.maxRamMb, max: 16384 }}
          />
          <StatTile
            icon={<IconPuzzle width={15} height={15} />}
            label="Mods activos"
            value={modCounts[cur.id] ?? 0}
            hint={
              cur.loaderType === "vanilla"
                ? "Sin mod loader"
                : `Loader ${loaderLabel(cur.loaderType, cur.loaderVersion)}`
            }
          />
          <StatTile
            icon={<IconClock width={15} height={15} />}
            label="Último juego"
            value={relativeTime(cur.lastPlayedAt)}
            hint={
              cur.lastPlayedAt
                ? new Date(cur.lastPlayedAt).toLocaleString("es")
                : "Aún sin partidas"
            }
          />
        </div>
      )}

      {/* News + activity row */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card
          eyebrow="Noticias"
          title="Minecraft"
          interactive
          action={
            <span className="pill">
              <IconSparkle width={11} height={11} /> Mojang News
            </span>
          }
        >
          {news.length === 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <NewsSkeleton />
              <NewsSkeleton />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {news.slice(0, 2).map((n) => (
                <NewsTile key={n.id} entry={n} />
              ))}
            </div>
          )}
        </Card>

        <Card
          eyebrow="Actividad"
          title="Recientes"
          interactive
          action={
            <Link
              to="/instances"
              className="btn-ghost text-[11.5px] !text-ink-muted hover:!text-ink"
            >
              Ver todas
            </Link>
          }
        >
          {lastPlayedInstances.length === 0 && history.length === 0 ? (
            <Empty
              title="Sin actividad"
              description="Cuando lances una instancia aparecerá aquí."
            />
          ) : (
            <ul className="space-y-2">
              {history.slice(0, 4).map((h, idx) => (
                <li
                  key={`${h.startedAt}-${idx}`}
                  className="flex items-center justify-between rounded-xl border border-line/60 bg-canvas-deep/30 px-3 py-2 text-[12px]"
                >
                  <span className="truncate text-ink-soft">
                    {h.instanceName ?? "Instancia"}
                  </span>
                  <span
                    className={
                      h.success ? "text-emerald-300" : "text-red-300"
                    }
                  >
                    {relativeTime(h.startedAt)}
                  </span>
                </li>
              ))}
              {lastPlayedInstances.map((i) => (
                <li key={i.id}>
                  <button
                    type="button"
                    onClick={() => setSel(i.id)}
                    className="group flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-all duration-200 ease-soft hover:border-line hover:bg-canvas-raised/60"
                  >
                    <Avatar name={i.name} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold text-ink">
                        {i.name}
                      </div>
                      <div className="truncate text-[11.5px] text-ink-faint">
                        {loaderLabel(i.loaderType, i.loaderVersion)} ·{" "}
                        {i.minecraftVersion}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                        {relativeTime(i.lastPlayedAt)}
                      </div>
                      {sel === i.id && (
                        <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-300">
                          <IconDot width={10} height={10} /> activa
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Lower row */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <Card
          eyebrow="Acciones rápidas"
          title="Atajos de la instancia"
        >
          {cur ? (
            <div className="grid grid-cols-3 gap-2">
              <QuickAction
                icon={<IconFolder width={15} height={15} />}
                label="Carpeta"
                onClick={() =>
                  tap("Abrir carpeta", async () => {
                    const p = await fullPath(cur.instancePath);
                    await openPath(p);
                  })
                }
              />
              <QuickAction
                icon={<IconPuzzle width={15} height={15} />}
                label="Mods"
                onClick={() =>
                  tap("Abrir mods", async () => {
                    const p = await fullPath(`${cur.instancePath}/mods`);
                    await openPath(p);
                  })
                }
              />
              <QuickAction
                icon={<IconBolt width={15} height={15} />}
                label="Config"
                onClick={() =>
                  tap("Abrir config", async () => {
                    const p = await fullPath(`${cur.instancePath}/config`);
                    await openPath(p);
                  })
                }
              />
            </div>
          ) : (
            <Empty
              title="Sin instancia"
              description="Selecciona una instancia para ver los atajos."
            />
          )}
        </Card>

        <Card
          eyebrow="Telemetría"
          title="Estado del launcher"
          action={
            <span className="pill">
              <IconDownload width={11} height={11} /> Descargas
            </span>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-canvas-deep/40 p-3">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
                Actividad de red
              </div>
              <div className="mt-1 truncate font-mono text-[11.5px] text-ink-soft">
                {dl || "Sin actividad"}
              </div>
            </div>
            <div className="rounded-xl border border-line bg-canvas-deep/40 p-3">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
                Cuenta activa
              </div>
              <div className="mt-1 truncate text-[12.5px] text-ink-soft">
                {activeAcc
                  ? `${activeAcc.username} · ${activeAcc.kind}`
                  : "Sin cuenta"}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
              Últimos eventos
            </div>
            <AnimatePresence initial={false}>
              {logTail.length === 0 ? (
                <div className="rounded-xl border border-line bg-canvas-deep/40 px-3 py-4 text-[12px] text-ink-faint">
                  Sin eventos recientes.
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {logTail.slice(0, 5).map((l, idx) => (
                    <motion.li
                      key={`${l.createdAt}-${idx}`}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.22 }}
                      className="flex items-start gap-2 text-[12px]"
                    >
                      <span
                        className={
                          l.level === "error"
                            ? "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400"
                            : l.level === "warn"
                              ? "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300"
                              : "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400"
                        }
                      />
                      <span className="truncate text-ink-soft">{l.message}</span>
                    </motion.li>
                  ))}
                </ul>
              )}
            </AnimatePresence>
          </div>
        </Card>
      </div>
    </div>
  );
}

function InstanceSwitcher({
  instances,
  selected,
  onChange,
}: {
  instances: InstanceRow[];
  selected: string;
  onChange: (id: string) => void;
}) {
  if (!instances.length) return null;
  return (
    <div className="glass-soft flex items-center gap-2.5 rounded-xl p-1.5 shadow-innerline">
      <span className="hidden px-2 text-[10px] font-medium uppercase tracking-[0.18em] text-ink-faint sm:inline">
        Instancia
      </span>
      <div className="relative min-w-[160px]">
        <select
          value={selected}
          onChange={(e) => onChange(e.target.value)}
          className="field !border-transparent !bg-canvas-deep/70 !py-2 !pr-9 !text-[12.5px] !font-medium"
        >
          {instances.map((i) => (
            <option key={i.id} value={i.id} className="bg-canvas-deep">
              {i.name}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint">
          <svg
            width="10"
            height="6"
            viewBox="0 0 12 8"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M1 1.5l5 5 5-5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
    </div>
  );
}

function QuickAction({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="surface-interactive group flex flex-col items-center justify-center gap-2.5 rounded-xl border border-line bg-canvas-raised/45 px-3 py-4 text-[11px] font-medium text-ink-soft"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-canvas-deep/70 text-gold-300 transition-colors duration-200 group-hover:text-gold-200">
        {icon}
      </span>
      <span className="uppercase tracking-[0.16em]">{label}</span>
    </button>
  );
}

function NewsTile({ entry }: { entry: MojangNewsEntry }) {
  const img = entry.wideImage ?? entry.image;
  const open = () => {
    if (entry.link) void openUrl(entry.link);
  };
  return (
    <button
      type="button"
      onClick={open}
      className="group relative overflow-hidden rounded-2xl border border-line bg-canvas-card/60 p-0 text-left transition-all duration-300 ease-soft hover:-translate-y-0.5 hover:border-gold-500/30 hover:shadow-floating"
      style={{ minHeight: 168 }}
    >
      {img && (
        <img
          src={img}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-70 saturate-[0.95] transition-transform duration-700 ease-soft group-hover:scale-[1.04]"
          loading="lazy"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-canvas-deep via-canvas-deep/55 via-50% to-transparent" />
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gold-500/15 blur-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="relative flex h-full flex-col justify-end p-4">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-gold-300/90">
          {entry.category || "Minecraft"}
        </div>
        <div className="mt-1 line-clamp-2 font-display text-[15px] font-semibold leading-tight tracking-tight text-ink">
          {entry.title}
        </div>
        <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-ink-muted">
          {entry.excerpt || "Lee la entrada completa en minecraft.net"}
        </p>
      </div>
    </button>
  );
}

function NewsSkeleton() {
  return (
    <div
      className="relative animate-pulse overflow-hidden rounded-2xl border border-line bg-canvas-card/60"
      style={{ minHeight: 168 }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-canvas-raised to-canvas-deep" />
      <div className="absolute inset-x-4 bottom-4 space-y-2">
        <div className="h-2 w-16 rounded bg-canvas-lift/60" />
        <div className="h-3.5 w-3/4 rounded bg-canvas-lift/60" />
        <div className="h-2.5 w-2/3 rounded bg-canvas-lift/40" />
      </div>
    </div>
  );
}
