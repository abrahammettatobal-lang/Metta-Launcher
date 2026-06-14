import { Component, StrictMode, useEffect, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "./index.css";
import { App } from "./App";
import { ToastProvider, ToastBridge } from "./ui/Toast";
import { UpdateProvider } from "./components/UpdateProvider";
import { preloadHostPlatform } from "./services/platform";

preloadHostPlatform();

class RootErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message || String(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Metta] UI crash:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-full flex-col items-center justify-center gap-4 p-8 text-center">
          <h1 className="font-display text-xl font-semibold text-ink">Metta Launcher</h1>
          <p className="max-w-lg text-[13px] text-red-300">
            No se pudo cargar la interfaz: {this.state.error}
          </p>
          <button
            type="button"
            className="btn-gold"
            onClick={() => window.location.reload()}
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function hideBootFallback() {
  const boot = document.getElementById("boot-fallback");
  if (boot) boot.style.display = "none";
}

function BootShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    hideBootFallback();
  }, []);
  return children;
}

const rootEl = document.getElementById("root");
if (!rootEl) {
  hideBootFallback();
  throw new Error("No se encontró #root");
}

createRoot(rootEl).render(
  <StrictMode>
    <RootErrorBoundary>
      <BootShell>
        <HashRouter>
          <ToastProvider>
            <UpdateProvider>
              <ToastBridge />
              <App />
            </UpdateProvider>
          </ToastProvider>
        </HashRouter>
      </BootShell>
    </RootErrorBoundary>
  </StrictMode>,
);
