import { NavLink, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useState } from "react";
import {
  accountAddOffline,
  accountDelete,
  accountSetActive,
  accountsList,
  appPaths,
  dirDiskUsage,
  instanceDelete,
  instanceGet,
  instanceSave,
  instancesList,
  javaDetect,
  launcherSetRoot,
  logAppend,
  logsClear,
  logsQuery,
  microsoftDevicePoll,
  microsoftDeviceStart,
  settingGet,
  settingSet,
} from "./services/bridge";
import type { AccountRow, InstanceRow, LoaderType } from "./services/bridge";
import { launchInstance, prepareNewInstancePaths } from "./services/launchInstance";
import { listForgeVersions, listNeoForgeVersions } from "./services/launchInstance";
import { fetchFabricLoaderVersions } from "./services/minecraft/fabricMeta";
import { fetchVersionManifest } from "./services/minecraft/versionManifestService";
import {
  subscribeDownloadProgress,
  subscribeGameExit,
  subscribeGameLog,
} from "./services/downloads/downloadEvents";
import { deleteMod, listMods, modFolderDisk, setModEnabled } from "./services/modsService";
import type { ModEntry } from "./services/modsService";
import { tap } from "./utils/tap";

function cx(...xs: Array<string | false | undefined>) {
  return xs.filter(Boolean).join(" ");
}

async function fullPath(rel: string): Promise<string> {
  const { launcherRoot } = await appPaths();
  const a = launcherRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  const b = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  return `${a}/${b}`;
}

