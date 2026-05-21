import { useCallback, useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  cacheClear,
  instanceRepair,
  launcherCheckUpdate,
  networkCheck,
  systemDiagnose,
  type LauncherUpdateInfo,
  type NetworkEndpoint,
  type RepairReport,
  type SystemDiagnostic,
} from "../services/bridge";
import { Topbar } from "../ui/Topbar";
import { Card } from "../ui/Card";
import { tap, toastOk } from "../utils/tap";
import { formatBytes } from "../utils/format";
import { cx } from "../ui/cx";
import { IconRefresh } from "../ui/icons";
import { Toggle } from "../ui/Toggle";

export function DiagnosticsPage() {
  const [diag, setDiag] = useState<SystemDiagnostic | null>(null);
  const [net, setNet] = useState<NetworkEndpoint[]>([]);
  const [update, setUpdate] = useState<LauncherUpdateInfo | null>(null);
  const [includeLogs, setIncludeLogs] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [d, n, u] = await Promise.all([
        systemDiagnose(),
        networkCheck(),
        launcherCheckUpdate(),
      ]);
      setDiag(d);
      setNet(n);
      setUpdate(u);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <Topbar
        eyebrow="Sistema"
        title="Diagnóstico"
        subtitle="Estado del launcher, red, Java y mantenimiento."
        actions={
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => tap("Refrescar", async () => load())}
          >
            <IconRefresh width={14} height={14} /> Refrescar
          </button>
        }
      />

      {diag && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfoTile label="Sistema" value={`${diag.os} · ${diag.arch}`} />
          <InfoTile label="Launcher" value={`v${diag.launcherVersion}`} />
          <InfoTile label="Tauri" value={diag.tauriVersion} />
          <InfoTile label="Carpeta" value={diag.launcherRoot} mono />
          <InfoTile label="Datos app" value={diag.appDataDir} mono />
          <InfoTile
            label="Java detectado"
            value={
              diag.javaCandidates.length
                ? diag.javaCandidates
                    .map((j) => `${j.version ?? "?"} · ${j.path}`)
                    .join("\n")
                : "Ninguno"
            }
            mono
          />
        </div>
      )}

      <Card eyebrow="Red" title="Conectividad">
        <ul className="divide-y divide-line">
          {net.map((e) => (
            <li
              key={e.name}
              className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
            >
              <div>
                <div className="text-[13px] font-medium text-ink">{e.name}</div>
                <div className="truncate font-mono text-[10.5px] text-ink-faint">
                  {e.url}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {e.latencyMs != null && (
                  <span className="text-[11px] text-ink-muted">{e.latencyMs} ms</span>
                )}
                <span
                  className={cx(
                    "rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
                    e.ok
                      ? "border-emerald-800/40 bg-emerald-950/40 text-emerald-300"
                      : "border-red-900/40 bg-red-950/40 text-red-300",
                  )}
                >
                  {e.ok ? "OK" : e.error ?? "Error"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {update && (
        <Card eyebrow="Actualizaciones" title="Launcher">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[13px] text-ink">
                Versión actual:{" "}
                <span className="font-semibold">{update.currentVersion}</span>
                {update.latestVersion && (
                  <>
                    {" "}
                    · Última:{" "}
                    <span className="font-semibold text-gold-300">
                      {update.latestVersion}
                    </span>
                  </>
                )}
              </div>
              {update.updateAvailable && (
                <p className="mt-1 text-[12px] text-gold-200">
                  Hay una versión nueva disponible.
                </p>
              )}
            </div>
            {update.releaseUrl && (
              <button
                type="button"
                className="btn-gold"
                onClick={() => void openUrl(update.releaseUrl!)}
              >
                Ver release
              </button>
            )}
          </div>
          {update.changelog && (
            <pre className="scrollbar-thin mt-4 max-h-40 overflow-auto rounded-xl border border-line bg-canvas-deep/60 p-3 text-[11px] text-ink-muted">
              {update.changelog.slice(0, 1200)}
            </pre>
          )}
        </Card>
      )}

      <Card eyebrow="Mantenimiento" title="Caché y reparación">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[12px] text-ink-muted">
              <Toggle checked={includeLogs} onChange={setIncludeLogs} />
              Incluir logs antiguos (+30 días)
            </label>
          <button
            type="button"
            className="btn"
            onClick={() =>
              tap("Limpiar caché", async () => {
                const r = await cacheClear(includeLogs);
                toastOk(
                  "Caché limpiada",
                  `${r.removedFiles} archivos · ${formatBytes(r.freedBytes)}`,
                );
              })
            }
          >
            Limpiar caché
          </button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function InfoTile({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="glass p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
        {label}
      </div>
      <div
        className={cx(
          "mt-1 whitespace-pre-wrap break-all text-[12.5px] text-ink-soft",
          mono && "font-mono text-[11px]",
        )}
      >
        {value}
      </div>
    </div>
  );
}

export async function runInstanceRepair(
  instancePath: string,
  minecraftVersion: string,
): Promise<RepairReport> {
  return instanceRepair(instancePath, minecraftVersion);
}
