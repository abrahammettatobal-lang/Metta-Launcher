import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { open } from "@tauri-apps/plugin-dialog";
import {
  importModpackFromPath,
  importModpackFromZip,
  isImportableModpack,
  parseModpackMeta,
  readModpackManifest,
  detectModpack,
  type ModpackImportProgress,
} from "../../services/minecraft/curseforgeModpackService";
import { modpackInspectZip } from "../../services/bridge";
import { parseBundledDetectMeta } from "../../services/minecraft/bundledModpackService";
import { cx } from "../../ui/cx";

async function defaultInstanceName(
  path: string,
  fallback: string,
): Promise<string> {
  try {
    const inspected = await modpackInspectZip(path).catch(() => null);
    if (inspected?.kind === "bundled") {
      const meta = parseBundledDetectMeta(inspected);
      return meta.suggestedName || fallback;
    }
  } catch {
    /* folder or unreadable zip */
  }

  try {
    const detected = await detectModpack(path);
    if (detected.kind === "bundled") {
      const meta = parseBundledDetectMeta(detected);
      return meta.suggestedName || fallback;
    }
    const manifest = await readModpackManifest(detected.packRoot);
    const meta = parseModpackMeta(manifest);
    return `${meta.name} ${meta.version}`.trim() || fallback;
  } catch {
    return fallback;
  }
}

export function useModpackImport() {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ModpackImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function importModpackFolder(path: string, suggestedName: string) {
    const defaultName = await defaultInstanceName(path, suggestedName);
    const name =
      prompt("Nombre de la instancia:", defaultName)?.trim() || defaultName;
    const row = await importModpackFromPath(path, name, setProgress);
    nav(`/instances/${row.id}/edit`);
  }

  async function importModpackZip(path: string, suggestedName: string) {
    const defaultName = await defaultInstanceName(path, suggestedName);
    const name =
      prompt("Nombre de la instancia:", defaultName)?.trim() || defaultName;
    const row = await importModpackFromZip(path, name, setProgress);
    nav(`/instances/${row.id}/edit`);
  }

  async function pickFolder() {
    const picked = await open({ directory: true, multiple: false });
    if (!picked || Array.isArray(picked)) return;
    const base =
      picked.split(/[/\\]/).pop()?.replace(/\.zip$/i, "") ?? "Modpack";
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      const ok = await isImportableModpack(picked);
      if (!ok) {
        throw new Error(
          "No se reconoció el modpack: necesita manifest.json (CurseForge) o una carpeta mods/ con archivos .jar.",
        );
      }
      await importModpackFolder(picked, base);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setProgress({ phase: "error", message: msg, current: 0, total: 0 });
    } finally {
      setBusy(false);
    }
  }

  async function pickZip() {
    const picked = await open({
      multiple: false,
      filters: [{ name: "Modpack / ZIP", extensions: ["zip"] }],
    });
    if (!picked || Array.isArray(picked)) return;
    const base =
      picked.split(/[/\\]/).pop()?.replace(/\.zip$/i, "") ?? "Modpack";
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      await importModpackZip(picked, base);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setProgress({ phase: "error", message: msg, current: 0, total: 0 });
    } finally {
      setBusy(false);
    }
  }

  return { busy, progress, error, pickFolder, pickZip };
}

export function ModpackImportProgressBar({
  progress,
  error,
}: {
  progress: ModpackImportProgress | null;
  error: string | null;
}) {
  if (!progress && !error) return null;
  const pct =
    progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : progress?.phase === "done"
        ? 100
        : null;

  return (
    <div
      className={cx(
        "rounded-xl border px-3 py-2 text-[12px]",
        error || progress?.phase === "error"
          ? "border-red-500/40 bg-red-500/10 text-red-100"
          : "border-line bg-canvas-deep/40 text-ink-muted",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span>{error ?? progress?.message ?? "Importando…"}</span>
        {pct !== null && (
          <span className="tabular-nums text-gold-300">{pct}%</span>
        )}
      </div>
      {pct !== null && progress?.phase === "mods" && (
        <div className="progress-track mt-2 h-1.5">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
