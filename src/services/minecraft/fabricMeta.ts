export async function fetchFabricLoaderVersions(): Promise<string[]> {
  const res = await fetch("https://meta.fabricmc.net/v2/versions/loader");
  if (!res.ok) throw new Error(`Fabric loader list HTTP ${res.status}`);
  const rows = (await res.json()) as Array<{ version: string; stable: boolean }>;
  const stable = rows.filter((r) => r.stable).map((r) => r.version);
  if (stable.length) return stable;
  return rows.slice(0, 40).map((r) => r.version);
}
