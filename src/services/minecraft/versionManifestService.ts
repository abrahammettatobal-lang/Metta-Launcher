import { pathExists, readTextFile, writeTextFile } from "../bridge";

export interface VersionManifestV2 {
  latest: { release: string; snapshot: string };
  versions: Array<{ id: string; type: string; url: string; time: string }>;
}

const MANIFEST_URL =
  "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

const CACHE_REL = "shared/version_manifest_v2.json";

async function readCachedManifest(): Promise<VersionManifestV2 | null> {
  if (!(await pathExists(CACHE_REL))) return null;
  try {
    return JSON.parse(await readTextFile(CACHE_REL)) as VersionManifestV2;
  } catch {
    return null;
  }
}

export async function fetchVersionManifest(): Promise<VersionManifestV2> {
  try {
    const res = await fetch(MANIFEST_URL);
    if (res.ok) {
      const data = (await res.json()) as VersionManifestV2;
      await writeTextFile(CACHE_REL, JSON.stringify(data));
      return data;
    }
  } catch {
    /* offline — fall back to cache below */
  }

  const cached = await readCachedManifest();
  if (cached) return cached;

  throw new Error(
    "Sin conexión a internet y no hay manifiesto de versiones en caché. Conéctate una vez para descargar Minecraft.",
  );
}

export async function fetchVersionJsonUrl(
  manifest: VersionManifestV2,
  versionId: string,
): Promise<string> {
  const v = manifest.versions.find((x) => x.id === versionId);
  if (!v?.url) throw new Error(`Versión no encontrada en el manifiesto: ${versionId}`);
  return v.url;
}
