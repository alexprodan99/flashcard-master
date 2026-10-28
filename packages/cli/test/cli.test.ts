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

  it("exports cards to epub via CLI export command", async () => {
    context.cardRepo.create({
      question: "What is an EPUB?",
      answer: "Electronic publication standard.",
      sourceQuote: "EPUB is an electronic publication standard.",
      difficulty: "beginner",
      targetDeck: "Tech",
    });

    const exportSpy = vi.spyOn(context.exportService, "export").mockResolvedValueOnce({
      format: "epub",
      successCount: 1,
      outputPath: "./output.epub",
      message: "Successfully exported 1 cards to EPUB: ./output.epub",
    });

    const cli = createCli(context);
    cli.exitOverride();

    logs = [];
    await cli.parseAsync([
      "node",
      "flashcard-master",
      "export",
      "epub",
      "-d",
      "Tech",
      "-o",
      "./output.epub",
    ]);

    expect(exportSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        format: "epub",
        filter: expect.objectContaining({ targetDeck: "Tech" }),
      })
    );
    expect(logs.some((l) => l.includes("Successfully exported 1 cards to EPUB"))).toBe(true);
  });

  it("supports partial, date-filtered, and randomized export flags", async () => {
    const exportSpy = vi.spyOn(context.exportService, "export").mockResolvedValueOnce({
      format: "csv",
      successCount: 10,
      outputPath: "./sample.csv",
      message: "Exported 10 cards to csv.",
    });

    const cli = createCli(context);
    cli.exitOverride();

    logs = [];
    await cli.parseAsync([
      "node",
      "flashcard-master",
      "export",
      "csv",
      "-d",
      "Bio",
      "--after",
      "2026-10-01",
      "--before",
      "2026-10-20",
      "--limit",
      "10",
      "--shuffle",
    ]);

    expect(exportSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        format: "csv",
        filter: expect.objectContaining({
          targetDeck: "Bio",
          createdAfter: "2026-10-01",
          createdBefore: "2026-10-20",
          limit: 10,
          shuffle: true,
        }),
      })
    );
    expect(logs.some((l) => l.includes("Exported 10 cards to csv"))).toBe(true);
  });

  it("supports --all-decks in export command, forwards scoping filters, and warns if --deck is supplied", async () => {
    const cli = createCli(context);
    cli.exitOverride();

    const exportAllSpy = vi.spyOn(context.exportService, "exportAllDecks").mockResolvedValue([
      {
        format: "csv",
        outputPath: "/path/to/dir/default.csv",
        successCount: 5,
        message: "Saved to /path/to/dir/default.csv",
      },
    ]);

    await cli.parseAsync([
      "node",
      "flashcard-master",
      "export",
      "csv",
      "--all-decks",
      "/path/to/dir",
      "--deck",
      "ShouldWarn",
      "--after",
      "2026-10-01",
      "--limit",
      "5",
      "--shuffle",
    ]);

    expect(warnings.some((w) => w.includes("--deck flag is ignored when --all-decks is specified"))).toBe(true);
    expect(exportAllSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        format: "csv",
        outputDir: "/path/to/dir",
        filter: expect.objectContaining({
          createdAfter: "2026-10-01",
          limit: 5,
          shuffle: true,
        }),
      })
    );
  });

  it("displays knowledge base statistics with the stats command", async () => {
    const cli = createCli(context);
    cli.exitOverride();

    context.sourceRepo.create({
      name: "Stats Test Source",
      type: "local",
      uri: "/path/to/test.md",
    });

    await cli.parseAsync(["node", "flashcard-master", "stats"]);

    expect(logs.some((l) => l.includes("Flashcard Master Knowledge Base Statistics"))).toBe(true);
    expect(logs.some((l) => l.includes("Total Registered Sources: 1"))).toBe(true);
    expect(logs.some((l) => l.includes("Total Verified Flashcards: 0"))).toBe(true);
  });

  it("supports -f and --format flags in the export command", async () => {
    const cli = createCli(context);
    cli.exitOverride();

    const exportSpy = vi.spyOn(context.exportService, "export").mockResolvedValue({
      format: "apkg",
      outputPath: "/path/to/cards.apkg",
      successCount: 5,
      message: "Exported 5 cards to apkg",
    });

    await cli.parseAsync(["node", "flashcard-master", "export", "-f", "apkg", "-o", "/path/to/cards.apkg"]);

    expect(exportSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        format: "apkg",
        options: expect.objectContaining({
          outputPath: "/path/to/cards.apkg",
        }),
      })
    );
  });
});


