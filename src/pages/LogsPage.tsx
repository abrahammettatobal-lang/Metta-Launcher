import { useCallback, useEffect, useRef, useState } from "react";
import { logsClear, logsQuery } from "../services/bridge";
import {
  subscribeGameLog,
  subscribeGameExit,
  type GameLogLine,
  type GameExit,
} from "../services/downloads/downloadEvents";
import { subscribeLaunchProgress, type LaunchProgress } from "../services/launchProgress";
import { diagnoseLaunchFailure, type LaunchDiagnosis } from "../services/minecraft/errorDiagnostics";
import { Topbar } from "../ui/Topbar";
import { Card } from "../ui/Card";
import { FieldSelect } from "../ui/Field";
import { IconCopy, IconDownload, IconRefresh, IconTrash, IconX } from "../ui/icons";
import { tap } from "../utils/tap";
import { cx } from "../ui/cx";
import { AnimatePresence, motion } from "framer-motion";

const MAX_LINES = 5000;

interface LogEntry {
  id: number;
  ts: string;
  level: "info" | "warn" | "error" | "debug";
  source: "launcher" | "game" | "download";
  stream?: "stdout" | "stderr";
  message: string;
  instanceId?: string;
}

let _entryId = 0;
function nextId() {
  return ++_entryId;
}

function classifyGameLine(line: string, stream: string): "info" | "warn" | "error" | "debug" {
  if (stream === "stderr") return "error";
  const l = line.toLowerCase();
  if (/\[error\]|exception|error:/.test(l)) return "error";
  if (/\[warn\]|warning/.test(l)) return "warn";
  if (/\[debug\]/.test(l)) return "debug";
  return "info";
}

function classifyDbLevel(level: string): LogEntry["level"] {
  if (level === "error") return "error";
  if (level === "warn") return "warn";
  if (level === "debug") return "debug";
  return "info";
}

function classifyDbSource(source: string): LogEntry["source"] {
  if (source === "game") return "game";
  if (source === "download") return "download";
  return "launcher";
}

function stageLabel(phase: LaunchProgress["phase"]): string {
  const map: Record<string, string> = {
    idle: "Inactivo",
    preparing: "Preparando",
    java: "Verificando Java",
    libraries: "Descargando librerías",
    assets: "Preparando assets",
    natives: "Extrayendo nativos",
    loader: "Instalando loader",
    starting: "Iniciando Minecraft",
    running: "Minecraft ejecutándose",
    done: "Completado",
    error: "Error",
  };
  return map[phase] ?? phase;
}

