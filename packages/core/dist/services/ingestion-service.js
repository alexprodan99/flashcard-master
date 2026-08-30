export class IngestionService {
    sourceRepo;
    syncRepo;
    strategyRegistry;
    constructor(sourceRepo, syncRepo, strategyRegistry) {
        this.sourceRepo = sourceRepo;
        this.syncRepo = syncRepo;
        this.strategyRegistry = strategyRegistry;
    }
    async syncSource(sourceId) {
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
            const newDocuments = [];
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
                if (raw.guid)
                    latestGuid = raw.guid;
                if (cleanDoc.contentHash)
                    latestContentHash = cleanDoc.contentHash;
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
        }
        catch (err) {
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
    async syncAllActive() {
        const activeSources = this.sourceRepo.list({ isActive: true });
        const results = [];
        for (const source of activeSources) {
            // Execute each source with isolated error handling (NFR-301)
            const result = await this.syncSource(source.id);
            results.push(result);
        }
        return results;
    }
}
//# sourceMappingURL=ingestion-service.js.map