function Shell({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  const nav = [
    ["/", "Inicio"],
    ["/instances", "Instancias"],
    ["/create", "Nueva"],
    ["/mods", "Mods"],
    ["/accounts", "Cuentas"],
    ["/logs", "Registros"],
    ["/settings", "Ajustes"],
  ];
  return (
    <div className="ui-shell text-ink">
      <aside className="ui-rail">
        <div className="ui-rail-brand">
          <div className="ui-rail-mark">Metta</div>
          <div className="ui-rail-tag">Launcher</div>
        </div>
        <nav className="ui-nav">
          {nav.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cx(
                  "ui-nav-link",
                  (isActive || (to !== "/" && loc.pathname.startsWith(to))) && "ui-nav-link-active",
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="ui-stage">
        <div className="ui-stage-inner">{children}</div>
      </main>
    </div>
  );
}

export function App() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <Routes>
        <Route element={<ShellLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="instances" element={<Instances />} />
          <Route path="create" element={<CreateInstance />} />
          <Route path="mods" element={<ModsPage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

function ShellLayout() {
  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}

function Dashboard() {
  const [instances, setInstances] = useState<InstanceRow[]>([]);
  const [sel, setSel] = useState<string>("");
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [dl, setDl] = useState<string>("");
  const [logTail, setLogTail] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [i, a] = await Promise.all([instancesList(), accountsList()]);
    setInstances(i);
    setAccounts(a);
    if (!sel && i[0]) setSel(i[0].id);
    const logs = await logsQuery(12, undefined, "launcher");
    setLogTail(
      logs
        .map((l) => `${l.createdAt} [${l.level}] ${l.message}`)
        .join("\n"),
    );
  }, [sel]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let u: (() => void) | undefined;
    void subscribeDownloadProgress((p) => {
      setDl(`${p.state} ${p.destPath} ${p.received}/${p.total ?? "?"}`);
    }).then((fn) => {
      u = fn;
    });
    return () => u?.();
  }, []);

  useEffect(() => {
    let a: (() => void) | undefined;
    let b: (() => void) | undefined;
    void subscribeGameLog((l) => {
      void logAppend("game", "info", `[${l.stream}] ${l.line}`, sel || undefined);
    }).then((x) => {
      a = x;
    });
    void subscribeGameExit((e) => {
      void logAppend(
        "launcher",
        e.success ? "info" : "error",
        `Juego terminado code=${e.code}`,
        sel || undefined,
      );
      setBusy(false);
    }).then((y) => {
      b = y;
    });
    return () => {
      a?.();
      b?.();
    };
  }, [sel]);

  const cur = instances.find((x) => x.id === sel);
  const activeAcc = accounts.find((x) => x.isActive);

  return (
    <div className="space-y-8">
      <header className="page-head">
        <div>
          <h1 className="page-title">Inicio</h1>
          <p className="page-desc">Elige instancia, revisa la cuenta activa y lanza el juego.</p>
        </div>
        <button
          type="button"
          disabled={busy || !cur || !activeAcc}
          onClick={() =>
            tap("Jugar", async () => {
              if (!cur) return;
              setBusy(true);
              try {
                await launchInstance(cur.id);
              } finally {
                setBusy(false);
              }
            })
          }
          className="ui-btn-play"
        >
          Jugar
        </button>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="ui-card">
          <h2 className="ui-section-title">Instancia</h2>
          <select
            className="ui-input mb-4"
            value={sel}
            onChange={(e) => setSel(e.target.value)}
          >
            {instances.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          {cur ? (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-faint">Minecraft</dt>
                <dd>{cur.minecraftVersion}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-faint">Loader</dt>
                <dd>
                  {cur.loaderType} {cur.loaderVersion}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-faint">RAM</dt>
                <dd>
                  {cur.minRamMb}-{cur.maxRamMb} MB
                </dd>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="ui-btn-sm"
                  onClick={() =>
                    tap("Abrir carpeta", async () => {
                      const p = await fullPath(cur.instancePath);
                      await openPath(p);
                    })
                  }
                >
                  Carpeta
                </button>
                <button
                  type="button"
                  className="ui-btn-sm"
                  onClick={() =>
                    tap("Abrir mods", async () => {
                      const p = await fullPath(`${cur.instancePath}/mods`);
                      await openPath(p);
                    })
                  }
                >
                  Mods
                </button>
                <button
                  type="button"
                  className="ui-btn-sm"
                  onClick={() =>
                    tap("Abrir config", async () => {
                      const p = await fullPath(`${cur.instancePath}/config`);
                      await openPath(p);
                    })
                  }
                >
                  Config
                </button>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-ink-muted">Crea una instancia primero.</p>
          )}
        </section>

        <section className="ui-card">
          <h2 className="ui-section-title">Cuenta activa</h2>
          {activeAcc ? (
            <div className="text-sm">
              <div className="font-medium text-ink">{activeAcc.username}</div>
              <div className="text-ink-muted">
                {activeAcc.kind} · {activeAcc.uuid}
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">Añade una cuenta Microsoft o local.</p>
          )}
          <h2 className="ui-section-title mt-8">Descargas</h2>
          <p className="truncate font-mono text-xs text-ink-faint">{dl || "Sin actividad"}</p>
          <h2 className="ui-section-title mt-6">Registro launcher</h2>
          <pre className="ui-log">
            {logTail || "—"}
          </pre>
        </section>
      </div>
    </div>
  );
}

function Instances() {
  const [rows, setRows] = useState<InstanceRow[]>([]);
  const [sizes, setSizes] = useState<Record<string, number>>({});

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
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Instancias</h1>
      <div className="space-y-3">
        {rows.map((i) => (
          <div
            key={i.id}
            className="ui-card flex flex-wrap items-center justify-between gap-3"
          >
            <div>
              <div className="font-medium text-ink">{i.name}</div>
              <div className="text-xs text-ink-faint">
                {i.minecraftVersion} · {i.loaderType} {i.loaderVersion}
              </div>
              <div className="text-xs text-ink-muted">
                {(sizes[i.id] / (1024 * 1024)).toFixed(1)} MB
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="ui-btn-sm"
                onClick={() =>
                  tap("Abrir carpeta", async () => {
                    const p = await fullPath(i.instancePath);
                    await openPath(p);
                  })
                }
              >
                Carpeta
              </button>
              <button
                type="button"
                className="ui-btn-sm"
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
                    const prep = await prepareNewInstancePaths((await appPaths()).launcherRoot, copy);
                    await instanceSave(prep);
                    await reload();
                  })
                }
              >
                Duplicar
              </button>
              <button
                type="button"
            className="ui-btn-danger"
                onClick={() =>
                  tap("Eliminar instancia", async () => {
                    if (!confirm("Eliminar instancia?")) return;
                    await instanceDelete(i.id);
                    await reload();
                  })
                }
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CreateInstance() {
  const [name, setName] = useState("Nueva instancia");
  const [mc, setMc] = useState("");
  const [versions, setVersions] = useState<string[]>([]);
  const [loader, setLoader] = useState<LoaderType>("vanilla");
  const [lv, setLv] = useState("");
  const [forgeList, setForgeList] = useState<string[]>([]);
  const [neoList, setNeoList] = useState<string[]>([]);
  const [fabList, setFabList] = useState<string[]>([]);
  const [ramMin, setRamMin] = useState(512);
  const [ramMax, setRamMax] = useState(4096);
  const [icon, setIcon] = useState("default");

  useEffect(() => {
    void fetchVersionManifest().then((m) => {
      const ids = m.versions.map((v) => v.id).slice(0, 80);
      setVersions(ids);
      if (!mc && ids[0]) setMc(ids[0]);
    });
  }, [mc]);

  useEffect(() => {
    if (!mc) return;
    if (loader === "forge")
      void listForgeVersions(mc).then(setForgeList).catch(() => setForgeList([]));
    if (loader === "neoforge") void listNeoForgeVersions().then(setNeoList).catch(() => setNeoList([]));
    if (loader === "fabric")
      void fetchFabricLoaderVersions().then(setFabList).catch(() => setFabList([]));
  }, [mc, loader]);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="page-head mb-0 border-0 pb-0">
        <h1 className="page-title text-2xl">Nueva instancia</h1>
        <p className="page-desc">Versión de Minecraft, mod loader y memoria asignada.</p>
      </div>
      <label className="block text-sm">
        <span className="ui-field-label">Nombre</span>
        <input
          className="ui-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        <span className="ui-field-label">Minecraft</span>
        <select
          className="ui-input"
          value={mc}
          onChange={(e) => setMc(e.target.value)}
        >
          {versions.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="ui-field-label">Loader</span>
        <select
          className="ui-input"
          value={loader}
          onChange={(e) => setLoader(e.target.value as LoaderType)}
        >
          <option value="vanilla">Vanilla</option>
          <option value="fabric">Fabric</option>
          <option value="forge">Forge</option>
          <option value="neoforge">NeoForge</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="ui-field-label">Version del loader</span>
        <select
          className="ui-input"
          value={lv}
          onChange={(e) => setLv(e.target.value)}
        >
          <option value="">Selecciona…</option>
          {(loader === "forge"
            ? forgeList
            : loader === "neoforge"
              ? neoList
              : loader === "fabric"
                ? fabList
                : [mc]
          ).map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="ui-field-label">RAM min MB</span>
          <input
            type="number"
            className="ui-input"
            value={ramMin}
            onChange={(e) => setRamMin(Number(e.target.value))}
          />
        </label>
        <label className="text-sm">
          <span className="ui-field-label">RAM max MB</span>
          <input
            type="number"
            className="ui-input"
            value={ramMax}
            onChange={(e) => setRamMax(Number(e.target.value))}
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="ui-field-label">Icono / color</span>
        <input
          className="ui-input"
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="w-full ui-btn-primary py-3.5"
        onClick={() =>
          tap("Crear instancia", async () => {
            const id = crypto.randomUUID();
            const root = (await appPaths()).launcherRoot;
            const loaderVersion =
              loader === "vanilla" ? mc : lv || (loader === "fabric" ? fabList[0] ?? "" : "");
            if (loader !== "vanilla" && !loaderVersion) {
              alert("Selecciona version de loader");
              return;
            }
            const row: InstanceRow = {
              id,
              name,
              minecraftVersion: mc,
              loaderType: loader,
              loaderVersion,
              instancePath: "",
              icon,
              minRamMb: ramMin,
              maxRamMb: ramMax,
              javaPath: null,
              jvmArgs: "",
              gameArgs: "",
              gameResolution: null,
              lastPlayedAt: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            const prep = await prepareNewInstancePaths(root, row);
            await instanceSave(prep);
            await logAppend("launcher", "info", `Instancia creada ${name}`, id);
            alert("Instancia creada");
          })
        }
      >
        Crear e instalar al jugar
      </button>
    </div>
  );
}

function ModsPage() {
  const [instances, setInstances] = useState<InstanceRow[]>([]);
  const [sel, setSel] = useState("");
  const [mods, setMods] = useState<ModEntry[]>([]);
  const [sz, setSz] = useState(0);

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

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Mods</h1>
      <select
        className="ui-input"
        value={sel}
        onChange={(e) => setSel(e.target.value)}
      >
        {instances.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>
      <p className="text-xs text-ink-muted">
        Carpeta mods: {(sz / (1024 * 1024)).toFixed(2)} MB · {cur?.loaderType}{" "}
        {cur?.minecraftVersion}
      </p>
      <div className="ui-table-wrap">
        <table className="ui-table">
          <thead>
            <tr>
              <th className="p-3">Archivo</th>
              <th className="p-3">Tamano</th>
              <th className="p-3">Activo</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {mods.map((m) => (
              <tr key={m.relPath}>
                <td className="p-3 font-mono text-xs">{m.fileName}</td>
                <td className="p-3 text-xs text-ink-faint">{m.size}</td>
                <td className="p-3">
                  <input
                    type="checkbox"
                    checked={m.enabled}
                    onChange={(e) => {
                      void tap("Mod", async () => {
                        if (!cur) return;
                        await setModEnabled(cur.instancePath, m.fileName, e.target.checked);
                        await reloadMods();
                      });
                    }}
                  />
                </td>
                <td className="p-3">
                  <button
                    type="button"
                    className="text-xs text-red-300 hover:underline"
                    onClick={() =>
                      tap("Eliminar mod", async () => {
                        await deleteMod(m.relPath);
                        await reloadMods();
                      })
                    }
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="ui-btn"
        onClick={() =>
          tap("Abrir carpeta mods", async () => {
            if (!cur) return;
            const p = await fullPath(`${cur.instancePath}/mods`);
            await openPath(p);
          })
        }
      >
        Abrir carpeta mods
      </button>
    </div>
  );
}

function AccountsPage() {
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [off, setOff] = useState("");
  const [dc, setDc] = useState<{ userCode: string; uri: string; deviceCode: string } | null>(
    null,
  );

  const load = useCallback(() => accountsList().then(setRows), []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Cuentas</h1>
      <div className="ui-card space-y-4">
        <h2 className="text-sm font-semibold text-ink">Microsoft · código de dispositivo</h2>
        <button
          type="button"
          className="ui-btn-primary px-5 py-2.5"
          onClick={() =>
            tap("Microsoft", async () => {
              const s = await microsoftDeviceStart();
              setDc({
                userCode: s.userCode,
                uri: s.verificationUri,
                deviceCode: s.deviceCode,
              });
              const tick = async () => {
                const r = await microsoftDevicePoll(s.deviceCode);
                if (r.kind === "success") {
                  setDc(null);
                  await load();
                } else if (r.kind === "error") {
                  alert(r.message);
                  setDc(null);
                } else setTimeout(tick, (s.interval || 5) * 1000);
              };
              setTimeout(tick, (s.interval || 5) * 1000);
            })
          }
        >
          Iniciar sesión con Microsoft
        </button>
        {dc ? (
          <div className="rounded-md border border-line bg-surface-deep/80 p-4 text-sm text-ink-muted">
            <div>
              Abre{" "}
              <button
                type="button"
                className="text-accent-bright underline decoration-accent-dim/60 underline-offset-2 hover:text-accent"
                onClick={() => tap("Abrir enlace", async () => openUrl(dc.uri))}
              >
                {dc.uri}
              </button>
            </div>
            <div className="mt-2 font-mono text-lg tracking-widest">{dc.userCode}</div>
          </div>
        ) : null}
      </div>
      <div className="ui-card space-y-4">
        <h2 className="text-sm font-semibold text-ink">Cuenta local (offline)</h2>
        <div className="flex gap-2">
          <input
            className="ui-input flex-1"
            placeholder="nombre"
            value={off}
            onChange={(e) => setOff(e.target.value)}
          />
          <button
            type="button"
            className="ui-btn shrink-0"
            onClick={() =>
              tap("Cuenta offline", async () => {
                await accountAddOffline(off);
                setOff("");
                await load();
              })
            }
          >
            Añadir
          </button>
        </div>
      </div>
      <ul className="space-y-2">
        {rows.map((a) => (
          <li
            key={a.id}
            className="ui-card flex flex-wrap items-center justify-between gap-2 text-sm"
          >
            <div>
              <span className="font-medium text-ink">{a.username}</span>{" "}
              <span className="text-ink-muted">({a.kind})</span>
              {a.isActive ? (
                <span className="ml-2 rounded border border-accent-dim/40 bg-accent-glow px-2 py-0.5 text-xs font-medium text-accent-bright">
                  activa
                </span>
              ) : null}
            </div>
            <div className="flex gap-2">
              {!a.isActive ? (
                <button
                  type="button"
                  className="text-xs text-accent-bright hover:underline"
                  onClick={() =>
                    tap("Activar cuenta", async () => {
                      await accountSetActive(a.id);
                      await load();
                    })
                  }
                >
                  Usar
                </button>
              ) : null}
              <button
                type="button"
                className="text-xs text-red-300 hover:underline"
                onClick={() =>
                  tap("Eliminar cuenta", async () => {
                    await accountDelete(a.id);
                    await load();
                  })
                }
              >
                Quitar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LogsPage() {
  const [level, setLevel] = useState("");
  const [source, setSource] = useState("");
  const [lines, setLines] = useState("");

  const load = useCallback(async () => {
    const r = await logsQuery(500, level || undefined, source || undefined);
    setLines(r.map((x) => `${x.createdAt} [${x.source}/${x.level}] ${x.message}`).join("\n"));
  }, [level, source]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Registros</h1>
      <div className="flex flex-wrap gap-2">
        <select
          className="ui-input w-auto min-w-[10rem]"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
        >
          <option value="">Nivel (todos)</option>
          <option value="error">error</option>
          <option value="warn">warn</option>
          <option value="info">info</option>
        </select>
        <select
          className="ui-input w-auto min-w-[10rem]"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          <option value="">Origen (todos)</option>
          <option value="launcher">launcher</option>
          <option value="game">game</option>
        </select>
        <button
          type="button"
          className="ui-btn"
          onClick={() => tap("Registros", async () => load())}
        >
          Actualizar
        </button>
        <button
          type="button"
          className="ui-btn"
          onClick={() => void navigator.clipboard.writeText(lines)}
        >
          Copiar
        </button>
        <button
          type="button"
          className="ui-btn"
          onClick={() => {
            const b = new Blob([lines], { type: "text/plain" });
            const u = URL.createObjectURL(b);
            const a = document.createElement("a");
            a.href = u;
            a.download = "metta-logs.txt";
            a.click();
            URL.revokeObjectURL(u);
          }}
        >
          Guardar
        </button>
        <button
          type="button"
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200"
          onClick={() =>
            tap("Vaciar registros", async () => {
              await logsClear();
              await load();
            })
          }
        >
          Vaciar DB logs
        </button>
      </div>
      <pre className="ui-log max-h-[min(32rem,70vh)] overflow-y-auto text-[13px] leading-relaxed">
        {lines}
      </pre>
    </div>
  );
}

function SettingsPage() {
  const [root, setRoot] = useState("");
  const [java, setJava] = useState("");
  const [gmin, setGmin] = useState("");
  const [gmax, setGmax] = useState("");
  const [jvm, setJvm] = useState("");
  const [theme, setTheme] = useState("dark");
  const [lang, setLang] = useState("es");
  const [conc, setConc] = useState("8");

  useEffect(() => {
    void (async () => {
      const p = await appPaths();
      setRoot((await settingGet("launcherRoot")) || p.launcherRoot);
      setJava((await settingGet("javaPath")) || "");
      setGmin((await settingGet("globalMinRamMb")) || "512");
      setGmax((await settingGet("globalMaxRamMb")) || "4096");
      setJvm((await settingGet("globalJvmArgs")) || "");
      setTheme((await settingGet("theme")) || "dark");
      setLang((await settingGet("language")) || "es");
      setConc((await settingGet("downloadConcurrency")) || "8");
    })();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="page-head mb-0 border-0 pb-0">
        <h1 className="page-title text-2xl">Ajustes</h1>
        <p className="page-desc">Ruta de datos, Java y opciones por defecto.</p>
      </div>
      <label className="block text-sm">
        <span className="ui-field-label">Raiz del launcher</span>
        <input
          className="ui-input font-mono text-xs"
          value={root}
          onChange={(e) => setRoot(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="ui-btn"
        onClick={() =>
          tap("Guardar raiz", async () => {
            await launcherSetRoot(root);
            await settingSet("launcherRoot", root);
          })
        }
      >
        Guardar raiz
      </button>
      <label className="mt-4 block text-sm">
        <span className="ui-field-label">Java</span>
        <input
          className="ui-input font-mono text-xs"
          value={java}
          onChange={(e) => setJava(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="ui-btn"
        onClick={() =>
          tap("Detectar Java", async () => {
            const j = await javaDetect();
            alert(j.map((x) => `${x.path}\n${x.version}`).join("\n\n"));
          })
        }
      >
        Detectar Java
      </button>
      <button
        type="button"
        className="ml-2 ui-btn"
        onClick={() => tap("Guardar Java", async () => settingSet("javaPath", java))}
      >
        Guardar Java
      </button>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="ui-field-label">RAM global min MB</span>
          <input
            className="ui-input"
            value={gmin}
            onChange={(e) => setGmin(e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="ui-field-label">RAM global max MB</span>
          <input
            className="ui-input"
            value={gmax}
            onChange={(e) => setGmax(e.target.value)}
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="ui-field-label">JVM extra (lineas)</span>
        <textarea
          className="ui-input font-mono text-xs"
          rows={4}
          value={jvm}
          onChange={(e) => setJvm(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        <span className="ui-field-label">Tema</span>
        <select
          className="ui-input"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
        >
          <option value="dark">Oscuro</option>
          <option value="light">Claro</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="ui-field-label">Idioma</span>
        <select
          className="ui-input"
          value={lang}
          onChange={(e) => setLang(e.target.value)}
        >
          <option value="es">Espanol</option>
          <option value="en">English</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="ui-field-label">Descargas concurrentes (UI)</span>
        <input
          className="ui-input"
          value={conc}
          onChange={(e) => setConc(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="w-full ui-btn-primary py-3.5"
        onClick={() =>
          tap("Guardar ajustes", async () => {
            await settingSet("globalMinRamMb", gmin);
            await settingSet("globalMaxRamMb", gmax);
            await settingSet("globalJvmArgs", jvm);
            await settingSet("theme", theme);
            await settingSet("language", lang);
            await settingSet("downloadConcurrency", conc);
            await logAppend("launcher", "info", "Ajustes guardados");
          })
        }
      >
        Guardar ajustes
      </button>
    </div>
  );
}
