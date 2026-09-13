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
      rawContent: row.raw_content !== undefined && row.raw_content !== null ? row.raw_content : null,
      contentHash: row.content_hash || null,
      wordCount: typeof row.word_count === "number" ? row.word_count : 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  upsert(rawDoc: Partial<DiscoveredDocument> & { sourceId: string; title: string; textContent: string }): DiscoveredDocument {
    const cleanUrl = rawDoc.url && rawDoc.url.trim().length > 0 ? rawDoc.url.trim() : null;

    let existingId = rawDoc.id;
    if (cleanUrl) {
      const row = this.db.prepare("SELECT id FROM documents WHERE source_id = ? AND url = ?").get(rawDoc.sourceId, cleanUrl) as { id: string } | undefined;
      if (row) {
        existingId = row.id;
      }
    } else if (!existingId) {
      const row = this.db.prepare("SELECT id FROM documents WHERE source_id = ? AND url IS NULL AND title = ?").get(rawDoc.sourceId, rawDoc.title) as { id: string } | undefined;
      if (row) {
        existingId = row.id;
      }
    }

    const id =
      existingId ||
      crypto
        .createHash("sha256")
        .update(`${rawDoc.sourceId}:${cleanUrl || rawDoc.title}`)
        .digest("hex")
        .slice(0, 32);

    const wordCount =
      rawDoc.wordCount !== undefined
        ? rawDoc.wordCount
        : rawDoc.textContent.trim()
        ? rawDoc.textContent.trim().split(/\s+/).length
        : 0;

    const stmt = this.db.prepare(`
      INSERT INTO documents (id, source_id, title, url, text_content, raw_content, content_hash, word_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        url = excluded.url,
        text_content = excluded.text_content,
        raw_content = excluded.raw_content,
        content_hash = excluded.content_hash,
        word_count = excluded.word_count,
        updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    `);

    stmt.run(
      id,
      rawDoc.sourceId,
      rawDoc.title,
      cleanUrl,
      rawDoc.textContent,
      rawDoc.rawContent || null,
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

    // 1. In-memory deduplication of the batch by (sourceId, url || title)
    const dedupedMap = new Map<string, Partial<DiscoveredDocument> & { sourceId: string; title: string; textContent: string }>();
    for (const doc of docs) {
      const cleanUrl = doc.url && doc.url.trim().length > 0 ? doc.url.trim() : null;
      const key = cleanUrl ? `url:${doc.sourceId}:${cleanUrl}` : `title:${doc.sourceId}:${doc.title.trim()}`;
      dedupedMap.set(key, { ...doc, url: cleanUrl });
    }
    const dedupedDocs = Array.from(dedupedMap.values());

    const findByUrlStmt = this.db.prepare("SELECT id FROM documents WHERE source_id = ? AND url = ?");
    const findByTitleStmt = this.db.prepare("SELECT id FROM documents WHERE source_id = ? AND url IS NULL AND title = ?");

    const stmt = this.db.prepare(`
      INSERT INTO documents (id, source_id, title, url, text_content, raw_content, content_hash, word_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        url = excluded.url,
        text_content = excluded.text_content,
        raw_content = excluded.raw_content,
        content_hash = excluded.content_hash,
        word_count = excluded.word_count,
        updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    `);

    const transaction = this.db.transaction((items: typeof dedupedDocs) => {
      for (const rawDoc of items) {
        const cleanUrl = rawDoc.url && rawDoc.url.trim().length > 0 ? rawDoc.url.trim() : null;
        let existingId = rawDoc.id;

        if (cleanUrl) {
          const row = findByUrlStmt.get(rawDoc.sourceId, cleanUrl) as { id: string } | undefined;
          if (row) {
            existingId = row.id;
          }
        } else if (!existingId) {
          const row = findByTitleStmt.get(rawDoc.sourceId, rawDoc.title) as { id: string } | undefined;
          if (row) {
            existingId = row.id;
          }
        }

        const id =
          existingId ||
          crypto
            .createHash("sha256")
            .update(`${rawDoc.sourceId}:${cleanUrl || rawDoc.title}`)
            .digest("hex")
            .slice(0, 32);

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
          cleanUrl,
          rawDoc.textContent,
          rawDoc.rawContent || null,
          rawDoc.contentHash || null,
          wordCount
        );
      }
    });

    transaction(dedupedDocs);
  }

  getById(id: string): DiscoveredDocument | null {
    const row = this.db.prepare("SELECT * FROM documents WHERE id = ?").get(id);
    if (!row) {
      return null;
    }
    return this.mapRowToDocument(row);
  }

  getByIds(ids: string[]): DiscoveredDocument[] {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return [];
    }
    const cleanIds = Array.from(new Set(ids.filter((id) => typeof id === "string" && id.trim().length > 0)));
    if (cleanIds.length === 0) {
      return [];
    }

    const placeholders = cleanIds.map(() => "?").join(", ");
    const rows = this.db.prepare(`SELECT * FROM documents WHERE id IN (${placeholders}) ORDER BY created_at DESC`).all(...cleanIds);
    return rows.map((row) => this.mapRowToDocument(row));
  }

  listAll(options: DocumentListOptions = {}): DiscoveredDocument[] {
    let query = "SELECT * FROM documents WHERE 1=1";
    const params: any[] = [];

    const { whereClause, orderClause } = this.buildSearchClause(options.search, params);
    query += whereClause + " " + orderClause;

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

  listBySourceId(sourceId: string, options: DocumentListOptions = {}): DiscoveredDocument[] {
    let query = "SELECT * FROM documents WHERE source_id = ?";
    const params: any[] = [sourceId];

    const { whereClause, orderClause } = this.buildSearchClause(options.search, params);
    query += whereClause + " " + orderClause;

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

  private buildSearchClause(rawSearch: string | undefined, params: any[]): { whereClause: string; orderClause: string } {
    if (!rawSearch || rawSearch.trim().length === 0) {
      return { whereClause: "", orderClause: "ORDER BY created_at DESC" };
    }

    const rawTrimmed = rawSearch.trim();
    const stopWords = new Set(["article", "articles", "the", "a", "an", "post", "posts", "doc", "docs"]);
    const allTokens = rawTrimmed.toLowerCase().split(/\s+/).filter(Boolean);
    const nonStopTokens = allTokens.filter((t) => !stopWords.has(t));
    const tokens = nonStopTokens.length > 0 ? nonStopTokens : allTokens;

    let whereClause = "";
    for (const token of tokens) {
      let altToken: string | null = null;
      if (token.length > 3 && token.endsWith("s")) {
        altToken = token.slice(0, -1);
      } else if (token.length > 3) {
        altToken = token + "s";
      }

      if (altToken) {
        whereClause += " AND (title LIKE ? OR url LIKE ? OR text_content LIKE ? OR title LIKE ? OR url LIKE ? OR text_content LIKE ?)";
        const p1 = `%${token}%`;
        const p2 = `%${altToken}%`;
        params.push(p1, p1, p1, p2, p2, p2);
      } else {
        whereClause += " AND (title LIKE ? OR url LIKE ? OR text_content LIKE ?)";
        const p = `%${token}%`;
        params.push(p, p, p);
      }
    }

    const cleanSearch = tokens.join(" ");
    const singularCleanSearch = tokens.map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t)).join(" ");
    const orderClause = "ORDER BY CASE WHEN lower(title) = lower(?) OR lower(title) = lower(?) THEN 1 WHEN lower(title) LIKE ? OR lower(title) LIKE ? THEN 2 ELSE 3 END, created_at DESC";
    params.push(cleanSearch, singularCleanSearch, `%${cleanSearch}%`, `%${singularCleanSearch}%`);

    return { whereClause, orderClause };
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
    if (!id || typeof id !== "string" || id.trim().length === 0) return false;
    const res = this.db.prepare("DELETE FROM documents WHERE id = ?").run(id.trim());
    return res.changes > 0;
  }

  deleteMany(ids: string[]): number {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return 0;
    }
    const validIds = Array.from(
      new Set(
        ids
          .filter((id) => typeof id === "string")
          .map((id) => id.trim())
          .filter((id) => id.length > 0)
      )
    );
    if (validIds.length === 0) {
      return 0;
    }

    const stmt = this.db.prepare("DELETE FROM documents WHERE id = ?");
    const transaction = this.db.transaction((idList: string[]) => {
      let count = 0;
      for (const docId of idList) {
        const res = stmt.run(docId);
        count += res.changes;
      }
      return count;
    });

    return transaction(validIds);
  }

  deleteBulk(ids: string[]): number {
    return this.deleteMany(ids);
  }

  deleteBySourceId(sourceId: string): number {
    const res = this.db.prepare("DELETE FROM documents WHERE source_id = ?").run(sourceId);
    return res.changes;
  }
}
