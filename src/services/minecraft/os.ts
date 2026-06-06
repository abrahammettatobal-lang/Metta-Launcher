export type McOs = "windows" | "osx" | "linux";
export type McArch = "x64" | "arm64" | "x86";

export function detectMcOs(): McOs {
  if (typeof navigator === "undefined") return "windows";
  const p = navigator.platform || "";
  if (/^Win/i.test(p)) return "windows";
  if (/^Mac/i.test(p)) return "osx";
  return "linux";
}

/** Arquitectura JVM/host para elegir el jar de natives correcto. */
export function detectMcArch(): McArch {
  if (typeof navigator === "undefined") return "x64";
  const ua = navigator.userAgent.toLowerCase();
  const plat = (navigator.platform || "").toLowerCase();
  if (ua.includes("arm") || ua.includes("aarch64") || plat.includes("arm")) return "arm64";
  if (ua.includes("wow64") || ua.includes("win64") || ua.includes("x64") || ua.includes("amd64")) {
    return "x64";
  }
  if (ua.includes("i686") || ua.includes("i386")) return "x86";
  return "x64";
}

export function mcOsToClassifier(os: McOs): string {
  if (os === "windows") return "natives-windows";
  if (os === "osx") return "natives-macos";
  return "natives-linux";
}
