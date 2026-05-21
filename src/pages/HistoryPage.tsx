import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { launchHistoryList, type LaunchHistoryRow } from "../services/bridge";
import { Topbar } from "../ui/Topbar";
import { Card } from "../ui/Card";
import { Empty } from "../ui/Empty";
import { IconClock, IconRefresh } from "../ui/icons";
import { tap } from "../utils/tap";
import { relativeTime } from "../utils/format";

export function HistoryPage() {
  const [rows, setRows] = useState<LaunchHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await launchHistoryList(50));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const successCount = rows.filter((r) => r.success).length;

  return (
    <div className="space-y-6">
      <Topbar
        eyebrow="Actividad"
        title="Historial de juego"
        subtitle="Sesiones recientes, duración y código de salida de cada lanzamiento."
        actions={
          <button type="button" className="btn" onClick={() => void tap("Recargar", reload)}>
            <IconRefresh width={14} height={14} /> Recargar
          </button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Sesiones" value={String(rows.length)} />
        <Stat label="Completadas" value={String(successCount)} />
        <Stat
          label="Tasa éxito"
          value={
            rows.length
              ? `${Math.round((successCount / rows.length) * 100)}%`
              : "—"
          }
        />
      </div>

      {loading ? (
        <Card padding="tight">
          <p className="text-[13px] text-ink-muted">Cargando historial…</p>
        </Card>
      ) : rows.length === 0 ? (
        <Empty
          icon={<IconClock width={22} height={22} />}
          title="Sin sesiones registradas"
          description="Cuando lances Minecraft desde Metta, cada partida aparecerá aquí con hora de inicio y fin."
        />
      ) : (
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>Instancia</th>
                <th>Inicio</th>
                <th>Fin</th>
                <th>Duración</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <motion.tr
                  key={r.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: idx * 0.012 }}
                >
                  <td>
                    <div className="text-[13px] font-medium text-ink">
                      {r.instanceName ?? r.instanceId.slice(0, 8)}
                    </div>
                  </td>
                  <td className="text-[12px] text-ink-soft">
                    {formatWhen(r.startedAt)}
                  </td>
                  <td className="text-[12px] text-ink-soft">
                    {r.finishedAt ? formatWhen(r.finishedAt) : "—"}
                  </td>
                  <td className="text-[12px] text-ink-soft">
                    {durationLabel(r.startedAt, r.finishedAt)}
                  </td>
                  <td>
                    <span
                      className={
                        r.success
                          ? "pill-gold text-[10px]"
                          : "rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-300"
                      }
                    >
                      {r.success
                        ? "OK"
                        : r.exitCode != null
                          ? `Salida ${r.exitCode}`
                          : "Interrumpido"}
                    </span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card padding="tight">
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
        {label}
      </div>
      <div className="font-display text-[18px] font-semibold tracking-tight text-ink">
        {value}
      </div>
    </Card>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString()} · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function durationLabel(start: string, end: string | null): string {
  if (!end) return relativeTime(start);
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0 || Number.isNaN(ms)) return "—";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
