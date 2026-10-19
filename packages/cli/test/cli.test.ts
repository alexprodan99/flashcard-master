import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createAppContext } from "../src/app.js";
import { createCli } from "../src/cli.js";
import type { AppContext } from "../src/app.js";

describe("CLI Application", () => {
  let context: AppContext;
  let logs: string[] = [];
  let errors: string[] = [];
  let warnings: string[] = [];

  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  beforeEach(() => {
    logs = [];
    errors = [];
    warnings = [];
    console.log = vi.fn((...args: any[]) => logs.push(args.join(" ")));
    console.error = vi.fn((...args: any[]) => errors.push(args.join(" ")));
    console.warn = vi.fn((...args: any[]) => {
      warnings.push(args.join(" "));
      logs.push(args.join(" "));
    });

    context = createAppContext({ inMemory: true });
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    context.close();
  });

  it("adds and lists data sources through CLI commands", async () => {
    const cli = createCli(context);
    cli.exitOverride(); // Prevent process.exit in tests

    await cli.parseAsync([
      "node",
      "flashcard-master",
      "sources",
      "add",
      "Tech Blog",
      "rss",
      "https://example.com/feed.xml",
      "--tags",
      "tech,software",
    ]);

    expect(logs.some((l) => l.includes("Successfully added data source"))).toBe(true);

    const sources = context.sourceRepo.list();
    expect(sources.length).toBe(1);
    expect(sources[0].name).toBe("Tech Blog");
    expect((sources[0] as any).targetDeck).toBeUndefined();
    expect(sources[0].tags).toEqual(["tech", "software"]);

    // List command
    await cli.parseAsync(["node", "flashcard-master", "sources", "list"]);
    expect(logs.some((l) => l.includes("Tech Blog"))).toBe(true);

    // Add Sitemap Source
    await cli.parseAsync([
      "node",
      "flashcard-master",
      "sources",
      "add",
      "Tech Sitemap",
      "sitemap",
      "https://example.com/sitemap.xml",
    ]);
    expect(logs.some((l) => l.includes("Tech Sitemap"))).toBe(true);

    // Add LLMs.txt Catalog Source
    await cli.parseAsync([
      "node",
      "flashcard-master",
      "sources",
      "add",
      "Tech LLMs Catalog",
      "llms-txt",
      "https://example.com/llms-full.txt",
    ]);
    expect(logs.some((l) => l.includes("Tech LLMs Catalog"))).toBe(true);

    // Add Notion Workspace Source
    await cli.parseAsync([
      "node",
      "flashcard-master",
      "sources",
      "add",
      "Biology Workspace",
      "notion",
      "https://www.notion.so/workspace/Bio-Notes-123456781234123412341234567890ab",
      "--tags",
      "notion,biology",
    ]);
    expect(logs.some((l) => l.includes("Biology Workspace"))).toBe(true);

    const allSources = context.sourceRepo.list();
    expect(allSources.length).toBe(4);
    expect(allSources.find((s) => s.type === "sitemap")?.name).toBe("Tech Sitemap");
    expect(allSources.find((s) => s.type === "llms-txt")?.name).toBe("Tech LLMs Catalog");
    expect(allSources.find((s) => s.type === "notion")?.name).toBe("Biology Workspace");
  });

  it("removes data sources through CLI", async () => {
    const source = context.sourceRepo.create({
      name: "Old Feed",
      type: "rss",
      uri: "https://old.com",
    });

    const cli = createCli(context);
    cli.exitOverride();

    await cli.parseAsync(["node", "flashcard-master", "sources", "remove", source.id]);
    expect(logs.some((l) => l.includes("Successfully removed data source"))).toBe(true);
    expect(context.sourceRepo.getById(source.id)).toBeNull();
  });

  it("exports flashcards through CLI export command", async () => {
    context.cardRepo.create({
      question: "What is Raft?",
      answer: "Consensus protocol.",
      sourceQuote: "Raft is a consensus protocol.",
      sourceOriginUrl: "https://raft.github.io/raft.pdf",
      documentTitle: "Raft Paper",
      targetDeck: "Distributed",
      personaUsed: "socratic-mentor",
      difficulty: "intermediate",
      tags: ["raft"],
    });

    const cli = createCli(context);
    cli.exitOverride();

    await cli.parseAsync(["node", "flashcard-master", "export", "csv", "--deck", "Distributed"]);
    expect(logs.some((l) => l.includes("Exported 1 cards to CSV format"))).toBe(true);

    // Markdown export with flags
    logs = [];
    await cli.parseAsync(["node", "flashcard-master", "export", "markdown", "--deck", "Distributed", "--no-toc", "--no-citations"]);
    expect(logs.some((l) => l.includes("Exported 1 cards to Markdown study guide"))).toBe(true);

    // HTML export with flags
    logs = [];
    await cli.parseAsync(["node", "flashcard-master", "export", "html", "--deck", "Distributed"]);
    expect(logs.some((l) => l.includes("Exported 1 cards to printable HTML study guide"))).toBe(true);
  });

  it("handles unknown source type validation gracefully", async () => {
    const cli = createCli(context);
    cli.exitOverride();

    await cli.parseAsync([
      "node",
      "flashcard-master",
      "sources",
      "add",
      "Bad Source",
      "invalid-type",
      "https://bad.com",
    ]);

    expect(errors.some((e) => e.includes("Invalid source type"))).toBe(true);
  });

  it("lists discovered documents for a source via sources docs CLI command", async () => {
    const source = context.sourceRepo.create({
      name: "Distributed Systems Blog",
      type: "rss",
      uri: "https://example.com/dist.xml",
    });

    context.docRepo.upsert({
      sourceId: source.id,
      title: "Paxos vs Raft Comparison",
      url: "https://example.com/paxos-raft",
      textContent: "Detailed comparison of Paxos and Raft consensus algorithms.",
    });

    context.cardRepo.create({
      sourceId: source.id,
      question: "How does Raft simplify Paxos?",
      answer: "By enforcing strong leader invariants.",
      sourceQuote: "Raft simplifies Paxos.",
      documentTitle: "Paxos vs Raft Comparison",
      targetDeck: "Default",
      personaUsed: "socratic-mentor",
      difficulty: "intermediate",
      tags: [],
    });

    const cli = createCli(context);
    cli.exitOverride();

    await cli.parseAsync(["node", "flashcard-master", "sources", "docs", source.id]);

    expect(logs.some((l) => l.includes("Discovered Documents for \"Distributed Systems Blog\""))).toBe(true);
    expect(logs.some((l) => l.includes("Paxos vs Raft Comparison"))).toBe(true);
    expect(logs.some((l) => l.includes("Generated Cards: 1"))).toBe(true);

    // Test JSON mode
    logs = [];
    await cli.parseAsync(["node", "flashcard-master", "sources", "docs", source.id, "--json"]);
    expect(logs.some((l) => l.includes('"title": "Paxos vs Raft Comparison"'))).toBe(true);
  });

  it("exports discovered clean text documents for a source via sources export-docs CLI command", async () => {
    const source = context.sourceRepo.create({
      name: "Cloud Knowledge",
      type: "web",
      uri: "https://example.com/cloud",
    });

    context.docRepo.upsert({
      sourceId: source.id,
      title: "Kubernetes Ingress Controllers",
      url: "https://example.com/cloud/k8s",
      textContent: "Ingress controllers manage external access to HTTP services in Kubernetes.",
    });

    const cli = createCli(context);
    cli.exitOverride();

    logs = [];
    await cli.parseAsync(["node", "flashcard-master", "sources", "export-docs", source.id, "-f", "markdown", "-m", "merged"]);

    expect(logs.some((l) => l.includes("# Cloud Knowledge - Knowledge Base"))).toBe(true);
    expect(logs.some((l) => l.includes("## 📑 Table of Contents"))).toBe(true);
    expect(logs.some((l) => l.includes("Kubernetes Ingress Controllers"))).toBe(true);
  });

  it("registers and immediately syncs a local source with outline slicing flags (Story 17.6)", async () => {
    const syncSpy = vi.spyOn(context.ingestionService, "syncSource").mockResolvedValueOnce({
      sourceId: "mock-id",
      sourceName: "Book",
      newCount: 3,
      totalFetched: 3,
      newDocuments: [],
      skippedCount: 0,
      durationMs: 50,
    });

    const cli = createCli(context);
    cli.exitOverride();

    await cli.parseAsync([
      "node",
      "flashcard-master",
      "sources",
      "add",
      "Book",
      "local",
      "./book.pdf",
      "--slicing-mode",
      "outline",
      "--pages-per-chunk",
      "5",
      "--min-chunk-words",
      "250",
      "--sync",
    ]);

    expect(logs.some((l) => l.includes("Successfully added data source"))).toBe(true);
    expect(logs.some((l) => l.includes("Ingested 3 new items"))).toBe(true);
    expect(syncSpy).toHaveBeenCalledTimes(1);
    expect(syncSpy).toHaveBeenCalledWith(expect.any(String), {
      slicing: {
        mode: "outline",
        pagesPerChunk: 5,
        wordsPerChunk: undefined,
        minChunkWords: 250,
      },
    });
  });

  it("renders page bounds in sources docs output for subdocuments with page coordinates (Story 17.6)", async () => {
    const source = context.sourceRepo.create({
      name: "Biology Textbook",
      type: "local",
      uri: "./bio.pdf",
    });

    // Multi-page bounds: Pages: 14-18
    context.docRepo.upsert({
      sourceId: source.id,
      title: "Chapter 2: Cell Division",
      textContent: "Cell division text...",
      startPage: 14,
      endPage: 18,
    });

    // Single-page bounds: Page: 25
    context.docRepo.upsert({
      sourceId: source.id,
      title: "Glossary: Terms",
      textContent: "Glossary terms text...",
      startPage: 25,
      endPage: 25,
    });

    // Document without page bounds: graceful omit
    context.docRepo.upsert({
      sourceId: source.id,
      title: "Appendix: Notes",
      textContent: "Appendix notes text...",
    });

    const cli = createCli(context);
    cli.exitOverride();

    logs = [];
    await cli.parseAsync(["node", "flashcard-master", "sources", "docs", source.id]);

    expect(logs.some((l) => l.includes("Pages: 14-18"))).toBe(true);
    expect(logs.some((l) => l.includes("Page: 25"))).toBe(true);
    expect(logs.some((l) => l.includes("Chapter 2: Cell Division"))).toBe(true);
    expect(logs.some((l) => l.includes("Glossary: Terms"))).toBe(true);
    expect(logs.some((l) => l.includes("Appendix: Notes"))).toBe(true);
  });

  it("executes sync command with budget slicing flags (Story 17.6)", async () => {
    const syncSpy = vi.spyOn(context.ingestionService, "syncSource").mockResolvedValueOnce({
      sourceId: "s-1",
      sourceName: "Local Manual",
      newCount: 2,
      totalFetched: 2,
      newDocuments: [],
      skippedCount: 0,
      durationMs: 50,
    });

    const cli = createCli(context);
    cli.exitOverride();

    logs = [];
    await cli.parseAsync([
      "node",
      "flashcard-master",
      "sync",
      "s-1",
      "--slicing-mode",
      "budget",
      "--pages-per-chunk",
      "4",
      "--words-per-chunk",
      "1200",
    ]);

    expect(logs.some((l) => l.includes("Ingested 2 new items"))).toBe(true);
    expect(syncSpy).toHaveBeenCalledWith("s-1", {
      slicing: {
        mode: "budget",
        pagesPerChunk: 4,
        wordsPerChunk: 1200,
        minChunkWords: undefined,
      },
    });
  });

  it("warns when slicing flags are passed to sources add without --sync", async () => {
    const cli = createCli(context);
    cli.exitOverride();

    logs = [];
    errors = [];
    await cli.parseAsync([
      "node",
      "flashcard-master",
      "sources",
      "add",
      "Unsynced PDF",
      "local",
      "./doc.pdf",
      "--slicing-mode",
      "outline",
    ]);

    expect(logs.some((l) => l.includes("Successfully added data source"))).toBe(true);
    expect(logs.some((l) => l.includes("Slicing options require '--sync'"))).toBe(true);
  });

  it("rejects invalid slicing mode with error message", async () => {
    const cli = createCli(context);
    cli.exitOverride();

    errors = [];
    await cli.parseAsync([
      "node",
      "flashcard-master",
      "sources",
      "add",
      "Bad Mode PDF",
      "local",
      "./doc.pdf",
      "--slicing-mode",
      "invalid-mode",
    ]);

    expect(errors.some((e) => e.includes('Invalid slicing mode "invalid-mode"'))).toBe(true);
  });
});

