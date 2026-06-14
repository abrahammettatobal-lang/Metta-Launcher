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
    version: "0.7.1",
    date: "Junio 2026",
    highlights: [
      "Fix definitivo pantalla negra en macOS: sin crossorigin en assets (WebKit).",
      "Java en macOS: detección en /Library/Java, Homebrew y extracción .tar.gz de Temurin.",
      "Arquitectura real (Intel vs Apple Silicon) desde el sistema, no el navegador.",
      "Fuentes del sistema, pantalla de carga visible e inspector WebKit en Ajustes.",
    ],
  },
  {
    version: "0.7.0",
    date: "Junio 2026",
    highlights: [
      "Fix pantalla negra en macOS Intel: assets relativos y HashRouter para Tauri.",
      "Fabric: descarga correcta desde maven.fabricmc.net y progreso por librería.",
      "Eliminar instancia borra la carpeta en disco; reimportación tras reinstalar el launcher.",
      "Metadatos .metta-instance.json en cada instancia para recuperar mundos y configuración.",
    ],
  },
  {
    version: "0.6.0",
    date: "Junio 2026",
    highlights: [
      "Lanzamiento de Minecraft 26.x con Java 25 (Temurin) y detección automática de versión.",
      "Corrección crítica en Windows: rutas extendidas (//?/) ya no rompen el classpath.",
      "Extracción de natives para el formato MC 26 y validación de assets mucho más rápida.",
      "Lanzamiento vía @argfile, diagnóstico de crashes con log de stdout y menos conflictos JVM (G1GC vs ZGC).",
      "Selección inteligente de Java por versión de Minecraft y descarga automática desde Adoptium.",
    ],
  },
  {
    version: "0.5.0",
    date: "Junio 2026",
    highlights: [
      "Badge de patrocinador en app y web, logs en vivo y optimizaciones de lanzamiento.",
      "Mejoras de rendimiento en descargas y preparación de instancias.",
    ],
  },
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
