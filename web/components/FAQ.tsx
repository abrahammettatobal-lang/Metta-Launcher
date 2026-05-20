"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { IconChevronDown } from "./Icons";

interface QA {
  q: string;
  a: React.ReactNode;
}

const faqs: QA[] = [
  {
    q: "¿Es gratis?",
    a: (
      <>
        Sí. Metta Launcher es <strong className="text-ink">100% gratuito</strong>{" "}
        y open source. No hay suscripciones, no hay anuncios, no hay
        microtransacciones, y no se requiere registro para usarlo.
      </>
    ),
  },
  {
    q: "¿Funciona con Fabric?",
    a: (
      <>
        Sí. Al crear una instancia puedes elegir Fabric como loader y el
        launcher resolverá la versión del loader compatible con la versión de
        Minecraft que selecciones. También soporta Quilt-style profiles.
      </>
    ),
  },
  {
    q: "¿Funciona con Forge y NeoForge?",
    a: (
      <>
        Sí, ambos. Para NeoForge el launcher filtra automáticamente las
        versiones disponibles para tu versión de Minecraft y descarta las RC y
        betas, dejándote sólo las estables.
      </>
    ),
  },
  {
    q: "¿Tiene Bedrock?",
    a: (
      <>
        Sí, pero <strong className="text-ink">sólo en Windows</strong> y sólo si
        ya tienes Minecraft Bedrock instalado desde Microsoft Store o Xbox App.
        Metta lo detecta automáticamente, lo lanza, te muestra la versión y te
        da accesos rápidos a tus mundos, resource packs y behavior packs. No
        sustituye la copia oficial ni la pirateé.
      </>
    ),
  },
  {
    q: "¿Por qué Windows dice que no es seguro?",
    a: (
      <>
        Porque Metta Launcher todavía no tiene un certificado de Code Signing
        comercial. Windows SmartScreen muestra ese aviso a las apps con poca
        reputación de descarga acumulada. No significa que el archivo esté
        infectado: el ejecutable se baja directamente del repositorio oficial.
        En la sección de instalación tienes los pasos exactos para continuar de
        forma segura.
      </>
    ),
  },
  {
    q: "¿Por qué macOS bloquea la app?",
    a: (
      <>
        Porque la notarización por parte de Apple requiere una cuenta de
        desarrollador de pago. Mientras eso llega, macOS marca la app como
        “de origen no identificado”. Puedes autorizarla solo a ella (sin
        desactivar Gatekeeper) desde Configuración del Sistema → Privacidad y
        seguridad.
      </>
    ),
  },
  {
    q: "¿Necesito Java?",
    a: (
      <>
        Para Minecraft Java sí. Metta detecta tus instalaciones de Java
        automáticamente o puedes apuntar a una concreta desde Ajustes. Para
        Bedrock no se usa Java.
      </>
    ),
  },
  {
    q: "¿Dónde se guardan mis instancias?",
    a: (
      <>
        Por defecto en{" "}
        <code className="font-mono text-ink">
          %AppData%/MettaLauncher
        </code>{" "}
        en Windows y en el equivalente en macOS/Linux. Puedes cambiar el
        directorio raíz desde Ajustes; el launcher migrará la configuración sin
        moverte los mundos.
      </>
    ),
  },
];

export function FAQ() {
  return (
    <section id="faq" className="relative py-24 sm:py-28">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <div className="eyebrow">Preguntas frecuentes</div>
          <h2 className="h2 mt-3 text-balance">
            Lo que la gente suele preguntar antes de descargar.
          </h2>
        </div>

        <div className="mx-auto mt-10 max-w-3xl space-y-3">
          {faqs.map((f, i) => (
            <FAQItem key={f.q} item={f} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQItem({ item, index }: { item: QA; index: number }) {
  const [open, setOpen] = useState(false);
  const id = `faq-${index}`;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, delay: index * 0.03 }}
      className="glass-soft overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-canvas-raised/40"
      >
        <span className="font-display text-[14.5px] font-semibold tracking-tight text-ink">
          {item.q}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-line text-ink-muted"
        >
          <IconChevronDown width={14} height={14} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 text-[13.5px] leading-relaxed text-ink-soft">
              {item.a}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
