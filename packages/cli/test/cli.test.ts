import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createAppContext } from "../src/app.js";
import { createCli } from "../src/cli.js";
import type { AppContext } from "../src/app.js";

describe("CLI Application", () => {
  let context: AppContext;
  let logs: string[] = [];
  let errors: string[] = [];

  const originalLog = console.log;
  const originalError = console.error;

  beforeEach(() => {
    logs = [];
    errors = [];
    console.log = vi.fn((...args: any[]) => logs.push(args.join(" ")));
    console.error = vi.fn((...args: any[]) => errors.push(args.join(" ")));

    context = createAppContext({ inMemory: true });
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
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
      "--deck",
      "Engineering",
      "--tags",
      "tech,software",
    ]);

    expect(logs.some((l) => l.includes("Successfully added data source"))).toBe(true);

    const sources = context.sourceRepo.list();
    expect(sources.length).toBe(1);
    expect(sources[0].name).toBe("Tech Blog");
    expect(sources[0].targetDeck).toBe("Engineering");
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
      "Milan Sitemap",
      "sitemap",
      "https://example.com/sitemap-0.xml",
      "--deck",
      "Architecture",
    ]);
    expect(logs.some((l) => l.includes("Milan Sitemap"))).toBe(true);

    // Add LLMs.txt Catalog Source
    await cli.parseAsync([
      "node",
      "flashcard-master",
      "sources",
      "add",
      "Milan LLMs Catalog",
      "llms-txt",
      "https://example.com/llms-full.txt",
      "--deck",
      "DotNet",
    ]);
    expect(logs.some((l) => l.includes("Milan LLMs Catalog"))).toBe(true);

    const allSources = context.sourceRepo.list();
    expect(allSources.length).toBe(3);
    expect(allSources.find((s) => s.type === "sitemap")?.name).toBe("Milan Sitemap");
    expect(allSources.find((s) => s.type === "llms-txt")?.name).toBe("Milan LLMs Catalog");
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
      targetDeck: "Distributed",
      personaUsed: "socratic-mentor",
      difficulty: "intermediate",
      tags: ["raft"],
    });

    const cli = createCli(context);
    cli.exitOverride();

    await cli.parseAsync(["node", "flashcard-master", "export", "csv", "--deck", "Distributed"]);
    expect(logs.some((l) => l.includes("Exported 1 cards to CSV format"))).toBe(true);
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
});
