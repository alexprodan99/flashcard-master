import type { DataSource, CleanTextDocument } from "../domain/models.js";
import type { DataSourceRepository } from "../storage/source-repository.js";
import type { SyncStateRepository } from "../storage/sync-state-repository.js";
import type { DocumentRepository } from "../storage/document-repository.js";
import type { StrategyRegistry } from "./strategy-registry.js";

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

export class IngestionService {
  constructor(
    private readonly sourceRepo: DataSourceRepository,
    private readonly syncRepo: SyncStateRepository,
    private readonly strategyRegistry: StrategyRegistry,
    private readonly docRepo?: DocumentRepository
  ) {}

  async syncSource(sourceId: string): Promise<SyncResult> {
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
      const strategy = this.strategyRegistry.getStrategy(source.type);
      const lastSync = this.syncRepo.get(source.id) ?? undefined;

      const rawDocs = await strategy.fetch(source, lastSync);
      const totalFetched = rawDocs.length;

      const newDocuments: CleanTextDocument[] = [];
      let latestGuid = lastSync?.lastGuid ?? null;
      let latestContentHash = lastSync?.contentHash ?? null;

      // Extract and filter for incremental delta
      for (const raw of rawDocs) {
        const cleanDoc = strategy.extractCleanText(raw);

        // Deduplication check against previous sync
        const isSeenGuid = lastSync?.lastGuid && raw.guid && raw.guid === lastSync.lastGuid;
        const isSeenHash = lastSync?.contentHash && cleanDoc.contentHash === lastSync.contentHash;

        if (isSeenGuid || isSeenHash) {
          continue;
        }

        newDocuments.push(cleanDoc);

        // Track most recent item
        if (raw.guid) latestGuid = raw.guid;
        if (cleanDoc.contentHash) latestContentHash = cleanDoc.contentHash;
      }

      // Persist discovered documents into repository
      if (this.docRepo && rawDocs.length > 0) {
        const docsToPersist = rawDocs.map((raw) => {
          const cleanDoc = strategy.extractCleanText(raw);
          const wordCount = cleanDoc.textContent.trim()
            ? cleanDoc.textContent.trim().split(/\s+/).length
            : 0;
          return {
            id: cleanDoc.id,
            sourceId: source.id,
            title: cleanDoc.title || "Untitled Document",
            url: cleanDoc.originUrl || raw.originUrl || (source.type === "web" || source.type === "rss" || source.type === "sitemap" || source.type === "llms-txt" ? source.uri : null),
            textContent: cleanDoc.textContent,
            contentHash: cleanDoc.contentHash || null,
            wordCount,
          };
        });
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

  async syncAllActive(): Promise<SyncResult[]> {
    const activeSources = this.sourceRepo.list({ isActive: true });
    const results: SyncResult[] = [];

    for (const source of activeSources) {
      // Execute each source with isolated error handling (NFR-301)
      const result = await this.syncSource(source.id);
      results.push(result);
    }

    return results;
  }
}
