"use client";

import { motion } from "framer-motion";
import { IconExternal, IconShield } from "./Icons";
import { RELEASE_URL, RELEASE_VERSION, REPO_URL } from "@/data/downloads";

export function SecuritySection() {
  return (
    <section id="security" className="relative py-24 sm:py-28">
      <div className="container-page">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="glass relative overflow-hidden p-7 sm:p-10"
        >
          <div className="pointer-events-none absolute inset-0 bg-halo opacity-70" />

          <div className="relative grid items-center gap-8 lg:grid-cols-[1.1fr,1fr]">
            <div>
              <div className="eyebrow">Confianza</div>
              <h2 className="h2 mt-3 text-balance">
                Descargas oficiales, servidas desde GitHub.
              </h2>
              <p className="lead mt-4 text-pretty">
                Todas las descargas de Metta Launcher se sirven directamente
                desde GitHub Releases del repositorio oficial. No hay mirrors,
                no hay reempaquetados, no hay terceros. El hash de cada archivo
                queda fijado al tag de la versión publicada.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <a
                  href={RELEASE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-gold"
                  aria-label={`Ver release v${RELEASE_VERSION} en GitHub`}
                >
                  <IconExternal width={14} height={14} />
                  Ver release v{RELEASE_VERSION}
                </a>
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost"
                  aria-label="Ver código fuente en GitHub"
                >
                  <IconShield width={14} height={14} />
                  Código fuente
                </a>
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-canvas-raised/55 p-5">
              <div className="eyebrow">Verifica el origen</div>
              <p className="muted mt-2">
                Antes de descargar, comprueba siempre que la URL empieza por:
              </p>
              <code className="mt-3 block break-all rounded-xl bg-canvas-deep/80 p-3 font-mono text-[12px] text-gold-200">
                https://github.com/abrahammettatobal-lang/Metta-Launcher/releases/
              </code>
              <ul className="mt-4 space-y-2 text-[12.5px] text-ink-soft">
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400" />
                  Cualquier dominio distinto a github.com no es oficial.
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400" />
                  Las versiones obsoletas siguen disponibles en el historial.
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400" />
                  Los binarios se generan automáticamente con GitHub Actions.
                </li>
              </ul>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
