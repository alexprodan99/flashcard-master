import { z } from "zod";
import { DataSourceSchema, DataSourceTypeSchema } from "../domain/models.js";
import crypto from "node:crypto";
export const CreateSourceInputSchema = z.object({
    name: z.string().min(1, "Name is required"),
    type: DataSourceTypeSchema,
    uri: z.string().min(1, "URI is required"),
    targetDeck: z.string().default("Default"),
    tags: z.array(z.string()).default([]),
    isActive: z.boolean().default(true),
});
export const UpdateSourceInputSchema = z.object({
    name: z.string().min(1).optional(),
    type: DataSourceTypeSchema.optional(),
    uri: z.string().min(1).optional(),
    targetDeck: z.string().min(1).optional(),
    tags: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
});
export class DataSourceRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    mapRowToDataSource(row) {
        return DataSourceSchema.parse({
            id: row.id,
            name: row.name,
            type: row.type,
            uri: row.uri,
            targetDeck: row.target_deck,
            tags: typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags,
            isActive: Boolean(row.is_active),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        });
    }
    create(rawInput) {
        const input = CreateSourceInputSchema.parse(rawInput);
        const id = crypto.randomUUID();
        const tagsJson = JSON.stringify(input.tags);
        const isActiveInt = input.isActive ? 1 : 0;
        const stmt = this.db.prepare(`
      INSERT INTO data_sources (id, name, type, uri, target_deck, tags, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(id, input.name, input.type, input.uri, input.targetDeck, tagsJson, isActiveInt);
        const created = this.getById(id);
        if (!created) {
            throw new Error(`Failed to retrieve newly created data source: ${id}`);
        }
        return created;
    }
    getById(id) {
        const row = this.db.prepare("SELECT * FROM data_sources WHERE id = ?").get(id);
        if (!row) {
            return null;
        }
        return this.mapRowToDataSource(row);
    }
    list(filter) {
        let query = "SELECT * FROM data_sources WHERE 1=1";
        const params = [];
        if (filter?.isActive !== undefined) {
            query += " AND is_active = ?";
            params.push(filter.isActive ? 1 : 0);
        }
        if (filter?.type !== undefined) {
            query += " AND type = ?";
            params.push(filter.type);
        }
        query += " ORDER BY created_at DESC";
        const rows = this.db.prepare(query).all(...params);
        return rows.map((row) => this.mapRowToDataSource(row));
    }
    update(id, rawInput) {
        const input = UpdateSourceInputSchema.parse(rawInput);
        const existing = this.getById(id);
        if (!existing) {
            return null;
        }
        const updates = [];
        const params = [];
        if (input.name !== undefined) {
            updates.push("name = ?");
            params.push(input.name);
        }
        if (input.type !== undefined) {
            updates.push("type = ?");
            params.push(input.type);
        }
        if (input.uri !== undefined) {
            updates.push("uri = ?");
            params.push(input.uri);
        }
        if (input.targetDeck !== undefined) {
            updates.push("target_deck = ?");
            params.push(input.targetDeck);
        }
        if (input.tags !== undefined) {
            updates.push("tags = ?");
            params.push(JSON.stringify(input.tags));
        }
        if (input.isActive !== undefined) {
            updates.push("is_active = ?");
            params.push(input.isActive ? 1 : 0);
        }
        if (updates.length === 0) {
            return existing;
        }
        updates.push("updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')");
        params.push(id);
        const query = `UPDATE data_sources SET ${updates.join(", ")} WHERE id = ?`;
        this.db.prepare(query).run(...params);
        return this.getById(id);
    }
    delete(id) {
        const result = this.db.prepare("DELETE FROM data_sources WHERE id = ?").run(id);
        return result.changes > 0;
    }
    toggleActive(id) {
        const existing = this.getById(id);
        if (!existing) {
            return null;
        }
        return this.update(id, { isActive: !existing.isActive });
    }
}
//# sourceMappingURL=source-repository.js.map