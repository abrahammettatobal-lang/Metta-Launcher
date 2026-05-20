"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { IconGithub } from "./Icons";
import { REPO_URL } from "@/data/downloads";

export function Navbar() {
  return (
    <motion.header
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="fixed inset-x-0 top-0 z-50"
    >
      <div className="container-page mt-4">
        <nav
          className="glass-soft flex items-center justify-between gap-4 rounded-2xl px-4 py-2.5"
          aria-label="Navegación principal"
        >
          <a
            href="#top"
            className="flex items-center gap-2.5"
            aria-label="Inicio Metta Launcher"
          >
            <span className="relative inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg ring-1 ring-gold-500/30">
              <Image
                src="/metta-logo.png"
                alt=""
                width={32}
                height={32}
                className="h-7 w-7 object-contain"
                priority
              />
            </span>
            <span className="font-display text-[14.5px] font-semibold tracking-tight">
              Metta <span className="gold-text">Launcher</span>
            </span>
          </a>

          <div className="hidden items-center gap-1 sm:flex">
            <a href="#features" className="btn-soft border-transparent bg-transparent hover:bg-canvas-raised/40">
              Características
            </a>
            <a href="#downloads" className="btn-soft border-transparent bg-transparent hover:bg-canvas-raised/40">
              Descargas
            </a>
            <a href="#install" className="btn-soft border-transparent bg-transparent hover:bg-canvas-raised/40">
              Instalación
            </a>
            <a href="#faq" className="btn-soft border-transparent bg-transparent hover:bg-canvas-raised/40">
              FAQ
            </a>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-soft"
              aria-label="Repositorio en GitHub"
            >
              <IconGithub width={14} height={14} />
              <span className="hidden sm:inline">GitHub</span>
            </a>
            <a
              href="#downloads"
              className="btn-gold !px-4 !py-2 text-[12.5px]"
              aria-label="Ir a descargas"
            >
              Descargar
            </a>
          </div>
        </nav>
      </div>
    </motion.header>
  );
}
