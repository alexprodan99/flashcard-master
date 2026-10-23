import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabaseClient, runMigrations } from "../src/storage/db.js";
import { DataSourceRepository } from "../src/storage/source-repository.js";
import { FlashcardRepository, CreateFlashcardInputSchema } from "../src/storage/card-repository.js";
import { CardGenerationDraftSchema } from "../src/domain/models.js";
import Database from "better-sqlite3";

describe("FlashcardRepository", () => {
  let db: Database.Database;
  let sourceRepo: DataSourceRepository;
  let cardRepo: FlashcardRepository;

  beforeEach(() => {
    db = createDatabaseClient({ inMemory: true });
    sourceRepo = new DataSourceRepository(db);
    cardRepo = new FlashcardRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("creates, retrieves, updates, and deletes a single flashcard", () => {
    const card = cardRepo.create({
      question: "What is WAL mode in SQLite?",
      answer: "Write-Ahead Logging for better concurrency.",
      sourceQuote: "SQLite provides Write-Ahead Logging (WAL) mode.",
      difficulty: "intermediate",
      personaUsed: "socratic-mentor",
      targetDeck: "Databases",
      tags: ["sqlite", "storage"],
    });

    expect(card.id).toBeDefined();
    expect(card.question).toBe("What is WAL mode in SQLite?");
    expect(card.targetDeck).toBe("Databases");
    expect(card.tags).toEqual(["sqlite", "storage"]);

    // Update
    const updated = cardRepo.update(card.id, {
      question: "What is Write-Ahead Logging (WAL)?",
      targetDeck: "Advanced Storage",
    });

    expect(updated?.question).toBe("What is Write-Ahead Logging (WAL)?");
    expect(updated?.targetDeck).toBe("Advanced Storage");

    // Delete
    const deleted = cardRepo.delete(card.id);
    expect(deleted).toBe(true);
    expect(cardRepo.getById(card.id)).toBeNull();
  });

  it("creates batches atomically inside a transaction", () => {
    const cards = cardRepo.createBatch([
      {
        question: "Question 1",
        answer: "Answer 1",
        sourceQuote: "Quote 1 for verification",
        targetDeck: "BatchDeck",
        tags: ["tag1"],
      },
      {
        question: "Question 2",
        answer: "Answer 2",
        sourceQuote: "Quote 2 for verification",
        targetDeck: "BatchDeck",
        tags: ["tag2"],
      },
    ]);

    expect(cards.length).toBe(2);
    expect(cardRepo.count({ targetDeck: "BatchDeck" })).toBe(2);
  });

  it("filters cards by deck, difficulty, and tags", () => {
    cardRepo.create({
      question: "Q1",
      answer: "A1",
      sourceQuote: "Quote 1 for test",
      targetDeck: "Deck A",
      difficulty: "beginner",
      tags: ["math", "logic"],
    });
    cardRepo.create({
      question: "Q2",
      answer: "A2",
      sourceQuote: "Quote 2 for test",
      targetDeck: "Deck B",
      difficulty: "expert",
      tags: ["physics"],
    });

    const deckA = cardRepo.list({ targetDeck: "Deck A" });
    expect(deckA.length).toBe(1);
    expect(deckA[0].question).toBe("Q1");

    const expert = cardRepo.list({ difficulty: "expert" });
    expect(expert.length).toBe(1);
    expect(expert[0].question).toBe("Q2");

    const mathTag = cardRepo.list({ tag: "math" });
    expect(mathTag.length).toBe(1);
    expect(mathTag[0].question).toBe("Q1");
  });

  it("lists distinct decks, preserves cards with SET NULL on source drop, and supports deleteBySourceId", () => {
    const source = sourceRepo.create({ name: "Source Feed", type: "rss", uri: "https://feed.com" });

    cardRepo.create({
      sourceId: source.id,
      question: "Feed Question",
      answer: "Feed Answer",
      sourceQuote: "Feed quote for verification",
      targetDeck: "Feed Deck",
    });
    cardRepo.create({
      question: "Manual Question",
      answer: "Manual Answer",
      sourceQuote: "Manual quote for verification",
      targetDeck: "Manual Deck",
    });

    const decks = cardRepo.listDecks();
    expect(decks).toEqual(["Feed Deck", "Manual Deck"]);

    // Drop source -> foreign key sets source_id to NULL
    sourceRepo.delete(source.id);
    const feedCard = cardRepo.list({ targetDeck: "Feed Deck" })[0];
    expect(feedCard.sourceId).toBeNull();

    // deleteBySourceId
    const source2 = sourceRepo.create({ name: "Source 2", type: "web", uri: "https://web.com" });
    cardRepo.create({
      sourceId: source2.id,
      question: "Web Q",
      answer: "Web A",
      sourceQuote: "Web quote",
      targetDeck: "Web Deck",
    });
    expect(cardRepo.count({ sourceId: source2.id })).toBe(1);
    cardRepo.deleteBySourceId(source2.id);
    expect(cardRepo.count({ sourceId: source2.id })).toBe(0);
  });

  it("stores documentTitle and supports deleteMany bulk deletion", () => {
    const card1 = cardRepo.create({
      question: "Doc Title Q1",
      answer: "Doc Title A1",
      sourceQuote: "Verbatim quote 1",
      documentTitle: "System Architecture Primer",
      sourceOriginUrl: "https://example.com/primer",
    });
    const card2 = cardRepo.create({
      question: "Doc Title Q2",
      answer: "Doc Title A2",
      sourceQuote: "Verbatim quote 2",
      documentTitle: "Database Internals",
    });

    expect(card1.documentTitle).toBe("System Architecture Primer");
    expect(card1.sourceOriginUrl).toBe("https://example.com/primer");
    expect(card2.documentTitle).toBe("Database Internals");

    const deletedCount = cardRepo.deleteMany([card1.id, card2.id]);
    expect(deletedCount).toBe(2);
    expect(cardRepo.getById(card1.id)).toBeNull();
    expect(cardRepo.getById(card2.id)).toBeNull();
  });

  it("persists, queries, and updates enriched keywords and sourceLocator", () => {
    const card = cardRepo.create({
      question: "What is self-attention?",
      answer: "A mechanism that relates different positions of a single sequence.",
      sourceQuote: "Self-attention, sometimes called intra-attention...",
      keywords: ["transformer", "attention"],
      sourceLocator: "Section 3.2",
      targetDeck: "Deep Learning",
    });

    expect(card.id).toBeDefined();
    expect(card.keywords).toEqual(["transformer", "attention"]);
    expect(card.sourceLocator).toBe("Section 3.2");

    const fetched = cardRepo.getById(card.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.keywords).toEqual(["transformer", "attention"]);
    expect(fetched?.sourceLocator).toBe("Section 3.2");

    // Update keywords and sourceLocator
    const updated = cardRepo.update(card.id, {
      keywords: ["deep learning", "neural network"],
      sourceLocator: "Chapter 4, Page 52",
    });

    expect(updated?.keywords).toEqual(["deep learning", "neural network"]);
    expect(updated?.sourceLocator).toBe("Chapter 4, Page 52");
    expect(updated?.updatedAt).toBeDefined();

    // Reject non-existent card ID with null
    const nonExistent = cardRepo.update("00000000-0000-0000-0000-000000000000", {
      keywords: ["test"],
    });
    expect(nonExistent).toBeNull();
  });

  it("applies backward-compatible defaults when enriched fields are omitted", () => {
    const card = cardRepo.create({
      question: "What is backpropagation?",
      answer: "An algorithm for supervised learning of artificial neural networks.",
      sourceQuote: "Backpropagation efficiently computes gradient vectors.",
    });

    expect(card.keywords).toEqual([]);
    expect(card.sourceLocator).toBe("");

    const fetched = cardRepo.getById(card.id);
    expect(fetched?.keywords).toEqual([]);
    expect(fetched?.sourceLocator).toBe("");
  });

  it("persists enriched fields in batch creation", () => {
    const cards = cardRepo.createBatch([
      {
        question: "Batch Q1",
        answer: "Batch A1",
        sourceQuote: "Batch quote 1",
        keywords: ["batch", "one"],
        sourceLocator: "Doc 1 / Page 1",
      },
      {
        question: "Batch Q2",
        answer: "Batch A2",
        sourceQuote: "Batch quote 2",
      },
    ]);

    expect(cards.length).toBe(2);
    expect(cards[0].keywords).toEqual(["batch", "one"]);
    expect(cards[0].sourceLocator).toBe("Doc 1 / Page 1");
    expect(cards[1].keywords).toEqual([]);
    expect(cards[1].sourceLocator).toBe("");
  });

  it("safely maps legacy database rows with NULL or absent keywords and source_locator", () => {
    const legacyRow = {
      id: "33333333-3333-3333-3333-333333333333",
      source_id: null,
      question: "Legacy question?",
      answer: "Legacy answer.",
      source_quote: "Legacy source quote.",
      source_origin_url: null,
      document_title: null,
      keywords: null,
      source_locator: null,
      difficulty: "intermediate",
      persona_used: "socratic-mentor",
      target_deck: "Default",
      tags: null,
      created_at: "2025-01-01T00:00:00.000Z",
      updated_at: "2025-01-01T00:00:00.000Z",
    };

    const card = cardRepo.mapRowToFlashcard(legacyRow);
    expect(card.keywords).toEqual([]);
    expect(card.sourceLocator).toBe("");

    // Test malformed JSON fallback
    const malformedRow = {
      ...legacyRow,
      id: "44444444-4444-4444-4444-444444444444",
      keywords: "invalid-json-array{[",
      source_locator: "Section A",
    };
    const card2 = cardRepo.mapRowToFlashcard(malformedRow);
    expect(card2.keywords).toEqual([]);
    expect(card2.sourceLocator).toBe("Section A");
  });

  it("validates CreateFlashcardInputSchema and rejects invalid keywords", () => {
    const invalidResult = CreateFlashcardInputSchema.safeParse({
      question: "Valid question?",
      answer: "Valid answer.",
      sourceQuote: "Valid quote.",
      keywords: [123, null] as any,
    });
    expect(invalidResult.success).toBe(false);

    const validResult = CreateFlashcardInputSchema.safeParse({
      question: "Valid question?",
      answer: "Valid answer.",
      sourceQuote: "Valid quote.",
      keywords: ["keyword1", "keyword2"],
      sourceLocator: "Page 10",
    });
    expect(validResult.success).toBe(true);
    if (validResult.success) {
      expect(validResult.data.keywords).toEqual(["keyword1", "keyword2"]);
      expect(validResult.data.sourceLocator).toBe("Page 10");
    }
  });

  it("migrates existing SQLite databases lacking keywords and source_locator columns non-destructively", () => {
    const legacyDb = new Database(":memory:");
    try {
      // Create legacy flashcards table schema without keywords and source_locator
      legacyDb.exec(`
        CREATE TABLE data_sources (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('rss', 'web', 'local', 'sitemap', 'llms-txt', 'notion')),
            uri TEXT NOT NULL,
            target_deck TEXT NOT NULL DEFAULT 'Default',
            tags TEXT NOT NULL DEFAULT '[]',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        );
        CREATE TABLE flashcards (
            id TEXT PRIMARY KEY,
            source_id TEXT REFERENCES data_sources(id) ON DELETE SET NULL,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            source_quote TEXT NOT NULL,
            source_origin_url TEXT,
            document_title TEXT,
            difficulty TEXT NOT NULL CHECK(difficulty IN ('beginner', 'intermediate', 'expert', 'mixed')),
            persona_used TEXT NOT NULL DEFAULT 'socratic-mentor',
            target_deck TEXT NOT NULL DEFAULT 'Default',
            tags TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        );
      `);

      // Insert pre-migration card
      const legacyId = "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d";
      legacyDb.prepare(`
        INSERT INTO flashcards (id, question, answer, source_quote, difficulty)
        VALUES (?, ?, ?, ?, ?)
      `).run(legacyId, "Old Q", "Old A", "Old Quote", "intermediate");

      // Verify columns do not exist prior to migration
      const colsBefore = legacyDb.prepare("PRAGMA table_info(flashcards)").all() as Array<{ name: string }>;
      expect(colsBefore.some((c) => c.name === "keywords")).toBe(false);
      expect(colsBefore.some((c) => c.name === "source_locator")).toBe(false);

      // Run migrations
      runMigrations(legacyDb);

      // Verify columns now exist
      const colsAfter = legacyDb.prepare("PRAGMA table_info(flashcards)").all() as Array<{ name: string }>;
      expect(colsAfter.some((c) => c.name === "keywords")).toBe(true);
      expect(colsAfter.some((c) => c.name === "source_locator")).toBe(true);

      // Verify existing row can be loaded cleanly via repository
      const repo = new FlashcardRepository(legacyDb);
      const card = repo.getById(legacyId);
      expect(card).not.toBeNull();
      expect(card?.question).toBe("Old Q");
      expect(card?.keywords).toEqual([]);
      expect(card?.sourceLocator).toBe("");

      // Re-running migrations is idempotent and non-destructive
      expect(() => runMigrations(legacyDb)).not.toThrow();
    } finally {
      legacyDb.close();
    }
  });

  it("validates CardGenerationDraftSchema per structured responses spec", () => {
    // Valid draft
    const valid = CardGenerationDraftSchema.parse({
      question: "What is attention mechanism?",
      answer: "An architecture component that computes weighted representations.",
      citation: "The attention mechanism computes a weighted sum of values based on query and keys.",
      keywords: ["attention", "transformer", "deep learning"],
      sourceLocator: "Section 3.1, Eq 1",
      difficulty: "intermediate",
    });
    expect(valid.question).toBe("What is attention mechanism?");
    expect(valid.keywords).toEqual(["attention", "transformer", "deep learning"]);
    expect(valid.sourceLocator).toBe("Section 3.1, Eq 1");

    // Invalid: empty keywords
    expect(() =>
      CardGenerationDraftSchema.parse({
        question: "What is attention mechanism?",
        answer: "Valid answer",
        citation: "Valid citation",
        keywords: [],
        sourceLocator: "Section 1",
      })
    ).toThrow();

    // Invalid: empty sourceLocator
    expect(() =>
      CardGenerationDraftSchema.parse({
        question: "What is attention mechanism?",
        answer: "Valid answer",
        citation: "Valid citation",
        keywords: ["keyword"],
        sourceLocator: "   ",
      })
    ).toThrow();

    // Invalid: question too short (< 5 chars)
    expect(() =>
      CardGenerationDraftSchema.parse({
        question: "Why?",
        answer: "Valid answer",
        citation: "Valid citation",
        keywords: ["keyword"],
        sourceLocator: "Section 1",
      })
    ).toThrow();
  });

  it("searches and updates cards with keywords and sourceLocator", () => {
    const card = cardRepo.create({
      question: "What is Raft?",
      answer: "A consensus protocol.",
      sourceQuote: "Raft is a consensus protocol designed for understandability.",
      keywords: ["raft", "consensus", "state machine"],
      sourceLocator: "Section 5.2",
      targetDeck: "Distributed",
      tags: ["distributed-systems"],
    });

    // Search by keyword
    const byKeyword = cardRepo.list({ search: "consensus" });
    expect(byKeyword.length).toBe(1);
    expect(byKeyword[0].id).toBe(card.id);

    // Search by locator
    const byLocator = cardRepo.list({ search: "Section 5.2" });
    expect(byLocator.length).toBe(1);
    expect(byLocator[0].id).toBe(card.id);

    // Update keywords and locator
    const updated = cardRepo.update(card.id, {
      keywords: ["paxos", "consensus"],
      sourceLocator: "Chapter 7",
    });
    expect(updated?.keywords).toEqual(["paxos", "consensus"]);
    expect(updated?.sourceLocator).toBe("Chapter 7");

    const reloaded = cardRepo.getById(card.id);
    expect(reloaded?.keywords).toEqual(["paxos", "consensus"]);
    expect(reloaded?.sourceLocator).toBe("Chapter 7");
  });

  it("supports limit and offset pagination with count and listPaginated metadata", () => {
    // Create 15 sample cards
    for (let i = 1; i <= 15; i++) {
      cardRepo.create({
        question: `Question ${i.toString().padStart(2, "0")}`,
        answer: `Answer ${i}`,
        sourceQuote: `Quote for question ${i}`,
        targetDeck: i <= 10 ? "Deck A" : "Deck B",
        difficulty: i % 2 === 0 ? "intermediate" : "expert",
        tags: i % 3 === 0 ? ["tag-3"] : ["tag-other"],
      });
    }

    // Verify count()
    expect(cardRepo.count()).toBe(15);
    expect(cardRepo.count({ targetDeck: "Deck A" })).toBe(10);
    expect(cardRepo.count({ difficulty: "expert" })).toBe(8);
    expect(cardRepo.count({ tag: "tag-3" })).toBe(5);

    // Verify list() with limit & offset
    const page1 = cardRepo.list({ limit: 5, offset: 0 });
    expect(page1.length).toBe(5);

    const page2 = cardRepo.list({ limit: 5, offset: 5 });
    expect(page2.length).toBe(5);
    expect(page2[0].id).not.toBe(page1[0].id);

    const page3 = cardRepo.list({ limit: 10, offset: 10 });
    expect(page3.length).toBe(5); // Only 5 remain

    // Verify listPaginated() on filtered query
    const paginatedDeckA = cardRepo.listPaginated({ targetDeck: "Deck A", limit: 4, offset: 0 });
    expect(paginatedDeckA.total).toBe(10);
    expect(paginatedDeckA.limit).toBe(4);
    expect(paginatedDeckA.offset).toBe(0);
    expect(paginatedDeckA.cards.length).toBe(4);
    expect(paginatedDeckA.hasMore).toBe(true);

    const paginatedDeckAEnd = cardRepo.listPaginated({ targetDeck: "Deck A", limit: 4, offset: 8 });
    expect(paginatedDeckAEnd.total).toBe(10);
    expect(paginatedDeckAEnd.cards.length).toBe(2);
    expect(paginatedDeckAEnd.hasMore).toBe(false);
  });
});

