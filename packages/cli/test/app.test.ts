import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { type AppContext, createAppContext, getDefaultDbPath } from "../src/app.js";
import { createCli } from "../src/cli.js";
import { getDefaultDatabasePath } from "@flashcard-master/core";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("CLI App Context and Canonical Database Resolution (Story 17.1 & 22.1)", () => {
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
        fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
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

  it("createAppContext resolves dbPath, mediaDir, and localFilesDir under custom dataDir", () => {
    const customDataDir = path.join(tempDir, "custom-home");
    context = createAppContext({ dataDir: customDataDir });

    expect(context.dbPath).toBe(path.join(customDataDir, "data.sqlite"));
    expect(context.mediaDir).toBe(path.join(customDataDir, "media"));
    expect(context.localFilesDir).toBe(path.join(customDataDir, "local-files"));
    expect(fs.existsSync(context.dbPath)).toBe(true);
    expect(fs.existsSync(context.mediaDir)).toBe(true);
    expect(fs.existsSync(context.localFilesDir)).toBe(true);
  });

  it("in-memory AppContext avoids creating directories under ~/.flashcard-master/", () => {
    const fakeHome = path.join(tempDir, "isolated-home");
    fs.mkdirSync(fakeHome, { recursive: true });
    const spy = vi.spyOn(os, "homedir").mockReturnValue(fakeHome);
    try {
      context = createAppContext({ inMemory: true });
      expect(fs.existsSync(path.join(fakeHome, ".flashcard-master"))).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it("CLI reads version dynamically from package.json, validates --data-dir, and overrides paths", async () => {
    const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    const cli = createCli();
    expect(cli.version()).toBe(pkg.version);

    const overrideDir = path.join(tempDir, "cli-override");
    cli.exitOverride();
    await cli.parseAsync(["node", "flashcard-master", "--data-dir", overrideDir, "stats"]);

    expect(fs.existsSync(path.join(overrideDir, "data.sqlite"))).toBe(true);
    expect(fs.existsSync(path.join(overrideDir, "media"))).toBe(true);
    expect(fs.existsSync(path.join(overrideDir, "local-files"))).toBe(true);

    await expect(
      cli.parseAsync(["node", "flashcard-master", "--data-dir", "   ", "stats"])
    ).rejects.toThrow("--data-dir must be a non-empty directory path");
  });

  it("derives sibling media/local-files dirs from dbPath and isolates/cleans inMemory temp dirs on close", () => {
    const customDb = path.join(tempDir, "custom-db-dir", "custom.sqlite");
    const ctxDb = createAppContext({ dbPath: customDb });
    try {
      expect(ctxDb.mediaDir).toBe(path.join(path.dirname(customDb), "media"));
      expect(ctxDb.localFilesDir).toBe(path.join(path.dirname(customDb), "local-files"));
    } finally {
      ctxDb.close();
    }

    const mem1 = createAppContext({ inMemory: true });
    const mem2 = createAppContext({ inMemory: true });
    expect(mem1.localFilesDir).not.toBe(mem2.localFilesDir);
    expect(fs.existsSync(mem1.localFilesDir)).toBe(true);
    const mem1Root = path.dirname(mem1.localFilesDir);
    mem1.close();
    mem2.close();
    expect(fs.existsSync(mem1Root)).toBe(false);
  });

});
