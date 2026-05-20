import { useState } from "react";
import { cx } from "./cx";

interface AvatarProps {
  name: string;
  src?: string;
  size?: number;
  className?: string;
}

function gradientFor(name: string): string {
  const palette = [
    ["#3a2c10", "#0a0908"],
    ["#243a10", "#0a0908"],
    ["#1f1a3a", "#0a0908"],
    ["#3a1029", "#0a0908"],
    ["#103a31", "#0a0908"],
    ["#3a1a10", "#0a0908"],
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const [a, b] = palette[h % palette.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

export function Avatar({ name, src, size = 40, className }: AvatarProps) {
  const [err, setErr] = useState(false);
  const initials = (name || "?")
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  if (src && !err) {
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        onError={() => setErr(true)}
        className={cx(
          "shrink-0 rounded-xl border border-line object-cover",
          className,
        )}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={cx(
        "flex shrink-0 items-center justify-center rounded-xl border border-line font-display text-xs font-semibold uppercase tracking-wider text-ink",
        className,
      )}
      style={{
        width: size,
        height: size,
        backgroundImage: gradientFor(name),
        boxShadow: "inset 0 0 0 1px rgba(244,234,220,0.04)",
      }}
    >
      {initials || "?"}
    </div>
  );
}
