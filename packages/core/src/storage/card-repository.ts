import type Database from "better-sqlite3";
import crypto from "node:crypto";
import { type Flashcard, type DifficultyLevel, FlashcardSchema, DifficultyLevelSchema } from "../domain/models.js";
import { z } from "zod";

export const CreateFlashcardInputSchema = z.object({
  sourceId: z.string().uuid().nullable().optional(),
  question: z.string().min(1),
  answer: z.string().min(1),
  sourceQuote: z.string().min(1),
  sourceOriginUrl: z.string().nullable().optional(),
  documentTitle: z.string().nullable().optional(),
  keywords: z.array(z.string().trim()).default([]),
  sourceLocator: z.string().trim().default(""),
  difficulty: DifficultyLevelSchema.default("intermediate"),
  personaUsed: z.string().default("socratic-mentor"),
  targetDeck: z.string().default("Default"),
  tags: z.array(z.string()).default([]),
});
export type CreateFlashcardInput = z.input<typeof CreateFlashcardInputSchema>;

export interface CardFilter {
  targetDeck?: string;
  sourceId?: string;
  difficulty?: DifficultyLevel;
  tag?: string;
  search?: string;
}

export class FlashcardRepository {
  constructor(private readonly db: Database.Database) {}

  public mapRowToFlashcard(row: any): Flashcard {
    let keywords: string[] = [];
    if (typeof row.keywords === "string") {
      try {
        const parsed = JSON.parse(row.keywords);
        if (Array.isArray(parsed)) {
          keywords = parsed.map((k: any) => String(k).trim()).filter(Boolean);
        }
      } catch {
        keywords = [];
      }
    } else if (Array.isArray(row.keywords)) {
      keywords = row.keywords.map((k: any) => String(k).trim()).filter(Boolean);
    }

    const sourceLocator = row.source_locator != null ? String(row.source_locator).trim() : "";

    let tags: string[] = [];
    if (typeof row.tags === "string") {
      try {
        const parsed = JSON.parse(row.tags);
        if (Array.isArray(parsed)) {
          tags = parsed.map((t: any) => String(t).trim()).filter(Boolean);
        }
      } catch {
        tags = [];
      }
    } else if (Array.isArray(row.tags)) {
      tags = row.tags.map((t: any) => String(t).trim()).filter(Boolean);
    }

    return FlashcardSchema.parse({
      id: row.id,
      sourceId: row.source_id,
      question: row.question,
      answer: row.answer,
      sourceQuote: row.source_quote,
      sourceOriginUrl: row.source_origin_url,
      documentTitle: row.document_title,
      keywords,
      sourceLocator,
      difficulty: row.difficulty,
      personaUsed: row.persona_used,
      targetDeck: row.target_deck,
      tags,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  create(rawCard: CreateFlashcardInput): Flashcard {
    const card = CreateFlashcardInputSchema.parse(rawCard);
    const id = crypto.randomUUID();
    const tagsJson = JSON.stringify(card.tags || []);
    const keywordsJson = JSON.stringify(card.keywords || []);
    const sourceLocator = card.sourceLocator || "";

    const stmt = this.db.prepare(`
      INSERT INTO flashcards (
        id, source_id, question, answer, source_quote, source_origin_url, document_title,
        keywords, source_locator, difficulty, persona_used, target_deck, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      card.sourceId ?? null,
      card.question,
      card.answer,
      card.sourceQuote,
      card.sourceOriginUrl ?? null,
      card.documentTitle ?? null,
      keywordsJson,
      sourceLocator,
      card.difficulty || "intermediate",
      card.personaUsed || "socratic-mentor",
      card.targetDeck || "Default",
      tagsJson
    );

    return this.getById(id)!;
  }

  createBatch(cards: CreateFlashcardInput[]): Flashcard[] {
    if (!cards || cards.length === 0) {
      return [];
    }

    const stmt = this.db.prepare(`
      INSERT INTO flashcards (
        id, source_id, question, answer, source_quote, source_origin_url, document_title,
        keywords, source_locator, difficulty, persona_used, target_deck, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const createdIds: string[] = [];

    const insertMany = this.db.transaction((items: CreateFlashcardInput[]) => {
      for (const item of items) {
        const card = CreateFlashcardInputSchema.parse(item);
        const id = crypto.randomUUID();
        const tagsJson = JSON.stringify(card.tags || []);
        const keywordsJson = JSON.stringify(card.keywords || []);
        const sourceLocator = card.sourceLocator || "";

        stmt.run(
          id,
          card.sourceId ?? null,
          card.question,
          card.answer,
          card.sourceQuote,
          card.sourceOriginUrl ?? null,
          card.documentTitle ?? null,
          keywordsJson,
          sourceLocator,
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
    if (filter.search) {
      conditions.push("(question LIKE ? OR answer LIKE ? OR keywords LIKE ? OR source_locator LIKE ?)");
      params.push(`%${filter.search}%`, `%${filter.search}%`, `%${filter.search}%`, `%${filter.search}%`);
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
    if (updates.documentTitle !== undefined) {
      fields.push("document_title = ?");
      params.push(updates.documentTitle);
    }
    if (updates.keywords !== undefined) {
      fields.push("keywords = ?");
      const kw = Array.isArray(updates.keywords)
        ? updates.keywords.map((k: any) => String(k).trim()).filter(Boolean)
        : [];
      params.push(JSON.stringify(kw));
    }
    if (updates.sourceLocator !== undefined) {
      fields.push("source_locator = ?");
      params.push(updates.sourceLocator != null ? String(updates.sourceLocator).trim() : "");
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
      const tg = Array.isArray(updates.tags)
        ? updates.tags.map((t: any) => String(t).trim()).filter(Boolean)
        : [];
      params.push(JSON.stringify(tg));
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

  deleteMany(ids: string[]): number {
    if (!ids || ids.length === 0) {
      return 0;
    }
    const placeholders = ids.map(() => "?").join(", ");
    const stmt = this.db.prepare(`DELETE FROM flashcards WHERE id IN (${placeholders})`);
    const result = stmt.run(...ids);
    return result.changes;
  }

  deleteBySourceId(sourceId: string): number {
    const result = this.db.prepare("DELETE FROM flashcards WHERE source_id = ?").run(sourceId);
    return result.changes;
  }

  listDecks(): string[] {
    const rows = this.db.prepare("SELECT DISTINCT target_deck FROM flashcards ORDER BY target_deck ASC").all() as any[];
    return rows.map((r) => r.target_deck);
  }

  listTags(): string[] {
    const rows = this.db.prepare("SELECT tags FROM flashcards").all() as any[];
    const tagSet = new Set<string>();
    for (const r of rows) {
      try {
        const tags = typeof r.tags === "string" ? JSON.parse(r.tags) : r.tags || [];
        for (const t of tags) {
          if (typeof t === "string" && t.trim()) {
            tagSet.add(t.trim());
          }
        }
      } catch {}
    }
    return Array.from(tagSet).sort();
  }

  count(filter: CardFilter = {}): number {
    return this.list(filter).length;
  }
}
