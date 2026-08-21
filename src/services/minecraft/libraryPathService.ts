import { pathExists } from "../bridge";

/** Resolve a library artifact path under shared or legacy installer `libraries/`. */
export async function resolveLibraryRel(relPath: string): Promise<string | null> {
  const shared = `shared/libraries/${relPath}`.replace(/\\/g, "/");
  if (await pathExists(shared)) return shared;
  const legacy = `libraries/${relPath}`.replace(/\\/g, "/");
  if (await pathExists(legacy)) return legacy;
  return null;
}

export function loaderUsesLegacyLibraryRoot(loaderType: string): boolean {
  return loaderType === "forge" || loaderType === "neoforge";
}

export function libraryDirectoryRel(loaderType: string): string {
  return loaderUsesLegacyLibraryRoot(loaderType) ? "libraries" : "shared/libraries";
}
