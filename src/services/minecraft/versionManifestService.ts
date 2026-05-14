/**
 * @deprecated Use mojangManifestService.ts directly.
 * This file is kept for backward compatibility.
 */
export type { MojangVersionManifest as VersionManifestV2 } from "./mojangManifestService";
export {
  getMojangVersionManifest as fetchVersionManifest,
  fetchVersionJsonUrl,
} from "./mojangManifestService";
