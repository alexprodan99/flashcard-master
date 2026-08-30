import type Database from "better-sqlite3";
import crypto from "node:crypto";
import { type Flashcard, type DifficultyLevel, FlashcardSchema } from "../domain/models.js";

export interface CardFilter {
  targetDeck?: string;
  sourceId?: string;
  difficulty?: DifficultyLevel;
  tag?: string;
}

export class FlashcardRepository {
  constructor(private readonly db: Database.Database) {}

  private mapRowToFlashcard(row: any): Flashcard {
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

  create(card: Omit<Flashcard, "id" | "createdAt" | "updatedAt">): Flashcard {
    const id = crypto.randomUUID();
    const tagsJson = JSON.stringify(card.tags || []);

    const stmt = this.db.prepare(`
      INSERT INTO flashcards (
        id, source_id, question, answer, source_quote, source_origin_url,
        difficulty, persona_used, target_deck, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      card.sourceId ?? null,
      card.question,
      card.answer,
      card.sourceQuote,
      card.sourceOriginUrl ?? null,
      card.difficulty || "intermediate",
      card.personaUsed || "socratic-mentor",
      card.targetDeck || "Default",
      tagsJson
    );

    return this.getById(id)!;
  }

  createBatch(cards: Array<Omit<Flashcard, "id" | "createdAt" | "updatedAt">>): Flashcard[] {
    if (!cards || cards.length === 0) {
      return [];
    }

    const stmt = this.db.prepare(`
      INSERT INTO flashcards (
        id, source_id, question, answer, source_quote, source_origin_url,
        difficulty, persona_used, target_deck, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const createdIds: string[] = [];

    const insertMany = this.db.transaction((items: Array<Omit<Flashcard, "id" | "createdAt" | "updatedAt">>) => {
      for (const card of items) {
        const id = crypto.randomUUID();
        const tagsJson = JSON.stringify(card.tags || []);

        stmt.run(
          id,
          card.sourceId ?? null,
          card.question,
          card.answer,
          card.sourceQuote,
          card.sourceOriginUrl ?? null,
          card.difficulty || "intermediate",
          card.personaUsed || "socratic-mentor",
          card.targetDeck || "Default",
          tagsJson
        );
        createdIds.push(id);
      }
    });

    insertMany(cards);

    return createdIds.map((id) => this.getById(id)!);
  }

  getById(id: string): Flashcard | null {
    const row = this.db.prepare("SELECT * FROM flashcards WHERE id = ?").get(id) as any;
    if (!row) {
      return null;
    }
    return this.mapRowToFlashcard(row);
  }

  list(filter: CardFilter = {}): Flashcard[] {
    const conditions: string[] = [];
    const params: any[] = [];

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

    const rows = this.db.prepare(sql).all(...params) as any[];
    let cards = rows.map((r) => this.mapRowToFlashcard(r));

    if (filter.tag) {
      cards = cards.filter((c) => c.tags.includes(filter.tag!));
    }

    return cards;
  }

  update(id: string, updates: Partial<Omit<Flashcard, "id" | "createdAt">>): Flashcard | null {
    const existing = this.getById(id);
    if (!existing) {
      return null;
    }

    const fields: string[] = [];
    const params: any[] = [];

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

  delete(id: string): boolean {
    const result = this.db.prepare("DELETE FROM flashcards WHERE id = ?").run(id);
    return result.changes > 0;
  }

  deleteBySourceId(sourceId: string): number {
    const result = this.db.prepare("DELETE FROM flashcards WHERE source_id = ?").run(sourceId);
    return result.changes;
  }

  listDecks(): string[] {
    const rows = this.db.prepare("SELECT DISTINCT target_deck FROM flashcards ORDER BY target_deck ASC").all() as any[];
    return rows.map((r) => r.target_deck);
  }

  count(filter: CardFilter = {}): number {
    return this.list(filter).length;
  }
}
