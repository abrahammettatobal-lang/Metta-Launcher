/**
 * Minecraft Bedrock Edition (Windows UWP) types.
 *
 * Mirrors the `BedrockInstallation` struct in `src-tauri/src/bedrock.rs`.
 */
export interface BedrockInstallation {
  installed: boolean;
  platformSupported: boolean;
  packageFamily: string | null;
  packageFullName: string | null;
  installPath: string | null;
  executableAlias: string | null;
  version: string | null;
  publisher: string | null;
  architecture: string | null;
  userDataPath: string | null;
  worldsPath: string | null;
  resourcePacksPath: string | null;
  behaviorPacksPath: string | null;
  skinPacksPath: string | null;
  screenshotsPath: string | null;
  diagnostic: string | null;
}

export type BedrockFolderKind =
  | "root"
  | "worlds"
  | "resourcePacks"
  | "behaviorPacks"
  | "skinPacks"
  | "screenshots";
