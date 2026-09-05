import { describe, it, expect, beforeEach } from "vitest";
import { createDatabaseClient } from "../src/storage/db.js";
import { DataSourceRepository } from "../src/storage/source-repository.js";
import { DocumentRepository } from "../src/storage/document-repository.js";

describe("DocumentRepository", () => {
  let db: any;
  let sourceRepo: DataSourceRepository;
  let docRepo: DocumentRepository;
  let testSourceId: string;

  beforeEach(() => {
    db = createDatabaseClient({ inMemory: true });
    sourceRepo = new DataSourceRepository(db);
    docRepo = new DocumentRepository(db);

    const source = sourceRepo.create({
      name: "Engineering Blog",
      type: "rss",
      uri: "https://example.com/rss.xml",
      targetDeck: "Architecture",
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
});
