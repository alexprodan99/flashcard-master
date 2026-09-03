import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabaseClient } from "../src/storage/db.js";
import { DataSourceRepository } from "../src/storage/source-repository.js";
import { FlashcardRepository } from "../src/storage/card-repository.js";
import type Database from "better-sqlite3";

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
});
