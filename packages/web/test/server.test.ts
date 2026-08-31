import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createDatabaseClient,
  DataSourceRepository,
  SyncStateRepository,
  FlashcardRepository,
  IngestionService,
  StrategyRegistry,
} from "@flashcard-master/core";
import { createWebServer, WebServer } from "../src/server.js";
import type Database from "better-sqlite3";
import type { IngestionStrategyPort, RawDocument, CleanTextDocument, DataSource } from "@flashcard-master/core";

class MockStrategy implements IngestionStrategyPort {
  readonly type = "rss" as const;
  async fetch(source: DataSource): Promise<RawDocument[]> {
    return [{
      id: "doc-1",
      sourceId: source.id,
      title: "Mock Doc",
      rawContent: "Some text content",
      guid: "g-1",
    }];
  }
  extractCleanText(raw: RawDocument): CleanTextDocument {
    return {
      id: raw.id,
      sourceId: raw.sourceId,
      title: raw.title,
      textContent: raw.rawContent,
      contentHash: "hash-1",
    };
  }
}

describe.sequential("WebServer REST API and Dashboard SPA", () => {
  let db: Database.Database;
  let sourceRepo: DataSourceRepository;
  let syncRepo: SyncStateRepository;
  let cardRepo: FlashcardRepository;
  let ingestionService: IngestionService;
  let server: WebServer;
  let serverUrl: string;

  beforeEach(async () => {
    db = createDatabaseClient({ inMemory: true });
    sourceRepo = new DataSourceRepository(db);
    syncRepo = new SyncStateRepository(db);
    cardRepo = new FlashcardRepository(db);

    const stratRegistry = new StrategyRegistry();
    stratRegistry.register(new MockStrategy());
    ingestionService = new IngestionService(sourceRepo, syncRepo, stratRegistry);

    // Seed test data
    sourceRepo.create({
      name: "Engineering Blog",
      type: "rss",
      uri: "https://example.com/rss",
      targetDeck: "Engineering",
    });

    cardRepo.create({
      question: "What is Raft?",
      answer: "Distributed consensus protocol.",
      sourceQuote: "Raft is a consensus protocol.",
      targetDeck: "Engineering",
      difficulty: "intermediate",
      personaUsed: "socratic-mentor",
      tags: ["raft", "distributed-systems"],
    });

    cardRepo.create({
      question: "What is WAL?",
      answer: "Write-Ahead Logging in SQLite.",
      sourceQuote: "WAL enables concurrent readers.",
      targetDeck: "Engineering",
      difficulty: "expert",
      personaUsed: "strict-examiner",
      tags: ["sqlite", "databases"],
    });

    server = createWebServer({
      port: 0,
      sourceRepo,
      syncRepo,
      cardRepo,
      ingestionService,
    });

    const info = await server.listen();
    serverUrl = info.url;
  });

  afterEach(async () => {
    await server.close();
    db.close();
  });

  it("serves HTML Single Page Application dashboard at / with Question Explorer and Slide-over Drawer", async () => {
    const res = await fetch(`${serverUrl}/`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Flashcard Master");
    expect(text).toContain("Data Sources Manager");
    expect(text).toContain("Question Explorer");
    expect(text).toContain("card-drawer-overlay");
    expect(text).toContain("✏️ Edit Flashcard");
  });

  it("returns health status at /api/health", async () => {
    const res = await fetch(`${serverUrl}/api/health`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.version).toBe("1.0.0");
  });

  it("returns aggregated metrics at /api/stats", async () => {
    const res = await fetch(`${serverUrl}/api/stats`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.totalCards).toBe(2);
    expect(json.totalSources).toBe(1);
    expect(json.totalDecks).toBe(1);
    expect(json.decks).toEqual(["Engineering"]);
    expect(json.recentCards.length).toBe(2);
  });

  it("supports querying cards with filters and substring search at /api/cards", async () => {
    const res = await fetch(`${serverUrl}/api/cards?deck=Engineering&tag=raft`);
    expect(res.status).toBe(200);
    const cards = await res.json();
    expect(cards.length).toBe(1);
    expect(cards[0].question).toBe("What is Raft?");

    // Substring search in answer
    const searchRes = await fetch(`${serverUrl}/api/cards?search=Logging`);
    expect(searchRes.status).toBe(200);
    const searchCards = await searchRes.json();
    expect(searchCards.length).toBe(1);
    expect(searchCards[0].question).toBe("What is WAL?");
  });

  it("supports updating and deleting individual cards via REST", async () => {
    const cards = cardRepo.list();
    const cardId = cards[0].id;

    // GET /api/cards/:id
    const getRes = await fetch(`${serverUrl}/api/cards/${cardId}`);
    expect(getRes.status).toBe(200);
    const card = await getRes.json();
    expect(card.id).toBe(cardId);

    // PATCH /api/cards/:id
    const patchRes = await fetch(`${serverUrl}/api/cards/${cardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "Updated Question?",
        difficulty: "beginner",
        tags: ["updated-tag"],
      }),
    });
    expect(patchRes.status).toBe(200);
    const updated = await patchRes.json();
    expect(updated.question).toBe("Updated Question?");
    expect(updated.difficulty).toBe("beginner");
    expect(updated.tags).toEqual(["updated-tag"]);

    // DELETE /api/cards/:id
    const deleteRes = await fetch(`${serverUrl}/api/cards/${cardId}`, {
      method: "DELETE",
    });
    expect(deleteRes.status).toBe(200);
    const delResult = await deleteRes.json();
    expect(delResult.success).toBe(true);

    // Confirm deletion
    const checkRes = await fetch(`${serverUrl}/api/cards/${cardId}`);
    expect(checkRes.status).toBe(404);
  });

  it("returns distinct tags at /api/tags", async () => {
    const res = await fetch(`${serverUrl}/api/tags`);
    expect(res.status).toBe(200);
    const tags = await res.json();
    expect(tags).toContain("databases");
    expect(tags).toContain("distributed-systems");
    expect(tags).toContain("raft");
    expect(tags).toContain("sqlite");
  });

  it("supports creating and updating sources via REST", async () => {
    const res = await fetch(`${serverUrl}/api/sources`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "New Web Source",
        type: "web",
        uri: "https://example.com/article",
        targetDeck: "Web Articles",
      }),
    });

    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.name).toBe("New Web Source");

    // Test PATCH
    const patchRes = await fetch(`${serverUrl}/api/sources/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    });
    expect(patchRes.status).toBe(200);
    const updated = await patchRes.json();
    expect(updated.isActive).toBe(false);
  });

  it("triggers sync for a single source via POST /api/sync/:id", async () => {
    const sources = sourceRepo.list();
    const sourceId = sources[0].id;

    const res = await fetch(`${serverUrl}/api/sync/${sourceId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Connection": "close" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sourceId).toBe(sourceId);
    expect(json.newCount).toBe(1);
  });

  it("triggers bulk sync via POST /api/sync", async () => {
    const res = await fetch(`${serverUrl}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    const results = await res.json();
    expect(results.length).toBe(1);
    expect(results[0].newCount).toBe(1);
  });
});
