import {
  canonicalizeYouTubeUrl as coreCanonicalizeYouTubeUrl,
  extractYouTubeVideoId as coreExtractYouTubeVideoId,
  getItemSyncStatus as coreGetItemSyncStatus,
  parseRawMediaSourceItems,
  parseSourceUrlsPure,
  stripUrlFragment as coreStripUrlFragment,
} from '@flashcard-master/core/sync-keys';
import type { DataSourceType, ItemSyncState, MediaExtractionMode, MediaSourceItem, SttProvider } from './types.js';

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
  const items = parseRawMediaSourceItems(trimmed) as MediaSourceItem[];
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

/**
 * Extracts a canonical 11-character YouTube video ID from standard watch, short youtu.be,
 * shorts, live, embed, mobile/music URLs, or bare IDs.
 */
export function extractClientYouTubeVideoId(input: string): string | null {
  return coreExtractYouTubeVideoId(input);
}

export function canonicalizeYouTubeUrl(input: string): string | null {
  return coreCanonicalizeYouTubeUrl(input);
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
    const vid = coreExtractYouTubeVideoId(clean);
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
    const videoId = coreExtractYouTubeVideoId(clean);
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

/**
 * Parses configured web source URI strings across single URLs, JSON arrays, and comma/newline lists
 * while preserving commas inside URL query/path segments.
 */
export function parseWebSourceUrlsClient(raw: string): string[] {
  return parseSourceUrlsPure(raw, { filterHttpOnly: false, deduplicate: false });
}

/**
 * Strips hash fragments from HTTP(S) URLs and known/EPUB slice fragments from local paths.
 */
export function stripClientUrlFragment(rawUri: string): string {
  return coreStripUrlFragment(rawUri);
}

/**
 * Evaluates whether a configured item URI/path matches already-synced parent keys returned by GET /api/sources/:id/sync-status.
 */
export function getClientItemSyncStatus(
  uri: string,
  sourceType: DataSourceType | string,
  knownKeys: ReadonlyArray<string> | ReadonlySet<string> | undefined | null
): ItemSyncState {
  return coreGetItemSyncStatus(uri, sourceType, knownKeys);
}

export function formatSyncCompletionSummary(
  sourceName: string | null,
  counts: { newCount?: number; totalFetched?: number; skippedCount?: number; totalSources?: number | string }
): { variant: 'success' | 'info'; message: string } {
  const newCount = counts.newCount ?? 0;
  const totalFetched = counts.totalFetched ?? 0;
  const skippedCount = counts.skippedCount ?? 0;
  const skippedSuffix = skippedCount > 0 ? `, ${skippedCount} already-synced skipped` : '';
  if (sourceName) {
    if (newCount > 0) {
      return {
        variant: 'success',
        message: `🎉 Synced "${sourceName}": ${newCount} new document(s) ingested (${totalFetched} checked${skippedSuffix}).`,
      };
    }
    return {
      variant: 'info',
      message: `Synced "${sourceName}": Up to date (0 new documents, ${totalFetched} checked${skippedSuffix}).`,
    };
  }
  const sourcesLabel = counts.totalSources !== undefined ? ` across ${counts.totalSources} sources` : '';
  return {
    variant: 'success',
    message: `🎉 Bulk sync completed: ${newCount} new document(s) ingested${sourcesLabel}${skippedSuffix}.`,
  };
}
