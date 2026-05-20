import { invoke } from "@tauri-apps/api/core";
import { logAppend } from "../bridge";
import type { BedrockFolderKind } from "../../types/bedrock";

/** Open one of the Bedrock data folders in Explorer. */
export async function openBedrockFolder(
  kind: BedrockFolderKind,
): Promise<string> {
  await logAppend("bedrock", "info", `[Bedrock] Opening ${kind} folder…`);
  return invoke<string>("bedrock_open_folder", { kind });
}

export const openBedrockRoot = () => openBedrockFolder("root");
export const openBedrockWorlds = () => openBedrockFolder("worlds");
export const openBedrockResourcePacks = () =>
  openBedrockFolder("resourcePacks");
export const openBedrockBehaviorPacks = () =>
  openBedrockFolder("behaviorPacks");
export const openBedrockSkinPacks = () => openBedrockFolder("skinPacks");
export const openBedrockScreenshots = () => openBedrockFolder("screenshots");
