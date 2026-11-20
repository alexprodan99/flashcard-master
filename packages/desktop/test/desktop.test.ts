import { describe, it, expect, afterEach, vi } from "vitest";
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
    vi.restoreAllMocks();
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

  it("should default to canonical ~/.flashcard-master/ storage without migrating legacy userData", async () => {
    const fakeHome = createTempDir("fm-test-home-");
    const legacyUserData = createTempDir("fm-test-legacy-userdata-");
    fs.writeFileSync(path.join(legacyUserData, "data.sqlite"), "legacy-marker");

    vi.spyOn(os, "homedir").mockReturnValue(fakeHome);

    activeBootstrap = await bootstrapDesktopServer({
      port: 0,
    });

    const expectedBase = path.join(fakeHome, ".flashcard-master");
    expect(activeBootstrap.dbPath).toBe(path.join(expectedBase, "data.sqlite"));
    expect(activeBootstrap.mediaDir).toBe(path.join(expectedBase, "media"));
    expect(activeBootstrap.localFilesDir).toBe(path.join(expectedBase, "local-files"));
    expect(fs.existsSync(activeBootstrap.dbPath)).toBe(true);
    expect(fs.existsSync(activeBootstrap.mediaDir)).toBe(true);
    expect(fs.existsSync(activeBootstrap.localFilesDir)).toBe(true);
    expect(fs.readFileSync(path.join(legacyUserData, "data.sqlite"), "utf8")).toBe("legacy-marker");
  });

  it("should isolate SQLite storage, media, and local-files when explicit userDataPath override is given", async () => {
    const userDataDir = createTempDir("fm-test-userdata-");

    activeBootstrap = await bootstrapDesktopServer({
      userDataPath: userDataDir,
      port: 0,
    });

    const expectedDbPath = path.join(userDataDir, "data.sqlite");
    const expectedMediaDir = path.join(userDataDir, "media");
    const expectedLocalFilesDir = path.join(userDataDir, "local-files");

    expect(activeBootstrap.dbPath).toBe(expectedDbPath);
    expect(activeBootstrap.mediaDir).toBe(expectedMediaDir);
    expect(activeBootstrap.localFilesDir).toBe(expectedLocalFilesDir);
    expect(fs.existsSync(expectedDbPath)).toBe(true);
    expect(fs.existsSync(expectedMediaDir)).toBe(true);
    expect(fs.existsSync(expectedLocalFilesDir)).toBe(true);

    // Verify database can write and read settings
    activeBootstrap.appContext.settingsService.setVerboseLogging(true);
    expect(activeBootstrap.appContext.settingsService.isVerboseLogging()).toBe(true);

    // Verify WebServer boundary writes uploads to <userDataPath>/local-files
    const uploadRes = await fetch(`${activeBootstrap.url}/api/sources/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: "desktop-parity-check.md",
        content: "# Parity Check\nUploaded through desktop WebServer.",
      }),
    });
    expect(uploadRes.status).toBe(200);
    const uploadData = (await uploadRes.json()) as { path: string };
    expect(path.dirname(uploadData.path)).toBe(expectedLocalFilesDir);
    expect(fs.existsSync(path.join(expectedLocalFilesDir, "desktop-parity-check.md"))).toBe(true);
  });

  it("should ignore whitespace userDataPath and resolve canonical ~/.flashcard-master/ paths", async () => {
    const fakeHome = createTempDir("fm-test-ws-home-");
    vi.spyOn(os, "homedir").mockReturnValue(fakeHome);

    activeBootstrap = await bootstrapDesktopServer({
      userDataPath: "   ",
      port: 0,
    });

    const expectedBase = path.join(fakeHome, ".flashcard-master");
    expect(activeBootstrap.dbPath).toBe(path.join(expectedBase, "data.sqlite"));
    expect(activeBootstrap.mediaDir).toBe(path.join(expectedBase, "media"));
    expect(activeBootstrap.localFilesDir).toBe(path.join(expectedBase, "local-files"));
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

  it("routes all dist* packaging scripts through electron-build.mjs and reads preload version dynamically", () => {
    const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    for (const scriptName of ["dist", "dist:win", "dist:mac", "dist:linux", "dist:dir"]) {
      expect(pkg.scripts[scriptName]).toContain("electron-build.mjs");
    }
    const preloadSrc = fs.readFileSync(new URL("../src/preload.ts", import.meta.url), "utf8");
    expect(preloadSrc).toContain("--fm-app-version=");
  });

});
