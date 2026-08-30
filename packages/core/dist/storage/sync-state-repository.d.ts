import type Database from "better-sqlite3";
import { SyncState } from "../domain/models.js";
export declare class SyncStateRepository {
    private readonly db;
    constructor(db: Database.Database);
    get(sourceId: string): SyncState | null;
    upsert(state: SyncState): void;
    delete(sourceId: string): boolean;
}
//# sourceMappingURL=sync-state-repository.d.ts.map