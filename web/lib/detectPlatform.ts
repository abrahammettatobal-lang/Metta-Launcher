export type Platform = "windows" | "macos" | "linux" | "unknown";
export type MacArch = "apple-silicon" | "intel" | "unknown";

export interface DetectedPlatform {
  os: Platform;
  /** Only meaningful on macOS; on other OSes it stays "unknown". */
  macArch: MacArch;
}

/**
 * Detects the visitor's OS using userAgentData when available (modern Chromium)
 * and falling back to userAgent / platform sniffing. Safe to call only on the
 * client — returns "unknown" if invoked during SSR.
 */
export function detectPlatform(): DetectedPlatform {
  if (typeof navigator === "undefined") {
    return { os: "unknown", macArch: "unknown" };
  }

  const uaData = (
    navigator as Navigator & {
      userAgentData?: { platform?: string };
    }
  ).userAgentData;
  const ua = navigator.userAgent || "";
  const platform = (uaData?.platform || (navigator as Navigator).platform || "")
    .toLowerCase();

  const isWindows = /win/.test(platform) || /windows/i.test(ua);
  const isMac =
    /mac/.test(platform) ||
    /darwin/i.test(ua) ||
    /macintosh/i.test(ua) ||
    /iphone|ipad|ipod/i.test(ua);
  const isLinux =
    /linux/.test(platform) || /linux/i.test(ua) || /x11/i.test(ua);

  let os: Platform = "unknown";
  if (isWindows) os = "windows";
  else if (isMac) os = "macos";
  else if (isLinux) os = "linux";

  let macArch: MacArch = "unknown";
  if (os === "macos") {
    // Browsers don't expose CPU directly. Apple Silicon Macs may still report
    // "Intel" in userAgent for compatibility. We can only guess via
    // userAgentData (Chromium) and the modern Mac touch heuristic.
    const arch = (
      navigator as Navigator & {
        userAgentData?: { getHighEntropyValues?: unknown };
      }
    ).userAgentData;
    if (arch && /arm/i.test(ua)) macArch = "apple-silicon";
    else if (/intel/i.test(ua)) macArch = "intel";
  }

  return { os, macArch };
}
