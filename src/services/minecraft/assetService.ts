import {
  downloadFileCmd,
  mkdirAllCmd,
  pathExists,
  readTextFile,
  sha1FileCmd,
} from "../bridge";

export interface AssetIndex {
  objects: Record<string, { hash: string; size: number }>;
}

export async function ensureAssetIndex(
  _root: string,
  indexId: string,
  indexUrl: string,
  expectedSha1: string,
): Promise<AssetIndex> {
  const rel = `shared/assets/indexes/${indexId}.json`;
  const norm = rel.replace(/\\/g, "/");
  if (await pathExists(norm)) {
    const cur = await sha1FileCmd(norm);
    if (cur.toLowerCase() !== expectedSha1.toLowerCase()) {
      await downloadFileCmd(`asset-index-${indexId}`, indexUrl, norm, expectedSha1);
    }
  } else {
    await mkdirAllCmd("shared/assets/indexes");
    await downloadFileCmd(`asset-index-${indexId}`, indexUrl, norm, expectedSha1);
  }
  const text = await readTextFile(norm);
  return JSON.parse(text) as AssetIndex;
}

export async function ensureAssetObjects(
  _root: string,
  index: AssetIndex,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const entries = Object.values(index.objects);
  let done = 0;
  for (const v of entries) {
    const p1 = v.hash.slice(0, 2);
    const rel = `shared/assets/objects/${p1}/${v.hash}`;
    const norm = rel.replace(/\\/g, "/");
    if (!(await pathExists(norm))) {
      const url = `https://resources.download.minecraft.net/${p1}/${v.hash}`;
      await downloadFileCmd(`asset-${v.hash}`, url, norm, v.hash);
    }
    done++;
    onProgress?.(done, entries.length);
  }
}
