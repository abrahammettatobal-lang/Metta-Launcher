/**
 * Launch validation cache.
 *
 * Stores a small JSON marker per-instance to skip expensive validation
 * on subsequent launches when nothing has changed.
 *
 * Files are stored as plain JSON under `shared/assets/indexes/{id}.validated`
 * and `instances/{instanceId}/.launch-cache.json`. They are safe to delete
 * at any time — the launcher will rebuild them.
 */

import { pathExists, readTextFile, writeTextFile } from "../bridge";

export interface AssetCacheEntry {
  /** SHA-1 of the asset index JSON.  If this still matches, all objects are present. */
  indexSha1: string;
  validatedAt: string;
}

export interface LaunchCacheEntry {
  /** MC version + loader key — cache is invalidated if these change. */
  mcVersion: string;
  loaderType: string;
  loaderVersion: string;
  /** Last known-good Java path. */
  javaPath: string;
  javaValidatedAt: string;
  /** ISO timestamp of the last fully-successful launch. */
  lastSuccessfulLaunch: string | null;
}

// ─── Asset index cache ────────────────────────────────────────────────────────

/** Path for the per-index validation marker. */
function assetCachePath(indexId: string): string {
  return `shared/assets/indexes/${indexId}.validated`;
}

/** Returns true when all assets for this index are already present on disk. */
export async function isAssetIndexValidated(
  indexId: string,
  indexSha1: string,
): Promise<boolean> {
  const p = assetCachePath(indexId);
  if (!(await pathExists(p))) return false;
  try {
    const entry = JSON.parse(await readTextFile(p)) as AssetCacheEntry;
    return entry.indexSha1.toLowerCase() === indexSha1.toLowerCase();
  } catch {
    return false;
  }
}

/** Write the asset validation marker after a successful full check. */
export async function markAssetIndexValidated(
  indexId: string,
  indexSha1: string,
): Promise<void> {
  const entry: AssetCacheEntry = {
    indexSha1: indexSha1.toLowerCase(),
    validatedAt: new Date().toISOString(),
  };
  await writeTextFile(assetCachePath(indexId), JSON.stringify(entry, null, 2));
}

// ─── Per-instance launch cache ────────────────────────────────────────────────

function launchCachePath(instancePath: string): string {
  return `${instancePath}/.launch-cache.json`;
}

/** Read the launch cache for an instance, or null if absent / stale format. */
export async function readLaunchCache(
  instancePath: string,
): Promise<LaunchCacheEntry | null> {
  const p = launchCachePath(instancePath);
  if (!(await pathExists(p))) return null;
  try {
    return JSON.parse(await readTextFile(p)) as LaunchCacheEntry;
  } catch {
    return null;
  }
}

/** Persist the launch cache entry for an instance. */
export async function writeLaunchCache(
  instancePath: string,
  entry: LaunchCacheEntry,
): Promise<void> {
  await writeTextFile(launchCachePath(instancePath), JSON.stringify(entry, null, 2));
}

/**
 * Returns a cached Java path if it matches the current MC/loader config.
 * Returns null when the cache is absent, stale, or belongs to a different version.
 */
export async function getCachedJavaPath(
  instancePath: string,
  mcVersion: string,
  loaderType: string,
  loaderVersion: string,
): Promise<string | null> {
  const c = await readLaunchCache(instancePath);
  if (!c) return null;
  if (
    c.mcVersion !== mcVersion ||
    c.loaderType !== loaderType ||
    c.loaderVersion !== loaderVersion
  ) {
    return null;
  }
  return c.javaPath || null;
}
