import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "./index.css";
import { App } from "./App";
import { ToastProvider, ToastBridge } from "./ui/Toast";
import { UpdateProvider } from "./components/UpdateProvider";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <ToastProvider>
        <UpdateProvider>
          <ToastBridge />
          <App />
        </UpdateProvider>
      </ToastProvider>
    </HashRouter>
  </StrictMode>,
);
