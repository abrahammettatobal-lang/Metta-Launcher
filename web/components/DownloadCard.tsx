"use client";

import { motion } from "framer-motion";
import type { DownloadAsset } from "@/data/downloads";
import { IconDownload } from "./Icons";

interface Props {
  asset: DownloadAsset;
  emphasize?: boolean;
}

export function DownloadCard({ asset, emphasize = false }: Props) {
  const isAdvanced = asset.variant === "advanced";

  return (
    <motion.a
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
      transition={{ duration: 0.18 }}
      href={asset.url}
      download={asset.filename}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Descargar ${asset.name}`}
      className={`group flex flex-col gap-3 rounded-2xl border p-5 transition-all
        ${
          emphasize
            ? "border-gold-500/50 bg-gold-haze/35 shadow-glow"
            : "border-line bg-canvas-raised/55"
        }
        hover:border-gold-500/45 hover:bg-canvas-raised/70`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display text-[15px] font-semibold tracking-tight text-ink">
              {asset.name}
            </span>
            {emphasize && <span className="pill-gold">Recomendado</span>}
            {isAdvanced && <span className="chip">Avanzado</span>}
          </div>
          {asset.hint && (
            <div className="mt-1 text-[12px] text-ink-muted">{asset.hint}</div>
          )}
        </div>
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl
            ${
              emphasize
                ? "bg-gold-gradient text-canvas shadow-gold"
                : "bg-canvas-raised text-ink-soft group-hover:text-gold-200"
            }`}
        >
          <IconDownload width={16} height={16} />
        </div>
      </div>

      <div className="truncate font-mono text-[10.5px] text-ink-faint">
        {asset.filename}
      </div>
    </motion.a>
  );
}
