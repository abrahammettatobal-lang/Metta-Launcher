import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isTauri } from "@tauri-apps/api/core";
import { destinations } from "./navigation";
import { IconCubes, IconX } from "./icons";
import type { SidebarStatus } from "./Sidebar";
import { instancesList } from "../services/bridge";

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden
    >
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </svg>
  );
}
export function CommandBar({ status }: { status: SidebarStatus }) {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [instances, setInstances] = useState<typeof destinations>([]);
  const title =
    destinations.find((d) => d.to === pathname)?.label ??
    (pathname === "/setup" ? "Configuración inicial" : "Editar instancia");
  const matches = [...destinations, ...instances].filter((d) =>
    normalize(d.label).includes(normalize(query.trim())),
  );
  const open = () => {
    if (dialog.current?.open) return;
    setQuery("");
    setInstances([]);
    dialog.current?.showModal();
    field.current?.focus();
    if (isTauri())
      void instancesList()
        .then((rows) =>
          setInstances(
            rows.map((r) => ({
              label: r.name,
              to: "/instances/" + encodeURIComponent(r.id) + "/edit",
              icon: IconCubes,
            })),
          ),
        )
        .catch(() => {});
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (dialog.current?.open) dialog.current.close();
        else open();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const select = (to: string) => {
    dialog.current?.close();
    nav(to);
  };
  return (
    <>
      <header className="commandbar">
        <div className="crumb">
          <IconCubes
            className="crumb-mark"
            width={15}
            height={15}
            aria-hidden
          />
          <span>Launcher</span>
          <i>/</i>
          <strong>{title}</strong>
        </div>
        <div className="command-actions">
          <button className="search-trigger" onClick={open}>
            <SearchIcon />
            <span>Buscar</span>
            <kbd>{/Mac/.test(navigator.platform) ? "⌘ K" : "Ctrl K"}</kbd>
          </button>
          <span
            className={"system-status " + status.variant}
            title={status.text}
          >
            <i />
            {!isTauri()
              ? "Vista web"
              : status.variant === "idle"
                ? "Listo"
                : status.text}
          </span>
        </div>
      </header>
      <dialog
        ref={dialog}
        className="command-dialog"
        aria-label="Buscar en Metta"
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current.close();
        }}
      >
        <div
          className="command-inner"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              const items = Array.from(
                e.currentTarget.querySelectorAll<HTMLButtonElement>(
                  ".command-results button",
                ),
              );
              if (!items.length) return;
              e.preventDefault();
              const at = items.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              const next =
                e.key === "ArrowDown"
                  ? at + 1
                  : at <= 0
                    ? items.length - 1
                    : at - 1;
              items[next % items.length].focus();
            }
          }}
        >
          <div className="command-input">
            <SearchIcon />
            <input
              ref={field}
              aria-label="Buscar sección o instancia"
              placeholder="Buscar sección o instancia…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches[0]) select(matches[0].to);
              }}
            />
            <button
              aria-label="Cerrar búsqueda"
              onClick={() => dialog.current?.close()}
            >
              <IconX />
            </button>
          </div>
          <div className="command-results scrollbar-thin">
            {matches.length ? (
              matches.map(({ to, label, icon: Icon }) => (
                <button key={to} onClick={() => select(to)}>
                  <Icon width={16} height={16} />
                  {label}
                  <span>{to.endsWith("/edit") ? "Instancia" : "Sección"}</span>
                </button>
              ))
            ) : (
              <p>Sin resultados para «{query}».</p>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
