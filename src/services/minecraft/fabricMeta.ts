export async function fetchFabricLoaderVersions(): Promise<string[]> {
  const res = await fetch("https://meta.fabricmc.net/v2/versions/loader");
  if (!res.ok) throw new Error(`Fabric loader list HTTP ${res.status}`);
  const rows = (await res.json()) as Array<{ version: string; stable: boolean }>;
  const stable = rows.filter((r) => r.stable).map((r) => r.version);
  if (stable.length) return stable;
  return rows.slice(0, 40).map((r) => r.version);
}

export async function fetchFabricLoaderVersionsForMc(mcVersion: string): Promise<string[]> {
  const res = await fetch(
    `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mcVersion)}`,
  );
  if (!res.ok) throw new Error(`Fabric loader list HTTP ${res.status} for ${mcVersion}`);
  const rows = (await res.json()) as Array<{ loader: { version: string; stable: boolean } }>;
  const stable: string[] = [];
  const unstable: string[] = [];
  for (const row of rows) {
    const v = row.loader.version;
    if (row.loader.stable) stable.push(v);
    else unstable.push(v);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of [...stable, ...unstable]) {
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export async function validateFabricLoaderForMc(
  mcVersion: string,
  loaderVersion: string,
): Promise<void> {
  const u = `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`;
  const res = await fetch(u);
  if (!res.ok) {
    throw new Error(
      `La versión Fabric ${loaderVersion} no está disponible para Minecraft ${mcVersion} en Fabric Meta.`,
    );
  }
}
