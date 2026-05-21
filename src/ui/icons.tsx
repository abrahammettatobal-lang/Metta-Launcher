import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement>;

const base = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconHome(p: Props) {
  return (
    <svg {...base} {...p}>
      <path d="M4 11l8-7 8 7" />
      <path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}

export function IconCubes(p: Props) {
  return (
    <svg {...base} {...p}>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
      <path d="M4 7.5l8 4.5 8-4.5" />
      <path d="M12 12v9" />
    </svg>
  );
}

export function IconPuzzle(p: Props) {
  return (
    <svg {...base} {...p}>
      <path d="M14.5 4a2 2 0 1 1 4 0v1H21v3h-1a2 2 0 0 0 0 4h1v3H17a2 2 0 1 0-4 0H10a2 2 0 1 1-4 0H3v-3a2 2 0 1 1 0-4V5a1 1 0 0 1 1-1h4a2 2 0 1 1 4 0h2.5z" />
    </svg>
  );
}

export function IconUser(p: Props) {
  return (
    <svg {...base} {...p}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
    </svg>
  );
}

export function IconTerminal(p: Props) {
  return (
    <svg {...base} {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 9l3 3-3 3" />
      <path d="M13 15h4" />
    </svg>
  );
}

export function IconSliders(p: Props) {
  return (
    <svg {...base} {...p}>
      <path d="M4 6h11" />
      <path d="M4 12h7" />
      <path d="M4 18h13" />
      <circle cx="17" cy="6" r="2" />
      <circle cx="13" cy="12" r="2" />
      <circle cx="19" cy="18" r="2" />
    </svg>
  );
}

export function IconPlus(p: Props) {
  return (
    <svg {...base} {...p}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function IconPlay(p: Props) {
  return (
    <svg {...base} {...p} fill="currentColor" stroke="none">
      <path d="M8 5.5v13a1 1 0 0 0 1.55.83l10-6.5a1 1 0 0 0 0-1.66l-10-6.5A1 1 0 0 0 8 5.5z" />
    </svg>
  );
}

export function IconFolder(p: Props) {
  return (
    <svg {...base} {...p}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </svg>
  );
}

export function IconCopy(p: Props) {
  return (
    <svg {...base} {...p}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </svg>
  );
}

export function IconTrash(p: Props) {
  return (
    <svg {...base} {...p}>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
    </svg>
  );
}

export function IconRam(p: Props) {
  return (
    <svg {...base} {...p}>
      <rect x="2.5" y="8" width="19" height="9" rx="1.6" />
      <path d="M6 12v3" />
      <path d="M10 12v3" />
      <path d="M14 12v3" />
      <path d="M18 12v3" />
    </svg>
  );
}

export function IconBolt(p: Props) {
  return (
    <svg {...base} {...p}>
      <path d="M13 3 4 14h7l-1 7 9-11h-7l1-7z" />
    </svg>
  );
}

export function IconClock(p: Props) {
  return (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function IconDot(p: Props) {
  return (
    <svg {...base} {...p} fill="currentColor" stroke="none">
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

export function IconRefresh(p: Props) {
  return (
    <svg {...base} {...p}>
      <path d="M20 11a8 8 0 1 0-2.34 6.04" />
      <path d="M20 4v6h-6" />
    </svg>
  );
}

export function IconLoader(p: Props) {
  return (
    <svg {...base} {...p}>
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

export function IconActivity(p: Props) {
  return (
    <svg {...base} {...p}>
      <path d="M4 14h4l2-8 4 16 2-6h4" />
    </svg>
  );
}

export function IconDownload(p: Props) {
  return (
    <svg {...base} {...p}>
      <path d="M12 4v12" />
      <path d="M7 11l5 5 5-5" />
      <path d="M4 20h16" />
    </svg>
  );
}

export function IconCheck(p: Props) {
  return (
    <svg {...base} {...p}>
      <path d="M4 12.5l5 5L20 7" />
    </svg>
  );
}

export function IconX(p: Props) {
  return (
    <svg {...base} {...p}>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}

export function IconShield(p: Props) {
  return (
    <svg {...base} {...p}>
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />
    </svg>
  );
}

export function IconSparkle(p: Props) {
  return (
    <svg {...base} {...p}>
      <path d="M12 3v4" />
      <path d="M12 17v4" />
      <path d="M5 12H3" />
      <path d="M21 12h-2" />
      <path d="M7 7l-2-2" />
      <path d="M19 19l-2-2" />
      <path d="M7 17l-2 2" />
      <path d="M19 5l-2 2" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconBedrock(p: Props) {
  return (
    <svg {...base} {...p}>
      <path d="M4 7.5l8-4 8 4-8 4-8-4z" />
      <path d="M4 12l8 4 8-4" />
      <path d="M4 16.5l8 4 8-4" />
    </svg>
  );
}

export function IconLink(p: Props) {
  return (
    <svg {...base} {...p}>
      <path d="M10 14a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
      <path d="M14 10a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
    </svg>
  );
}

import mettaLogoSrc from "../assets/metta-logo.png";

/** Official Metta Launcher logomark — sourced from the project artwork. */
export function MettaMark({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      src={mettaLogoSrc}
      width={size}
      height={size}
      alt="Metta Launcher"
      draggable={false}
      className={className}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        userSelect: "none",
      }}
    />
  );
}
