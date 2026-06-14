import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { settingGet } from "../services/bridge";
import {
  checkAppUpdate,
  installAppUpdate,
  type AppUpdateStatus,
} from "../services/updateService";
import { MettaMark } from "../ui/icons";

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

type Phase =
  | "idle"
  | "checking"
  | "downloading"
  | "restarting"
  | "error";

interface UpdateContextValue {
  phase: Phase;
  progress: number;
  latestVersion: string | null;
  error: string | null;
  checkNow: () => Promise<AppUpdateStatus | null>;
  installNow: (update: NonNullable<AppUpdateStatus["native"]>) => Promise<void>;
}

const UpdateContext = createContext<UpdateContextValue | null>(null);

export function useUpdater() {
  const ctx = useContext(UpdateContext);
  if (!ctx) throw new Error("useUpdater requiere UpdateProvider");
  return ctx;
}

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const installNow = useCallback(
    async (update: NonNullable<AppUpdateStatus["native"]>) => {
      if (busy.current) return;
      busy.current = true;
      setError(null);
      setPhase("downloading");
      setProgress(0);
      try {
        await installAppUpdate(update, setProgress);
        setPhase("restarting");
      } catch (e) {
        setError(String(e));
        setPhase("error");
        busy.current = false;
      }
    },
    [],
  );

  const runCheck = useCallback(
    async (opts?: { forceInstall?: boolean }) => {
      if (busy.current) return null;

      const autoCheck = (await settingGet("autoCheckUpdates")) !== "false";
      if (!opts?.forceInstall && !autoCheck) return null;

      setPhase("checking");
      try {
        const status = await checkAppUpdate();
        if (!status.updateAvailable || !status.native) {
          setPhase("idle");
          return status;
        }

        setLatestVersion(status.latestVersion);
        const autoInstall =
          opts?.forceInstall ||
          (await settingGet("autoInstallUpdates")) === "true";

        if (autoInstall) {
          await installNow(status.native);
        } else {
          setPhase("idle");
        }

        return status;
      } catch (e) {
        setError(String(e));
        setPhase("error");
        busy.current = false;
        return null;
      }
    },
    [installNow],
  );

  const checkNow = useCallback(async () => {
    busy.current = false;
    return runCheck({ forceInstall: false });
  }, [runCheck]);

  useEffect(() => {
    const bootTimer = window.setTimeout(() => void runCheck(), 3000);
    const timer = window.setInterval(() => void runCheck(), CHECK_INTERVAL_MS);
    const onFocus = () => void runCheck();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(bootTimer);
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [runCheck]);

  const visible =
    phase === "downloading" ||
    phase === "restarting" ||
    phase === "error";

  return (
    <UpdateContext.Provider
      value={{
        phase,
        progress,
        latestVersion,
        error,
        checkNow,
        installNow,
      }}
    >
      {children}
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-canvas-deep/88 backdrop-blur-md"
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8 }}
              className="glass mx-4 w-full max-w-md p-8 text-center"
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-gold-500/35 bg-gold-haze/30">
                <MettaMark size={36} />
              </div>

              {phase === "downloading" && (
                <>
                  <h2 className="mt-5 font-display text-[18px] font-semibold text-ink">
                    Actualizando Metta
                    {latestVersion ? ` a v${latestVersion}` : ""}
                  </h2>
                  <p className="mt-2 text-[13px] text-ink-muted">
                    Descargando e instalando sobre la versión actual. No hace
                    falta desinstalar ni volver a instalar manualmente.
                  </p>
                  <div className="mt-6">
                    <div className="mb-1.5 flex justify-between text-[10.5px] text-ink-faint">
                      <span>Progreso</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-canvas-deep">
                      <div
                        className="h-full rounded-full bg-gold-gradient transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                </>
              )}

              {phase === "restarting" && (
                <>
                  <h2 className="mt-5 font-display text-[18px] font-semibold text-ink">
                    Reiniciando…
                  </h2>
                  <p className="mt-2 text-[13px] text-ink-muted">
                    La actualización está lista. Metta se abrirá de nuevo en un
                    instante.
                  </p>
                </>
              )}

              {phase === "error" && (
                <>
                  <h2 className="mt-5 font-display text-[18px] font-semibold text-red-300">
                    No se pudo actualizar
                  </h2>
                  <p className="mt-2 text-[12.5px] text-ink-muted">{error}</p>
                  <button
                    type="button"
                    className="btn-gold mt-5"
                    onClick={() => {
                      setPhase("idle");
                      setError(null);
                      busy.current = false;
                    }}
                  >
                    Continuar
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </UpdateContext.Provider>
  );
}
