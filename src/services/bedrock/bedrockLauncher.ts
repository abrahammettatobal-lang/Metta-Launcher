import { invoke } from "@tauri-apps/api/core";
import { logAppend } from "../bridge";

/** Launches Minecraft Bedrock via its UWP AppsFolder alias. */
export async function launchBedrock(): Promise<void> {
  await logAppend("bedrock", "info", "[Bedrock] Launching Bedrock…");
  await invoke("bedrock_launch");
  await logAppend("bedrock", "info", "[Bedrock] Lanzado");
}

/** Opens the Microsoft Store product page for Minecraft for Windows. */
export async function openStorePage(): Promise<void> {
  await logAppend("bedrock", "info", "[Bedrock] Abriendo Microsoft Store…");
  await invoke("bedrock_open_store");
}
