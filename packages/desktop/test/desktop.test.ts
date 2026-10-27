import { describe, it, expect, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { bootstrapDesktopServer, type DesktopBootstrapResult } from "../src/bootstrap.js";

describe("Electron Desktop Packaging & Local Server Bootstrap", () => {
  let activeBootstrap: DesktopBootstrapResult | null = null;
  const tempDirs: string[] = [];

  function createTempDir(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    if (activeBootstrap) {
      await activeBootstrap.close();
      activeBootstrap = null;
    }
    for (const dir of tempDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
    }
    tempDirs.length = 0;
  });

  it("should initialize in-memory desktop server on an ephemeral loopback port", async () => {
    activeBootstrap = await bootstrapDesktopServer({
      inMemory: true,
      port: 0,
    });

    expect(activeBootstrap.port).toBeGreaterThan(0);
    expect(activeBootstrap.url).toBe(`http://127.0.0.1:${activeBootstrap.port}`);

    // Verify REST API endpoints respond correctly
    const res = await fetch(`${activeBootstrap.url}/api/stats`);
    expect(res.status).toBe(200);
    const stats = await res.json();
    expect(stats).toHaveProperty("totalCards");
    expect(stats).toHaveProperty("totalSources");
    expect(stats).toHaveProperty("totalDecks");
  });

  it("should isolate SQLite storage and media in the OS user-data directory", async () => {
    const userDataDir = createTempDir("fm-test-userdata-");

    activeBootstrap = await bootstrapDesktopServer({
      userDataPath: userDataDir,
      port: 0,
    });

    const expectedDbPath = path.join(userDataDir, "data.sqlite");
    const expectedMediaDir = path.join(userDataDir, "media");

    expect(activeBootstrap.dbPath).toBe(expectedDbPath);
    expect(activeBootstrap.mediaDir).toBe(expectedMediaDir);
    expect(fs.existsSync(expectedDbPath)).toBe(true);
    expect(fs.existsSync(expectedMediaDir)).toBe(true);

    // Verify database can write and read settings
    activeBootstrap.appContext.settingsService.setVerboseLogging(true);
    expect(activeBootstrap.appContext.settingsService.isVerboseLogging()).toBe(true);
  });

  it("should cleanly close server and database connections upon shutdown", async () => {
    activeBootstrap = await bootstrapDesktopServer({
      inMemory: true,
      port: 0,
    });

    const url = activeBootstrap.url;
    await activeBootstrap.close();
    activeBootstrap = null;

    // Subsequent requests to the closed server should fail
    await expect(fetch(`${url}/api/stats`)).rejects.toThrow();
  });
});
