import { invoke } from "@tauri-apps/api/core";
import type { BedrockInstallation } from "../../types/bedrock";

/**
 * Resolve the current Bedrock UWP install. Safe to call on any OS; the backend
 * returns a result with `platformSupported = false` on non-Windows hosts.
 */
export async function detectBedrock(): Promise<BedrockInstallation> {
  return invoke<BedrockInstallation>("bedrock_detect");
}

/** Frontend hint used to hide Bedrock UI on non-Windows. */
export function isWindowsClient(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const plat = (navigator.platform || "").toLowerCase();
  return /windows/i.test(ua) || plat.startsWith("win");
}
