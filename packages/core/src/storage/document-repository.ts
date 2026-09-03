import type Database from "better-sqlite3";
import { DiscoveredDocument, DiscoveredDocumentSchema } from "../domain/models.js";
import crypto from "node:crypto";

export interface DocumentListOptions {
  limit?: number;
  offset?: number;
  search?: string;
}

export class DocumentRepository {
  constructor(private readonly db: Database.Database) {}

  private mapRowToDocument(row: any): DiscoveredDocument {
    return DiscoveredDocumentSchema.parse({
      id: row.id,
      sourceId: row.source_id,
      title: row.title,
      url: row.url || null,
      textContent: row.text_content,
      contentHash: row.content_hash || null,
      wordCount: typeof row.word_count === "number" ? row.word_count : 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  upsert(rawDoc: Partial<DiscoveredDocument> & { sourceId: string; title: string; textContent: string }): DiscoveredDocument {
    const id = rawDoc.id || crypto.randomUUID();
    const wordCount =
      rawDoc.wordCount !== undefined
        ? rawDoc.wordCount
        : rawDoc.textContent.trim()
        ? rawDoc.textContent.trim().split(/\s+/).length
        : 0;

    const stmt = this.db.prepare(`
      INSERT INTO documents (id, source_id, title, url, text_content, content_hash, word_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        url = excluded.url,
        text_content = excluded.text_content,
        content_hash = excluded.content_hash,
        word_count = excluded.word_count,
        updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    `);

    stmt.run(
      id,
      rawDoc.sourceId,
      rawDoc.title,
      rawDoc.url || null,
      rawDoc.textContent,
      rawDoc.contentHash || null,
      wordCount
    );

    const created = this.getById(id);
    if (!created) {
      throw new Error(`Failed to retrieve newly upserted document: ${id}`);
    }
    return created;
  }

  upsertBatch(docs: Array<Partial<DiscoveredDocument> & { sourceId: string; title: string; textContent: string }>): void {
    if (!docs || docs.length === 0) return;

    const stmt = this.db.prepare(`
      INSERT INTO documents (id, source_id, title, url, text_content, content_hash, word_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        url = excluded.url,
        text_content = excluded.text_content,
        content_hash = excluded.content_hash,
        word_count = excluded.word_count,
        updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    `);

    const transaction = this.db.transaction((items) => {
      for (const rawDoc of items) {
        const id = rawDoc.id || crypto.randomUUID();
        const wordCount =
          rawDoc.wordCount !== undefined
            ? rawDoc.wordCount
            : rawDoc.textContent.trim()
            ? rawDoc.textContent.trim().split(/\s+/).length
            : 0;

        stmt.run(
          id,
          rawDoc.sourceId,
          rawDoc.title,
          rawDoc.url || null,
          rawDoc.textContent,
          rawDoc.contentHash || null,
          wordCount
        );
      }
    });

    transaction(docs);
  }

  getById(id: string): DiscoveredDocument | null {
    const row = this.db.prepare("SELECT * FROM documents WHERE id = ?").get(id);
    if (!row) {
      return null;
    }
    return this.mapRowToDocument(row);
  }

  listBySourceId(sourceId: string, options: DocumentListOptions = {}): DiscoveredDocument[] {
    let query = "SELECT * FROM documents WHERE source_id = ?";
    const params: any[] = [sourceId];

    if (options.search && options.search.trim().length > 0) {
      query += " AND (title LIKE ? OR url LIKE ? OR text_content LIKE ?)";
      const pattern = `%${options.search.trim()}%`;
      params.push(pattern, pattern, pattern);
    }

    query += " ORDER BY created_at DESC";

    if (options.limit !== undefined) {
      query += " LIMIT ?";
      params.push(options.limit);
      if (options.offset !== undefined) {
        query += " OFFSET ?";
        params.push(options.offset);
      }
    }

    const rows = this.db.prepare(query).all(...params);
    return rows.map((row) => this.mapRowToDocument(row));
  }

  getDocumentCount(sourceId?: string): number {
    if (sourceId) {
      const row = this.db.prepare("SELECT COUNT(*) as count FROM documents WHERE source_id = ?").get(sourceId) as any;
      return row ? Number(row.count) : 0;
    }
    const row = this.db.prepare("SELECT COUNT(*) as count FROM documents").get() as any;
    return row ? Number(row.count) : 0;
  }

  deleteById(id: string): boolean {
    const res = this.db.prepare("DELETE FROM documents WHERE id = ?").run(id);
    return res.changes > 0;
  }

  deleteBySourceId(sourceId: string): number {
    const res = this.db.prepare("DELETE FROM documents WHERE source_id = ?").run(sourceId);
    return res.changes;
  }
}
