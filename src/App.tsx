import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import {
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { Sidebar, type SidebarStatus } from "./ui/Sidebar";
import { CommandBar } from "./ui/CommandBar";
import { Dashboard } from "./pages/Dashboard";
import { PageTransition } from "./ui/PageTransition";
import { Empty } from "./ui/Empty";
import { handleGameExit } from "./services/launchInstance";
import {
  subscribeLaunchProgress,
  type LaunchProgress,
} from "./services/launchProgress";
import {
  onNativeEvent,
  subscribeGameExit,
  subscribeGameLog,
} from "./services/downloads/downloadEvents";
import {
  recorderGetSettings,
  recorderGetStatus,
  recorderStop,
} from "./services/recorder/recorderService";
import { logAppend, settingGet } from "./services/bridge";
import { diagnoseLaunchFailure } from "./services/minecraft/errorDiagnostics";
import { tap } from "./utils/tap";
import { destinations } from "./ui/navigation";

const InstancesPage = lazy(() =>
  import("./pages/InstancesPage").then((m) => ({ default: m.InstancesPage })),
);
const CreateInstancePage = lazy(() =>
  import("./pages/CreateInstancePage").then((m) => ({
    default: m.CreateInstancePage,
  })),
);
const ModsPage = lazy(() =>
  import("./pages/ModsPage").then((m) => ({ default: m.ModsPage })),
);
const AccountsPage = lazy(() =>
  import("./pages/AccountsPage").then((m) => ({ default: m.AccountsPage })),
);
const LogsPage = lazy(() =>
  import("./pages/LogsPage").then((m) => ({ default: m.LogsPage })),
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const BedrockPage = lazy(() =>
  import("./pages/BedrockPage").then((m) => ({ default: m.BedrockPage })),
);
const DiagnosticsPage = lazy(() =>
  import("./pages/DiagnosticsPage").then((m) => ({
    default: m.DiagnosticsPage,
  })),
);
const EditInstancePage = lazy(() =>
  import("./pages/EditInstancePage").then((m) => ({
    default: m.EditInstancePage,
  })),
);
const HistoryPage = lazy(() =>
  import("./pages/HistoryPage").then((m) => ({ default: m.HistoryPage })),
);
const RecordingPage = lazy(() =>
  import("./pages/RecordingPage").then((m) => ({ default: m.RecordingPage })),
);
const SetupPage = lazy(() =>
  import("./pages/OnboardingGate").then((m) => ({ default: m.SetupPage })),
);

function Shell() {
  const [progress, setProgress] = useState<LaunchProgress | null>(null);
  const { pathname } = useLocation();
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo(0, 0);
  }, [pathname]);
  useEffect(
    () =>
      subscribeLaunchProgress((p) =>
        setProgress(p.phase === "idle" ? null : p),
      ),
    [],
  );
  useEffect(() => {
    if (!isTauri()) return;
    let verbose = false;
    const readVerbose = () =>
      void settingGet("verboseGameLogs")
        .then((s) => {
          verbose = s !== "false";
        })
        .catch(() => {});
    readVerbose();
    window.addEventListener("metta-settings-changed", readVerbose);
    const offLogs = onNativeEvent(
      subscribeGameLog((e) => {
        if (verbose)
          void logAppend(
            "game",
            "info",
            "[" + e.stream + "] " + e.line,
            e.instanceId,
          ).catch(console.warn);
      }),
    );
    const offExit = onNativeEvent(
      subscribeGameExit((e) => {
        handleGameExit(e.instanceId);
        window.dispatchEvent(new Event("metta-session-ended"));
        const lines = e.logTail ?? e.stderrTail ?? [];
        const d = e.success ? null : diagnoseLaunchFailure(lines, e.code);
        const message = e.success
          ? "Minecraft se cerró."
          : d
            ? d.title + ". " + d.cause
            : "Minecraft se cerró con código " + (e.code ?? "desconocido");
        void logAppend(
          "launcher",
          e.success ? "info" : "error",
          message,
          e.instanceId,
        ).catch(console.warn);
        if (!e.success)
          window.dispatchEvent(
            new CustomEvent("metta-toast", {
              detail: {
                kind: "error",
                title: message,
                message:
                  d?.suggestions[0] ??
                  "Consulta Registros para ver los detalles.",
              },
            }),
          );
        void tap("Finalizar grabación", async () => {
          const settings = await recorderGetSettings();
          if (!settings.autoStopOnExit) return;
          const status = await recorderGetStatus();
          if (["recording", "paused", "countdown"].includes(status.phase))
            await recorderStop();
        });
        void import("@tauri-apps/api/window")
          .then(async (api) => {
            const win = api.getCurrentWindow();
            await win.unminimize();
            await win.setFocus();
          })
          .catch(console.warn);
      }),
    );
    return () => {
      offLogs();
      offExit();
      window.removeEventListener("metta-settings-changed", readVerbose);
    };
  }, []);
  const status: SidebarStatus = !progress
    ? { text: "Listo", variant: "idle" }
    : {
        text: progress.label,
        variant:
          progress.phase === "running"
            ? "playing"
            : progress.phase === "error"
              ? "error"
              : "busy",
      };
  const desktopOnly = !isTauri() && pathname !== "/";
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="workspace">
        <CommandBar status={status} />
        <div ref={scroller} className="workspace-scroll scrollbar-thin">
          <div className="workspace-inner">
            <PageTransition>
              <Suspense fallback={<p role="status">Cargando sección…</p>}>
                {desktopOnly ? (
                  <Empty
                    title={
                      destinations.find((i) => i.to === pathname)?.label ??
                      "Metta Launcher"
                    }
                    description="Abre Metta Launcher en tu computadora para acceder a los archivos y perfiles de juego."
                    action={
                      <div className="flex flex-wrap justify-center gap-2">
                        <a
                          className="btn-gold"
                          href="https://github.com/abrahammettatobal-lang/Metta-Launcher/releases"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Descargar launcher
                        </a>
                        <Link className="btn" to="/">
                          Volver a inicio
                        </Link>
                      </div>
                    }
                  />
                ) : (
                  <Outlet />
                )}
              </Suspense>
            </PageTransition>
          </div>
        </div>
      </main>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Dashboard />} />
        <Route path="instances" element={<InstancesPage />} />
        <Route path="create" element={<CreateInstancePage />} />
        <Route path="instances/:id/edit" element={<EditInstancePage />} />
        <Route path="bedrock" element={<BedrockPage />} />
        <Route path="mods" element={<ModsPage />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="setup" element={<SetupPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="diagnostics" element={<DiagnosticsPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="recording" element={<RecordingPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
