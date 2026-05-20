import { openPath } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { instancesList } from "../services/bridge";
import type { InstanceRow } from "../services/bridge";
import {
  deleteMod,
  listMods,
  modFolderDisk,
  setModEnabled,
  type ModEntry,
} from "../services/modsService";
import { Topbar } from "../ui/Topbar";
import { Card } from "../ui/Card";
import { FieldSelect } from "../ui/Field";
import { Toggle } from "../ui/Toggle";
import { Empty } from "../ui/Empty";
import {
  IconFolder,
  IconPuzzle,
  IconRefresh,
  IconTrash,
} from "../ui/icons";
import { tap } from "../utils/tap";
import { fullPath } from "../utils/full-path";
import { formatBytes } from "../utils/format";

export function ModsPage() {
  const [instances, setInstances] = useState<InstanceRow[]>([]);
  const [sel, setSel] = useState("");
  const [mods, setMods] = useState<ModEntry[]>([]);
  const [sz, setSz] = useState(0);
  const [query, setQuery] = useState("");

  useEffect(() => {
    void instancesList().then((r) => {
      setInstances(r);
      if (r[0]) setSel(r[0].id);
    });
  }, []);

  const cur = instances.find((i) => i.id === sel);

  const reloadMods = useCallback(async () => {
    if (!cur) return;
    setMods(await listMods(cur.instancePath));
    setSz(await modFolderDisk(cur.instancePath));
  }, [cur]);

  useEffect(() => {
    void reloadMods();
  }, [reloadMods]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mods;
    return mods.filter((m) => m.fileName.toLowerCase().includes(q));
  }, [mods, query]);

  const enabledCount = mods.filter((m) => m.enabled).length;

  return (
    <div className="space-y-6">
      <Topbar
        eyebrow="Mods"
        title="Gestor de mods"
        subtitle="Activa, desactiva o elimina mods de tus instancias."
        actions={
          <>
            <button
              type="button"
              className="btn"
              onClick={() =>
                tap("Recargar", async () => {
                  await reloadMods();
                })
              }
            >
              <IconRefresh width={14} height={14} /> Recargar
            </button>
            <button
              type="button"
              className="btn"
              onClick={() =>
                tap("Abrir carpeta mods", async () => {
                  if (!cur) return;
                  const p = await fullPath(`${cur.instancePath}/mods`);
                  await openPath(p);
                })
              }
            >
              <IconFolder width={14} height={14} /> Abrir carpeta
            </button>
          </>
        }
      />

      <Card padding="tight">
        <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
          <FieldSelect
            label="Instancia"
            value={sel}
            onChange={(e) => setSel(e.target.value)}
            className="min-w-[220px] flex-1"
          >
            {instances.map((i) => (
              <option key={i.id} value={i.id} className="bg-canvas-deep">
                {i.name}
              </option>
            ))}
          </FieldSelect>
          <div className="flex-1">
            <label className="block">
              <span className="field-label">Buscar</span>
              <input
                className="field"
                placeholder="Nombre del .jar…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <Stat label="Activos" value={String(enabledCount)} />
            <Stat label="Tamaño" value={formatBytes(sz)} />
          </div>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Empty
          icon={<IconPuzzle width={22} height={22} />}
          title={query ? "Sin coincidencias" : "Sin mods en esta instancia"}
          description={
            query
              ? "Ajusta tu búsqueda o cambia de instancia."
              : "Arrastra .jar a la carpeta mods o cámbiala desde el botón."
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>Archivo</th>
                <th className="!text-right">Tamaño</th>
                <th className="w-[120px]">Activo</th>
                <th className="w-[110px]" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((m, idx) => (
                <motion.tr
                  key={m.relPath}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: idx * 0.012 }}
                >
                  <td>
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-canvas-deep/60 text-gold-300">
                        <IconPuzzle width={14} height={14} />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium text-ink">
                          {m.fileName.replace(/\.jar$/i, "")}
                        </div>
                        <div className="truncate font-mono text-[10.5px] text-ink-faint">
                          {m.fileName}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="!text-right text-[12px] text-ink-soft">
                    {formatBytes(m.size)}
                  </td>
                  <td>
                    <Toggle
                      checked={m.enabled}
                      onChange={(v) =>
                        void tap("Mod", async () => {
                          if (!cur) return;
                          await setModEnabled(
                            cur.instancePath,
                            m.fileName,
                            v,
                          );
                          await reloadMods();
                        })
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() =>
                        tap("Eliminar mod", async () => {
                          await deleteMod(m.relPath);
                          await reloadMods();
                        })
                      }
                    >
                      <IconTrash width={12} height={12} /> Eliminar
                    </button>
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
    <div className="rounded-xl border border-line bg-canvas-deep/40 px-3 py-2">
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
        {label}
      </div>
      <div className="font-display text-[14px] font-semibold tracking-tight text-ink">
        {value}
      </div>
    </div>
  );
}