export function LogsPage() {
  const [dbEntries, setDbEntries] = useState<LogEntry[]>([]);
  const [liveEntries, setLiveEntries] = useState<LogEntry[]>([]);
  const [levelFilter, setLevelFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [search, setSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [paused, setPaused] = useState(false);
  const [launchState, setLaunchState] = useState<LaunchProgress | null>(null);
  const [diagnosis, setDiagnosis] = useState<LaunchDiagnosis | null>(null);
  const [showDiagnosis, setShowDiagnosis] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const liveBufferRef = useRef<LogEntry[]>([]);
  const recentLinesRef = useRef<string[]>([]);

  pausedRef.current = paused;

  // Load DB entries on mount + filter change
  const loadDb = useCallback(async () => {
    const r = await logsQuery(500, levelFilter || undefined, sourceFilter || undefined);
    setDbEntries(
      r.map((x) => ({
        id: x.id,
        ts: x.createdAt,
        level: classifyDbLevel(x.level),
        source: classifyDbSource(x.source),
        message: x.message,
        instanceId: x.instanceId ?? undefined,
      })),
    );
  }, [levelFilter, sourceFilter]);

  useEffect(() => {
    void loadDb();
  }, [loadDb]);

  // Subscribe to live game-log events
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void subscribeGameLog((l: GameLogLine) => {
      if (pausedRef.current) return;
      const level = classifyGameLine(l.line, l.stream);
      const entry: LogEntry = {
        id: nextId(),
        ts: l.timestamp,
        level,
        source: "game",
        stream: l.stream,
        message: l.line,
        instanceId: l.instanceId,
      };
      // Keep a rolling buffer of last 200 lines for crash analysis
      recentLinesRef.current = [...recentLinesRef.current.slice(-199), l.line];
      liveBufferRef.current = [...liveBufferRef.current.slice(-(MAX_LINES - 1)), entry];
      setLiveEntries([...liveBufferRef.current]);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  // Subscribe to game-exit for crash diagnosis
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void subscribeGameExit((e: GameExit) => {
      if (!e.success) {
        const lines = [...recentLinesRef.current, ...(e.logTail ?? e.stderrTail ?? [])];
        const d = diagnoseLaunchFailure(lines, e.code);
        if (d) {
          setDiagnosis(d);
          setShowDiagnosis(true);
        }
      } else {
        setDiagnosis(null);
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  // Subscribe to launch phase events for the stage pill
  useEffect(() => {
    return subscribeLaunchProgress((p) => {
      setLaunchState(p.phase === "idle" ? null : p);
      if (p.phase === "starting" || p.phase === "running") {
        setDiagnosis(null);
        setShowDiagnosis(false);
      }
    });
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && !paused && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [liveEntries, autoScroll, paused]);

  // Merged + filtered view
  const allEntries: LogEntry[] = [...dbEntries, ...liveEntries.filter(
    (l) => !dbEntries.some((d) => d.message === l.message && d.ts === l.ts),
  )];

  const filtered = allEntries.filter((l) => {
    if (levelFilter && l.level !== levelFilter) return false;
    if (sourceFilter && l.source !== sourceFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!l.message.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Only render last 500 to keep DOM manageable; full log is in liveBufferRef
  const visible = filtered.slice(-500);

  const exportText = () => {
    const all = [...liveBufferRef.current, ...dbEntries]
      .map((l) => `${l.ts} [${l.source}/${l.level}] ${l.message}`)
      .join("\n");
    const b = new Blob([all], { type: "text/plain" });
    const u = URL.createObjectURL(b);
    const a = document.createElement("a");
    a.href = u;
    a.download = `metta-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(u);
  };

  const copyText = () => {
    const text = visible.map((l) => `${l.ts} [${l.source}/${l.level}] ${l.message}`).join("\n");
    void navigator.clipboard.writeText(text);
  };

  const clearLive = () => {
    liveBufferRef.current = [];
    recentLinesRef.current = [];
    setLiveEntries([]);
    setDiagnosis(null);
    setShowDiagnosis(false);
  };

  return (
    <div className="space-y-5">
      <Topbar
        eyebrow="Diagnóstico"
        title="Registros"
        subtitle="Logs en tiempo real del launcher y del juego."
        actions={
          <>
            <button type="button" className="btn" onClick={() => tap("Refrescar", () => loadDb())}>
              <IconRefresh width={14} height={14} /> Refrescar DB
            </button>
            <button type="button" className="btn" onClick={copyText}>
              <IconCopy width={14} height={14} /> Copiar
            </button>
            <button type="button" className="btn" onClick={exportText}>
              <IconDownload width={14} height={14} /> Exportar
            </button>
            <button type="button" className="btn" onClick={clearLive}>
              <IconTrash width={14} height={14} /> Limpiar vista
            </button>
            <button
              type="button"
              className="btn-danger !py-2 !text-[12.5px]"
              onClick={() =>
                tap("Vaciar DB", async () => {
                  if (!confirm("¿Vaciar todos los registros de la base de datos?")) return;
                  await logsClear();
                  await loadDb();
                })
              }
            >
              <IconTrash width={13} height={13} /> Vaciar DB
            </button>
          </>
        }
      />

      {/* Launch stage pill + controls */}
      <div className="flex flex-wrap items-center gap-3">
        {launchState && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3 py-1.5"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold" />
            <span className="text-[11.5px] font-medium text-gold">
              {stageLabel(launchState.phase)}
            </span>
            {launchState.detail && (
              <span className="text-[11px] text-ink-muted">{launchState.detail}</span>
            )}
            {launchState.percent !== null && (
              <span className="text-[10.5px] text-ink-faint">{launchState.percent}%</span>
            )}
          </motion.div>
        )}

        <button
          type="button"
          className={cx(
            "rounded-full border px-3 py-1.5 text-[11.5px] font-medium transition-colors duration-150",
            paused
              ? "border-amber-700/50 bg-amber-950/40 text-amber-300"
              : "border-line bg-canvas-raised/40 text-ink-muted hover:text-ink",
          )}
          onClick={() => setPaused((p) => !p)}
        >
          {paused ? "▶ Reanudar" : "⏸ Pausar"}
        </button>

        <button
          type="button"
          className={cx(
            "rounded-full border px-3 py-1.5 text-[11.5px] font-medium transition-colors duration-150",
            autoScroll
              ? "border-emerald-800/40 bg-emerald-950/30 text-emerald-400"
              : "border-line bg-canvas-raised/40 text-ink-muted hover:text-ink",
          )}
          onClick={() => setAutoScroll((a) => !a)}
        >
          ↓ Auto-scroll {autoScroll ? "ON" : "OFF"}
        </button>

        <div className="ml-auto rounded-xl border border-line bg-canvas-deep/40 px-3 py-1.5 text-[11.5px] text-ink-faint">
          <span className="font-semibold text-ink">{visible.length}</span> líneas visibles
          {liveBufferRef.current.length > 0 && (
            <span className="ml-2 text-ink-faint">
              · {liveBufferRef.current.length} en memoria
            </span>
          )}
        </div>
      </div>

      {/* Crash diagnosis panel */}
      <AnimatePresence>
        {showDiagnosis && diagnosis && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <DiagnosisPanel
              diagnosis={diagnosis}
              onClose={() => setShowDiagnosis(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters */}
      <Card padding="tight">
        <div className="flex flex-wrap items-end gap-3">
          <FieldSelect
            label="Nivel"
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="min-w-[180px]"
          >
            <option value="" className="bg-canvas-deep">Todos</option>
            <option value="error">error</option>
            <option value="warn">warn</option>
            <option value="info">info</option>
            <option value="debug">debug</option>
          </FieldSelect>
          <FieldSelect
            label="Origen"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="min-w-[180px]"
          >
            <option value="" className="bg-canvas-deep">Todos</option>
            <option value="launcher">launcher</option>
            <option value="game">game</option>
            <option value="download">download</option>
          </FieldSelect>
          <div className="flex-1">
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.1em] text-ink-faint">
              Buscar
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar por texto…"
              className="w-full rounded-xl border border-line bg-canvas-raised/40 px-3 py-2 text-[12.5px] text-ink placeholder:text-ink-faint focus:border-gold/50 focus:outline-none focus:ring-1 focus:ring-gold/20"
            />
          </div>
        </div>
      </Card>

      {/* Log list */}
      <Card padding="none" className="overflow-hidden">
        <div
          ref={listRef}
          className="scrollbar-thin max-h-[min(65vh,38rem)] overflow-y-auto"
          onScroll={(e) => {
            const el = e.currentTarget;
            const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
            if (!atBottom && autoScroll) setAutoScroll(false);
          }}
        >
          {visible.length === 0 ? (
            <div className="px-6 py-14 text-center text-[12.5px] text-ink-faint">
              {search || levelFilter || sourceFilter
                ? "No hay entradas que coincidan con los filtros."
                : "Sin logs. Inicia Minecraft para ver actividad en tiempo real."}
            </div>
          ) : (
            <ul className="divide-y divide-line/50">
              {visible.map((l) => (
                <LogRow key={`${l.id}-${l.ts}`} entry={l} search={search} />
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function LogRow({ entry: l, search }: { entry: LogEntry; search: string }) {
  const isError = l.level === "error";
  const isWarn = l.level === "warn";

  return (
    <li
      className={cx(
        "grid grid-cols-[80px_56px_68px_1fr] items-start gap-x-3 px-5 py-2 font-mono text-[11.5px] leading-relaxed transition-colors duration-100",
        isError
          ? "bg-red-950/20 hover:bg-red-950/30"
          : isWarn
            ? "bg-amber-950/10 hover:bg-amber-950/20"
            : "hover:bg-canvas-raised/25",
      )}
    >
      <span className="text-ink-faint">
        {new Date(l.ts).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </span>
      <LevelBadge level={l.level} />
      <span className={cx("text-ink-muted", l.source === "game" && "text-sky-400/70")}>
        {l.source}
        {l.stream ? `/${l.stream}` : ""}
      </span>
      <MessageCell message={l.message} search={search} isError={isError} />
    </li>
  );
}

function MessageCell({
  message,
  search,
  isError,
}: {
  message: string;
  search: string;
  isError: boolean;
}) {
  if (!search) {
    return (
      <span
        className={cx(
          "whitespace-pre-wrap break-all",
          isError ? "text-red-300" : "text-ink-soft",
        )}
      >
        {message}
      </span>
    );
  }

  const lower = message.toLowerCase();
  const q = search.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) {
    return <span className="whitespace-pre-wrap break-all text-ink-soft">{message}</span>;
  }

  return (
    <span className="whitespace-pre-wrap break-all text-ink-soft">
      {message.slice(0, idx)}
      <mark className="rounded bg-gold/30 text-gold">{message.slice(idx, idx + q.length)}</mark>
      {message.slice(idx + q.length)}
    </span>
  );
}

function LevelBadge({ level }: { level: string }) {
  const styles =
    level === "error"
      ? "border-red-900/45 bg-red-950/45 text-red-300"
      : level === "warn"
        ? "border-amber-800/45 bg-amber-950/45 text-amber-200"
        : level === "info"
          ? "border-emerald-900/45 bg-emerald-950/40 text-emerald-300"
          : "border-line bg-canvas-raised text-ink-muted";
  return (
    <span
      className={cx(
        "inline-flex w-fit items-center justify-center rounded-md border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.16em]",
        styles,
      )}
    >
      {level}
    </span>
  );
}

function DiagnosisPanel({
  diagnosis,
  onClose,
}: {
  diagnosis: LaunchDiagnosis;
  onClose: () => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-red-900/50 bg-red-950/25 p-5 backdrop-blur-sm">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-lg p-1 text-ink-faint hover:text-ink"
      >
        <IconX width={14} height={14} />
      </button>
      <div className="flex items-start gap-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-900/40">
          <span className="text-[16px]">⚠</span>
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
    </div>
  );
}
