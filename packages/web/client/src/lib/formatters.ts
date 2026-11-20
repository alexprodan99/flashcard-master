import type { DataSourceType, DiscoveredDocument, MediaExtractionMode, MediaSourceItem, SttProvider } from './types.js';

/**
 * Formats a user-friendly page coordinate badge for a document.
 * Returns null if startPage is missing or null.
 */
export function formatPageBadge(doc: { startPage?: number | null; endPage?: number | null }): string | null {
  if (doc.startPage == null) {
    return null;
  }

  if (doc.endPage != null && doc.endPage > doc.startPage) {
    return `Pages ${doc.startPage}-${doc.endPage}`;
  }

  return `Page ${doc.startPage}`;
}

/**
 * Formats a non-negative second offset as MM:SS (or HH:MM:SS when >= 1 hour).
 */
export function formatSecondsToTimestamp(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

/**
 * Formats a user-friendly media timestamp badge for a document.
 * Returns null if both startSeconds and endSeconds are missing/null.
 */
export function formatTimestampBadge(doc: { startSeconds?: number | null; endSeconds?: number | null }): string | null {
  if (doc.startSeconds == null && doc.endSeconds == null) {
    return null;
  }

  if (doc.startSeconds != null && doc.endSeconds != null && doc.endSeconds > doc.startSeconds) {
    return `${formatSecondsToTimestamp(doc.startSeconds)} – ${formatSecondsToTimestamp(doc.endSeconds)}`;
  }

  if (doc.startSeconds != null) {
    return formatSecondsToTimestamp(doc.startSeconds);
  }

  return formatSecondsToTimestamp(doc.endSeconds!);
}

/**
 * Parses a media source URI payload (JSON array/object, newline/space separated, or single URI)
 * into normalized MediaSourceItem entries and summary metadata for table/modal display.
 */
export function parseMediaItemsSummary(
  uri: string,
  _type?: DataSourceType
): { isMulti: boolean; count: number; firstUri: string; items: MediaSourceItem[] } {
  const empty = { isMulti: false, count: 0, firstUri: '', items: [] as MediaSourceItem[] };
  if (!uri || typeof uri !== 'string') {
    return empty;
  }

  const trimmed = uri.trim();
  if (!trimmed) {
    return empty;
  }

  const normalizeEntry = (entry: any): MediaSourceItem | null => {
    if (typeof entry === 'string') {
      const clean = entry.trim();
      return clean ? { uri: clean, extractionMode: 'auto' } : null;
    }
    if (entry && typeof entry === 'object' && typeof entry.uri === 'string' && entry.uri.trim()) {
      return {
        uri: entry.uri.trim(),
        title: typeof entry.title === 'string' && entry.title.trim() ? entry.title.trim() : undefined,
        extractionMode:
          entry.extractionMode === 'subtitles' || entry.extractionMode === 'stt' || entry.extractionMode === 'auto'
            ? entry.extractionMode
            : 'auto',
        subtitlePath:
          typeof entry.subtitlePath === 'string' && entry.subtitlePath.trim() ? entry.subtitlePath.trim() : undefined,
        sttProvider:
          entry.sttProvider === 'openai' || entry.sttProvider === 'gemini' || entry.sttProvider === 'whisper-local'
            ? entry.sttProvider
            : undefined,
        timestampRanges: Array.isArray(entry.timestampRanges)
          ? entry.timestampRanges
              .filter((r: any) => r && typeof r.start === 'string' && typeof r.end === 'string')
              .map((r: any) => ({
                start: r.start.trim(),
                end: r.end.trim(),
                ...(typeof r.label === 'string' && r.label.trim() ? { label: r.label.trim() } : {}),
              }))
          : undefined,
        slicingMode:
          entry.slicingMode === 'inherit' ||
          entry.slicingMode === 'chapters' ||
          entry.slicingMode === 'timestamps' ||
          entry.slicingMode === 'none'
            ? entry.slicingMode
            : undefined,
        intervalMinutes:
          typeof entry.intervalMinutes === 'number' &&
          Number.isInteger(entry.intervalMinutes) &&
          entry.intervalMinutes >= 1 &&
          entry.intervalMinutes <= 240
            ? entry.intervalMinutes
            : undefined,
      };
    }
    return null;
  };

  let items: MediaSourceItem[] = [];

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        items = parsed.map(normalizeEntry).filter((x): x is MediaSourceItem => x !== null);
      } else {
        const single = normalizeEntry(parsed);
        if (single) items = [single];
      }
    } catch {
      // Fallback to line parsing below
    }
  }

  if (items.length === 0) {
    const lines = trimmed.split(/[\r\n]+/);
    for (const line of lines) {
      const cleanLine = line.trim();
      if (!cleanLine) continue;
      if (/https?:\/\//i.test(cleanLine)) {
        const pieces = cleanLine.split(/[\s,]+(?=https?:\/\/)/i);
        for (const piece of pieces) {
          const cleanPiece = piece.trim().replace(/^[<"']|[>"']$/g, '');
          if (cleanPiece) {
            items.push({ uri: cleanPiece, extractionMode: 'auto' });
          }
        }
      } else {
        items.push({ uri: cleanLine, extractionMode: 'auto' });
      }
    }
  }

  return {
    isMulti: items.length > 1,
    count: items.length,
    firstUri: items[0]?.title || items[0]?.uri || trimmed,
    items,
  };
}

const TIMESTAMP_PATTERN = /^(?:\d+:[0-5]\d:[0-5]\d|\d{1,3}:[0-5]\d)$/;

function parseClientTimestampSeconds(raw: string): number | null {
  const clean = raw.trim();
  if (!TIMESTAMP_PATTERN.test(clean)) return null;
  const parts = clean.split(':').map((p) => Number(p));
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return null;
}

/**
 * Validates a list of MediaSourceItem entries and their optional custom timestamp ranges.
 * Returns a human-readable error message or null when valid.
 */
export function validateMediaItems(items: MediaSourceItem[], sourceType: string): string | null {
  if (!items || items.length === 0) {
    return `Please add at least one ${sourceType} item before continuing.`;
  }
  for (const item of items) {
    if (!item.uri || !item.uri.trim()) {
      return `Every ${sourceType} item must have a valid URI or file path.`;
    }
    if (item.timestampRanges) {
      for (const range of item.timestampRanges) {
        const startSec = parseClientTimestampSeconds(range.start);
        const endSec = parseClientTimestampSeconds(range.end);
        if (startSec === null || endSec === null) {
          return 'Custom timestamp ranges must use MM:SS or HH:MM:SS format (e.g., 05:00).';
        }
        if (endSec <= startSec) {
          return `Invalid timestamp range ("${range.start}" - "${range.end}"): end must be greater than start.`;
        }
      }
    }
  }
  return null;
}

/**
 * Formats a card sourceLocator string with a timestamp icon when it contains
 * a MM:SS / HH:MM:SS coordinate, or a location pin otherwise.
 */
export function formatLocatorLabel(locator: string): string {
  const icon = /\d:\d{2}/.test(locator) ? '⏱️' : '📍';
  return `${icon} ${locator}`;
}

const CLIENT_YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extracts a canonical 11-character YouTube video ID from standard watch, short youtu.be,
 * shorts, live, embed, mobile/music URLs, or bare IDs.
 */
export function extractClientYouTubeVideoId(input: string): string | null {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;
  if (CLIENT_YT_ID_RE.test(trimmed)) return trimmed;

  const candidateUrl = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : /^(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(trimmed)
      ? `https://${trimmed}`
      : null;
  if (!candidateUrl) return null;

  let parsed: URL;
  try {
    parsed = new URL(candidateUrl);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  const isShortHost = host === 'youtu.be' || host.endsWith('.youtu.be');
  const isYouTubeHost =
    host === 'youtube.com' ||
    host.endsWith('.youtube.com') ||
    host === 'youtube-nocookie.com' ||
    host.endsWith('.youtube-nocookie.com');
  if (!isShortHost && !isYouTubeHost) return null;

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (isShortHost) {
    const id = segments[0] ?? '';
    return CLIENT_YT_ID_RE.test(id) ? id : null;
  }

  const vParam = parsed.searchParams.get('v')?.trim() ?? '';
  if (CLIENT_YT_ID_RE.test(vParam)) return vParam;

  if (segments.length >= 2 && ['shorts', 'live', 'embed', 'v'].includes(segments[0].toLowerCase())) {
    const id = segments[1] ?? '';
    return CLIENT_YT_ID_RE.test(id) ? id : null;
  }

  return null;
}

export function canonicalizeYouTubeUrl(input: string): string | null {
  const id = extractClientYouTubeVideoId(input);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}

/**
 * Plans additions of YouTube URLs/IDs into a MediaSourceItem list, normalizing URLs
 * to canonical watch links and catching duplicates across all YouTube URL formats.
 */
export function planYoutubeUrlAdditions(
  inputs: string[],
  existingItems: MediaSourceItem[],
  defaults: { extractionMode?: MediaExtractionMode; sttProvider?: SttProvider } = {}
): {
  additions: MediaSourceItem[];
  duplicates: Array<{ input: string; videoId: string; duplicateOf: string }>;
  invalid: string[];
} {
  const seenVideoIds = new Map<string, string>();
  const seenRawUris = new Set<string>();

  for (const item of existingItems) {
    const clean = (item.uri || '').trim();
    if (!clean) continue;
    seenRawUris.add(clean);
    const vid = extractClientYouTubeVideoId(clean);
    if (vid && !seenVideoIds.has(vid)) {
      seenVideoIds.set(vid, clean);
    }
  }

  const additions: MediaSourceItem[] = [];
  const duplicates: Array<{ input: string; videoId: string; duplicateOf: string }> = [];
  const invalid: string[] = [];

  for (const raw of inputs) {
    const clean = (raw || '').trim();
    if (!clean) continue;
    const videoId = extractClientYouTubeVideoId(clean);
    if (!videoId) {
      invalid.push(clean);
      continue;
    }

    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const existingMatch = seenVideoIds.get(videoId);
    if (existingMatch || seenRawUris.has(canonicalUrl) || seenRawUris.has(clean)) {
      duplicates.push({
        input: clean,
        videoId,
        duplicateOf: existingMatch || canonicalUrl,
      });
      continue;
    }

    seenVideoIds.set(videoId, canonicalUrl);
    seenRawUris.add(canonicalUrl);
    additions.push({
      uri: canonicalUrl,
      extractionMode: defaults.extractionMode ?? 'auto',
      sttProvider: defaults.sttProvider ?? 'openai',
      timestampRanges: [],
    });
  }

  return { additions, duplicates, invalid };
}
