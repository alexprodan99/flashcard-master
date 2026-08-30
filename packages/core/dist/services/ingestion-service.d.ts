import type { CleanTextDocument } from "../domain/models.js";
import type { DataSourceRepository } from "../storage/source-repository.js";
import type { SyncStateRepository } from "../storage/sync-state-repository.js";
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
export declare class IngestionService {
    private readonly sourceRepo;
    private readonly syncRepo;
    private readonly strategyRegistry;
    constructor(sourceRepo: DataSourceRepository, syncRepo: SyncStateRepository, strategyRegistry: StrategyRegistry);
    syncSource(sourceId: string): Promise<SyncResult>;
    syncAllActive(): Promise<SyncResult[]>;
}
//# sourceMappingURL=ingestion-service.d.ts.map