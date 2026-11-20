import type { DataSource, CleanTextDocument, DiscoveredDocument, RawDocument, SyncMode, SyncState } from "../domain/models.js";
import type { DataSourceRepository } from "../storage/source-repository.js";
import type { SyncStateRepository } from "../storage/sync-state-repository.js";
import type { DocumentRepository } from "../storage/document-repository.js";
import type { StrategyRegistry } from "./strategy-registry.js";
import type { IngestionOptions } from "../ports/index.js";
import { DocumentSlicingEngine, type DocumentSlicingOptions } from "./document-slicing-engine.js";
import {
  buildKnownItemKeysForSource,
  createKnownItemMatcher,
  normalizeHttpUrlKey,
  type KnownItemMatcher,
} from "./sync-item-keys.js";
import crypto from "node:crypto";

export interface SyncResult {
  sourceId: string;
  sourceName: string;
  newDocuments: CleanTextDocument[];
  totalFetched: number;
  newCount: number;
  skippedCount: number;
  durationMs: number;
  error?: string;
}

function extractPageBounds(text: string): { startPage: number | null; endPage: number | null } {
  const pageMatches = Array.from(text.matchAll(/<!--\s*page:\s*(\d+)\s*-->/gi));
  if (pageMatches.length > 0) {
    const pageNumbers = pageMatches.map((m) => parseInt(m[1], 10)).filter((n) => !isNaN(n));
    if (pageNumbers.length > 0) {
      return {
        startPage: Math.min(...pageNumbers),
        endPage: Math.max(...pageNumbers),
      };
    }
  }
  return { startPage: null, endPage: null };
}

function resolveSlicingForRaw(
  raw: { slicingHint?: { mode?: "chapters" | "timestamps" | "none"; minutesPerChunk?: number } },
  baseSlicing?: DocumentSlicingOptions
): DocumentSlicingOptions | undefined {
  const hint = raw.slicingHint;
  if (!hint || (!hint.mode && hint.minutesPerChunk === undefined)) {
    return baseSlicing;
  }
  const mergedMode = hint.mode ?? baseSlicing?.mode;
  const mergedMinutes = hint.minutesPerChunk ?? baseSlicing?.minutesPerChunk;
  if (!mergedMode && mergedMinutes === undefined) {
    return baseSlicing;
  }
  return {
    ...baseSlicing,
    ...(mergedMode ? { mode: mergedMode } : {}),
    ...(mergedMinutes !== undefined ? { minutesPerChunk: mergedMinutes } : {}),
  };
}

function isRawDocKnown(
  source: Pick<DataSource, "type" | "uri">,
  raw: RawDocument,
  matcher: KnownItemMatcher,
  lastSync?: SyncState
): boolean {
  if (matcher.isEmpty) return false;

  switch (source.type) {
    case "local":
    case "audio":
    case "video":
      return Boolean(
        (raw.originUrl && matcher.hasLocalPath(raw.originUrl)) ||
          (raw.guid && matcher.hasRaw(raw.guid))
      );

    case "youtube":
      return Boolean(
        (raw.originUrl && matcher.hasYouTubeUri(raw.originUrl)) ||
          (raw.guid && matcher.hasYouTubeUri(raw.guid))
      );

    case "notion": {
      if (!matcher.hasNotionPage(raw.guid || "", raw.originUrl)) {
        return false;
      }
      if (lastSync?.lastSyncedAt && raw.publishedAt) {
        const editedMs = Date.parse(raw.publishedAt);
        const syncedMs = Date.parse(lastSync.lastSyncedAt);
        if (!isNaN(editedMs) && !isNaN(syncedMs) && editedMs > syncedMs) {
          return false;
        }
      }
      return true;
    }

    case "rss": {
      if (raw.guid && matcher.hasRaw(raw.guid)) {
        return true;
      }
      if (raw.originUrl) {
        const originKey = normalizeHttpUrlKey(raw.originUrl);
        const feedKey = normalizeHttpUrlKey(source.uri);
        if (originKey && originKey !== feedKey && matcher.hasHttpUrl(raw.originUrl)) {
          return true;
        }
      }
      return false;
    }

    case "web":
    case "sitemap":
    case "llms-txt":
    default:
      return Boolean(
        (raw.originUrl && matcher.hasHttpUrl(raw.originUrl)) ||
          (raw.guid && matcher.hasRaw(raw.guid))
      );
  }
}

