import { fetchVersionManifest } from "./versionManifestService";

export type VersionCategoryId =
  | "release"
  | "prerelease"
  | "snapshot"
  | "beta"
  | "alpha";

export interface VersionCatalogEntry {
  id: string;
  type: string;
  releaseTime: string;
  category: VersionCategoryId;
}

export interface VersionCatalogGroup {
  id: VersionCategoryId;
  label: string;
  versions: VersionCatalogEntry[];
}

export interface VersionCatalog {
  latestRelease: string;
  latestSnapshot: string;
  groups: VersionCatalogGroup[];
  all: VersionCatalogEntry[];
}

const GROUP_LABELS: Record<VersionCategoryId, string> = {
  release: "Release",
  prerelease: "Pre-release",
  snapshot: "Snapshot",
  beta: "Beta",
  alpha: "Alpha",
};

const GROUP_ORDER: VersionCategoryId[] = [
  "release",
  "prerelease",
  "snapshot",
  "beta",
  "alpha",
];

function isPreRelease(id: string): boolean {
  const lower = id.toLowerCase();
  return (
    lower.includes("-pre") ||
    lower.includes("-rc") ||
    lower.includes(" pre-release") ||
    lower.includes(" pre release")
  );
}

export function categorizeVersion(
  id: string,
  type: string,
): VersionCategoryId {
  if (type === "release") return "release";
  if (type === "old_beta") return "beta";
  if (type === "old_alpha") return "alpha";
  if (type === "snapshot") {
    return isPreRelease(id) ? "prerelease" : "snapshot";
  }
  if (id.startsWith("rd-")) return "alpha";
  if (id.startsWith("b")) return "beta";
  if (id.startsWith("a")) return "alpha";
  return "snapshot";
}

export async function fetchVersionCatalog(): Promise<VersionCatalog> {
  const manifest = await fetchVersionManifest();
  const all: VersionCatalogEntry[] = manifest.versions.map((v) => ({
    id: v.id,
    type: v.type,
    releaseTime: v.time,
    category: categorizeVersion(v.id, v.type),
  }));

  const buckets = new Map<VersionCategoryId, VersionCatalogEntry[]>();
  for (const cat of GROUP_ORDER) {
    buckets.set(cat, []);
  }
  for (const entry of all) {
    buckets.get(entry.category)?.push(entry);
  }

  const groups: VersionCatalogGroup[] = GROUP_ORDER.map((id) => ({
    id,
    label: GROUP_LABELS[id],
    versions: buckets.get(id) ?? [],
  })).filter((g) => g.versions.length > 0);

  return {
    latestRelease: manifest.latest.release,
    latestSnapshot: manifest.latest.snapshot,
    groups,
    all,
  };
}

export function filterCatalog(
  catalog: VersionCatalog,
  query: string,
  category: VersionCategoryId | "all",
): VersionCatalogGroup[] {
  const q = query.trim().toLowerCase();
  const source =
    category === "all"
      ? catalog.groups
      : catalog.groups.filter((g) => g.id === category);

  if (!q) return source;

  return source
    .map((group) => ({
      ...group,
      versions: group.versions.filter((v) => v.id.toLowerCase().includes(q)),
    }))
    .filter((g) => g.versions.length > 0);
}

export function defaultVersionId(catalog: VersionCatalog): string {
  if (catalog.latestRelease) return catalog.latestRelease;
  const release = catalog.groups.find((g) => g.id === "release");
  return release?.versions[0]?.id ?? catalog.all[0]?.id ?? "";
}
