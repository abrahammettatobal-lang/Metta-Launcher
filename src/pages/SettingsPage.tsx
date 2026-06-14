import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  appPaths,
  javaDetect,
  launcherSetRoot,
  logAppend,
  openDevtools,
  settingGet,
  settingSet,
} from "../services/bridge";
import {
  getHostPlatform,
  hostArchLabel,
  hostOsLabel,
  type HostPlatformInfo,
} from "../services/platform";
import {
  checkAppUpdate,
  type AppUpdateStatus,
} from "../services/updateService";
import { useUpdater } from "../components/UpdateProvider";
import { Topbar } from "../ui/Topbar";
import { Card } from "../ui/Card";
import { Field, FieldTextarea } from "../ui/Field";
import { Toggle } from "../ui/Toggle";
import {
  IconBolt,
  IconCheck,
  IconFolder,
  IconShield,
  IconSliders,
} from "../ui/icons";
import { tap } from "../utils/tap";
import { openPath } from "@tauri-apps/plugin-opener";
import { getVersion } from "@tauri-apps/api/app";
import { SponsorBadge } from "../components/sponsors/SponsorBadge";

export function SettingsPage() {
  const [version, setVersion] = useState("…");
  const [host, setHost] = useState<HostPlatformInfo | null>(null);
  useEffect(() => {
    void getVersion().then(setVersion).catch(() => setVersion("?"));
    void getHostPlatform().then(setHost).catch(() => setHost(null));
  }, []);
  const [root, setRoot] = useState("");
  const [defaultRoot, setDefaultRoot] = useState("");
  const [dbPath, setDbPath] = useState("");
  const [java, setJava] = useState("");
  const [gmin, setGmin] = useState("1024");
  const [gmax, setGmax] = useState("4096");
  const [jvm, setJvm] = useState("");
  const [closeOnLaunch, setCloseOnLaunch] = useState(false);
  const [verboseGameLogs, setVerboseGameLogs] = useState(true);
  const [autoCheckUpdates, setAutoCheckUpdates] = useState(true);
  const [autoInstallUpdates, setAutoInstallUpdates] = useState(false);
  const [msClientId, setMsClientId] = useState("");
  const [detected, setDetected] = useState<
    Array<{ path: string; version: string | null }>
  >([]);
  const [saved, setSaved] = useState<null | "ok" | "err">(null);
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus | null>(
    null,
  );
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<
    AppUpdateStatus["native"]
  >(null);
  const { installNow, phase: updatePhase, progress: updateProgress } =
    useUpdater();

  useEffect(() => {
    void (async () => {
      const p = await appPaths();
      setDefaultRoot(p.defaultLauncherRoot);
      setDbPath(p.dbPath);
      setRoot((await settingGet("launcherRoot")) || p.launcherRoot);
      setJava((await settingGet("javaPath")) || "");
      setGmin((await settingGet("globalMinRamMb")) || "1024");
      setGmax((await settingGet("globalMaxRamMb")) || "4096");
      setJvm((await settingGet("globalJvmArgs")) || "");
      setCloseOnLaunch((await settingGet("closeOnLaunch")) === "true");
      setVerboseGameLogs(
        (await settingGet("verboseGameLogs")) !== "false",
      );
      setAutoCheckUpdates((await settingGet("autoCheckUpdates")) !== "false");
      setAutoInstallUpdates(
        (await settingGet("autoInstallUpdates")) === "true",
      );
      setMsClientId((await settingGet("microsoftClientId")) || "");
    })();
  }, []);

  async function saveAll() {
    try {
      await settingSet("globalMinRamMb", String(Math.max(256, Number(gmin) || 1024)));
      await settingSet("globalMaxRamMb", String(Math.max(512, Number(gmax) || 4096)));
      await settingSet("globalJvmArgs", jvm);
      await settingSet("closeOnLaunch", String(closeOnLaunch));
      await settingSet("verboseGameLogs", String(verboseGameLogs));
      await settingSet("autoCheckUpdates", String(autoCheckUpdates));
      await settingSet("autoInstallUpdates", String(autoInstallUpdates));
      await settingSet("microsoftClientId", msClientId.trim());
      await logAppend("launcher", "info", "Ajustes guardados");
      setSaved("ok");
      setTimeout(() => setSaved(null), 2200);
    } catch (e) {
      console.error(e);
      setSaved("err");
      setTimeout(() => setSaved(null), 3200);
    }
  }

  return (
    <div className="space-y-6">
      <Topbar
        eyebrow="Preferencias"
        title="Ajustes"
        subtitle="Ruta de datos, Java, memoria por defecto y comportamiento del launcher."
      />

      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <div className="space-y-5">
          <Card
            eyebrow="Almacenamiento"
            title="Carpeta del launcher"
            action={
              <span className="pill">
                <IconShield width={11} height={11} /> Seguro
              </span>
            }
          >
            <Field
              label="Ruta raíz"
              inputClassName="font-mono text-xs"
              value={root}
              onChange={(e) => setRoot(e.target.value)}
              hint="Aquí se guardan instancias, assets, libraries y caché."
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-gold"
                onClick={() =>
                  tap("Guardar raíz", async () => {
                    await launcherSetRoot(root);
                    await settingSet("launcherRoot", root);
                  })
                }
              >
                <IconCheck width={14} height={14} /> Aplicar ruta
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => tap("Abrir carpeta", async () => openPath(root))}
              >
                <IconFolder width={14} height={14} /> Abrir
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setRoot(defaultRoot)}
              >
                Restaurar predeterminada
              </button>
            </div>
          </Card>

          <Card eyebrow="Java" title="Runtime de ejecución">
            <Field
              label="Ejecutable de Java"
              inputClassName="font-mono text-xs"
              value={java}
              onChange={(e) => setJava(e.target.value)}
              hint="Ruta completa al binario java o javaw. Vacío = detección automática."
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn"
                onClick={() =>
                  tap("Detectar Java", async () => {
                    const j = await javaDetect();
                    setDetected(j);
                    if (!j.length) alert("No se encontró Java instalado.");
                  })
                }
              >
                <IconBolt width={14} height={14} /> Detectar Java
              </button>
              <button
                type="button"
                className="btn-gold"
                onClick={() =>
                  tap("Guardar Java", async () => settingSet("javaPath", java))
                }
              >
                <IconCheck width={14} height={14} /> Guardar Java
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setJava("")}
              >
                Limpiar
              </button>
            </div>
            {detected.length > 0 && (
              <div className="mt-4 space-y-1.5">
                {detected.map((d) => (
                  <button
                    key={d.path}
                    type="button"
                    onClick={() => setJava(d.path)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-canvas-deep/40 px-3 py-2 text-left text-[12px] transition-all duration-200 hover:border-gold-500/40 hover:bg-canvas-card/80"
                  >
                    <span className="truncate font-mono text-ink-soft">
                      {d.path}
                    </span>
                    <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-gold-300">
                      {d.version ?? "?"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card eyebrow="Rendimiento" title="Memoria por defecto">
            <p className="text-[12px] text-ink-muted">
              Estas cantidades se usan al crear una nueva instancia. Las
              instancias existentes mantienen su propio valor.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Field
                label="RAM mín (MB)"
                type="number"
                min={256}
                step={256}
                value={gmin}
                onChange={(e) => setGmin(e.target.value)}
              />
              <Field
                label="RAM máx (MB)"
                type="number"
                min={512}
                step={256}
                value={gmax}
                onChange={(e) => setGmax(e.target.value)}
              />
            </div>
            <FieldTextarea
              label="JVM extra (una bandera por línea)"
              className="mt-3"
              inputClassName="font-mono text-xs"
              rows={5}
              value={jvm}
              onChange={(e) => setJvm(e.target.value)}
              hint="Se aplican a todas las instancias al lanzar."
            />
          </Card>

          <Card eyebrow="Comportamiento" title="Mientras juegas">
            <ToggleRow
              checked={closeOnLaunch}
              onChange={setCloseOnLaunch}
              title="Minimizar al jugar"
              description="Esconde el launcher en la barra de tareas tras lanzar el juego."
            />
            <div className="my-3 h-px w-full bg-line" />
            <ToggleRow
              checked={verboseGameLogs}
              onChange={setVerboseGameLogs}
              title="Registrar consola del juego"
              description="Captura stdout / stderr de Minecraft en la pestaña Registros."
            />
            <div className="my-3 h-px w-full bg-line" />
            <ToggleRow
              checked={autoCheckUpdates}
              onChange={setAutoCheckUpdates}
              title="Buscar actualizaciones automáticamente"
              description="Comprueba si hay builds nuevos al abrir Metta y periódicamente en segundo plano."
            />
            <div className="my-3 h-px w-full bg-line" />
            <ToggleRow
              checked={autoInstallUpdates}
              onChange={setAutoInstallUpdates}
              title="Instalar actualizaciones automáticamente"
              description="Si hay versión nueva, Metta la descarga e instala encima de la actual y se reinicia solo. Sin desinstalar ni descargar instaladores."
            />
          </Card>

          <Card
            eyebrow="Microsoft auth"
            title="Cuenta de Azure (avanzado)"
          >
            <Field
              label="Client ID personalizado"
              placeholder="dejar vacío para usar el de Mojang"
              inputClassName="font-mono text-xs"
              value={msClientId}
              onChange={(e) => setMsClientId(e.target.value)}
              hint="Si recibes AADSTS700016 al iniciar sesión, registra una App pública en portal.azure.com (permitir flujos de cliente público, cuentas personales) y pega aquí su Application (client) ID."
            />
          </Card>

          <Card eyebrow="Acerca de" title="Metta Launcher">
            <p className="text-[12px] leading-relaxed text-ink-muted">
              Las builds oficiales se actualizan solas, como Discord o Spotify:
              descarga el parche, lo aplica sobre la instalación existente y
              reinicia. Tus instancias, mods y ajustes se conservan.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Info label="Versión" value={version} />
              <Info
                label="Plataforma"
                value={
                  host
                    ? `${hostOsLabel(host.os)} · ${hostArchLabel(host.arch)}`
                    : "…"
                }
              />
            </div>
            {host?.os === "macos" && (
              <div className="mt-3">
                <button
                  type="button"
                  className="btn text-[12px]"
                  onClick={() => tap("Abrir inspector", () => openDevtools())}
                >
                  Abrir inspector WebKit (macOS)
                </button>
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn text-[12px]"
                disabled={checkingUpdate || updatePhase === "downloading"}
                onClick={() =>
                  tap("Comprobar actualizaciones", async () => {
                    setCheckingUpdate(true);
                    try {
                      const status = await checkAppUpdate();
                      setUpdateStatus(status);
                      setPendingUpdate(status.native);
                    } finally {
                      setCheckingUpdate(false);
                    }
                  })
                }
              >
                {checkingUpdate ? "Comprobando…" : "Comprobar ahora"}
              </button>
              {updateStatus?.updateAvailable && pendingUpdate && (
                <button
                  type="button"
                  className="btn-gold text-[12px]"
                  disabled={updatePhase === "downloading"}
                  onClick={() =>
                    tap("Actualizar ahora", async () => {
                      await installNow(pendingUpdate);
                    })
                  }
                >
                  Actualizar a v{updateStatus.latestVersion}
                </button>
              )}
            </div>
            {(updatePhase === "downloading" || updatePhase === "restarting") && (
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-[10.5px] text-ink-faint">
                  <span>
                    {updatePhase === "restarting"
                      ? "Reiniciando…"
                      : "Instalando actualización…"}
                  </span>
                  <span>{updateProgress}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-canvas-deep">
                  <div
                    className="h-full rounded-full bg-gold-gradient transition-all duration-300"
                    style={{ width: `${updateProgress}%` }}
                  />
                </div>
              </div>
            )}
            {updateStatus && (
              <div className="mt-3 rounded-xl border border-line bg-canvas-deep/40 p-3 text-[11.5px] text-ink-soft">
                {updateStatus.updateAvailable ? (
                  <p>
                    Hay una versión nueva:{" "}
                    <span className="text-gold-200">
                      v{updateStatus.latestVersion}
                    </span>{" "}
                    (tienes v{updateStatus.currentVersion}).
                    {pendingUpdate
                      ? autoInstallUpdates
                        ? " Se instalará automáticamente en segundo plano."
                        : " Pulsa «Actualizar» para instalarla sin desinstalar."
                      : " Solo disponible en builds oficiales instaladas (no en modo desarrollo)."}
                  </p>
                ) : (
                  <p>
                    Estás en la última versión publicada (v
                    {updateStatus.currentVersion}).
                  </p>
                )}
                {updateStatus.notes && (
                  <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-ink-muted">
                    {updateStatus.notes.slice(0, 400)}
                    {updateStatus.notes.length > 400 ? "…" : ""}
                  </p>
                )}
              </div>
            )}
            <div className="mt-3 space-y-1.5 rounded-xl border border-line bg-canvas-deep/40 p-3 text-[11px]">
              <Row label="Datos" value={root} />
              <Row label="Base SQLite" value={dbPath} />
            </div>
            <SponsorBadge className="mt-4" />
          </Card>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-line pt-5">
        {saved === "ok" && (
          <span className="pill-gold">
            <IconCheck width={11} height={11} /> Guardado
          </span>
        )}
        {saved === "err" && (
          <span className="pill" style={{ color: "#fca5a5" }}>
            Error al guardar
          </span>
        )}
        <motion.button
          type="button"
          whileTap={{ scale: 0.99 }}
          className="btn-gold !px-7 !py-3"
          onClick={() => tap("Guardar ajustes", async () => saveAll())}
        >
          <IconSliders width={14} height={14} /> Guardar ajustes
        </motion.button>
      </div>
    </div>
  );
}

function ToggleRow({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[13px] font-semibold tracking-tight text-ink">
          {title}
        </div>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">
          {description}
        </p>
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-canvas-deep/40 px-3 py-2">
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
        {label}
      </div>
      <div className="font-display text-[13px] font-semibold tracking-tight text-ink">
        {value}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-20 shrink-0 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
        {label}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-soft">
        {value}
      </span>
    </div>
  );
}