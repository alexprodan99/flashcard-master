import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import JSZip from "jszip";
import {
  createDatabaseClient,
  DataSourceRepository,
  SyncStateRepository,
  FlashcardRepository,
  DocumentRepository,
  JobRepository,
  IngestionService,
  StrategyRegistry,
  ExporterRegistry,
  ExportService,
  PromptBuilder,
  GroundingGuard,
  CardDeduplicationService,
  MediaService,
  type LLMProviderPort,
} from "@flashcard-master/core";
import {
  CsvExporter,
  TsvExporter,
  MarkdownExporter,
  HtmlStudyGuideExporter,
  PdfStudyGuideExporter,
  EpubFlashcardExporter,
  AnkiPackageExporter,
  AnkiConnectAdapter,
  LocalFileStrategy,
} from "@flashcard-master/adapters";
import { createWebServer, WebServer } from "../src/server.js";
import { JobManager } from "../src/jobs/index.js";
import type Database from "better-sqlite3";
import type { IngestionStrategy, RawDocument, CleanTextDocument, DataSource } from "@flashcard-master/core";

class MockLLM implements LLMProviderPort {
  readonly providerName = "mock";
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

class MockStrategy implements IngestionStrategy {
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
  let tempMediaDir: string;
  let tempLocalFilesDir: string;
  let mediaService: MediaService;

  beforeEach(async () => {
    tempMediaDir = fs.mkdtempSync(path.join(os.tmpdir(), "fc-web-srv-media-"));
    tempLocalFilesDir = fs.mkdtempSync(path.join(os.tmpdir(), "fc-web-srv-local-"));
    mediaService = new MediaService({ mediaDir: tempMediaDir });

    db = createDatabaseClient({ inMemory: true });
    sourceRepo = new DataSourceRepository(db);
    syncRepo = new SyncStateRepository(db);
    cardRepo = new FlashcardRepository(db);
    docRepo = new DocumentRepository(db);

    const stratRegistry = new StrategyRegistry();
    stratRegistry.register(new MockStrategy());
    stratRegistry.register(new LocalFileStrategy());
    ingestionService = new IngestionService(sourceRepo, syncRepo, stratRegistry, docRepo);

    const exporterRegistry = new ExporterRegistry();
    exporterRegistry.register(new CsvExporter());
    exporterRegistry.register(new TsvExporter());
    exporterRegistry.register(new MarkdownExporter());
    exporterRegistry.register(new HtmlStudyGuideExporter());
    exporterRegistry.register(new PdfStudyGuideExporter());
    exporterRegistry.register(new AnkiPackageExporter());
    exporterRegistry.register(new EpubFlashcardExporter());
    exportService = new ExportService(cardRepo, exporterRegistry);

    ankiConnectAdapter = new AnkiConnectAdapter({ endpointUrl: "http://127.0.0.1:9999" }); // unreachable mock port

    // Seed test data
    sourceRepo.create({
      name: "Engineering Blog",
      type: "rss",
      uri: "https://example.com/rss",
      tags: [],
      isActive: true,
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
      mediaService,
      localFilesDir: tempLocalFilesDir,
      createLLMAdapterFn: () => new MockLLM(),
    });

    const info = await server.listen();
    serverUrl = info.url;
  });

