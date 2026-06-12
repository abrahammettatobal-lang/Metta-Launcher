/**
 * Launch progress system.
 * Allows launchInstance to emit structured progress steps to the UI.
 */

export type LaunchPhase =
  | "idle"
  | "preparing"
  | "java"
  | "libraries"
  | "assets"
  | "natives"
  | "loader"
  | "starting"
  | "running"
  | "done"
  | "error";

export interface LaunchProgress {
  phase: LaunchPhase;
  label: string;
  /** 0-100 overall progress. null = indeterminate */
  percent: number | null;
  detail?: string;
}

// ─── LaunchProfiler ──────────────────────────────────────────────────────────

export interface LaunchTiming {
  stage: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
}

class LaunchProfiler {
  private timings: Map<string, LaunchTiming> = new Map();
  private order: string[] = [];

  start(stage: string): void {
    this.timings.set(stage, { stage, startedAt: performance.now() });
    if (!this.order.includes(stage)) this.order.push(stage);
  }

  end(stage: string): void {
    const t = this.timings.get(stage);
    if (!t) return;
    t.endedAt = performance.now();
    t.durationMs = Math.round(t.endedAt - t.startedAt);
  }

  /** Format all completed timings as log lines. */
  summary(): string[] {
    return this.order
      .map((s) => this.timings.get(s))
      .filter((t): t is LaunchTiming => !!t?.durationMs)
      .map((t) => `[LaunchProfiler] ${t.stage}: ${t.durationMs}ms`);
  }

  reset(): void {
    this.timings.clear();
    this.order = [];
  }

  getAll(): LaunchTiming[] {
    return this.order
      .map((s) => this.timings.get(s))
      .filter((t): t is LaunchTiming => !!t);
  }
}

export const profiler = new LaunchProfiler();

// ─── Progress pub/sub ─────────────────────────────────────────────────────────

type ProgressListener = (p: LaunchProgress) => void;

const listeners = new Set<ProgressListener>();

let _current: LaunchProgress = { phase: "idle", label: "", percent: null };
let _abortFlag = false;

export function abortLaunch(): void {
  _abortFlag = true;
}

export function isLaunchAborted(): boolean {
  return _abortFlag;
}

export function resetAbortFlag(): void {
  _abortFlag = false;
}

export function subscribeLaunchProgress(cb: ProgressListener): () => void {
  listeners.add(cb);
  cb(_current); // emit current state immediately
  return () => listeners.delete(cb);
}

export function emitLaunchProgress(p: LaunchProgress): void {
  _current = p;
  listeners.forEach((cb) => cb(p));
}

export function resetLaunchProgress(): void {
  profiler.reset();
  emitLaunchProgress({ phase: "idle", label: "", percent: null });
}

// ─── Phase helpers ────────────────────────────────────────────────────────────

export function progressPreparing(detail?: string): void {
  emitLaunchProgress({ phase: "preparing", label: "Preparando…", percent: 2, detail });
}

export function progressJava(detail?: string): void {
  emitLaunchProgress({ phase: "java", label: "Verificando Java…", percent: 5, detail });
}

export function progressLibraries(detail?: string, done?: number, total?: number): void {
  let percent = 30;
  if (done !== undefined && total !== undefined && total > 0) {
    percent = 22 + Math.round((done / total) * 10);
  }
  emitLaunchProgress({
    phase: "libraries",
    label: "Descargando librerías…",
    percent,
    detail,
  });
}

export function progressAssets(done: number, total: number, detail?: string): void {
  const pct = total > 0 ? Math.round(5 + (done / total) * 55) : null;
  emitLaunchProgress({
    phase: "assets",
    label: "Descargando recursos…",
    percent: pct,
    detail: detail ?? `${done} / ${total}`,
  });
}

export function progressNatives(detail?: string): void {
  emitLaunchProgress({ phase: "natives", label: "Extrayendo nativos…", percent: 82, detail });
}

export function progressLoader(detail?: string): void {
  emitLaunchProgress({ phase: "loader", label: "Instalando loader…", percent: 88, detail });
}

export function progressStarting(detail?: string): void {
  emitLaunchProgress({ phase: "starting", label: "Iniciando juego…", percent: 96, detail });
}

export function progressRunning(): void {
  emitLaunchProgress({ phase: "running", label: "Juego en ejecución", percent: 100 });
}

export function progressError(detail: string): void {
  emitLaunchProgress({ phase: "error", label: "Error al lanzar", percent: null, detail });
}
