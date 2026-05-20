"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { detectPlatform, type Platform } from "@/lib/detectPlatform";
import { downloads, RELEASE_VERSION } from "@/data/downloads";
import {
  IconApple,
  IconDownload,
  IconLinux,
  IconSparkle,
  IconWindows,
} from "./Icons";

const PLATFORM_META: Record<
  Exclude<Platform, "unknown">,
  { label: string; icon: React.ComponentType<{ width?: number; height?: number }> }
> = {
  windows: { label: "Windows", icon: IconWindows },
  macos: { label: "macOS", icon: IconApple },
  linux: { label: "Linux", icon: IconLinux },
};

export function Hero() {
  const [platform, setPlatform] = useState<Platform>("unknown");

  useEffect(() => {
    setPlatform(detectPlatform().os);
  }, []);

  const primary =
    platform === "windows"
      ? downloads.windows.assets[0]
      : platform === "macos"
        ? downloads.macos.assets[0]
        : platform === "linux"
          ? downloads.linux.assets[0]
          : downloads.windows.assets[0];

  const PlatformIcon =
    platform !== "unknown" ? PLATFORM_META[platform].icon : IconDownload;
  const platformLabel =
    platform !== "unknown"
      ? PLATFORM_META[platform].label
      : "tu plataforma";

  return (
    <section id="top" className="relative pt-28 sm:pt-36">
      <div className="container-page relative z-10">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr,1fr]">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="relative"
          >
            <div className="flex items-center gap-2">
              <span className="pill-gold">
                <IconSparkle width={11} height={11} /> v{RELEASE_VERSION} disponible
              </span>
              <span className="chip">Free · Open source</span>
            </div>

            <h1 className="h1 mt-5 text-balance">
              Tu mundo.{" "}
              <span className="gold-text">Tu forma de jugar.</span>
            </h1>

            <p className="lead mt-5 max-w-[560px] text-pretty">
              Metta Launcher es un launcher moderno para Minecraft con soporte
              para <span className="text-ink">Vanilla, Fabric, Forge y NeoForge</span>{" "}
              y, en Windows, <span className="text-ink">Bedrock Edition</span>.
              Lanza, gestiona y personaliza tus instancias con una experiencia
              rápida, segura y enfocada en jugar.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <motion.a
                whileTap={{ scale: 0.99 }}
                href={primary.url}
                download={primary.filename}
                className="btn-gold text-[14.5px]"
                aria-label={`Descargar Metta Launcher para ${platformLabel}`}
              >
                <PlatformIcon width={16} height={16} />
                Descargar para {platformLabel}
              </motion.a>
              <a
                href="#downloads"
                className="btn-ghost text-[13.5px]"
                aria-label="Ver todas las descargas disponibles"
              >
                <IconDownload width={14} height={14} />
                Ver todas las descargas
              </a>
            </div>

            <div className="mt-5 flex items-center gap-3 text-[11.5px] text-ink-faint">
              <span className="inline-flex items-center gap-1.5">
                <IconWindows width={12} height={12} /> Windows
              </span>
              <span className="h-1 w-1 rounded-full bg-ink-faint/50" />
              <span className="inline-flex items-center gap-1.5">
                <IconApple width={12} height={12} /> macOS
              </span>
              <span className="h-1 w-1 rounded-full bg-ink-faint/50" />
              <span className="inline-flex items-center gap-1.5">
                <IconLinux width={12} height={12} /> Linux
              </span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, ease: "easeOut", delay: 0.15 }}
            className="relative"
          >
            <div className="pointer-events-none absolute -inset-10 bg-halo opacity-90 blur-2xl" />
            <div className="glass relative overflow-hidden rounded-[28px] p-2">
              <div className="absolute inset-0 bg-gradient-to-b from-gold-500/5 via-transparent to-transparent" />
              <Image
                src="/og-image.png"
                alt="Captura premium de Metta Launcher mostrando el dashboard"
                width={1280}
                height={800}
                priority
                className="relative h-auto w-full rounded-[22px] object-cover"
              />
              <div className="pointer-events-none absolute inset-0 rounded-[22px] ring-1 ring-inset ring-white/5" />
            </div>

            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -bottom-6 -right-4 hidden rounded-2xl border border-gold-500/30 bg-canvas-raised/80 px-4 py-3 backdrop-blur-xl sm:flex sm:items-center sm:gap-3"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gold-haze text-gold-200">
                <IconSparkle />
              </span>
              <div>
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-gold-300">
                  Build oficial
                </div>
                <div className="text-[12.5px] text-ink-soft">
                  Firmado en GitHub · v{RELEASE_VERSION}
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
