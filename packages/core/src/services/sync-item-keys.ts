import path from "node:path";
import type { DataSource, DataSourceType, DiscoveredDocument } from "../domain/models.js";

const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Strips any `#...` hash fragment (e.g. `#page=1-5`, `#t=0,60`, `#section=...`)
 * from a URL or file path while preserving query strings and scheme prefixes.
 */
export function stripUrlFragment(rawUrl: string): string {
  const trimmed = (rawUrl || "").trim();
  if (!trimmed) return "";
  // For file paths / file:// URIs, strip known slice/chapter fragments without truncating literal '#' in filenames (e.g. "C# Guide.md")
  if (!/^https?:\/\//i.test(trimmed)) {
    const sliceFragMatch = trimmed.match(
      /#(?:(?:page|t|part|section|cfg)=|(?:slice-\d+|id-[^#\s]*|order-[^#\s]*)|[^#\s]*\.x?html?(?:$|[?#]))/i
    );
    if (sliceFragMatch && sliceFragMatch.index !== undefined) {
      return trimmed.slice(0, sliceFragMatch.index).trim();
    }
    return trimmed;
  }
  const hashIdx = trimmed.indexOf("#");
  return (hashIdx >= 0 ? trimmed.slice(0, hashIdx) : trimmed).trim();
}

/**
 * Extracts a canonical 11-character YouTube video ID from standard watch, short youtu.be,
 * shorts, live, embed, mobile/music subdomains, or bare ID strings.
 */
export function extractYouTubeVideoId(input: string): string | null {
  const trimmed = (input || "").trim();
  if (!trimmed) {
    return null;
  }

  if (YOUTUBE_VIDEO_ID_RE.test(trimmed)) {
    return trimmed;
  }

  const candidateUrl = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : /^(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(trimmed)
      ? `https://${trimmed}`
      : null;

  if (!candidateUrl) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidateUrl);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  const isShortHost = host === "youtu.be" || host.endsWith(".youtu.be");
  const isYouTubeHost =
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtube-nocookie.com" ||
    host.endsWith(".youtube-nocookie.com");

  if (!isShortHost && !isYouTubeHost) {
    return null;
  }

  const segments = parsed.pathname.split("/").filter(Boolean);

  if (isShortHost) {
    const id = segments[0] ?? "";
    return YOUTUBE_VIDEO_ID_RE.test(id) ? id : null;
  }

  const vParam = parsed.searchParams.get("v")?.trim() ?? "";
  if (YOUTUBE_VIDEO_ID_RE.test(vParam)) {
    return vParam;
  }

  if (segments.length >= 2 && ["shorts", "live", "embed", "v"].includes(segments[0].toLowerCase())) {
    const id = segments[1] ?? "";
    return YOUTUBE_VIDEO_ID_RE.test(id) ? id : null;
  }

  return null;
}

/**
 * Normalizes an HTTP(S) URL for parent-item matching (fragment-stripped via `URL.href`).
 */
export function normalizeHttpUrlKey(rawUrl: string): string {
  const clean = stripUrlFragment(rawUrl);
  if (!clean) return "";
  try {
    return new URL(clean).href;
  } catch {
    return clean;
  }
}

/**
 * Normalizes a local file path or `file://` URI into a canonical POSIX-slash path key
 * without fragment hashes or cross-path basename collapsing.
 */
export function normalizeLocalFilePathKey(input: string): string {
  let clean = stripUrlFragment(input);
  if (!clean) return "";

  if (/^file:\/\//i.test(clean)) {
    clean = clean.replace(/^file:\/\/localhost(?=\/)/i, "file://");
    clean = clean.slice("file://".length);
    try {
      clean = decodeURIComponent(clean);
    } catch {
      // Preserve literal '%' characters if not valid URI percent-encoding
    }
    if (/^\/[A-Za-z]:[\\/]/.test(clean)) {
      clean = clean.slice(1);
    }
  }

  clean = clean.replace(/\\/g, "/");
  clean = path.posix.normalize(clean);

  if (/^[A-Za-z]:\//.test(clean)) {
    if (process.platform === "win32") {
      clean = clean.toLowerCase();
    } else {
      clean = clean[0].toLowerCase() + clean.slice(1);
    }
  }

  return clean;
}

/**
 * Extracts a canonical 32-character lowercase hex Notion ID when present in a URL or UUID string.
 */
export function extractNotionHexId(input: string): string | null {
  const trimmed = stripUrlFragment(input);
  if (!trimmed) return null;

  const uuidMatch = trimmed.match(
    /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/
  );
  if (uuidMatch) {
    return uuidMatch[0].replace(/-/g, "").toLowerCase();
  }

  const hexMatch = trimmed.match(/[0-9a-fA-F]{32}/);
  if (hexMatch) {
    return hexMatch[0].toLowerCase();
  }

  return null;
}

function formatNotionUuidFromHex(hex32: string): string {
  if (hex32.length !== 32) return hex32;
  return `${hex32.slice(0, 8)}-${hex32.slice(8, 12)}-${hex32.slice(12, 16)}-${hex32.slice(16, 20)}-${hex32.slice(20)}`;
}

/**
 * Builds the set of canonical parent item keys from already-synced `documents` rows
 * for a given data source, stripping `#page=`, `#t=`, `#section=`, and `#part=` slice fragments.
 */
