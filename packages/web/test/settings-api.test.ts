import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createDatabaseClient,
  DataSourceRepository,
  SyncStateRepository,
  FlashcardRepository,
  SqliteSettingsRepository,
  SettingsService,
} from "@flashcard-master/core";
import { createWebServer, WebServer } from "../src/server.js";
import type Database from "better-sqlite3";

describe("Settings Keys REST API (/api/settings/keys)", () => {
  let db: Database.Database;
  let sourceRepo: DataSourceRepository;
  let syncRepo: SyncStateRepository;
  let cardRepo: FlashcardRepository;
  let settingsRepo: SqliteSettingsRepository;
  let settingsService: SettingsService;
  let server: WebServer;
  let serverUrl: string;
  let mockEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    mockEnv = {};
    db = createDatabaseClient({ inMemory: true });
    sourceRepo = new DataSourceRepository(db);
    syncRepo = new SyncStateRepository(db);
    cardRepo = new FlashcardRepository(db);
    settingsRepo = new SqliteSettingsRepository(db);
    settingsService = new SettingsService(settingsRepo, mockEnv);

    server = createWebServer({
      sourceRepo,
      syncRepo,
      cardRepo,
      settingsRepo,
      settingsService,
    });

    const info = await server.listen(0);
    serverUrl = info.url;
  });

  afterEach(async () => {
    if (server) {
      await server.close();
    }
    if (db) {
      db.close();
    }
  });

  describe("GET /api/settings/keys", () => {
    it("returns unconfigured statuses when database and env are empty", async () => {
      const res = await fetch(`${serverUrl}/api/settings/keys`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.keys).toBeDefined();
      expect(data.providers).toBeDefined();
      expect(Array.isArray(data.providers)).toBe(true);
      expect(data.providers).toHaveLength(5);
      expect(data.providers.map((p: any) => p.provider)).toEqual(["openai", "anthropic", "gemini", "ollama", "notion"]);

      const openai = data.keys.openai;
      expect(openai).toEqual({
        provider: "openai",
        isConfigured: false,
        maskedValue: "",
        source: "none",
        endpoint: null,
      });

      expect(data.keys.notion.isConfigured).toBe(false);
      expect(data.keys.notion.source).toBe("none");
    });

    it("falls back to environment variables and masks secrets securely", async () => {
      mockEnv.OPENAI_API_KEY = "sk-live-1234567890abcdef";
      mockEnv.NOTION_API_KEY = "secret_notionapi987654321";

      const res = await fetch(`${serverUrl}/api/settings/keys`);
      expect(res.status).toBe(200);

      const data = await res.json();
      const rawText = JSON.stringify(data);

      // Invariant: Raw secrets must NEVER be leaked in JSON response
      expect(rawText).not.toContain("sk-live-1234567890abcdef");
      expect(rawText).not.toContain("secret_notionapi987654321");

      expect(data.keys.openai.isConfigured).toBe(true);
      expect(data.keys.openai.source).toBe("environment");
      expect(data.keys.openai.maskedValue).toBe("sk-...cdef");

      expect(data.keys.notion.isConfigured).toBe(true);
      expect(data.keys.notion.source).toBe("environment");
      expect(data.keys.notion.maskedValue).toBe("sec...4321");
    });

    it("prioritizes SQLite stored secret over environment variable", async () => {
      mockEnv.OPENAI_API_KEY = "sk-env-fallback-key";
      settingsService.setProviderSecret("openai", "sk-database-secret-9999");

      const res = await fetch(`${serverUrl}/api/settings/keys`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.keys.openai.isConfigured).toBe(true);
      expect(data.keys.openai.source).toBe("database");
      expect(data.keys.openai.maskedValue).toBe("sk-...9999");

      // Verify no raw key leakage
      expect(JSON.stringify(data)).not.toContain("sk-database-secret-9999");
      expect(JSON.stringify(data)).not.toContain("sk-env-fallback-key");
    });
  });

  describe("POST /api/settings/keys", () => {
    it("persists a provider key to SQLite and returns masked status", async () => {
      const payload = {
        provider: "notion",
        key: "  secret_custom_notion_key_abcdef  ",
      };

      const res = await fetch(`${serverUrl}/api/settings/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.provider).toBe("notion");
      expect(data.isConfigured).toBe(true);
      expect(data.source).toBe("database");
      expect(data.maskedValue).toBe("sec...cdef");

      // Verify DB actually received trimmed secret
      expect(settingsService.getSecret("notion")).toBe("secret_custom_notion_key_abcdef");
    });

    it("persists custom endpoint for Ollama", async () => {
      const payload = {
        provider: "ollama",
        endpoint: "  http://my-ollama-cluster:11434  ",
      };

      const res = await fetch(`${serverUrl}/api/settings/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.provider).toBe("ollama");
      expect(data.isConfigured).toBe(true);
      expect(data.source).toBe("database");
      expect(data.endpoint).toBe("http://my-ollama-cluster:11434");

      expect(settingsService.getEndpoint("ollama")).toBe("http://my-ollama-cluster:11434");
    });

    it("rejects invalid or missing provider", async () => {
      const res1 = await fetch(`${serverUrl}/api/settings/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "sk-1234" }),
      });
      expect(res1.status).toBe(400);

      const res2 = await fetch(`${serverUrl}/api/settings/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "unknown-provider", key: "sk-1234" }),
      });
      expect(res2.status).toBe(400);
    });

    it("rejects requests missing both key and endpoint", async () => {
      const res = await fetch(`${serverUrl}/api/settings/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "openai" }),
      });
      expect(res.status).toBe(400);
    });

    it("clears stored secret when key is null", async () => {
      settingsService.setProviderSecret("openai", "sk-to-be-cleared");
      expect(settingsService.getSecret("openai")).toBe("sk-to-be-cleared");

      const res = await fetch(`${serverUrl}/api/settings/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "openai", key: null }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.isConfigured).toBe(false);
      expect(settingsService.getSecret("openai")).toBeNull();
    });

    it("rejects non-string key or endpoint types", async () => {
      const res = await fetch(`${serverUrl}/api/settings/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "openai", key: 12345 }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/settings/keys/:provider", () => {
    it("normalizes path with trailing slash on DELETE", async () => {
      settingsService.setProviderSecret("notion", "secret_trailing_slash");
      const res = await fetch(`${serverUrl}/api/settings/keys/notion/`, {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
      expect(settingsService.getSecret("notion")).toBeNull();
    });

    it("deletes stored secret and returns reset status", async () => {
      settingsService.setProviderSecret("notion", "secret_temp_to_delete");
      expect(settingsService.getSecret("notion")).toBe("secret_temp_to_delete");

      const res = await fetch(`${serverUrl}/api/settings/keys/notion`, {
        method: "DELETE",
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.provider).toBe("notion");
      expect(data.isConfigured).toBe(false);
      expect(data.source).toBe("none");

      expect(settingsService.getSecret("notion")).toBeNull();
    });

    it("falls back to environment variable after DB key deletion", async () => {
      mockEnv.ANTHROPIC_API_KEY = "sk-ant-env-fallback-key";
      settingsService.setProviderSecret("anthropic", "sk-ant-database-override");

      const res = await fetch(`${serverUrl}/api/settings/keys/anthropic`, {
        method: "DELETE",
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.provider).toBe("anthropic");
      expect(data.isConfigured).toBe(true);
      expect(data.source).toBe("environment");
      expect(data.maskedValue).toBe("sk-...-key");

      expect(settingsService.getSecret("anthropic")).toBe("sk-ant-env-fallback-key");
    });

    it("rejects unsupported provider on DELETE", async () => {
      const res = await fetch(`${serverUrl}/api/settings/keys/unsupported`, {
        method: "DELETE",
      });
      expect(res.status).toBe(400);
    });
  });
});
