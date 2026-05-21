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
  imageUrl?: string | null;
}

export function Hero({
  title,
  subtitle,
  loaderLabel,
  versionLabel,
  onPlay,
  onConfig,
  playLabel = "Jugar",
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
  const showProgress = progress !== undefined && progress !== null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      className={cx("hero-shell relative overflow-hidden", className)}
    >
      <div className="absolute inset-0 bg-hero-night" />
      {showImg && (
        <>
          <img
            src={imageUrl!}
            alt=""
            aria-hidden
            onError={() => setImgFailed(true)}
            className="absolute inset-0 h-full w-full object-cover opacity-55 saturate-[0.85]"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#080807]/95 via-[#080807]/72 to-[#080807]/20" />
        </>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#080807] via-transparent to-[#080807]/30" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-500/35 to-transparent" />
      <div className="pointer-events-none absolute -left-20 top-1/3 h-56 w-56 rounded-full bg-gold-500/10 blur-3xl" />

      <div className="relative grid gap-8 p-6 sm:grid-cols-[1.15fr_0.85fr] sm:p-8 lg:p-9">
        <div className="flex flex-col justify-between gap-8">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-section">Instancia activa</span>
              {playing && <span className="pill-live">En ejecución</span>}
            </div>
            <h2 className="font-display text-[clamp(1.75rem,4vw,2.25rem)] font-bold leading-[1.08] tracking-[-0.02em] text-ink">
              {title}
            </h2>
            <p className="mt-2.5 max-w-lg text-[13.5px] leading-relaxed text-ink-muted">
              {subtitle}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="pill-gold">{loaderLabel}</span>
              <span className="pill">{versionLabel}</span>
            </div>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex flex-wrap items-center gap-2.5">
              <motion.button
                type="button"
                whileTap={{ scale: 0.985 }}
                whileHover={!disabled ? { y: -1 } : undefined}
                disabled={disabled}
                onClick={onPlay}
                className={cx(
                  "btn-gold btn-gold-lg group min-w-[168px]",
                  !disabled && !playing && "animate-pulse-glow",
                )}
              >
                <IconPlay width={16} height={16} />
                {playing ? "En juego" : playLabel}
              </motion.button>
              {onConfig && (
                <button
                  type="button"
                  onClick={onConfig}
                  className="btn h-[50px] w-[50px] !p-0"
                  aria-label="Configurar instancia"
                >
                  <IconSliders width={17} height={17} />
                </button>
              )}
            </div>
            {showProgress && (
              <div className="min-w-[200px] flex-1 sm:max-w-xs">
                <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-faint">
                  <span>{progressLabel ?? "Progreso"}</span>
                  <span className="text-gold-300">{progress}%</span>
                </div>
                <div className="progress-track">
                  <motion.div
                    className="progress-fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="relative hidden items-center justify-center sm:flex">
          <div className="relative aspect-square w-full max-w-[220px]">
            <div className="absolute inset-0 rounded-full border border-gold-500/12" />
            <div className="absolute inset-6 rounded-full border border-gold-500/22" />
            <div className="absolute inset-[18%] rounded-full bg-gradient-to-br from-gold-500/12 via-transparent to-transparent shadow-gold-soft" />
            <div className="absolute inset-0 flex items-center justify-center">
              <MettaMark
                size={120}
                className="rounded-[24px] drop-shadow-[0_16px_36px_rgba(201,162,39,0.35)]"
              />
            </div>
          </div>
        </div>
      </div>

      {extra && <div className="hero-footer relative px-6 sm:px-8 lg:px-9">{extra}</div>}
    </motion.section>
  );
}
