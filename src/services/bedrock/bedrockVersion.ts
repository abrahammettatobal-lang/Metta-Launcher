import { detectBedrock } from "./bedrockDetector";

/** Returns the currently installed Bedrock version, or `null` if absent. */
export async function getBedrockVersion(): Promise<string | null> {
  const info = await detectBedrock();
  return info.version;
}

/** Returns the install path, or `null` if Bedrock is missing. */
export async function getBedrockInstallPath(): Promise<string | null> {
  const info = await detectBedrock();
  return info.installPath;
}