export function buildKnownItemKeysForSource(
  source: Pick<DataSource, "type" | "uri">,
  docs: ReadonlyArray<Pick<DiscoveredDocument, "url" | "title">>
): Set<string> {
  const keys = new Set<string>();
  const feedUriKey = source.type === "rss" ? normalizeHttpUrlKey(source.uri) : "";

  for (const doc of docs) {
    const rawUrl = (doc.url || "").trim();
    if (!rawUrl) continue;

    switch (source.type) {
      case "local":
      case "audio":
      case "video": {
        const cleanUrl = stripUrlFragment(rawUrl);
        if (/^https?:\/\//i.test(cleanUrl)) {
          keys.add(normalizeHttpUrlKey(cleanUrl));
        } else {
          const normalizedPath = normalizeLocalFilePathKey(cleanUrl);
          if (normalizedPath) {
            keys.add(normalizedPath);
            keys.add(`file://${normalizedPath}`);
          }
        }
        break;
      }

      case "youtube": {
        const videoId = extractYouTubeVideoId(stripUrlFragment(rawUrl));
        if (videoId) {
          keys.add(videoId);
          keys.add(`https://www.youtube.com/watch?v=${videoId}`);
        }
        const normalized = normalizeHttpUrlKey(rawUrl);
        if (normalized) keys.add(normalized);
        break;
      }

      case "notion": {
        const normalized = normalizeHttpUrlKey(rawUrl);
        if (normalized) keys.add(normalized);
        const notionHex = extractNotionHexId(rawUrl);
        if (notionHex) {
          keys.add(notionHex);
          keys.add(formatNotionUuidFromHex(notionHex));
        }
        break;
      }

      case "rss": {
        const normalized = normalizeHttpUrlKey(rawUrl);
        if (normalized && normalized !== feedUriKey) {
          keys.add(normalized);
        }
        break;
      }

      case "web":
      case "sitemap":
      case "llms-txt":
      default: {
        const normalized = normalizeHttpUrlKey(rawUrl);
        if (normalized) keys.add(normalized);
        break;
      }
    }
  }

  return keys;
}

export interface KnownItemMatcher {
  readonly isEmpty: boolean;
  hasRaw(key: string): boolean;
  hasHttpUrl(url: string): boolean;
  hasLocalPath(filePathOrUri: string): boolean;
  hasYouTubeUri(uri: string): boolean;
  hasNotionPage(pageId: string, pageUrl?: string): boolean;
}

/**
 * Normalizes a caller-supplied `knownItemKeys` set into an O(1) lookup matcher
 * supporting both raw strings and canonicalized URLs / local paths / video IDs / Notion IDs.
 */
export function createKnownItemMatcher(
  sourceType: DataSourceType,
  knownItemKeys?: ReadonlySet<string>
): KnownItemMatcher {
  const rawSet = new Set<string>();
  const httpSet = new Set<string>();
  const localSet = new Set<string>();
  const youtubeIds = new Set<string>();
  const notionIds = new Set<string>();

  if (knownItemKeys && knownItemKeys.size > 0) {
    for (const rawEntry of knownItemKeys) {
      const entry = (rawEntry || "").trim();
      if (!entry) continue;
      rawSet.add(entry);

      if (sourceType === "youtube" || /youtube\.com|youtu\.be|youtube-nocookie\.com/i.test(entry) || YOUTUBE_VIDEO_ID_RE.test(entry)) {
        const vid = extractYouTubeVideoId(stripUrlFragment(entry));
        if (vid) {
          youtubeIds.add(vid);
        }
      }

      if (sourceType === "notion") {
        const hex = extractNotionHexId(entry);
        if (hex) {
          notionIds.add(hex);
        }
      }

      const stripped = stripUrlFragment(entry);
      if (/^https?:\/\//i.test(stripped)) {
        const normHttp = normalizeHttpUrlKey(stripped);
        if (normHttp) httpSet.add(normHttp);
      } else if (sourceType === "local" || sourceType === "audio" || sourceType === "video") {
        const normPath = normalizeLocalFilePathKey(stripped);
        if (normPath) localSet.add(normPath);
      }
    }
  }

  const isEmpty = rawSet.size === 0;

  return {
    isEmpty,
    hasRaw(key: string): boolean {
      return Boolean(key && rawSet.has(key));
    },
    hasHttpUrl(url: string): boolean {
      if (isEmpty || !url) return false;
      const stripped = stripUrlFragment(url);
      if (rawSet.has(url) || rawSet.has(stripped)) return true;
      const norm = normalizeHttpUrlKey(stripped);
      return Boolean(norm && (httpSet.has(norm) || rawSet.has(norm)));
    },
    hasLocalPath(filePathOrUri: string): boolean {
      if (isEmpty || !filePathOrUri) return false;
      const stripped = stripUrlFragment(filePathOrUri);
      if (rawSet.has(filePathOrUri) || rawSet.has(stripped)) return true;
      if (/^https?:\/\//i.test(stripped)) {
        return this.hasHttpUrl(stripped);
      }
      const norm = normalizeLocalFilePathKey(stripped);
      return Boolean(norm && (localSet.has(norm) || rawSet.has(norm)));
    },
    hasYouTubeUri(uri: string): boolean {
      if (isEmpty || !uri) return false;
      const stripped = stripUrlFragment(uri);
      if (rawSet.has(uri) || rawSet.has(stripped)) return true;
      const vid = extractYouTubeVideoId(stripped);
      if (vid && (youtubeIds.has(vid) || rawSet.has(vid))) {
        return true;
      }
      const normHttp = normalizeHttpUrlKey(stripped);
      return Boolean(normHttp && (httpSet.has(normHttp) || rawSet.has(normHttp)));
    },
    hasNotionPage(pageId: string, pageUrl?: string): boolean {
      if (isEmpty) return false;
      if (pageId && rawSet.has(pageId)) return true;
      const hex = extractNotionHexId(pageId);
      if (hex && notionIds.has(hex)) return true;
      if (pageUrl && this.hasHttpUrl(pageUrl)) return true;
      return false;
    },
  };
}
