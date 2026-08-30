import crypto from "node:crypto";
import { FlashcardSchema } from "../domain/models.js";
export class FlashcardRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    mapRowToFlashcard(row) {
        return FlashcardSchema.parse({
            id: row.id,
            sourceId: row.source_id,
            question: row.question,
            answer: row.answer,
            sourceQuote: row.source_quote,
            sourceOriginUrl: row.source_origin_url,
            difficulty: row.difficulty,
            personaUsed: row.persona_used,
            targetDeck: row.target_deck,
            tags: typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags || [],
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        });
    }
    create(card) {
        const id = crypto.randomUUID();
        const tagsJson = JSON.stringify(card.tags || []);
        const stmt = this.db.prepare(`
      INSERT INTO flashcards (
        id, source_id, question, answer, source_quote, source_origin_url,
        difficulty, persona_used, target_deck, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(id, card.sourceId ?? null, card.question, card.answer, card.sourceQuote, card.sourceOriginUrl ?? null, card.difficulty || "intermediate", card.personaUsed || "socratic-mentor", card.targetDeck || "Default", tagsJson);
        return this.getById(id);
    }
    createBatch(cards) {
        if (!cards || cards.length === 0) {
            return [];
        }
        const stmt = this.db.prepare(`
      INSERT INTO flashcards (
        id, source_id, question, answer, source_quote, source_origin_url,
        difficulty, persona_used, target_deck, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        const createdIds = [];
        const insertMany = this.db.transaction((items) => {
            for (const card of items) {
                const id = crypto.randomUUID();
                const tagsJson = JSON.stringify(card.tags || []);
                stmt.run(id, card.sourceId ?? null, card.question, card.answer, card.sourceQuote, card.sourceOriginUrl ?? null, card.difficulty || "intermediate", card.personaUsed || "socratic-mentor", card.targetDeck || "Default", tagsJson);
                createdIds.push(id);
            }
        });
        insertMany(cards);
        return createdIds.map((id) => this.getById(id));
    }
    getById(id) {
        const row = this.db.prepare("SELECT * FROM flashcards WHERE id = ?").get(id);
        if (!row) {
            return null;
        }
        return this.mapRowToFlashcard(row);
    }
    list(filter = {}) {
        const conditions = [];
        const params = [];
        if (filter.targetDeck) {
            conditions.push("target_deck = ?");
            params.push(filter.targetDeck);
        }
        if (filter.sourceId) {
            conditions.push("source_id = ?");
            params.push(filter.sourceId);
        }
        if (filter.difficulty) {
            conditions.push("difficulty = ?");
            params.push(filter.difficulty);
        }
        let sql = "SELECT * FROM flashcards";
        if (conditions.length > 0) {
            sql += " WHERE " + conditions.join(" AND ");
        }
        sql += " ORDER BY created_at DESC";
        const rows = this.db.prepare(sql).all(...params);
        let cards = rows.map((r) => this.mapRowToFlashcard(r));
        if (filter.tag) {
            cards = cards.filter((c) => c.tags.includes(filter.tag));
        }
        return cards;
    }
    update(id, updates) {
        const existing = this.getById(id);
        if (!existing) {
            return null;
        }
        const fields = [];
        const params = [];
        if (updates.question !== undefined) {
            fields.push("question = ?");
            params.push(updates.question);
        }
        if (updates.answer !== undefined) {
            fields.push("answer = ?");
            params.push(updates.answer);
        }
        if (updates.sourceQuote !== undefined) {
            fields.push("source_quote = ?");
            params.push(updates.sourceQuote);
        }
        if (updates.sourceOriginUrl !== undefined) {
            fields.push("source_origin_url = ?");
            params.push(updates.sourceOriginUrl);
        }
        if (updates.difficulty !== undefined) {
            fields.push("difficulty = ?");
            params.push(updates.difficulty);
        }
        if (updates.personaUsed !== undefined) {
            fields.push("persona_used = ?");
            params.push(updates.personaUsed);
        }
        if (updates.targetDeck !== undefined) {
            fields.push("target_deck = ?");
            params.push(updates.targetDeck);
        }
        if (updates.tags !== undefined) {
            fields.push("tags = ?");
            params.push(JSON.stringify(updates.tags));
        }
        if (fields.length === 0) {
            return existing;
        }
        fields.push("updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')");
        params.push(id);
        const sql = `UPDATE flashcards SET ${fields.join(", ")} WHERE id = ?`;
        this.db.prepare(sql).run(...params);
        return this.getById(id);
    }
    delete(id) {
        const result = this.db.prepare("DELETE FROM flashcards WHERE id = ?").run(id);
        return result.changes > 0;
    }
    deleteBySourceId(sourceId) {
        const result = this.db.prepare("DELETE FROM flashcards WHERE source_id = ?").run(sourceId);
        return result.changes;
    }
    listDecks() {
        const rows = this.db.prepare("SELECT DISTINCT target_deck FROM flashcards ORDER BY target_deck ASC").all();
        return rows.map((r) => r.target_deck);
    }
    count(filter = {}) {
        return this.list(filter).length;
    }
}
//# sourceMappingURL=card-repository.js.map