  afterEach(async () => {
    await server.close();
    db.close();
    if (fs.existsSync(tempMediaDir)) {
      try {
        fs.rmSync(tempMediaDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
      } catch {}
    }
    if (fs.existsSync(tempLocalFilesDir)) {
      try {
        fs.rmSync(tempLocalFilesDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
      } catch {}
    }
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
        model: "gemini-3.6-flash",
        apiKey: "mock-gemini-key",
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
        tags: ["advanced-web"],
      }),
    });
    expect(putRes.status).toBe(200);
    const putUpdated = await putRes.json();
    expect(putUpdated.tags).toContain("advanced-web");
    expect((putUpdated as any).targetDeck).toBeUndefined();
  });

  it("deletes single and bulk documents via REST API while preserving all flashcards intact", async () => {
    // 1. Create a source and documents
    const source = sourceRepo.create({
      name: "Distributed Systems Course",
      type: "web",
      uri: "https://example.com/systems",
      tags: ["distributed"],
      isActive: true,
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

  describe("POST /api/documents/export (Knowledge Base Document Exporter)", () => {
    it("streams merged Markdown export for a data source with TOC and citations", async () => {
      const source = sourceRepo.create({
        name: "Cloud Architecture",
        type: "web",
        uri: "https://example.com/cloud",
        tags: [],
        isActive: true,
      });

      const docA = docRepo.upsert({
        sourceId: source.id,
        title: "Microservices Patterns",
        url: "https://example.com/cloud/patterns",
        textContent: "Microservices decouple domain logic into discrete services.",
      });

      const docB = docRepo.upsert({
        sourceId: source.id,
        title: "Serverless Compute",
        url: "https://example.com/cloud/serverless",
        textContent: "Serverless functions scale to zero automatically.",
      });

      const res = await fetch(`${serverUrl}/api/documents/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: source.id,
          format: "markdown",
          mode: "merged",
          includeTableOfContents: true,
          includeCitations: true,
        }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/markdown");
      expect(res.headers.get("content-disposition")).toContain('filename="cloud-architecture-knowledge-base.md"');

      const text = await res.text();
      expect(text).toContain("# Cloud Architecture - Knowledge Base");
      expect(text).toContain("## 📑 Table of Contents");
      expect(text).toContain("Microservices Patterns");
      expect(text).toContain("Serverless Compute");
      expect(text).toContain("https://example.com/cloud/patterns");
    });

    it("streams split ZIP archive containing individual slugified document files", async () => {
      const source = sourceRepo.create({
        name: "Database Systems",
        type: "web",
        uri: "https://example.com/db",
        tags: [],
        isActive: true,
      });

      const doc1 = docRepo.upsert({
        sourceId: source.id,
        title: "Write-Ahead Logging",
        url: "https://example.com/db/wal",
        textContent: "WAL ensures durability before modifying data pages.",
      });

      const res = await fetch(`${serverUrl}/api/documents/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: source.id,
          format: "html",
          mode: "split",
        }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/zip");
      expect(res.headers.get("content-disposition")).toContain('filename="database-systems-documents-split.zip"');

      const arrayBuffer = await res.arrayBuffer();
      expect(arrayBuffer.byteLength).toBeGreaterThan(0);
    });

    it("exports targeted subset by document IDs array", async () => {
      const source = sourceRepo.create({
        name: "Security Guidelines",
        type: "web",
        uri: "https://example.com/sec",
        tags: [],
        isActive: true,
      });

      const doc1 = docRepo.upsert({
        sourceId: source.id,
        title: "OAuth2 & OIDC",
        url: "https://example.com/sec/oauth",
        textContent: "OAuth2 is an authorization framework.",
      });

      const doc2 = docRepo.upsert({
        sourceId: source.id,
        title: "Zero Trust Architecture",
        url: "https://example.com/sec/zero-trust",
        textContent: "Never trust, always verify.",
      });

      const res = await fetch(`${serverUrl}/api/documents/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: [doc2.id],
          format: "json",
          mode: "merged",
        }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");

      const json = await res.json();
      expect(json.totalDocuments).toBe(1);
      expect(json.documents[0].title).toBe("Zero Trust Architecture");
    });

    it("streams compiled EPUB 3.0 eBook with application/epub+zip MIME headers", async () => {
      const source = sourceRepo.create({
        name: "Kubernetes Handbook",
        type: "web",
        uri: "https://example.com/k8s",
        tags: [],
        isActive: true,
      });

      const doc1 = docRepo.upsert({
        sourceId: source.id,
        title: "Pods & Deployments",
        url: "https://example.com/k8s/pods",
        textContent: "Pods are the smallest deployable units of computing in Kubernetes.",
      });

      const doc2 = docRepo.upsert({
        sourceId: source.id,
        title: "Services & Ingress",
        url: "https://example.com/k8s/services",
        textContent: "Services expose an application running on a set of Pods as a network service.",
      });

      const res = await fetch(`${serverUrl}/api/documents/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: source.id,
          format: "epub",
          includeTableOfContents: true,
          includeCitations: true,
        }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/epub+zip");
      expect(res.headers.get("content-disposition")).toContain('filename="kubernetes-handbook-knowledge-base.epub"');

      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      expect(buffer.length).toBeGreaterThan(100);

      // Verify EPUB magic bytes and uncompressed mimetype at byte offset 8 (STORE compression)
      expect(buffer.toString("ascii", 0, 2)).toBe("PK");
      expect(buffer.readUInt16LE(8)).toBe(0);
      expect(buffer.toString("utf-8", 30, 58)).toBe("mimetypeapplication/epub+zip");
    });

    it("returns 404 error when no matching documents exist", async () => {
      const res = await fetch(`${serverUrl}/api/documents/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: ["non-existent-doc-id-12345"],
          format: "markdown",
        }),
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain("No documents found to export");
    });

    it("supports GET /api/documents/export with query parameters", async () => {
      const source = sourceRepo.create({
        name: "GET Export Source",
        type: "web",
        uri: "https://example.com/get-export",
        tags: [],
        isActive: true,
      });
      const doc = docRepo.upsert({
        sourceId: source.id,
        title: "GET Export Doc",
        url: "https://example.com/get-export",
        textContent: "Testing GET document export functionality.",
      });

      const res = await fetch(`${serverUrl}/api/documents/export?ids=${doc.id}&format=markdown&mode=merged`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/markdown");
      const text = await res.text();
      expect(text).toContain("GET Export Doc");
    });

    it("supports GET /api/documents to list all documents across sources", async () => {
      const source = sourceRepo.create({
        name: "List All Docs Source",
        type: "web",
        uri: "https://example.com/list-all",
        tags: [],
        isActive: true,
      });
      docRepo.upsert({
        sourceId: source.id,
        title: "List All Doc 1",
        url: "https://example.com/list-all/1",
        textContent: "Sample content 1",
      });

      const res = await fetch(`${serverUrl}/api/documents`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.documents)).toBe(true);
      expect(data.total).toBeGreaterThan(0);
    });
  });

  describe("Local Media Serving & Content-Addressed Pipeline", () => {
    it("serves local media file with correct MIME type and immutable cache headers", async () => {
      const pngPayload = Buffer.from("fake-png-data-stream-bytes-12345");
      const asset = await mediaService.saveMedia(pngPayload, "image/png");

      const res = await fetch(`${serverUrl}/api/media/${asset.filename}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
      expect(res.headers.get("cache-control")).toContain("public");
      expect(res.headers.get("cache-control")).toContain("max-age=31536000");
      expect(res.headers.get("cache-control")).toContain("immutable");

      const arrayBuf = await res.arrayBuffer();
      expect(Buffer.from(arrayBuf)).toEqual(pngPayload);
    });

    it("returns 404 when requested media file does not exist", async () => {
      const res = await fetch(`${serverUrl}/api/media/nonexistent-hash.png`);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain("Media file not found");
    });

    it("rejects path traversal attempts with 400 Bad Request", async () => {
      const res = await fetch(`${serverUrl}/api/media/%2e%2e%2f%2e%2e%2fetc%2fpasswd`);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("path traversal");
    });

    it("inlines Base64 media data when exporting standalone HTML through /api/documents/export", async () => {
      const imageBytes = Buffer.from("inline-html-pixel-bytes");
      const asset = await mediaService.saveMedia(imageBytes, "image/webp");

      const source = sourceRepo.create({
        name: "Media Export Source",
        type: "web",
        uri: "https://example.com/media-export",
        tags: [],
        isActive: true,
      });

      const doc = docRepo.upsert({
        sourceId: source.id,
        title: "Diagram Article",
        url: "https://example.com/diagram-article",
        textContent: `Overview diagram:\n\n![Cloud Architecture](/api/media/${asset.filename})`,
      });

      const res = await fetch(`${serverUrl}/api/documents/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: [doc.id],
          format: "html",
          mode: "merged",
        }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");

      const html = await res.text();
      expect(html).toContain("data:image/webp;base64,");
      expect(html).toContain('<figure class="doc-figure">');
      expect(html).toContain('<figcaption>Cloud Architecture</figcaption>');
      expect(html).not.toContain(`/api/media/${asset.filename}`);
    });

    it("inlines grayscale compact media when grayscale: true is passed to /api/documents/export", async () => {
      const sharp = (await import("sharp")).default;
      const colorBuffer = await sharp({
        create: {
          width: 200,
          height: 200,
          channels: 3,
          background: { r: 255, g: 80, b: 20 },
        },
      })
        .png()
        .toBuffer();

      const asset = await mediaService.saveMedia(colorBuffer, "image/png");

      const source = sourceRepo.create({
        name: "Grayscale Source",
        type: "web",
        uri: "https://example.com/gray",
        tags: [],
        isActive: true,
      });

      const doc = docRepo.upsert({
        sourceId: source.id,
        title: "Grayscale Article",
        url: "https://example.com/gray-article",
        textContent: `Diagram:\n\n![Figure](/api/media/${asset.filename})`,
      });

      const res = await fetch(`${serverUrl}/api/documents/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: [doc.id],
          format: "html",
          mode: "merged",
          imageQuality: "compact",
          grayscale: true,
        }),
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("data:image/webp;base64,");

      const match = html.match(/data:image\/webp;base64,([A-Za-z0-9+/=]+)/);
      expect(match).not.toBeNull();
      const decoded = Buffer.from(match![1], "base64");
      const rawPixels = await sharp(decoded).raw().toBuffer();
      // Grayscale check: R === G === B
      expect(rawPixels[0]).toBe(rawPixels[1]);
      expect(rawPixels[1]).toBe(rawPixels[2]);
    });

    it("bundles media files into media/ directory and rewrites relative paths in Split ZIP export", async () => {
      const imageBytes = Buffer.from("split-zip-image-content");
      const asset = await mediaService.saveMedia(imageBytes, "image/png");

      const source = sourceRepo.create({
        name: "Split ZIP Media Source",
        type: "web",
        uri: "https://example.com/split-zip-media",
        tags: [],
        isActive: true,
      });

      const doc = docRepo.upsert({
        sourceId: source.id,
        title: "Split ZIP Article",
        url: "https://example.com/split-zip-article",
        textContent: `Diagram reference:\n\n![Network Layout](/api/media/${asset.filename})`,
      });

      const res = await fetch(`${serverUrl}/api/documents/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: [doc.id],
          format: "markdown",
          mode: "split",
        }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/zip");

      const zipBuf = Buffer.from(await res.arrayBuffer());
      const zip = await JSZip.loadAsync(zipBuf);

      expect(zip.file(`media/${asset.filename}`)).not.toBeNull();
      const bundledImage = await zip.file(`media/${asset.filename}`)!.async("nodebuffer");
      expect(bundledImage).toEqual(imageBytes);

      const docContent = await zip.file("01-split-zip-article.md")!.async("string");
      expect(docContent).toContain(`![Network Layout](./media/${asset.filename})`);
      expect(docContent).not.toContain(`/api/media/${asset.filename}`);
    });
  });

  describe("POST /api/sources/upload - Local Document File Upload", () => {
    it("uploads a .md file using multipart/form-data and stores it in localFilesDir", async () => {
      const boundary = "---------------------------974767299852498929531610575";
      const fileContent = "# Getting Started with Microservices\n\nMicroservices break down large monolithic applications.";
      const body =
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="microservices-guide.md"\r\n` +
        `Content-Type: text/markdown\r\n\r\n` +
        `${fileContent}\r\n` +
        `--${boundary}--\r\n`;

      const res = await fetch(`${serverUrl}/api/sources/upload`, {
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.filename).toBe("microservices-guide.md");
      expect(data.size).toBe(Buffer.byteLength(fileContent));
      expect(data.path).toBe(path.resolve(tempLocalFilesDir, "microservices-guide.md"));

      expect(fs.existsSync(data.path)).toBe(true);
      expect(fs.readFileSync(data.path, "utf-8")).toBe(fileContent);
    });

    it("uploads a .txt file using raw octet-stream and x-filename header", async () => {
      const textContent = "Plain text study notes for algorithms.";
      const res = await fetch(`${serverUrl}/api/sources/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          "x-filename": "algorithms.txt",
        },
        body: textContent,
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.filename).toBe("algorithms.txt");
      expect(data.size).toBe(textContent.length);
      expect(fs.existsSync(data.path)).toBe(true);
      expect(fs.readFileSync(data.path, "utf-8")).toBe(textContent);
    });

    it("accepts .markdown extension", async () => {
      const content = "# Architecture Invariants\n\nInvariants must hold true.";
      const res = await fetch(`${serverUrl}/api/sources/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename: "invariants.markdown",
          content,
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.filename).toBe("invariants.markdown");
      expect(fs.existsSync(data.path)).toBe(true);
    });

    it("rejects unsupported file extensions with HTTP 400", async () => {
      const invalidExtensions = ["script.sh", "program.exe", "image.png", "data.json", "archive.zip"];

      for (const badFile of invalidExtensions) {
        const res = await fetch(`${serverUrl}/api/sources/upload`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filename: badFile,
            content: "some content",
          }),
        });

        expect(res.status).toBe(400);
        const data = (await res.json()) as any;
        expect(data.error).toContain("Unsupported file type");
        expect(fs.existsSync(path.join(tempLocalFilesDir, badFile))).toBe(false);
      }
    });

    it("sanitizes directory traversal patterns in filenames safely into localFilesDir", async () => {
      const traversalFilename = "../../malicious-notes.md";
      const res = await fetch(`${serverUrl}/api/sources/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename: traversalFilename,
          content: "# Secure notes",
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.filename).toBe("malicious-notes.md");
      expect(data.path).toBe(path.resolve(tempLocalFilesDir, "malicious-notes.md"));
      expect(fs.existsSync(path.resolve(tempLocalFilesDir, "malicious-notes.md"))).toBe(true);
      expect(fs.existsSync(path.resolve(tempLocalFilesDir, "../../malicious-notes.md"))).toBe(false);
    });

    it("returns HTTP 400 if filename is empty or missing", async () => {
      const res = await fetch(`${serverUrl}/api/sources/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: "No filename",
        }),
      });

      expect(res.status).toBe(400);
    });

    it("creates a local data source and syncs the uploaded document end-to-end", async () => {
      // 1. Upload Markdown note
      const docContent = "# Distributed Systems Notes\n\nConsensus algorithms guarantee consistency.";
      const uploadRes = await fetch(`${serverUrl}/api/sources/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: "distributed-systems.md",
          content: docContent,
        }),
      });
      expect(uploadRes.status).toBe(200);
      const uploadData = (await uploadRes.json()) as any;

      // 2. Create local source using uploaded file path
      const createRes = await fetch(`${serverUrl}/api/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Distributed Systems Notes",
          type: "local",
          uri: uploadData.path,
          targetDeck: "Engineering",
        }),
      });
      expect(createRes.status).toBe(201);
      const source = (await createRes.json()) as any;
      expect(source.uri).toBe(uploadData.path);

      // 3. Sync source and verify document is cataloged
      const syncRes = await fetch(`${serverUrl}/api/sync/${source.id}`, {
        method: "POST",
      });
      expect(syncRes.status).toBe(200);
      const syncData = (await syncRes.json()) as any;
      expect(syncData.newCount).toBe(1);

      // Verify discovered document is queryable
      const docsRes = await fetch(`${serverUrl}/api/sources/${source.id}/documents`);
      expect(docsRes.status).toBe(200);
      const docsData = (await docsRes.json()) as any;
      expect(docsData.documents.length).toBe(1);
      expect(docsData.documents[0].title).toBe("Distributed Systems Notes");
      expect(docsData.documents[0].textContent).toContain("Consensus algorithms guarantee consistency.");
    });

    it("uploads a .pdf file and returns HTTP 200 in under 50ms without main thread parsing", async () => {
      const pdfBuffer = Buffer.from("%PDF-1.4 mock content for fast upload test\n%%EOF");
      const start = Date.now();
      const res = await fetch(`${serverUrl}/api/sources/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/pdf",
          "x-filename": "Handbook.pdf",
        },
        body: pdfBuffer,
      });
      const duration = Date.now() - start;

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.filename).toBe("Handbook.pdf");
      expect(data.size).toBe(pdfBuffer.length);
      expect(data.path).toBe(path.resolve(tempLocalFilesDir, "Handbook.pdf"));
      expect(fs.existsSync(data.path)).toBe(true);
      expect(duration).toBeLessThan(100);
    });

    it("uploads a .docx file and returns HTTP 200 in under 50ms without main thread parsing", async () => {
      // Standard PK zip header (0x50, 0x4B, 0x03, 0x04) for docx
      const docxBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
      const start = Date.now();
      const res = await fetch(`${serverUrl}/api/sources/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "x-filename": "Report.docx",
        },
        body: docxBuffer,
      });
      const duration = Date.now() - start;

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.filename).toBe("Report.docx");
      expect(data.size).toBe(docxBuffer.length);
      expect(data.path).toBe(path.resolve(tempLocalFilesDir, "Report.docx"));
      expect(fs.existsSync(data.path)).toBe(true);
      expect(duration).toBeLessThan(100);
    });

    it("rejects legacy .doc file extension upfront with HTTP 400 without writing to disk", async () => {
      const res = await fetch(`${serverUrl}/api/sources/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename: "ancient.doc",
          content: "Legacy binary text",
        }),
      });

      expect(res.status).toBe(400);
      const data = (await res.json()) as any;
      expect(data.error).toContain("Legacy pre-2007 Word (.doc) files are not supported");
      expect(data.error).toContain(".docx or .pdf");
      expect(fs.existsSync(path.join(tempLocalFilesDir, "ancient.doc"))).toBe(false);
    });

    it("rejects OLE binary magic bytes (0xD0CF11E0) spoofed as .docx with HTTP 400 without saving", async () => {
      // OLE Compound File header signature: D0 CF 11 E0
      const oleSpoofedBuffer = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
      const res = await fetch(`${serverUrl}/api/sources/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "x-filename": "spoofed.docx",
        },
        body: oleSpoofedBuffer,
      });

      expect(res.status).toBe(400);
      const data = (await res.json()) as any;
      expect(data.error).toContain("Legacy binary Word (.doc) format detected");
      expect(fs.existsSync(path.join(tempLocalFilesDir, "spoofed.docx"))).toBe(false);
    });

    it("accepts and saves .epub file upload through POST /api/sources/upload", async () => {
      const epubBuffer = Buffer.from("fake-epub-binary-stream-for-upload-test");
      const res = await fetch(`${serverUrl}/api/sources/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/epub+zip",
          "x-filename": "handbook.epub",
        },
        body: epubBuffer,
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.filename).toBe("handbook.epub");
      expect(fs.existsSync(data.path)).toBe(true);
    });

    it("accepts slicing configuration in POST /api/sync/:id and forwards it to sync pipeline", async () => {
      // Create local note
      const notePath = path.join(tempLocalFilesDir, "sliced-note.md");
      fs.writeFileSync(
        notePath,
        "# Section 1\nAlpha beta gamma.\n\n# Section 2\nDelta epsilon zeta."
      );

      const createRes = await fetch(`${serverUrl}/api/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Slicing Note",
          type: "local",
          uri: notePath,
          targetDeck: "Notes",
        }),
      });
      const source = (await createRes.json()) as any;

      // Sync with slicing payload
      const syncRes = await fetch(`${serverUrl}/api/sync/${source.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slicing: { mode: "outline" },
        }),
      });
      expect(syncRes.status).toBe(200);

      // Verify subdocuments created
      const docsRes = await fetch(`${serverUrl}/api/sources/${source.id}/documents`);
      const docsData = (await docsRes.json()) as any;
      expect(docsData.documents.length).toBeGreaterThanOrEqual(1);
    });

    it("enqueues background sync job and returns HTTP 202 with slicing when jobManager is enabled", async () => {
      const jobRepo = new JobRepository(db);
      const jobManager = new JobManager(jobRepo);
      const jmServer = createWebServer({
        port: 0,
        sourceRepo,
        syncRepo,
        cardRepo,
        documentRepo: docRepo,
        ingestionService,
        jobManager,
        jobRepo,
      });
      const { url: jmServerUrl } = await jmServer.listen();

      try {
        const source = sourceRepo.create({
          name: "Async Note",
          type: "local",
          uri: tempLocalFilesDir,
        });

        const syncRes = await fetch(`${jmServerUrl}/api/sync/${source.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slicing: { mode: "outline", minChunkWords: 50 },
          }),
        });

        expect(syncRes.status).toBe(202);
        const data = (await syncRes.json()) as any;
        expect(data.success).toBe(true);
        expect(data.jobId).toBeDefined();

        const job = jobManager.getJob(data.jobId);
        expect(job).toBeDefined();
        expect(job?.metadata?.slicing).toEqual({ mode: "outline", minChunkWords: 50 });
      } finally {
        await jmServer.close();
      }
    });

    it("returns HTTP 404 for nonexistent source in POST /api/sync/:id", async () => {
      const syncRes = await fetch(`${serverUrl}/api/sync/nonexistent-id-999`, {
        method: "POST",
      });
      expect(syncRes.status).toBe(404);
      const data = (await syncRes.json()) as any;
      expect(data.error).toContain("not found");
    });

    it("creates data source via POST /api/sources without targetDeck (completely decoupled in Story 18.1)", async () => {
      const createRes = await fetch(`${serverUrl}/api/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Decoupled Knowledge Source",
          type: "local",
          uri: tempLocalFilesDir,
          tags: ["docs", "epics"],
        }),
      });

      expect(createRes.status).toBe(201);
      const created = (await createRes.json()) as any;
      expect(created.id).toBeDefined();
      expect(created.name).toBe("Decoupled Knowledge Source");
      expect(created.targetDeck).toBeUndefined();

      // Verify PATCH /api/sources/:id without targetDeck
      const patchRes = await fetch(`${serverUrl}/api/sources/${created.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Renamed Knowledge Source",
        }),
      });

      expect(patchRes.status).toBe(200);
      const updated = (await patchRes.json()) as any;
      expect(updated.name).toBe("Renamed Knowledge Source");
      expect(updated.targetDeck).toBeUndefined();

      // Verify GET /api/decks
      const decksRes = await fetch(`${serverUrl}/api/decks`);
      expect(decksRes.status).toBe(200);
      const decks = (await decksRes.json()) as string[];
      expect(Array.isArray(decks)).toBe(true);
    });

    it("streams compiled EPUB flashcard study guide via GET /api/export/epub?deck=Engineering", async () => {
      const res = await fetch(`${serverUrl}/api/export/epub?deck=Engineering`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/epub+zip");
      expect(res.headers.get("content-disposition")).toContain('filename="engineering-flashcards.epub"');

      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      expect(buffer.length).toBeGreaterThan(100);

      // Verify EPUB magic bytes and uncompressed mimetype at byte offset 8 (STORE compression)
      expect(buffer.toString("ascii", 0, 2)).toBe("PK");
      expect(buffer.readUInt16LE(8)).toBe(0);
      expect(buffer.toString("utf-8", 30, 58)).toBe("mimetypeapplication/epub+zip");
    });

    it("streams all decks EPUB flashcard study guide via GET /api/export?format=epub", async () => {
      const res = await fetch(`${serverUrl}/api/export?format=epub`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/epub+zip");
      expect(res.headers.get("content-disposition")).toContain('filename="all-decks-flashcards.epub"');

      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      expect(buffer.length).toBeGreaterThan(100);
      expect(buffer.toString("ascii", 0, 2)).toBe("PK");
      expect(buffer.toString("utf-8", 30, 58)).toBe("mimetypeapplication/epub+zip");
    });

    it("returns raw Flashcard[] array for unpaginated GET /api/cards for backward compatibility", async () => {
      const res = await fetch(`${serverUrl}/api/cards`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(2);
      expect(data[0].question).toBeDefined();
    });

    it("returns PaginatedCardsResponse with metadata for GET /api/cards?limit=1&offset=0", async () => {
      // Create a third card to test pagination with 3 total
      cardRepo.create({
        question: "What is 2PC?",
        answer: "Two-Phase Commit distributed protocol.",
        sourceQuote: "Two-Phase Commit ensures atomic commit.",
        targetDeck: "Engineering",
        difficulty: "expert",
        tags: ["distributed-systems"],
      });

      // Page 1
      const resPage1 = await fetch(`${serverUrl}/api/cards?limit=2&offset=0`);
      expect(resPage1.status).toBe(200);
      const page1 = (await resPage1.json()) as any;
      expect(page1.total).toBe(3);
      expect(page1.limit).toBe(2);
      expect(page1.offset).toBe(0);
      expect(page1.hasMore).toBe(true);
      expect(Array.isArray(page1.cards)).toBe(true);
      expect(page1.cards.length).toBe(2);

      // Page 2
      const resPage2 = await fetch(`${serverUrl}/api/cards?limit=2&offset=2`);
      expect(resPage2.status).toBe(200);
      const page2 = (await resPage2.json()) as any;
      expect(page2.total).toBe(3);
      expect(page2.limit).toBe(2);
      expect(page2.offset).toBe(2);
      expect(page2.hasMore).toBe(false);
      expect(page2.cards.length).toBe(1);

      // Search with pagination
      const resSearch = await fetch(`${serverUrl}/api/cards?q=Commit&limit=10&offset=0`);
      expect(resSearch.status).toBe(200);
      const searchData = (await resSearch.json()) as any;
      expect(searchData.total).toBe(1);
      expect(searchData.cards.length).toBe(1);
      expect(searchData.cards[0].question).toBe("What is 2PC?");
    });

    it("returns PaginatedCardsResponse with nextCursor and traverses pages with GET /api/cards?cursor=...", async () => {
      // Add 2 more cards for cursor traversal
      cardRepo.create({
        question: "What is Paxos?",
        answer: "A consensus algorithm.",
        sourceQuote: "Paxos solves consensus.",
        targetDeck: "Engineering",
      });
      cardRepo.create({
        question: "What is Gossip Protocol?",
        answer: "Decentralized peer-to-peer communication.",
        sourceQuote: "Gossip protocols spread metadata epidemically.",
        targetDeck: "Engineering",
      });

      // Fetch page 1 with limit 2
      const resPage1 = await fetch(`${serverUrl}/api/cards?limit=2`);
      expect(resPage1.status).toBe(200);
      const page1 = (await resPage1.json()) as any;
      expect(page1.cards.length).toBe(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).toBeDefined();
      expect(typeof page1.nextCursor).toBe("string");

      // Fetch page 2 with cursor from page 1
      const resPage2 = await fetch(`${serverUrl}/api/cards?limit=2&cursor=${encodeURIComponent(page1.nextCursor)}`);
      expect(resPage2.status).toBe(200);
      const page2 = (await resPage2.json()) as any;
      expect(page2.cards.length).toBe(2);
      expect(page2.hasMore).toBe(false);

      // Cards must not overlap
      const p1Ids = page1.cards.map((c: any) => c.id);
      const p2Ids = page2.cards.map((c: any) => c.id);
      expect(p1Ids.some((id: string) => p2Ids.includes(id))).toBe(false);
    });
  });
});