export class IngestionService {
  private readonly slicingEngine: DocumentSlicingEngine;

  constructor(
    private readonly sourceRepo: DataSourceRepository,
    private readonly syncRepo: SyncStateRepository,
    private readonly strategyRegistry: StrategyRegistry,
    private readonly docRepo?: DocumentRepository,
    slicingEngine?: DocumentSlicingEngine
  ) {
    this.slicingEngine = slicingEngine ?? new DocumentSlicingEngine();
  }

  async syncSource(sourceId: string, options?: IngestionOptions): Promise<SyncResult> {
    const startTime = Date.now();
    const source = this.sourceRepo.getById(sourceId);

    if (!source) {
      return {
        sourceId,
        sourceName: "Unknown",
        newDocuments: [],
        totalFetched: 0,
        newCount: 0,
        skippedCount: 0,
        durationMs: Date.now() - startTime,
        error: `Data source with ID ${sourceId} not found.`,
      };
    }

    if (!source.isActive) {
      return {
        sourceId: source.id,
        sourceName: source.name,
        newDocuments: [],
        totalFetched: 0,
        newCount: 0,
        skippedCount: 0,
        durationMs: Date.now() - startTime,
        error: `Data source "${source.name}" is disabled.`,
      };
    }

    try {
      const syncMode: SyncMode = options?.syncMode ?? "new-only";
      options?.onLog?.(
        "info",
        `Starting synchronization (${syncMode}) for "${source.name}" (${source.type})...`
      );
      const strategy = this.strategyRegistry.getStrategy(source.type);
      const lastSync = this.syncRepo.get(source.id) ?? undefined;

      const existingDocs = this.docRepo ? this.docRepo.listBySourceId(source.id) : [];
      const knownItemKeys =
        syncMode === "full"
          ? undefined
          : options?.knownItemKeys ?? buildKnownItemKeysForSource(source, existingDocs);
      const knownMatcher = createKnownItemMatcher(source.type, knownItemKeys);

      let preFetchSkippedCount = 0;
      const effectiveOptions: IngestionOptions = {
        ...options,
        syncMode,
        knownItemKeys,
        onItemSkipped: (itemKey: string) => {
          preFetchSkippedCount++;
          options?.onItemSkipped?.(itemKey);
        },
      };

      const rawDocs = await strategy.fetch(source, lastSync, effectiveOptions);
      const totalFetched = rawDocs.length;
      options?.onLog?.(
        "info",
        `Retrieved ${totalFetched} raw document(s) from "${source.name}"${preFetchSkippedCount > 0 ? ` (${preFetchSkippedCount} known item(s) skipped pre-fetch)` : ""}`
      );

      const newDocuments: CleanTextDocument[] = [];
      const docsToPersist: Array<
        Partial<DiscoveredDocument> & { sourceId: string; title: string; textContent: string }
      > = [];
      let latestGuid = lastSync?.lastGuid ?? null;
      let latestContentHash = lastSync?.contentHash ?? null;

      const baseSlicing: DocumentSlicingOptions | undefined =
        options?.slicing ??
        (source.defaultSlicingMode
          ? {
              mode: source.defaultSlicingMode,
              ...(source.defaultIntervalMinutes != null
                ? { minutesPerChunk: source.defaultIntervalMinutes }
                : {}),
            }
          : undefined);

      const isSlicingActive = rawDocs.some((raw) => {
        const eff = resolveSlicingForRaw(raw, baseSlicing);
        return Boolean(eff && eff.mode !== "none");
      });

      if (isSlicingActive && rawDocs.length > 0) {
        options?.onLog?.(
          "info",
          `Slicing transcript/documents (${baseSlicing?.mode || "per-item"}) for "${source.name}"...`,
          { sourceId: source.id, stage: "slicing" }
        );
      }

      const shouldResetToUnsliced =
        syncMode === "full" &&
        !isSlicingActive &&
        rawDocs.length > 0 &&
        (existingDocs.length > rawDocs.length ||
          (baseSlicing?.mode === "none" &&
            existingDocs.some((d) =>
              rawDocs.some(
                (r) =>
                  r.title &&
                  d.title !== r.title &&
                  (d.title.startsWith(`${r.title} - `) || d.title.startsWith(`${r.title} [`))
              )
            )));

      let changedRawDocsCount = 0;
      let postFetchSkippedCount = 0;

      for (const raw of rawDocs) {
        if (syncMode !== "full" && isRawDocKnown(source, raw, knownMatcher, lastSync)) {
          postFetchSkippedCount++;
          continue;
        }

        const cleanDoc = strategy.extractCleanText(raw);

        if (syncMode !== "full" && !isSlicingActive && !shouldResetToUnsliced) {
          const isPathBasedSource =
            source.type === "local" || source.type === "audio" || source.type === "video";
          const isLinklessRssFallback =
            source.type === "rss" &&
            Boolean(raw.originUrl) &&
            normalizeHttpUrlKey(raw.originUrl!) === normalizeHttpUrlKey(source.uri);
          const hasDistinctTrackedOrigin = Boolean(
            this.docRepo && raw.originUrl && !isLinklessRssFallback
          );
          const isSameContent = Boolean(
            !isPathBasedSource &&
              !hasDistinctTrackedOrigin &&
              lastSync?.contentHash &&
              cleanDoc.contentHash === lastSync.contentHash
          );
          const isSeenGuid = Boolean(
            lastSync?.lastGuid && raw.guid && raw.guid === lastSync.lastGuid
          );

          if (isSameContent || (source.type === "rss" && isSeenGuid)) {
            postFetchSkippedCount++;
            continue;
          }
        }

        changedRawDocsCount++;

        if (cleanDoc.startPage == null && cleanDoc.textContent) {
          const bounds = extractPageBounds(cleanDoc.textContent);
          if (bounds.startPage !== null) {
            cleanDoc.startPage = bounds.startPage;
            cleanDoc.endPage = bounds.endPage;
          }
        }

        const docUrl =
          cleanDoc.originUrl ||
          raw.originUrl ||
          (source.type === "web" ? source.uri : null);
        const effectiveSlicing = resolveSlicingForRaw(raw, baseSlicing);
        const isRawSlicingActive = Boolean(effectiveSlicing && effectiveSlicing.mode !== "none");

        if (isRawSlicingActive) {
          const slices = this.slicingEngine.slice(
            {
              sourceId: source.id,
              title: cleanDoc.title || "Untitled Document",
              textContent: cleanDoc.textContent,
              rawContent: raw.rawContent || cleanDoc.rawContent || null,
              url: docUrl,
              originUrl: docUrl,
              startSeconds: cleanDoc.startSeconds ?? null,
              endSeconds: cleanDoc.endSeconds ?? null,
            },
            effectiveSlicing
          );
          for (const slice of slices) {
            newDocuments.push({
              id: slice.id,
              sourceId: slice.sourceId,
              title: slice.title,
              textContent: slice.textContent,
              rawContent: slice.rawContent || undefined,
              originUrl: slice.url || undefined,
              contentHash: slice.contentHash,
              startPage: slice.startPage ?? null,
              endPage: slice.endPage ?? null,
              startSeconds: slice.startSeconds ?? cleanDoc.startSeconds ?? null,
              endSeconds: slice.endSeconds ?? cleanDoc.endSeconds ?? null,
            });
            docsToPersist.push({
              id: slice.id,
              sourceId: slice.sourceId,
              title: slice.title,
              url: slice.url,
              textContent: slice.textContent,
              rawContent: slice.rawContent || null,
              contentHash: slice.contentHash,
              wordCount: slice.wordCount,
              startPage: slice.startPage ?? null,
              endPage: slice.endPage ?? null,
              startSeconds: slice.startSeconds ?? cleanDoc.startSeconds ?? null,
              endSeconds: slice.endSeconds ?? cleanDoc.endSeconds ?? null,
            });
          }
        } else {
          newDocuments.push(cleanDoc);

          const uniqueKey = docUrl || raw.guid || cleanDoc.title;
          const deterministicId = crypto
            .createHash("sha256")
            .update(`${source.id}:${uniqueKey}`)
            .digest("hex")
            .slice(0, 32);

          const wordCount = cleanDoc.textContent.trim()
            ? cleanDoc.textContent.trim().split(/\s+/).length
            : 0;

          docsToPersist.push({
            id: deterministicId,
            sourceId: source.id,
            title: cleanDoc.title || "Untitled Document",
            url: docUrl,
            textContent: cleanDoc.textContent,
            rawContent: raw.rawContent || cleanDoc.rawContent || null,
            contentHash: cleanDoc.contentHash || null,
            wordCount,
            startPage: cleanDoc.startPage ?? null,
            endPage: cleanDoc.endPage ?? null,
            startSeconds: cleanDoc.startSeconds ?? null,
            endSeconds: cleanDoc.endSeconds ?? null,
          });
        }

        if (raw.guid) latestGuid = raw.guid;
        if (cleanDoc.contentHash) latestContentHash = cleanDoc.contentHash;
      }

      if (this.docRepo && rawDocs.length > 0 && changedRawDocsCount > 0) {
        if (isSlicingActive && docsToPersist.length === 0) {
          options?.onLog?.(
            "warn",
            `No document slices matched the configured slicing/timestamp criteria for "${source.name}"; preserving existing documents.`,
            { sourceId: source.id, stage: "slicing" }
          );
        } else if (docsToPersist.length > 0) {
          if (syncMode === "full" && (isSlicingActive || shouldResetToUnsliced)) {
            // Purge previously generated subdocuments in 'full' mode to prevent orphan/obsolete slices
            this.docRepo.deleteBySourceId(source.id);
          }
          this.docRepo.upsertBatch(docsToPersist);
        }
      }

      const skippedCount = preFetchSkippedCount + postFetchSkippedCount;

      // Update sync state cursor atomically
      this.syncRepo.upsert({
        sourceId: source.id,
        lastSyncedAt: new Date().toISOString(),
        lastGuid: latestGuid,
        contentHash: latestContentHash,
        itemCount: newDocuments.length,
      });

      options?.onLog?.(
        "info",
        `Sync finished for "${source.name}": ${newDocuments.length} new/updated document(s), ${skippedCount} skipped`
      );

      return {
        sourceId: source.id,
        sourceName: source.name,
        newDocuments,
        totalFetched,
        newCount: newDocuments.length,
        skippedCount,
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      options?.onLog?.("error", `Sync error for "${source.name}": ${err.message}`);
      return {
        sourceId: source.id,
        sourceName: source.name,
        newDocuments: [],
        totalFetched: 0,
        newCount: 0,
        skippedCount: 0,
        durationMs: Date.now() - startTime,
        error: err.message || "Unknown synchronization error",
      };
    }
  }

  async syncAllActive(options?: IngestionOptions): Promise<SyncResult[]> {
    const activeSources = this.sourceRepo.list({ isActive: true });
    const results: SyncResult[] = [];

    for (const source of activeSources) {
      // Execute each source with isolated error handling (NFR-301)
      const result = await this.syncSource(source.id, options);
      results.push(result);
    }

    return results;
  }
}
