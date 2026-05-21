import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  accountAddOffline,
  appPaths,
  launcherSetRoot,
  settingGet,
  settingSet,
} from "../services/bridge";
import { javaDetect } from "../services/bridge";
import { Card } from "../ui/Card";
import { Field } from "../ui/Field";
import { tap, toastOk } from "../utils/tap";

export function OnboardingGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    void (async () => {
      const done = await settingGet("onboardingComplete");
      setShow(done !== "true");
      setReady(true);
    })();
  }, []);

  if (!ready) return null;
  if (!show) return <>{children}</>;

  return (
    <>
      {children}
      <OnboardingModal onDone={() => setShow(false)} />
    </>
  );
}

function OnboardingModal({ onDone }: { onDone: () => void }) {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [root, setRoot] = useState("");
  const [offlineName, setOfflineName] = useState("");
  const [javaInfo, setJavaInfo] = useState("");

  useEffect(() => {
    void appPaths().then((p) => setRoot(p.launcherRoot));
    void javaDetect().then((j) => {
      if (j.length) setJavaInfo(`${j[0].version ?? "?"} · ${j[0].path}`);
      else setJavaInfo("No detectado — se descargará al lanzar");
    });
  }, []);

  const finish = () =>
    tap("Finalizar onboarding", async () => {
      if (root.trim()) await launcherSetRoot(root.trim());
      await settingSet("onboardingComplete", "true");
      toastOk("Metta Launcher listo");
      onDone();
      nav("/");
    });

  const steps = [
    {
      title: "Bienvenido a Metta",
      body: "Configura tu launcher en unos pasos. Todo se guarda localmente.",
    },
    {
      title: "Carpeta del launcher",
      body: "Aquí se instalarán versiones, assets e instancias.",
    },
    {
      title: "Java",
      body: javaInfo || "Detectando…",
    },
    {
      title: "Tu perfil",
      body: "Puedes usar Microsoft después en Cuentas. Por ahora, un nombre local.",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas-deep/80 p-6 backdrop-blur-md">
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="w-full max-w-lg"
        >
          <Card title={steps[step].title}>
            <p className="text-[13px] leading-relaxed text-ink-muted">
              {steps[step].body}
            </p>

            {step === 1 && (
              <Field
                className="mt-4"
                label="Ruta"
                value={root}
                onChange={(e) => setRoot(e.target.value)}
              />
            )}

            {step === 3 && (
              <Field
                className="mt-4"
                label="Nombre de jugador local"
                value={offlineName}
                onChange={(e) => setOfflineName(e.target.value)}
              />
            )}

            <div className="mt-6 flex items-center justify-between gap-3">
              <div className="text-[11px] text-ink-faint">
                Paso {step + 1} de {steps.length}
              </div>
              <div className="flex gap-2">
                {step > 0 && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setStep((s) => s - 1)}
                  >
                    Atrás
                  </button>
                )}
                {step < steps.length - 1 ? (
                  <button
                    type="button"
                    className="btn-gold"
                    onClick={() => setStep((s) => s + 1)}
                  >
                    Siguiente
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-gold"
                    disabled={!offlineName.trim()}
                    onClick={() =>
                      tap("Crear perfil", async () => {
                        await accountAddOffline(offlineName.trim());
                        await finish();
                      })
                    }
                  >
                    Empezar
                  </button>
                )}
              </div>
            </div>
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
