import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createDatabaseClient,
  DataSourceRepository,
  SyncStateRepository,
  FlashcardRepository,
  DocumentRepository,
  IngestionService,
  StrategyRegistry,
  ExporterRegistry,
  ExportService,
  PromptBuilder,
  GroundingGuard,
  CardDeduplicationService,
  type LLMProviderPort,
} from "@flashcard-master/core";
import {
  CsvExporter,
  TsvExporter,
  MarkdownExporter,
  HtmlStudyGuideExporter,
  PdfStudyGuideExporter,
  AnkiPackageExporter,
  AnkiConnectAdapter,
} from "@flashcard-master/adapters";
import { createWebServer, WebServer } from "../src/server.js";
import type Database from "better-sqlite3";
import type { IngestionStrategyPort, RawDocument, CleanTextDocument, DataSource } from "@flashcard-master/core";

class MockLLM implements LLMProviderPort {
  async generateQAPairs(text: string, options: any): Promise<any[]> {
    const quote = text.slice(0, 17);
    return [
      {
        question: `What is ${quote}?`,
        answer: `Mock answer for ${quote}.`,
        sourceQuote: quote,
        difficulty: options?.difficulty || "intermediate",
      },
    ];
  }
}

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
  let docRepo: DocumentRepository;
  let ingestionService: IngestionService;
  let exportService: ExportService;
  let ankiConnectAdapter: AnkiConnectAdapter;
  let server: WebServer;
  let serverUrl: string;

  beforeEach(async () => {
    db = createDatabaseClient({ inMemory: true });
    sourceRepo = new DataSourceRepository(db);
    syncRepo = new SyncStateRepository(db);
    cardRepo = new FlashcardRepository(db);
    docRepo = new DocumentRepository(db);

    const stratRegistry = new StrategyRegistry();
    stratRegistry.register(new MockStrategy());
    ingestionService = new IngestionService(sourceRepo, syncRepo, stratRegistry, docRepo);

    const exporterRegistry = new ExporterRegistry();
    exporterRegistry.register(new CsvExporter());
    exporterRegistry.register(new TsvExporter());
    exporterRegistry.register(new MarkdownExporter());
    exporterRegistry.register(new HtmlStudyGuideExporter());
    exporterRegistry.register(new PdfStudyGuideExporter());
    exporterRegistry.register(new AnkiPackageExporter());
    exportService = new ExportService(cardRepo, exporterRegistry);

    ankiConnectAdapter = new AnkiConnectAdapter({ endpointUrl: "http://127.0.0.1:9999" }); // unreachable mock port

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
      documentRepo: docRepo,
      ingestionService,
      exportService,
      ankiConnectAdapter,
      strategyRegistry: stratRegistry,
      promptBuilder: new PromptBuilder(),
      groundingGuard: new GroundingGuard(),
      dedupService: new CardDeduplicationService(),
      createLLMAdapterFn: () => new MockLLM(),
    });

    const info = await server.listen();
    serverUrl = info.url;
  });

  afterEach(async () => {
    await server.close();
    db.close();
  });

  it("serves HTML Single Page Application dashboard at / with Export Center", async () => {
    const res = await fetch(`${serverUrl}/`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Flashcard Master");
    expect(text).toContain("1-Click Export Center");
    expect(text).toContain("Desktop AnkiConnect Integration");
    expect(text).toContain("Download .apkg");
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

  it("supports downloading exported deliverables via GET /api/export", async () => {
    // CSV export
    const csvRes = await fetch(`${serverUrl}/api/export?format=csv&deck=Engineering`);
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers.get("content-type")).toContain("text/csv");
    expect(csvRes.headers.get("content-disposition")).toContain('filename="flashcards.csv"');
    const csvText = await csvRes.text();
    expect(csvText).toContain("What is Raft?");
    expect(csvText).toContain("What is WAL?");

    // Markdown export
    const mdRes = await fetch(`${serverUrl}/api/export?format=markdown`);
    expect(mdRes.status).toBe(200);
    expect(mdRes.headers.get("content-type")).toContain("text/markdown");
    const mdText = await mdRes.text();
    expect(mdText).toContain("<details>");
    expect(mdText).toContain("What is Raft?");

    // PDF Printable export
    const pdfRes = await fetch(`${serverUrl}/api/export?format=pdf`);
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers.get("content-type")).toContain("text/html");
    const pdfText = await pdfRes.text();
    expect(pdfText).toContain("Printable Study Guide");
    expect(pdfText).toContain("What is Raft?");
  });

  it("returns AnkiConnect status and handles sync requests gracefully", async () => {
    const statusRes = await fetch(`${serverUrl}/api/ankiconnect/status`);
    expect(statusRes.status).toBe(200);
    const status = await statusRes.json();
    expect(typeof status.isOnline).toBe("boolean");

    const syncRes = await fetch(`${serverUrl}/api/ankiconnect/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetDeck: "Engineering" }),
    });
    expect(syncRes.status).toBe(200);
    const syncResult = await syncRes.json();
    expect(syncResult.totalCards).toBe(2);
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

  it("supports bulk card deletion via POST /api/cards/bulk-delete", async () => {
    // Create 2 test cards
    const getRes = await fetch(`${serverUrl}/api/cards`);
    const existingCards = await getRes.json();
    const idsToDelete = existingCards.map((c: any) => c.id);

    expect(idsToDelete.length).toBeGreaterThan(0);

    const bulkRes = await fetch(`${serverUrl}/api/cards/bulk-delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: idsToDelete }),
    });

    expect(bulkRes.status).toBe(200);
    const bulkJson = await bulkRes.json();
    expect(bulkJson.success).toBe(true);
    expect(bulkJson.deletedCount).toBe(idsToDelete.length);

    // Verify all cards are gone
    const checkRes = await fetch(`${serverUrl}/api/cards`);
    const remainingCards = await checkRes.json();
    expect(remainingCards.length).toBe(0);
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

    // Test creating Sitemap Source
    const sitemapRes = await fetch(`${serverUrl}/api/sources`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Engineering Sitemap",
        type: "sitemap",
        uri: "https://example.com/sitemap.xml",
        targetDeck: "DotNet Architecture",
      }),
    });
    expect(sitemapRes.status).toBe(201);
    const sitemapCreated = await sitemapRes.json();
    expect(sitemapCreated.type).toBe("sitemap");

    // Test creating LLMs.txt Catalog Source
    const llmsRes = await fetch(`${serverUrl}/api/sources`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Architecture LLMs Catalog",
        type: "llms-txt",
        uri: "https://example.com/llms-full.txt",
        targetDeck: "DotNet Architecture",
      }),
    });
    expect(llmsRes.status).toBe(201);
    const llmsCreated = await llmsRes.json();
    expect(llmsCreated.type).toBe("llms-txt");

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

  it("serves HTML SPA with progressive learning pipeline navigation order and AI Flashcard Generation Studio", async () => {
    const res = await fetch(`${serverUrl}/`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("⚡ Generate Studio");
    expect(text).toContain("AI Flashcard Generation Studio");
    expect(text).toContain("gen-provider");
    expect(text).toContain("gen-model");
    expect(text).toContain("phi4-mini");
    expect(text).toContain("gen-sources-checkbox-list");
    expect(text).toContain("gen-source-count-badge");

    // Verify progressive learning pipeline navigation order (Dashboard -> 1. Sources -> 2. Generate -> 3. Cards -> 4. Export)
    const dashboardPos = text.indexOf('id="nav-dashboard"');
    const sourcesPos = text.indexOf('id="nav-sources"');
    const generatePos = text.indexOf('id="nav-generate"');
    const cardsPos = text.indexOf('id="nav-cards"');
    const exportPos = text.indexOf('id="nav-export"');

    expect(dashboardPos).toBeLessThan(sourcesPos);
    expect(sourcesPos).toBeLessThan(generatePos);
    expect(generatePos).toBeLessThan(cardsPos);
    expect(cardsPos).toBeLessThan(exportPos);
  });

  it("generates grounded flashcards via POST /api/generate with sourceIds array", async () => {
    const sources = sourceRepo.list();
    const sourceId = sources[0].id;

    const res = await fetch(`${serverUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "ollama",
        model: "phi4-mini",
        persona: "socratic-mentor",
        difficulty: "intermediate",
        sourceIds: [sourceId],
        limit: 3,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.cardsCreated).toBe(1);
    expect(data.newCards.length).toBe(1);
    expect(data.newCards[0].question).toContain("What is");
    expect(data.newCards[0].sourceQuote).toBe("Some text content");
    expect(data.newCards[0].documentTitle).toBe("Mock Doc");
    expect(data.newCards[0].sourceOriginUrl).toBe("https://example.com/rss");
  });

  it("supports target deck override in POST /api/generate", async () => {
    const res = await fetch(`${serverUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "gemini",
        model: "gemini-2.0-flash",
        targetDeck: "Custom Generation Deck",
        limit: 2,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.newCards[0].targetDeck).toBe("Custom Generation Deck");
  });

  it("supports depthMode and chunkMultiplier in POST /api/generate", async () => {
    const res = await fetch(`${serverUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "ollama",
        model: "phi4-mini",
        depthMode: "deep-dive",
        chunkMultiplier: 2,
        limit: 3,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.cardsCreated).toBe(1);
  });

  it("serves static dashboard SPA on GET / and GET /index.html", async () => {
    const resRoot = await fetch(`${serverUrl}/`);
    expect(resRoot.status).toBe(200);
    expect(resRoot.headers.get("content-type")).toContain("text/html");
    const htmlRoot = await resRoot.text();
    expect(htmlRoot.length).toBeGreaterThan(50);

    const resIndex = await fetch(`${serverUrl}/index.html`);
    expect(resIndex.status).toBe(200);
    expect(resIndex.headers.get("content-type")).toContain("text/html");
  });

  it("handles non-API paths via SPA fallback", async () => {
    const res = await fetch(`${serverUrl}/sources`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("lists discovered documents with generated card counts via GET /api/sources/:id/documents", async () => {
    const sources = sourceRepo.list();
    const source = sources[0];

    // Ingest documents
    await ingestionService.syncSource(source.id);

    const res = await fetch(`${serverUrl}/api/sources/${source.id}/documents`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.documents).toBeDefined();
    expect(data.documents.length).toBe(1);
    expect(data.documents[0].title).toBe("Mock Doc");
    expect(data.documents[0].cardCount).toBeDefined();
  });

  it("retrieves full document content via GET /api/documents/:id", async () => {
    const sources = sourceRepo.list();
    const source = sources[0];
    const doc = docRepo.upsert({
      sourceId: source.id,
      title: "Detailed Article",
      url: "https://example.com/details",
      textContent: "Comprehensive breakdown of event-driven architectures.",
    });

    const res = await fetch(`${serverUrl}/api/documents/${doc.id}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.document).toBeDefined();
    expect(data.document.title).toBe("Detailed Article");
    expect(data.document.textContent).toContain("event-driven");
  });

  it("supports targeted per-document card generation in POST /api/generate", async () => {
    const sources = sourceRepo.list();
    const source = sources[0];
    const doc = docRepo.upsert({
      sourceId: source.id,
      title: "Targeted Article",
      url: "https://example.com/targeted",
      textContent: "Some text content for generation testing.",
    });

    const res = await fetch(`${serverUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "ollama",
        model: "phi4-mini",
        documentIds: [doc.id],
        limit: 1,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.cardsCreated).toBe(1);
    expect(data.newCards[0].documentTitle).toBe("Targeted Article");
  });

  it("filters documents by search query in GET /api/sources/:id/documents", async () => {
    const sources = sourceRepo.list();
    const source = sources[0];
    docRepo.upsert({
      sourceId: source.id,
      title: "Alpha Architecture Notes",
      textContent: "Alpha content.",
    });
    docRepo.upsert({
      sourceId: source.id,
      title: "Beta Microservices Guide",
      textContent: "Beta content.",
    });

    const res = await fetch(`${serverUrl}/api/sources/${source.id}/documents?search=Microservices`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.documents.length).toBe(1);
    expect(data.documents[0].title).toBe("Beta Microservices Guide");
  });

  it("generates cards across multiple targeted document IDs simultaneously", async () => {
    const sources = sourceRepo.list();
    const source = sources[0];
    const docA = docRepo.upsert({
      sourceId: source.id,
      title: "Distributed Consensus",
      textContent: "Consensus protocols in distributed computing.",
    });
    const docB = docRepo.upsert({
      sourceId: source.id,
      title: "Vector Embeddings",
      textContent: "Vector embeddings in semantic retrieval.",
    });

    const res = await fetch(`${serverUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "ollama",
        model: "phi4-mini",
        documentIds: [docA.id, docB.id],
        limit: 1,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.cardsCreated).toBe(2);
  });

  it("creates and updates data source with multi-URL JSON array via PATCH and PUT", async () => {
    // 1. Create source with multi-URL array
    const createRes = await fetch(`${serverUrl}/api/sources`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Multi-Web Tech Docs",
        type: "web",
        uri: JSON.stringify(["https://example.com/doc1", "https://example.com/doc2"]),
        targetDeck: "WebDev",
        tags: ["docs", "web"],
      }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.name).toBe("Multi-Web Tech Docs");
    expect(created.uri).toBe(JSON.stringify(["https://example.com/doc1", "https://example.com/doc2"]));

    // 2. Update source via PATCH
    const patchRes = await fetch(`${serverUrl}/api/sources/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Updated Tech Docs",
        uri: JSON.stringify(["https://example.com/doc1", "https://example.com/doc2", "https://example.com/doc3"]),
      }),
    });
    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json();
    expect(patched.name).toBe("Updated Tech Docs");
    expect(patched.uri).toContain("https://example.com/doc3");

    // 3. Update source via PUT
    const putRes = await fetch(`${serverUrl}/api/sources/${created.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetDeck: "AdvancedWeb",
      }),
    });
    expect(putRes.status).toBe(200);
    const putUpdated = await putRes.json();
    expect(putUpdated.targetDeck).toBe("AdvancedWeb");
  });

  it("deletes single and bulk documents via REST API while preserving all flashcards intact", async () => {
    // 1. Create a source and documents
    const source = sourceRepo.create({
      name: "Distributed Systems Course",
      type: "web",
      uri: "https://example.com/systems",
      targetDeck: "Systems",
      tags: ["distributed"],
    });

    const doc1 = docRepo.upsert({
      sourceId: source.id,
      title: "Chandy-Lamport Snapshots",
      url: "https://example.com/systems/chandy-lamport",
      textContent: "Chandy-Lamport algorithm determines a consistent global state in a distributed system.",
    });

    const doc2 = docRepo.upsert({
      sourceId: source.id,
      title: "Vector Clocks",
      url: "https://example.com/systems/vector-clocks",
      textContent: "Vector clocks determine causal ordering of events across nodes.",
    });

    const doc3 = docRepo.upsert({
      sourceId: source.id,
      title: "Byzantine Fault Tolerance",
      url: "https://example.com/systems/bft",
      textContent: "BFT protocols tolerate arbitrary and malicious node failures.",
    });

    // 2. Create flashcards referencing these documents
    const card1 = cardRepo.create({
      sourceId: source.id,
      documentTitle: doc1.title,
      sourceOriginUrl: doc1.url,
      question: "What is Chandy-Lamport used for?",
      answer: "Determining a consistent global state in distributed systems.",
      sourceQuote: "consistent global state in a distributed system",
      difficulty: "expert",
      personaUsed: "socratic-mentor",
      targetDeck: "Systems",
      tags: ["distributed"],
    });

    const card2 = cardRepo.create({
      sourceId: source.id,
      documentTitle: doc2.title,
      sourceOriginUrl: doc2.url,
      question: "What do vector clocks determine?",
      answer: "Causal ordering of events across nodes.",
      sourceQuote: "causal ordering of events",
      difficulty: "intermediate",
      personaUsed: "socratic-mentor",
      targetDeck: "Systems",
      tags: ["distributed"],
    });

    // 3. Delete single document via DELETE /api/documents/:id
    const singleDelRes = await fetch(`${serverUrl}/api/documents/${doc1.id}`, {
      method: "DELETE",
    });
    expect(singleDelRes.status).toBe(200);
    const singleDelData = await singleDelRes.json();
    expect(singleDelData.success).toBe(true);

    // Confirm doc1 is gone but doc2 & doc3 remain
    expect(docRepo.getById(doc1.id)).toBeNull();
    expect(docRepo.getById(doc2.id)).not.toBeNull();
    expect(docRepo.getById(doc3.id)).not.toBeNull();

    // 4. Delete non-existent document returns 404
    const notFoundDelRes = await fetch(`${serverUrl}/api/documents/${doc1.id}`, {
      method: "DELETE",
    });
    expect(notFoundDelRes.status).toBe(404);

    // 5. Bulk delete documents via POST /api/documents/bulk-delete
    const bulkDelRes = await fetch(`${serverUrl}/api/documents/bulk-delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [doc2.id, doc3.id, "non-existent-doc-id"] }),
    });
    expect(bulkDelRes.status).toBe(200);
    const bulkDelData = await bulkDelRes.json();
    expect(bulkDelData.success).toBe(true);
    expect(bulkDelData.deletedCount).toBe(2);

    expect(docRepo.getById(doc2.id)).toBeNull();
    expect(docRepo.getById(doc3.id)).toBeNull();

    // 6. Bulk delete with empty array returns deletedCount: 0
    const emptyBulkRes = await fetch(`${serverUrl}/api/documents/bulk-delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [] }),
    });
    expect(emptyBulkRes.status).toBe(200);
    const emptyBulkData = await emptyBulkRes.json();
    expect(emptyBulkData.success).toBe(true);
    expect(emptyBulkData.deletedCount).toBe(0);

    // 6b. Test DELETE HTTP method on /api/documents/bulk-delete and malformed payloads
    const extraDoc = docRepo.upsert({
      sourceId: source.id,
      title: "Temporary Test Doc",
      textContent: "Delete via DELETE method.",
    });

    const httpDelRes = await fetch(`${serverUrl}/api/documents/bulk-delete`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [extraDoc.id] }),
    });
    expect(httpDelRes.status).toBe(200);
    expect((await httpDelRes.json()).deletedCount).toBe(1);

    // Malformed body where ids is not an array or object is empty
    const malformedRes = await fetch(`${serverUrl}/api/documents/bulk-delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: "not-an-array" }),
    });
    expect(malformedRes.status).toBe(200);
    expect((await malformedRes.json()).deletedCount).toBe(0);

    // 7. CRITICAL: Verify flashcards remain 100% intact with all metadata
    const fetchedCard1 = cardRepo.getById(card1.id);
    expect(fetchedCard1).not.toBeNull();
    expect(fetchedCard1?.question).toBe("What is Chandy-Lamport used for?");
    expect(fetchedCard1?.documentTitle).toBe("Chandy-Lamport Snapshots");
    expect(fetchedCard1?.sourceOriginUrl).toBe("https://example.com/systems/chandy-lamport");

    const fetchedCard2 = cardRepo.getById(card2.id);
    expect(fetchedCard2).not.toBeNull();
    expect(fetchedCard2?.question).toBe("What do vector clocks determine?");
    expect(fetchedCard2?.documentTitle).toBe("Vector Clocks");
    expect(fetchedCard2?.sourceOriginUrl).toBe("https://example.com/systems/vector-clocks");

    // Also verify /api/cards endpoint returns the preserved cards
    const cardsApiRes = await fetch(`${serverUrl}/api/cards?deck=Systems`);
    expect(cardsApiRes.status).toBe(200);
    const cardsList = await cardsApiRes.json();
    expect(cardsList.length).toBe(2);
  });
});
