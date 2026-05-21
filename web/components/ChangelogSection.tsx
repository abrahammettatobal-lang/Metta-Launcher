"use client";

import { motion } from "framer-motion";
import { RELEASE_VERSION } from "@/data/downloads";

interface ChangeGroup {
  version: string;
  date: string;
  highlights: string[];
}

const CHANGELOG: ChangeGroup[] = [
  {
    version: "0.4.0",
    date: "Mayo 2026",
    highlights: [
      "Login Microsoft con refresh automático, logout y mensajes de error en español.",
      "Diagnóstico del sistema, comprobación de red, limpieza de caché y reparación de instancias.",
      "Backups ZIP, restauración e importación de instancias desde archivo.",
      "Historial de lanzamientos con duración y código de salida.",
      "Actualizaciones automáticas in-app: Metta se parchea solo y reinicia, sin desinstalar.",
      "Gestor de mods con metadata (Fabric/Forge/NeoForge) y detección de duplicados.",
      "Comprobador de actualizaciones del launcher desde GitHub Releases.",
      "UI premium renovada: toasts, onboarding, edición de instancias y animaciones.",
    ],
  },
  {
    version: "0.3.1",
    date: "2025",
    highlights: [
      "Soporte Bedrock en Windows con detección automática.",
      "Descargas concurrentes con verificación SHA-1.",
      "Gestión de instancias multi-loader (Vanilla, Fabric, Forge, NeoForge).",
    ],
  },
];

export function ChangelogSection() {
  return (
    <section id="changelog" className="relative py-24 sm:py-28">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <div className="eyebrow">Novedades</div>
          <h2 className="h2 mt-3 text-balance">
            Qué trae la v{RELEASE_VERSION}
          </h2>
          <p className="lead mt-4 text-pretty">
            Metta Launcher evoluciona en cada release. Aquí tienes lo más
            relevante de la versión actual y las anteriores.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-3xl space-y-6">
          {CHANGELOG.map((entry, i) => (
            <motion.article
              key={entry.version}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: i * 0.06 }}
              className={`glass p-7 sm:p-8 ${
                entry.version === RELEASE_VERSION
                  ? "border-gold-500/35"
                  : ""
              }`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={
                    entry.version === RELEASE_VERSION
                      ? "pill-gold font-mono text-[12px]"
                      : "chip font-mono text-[12px]"
                  }
                >
                  v{entry.version}
                </span>
                <span className="text-[12px] text-ink-faint">{entry.date}</span>
                {entry.version === RELEASE_VERSION && (
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-300">
                    Actual
                  </span>
                )}
              </div>
              <ul className="mt-5 space-y-2.5 text-[13.5px] text-ink-soft">
                {entry.highlights.map((h) => (
                  <li key={h} className="flex gap-3">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400/80" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
