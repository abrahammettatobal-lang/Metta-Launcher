"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RELEASE_VERSION } from "@/data/downloads";
import { IconApple, IconLinux, IconWindows } from "./Icons";

type Tab = "windows" | "macos" | "linux";

const TABS: Array<{
  id: Tab;
  label: string;
  icon: React.ComponentType<{ width?: number; height?: number }>;
}> = [
  { id: "windows", label: "Windows", icon: IconWindows },
  { id: "macos", label: "macOS", icon: IconApple },
  { id: "linux", label: "Linux", icon: IconLinux },
];

export function InstallHelp() {
  const [tab, setTab] = useState<Tab>("windows");

  return (
    <section id="install" className="relative py-24 sm:py-28">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <div className="eyebrow">Instalación</div>
          <h2 className="h2 mt-3 text-balance">
            Si tu sistema dice que no es seguro, no lo es por accidente.
          </h2>
          <p className="lead mt-4 text-pretty">
            Metta Launcher es open source y se distribuye sin certificado
            comercial. Por eso Windows y macOS pueden mostrarte una advertencia
            la primera vez. Te explicamos exactamente por qué pasa y cómo
            continuar de forma segura.
          </p>
        </div>

        <div className="mx-auto mt-10 flex max-w-md items-center justify-center gap-1 rounded-2xl border border-line bg-canvas-raised/55 p-1 backdrop-blur-md">
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-pressed={isActive}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-[12.5px] font-semibold tracking-tight transition-colors
                  ${
                    isActive
                      ? "bg-gold-gradient text-canvas shadow-gold"
                      : "text-ink-muted hover:text-ink"
                  }`}
              >
                <Icon width={14} height={14} />
                {t.label}
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="mt-8"
          >
            {tab === "windows" && <WindowsHelp />}
            {tab === "macos" && <MacHelp />}
            {tab === "linux" && <LinuxHelp />}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

function WindowsHelp() {
  return (
    <div className="glass mx-auto max-w-3xl p-7 sm:p-9">
      <h3 className="h3">Si Windows dice que no es seguro</h3>
      <p className="muted mt-3 text-pretty">
        Como Metta Launcher aún no está firmado con un certificado comercial de
        Code Signing y todavía tiene pocos reportes de descarga,{" "}
        <span className="text-ink">Windows SmartScreen</span> puede mostrar el
        mensaje{" "}
        <span className="text-ink">
          “Windows protegió tu PC”
        </span>{" "}
        la primera vez que abras el instalador. Esto es un aviso de reputación,
        no significa que el archivo esté infectado.
      </p>

      <ol className="mt-6 space-y-3 text-[13.5px] text-ink-soft">
        {[
          "Haz clic en “Más información” dentro del cuadro de advertencia.",
          "Pulsa “Ejecutar de todas formas”.",
          "Continúa la instalación normalmente como con cualquier otra app.",
          "Si descargaste el MSI, ábrelo como administrador si Windows lo solicita.",
        ].map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gold-500/40 bg-gold-haze/40 text-[11px] font-bold text-gold-200">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      <div className="mt-7 rounded-2xl border border-line bg-canvas-raised/50 p-4 text-[12.5px] text-ink-muted">
        <span className="text-ink">Por qué pasa:</span> SmartScreen evalúa la
        reputación combinada del archivo y del firmante. Las apps nuevas o sin
        certificado EV pagado salen marcadas hasta acumular descargas. Una vez
        instalado, no volverá a aparecer.
      </div>
    </div>
  );
}

function MacHelp() {
  return (
    <div className="glass mx-auto max-w-3xl p-7 sm:p-9">
      <h3 className="h3">Si macOS bloquea la app</h3>
      <p className="muted mt-3 text-pretty">
        macOS Gatekeeper puede bloquear apps descargadas fuera de la App Store
        si no están notarizadas por Apple. Notarizar requiere una cuenta de
        desarrollador de pago, así que Metta Launcher se distribuye sin
        notarización por ahora. Puedes abrirla de forma segura siguiendo el
        método oficial de Apple.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-gold-500/30 bg-gold-haze/30 p-5">
          <div className="eyebrow">Método recomendado</div>
          <ol className="mt-3 space-y-2.5 text-[13px] text-ink-soft">
            <li>1. Abre <span className="text-ink">Configuración del Sistema</span>.</li>
            <li>2. Ve a <span className="text-ink">Privacidad y seguridad</span>.</li>
            <li>3. Busca el mensaje sobre Metta Launcher.</li>
            <li>4. Pulsa <span className="text-ink">“Abrir de todos modos”</span>.</li>
            <li>5. Confirma con tu contraseña o Touch ID.</li>
          </ol>
        </div>

        <div className="rounded-2xl border border-line bg-canvas-raised/50 p-5">
          <div className="eyebrow">Método alternativo</div>
          <ol className="mt-3 space-y-2.5 text-[13px] text-ink-soft">
            <li>1. Haz <span className="text-ink">clic derecho</span> sobre Metta Launcher.</li>
            <li>2. Selecciona <span className="text-ink">“Abrir”</span>.</li>
            <li>3. Confirma <span className="text-ink">“Abrir”</span> en el diálogo.</li>
          </ol>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-line bg-canvas-raised/50 p-4 text-[12.5px] text-ink-muted">
        <span className="text-ink">No desactives Gatekeeper</span>: nunca uses
        comandos como <span className="font-mono">spctl --master-disable</span>{" "}
        ni desactives la protección del sistema. Los dos métodos de arriba
        autorizan solo Metta Launcher sin reducir la seguridad del resto del
        equipo.
      </div>
    </div>
  );
}

function LinuxHelp() {
  return (
    <div className="glass mx-auto max-w-3xl p-7 sm:p-9">
      <h3 className="h3">Instalación en Linux</h3>
      <p className="muted mt-3 text-pretty">
        Elige el formato que mejor encaje con tu distribución. Todos los
        comandos asumen que ejecutas la terminal desde la carpeta donde
        descargaste el archivo.
      </p>

      <div className="mt-6 space-y-4">
        <CommandBlock
          title="Debian / Ubuntu / Pop!_OS / Mint"
          format="DEB"
          command={`sudo apt install ./Metta.Launcher_${RELEASE_VERSION}_amd64.deb`}
        />
        <CommandBlock
          title="Fedora / RHEL / openSUSE"
          format="RPM"
          command={`sudo rpm -i ./Metta.Launcher-${RELEASE_VERSION}-1.x86_64.rpm`}
        />
        <CommandBlock
          title="Universal (cualquier distro)"
          format="AppImage"
          command={`chmod +x Metta.Launcher_${RELEASE_VERSION}_amd64.AppImage\n./Metta.Launcher_${RELEASE_VERSION}_amd64.AppImage`}
        />
      </div>

      <div className="mt-6 rounded-2xl border border-line bg-canvas-raised/50 p-4 text-[12.5px] text-ink-muted">
        <span className="text-ink">¿El AppImage no abre?</span> En distros
        modernas puede faltar la librería de compatibilidad de FUSE 2. Instálala
        con:
        <pre className="mt-2 overflow-x-auto rounded-lg bg-canvas-deep/80 p-3 font-mono text-[12px] text-ink">
sudo apt install libfuse2
        </pre>
      </div>
    </div>
  );
}

function CommandBlock({
  title,
  format,
  command,
}: {
  title: string;
  format: string;
  command: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-canvas-raised/55 p-5">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-semibold tracking-tight text-ink">
          {title}
        </div>
        <span className="chip">{format}</span>
      </div>
      <pre className="mt-3 overflow-x-auto rounded-xl bg-canvas-deep/80 p-4 font-mono text-[12.5px] leading-relaxed text-ink">
{command}
      </pre>
    </div>
  );
}
