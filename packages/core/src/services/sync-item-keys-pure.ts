import type {
  DataSource,
  DataSourceType,
  DiscoveredDocument,
  MediaExtractionMode,
  MediaSourceItem,
  SttProvider,
  TimestampRange,
} from "../domain/models.js";

type MediaItemSlicingMode = NonNullable<MediaSourceItem["slicingMode"]>;

export type PureItemSyncState = "synced" | "new";

const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const UUID_HYPHEN_RE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
const EXACT_UUID_HYPHEN_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const HEX_32_RE = /[0-9a-fA-F]{32}/;
const EXACT_HEX_32_RE = /^[0-9a-fA-F]{32}$/;

/**
 * Strips `#...` slice/hash fragments from URLs and local paths while preserving
 * literal `#` inside non-fragment filenames (e.g. `/notes/C# Guide.md`).
 * Also handles EPUB fragments with spaces or non-HTML anchors (e.g. `a.epub#Chapter 1.xhtml`).
 */
export function stripUrlFragment(rawUrl: string): string {
  const trimmed = (rawUrl || "").trim();
  if (!trimmed) return "";

  if (!/^https?:\/\//i.test(trimmed)) {
    // Strip any fragment following `.epub#...` (handles spaces and non-HTML EPUB anchors)
    const epubFragMatch = trimmed.match(/\.epub(?=#)/i);
    if (epubFragMatch && epubFragMatch.index !== undefined) {
      return trimmed.slice(0, epubFragMatch.index + ".epub".length).trim();
    }

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
 * Canonicalizes any valid YouTube video URL/ID to `https://www.youtube.com/watch?v=<id>`.
 */
export function canonicalizeYouTubeUrl(input: string): string | null {
  const id = extractYouTubeVideoId(input);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
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

function resolvePosixDotSegments(pathStr: string): string {
  const isAbs = pathStr.startsWith("/");
  const driveMatch = pathStr.match(/^([A-Za-z]:)(\/.*)$/);
  const prefix = driveMatch ? driveMatch[1] : isAbs ? "/" : "";
  const body = driveMatch ? driveMatch[2] : pathStr;
  const segments = body.split("/");
  const stack: string[] = [];

  for (const seg of segments) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      if (stack.length > 0 && stack[stack.length - 1] !== "..") {
        stack.pop();
      } else if (!prefix) {
        stack.push("..");
      }
      continue;
    }
    stack.push(seg);
  }

  if (driveMatch) {
    return `${prefix}/${stack.join("/")}`;
  }
  if (isAbs) {
    return `/${stack.join("/")}`;
  }
  return stack.join("/") || ".";
}

function isWin32Runtime(): boolean {
  return typeof process !== "undefined" && typeof process.platform === "string" && process.platform === "win32";
}

function isWindowsDrivePathKey(pathKey: string): boolean {
  return /^[a-z]:\//i.test(pathKey);
}

/**
 * Browser-safe local file path / `file://` URI canonicalizer with consistent POSIX slashes,
 * dot-segment resolution, trailing slash stripping, and Windows drive-letter normalization.
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

  clean = clean.replace(/\\/g, "/").replace(/\/+/g, "/");
  if (/^[A-Za-z]:$/.test(clean)) {
    clean = `${clean}/`;
  }

  clean = resolvePosixDotSegments(clean);

  if (clean.length > 1 && !/^[A-Za-z]:\/$/.test(clean) && clean.endsWith("/")) {
    clean = clean.slice(0, -1);
  }

  if (/^[A-Za-z]:\//.test(clean)) {
    if (isWin32Runtime()) {
      clean = clean.toLowerCase();
    } else {
      clean = clean[0].toLowerCase() + clean.slice(1);
    }
  }

  return clean;
}

/**
 * Checks whether `candidatePathKey` equals `targetPathKey` or falls inside it as a directory prefix.
 */
export function matchesLocalPathOrPrefix(targetPathKey: string, candidatePathKey: string, allowDirectoryPrefix = false): boolean {
  if (!targetPathKey || !candidatePathKey) return false;
  const caseInsensitive = isWindowsDrivePathKey(targetPathKey) || isWindowsDrivePathKey(candidatePathKey);
  const target = caseInsensitive ? targetPathKey.toLowerCase() : targetPathKey;
  const candidate = caseInsensitive ? candidatePathKey.toLowerCase() : candidatePathKey;

  if (target === candidate) return true;
  if (!allowDirectoryPrefix) return false;

  const dirPrefix = target.endsWith("/") ? target : `${target}/`;
  return candidate.startsWith(dirPrefix);
}

/**
 * Extracts a canonical 32-character lowercase hex Notion ID from a Notion URL, side-peek `?p=` URL,
 * hyphenated UUID, or 32-hex string. Prioritizes `?p=` modal page IDs over workspace/database path IDs.
 */
export function extractNotionHexId(input: string): string | null {
  const trimmed = stripUrlFragment(input);
  if (!trimmed) return null;

  if (EXACT_UUID_HYPHEN_RE.test(trimmed)) {
    return trimmed.replace(/-/g, "").toLowerCase();
  }

  if (EXACT_HEX_32_RE.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);

      const pParam = parsed.searchParams.get("p");
      if (pParam) {
        const idFromP = extractNotionHexId(pParam);
        if (idFromP) return idFromP;
      }

      const segments = parsed.pathname.split("/").filter(Boolean);
      const lastSegment = segments[segments.length - 1] || "";

      const uuidInPath = lastSegment.match(UUID_HYPHEN_RE);
      if (uuidInPath) {
        return uuidInPath[0].replace(/-/g, "").toLowerCase();
      }

      const hexAtEnd = lastSegment.match(/[0-9a-fA-F]{32}$/);
      if (hexAtEnd) {
        return hexAtEnd[0].toLowerCase();
      }

      const boundedHex = lastSegment.match(/(?:^|[-_])([0-9a-fA-F]{32})(?:[-_]|$)/);
      if (boundedHex && boundedHex[1]) {
        return boundedHex[1].toLowerCase();
      }
    } catch {
      // Fall through if URL parsing fails
    }
  }

  const uuidMatch = trimmed.match(UUID_HYPHEN_RE);
  if (uuidMatch) {
    return uuidMatch[0].replace(/-/g, "").toLowerCase();
  }

  const hexMatch = trimmed.match(HEX_32_RE);
  if (hexMatch) {
    return hexMatch[0].toLowerCase();
  }

  return null;
}

export function formatNotionUuidFromHex(hex32: string): string {
  if (hex32.length !== 32) return hex32;
  return `${hex32.slice(0, 8)}-${hex32.slice(8, 12)}-${hex32.slice(12, 16)}-${hex32.slice(16, 20)}-${hex32.slice(20)}`;
}

/**
 * Splits a multi-URL / URI payload across JSON arrays, malformed brackets, newlines, and comma-separated tokens
 * without corrupting commas inside HTTP(S) query/path segments or local filenames.
 */
export function parseSourceUrlsPure(
  raw: string,
  options: { filterHttpOnly?: boolean; deduplicate?: boolean } = {}
): string[] {
  const { filterHttpOnly = false, deduplicate = filterHttpOnly } = options;
  if (!raw || typeof raw !== "string") return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  let rawTokens: string[] = [];

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        rawTokens = parsed.map((u) => (typeof u === "string" ? u.trim() : "")).filter(Boolean);
      }
    } catch {
      // Fall through to bracket-trimmed token parsing below
    }
  }

  if (rawTokens.length === 0) {
    const cleanText = trimmed.replace(/^\[|\]$/g, "").trim();
    if (!cleanText) return [];
    const lines = cleanText.split(/[\r\n]+/);
    for (const line of lines) {
      const cleanLine = line.trim();
      if (!cleanLine) continue;
      if (/https?:\/\//i.test(cleanLine)) {
        const subTokens = cleanLine.split(/[\s,]+(?=https?:\/\/)/i);
        for (const sub of subTokens) {
          const cleaned = sub.trim().replace(/^["'<]+/, "").replace(/[,>"']+$/, "").trim();
          if (cleaned) rawTokens.push(cleaned);
        }
      } else if (!filterHttpOnly && !/[/\\]/.test(cleanLine) && cleanLine.includes(",")) {
        for (const piece of cleanLine.split(",")) {
          const cleaned = piece.trim();
          if (cleaned) rawTokens.push(cleaned);
        }
      } else {
        rawTokens.push(cleanLine);
      }
    }
  }

  const results: string[] = [];
  const seen = deduplicate ? new Set<string>() : null;

  for (const token of rawTokens) {
    const clean = token.trim();
    if (!clean) continue;

    let dedupeKey = clean;
    if (filterHttpOnly) {
      try {
        const parsed = new URL(clean);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          continue;
        }
        dedupeKey = parsed.href;
      } catch {
        continue;
      }
    }

    if (seen) {
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
    }
    results.push(clean);
  }

  return results;
}

