import { openPath } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  appPaths,
  dirDiskUsage,
  instanceDelete,
  instanceGet,
  instanceSave,
  instancesList,
} from "../services/bridge";
import type { InstanceRow } from "../services/bridge";
import { prepareNewInstancePaths } from "../services/launchInstance";
import { Topbar } from "../ui/Topbar";
import { Avatar } from "../ui/Avatar";
import { Empty } from "../ui/Empty";
import {
  IconCopy,
  IconCubes,
  IconFolder,
  IconPlus,
  IconTrash,
} from "../ui/icons";
import { tap } from "../utils/tap";
import { fullPath } from "../utils/full-path";
import { formatBytes, loaderLabel, relativeTime } from "../utils/format";

export function InstancesPage() {
  const [rows, setRows] = useState<InstanceRow[]>([]);
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const nav = useNavigate();

  const reload = useCallback(async () => {
    const r = await instancesList();
    setRows(r);
    const m: Record<string, number> = {};
    for (const i of r) {
      try {
        m[i.id] = await dirDiskUsage(i.instancePath);
      } catch {
        m[i.id] = 0;
      }
    }
    setSizes(m);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="space-y-6">
      <Topbar
        eyebrow="Biblioteca"
        title="Instancias"
        subtitle="Gestiona, duplica o elimina los mundos que has configurado."
        actions={
          <button
            type="button"
            onClick={() => nav("/create")}
            className="btn-gold"
          >
            <IconPlus width={14} height={14} />
            Nueva instancia
          </button>
        }
      />

      {rows.length === 0 ? (
        <Empty
          icon={<IconCubes width={22} height={22} />}
          title="Tu biblioteca está vacía"
          description="Crea tu primera instancia y elige versión, loader y memoria."
          action={
            <button
              type="button"
              onClick={() => nav("/create")}
              className="btn-gold"
            >
              <IconPlus width={14} height={14} /> Crear instancia
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((i, idx) => (
            <motion.div
              key={i.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, delay: idx * 0.04 }}
              className="group glass relative overflow-hidden p-5 transition-all duration-300 ease-soft hover:-translate-y-0.5 hover:border-gold-500/30 hover:shadow-floating"
            >
              <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gold-500/10 opacity-0 blur-3xl transition-opacity duration-300 group-hover:opacity-100" />

              <div className="flex items-start gap-3">
                <Avatar name={i.name} size={46} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display text-[15px] font-semibold tracking-tight text-ink">
                    {i.name}
                  </div>
                  <div className="mt-0.5 truncate text-[11.5px] text-ink-faint">
                    {loaderLabel(i.loaderType, i.loaderVersion)} ·{" "}
                    {i.minecraftVersion}
                  </div>
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
                <Meta label="RAM" value={`${i.maxRamMb}M`} />
                <Meta
                  label="Tamaño"
                  value={formatBytes(sizes[i.id] ?? 0)}
                />
                <Meta label="Jugado" value={relativeTime(i.lastPlayedAt)} />
              </dl>

              <div className="mt-5 flex flex-wrap items-center gap-1.5 border-t border-line pt-4">
                <button
                  type="button"
                  className="btn-ghost text-[11.5px]"
                  onClick={() =>
                    tap("Abrir carpeta", async () => {
                      const p = await fullPath(i.instancePath);
                      await openPath(p);
                    })
                  }
                >
                  <IconFolder width={13} height={13} /> Carpeta
                </button>
                <button
                  type="button"
                  className="btn-ghost text-[11.5px]"
                  onClick={() =>
                    tap("Duplicar instancia", async () => {
                      const base = await instanceGet(i.id);
                      if (!base) return;
                      const nid = crypto.randomUUID();
                      const copy: InstanceRow = {
                        ...base,
                        id: nid,
                        name: `${base.name} (copia)`,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                      };
                      const prep = await prepareNewInstancePaths(
                        (await appPaths()).launcherRoot,
                        copy,
                      );
                      await instanceSave(prep);
                      await reload();
                    })
                  }
                >
                  <IconCopy width={13} height={13} /> Duplicar
                </button>
                <button
                  type="button"
                  className="btn-danger ml-auto"
                  onClick={() =>
                    tap("Eliminar instancia", async () => {
                      if (!confirm(`¿Eliminar “${i.name}”?`)) return;
                      await instanceDelete(i.id);
                      await reload();
                    })
                  }
                >
                  <IconTrash width={13} height={13} /> Eliminar
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-canvas-deep/40 px-2.5 py-2">
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
        {label}
      </div>
      <div className="mt-0.5 truncate font-display text-[12.5px] font-semibold text-ink">
        {value}
      </div>
    </div>
  );
}
