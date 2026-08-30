import { SyncStateSchema } from "../domain/models.js";
export class SyncStateRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    get(sourceId) {
        const row = this.db.prepare("SELECT * FROM sync_state WHERE source_id = ?").get(sourceId);
        if (!row) {
            return null;
        }
        return SyncStateSchema.parse({
            sourceId: row.source_id,
            lastSyncedAt: row.last_synced_at,
            lastGuid: row.last_guid,
            contentHash: row.content_hash,
            itemCount: row.item_count,
        });
    }
    upsert(state) {
        const valid = SyncStateSchema.parse(state);
        const stmt = this.db.prepare(`
      INSERT INTO sync_state (source_id, last_synced_at, last_guid, content_hash, item_count)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(source_id) DO UPDATE SET
        last_synced_at = excluded.last_synced_at,
        last_guid = excluded.last_guid,
        content_hash = excluded.content_hash,
        item_count = excluded.item_count
    `);
        stmt.run(valid.sourceId, valid.lastSyncedAt, valid.lastGuid ?? null, valid.contentHash ?? null, valid.itemCount);
    }
    delete(sourceId) {
        const result = this.db.prepare("DELETE FROM sync_state WHERE source_id = ?").run(sourceId);
        return result.changes > 0;
    }
}
//# sourceMappingURL=sync-state-repository.js.map