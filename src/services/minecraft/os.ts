export type McOs = "windows" | "osx" | "linux";

export function detectMcOs(): McOs {
  if (typeof navigator === "undefined") return "windows";
  const p = navigator.platform || "";
  if (/^Win/i.test(p)) return "windows";
  if (/^Mac/i.test(p)) return "osx";
  return "linux";
}

export function mcOsToClassifier(os: McOs): string {
  if (os === "windows") return "natives-windows";
  if (os === "osx") return "natives-macos";
  return "natives-linux";
}