/**
 * Splits multi-line or delimited URI strings into raw lines/tokens without stripping local commas.
 */
export function splitUriTokensPure(raw: string, splitHttpDelimiters = false): string[] {
  const trimmed = (raw || "").trim();
  if (!trimmed) return [];
  if (splitHttpDelimiters) {
    return parseSourceUrlsPure(trimmed, { filterHttpOnly: false, deduplicate: false });
  }
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v || "").trim()).filter(Boolean);
      }
    } catch {
      // Fall through cleanly
    }
  }
  const lines = trimmed
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines : [trimmed];
}

function normalizePureMediaItem(entry: unknown): MediaSourceItem | null {
  if (typeof entry === "string") {
    const clean = entry.trim();
    return clean ? { uri: clean, extractionMode: "auto" } : null;
  }

  if (!entry || typeof entry !== "object") {
    return null;
  }

  const obj = entry as Record<string, unknown>;
  if (typeof obj.uri !== "string" || !obj.uri.trim()) {
    return null;
  }

  const extractionMode: MediaExtractionMode =
    obj.extractionMode === "subtitles" || obj.extractionMode === "stt" || obj.extractionMode === "auto"
      ? obj.extractionMode
      : "auto";

  const sttProvider: SttProvider | undefined =
    obj.sttProvider === "openai" || obj.sttProvider === "gemini" || obj.sttProvider === "whisper-local"
      ? obj.sttProvider
      : undefined;

  const slicingMode: MediaItemSlicingMode | undefined =
    obj.slicingMode === "inherit" ||
    obj.slicingMode === "chapters" ||
    obj.slicingMode === "timestamps" ||
    obj.slicingMode === "none"
      ? obj.slicingMode
      : undefined;

  const timestampRanges: TimestampRange[] | undefined = Array.isArray(obj.timestampRanges)
    ? obj.timestampRanges
        .filter(
          (r): r is Record<string, unknown> =>
            Boolean(r) && typeof r === "object" && typeof (r as any).start === "string" && typeof (r as any).end === "string"
        )
        .map((r) => ({
          start: (r.start as string).trim(),
          end: (r.end as string).trim(),
          ...(typeof r.label === "string" && r.label.trim() ? { label: r.label.trim() } : {}),
        }))
    : undefined;

  const intervalMinutes =
    typeof obj.intervalMinutes === "number" &&
    Number.isInteger(obj.intervalMinutes) &&
    obj.intervalMinutes >= 1 &&
    obj.intervalMinutes <= 240
      ? obj.intervalMinutes
      : undefined;

  return {
    uri: obj.uri.trim(),
    ...(typeof obj.title === "string" && obj.title.trim() ? { title: obj.title.trim() } : {}),
    extractionMode,
    ...(typeof obj.subtitlePath === "string" && obj.subtitlePath.trim() ? { subtitlePath: obj.subtitlePath.trim() } : {}),
    ...(sttProvider ? { sttProvider } : {}),
    ...(timestampRanges ? { timestampRanges } : {}),
    ...(slicingMode ? { slicingMode } : {}),
    ...(intervalMinutes !== undefined ? { intervalMinutes } : {}),
  };
}

