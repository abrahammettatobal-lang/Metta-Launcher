import Image from "next/image";

const SPONSOR_URL = "https://themafianetwork.netlify.app";
const SPONSOR_TEXT = "Patrocinado por: The Mafia ecosistem";

type SponsorBadgeProps = {
  compact?: boolean;
  className?: string;
};

export function SponsorBadge({ compact = false, className = "" }: SponsorBadgeProps) {
  if (compact) {
    return (
      <a
        href={SPONSOR_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Abrir sitio web de The Mafia ecosistem"
        className={[
          "group inline-flex items-center gap-2 rounded-2xl border border-gold-500/15",
          "bg-canvas-deep/45 px-2.5 py-2 text-[11px] text-ink-muted shadow-ring",
          "transition duration-200 hover:border-gold-400/35 hover:bg-gold-500/[0.06]",
          "hover:text-ink focus:outline-none focus:ring-2 focus:ring-gold-400/25",
          className,
        ].join(" ")}
      >
        <Image
          src="/sponsors/the-mafia.png"
          alt="The Mafia ecosistem"
          width={28}
          height={28}
          className="h-7 w-7 rounded-lg object-cover ring-1 ring-gold-500/20"
        />
        <span className="leading-tight">
          <span className="block text-ink-faint">Patrocinado por:</span>
          <span className="block font-medium text-ink-soft transition-colors group-hover:text-gold-100">
            The Mafia ecosistem
          </span>
        </span>
      </a>
    );
  }

  return (
    <section
      aria-label={SPONSOR_TEXT}
      className={[
        "container-page",
        className,
      ].join(" ")}
    >
      <div className="group relative overflow-hidden rounded-[28px] border border-gold-500/15 bg-canvas-deep/45 p-4 shadow-ring backdrop-blur-xl transition duration-300 hover:border-gold-400/35 hover:shadow-glow sm:p-5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(201,162,39,0.12),transparent_34%)] opacity-80" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Image
              src="/sponsors/the-mafia.png"
              alt="The Mafia ecosistem"
              width={72}
              height={72}
              className="h-14 w-14 rounded-2xl object-cover ring-1 ring-gold-500/25 sm:h-16 sm:w-16"
            />
            <div>
              <p className="eyebrow mb-1">Sponsor</p>
              <p className="font-display text-base font-semibold text-ink sm:text-lg">
                {SPONSOR_TEXT}
              </p>
              <p className="muted mt-1 max-w-xl text-[12.5px]">
                Apoyo independiente para mantener Metta Launcher con una presentación premium.
              </p>
            </div>
          </div>
          <a
            href={SPONSOR_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Abrir sitio web de The Mafia ecosistem"
            className="btn-soft inline-flex w-fit justify-center px-4 py-2 text-[12px]"
          >
            Visitar sitio
          </a>
        </div>
      </div>
    </section>
  );
}
