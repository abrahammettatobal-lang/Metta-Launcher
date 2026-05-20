import { motion } from "framer-motion";
import { useState, type ReactNode } from "react";
import { IconPlay, IconSliders } from "./icons";
import { cx } from "./cx";
import { MettaMark } from "./icons";

interface HeroProps {
  title: string;
  subtitle: string;
  loaderLabel: string;
  versionLabel: string;
  onPlay: () => void;
  onConfig?: () => void;
  playLabel?: string;
  playing?: boolean;
  disabled?: boolean;
  progress?: number | null;
  progressLabel?: string;
  className?: string;
  extra?: ReactNode;
  /** Cinematic Minecraft background image */
  imageUrl?: string | null;
}

export function Hero({
  title,
  subtitle,
  loaderLabel,
  versionLabel,
  onPlay,
  onConfig,
  playLabel = "JUGAR",
  playing,
  disabled,
  progress,
  progressLabel,
  className,
  extra,
  imageUrl,
}: HeroProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = imageUrl && !imgFailed;
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={cx(
        "relative overflow-hidden rounded-3xl border border-line shadow-floating",
        className,
      )}
    >
      {/* Hero atmospheric backdrop */}
      <div className="absolute inset-0 bg-hero-night" />
      {showImg && (
        <>
          <img
            src={imageUrl!}
            alt=""
            aria-hidden
            onError={() => setImgFailed(true)}
            className="absolute inset-0 h-full w-full object-cover opacity-80"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-canvas-deep/65 via-canvas-deep/25 to-transparent" />
        </>
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-canvas-deep via-canvas-deep/85 via-40% to-canvas-deep/10" />
      <div className="absolute inset-0 bg-gradient-to-t from-canvas-deep via-transparent to-transparent" />
      {/* Soft top gloss */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-glow to-transparent" />
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gold-500/15 blur-3xl" />
      {/* Grain */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />

      <div className="relative grid gap-8 p-7 sm:grid-cols-[1.05fr_1fr] sm:p-9">
        <div className="flex flex-col justify-between gap-8">
          <div>
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-gold-300/90">
              ¡Listo para jugar!
            </div>
            <h2 className="font-display text-[34px] font-bold leading-[1.05] tracking-tight text-ink">
              {title}
            </h2>
            <p className="mt-3 max-w-md text-[13.5px] leading-relaxed text-ink-soft">
              {subtitle}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="pill-gold">{loaderLabel}</span>
              <span className="pill">Minecraft · {versionLabel}</span>
              {playing && <span className="pill-live">● en ejecución</span>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <motion.button
              type="button"
              whileTap={{ scale: 0.985 }}
              whileHover={!disabled ? { y: -1 } : undefined}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              disabled={disabled}
              onClick={onPlay}
              className="btn-gold btn-gold-lg group min-w-[180px]"
            >
              <IconPlay width={16} height={16} />
              {playLabel}
            </motion.button>
            {onConfig && (
              <button
                type="button"
                onClick={onConfig}
                className="btn h-[52px] !w-[52px] !p-0"
                aria-label="Configuración de instancia"
                title="Configuración de instancia"
              >
                <IconSliders width={18} height={18} />
              </button>
            )}
            {progress !== undefined && progress !== null && (
              <div className="ml-1 min-w-[180px] flex-1">
                <div className="mb-1.5 flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
                  <span>{progressLabel ?? "Progreso"}</span>
                  <span className="text-gold-300">{progress}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas-deep">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-gold-300 via-gold-200 to-gold-400"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.4 }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right ornament — gold ring + Metta mark.
            On wider screens it doubles as a logomark cue inside the hero. */}
        <div className="relative hidden items-center justify-center sm:flex">
          <div className="relative aspect-square w-full max-w-[260px]">
            <div className="absolute inset-2 rounded-full border border-gold-500/15 blur-[1px]" />
            <div className="absolute inset-8 rounded-full border border-gold-500/25" />
            <div className="absolute inset-[24%] rounded-full border border-gold-500/40 bg-gradient-to-br from-gold-500/15 via-transparent to-transparent shadow-[0_0_60px_8px_rgba(228,188,60,0.22)]" />
            <div className="absolute inset-0 flex items-center justify-center">
              <MettaMark
                size={140}
                className="rounded-[28px] drop-shadow-[0_18px_40px_rgba(228,188,60,0.45)]"
              />
            </div>
            <svg
              className="absolute inset-0 h-full w-full opacity-40"
              viewBox="0 0 200 200"
              fill="none"
              aria-hidden
            >
              <defs>
                <radialGradient id="hero-rg" cx="50%" cy="50%" r="50%">
                  <stop offset="0" stopColor="#e4bc3c" stopOpacity="0.45" />
                  <stop offset="1" stopColor="#e4bc3c" stopOpacity="0" />
                </radialGradient>
              </defs>
              <circle cx="100" cy="100" r="98" stroke="url(#hero-rg)" />
            </svg>
          </div>
        </div>
      </div>

      {extra && (
        <div className="relative border-t border-line/70 bg-canvas-deep/60 px-7 py-3 backdrop-blur-md sm:px-9">
          {extra}
        </div>
      )}
    </motion.section>
  );
}