/**
 * Browser-safe parser for `audio`/`video`/`youtube` URI payloads supporting JSON item arrays/objects,
 * string arrays, newline lists, and space/comma-separated HTTP(S) URLs.
 */
export function parseRawMediaSourceItems(rawUri: string): MediaSourceItem[] {
  if (!rawUri || typeof rawUri !== "string") {
    return [];
  }

  const trimmed = rawUri.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map(normalizePureMediaItem).filter((x): x is MediaSourceItem => x !== null);
      }
      const single = normalizePureMediaItem(parsed);
      return single ? [single] : [];
    } catch {
      // Fall through to plain-string / multi-line parsing
    }
  }

  const items: MediaSourceItem[] = [];
  const lines = trimmed.split(/[\r\n]+/);
  for (const line of lines) {
    const cleanLine = line.trim();
    if (!cleanLine) continue;

    if (/https?:\/\//i.test(cleanLine)) {
      const pieces = cleanLine.split(/[\s,]+(?=https?:\/\/)/i);
      for (const piece of pieces) {
        const cleanPiece = piece.trim().replace(/^[<"']+/, "").replace(/[,>"']+$/, "").trim();
        if (cleanPiece) {
          items.push({ uri: cleanPiece, extractionMode: "auto" });
        }
      }
    } else {
      items.push({ uri: cleanLine, extractionMode: "auto" });
    }
  }

  return items;
}

/**
 * Builds the set of canonical parent item keys from already-synced `documents` rows
 * for a given data source, stripping `#page=`, `#t=`, `#section=`, `#part=`, `#cfg=`, and `.epub#...` fragments.
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
  hasLocalDirectory(dirPathOrUri: string): boolean;
  hasYouTubeUri(uri: string): boolean;
  hasNotionPage(pageId: string, pageUrl?: string): boolean;
}

/**
 * Normalizes a caller-supplied `knownItemKeys` set into a lookup matcher
 * supporting raw strings, canonical HTTP URLs, local file/directory paths, YouTube IDs, and Notion IDs.
 */
export function createKnownItemMatcher(
  sourceType: DataSourceType,
  knownItemKeys?: ReadonlySet<string>
): KnownItemMatcher {
  const rawSet = new Set<string>();
  const httpSet = new Set<string>();
  const localSet = new Set<string>();
  const localLowerSet = new Set<string>();
  const youtubeIds = new Set<string>();
  const notionIds = new Set<string>();

  if (knownItemKeys && knownItemKeys.size > 0) {
    for (const rawEntry of knownItemKeys) {
      const entry = (rawEntry || "").trim();
      if (!entry) continue;
      rawSet.add(entry);

      if (
        sourceType === "youtube" ||
        /youtube\.com|youtu\.be|youtube-nocookie\.com/i.test(entry) ||
        YOUTUBE_VIDEO_ID_RE.test(entry)
      ) {
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
        if (normPath) {
          localSet.add(normPath);
          if (isWindowsDrivePathKey(normPath)) {
            localLowerSet.add(normPath.toLowerCase());
          }
        }
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
      if (!norm) return false;
      if (localSet.has(norm) || rawSet.has(norm)) return true;
      return isWindowsDrivePathKey(norm) && localLowerSet.has(norm.toLowerCase());
    },
    hasLocalDirectory(dirPathOrUri: string): boolean {
      if (isEmpty || !dirPathOrUri) return false;
      if (this.hasLocalPath(dirPathOrUri)) return true;
      const stripped = stripUrlFragment(dirPathOrUri);
      if (/^https?:\/\//i.test(stripped)) return false;
      const norm = normalizeLocalFilePathKey(stripped);
      if (!norm) return false;
      for (const knownPath of localSet) {
        if (matchesLocalPathOrPrefix(norm, knownPath, true)) {
          return true;
        }
      }
      return false;
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

/**
 * Evaluates whether a configured item URI/path matches already-synced keys for a source type.
 * Supports directory prefix matching across `local`, `audio`, and `video`.
 */
export function getItemSyncStatus(
  uri: string,
  sourceType: DataSourceType | string,
  knownKeys: ReadonlyArray<string> | ReadonlySet<string> | undefined | null
): PureItemSyncState {
  const rawUri = (uri || "").trim();
  if (!rawUri || !knownKeys) return "new";
  const keyList = Array.isArray(knownKeys) ? knownKeys : Array.from(knownKeys);
  const keySet = new Set(keyList.map((k) => (k || "").trim()).filter(Boolean));
  if (keySet.size === 0) return "new";

  const matcher = createKnownItemMatcher(sourceType as DataSourceType, keySet);
  if (matcher.hasRaw(rawUri)) return "synced";

  const stripped = stripUrlFragment(rawUri);
  if (matcher.hasRaw(stripped)) return "synced";

  switch (sourceType) {
    case "youtube":
      return matcher.hasYouTubeUri(rawUri) ? "synced" : "new";
    case "notion":
      return matcher.hasNotionPage(rawUri, rawUri) ? "synced" : "new";
    case "local":
    case "audio":
    case "video":
      return /^https?:\/\//i.test(stripped)
        ? matcher.hasHttpUrl(stripped)
          ? "synced"
          : "new"
        : matcher.hasLocalDirectory(stripped)
          ? "synced"
          : "new";
    default:
      return /^https?:\/\//i.test(stripped) && matcher.hasHttpUrl(stripped) ? "synced" : "new";
  }
}
