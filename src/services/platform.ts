import { hostPlatform as fetchHostPlatform } from "./bridge";
import type { McArch } from "./minecraft/os";

export interface HostPlatformInfo {
  os: string;
  arch: string;
}

let cache: HostPlatformInfo | null = null;

/** Host OS/arch from Rust (reliable on macOS vs navigator.platform). */
export async function getHostPlatform(): Promise<HostPlatformInfo> {
  if (!cache) {
    cache = await fetchHostPlatform();
  }
  return cache;
}

export function mapHostArch(arch: string): McArch {
  const a = arch.toLowerCase();
  if (a === "aarch64" || a === "arm") return "arm64";
  if (a === "x86") return "x86";
  return "x64";
}

export async function resolveMcArch(): Promise<McArch> {
  const host = await getHostPlatform();
  return mapHostArch(host.arch);
}

export function hostOsLabel(os: string): string {
  if (os === "windows") return "Windows";
  if (os === "macos") return "macOS";
  if (os === "linux") return "Linux";
  return os;
}

export function hostArchLabel(arch: string): string {
  const a = arch.toLowerCase();
  if (a === "aarch64" || a === "arm") return "Apple Silicon (arm64)";
  if (a === "x86_64" || a === "x64") return "Intel (x64)";
  if (a === "x86") return "x86";
  return arch;
}

/** Warm platform cache during app boot (macOS arch + Java downloads). */
export function preloadHostPlatform(): void {
  void getHostPlatform();
}
