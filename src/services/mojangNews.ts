/**
 * Mojang launcher news feed.
 * Endpoint is public and CORS-friendly.
 */

const FEED_URL = "https://launchercontent.mojang.com/news.json";
const ASSET_BASE = "https://launchercontent.mojang.com";

interface RawImage {
  title?: string;
  url?: string;
}

interface RawEntry {
  title?: string;
  category?: string;
  date?: string;
  text?: string;
  readMoreLink?: string;
  newsPageImage?: RawImage;
  playPageImage?: RawImage;
  newsType?: string[];
  id?: string;
}

interface RawFeed {
  version?: number;
  entries?: RawEntry[];
}

export interface MojangNewsEntry {
  id: string;
  title: string;
  category: string;
  date: string;
  excerpt: string;
  link?: string;
  image: string | null;
  wideImage: string | null;
  tag: string;
}

function resolveImage(img?: RawImage): string | null {
  if (!img?.url) return null;
  if (/^https?:/i.test(img.url)) return img.url;
  return `${ASSET_BASE}${img.url.startsWith("/") ? "" : "/"}${img.url}`;
}

function deriveTag(e: RawEntry): string {
  const t = e.newsType?.[0] ?? e.category ?? "";
  return (t || "").toString().toLowerCase();
}

function plain(text: string | undefined): string {
  if (!text) return "";
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Keep only Minecraft Java Edition (no Bedrock, Dungeons, Legends, Marketplace, Education…). */
function isJavaEdition(e: RawEntry): boolean {
  const c = (e.category ?? "").toLowerCase();
  if (c.includes("java")) return true;
  // Some Mojang entries use newsType tags to indicate Java content.
  const types = (e.newsType ?? []).map((t) => t.toLowerCase());
  if (types.some((t) => t.includes("java"))) return true;
  return false;
}

/** Reject obvious cross-product titles (Bedrock-only updates, etc.). */
function looksOffTopic(e: RawEntry): boolean {
  const title = (e.title ?? "").toLowerCase();
  return (
    title.includes("bedrock") ||
    title.includes("dungeons") ||
    title.includes("legends") ||
    title.includes("education") ||
    title.includes("marketplace")
  );
}

let _cache: { at: number; data: MojangNewsEntry[] } | null = null;
const TTL_MS = 10 * 60 * 1000;

export async function fetchMojangNews(): Promise<MojangNewsEntry[]> {
  if (_cache && Date.now() - _cache.at < TTL_MS) return _cache.data;
  try {
    const res = await fetch(FEED_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as RawFeed;
    const entries = (json.entries ?? [])
      .filter((e) => isJavaEdition(e) && !looksOffTopic(e))
      .map<MojangNewsEntry>((e, idx) => ({
        id: e.id ?? `${e.date ?? "?"}-${idx}`,
        title: e.title ?? "Sin título",
        category: e.category ?? "Minecraft",
        date: e.date ?? "",
        excerpt: plain(e.text).slice(0, 220),
        link: e.readMoreLink,
        image: resolveImage(e.newsPageImage),
        wideImage: resolveImage(e.playPageImage) ?? resolveImage(e.newsPageImage),
        tag: deriveTag(e),
      }))
      .filter((e) => e.title && (e.image || e.wideImage));
    _cache = { at: Date.now(), data: entries };
    return entries;
  } catch (err) {
    console.warn("[mojang-news] fallback", err);
    return [];
  }
}

/** Returns a stable image URL for a Minecraft version cinematic banner. */
export function versionBannerUrl(version: string): string {
  // Mojang publishes feature artwork on this CDN as well, but no public mapping.
  // We fall back to a deterministic seeded gradient implemented in CSS.
  return `https://launchercontent.mojang.com/news/${encodeURIComponent(
    version,
  )}.png`;
}
