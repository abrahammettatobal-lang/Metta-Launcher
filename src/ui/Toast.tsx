import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cx } from "./cx";
import { IconCheck, IconX } from "./icons";

export type ToastKind = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  push: (item: Omit<ToastItem, "id">) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (item: Omit<ToastItem, "id">) => {
      const id = crypto.randomUUID();
      setItems((prev) => [...prev.slice(-4), { ...item, id }]);
      window.setTimeout(() => dismiss(id), item.kind === "error" ? 8000 : 5000);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[min(100vw-2rem,380px)] flex-col gap-2">
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className={cx(
                "pointer-events-auto overflow-hidden rounded-2xl border backdrop-blur-xl shadow-floating",
                t.kind === "success" && "border-emerald-800/40 bg-emerald-950/85",
                t.kind === "error" && "border-red-900/45 bg-red-950/88",
                t.kind === "warning" && "border-amber-800/40 bg-amber-950/85",
                t.kind === "info" && "border-line bg-canvas-card/92",
              )}
            >
              <div className="flex items-start gap-3 p-4">
                <span
                  className={cx(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg",
                    t.kind === "success" && "bg-emerald-900/50 text-emerald-300",
                    t.kind === "error" && "bg-red-900/50 text-red-300",
                    t.kind === "warning" && "bg-amber-900/50 text-amber-200",
                    t.kind === "info" && "bg-canvas-raised text-gold-300",
                  )}
                >
                  {t.kind === "error" ? (
                    <IconX width={13} height={13} />
                  ) : (
                    <IconCheck width={13} height={13} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-ink">{t.title}</div>
                  {t.message && (
                    <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
                      {t.message}
                    </p>
                  )}
                  {t.action && (
                    <button
                      type="button"
                      className="btn-ghost mt-2 !px-0 !text-[11.5px] !text-gold-300"
                      onClick={() => {
                        t.action?.onClick();
                        dismiss(t.id);
                      }}
                    >
                      {t.action.label}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  className="btn-ghost !p-1 !text-ink-faint hover:!text-ink"
                  onClick={() => dismiss(t.id)}
                  aria-label="Cerrar"
                >
                  <IconX width={12} height={12} />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de ToastProvider");
  return ctx;
}

export function toastGlobal(
  kind: ToastKind,
  title: string,
  message?: string,
  action?: { label: string; onClick: () => void },
): void {
  window.dispatchEvent(
    new CustomEvent("metta-toast", {
      detail: { kind, title, message, action },
    }),
  );
}

export function ToastBridge() {
  const { push } = useToast();
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail as {
        kind: ToastKind;
        title: string;
        message?: string;
        action?: { label: string; onClick: () => void };
      };
      push(d);
    };
    window.addEventListener("metta-toast", handler);
    return () => window.removeEventListener("metta-toast", handler);
  }, [push]);
  return null;
}
