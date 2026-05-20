export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

const RTF = new Intl.RelativeTimeFormat("es", { numeric: "auto" });

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "Nunca";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = d.getTime() - Date.now();
  const diffSec = Math.round(diffMs / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return RTF.format(diffSec, "second");
  if (abs < 3600) return RTF.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return RTF.format(Math.round(diffSec / 3600), "hour");
  if (abs < 86400 * 7) return RTF.format(Math.round(diffSec / 86400), "day");
  return d.toLocaleDateString("es", { day: "2-digit", month: "short" });
}

export function loaderLabel(loader: string, version?: string): string {
  const name =
    loader === "vanilla"
      ? "Vanilla"
      : loader === "fabric"
        ? "Fabric"
        : loader === "forge"
          ? "Forge"
          : loader === "neoforge"
            ? "NeoForge"
            : loader;
  return version && loader !== "vanilla" ? `${name} ${version}` : name;
}
