import { useCallback, useEffect, useMemo, useState } from "react";
import { logsClear, logsQuery } from "../services/bridge";
import { Topbar } from "../ui/Topbar";
import { Card } from "../ui/Card";
import { Field, FieldSelect } from "../ui/Field";
import {
  IconCopy,
  IconDownload,
  IconRefresh,
  IconTrash,
} from "../ui/icons";
import { tap } from "../utils/tap";
import { cx } from "../ui/cx";

export function LogsPage() {
  const [level, setLevel] = useState("");
  const [source, setSource] = useState("");
  const [search, setSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [lines, setLines] = useState<
    Array<{
      id: number;
      level: string;
      source: string;
      message: string;
      createdAt: string;
    }>
  >([]);

  const load = useCallback(async () => {
    const r = await logsQuery(500, level || undefined, source || undefined);
    setLines(
      r.map((x) => ({
        id: x.id,
        level: x.level,
        source: x.source,
        message: x.message,
        createdAt: x.createdAt,
      })),
    );
  }, [level, source]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter(
      (l) =>
        l.message.toLowerCase().includes(q) ||
        l.source.toLowerCase().includes(q) ||
        l.level.toLowerCase().includes(q),
    );
  }, [lines, search]);

  const text = filtered
    .map(
      (l) =>
        `${new Date(l.createdAt).toLocaleString("es")} [${l.source}/${l.level}] ${l.message}`,
    )
    .join("\n");

  return (
    <div className="space-y-6">
      <Topbar
        eyebrow="Diagnóstico"
        title="Registros"
        subtitle="Salida del launcher y del juego. Filtra, copia o exporta."
        actions={
          <>
            <button
              type="button"
              className="btn"
              onClick={() => tap("Refrescar registros", async () => load())}
            >
              <IconRefresh width={14} height={14} /> Refrescar
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void navigator.clipboard.writeText(text)}
            >
              <IconCopy width={14} height={14} /> Copiar
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                const b = new Blob([text], { type: "text/plain" });
                const u = URL.createObjectURL(b);
                const a = document.createElement("a");
                a.href = u;
                a.download = "metta-logs.txt";
                a.click();
                URL.revokeObjectURL(u);
              }}
            >
              <IconDownload width={14} height={14} /> Exportar
            </button>
            <button
              type="button"
              className="btn-danger !py-2 !text-[12.5px]"
              onClick={() =>
                tap("Vaciar registros", async () => {
                  if (!confirm("¿Vaciar todos los registros?")) return;
                  await logsClear();
                  await load();
                })
              }
            >
              <IconTrash width={13} height={13} /> Vaciar
            </button>
          </>
        }
      />

      <Card padding="tight">
        <div className="flex flex-wrap items-end gap-3">
          <FieldSelect
            label="Nivel"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="min-w-[200px]"
          >
            <option value="" className="bg-canvas-deep">
              Todos
            </option>
            <option value="error">error</option>
            <option value="warn">warn</option>
            <option value="info">info</option>
          </FieldSelect>
          <FieldSelect
            label="Origen"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="min-w-[200px]"
          >
            <option value="" className="bg-canvas-deep">
              Todos
            </option>
            <option value="launcher">launcher</option>
            <option value="game">game</option>
          </FieldSelect>
          <Field
            label="Buscar"
            placeholder="Filtrar por texto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-[200px] flex-1"
          />
          <label className="flex items-center gap-2 text-[12px] text-ink-muted">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded border-line"
            />
            Autoscroll
          </label>
          <div className="ml-auto rounded-xl border border-line bg-canvas-deep/40 px-3 py-2 text-[11.5px] text-ink-muted">
            <span className="font-display text-[14px] font-semibold text-ink">
              {filtered.length}
            </span>{" "}
            <span className="text-ink-faint">entradas</span>
          </div>
        </div>
      </Card>

      <Card padding="none" className="overflow-hidden">
        <div className="scrollbar-thin max-h-[min(60vh,32rem)] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-6 py-12 text-center text-[12.5px] text-ink-faint">
              No hay entradas que coincidan con los filtros.
            </div>
          ) : (
            <ul className="divide-y divide-line/70">
              {filtered.map((l) => (
                <li
                  key={l.id}
                  className="grid grid-cols-[88px_64px_70px_1fr] items-start gap-3 px-5 py-2.5 font-mono text-[11.5px] leading-relaxed transition-colors duration-150 hover:bg-canvas-raised/30"
                >
                  <span className="text-ink-faint">
                    {new Date(l.createdAt).toLocaleTimeString("es")}
                  </span>
                  <LevelBadge level={l.level} />
                  <span className="text-ink-muted">{l.source}</span>
                  <span
                    className={cx(
                      "whitespace-pre-wrap break-words",
                      l.level === "error"
                        ? "text-red-300"
                        : l.level === "warn"
                          ? "text-amber-200"
                          : "text-ink-soft",
                    )}
                  >
                    {l.message}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
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
