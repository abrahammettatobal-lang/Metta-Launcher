import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import { Sidebar, type SidebarStatus } from "./ui/Sidebar";
import { Dashboard } from "./pages/Dashboard";
import { InstancesPage } from "./pages/InstancesPage";
import { CreateInstancePage } from "./pages/CreateInstancePage";
import { ModsPage } from "./pages/ModsPage";
import { AccountsPage } from "./pages/AccountsPage";
import { LogsPage } from "./pages/LogsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { BedrockPage } from "./pages/BedrockPage";
import { DiagnosticsPage } from "./pages/DiagnosticsPage";
import { EditInstancePage } from "./pages/EditInstancePage";
import { HistoryPage } from "./pages/HistoryPage";
import { OnboardingGate } from "./pages/OnboardingGate";
import { PageTransition } from "./ui/PageTransition";
import { Card } from "./ui/Card";
import {
  subscribeLaunchProgress,
  type LaunchProgress,
} from "./services/launchProgress";
import { subscribeGameExit } from "./services/downloads/downloadEvents";
import {
  recorderGetStatus,
  recorderStop,
} from "./services/recorder/recorderService";

const RecordingPage = lazy(() =>
  import("./pages/RecordingPage").then((m) => ({ default: m.RecordingPage })),
);

function Shell() {
  const [progress, setProgress] = useState<LaunchProgress | null>(null);

  useEffect(() => {
    const u = subscribeLaunchProgress((p) => {
      setProgress(p.phase === "idle" ? null : p);
    });
    return () => u();
  }, []);

  useEffect(() => {
    let off: (() => void) | undefined;
    void subscribeGameExit(async () => {
      try {
        const status = await recorderGetStatus();
        if (
          status.phase === "recording" ||
          status.phase === "paused" ||
          status.phase === "countdown"
        ) {
          await recorderStop();
        }
        const win = (await import("@tauri-apps/api/window")).getCurrentWindow();
        await win.unminimize();
        await win.setFocus();
      } catch {
        /* noop */
      }
    }).then((fn) => {
      off = fn;
    });
    return () => off?.();
  }, []);

  const status = deriveStatus(progress);

  return (
    <OnboardingGate>
      <div className="flex h-full min-h-0 flex-1 flex-row">
        <Sidebar status={status} />
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="scrollbar-thin relative min-h-0 flex-1 overflow-y-auto px-6 pb-12 pt-6 lg:px-10 lg:pt-8">
            <div className="mx-auto w-full max-w-[1280px]">
              <PageTransition>
                <Outlet />
              </PageTransition>
            </div>
          </div>
        </main>
      </div>
    </OnboardingGate>
  );
}

function deriveStatus(p: LaunchProgress | null): SidebarStatus {
  if (!p) return { text: "Metta listo", variant: "idle" };
  if (p.phase === "running") {
    return { text: "Minecraft en curso", variant: "playing" };
  }
  if (p.phase === "error") {
    return { text: p.detail ?? "Error al lanzar", variant: "error" };
  }
  return { text: p.label || "Procesando…", variant: "busy" };
}

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Dashboard />} />
        <Route path="instances" element={<InstancesPage />} />
        <Route path="bedrock" element={<BedrockPage />} />
        <Route path="create" element={<CreateInstancePage />} />
        <Route path="mods" element={<ModsPage />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="diagnostics" element={<DiagnosticsPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route
          path="recording"
          element={
            <Suspense
              fallback={
                <Card padding="tight">
                  <p className="text-[13px] text-ink-muted">Cargando grabador…</p>
                </Card>
              }
            >
              <RecordingPage />
            </Suspense>
          }
        />
        <Route path="instances/:id/edit" element={<EditInstancePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
