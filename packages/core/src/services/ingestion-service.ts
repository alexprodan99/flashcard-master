import type { DataSource, CleanTextDocument, DiscoveredDocument } from "../domain/models.js";
import type { DataSourceRepository } from "../storage/source-repository.js";
import type { SyncStateRepository } from "../storage/sync-state-repository.js";
import type { DocumentRepository } from "../storage/document-repository.js";
import type { StrategyRegistry } from "./strategy-registry.js";
import type { IngestionOptions } from "../ports/index.js";
import { DocumentSlicingEngine } from "./document-slicing-engine.js";
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
      options?.onLog?.("info", `Starting synchronization for "${source.name}" (${source.type})...`);
      const strategy = this.strategyRegistry.getStrategy(source.type);
      const lastSync = this.syncRepo.get(source.id) ?? undefined;

      const rawDocs = await strategy.fetch(source, lastSync, options);
      const totalFetched = rawDocs.length;
      options?.onLog?.("info", `Retrieved ${totalFetched} raw document(s) from "${source.name}"`);

      const newDocuments: CleanTextDocument[] = [];
      let latestGuid = lastSync?.lastGuid ?? null;
      let latestContentHash = lastSync?.contentHash ?? null;

      const isSlicingActive = Boolean(options?.slicing && options.slicing.mode !== "none");

      // Extract and filter for incremental delta
      for (const raw of rawDocs) {
        const cleanDoc = strategy.extractCleanText(raw);

        // Deduplication check against previous sync
        const isSeenGuid = lastSync?.lastGuid && raw.guid && raw.guid === lastSync.lastGuid;
        const isSeenHash = lastSync?.contentHash && cleanDoc.contentHash === lastSync.contentHash;

        if (isSeenGuid || isSeenHash) {
          continue;
        }

        if (cleanDoc.startPage == null && cleanDoc.textContent) {
          const bounds = extractPageBounds(cleanDoc.textContent);
          if (bounds.startPage !== null) {
            cleanDoc.startPage = bounds.startPage;
            cleanDoc.endPage = bounds.endPage;
          }
        }

        if (isSlicingActive) {
          const docUrl =
            cleanDoc.originUrl ||
            raw.originUrl ||
            (source.type === "web" ? source.uri : null);
          const slices = this.slicingEngine.slice(
            {
              sourceId: source.id,
              title: cleanDoc.title || "Untitled Document",
              textContent: cleanDoc.textContent,
              rawContent: raw.rawContent || cleanDoc.rawContent || null,
              url: docUrl,
              originUrl: docUrl,
            },
            options!.slicing
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
            });
          }
        } else {
          newDocuments.push(cleanDoc);
        }

        // Track most recent item
        if (raw.guid) latestGuid = raw.guid;
        if (cleanDoc.contentHash) latestContentHash = cleanDoc.contentHash;
      }

      // Persist discovered documents into repository
      if (this.docRepo && rawDocs.length > 0) {
        if (isSlicingActive) {
          // Purge previously generated subdocuments for this source to prevent orphan/obsolete slices
          this.docRepo.deleteBySourceId(source.id);
        }

        const docsToPersist: Array<
          Partial<DiscoveredDocument> & { sourceId: string; title: string; textContent: string }
        > = [];

        for (const raw of rawDocs) {
          const cleanDoc = strategy.extractCleanText(raw);
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

          if (isSlicingActive) {
            const slices = this.slicingEngine.slice(
              {
                sourceId: source.id,
                title: cleanDoc.title || "Untitled Document",
                textContent: cleanDoc.textContent,
                rawContent: raw.rawContent || cleanDoc.rawContent || null,
                url: docUrl,
                originUrl: docUrl,
              },
              options!.slicing
            );

            for (const slice of slices) {
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
              });
            }
          } else {
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
            });
          }
        }

        this.docRepo.upsertBatch(docsToPersist);
      }

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
        `Sync finished for "${source.name}": ${newDocuments.length} new/updated document(s), ${totalFetched - newDocuments.length} unchanged`
      );

      return {
        sourceId: source.id,
        sourceName: source.name,
        newDocuments,
        totalFetched,
        newCount: newDocuments.length,
        skippedCount: totalFetched - newDocuments.length,
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
