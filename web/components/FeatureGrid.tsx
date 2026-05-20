"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface Feature {
  title: string;
  description: string;
  badge?: string;
  glyph: ReactNode;
}

const features: Feature[] = [
  {
    title: "Vanilla, Fabric, Forge y NeoForge",
    description:
      "Crea instancias con el loader que quieras. El launcher resuelve dependencias y versiones por ti, incluyendo Mojang manifests, Fabric meta y catálogos NeoForge.",
    badge: "Multi-loader",
    glyph: <GlyphLoader />,
  },
  {
    title: "Minecraft Bedrock en Windows",
    description:
      "Si tienes Bedrock instalado desde Microsoft Store, Metta lo detecta automáticamente, lo lanza y te da accesos rápidos a mundos, resource packs y behavior packs.",
    badge: "Windows-only",
    glyph: <GlyphBedrock />,
  },
  {
    title: "Gestión de instancias",
    description:
      "Cada instancia es un mundo aislado: su propia versión, sus propios mods, su propio almacenamiento. Cámbiate entre 1.7.10 y la última snapshot sin conflictos.",
    glyph: <GlyphInstances />,
  },
  {
    title: "Mods por instancia",
    description:
      "Activa, desactiva o elimina mods individualmente. Sin colisiones entre packs, sin tener que duplicar carpetas a mano.",
    glyph: <GlyphMods />,
  },
  {
    title: "Interfaz moderna",
    description:
      "Diseño premium negro/dorado pensado para que el launcher se sienta como un producto, no como una herramienta. Atajos, animaciones suaves y modo cinematográfico.",
    glyph: <GlyphInterface />,
  },
  {
    title: "Rendimiento optimizado",
    description:
      "Descargas concurrentes con verificación SHA-1, caché compartida de librerías y assets, y lanzamiento sin bloqueos del UI thread.",
    glyph: <GlyphPerformance />,
  },
  {
    title: "Descargas verificadas",
    description:
      "Cada artefacto se baja del CDN oficial de Mojang y se valida por hash. Si un archivo cambia o se corrompe, se vuelve a descargar.",
    badge: "SHA-1",
    glyph: <GlyphShield />,
  },
  {
    title: "Java y RAM configurables",
    description:
      "Detecta tus instalaciones de Java o usa la que prefieras. Memoria mínima/máxima y argumentos JVM globales o por instancia, sin tener que editar archivos a mano.",
    glyph: <GlyphJava />,
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="relative py-24 sm:py-28">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <div className="eyebrow">Características</div>
          <h2 className="h2 mt-3 text-balance">
            Todo lo que un launcher moderno debería ser.
          </h2>
          <p className="lead mt-4 text-pretty">
            Diseñado para que la única fricción entre tú y Minecraft sea elegir
            qué jugar. Sin instaladores frágiles, sin pasos ocultos, sin UI de
            los 2000.
          </p>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.article
              key={f.title}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.55, delay: i * 0.04, ease: "easeOut" }}
              className="card group"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-gold-500/30 bg-gold-haze/40 text-gold-200 transition-colors group-hover:bg-gold-haze">
                  {f.glyph}
                </div>
                {f.badge && <span className="chip">{f.badge}</span>}
              </div>
              <h3 className="h3 mt-5">{f.title}</h3>
              <p className="muted mt-2 text-pretty">{f.description}</p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Inline glyphs ────────────────────────────────────────────────────────── */

const G = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function GlyphLoader() {
  return (
    <svg {...G}>
      <path d="M4 6h16M4 12h16M4 18h10" />
      <circle cx="19" cy="18" r="2.2" />
    </svg>
  );
}
function GlyphBedrock() {
  return (
    <svg {...G}>
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 12l9 5 9-5" />
      <path d="M3 16l9 5 9-5" />
    </svg>
  );
}
function GlyphInstances() {
  return (
    <svg {...G}>
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="8" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
      <rect x="13" y="13" width="8" height="8" rx="2" />
    </svg>
  );
}
function GlyphMods() {
  return (
    <svg {...G}>
      <path d="M12 2l3 3-3 3-3-3 3-3z" />
      <path d="M12 8v13" />
      <path d="M5 16l-2 2 2 2 2-2-2-2z" />
      <path d="M19 16l2 2-2 2-2-2 2-2z" />
    </svg>
  );
}
function GlyphInterface() {
  return (
    <svg {...G}>
      <rect x="3" y="4" width="18" height="14" rx="2.5" />
      <path d="M3 9h18" />
      <circle cx="6" cy="6.5" r="0.6" fill="currentColor" />
      <circle cx="8.2" cy="6.5" r="0.6" fill="currentColor" />
      <path d="M9 21h6" />
    </svg>
  );
}
function GlyphPerformance() {
  return (
    <svg {...G}>
      <path d="M13 2L3 14h7l-1 8 11-12h-7l1-8z" />
    </svg>
  );
}
function GlyphShield() {
  return (
    <svg {...G}>
      <path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}
function GlyphJava() {
  return (
    <svg {...G}>
      <path d="M9 3c-1 2 1.5 3 1.5 4.5S9 9.5 9 11" />
      <path d="M13 3c-1 2 1.5 3 1.5 4.5S13 9.5 13 11" />
      <path d="M5 14h14a4 4 0 01-4 4H9a4 4 0 01-4-4z" />
      <path d="M7 21h10" />
    </svg>
  );
}
