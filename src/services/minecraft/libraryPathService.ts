import { pathExists } from "../bridge";

/** Resolve a library artifact path under shared or legacy installer `libraries/`. */
export async function resolveLibraryRel(
  relPath: string,
  options?: { preferLegacyRoot?: boolean },
): Promise<string | null> {
  const shared = `shared/libraries/${relPath}`.replace(/\\/g, "/");
  const legacy = `libraries/${relPath}`.replace(/\\/g, "/");
  const first = options?.preferLegacyRoot ? legacy : shared;
  const second = options?.preferLegacyRoot ? shared : legacy;
  if (await pathExists(first)) return first;
  if (await pathExists(second)) return second;
  return null;
}

export function loaderUsesLegacyLibraryRoot(loaderType: string): boolean {
  return loaderType === "forge" || loaderType === "neoforge";
}

export function libraryDirectoryRel(loaderType: string): string {
  return loaderUsesLegacyLibraryRoot(loaderType) ? "libraries" : "shared/libraries";
}
