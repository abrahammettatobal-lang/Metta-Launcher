export interface VersionManifestV2 {
  latest: { release: string; snapshot: string };
  versions: Array<{ id: string; type: string; url: string; time: string }>;
}

const MANIFEST_URL =
  "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

export async function fetchVersionManifest(): Promise<VersionManifestV2> {
  const res = await fetch(MANIFEST_URL);
  if (!res.ok) throw new Error(`Manifest HTTP ${res.status}`);
  return res.json() as Promise<VersionManifestV2>;
}

export async function fetchVersionJsonUrl(
  manifest: VersionManifestV2,
  versionId: string,
): Promise<string> {
  const v = manifest.versions.find((x) => x.id === versionId);
  if (!v?.url) throw new Error(`Versión no encontrada en el manifiesto: ${versionId}`);
  return v.url;
}
