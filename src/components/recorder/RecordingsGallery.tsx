import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { convertFileSrc } from "@tauri-apps/api/core";
import { formatBytes } from "../../utils/format";
import type { RecordingItem } from "../../services/recorder/recordingsService";
import { formatDuration } from "../../services/recorder/recorderService";
import { IconFolder, IconTrash } from "../../ui/icons";

interface RecordingsGalleryProps {
  items: RecordingItem[];
  loading: boolean;
  onOpen: (path: string) => void;
  onReveal: (path: string) => void;
  onRename: (path: string, name: string) => void;
  onDelete: (path: string) => void;
  onShare: (path: string) => void;
}

type SortMode = "newest" | "oldest" | "largest" | "name";

export function RecordingsGallery({
  items,
  loading,
  onOpen,
  onReveal,
  onRename,
  onDelete,
  onShare,
}: RecordingsGalleryProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("newest");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = q
      ? items.filter((i) => i.name.toLowerCase().includes(q))
      : [...items];
    list.sort((a, b) => {
      switch (sort) {
        case "oldest":
          return a.createdAt.localeCompare(b.createdAt);
        case "largest":
          return b.sizeBytes - a.sizeBytes;
        case "name":
          return a.name.localeCompare(b.name, "es");
        case "newest":
        default:
          return b.createdAt.localeCompare(a.createdAt);
      }
    });
    return list;
  }, [items, query, sort]);

  const totalBytes = items.reduce((sum, i) => sum + i.sizeBytes, 0);

  if (loading) {
    return (
      <div className="rounded-2xl border border-line/70 bg-canvas-card/40 p-6 text-[13px] text-ink-muted">
        Cargando grabaciones…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line/80 bg-canvas-card/20 p-8 text-center">
        <p className="text-[14px] font-medium text-ink">Sin grabaciones aún</p>
        <p className="mt-1 text-[12px] text-ink-muted">
          Tus videos aparecerán aquí con miniatura, duración y acciones rápidas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="field min-w-[200px] flex-1"
          placeholder="Buscar por nombre…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="field w-auto"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
        >
          <option value="newest">Más recientes</option>
          <option value="oldest">Más antiguas</option>
          <option value="largest">Más pesadas</option>
          <option value="name">Nombre A–Z</option>
        </select>
        <span className="text-[11px] text-ink-faint">
          {filtered.length} de {items.length} · {formatBytes(totalBytes)}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-[12px] text-ink-muted">
          Ninguna grabación coincide con «{query}».
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item, idx) => (
            <motion.article
              key={item.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(idx, 8) * 0.03 }}
              className="group overflow-hidden rounded-2xl border border-line/70 bg-canvas-card/50 transition hover:border-gold-500/30"
            >
              <button
                type="button"
                className="relative block aspect-video w-full bg-canvas-deep text-left"
                onClick={() => onOpen(item.path)}
              >
                {item.thumbPath ? (
                  <img
                    src={convertFileSrc(item.thumbPath)}
                    alt=""
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[11px] uppercase tracking-[0.2em] text-ink-faint">
                    Sin miniatura
                  </div>
                )}
                {item.durationSecs != null && (
                  <span className="absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 font-mono text-[10px] text-ink">
                    {formatDuration(Math.round(item.durationSecs))}
                  </span>
                )}
              </button>
              <div className="space-y-2 p-3">
                <div className="truncate text-[13px] font-medium text-ink">
                  {item.name}
                </div>
                <div className="flex flex-wrap gap-2 text-[10px] text-ink-muted">
                  <span>{new Date(item.createdAt).toLocaleString("es")}</span>
                  <span>{formatBytes(item.sizeBytes)}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <MiniBtn onClick={() => onOpen(item.path)}>Abrir</MiniBtn>
                  <MiniBtn onClick={() => onReveal(item.path)}>
                    <IconFolder width={12} height={12} /> Carpeta
                  </MiniBtn>
                  <MiniBtn
                    onClick={() => {
                      const next = prompt(
                        "Nuevo nombre",
                        item.name.replace(/\.[^.]+$/, ""),
                      );
                      if (next) onRename(item.path, next);
                    }}
                  >
                    Renombrar
                  </MiniBtn>
                  <MiniBtn onClick={() => onShare(item.path)}>Copiar ruta</MiniBtn>
                  <MiniBtn
                    danger
                    onClick={() => {
                      if (
                        confirm(
                          `¿Eliminar permanentemente «${item.name}»?`,
                        )
                      ) {
                        onDelete(item.path);
                      }
                    }}
                  >
                    <IconTrash width={12} height={12} />
                  </MiniBtn>
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniBtn({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={
        danger
          ? "inline-flex items-center gap-1 rounded-lg border border-red-500/30 px-2 py-1 text-[10px] text-red-300 hover:bg-red-500/10"
          : "inline-flex items-center gap-1 rounded-lg border border-line/70 px-2 py-1 text-[10px] text-ink-soft hover:border-gold-500/30 hover:text-gold-200"
      }
      onClick={onClick}
    >
      {children}
    </button>
  );
}
