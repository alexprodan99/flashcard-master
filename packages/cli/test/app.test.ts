import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { type AppContext, createAppContext, getDefaultDbPath } from "../src/app.js";
import { getDefaultDatabasePath } from "@flashcard-master/core";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("CLI App Context and Canonical Database Resolution (Story 17.1)", () => {
  let tempDir: string;
  let tempDbPath: string;
  let context: AppContext | null = null;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fc-cli-test-"));
    tempDbPath = path.join(tempDir, "test-data.sqlite");
    context = null;
  });

  afterEach(() => {
    if (context) {
      try {
        context.close();
      } catch {}
      context = null;
    }
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it("getDefaultDbPath() returns the canonical database path from @flashcard-master/core", () => {
    const cliDefault = getDefaultDbPath();
    const coreDefault = getDefaultDatabasePath();
    expect(cliDefault).toBe(coreDefault);
    expect(cliDefault.endsWith(path.join(".flashcard-master", "data.sqlite"))).toBe(true);
  });

  it("createAppContext initializes an in-memory database when configured", () => {
    context = createAppContext({ inMemory: true });
    expect(context.db).toBeDefined();
    expect(context.sourceRepo).toBeDefined();
    expect(context.cardRepo).toBeDefined();
    expect(context.docRepo).toBeDefined();
    expect(context.jobRepo).toBeDefined();
    expect(context.settingsRepo).toBeDefined();

    // Verify database is functional
    const row = context.db.prepare("SELECT 1 as result").get() as { result: number };
    expect(row.result).toBe(1);
  });

  it("createAppContext connects to a file-based database with WAL mode enabled", () => {
    context = createAppContext({ dbPath: tempDbPath });
    expect(context.db).toBeDefined();

    const journalMode = context.db.pragma("journal_mode", { simple: true });
    expect(journalMode).toBe("wal");

    // Insert and read a source
    const created = context.sourceRepo.create({
      name: "CLI Source",
      type: "rss",
      uri: "https://example.com/rss",
      targetDeck: "Default",
      tags: ["cli"],
      isActive: true,
    });

    const retrieved = context.sourceRepo.getById(created.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe("CLI Source");

    context.close();
    context = null;
    expect(fs.existsSync(tempDbPath)).toBe(true);
  });

  it("createAppContext respects custom dbPath without accessing default live database", () => {
    context = createAppContext({ dbPath: tempDbPath });
    expect(context.db.name).toBe(tempDbPath);
  });
});
