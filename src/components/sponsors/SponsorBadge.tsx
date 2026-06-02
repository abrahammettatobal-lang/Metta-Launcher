import { openUrl } from "@tauri-apps/plugin-opener";
import { motion } from "framer-motion";
import sponsorLogo from "../../assets/sponsors/the-mafia.png";
import { cx } from "../../ui/cx";

const SPONSOR_URL = "https://themafianetwork.netlify.app";
const SPONSOR_TEXT = "Patrocinado por: The Mafia ecosistem";

interface SponsorBadgeProps {
  compact?: boolean;
  className?: string;
}

async function openSponsorSite() {
  try {
    await openUrl(SPONSOR_URL);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    window.alert(`No se pudo abrir el sitio de The Mafia ecosistem.\n\n${message}`);
  }
}

export function SponsorBadge({ compact = false, className }: SponsorBadgeProps) {
  if (compact) {
    return (
      <motion.button
        type="button"
        whileTap={{ scale: 0.985 }}
        onClick={() => void openSponsorSite()}
        aria-label="Abrir sitio web de The Mafia ecosistem"
        className={cx(
          "group flex w-full items-center gap-2.5 rounded-2xl border border-gold-500/14 bg-canvas-deep/45 p-2 text-left shadow-innerline backdrop-blur-md transition-all duration-200 ease-soft",
          "hover:border-gold-400/35 hover:bg-canvas-card/60 hover:shadow-[0_0_24px_-14px_rgba(228,188,60,0.8)]",
          "focus:outline-none focus:ring-2 focus:ring-gold-400/25",
          className,
        )}
      >
        <img
          src={sponsorLogo}
          alt="The Mafia ecosistem"
          className="h-8 w-8 shrink-0 rounded-xl object-cover ring-1 ring-gold-500/25"
        />
        <span className="min-w-0 leading-tight">
          <span className="block text-[9.5px] font-medium uppercase tracking-[0.16em] text-ink-faint">
            Patrocinado por:
          </span>
          <span className="block truncate text-[11.5px] font-semibold tracking-tight text-ink-soft transition-colors group-hover:text-gold-100">
            The Mafia ecosistem
          </span>
        </span>
      </motion.button>
    );
  }

  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-2xl border border-gold-500/16 bg-canvas-deep/45 p-4 shadow-innerline backdrop-blur-xl",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(228,188,60,0.12),transparent_38%)]" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <img
            src={sponsorLogo}
            alt="The Mafia ecosistem"
            className="h-16 w-16 shrink-0 rounded-2xl object-cover ring-1 ring-gold-500/25"
          />
          <div className="min-w-0">
            <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.22em] text-gold-300/85">
              Sponsor
            </div>
            <div className="font-display text-[15px] font-semibold tracking-tight text-ink">
              {SPONSOR_TEXT}
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
              Apoyo independiente para mantener Metta Launcher con una presentación premium.
            </p>
          </div>
        </div>
        <motion.button
          type="button"
          whileTap={{ scale: 0.985 }}
          onClick={() => void openSponsorSite()}
          aria-label="Abrir sitio web de The Mafia ecosistem"
          className="btn shrink-0 !px-4 !py-2 !text-[12px]"
        >
          Visitar sitio web
        </motion.button>
      </div>
    </div>
  );
}
