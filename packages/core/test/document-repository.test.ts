import { describe, it, expect, beforeEach } from "vitest";
import { createDatabaseClient } from "../src/storage/db.js";
import { DataSourceRepository } from "../src/storage/source-repository.js";
import { DocumentRepository } from "../src/storage/document-repository.js";
import { FlashcardRepository } from "../src/storage/card-repository.js";

describe("DocumentRepository", () => {
  let db: any;
  let sourceRepo: DataSourceRepository;
  let docRepo: DocumentRepository;
  let cardRepo: FlashcardRepository;
  let testSourceId: string;

  beforeEach(() => {
    db = createDatabaseClient({ inMemory: true });
    sourceRepo = new DataSourceRepository(db);
    docRepo = new DocumentRepository(db);
    cardRepo = new FlashcardRepository(db);

    const source = sourceRepo.create({
      name: "Engineering Blog",
      type: "rss",
      uri: "https://example.com/rss.xml",
      tags: ["tech"],
      isActive: true,
    });
    testSourceId = source.id;
  });

  it("upserts and retrieves a discovered document with calculated word count", () => {
    const doc = docRepo.upsert({
      sourceId: testSourceId,
      title: "Raft Consensus Algorithm",
      url: "https://example.com/posts/raft",
      textContent: "Raft is a consensus algorithm designed for distributed state machine replication.",
      contentHash: "hash-raft-1",
    });

    expect(doc.id).toBeDefined();
    expect(doc.sourceId).toBe(testSourceId);
    expect(doc.title).toBe("Raft Consensus Algorithm");
    expect(doc.wordCount).toBe(11);
    expect(doc.url).toBe("https://example.com/posts/raft");

    const fetched = docRepo.getById(doc.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.title).toBe("Raft Consensus Algorithm");
    expect(fetched?.textContent).toContain("consensus algorithm");
  });

  it("supports batch upserts and counting documents by source", () => {
    docRepo.upsertBatch([
      {
        id: "doc-1",
        sourceId: testSourceId,
        title: "Article 1",
        url: "https://example.com/1",
        textContent: "Content of first article with six words.",
      },
      {
        id: "doc-2",
        sourceId: testSourceId,
        title: "Article 2",
        url: "https://example.com/2",
        textContent: "Content of second article.",
      },
    ]);

    expect(docRepo.getDocumentCount(testSourceId)).toBe(2);
    expect(docRepo.getDocumentCount()).toBe(2);

    const list = docRepo.listBySourceId(testSourceId);
    expect(list.length).toBe(2);
    expect(list.map((d) => d.title)).toContain("Article 1");
    expect(list.map((d) => d.title)).toContain("Article 2");
  });

  it("filters and searches documents by title or text content", () => {
    docRepo.upsertBatch([
      {
        id: "doc-paxos",
        sourceId: testSourceId,
        title: "Paxos Protocol Explained",
        textContent: "Classic consensus protocol using synod rounds.",
      },
      {
        id: "doc-gossip",
        sourceId: testSourceId,
        title: "Gossip Membership Protocols",
        textContent: "SWIM protocol implementation in distributed clusters.",
      },
    ]);

    const results = docRepo.listBySourceId(testSourceId, { search: "Paxos" });
    expect(results.length).toBe(1);
    expect(results[0].title).toBe("Paxos Protocol Explained");

    const textResults = docRepo.listBySourceId(testSourceId, { search: "SWIM" });
    expect(textResults.length).toBe(1);
    expect(textResults[0].title).toBe("Gossip Membership Protocols");

    // Tokenized search with stop word ("article") and plural tolerance ("protocols" -> "protocol")
    const tokenizedResults = docRepo.listBySourceId(testSourceId, { search: "paxos protocols article" });
    expect(tokenizedResults.length).toBe(1);
    expect(tokenizedResults[0].title).toBe("Paxos Protocol Explained");

    // Exact title ranking
    docRepo.upsert({
      id: "doc-exact",
      sourceId: testSourceId,
      title: "Consensus",
      textContent: "Short note on consensus.",
    });
    docRepo.upsert({
      id: "doc-longer",
      sourceId: testSourceId,
      title: "Consensus in Distributed Systems: The Complete Guide",
      textContent: "Deep dive on consensus.",
    });

    const ranked = docRepo.listBySourceId(testSourceId, { search: "Consensus" });
    expect(ranked[0].title).toBe("Consensus");
  });

  it("preserves double-s words like process or class during search stemming without corrupting tokens", () => {
    docRepo.upsertBatch([
      {
        id: "doc-process",
        sourceId: testSourceId,
        title: "Background Process Management",
        textContent: "Managing long-running processes efficiently.",
      },
      {
        id: "doc-class",
        sourceId: testSourceId,
        title: "First Class Functions in TypeScript",
        textContent: "Exploring functional programming constructs.",
      },
    ]);

    // Searching for "process" should match doc-process and preserve "process" without truncating to "proces"
    const processResults = docRepo.listBySourceId(testSourceId, { search: "process" });
    expect(processResults.length).toBe(1);
    expect(processResults[0].id).toBe("doc-process");

    // Searching for "class" should match doc-class
    const classResults = docRepo.listBySourceId(testSourceId, { search: "class" });
    expect(classResults.length).toBe(1);
    expect(classResults[0].id).toBe("doc-class");
  });

  it("cascades deletion when parent data source is removed", () => {
    docRepo.upsert({
      id: "doc-to-cascade",
      sourceId: testSourceId,
      title: "Temporary Article",
      textContent: "Short note",
    });

    expect(docRepo.getDocumentCount(testSourceId)).toBe(1);

    sourceRepo.delete(testSourceId);

    expect(docRepo.getDocumentCount(testSourceId)).toBe(0);
    expect(docRepo.getById("doc-to-cascade")).toBeNull();
  });

  it("handles legacy IDs gracefully without throwing UNIQUE constraint failed on (source_id, url)", () => {
    // 1. Manually insert a document with a legacy random UUID
    db.prepare(`
      INSERT INTO documents (id, source_id, title, url, text_content)
      VALUES (?, ?, ?, ?, ?)
    `).run("legacy-random-uuid-999", testSourceId, "Initial Title", "https://example.com/unique-post", "Old content");

    // 2. Now perform upsert without providing an ID or with a newly calculated deterministic ID
    expect(() => {
      const updated = docRepo.upsert({
        sourceId: testSourceId,
        title: "Updated Title",
        url: "https://example.com/unique-post",
        textContent: "New fresh content",
      });
      expect(updated.id).toBe("legacy-random-uuid-999");
      expect(updated.title).toBe("Updated Title");
      expect(updated.textContent).toBe("New fresh content");
    }).not.toThrow();

    // 3. Perform batch upsert with the same URL
    expect(() => {
      docRepo.upsertBatch([
        {
          sourceId: testSourceId,
          title: "Batch Updated Title",
          url: "https://example.com/unique-post",
          textContent: "Batch updated content",
        },
      ]);
    }).not.toThrow();

    const fetched = docRepo.listBySourceId(testSourceId);
    expect(fetched.length).toBe(1);
    expect(fetched[0].id).toBe("legacy-random-uuid-999");
    expect(fetched[0].title).toBe("Batch Updated Title");
  });

  it("deduplicates multiple items with identical URLs in the same batch without crashing", () => {
    expect(() => {
      docRepo.upsertBatch([
        {
          sourceId: testSourceId,
          title: "Duplicate Article v1",
          url: "https://example.com/duplicate-in-batch",
          textContent: "Version 1",
        },
        {
          sourceId: testSourceId,
          title: "Duplicate Article v2",
          url: "https://example.com/duplicate-in-batch",
          textContent: "Version 2",
        },
      ]);
    }).not.toThrow();

    const list = docRepo.listBySourceId(testSourceId);
    expect(list.length).toBe(1);
    expect(list[0].title).toBe("Duplicate Article v2");
    expect(list[0].textContent).toBe("Version 2");
  });

  it("deletes a single document via deleteById and returns boolean success status", () => {
    const doc = docRepo.upsert({
      id: "doc-del-1",
      sourceId: testSourceId,
      title: "To Be Deleted",
      textContent: "Delete me please.",
    });

    expect(docRepo.getById("doc-del-1")).not.toBeNull();
    const result = docRepo.deleteById("doc-del-1");
    expect(result).toBe(true);
    expect(docRepo.getById("doc-del-1")).toBeNull();

    // Deleting again or non-existing ID returns false
    expect(docRepo.deleteById("doc-del-1")).toBe(false);
    expect(docRepo.deleteById("non-existing-id")).toBe(false);
  });

  it("deletes multiple documents in bulk transaction via deleteMany / deleteBulk", () => {
    docRepo.upsertBatch([
      { id: "bulk-1", sourceId: testSourceId, title: "Doc 1", textContent: "Body 1" },
      { id: "bulk-2", sourceId: testSourceId, title: "Doc 2", textContent: "Body 2" },
      { id: "bulk-3", sourceId: testSourceId, title: "Doc 3", textContent: "Body 3" },
      { id: "bulk-4", sourceId: testSourceId, title: "Doc 4", textContent: "Body 4" },
    ]);

    expect(docRepo.getDocumentCount(testSourceId)).toBe(4);

    // Delete 2 valid docs and 1 non-existing doc
    const deletedCount = docRepo.deleteMany(["bulk-1", "bulk-3", "bulk-999"]);
    expect(deletedCount).toBe(2);

    expect(docRepo.getById("bulk-1")).toBeNull();
    expect(docRepo.getById("bulk-2")).not.toBeNull();
    expect(docRepo.getById("bulk-3")).toBeNull();
    expect(docRepo.getById("bulk-4")).not.toBeNull();
    expect(docRepo.getDocumentCount(testSourceId)).toBe(2);

    // Test deleteBulk alias
    const bulk2Count = docRepo.deleteBulk(["bulk-2"]);
    expect(bulk2Count).toBe(1);
    expect(docRepo.getById("bulk-2")).toBeNull();

    // Test empty/invalid inputs
    expect(docRepo.deleteMany([])).toBe(0);
    expect(docRepo.deleteMany(["   ", ""])).toBe(0);
    expect(docRepo.deleteMany(null as any)).toBe(0);
    expect(docRepo.deleteMany(undefined as any)).toBe(0);
    expect(docRepo.deleteMany("not-an-array" as any)).toBe(0);
    expect(docRepo.deleteMany([null, undefined, 123, "   "] as any)).toBe(0);
  });

  it("handles duplicate IDs and whitespace-padded IDs in deleteMany cleanly", () => {
    docRepo.upsert({ id: "dup-1", sourceId: testSourceId, title: "Doc 1", textContent: "Body 1" });
    docRepo.upsert({ id: "dup-2", sourceId: testSourceId, title: "Doc 2", textContent: "Body 2" });

    // Pass duplicated and padded IDs
    const count = docRepo.deleteMany(["  dup-1  ", "dup-1", "dup-2", "dup-2", "non-existent-id"]);
    expect(count).toBe(2);
    expect(docRepo.getById("dup-1")).toBeNull();
    expect(docRepo.getById("dup-2")).toBeNull();
  });

  it("strictly preserves generated flashcards across all document deletion vectors", () => {
    const doc = docRepo.upsert({
      id: "doc-grounding-source",
      sourceId: testSourceId,
      title: "Crucial Architecture Doc",
      url: "https://example.com/architecture",
      textContent: "Microservices communicate via event streaming brokers.",
    });

    const doc2 = docRepo.upsert({
      id: "doc-grounding-source-2",
      sourceId: testSourceId,
      title: "Database Sharding Guide",
      url: "https://example.com/sharding",
      textContent: "Consistent hashing distributes keys across database shards.",
    });

    // Create flashcards derived from both documents
    const card1 = cardRepo.create({
      sourceId: testSourceId,
      documentTitle: doc.title,
      sourceOriginUrl: doc.url,
      question: "How do microservices communicate?",
      answer: "Via event streaming brokers.",
      sourceQuote: "Microservices communicate via event streaming brokers.",
      difficulty: "intermediate",
      personaUsed: "socratic-mentor",
      targetDeck: "Architecture",
      tags: ["distributed-systems"],
    });

    const card2 = cardRepo.create({
      sourceId: testSourceId,
      documentTitle: doc.title,
      sourceOriginUrl: doc.url,
      question: "What is the primary message broker pattern?",
      answer: "Event streaming.",
      sourceQuote: "event streaming brokers",
      difficulty: "expert",
      personaUsed: "socratic-mentor",
      targetDeck: "Architecture",
      tags: ["distributed-systems"],
    });

    const card3 = cardRepo.create({
      sourceId: testSourceId,
      documentTitle: doc2.title,
      sourceOriginUrl: doc2.url,
      question: "How are keys distributed across shards?",
      answer: "Via consistent hashing.",
      sourceQuote: "Consistent hashing distributes keys across database shards.",
      difficulty: "intermediate",
      personaUsed: "socratic-mentor",
      targetDeck: "Databases",
      tags: ["db-scaling"],
    });

    expect(cardRepo.getById(card1.id)).not.toBeNull();
    expect(cardRepo.getById(card2.id)).not.toBeNull();
    expect(cardRepo.getById(card3.id)).not.toBeNull();

    // 1. Delete single document via deleteById
    const deleted1 = docRepo.deleteById("doc-grounding-source");
    expect(deleted1).toBe(true);
    expect(docRepo.getById("doc-grounding-source")).toBeNull();

    // Verify card1 & card2 are 100% preserved
    const preserved1 = cardRepo.getById(card1.id);
    expect(preserved1).not.toBeNull();
    expect(preserved1?.question).toBe("How do microservices communicate?");
    expect(preserved1?.answer).toBe("Via event streaming brokers.");
    expect(preserved1?.sourceQuote).toBe("Microservices communicate via event streaming brokers.");
    expect(preserved1?.documentTitle).toBe("Crucial Architecture Doc");
    expect(preserved1?.sourceOriginUrl).toBe("https://example.com/architecture");
    expect(preserved1?.targetDeck).toBe("Architecture");

    // 2. Delete document via deleteMany / deleteBulk
    const deletedBatchCount = docRepo.deleteMany(["doc-grounding-source-2"]);
    expect(deletedBatchCount).toBe(1);
    expect(docRepo.getById("doc-grounding-source-2")).toBeNull();

    // Verify card3 is 100% preserved
    const preserved3 = cardRepo.getById(card3.id);
    expect(preserved3).not.toBeNull();
    expect(preserved3?.question).toBe("How are keys distributed across shards?");
    expect(preserved3?.documentTitle).toBe("Database Sharding Guide");
    expect(preserved3?.sourceOriginUrl).toBe("https://example.com/sharding");

    // 3. Delete by source ID when source documents are purged
    docRepo.deleteBySourceId(testSourceId);
    expect(cardRepo.getById(card1.id)).not.toBeNull();
    expect(cardRepo.getById(card2.id)).not.toBeNull();
    expect(cardRepo.getById(card3.id)).not.toBeNull();
  });

  it("retrieves multiple documents by IDs list and lists all documents with search", () => {
    docRepo.upsertBatch([
      {
        id: "doc-alpha",
        sourceId: testSourceId,
        title: "Alpha Article",
        textContent: "Alpha content about caching strategies.",
      },
      {
        id: "doc-beta",
        sourceId: testSourceId,
        title: "Beta Article",
        textContent: "Beta content about indexing strategies.",
      },
      {
        id: "doc-gamma",
        sourceId: testSourceId,
        title: "Gamma Article",
        textContent: "Gamma content about replication.",
      },
    ]);

    // getByIds
    const subset = docRepo.getByIds(["doc-alpha", "doc-gamma", "non-existent"]);
    expect(subset.length).toBe(2);
    expect(subset.map((d) => d.id)).toContain("doc-alpha");
    expect(subset.map((d) => d.id)).toContain("doc-gamma");

    // Empty or invalid getByIds
    expect(docRepo.getByIds([])).toEqual([]);
    expect(docRepo.getByIds(["  "])).toEqual([]);

    // listAll with search
    const all = docRepo.listAll();
    expect(all.length).toBe(3);

    const filtered = docRepo.listAll({ search: "caching" });
    expect(filtered.length).toBe(1);
    expect(filtered[0].title).toBe("Alpha Article");
  });

  it("persists and retrieves rawContent on single upsert and batch upsert", () => {
    const rawHtml = "<html><body><h1>Paxos</h1><p>Classic consensus protocol.</p></body></html>";
    const doc = docRepo.upsert({
      sourceId: testSourceId,
      title: "Paxos Consensus",
      url: "https://example.com/paxos",
      textContent: "# Paxos\n\nClassic consensus protocol.",
      rawContent: rawHtml,
      contentHash: "paxos-hash-1",
    });

    expect(doc.rawContent).toBe(rawHtml);

    const fetched = docRepo.getById(doc.id);
    expect(fetched?.rawContent).toBe(rawHtml);
    expect(fetched?.textContent).toBe("# Paxos\n\nClassic consensus protocol.");

    // Batch upsert with rawContent
    const batchRaw1 = "# Batch Note 1\n\nContent 1";
    const batchRaw2 = "<div><p>Batch HTML 2</p></div>";
    docRepo.upsertBatch([
      {
        id: "batch-raw-1",
        sourceId: testSourceId,
        title: "Batch Note 1",
        url: "https://example.com/batch-1",
        textContent: "# Batch Note 1\n\nContent 1",
        rawContent: batchRaw1,
      },
      {
        id: "batch-raw-2",
        sourceId: testSourceId,
        title: "Batch Note 2",
        url: "https://example.com/batch-2",
        textContent: "Batch HTML 2",
        rawContent: batchRaw2,
      },
    ]);

    const doc1 = docRepo.getById("batch-raw-1");
    expect(doc1?.rawContent).toBe(batchRaw1);

    const doc2 = docRepo.getById("batch-raw-2");
    expect(doc2?.rawContent).toBe(batchRaw2);

    // Update existing document with new rawContent
    const updatedRaw = "<html><body><h1>Paxos 2.0</h1></body></html>";
    const updated = docRepo.upsert({
      id: doc.id,
      sourceId: testSourceId,
      title: "Paxos Consensus Updated",
      url: "https://example.com/paxos",
      textContent: "# Paxos 2.0",
      rawContent: updatedRaw,
    });

    expect(updated.rawContent).toBe(updatedRaw);
    const fetchedUpdated = docRepo.getById(doc.id);
    expect(fetchedUpdated?.rawContent).toBe(updatedRaw);
  });

  it("persists and hydrates startPage and endPage coordinates across upsert and upsertBatch", () => {
    const singleDoc = docRepo.upsert({
      sourceId: testSourceId,
      title: "Calculus Chapter 1",
      url: "file:///docs/calc.pdf#page=1-5",
      textContent: "Limits and Derivatives",
      startPage: 1,
      endPage: 5,
    });

    expect(singleDoc.startPage).toBe(1);
    expect(singleDoc.endPage).toBe(5);

    const fetchedSingle = docRepo.getById(singleDoc.id);
    expect(fetchedSingle).not.toBeNull();
    expect(fetchedSingle?.startPage).toBe(1);
    expect(fetchedSingle?.endPage).toBe(5);

    // Test upsertBatch
    docRepo.upsertBatch([
      {
        id: "batch-subdoc-1",
        sourceId: testSourceId,
        title: "Calculus Chapter 2",
        url: "file:///docs/calc.pdf#page=6-10",
        textContent: "Integrals",
        startPage: 6,
        endPage: 10,
      },
      {
        id: "batch-subdoc-2",
        sourceId: testSourceId,
        title: "Calculus Chapter 3",
        url: "file:///docs/calc.pdf#page=11-12",
        textContent: "Series",
        startPage: 11,
        endPage: 12,
      },
    ]);

    const batchDoc1 = docRepo.getById("batch-subdoc-1");
    expect(batchDoc1?.startPage).toBe(6);
    expect(batchDoc1?.endPage).toBe(10);

    const batchDoc2 = docRepo.getById("batch-subdoc-2");
    expect(batchDoc2?.startPage).toBe(11);
    expect(batchDoc2?.endPage).toBe(12);
  });

  it("indexes and matches documents by start_page and end_page coordinates in search", () => {
    docRepo.upsertBatch([
      {
        id: "page-doc-1",
        sourceId: testSourceId,
        title: "Calculus Part A",
        url: "file:///docs/calc.pdf#page=14-20",
        textContent: "Derivatives of composite functions",
        startPage: 14,
        endPage: 20,
      },
      {
        id: "page-doc-2",
        sourceId: testSourceId,
        title: "Algebra Basics",
        url: "file:///docs/algebra.pdf#page=1-5",
        textContent: "Linear equations and matrices",
        startPage: 1,
        endPage: 5,
      },
    ]);

    const res14 = docRepo.listAll({ search: "14" });
    expect(res14.some((d) => d.id === "page-doc-1")).toBe(true);
    expect(res14.some((d) => d.id === "page-doc-2")).toBe(false);

    const res20 = docRepo.listAll({ search: "20" });
    expect(res20.some((d) => d.id === "page-doc-1")).toBe(true);
  });
});

