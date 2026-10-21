import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createDatabaseClient,
  DataSourceRepository,
  SyncStateRepository,
  FlashcardRepository,
  SqliteSettingsRepository,
  SettingsService,
  type ProviderVerifierPort,
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
  let mockVerifier: ProviderVerifierPort;
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

    mockVerifier = {
      verify: vi.fn().mockImplementation(async (opts) => {
        return {
          success: true,
          message: `Connected to ${opts.provider} successfully.`,
          details: { verifiedKey: opts.key ? "provided" : "none" },
        };
      }),
    };

    server = createWebServer({
      sourceRepo,
      syncRepo,
      cardRepo,
      settingsRepo,
      settingsService,
      providerVerifier: mockVerifier,
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

  describe("POST /api/settings/keys/test", () => {
    it("rejects missing provider with 400 Bad Request", async () => {
      const res = await fetch(`${serverUrl}/api/settings/keys/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("provider");
    });

    it("rejects unsupported provider with 400 Bad Request", async () => {
      const res = await fetch(`${serverUrl}/api/settings/keys/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "deepseek" }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Unsupported provider "deepseek"');
    });

    it("rejects non-string key or endpoint with 400 Bad Request", async () => {
      const res = await fetch(`${serverUrl}/api/settings/keys/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "openai", key: 12345 }),
      });

      expect(res.status).toBe(400);
    });

    it("returns friendly failure when testing unconfigured key-required provider", async () => {
      const res = await fetch(`${serverUrl}/api/settings/keys/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "openai" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.message).toContain("No API key configured for openai. Please enter a key to test.");
    });

    it("probes candidate key supplied in body", async () => {
      const res = await fetch(`${serverUrl}/api/settings/keys/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "openai",
          key: "sk-candidate-test-key",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.message).toContain("Connected to openai successfully.");
      expect(mockVerifier.verify).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "openai",
          key: "sk-candidate-test-key",
          timeoutMs: 3000,
        })
      );
    });

    it("falls back to stored database secret when key is omitted in body", async () => {
      settingsService.setProviderSecret("anthropic", "sk-ant-database-saved-key");

      const res = await fetch(`${serverUrl}/api/settings/keys/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "anthropic" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(mockVerifier.verify).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "anthropic",
          key: "sk-ant-database-saved-key",
        })
      );
    });

    it("falls back to environment variable secret when DB key is absent", async () => {
      mockEnv.NOTION_API_KEY = "secret_notion_env_key";

      const res = await fetch(`${serverUrl}/api/settings/keys/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "notion" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(mockVerifier.verify).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "notion",
          key: "secret_notion_env_key",
        })
      );
    });

    it("allows testing Ollama endpoint without requiring an API key", async () => {
      const res = await fetch(`${serverUrl}/api/settings/keys/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "ollama",
          endpoint: "http://localhost:11434",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(mockVerifier.verify).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "ollama",
          endpoint: "http://localhost:11434",
        })
      );
    });

    it("falls back to stored database endpoint when endpoint is omitted in body", async () => {
      settingsService.setProviderSecret("ollama", null, "http://my-remote-ollama:11434");

      const res = await fetch(`${serverUrl}/api/settings/keys/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "ollama" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(mockVerifier.verify).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "ollama",
          endpoint: "http://my-remote-ollama:11434",
        })
      );
    });

    it("allows keyless testing for local OpenAI endpoint when configured", async () => {
      settingsService.setProviderSecret("openai", null, "http://localhost:8080/v1");

      const res = await fetch(`${serverUrl}/api/settings/keys/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "openai" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(mockVerifier.verify).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "openai",
          key: null,
          endpoint: "http://localhost:8080/v1",
        })
      );
    });

    it("catches unexpected exceptions from verifier and returns 200 with error message", async () => {
      vi.mocked(mockVerifier.verify).mockRejectedValueOnce(new Error("Unexpected internal fault"));

      const res = await fetch(`${serverUrl}/api/settings/keys/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "openai",
          key: "sk-test",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.message).toContain("Verification failed: Unexpected internal fault");
    });
  });

  describe("Logging & Diagnostics Settings REST API (/api/settings/logging)", () => {
    it("returns default logging settings on GET /api/settings/logging", async () => {
      const res = await fetch(`${serverUrl}/api/settings/logging`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.verbose).toBe(false);
      expect(data.logLevel).toBe("info");
    });

    it("updates verbosity to true on PUT /api/settings/logging", async () => {
      const res = await fetch(`${serverUrl}/api/settings/logging`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verbose: true }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.verbose).toBe(true);
      expect(data.logLevel).toBe("debug");

      // Verify persisted in service
      expect(settingsService.isVerboseLogging()).toBe(true);
      expect(settingsService.getLogLevel()).toBe("debug");

      // Verify GET returns updated settings
      const getRes = await fetch(`${serverUrl}/api/settings/logging`);
      const getData = await getRes.json();
      expect(getData.verbose).toBe(true);
      expect(getData.logLevel).toBe("debug");
    });

    it("updates logLevel to 'warn' and disables verbose mode", async () => {
      settingsService.setVerboseLogging(true);

      const res = await fetch(`${serverUrl}/api/settings/logging`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logLevel: "warn" }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.logLevel).toBe("warn");
      expect(data.verbose).toBe(false);
    });

    it("rejects invalid log level with 400 Bad Request", async () => {
      const res = await fetch(`${serverUrl}/api/settings/logging`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logLevel: "invalid-level" }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Field 'logLevel' must be one of: debug, info, warn, error");
    });
  });

  describe("General Settings REST API (/api/settings/general & /api/settings/anki/test)", () => {
    it("GET /api/settings/general returns default settings and sources", async () => {
      const res = await fetch(`${serverUrl}/api/settings/general`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.settings).toBeDefined();
      expect(data.sources).toBeDefined();
      expect(data.settings.ankiconnectUrl).toBe("http://127.0.0.1:8765");
      expect(data.settings.defaultAiProvider).toBe("ollama");
      expect(data.settings.defaultAiModel).toBe("phi4-mini");
      expect(data.settings.maxGenerationWorkers).toBe(2);
      expect(data.settings.workerTimeoutMinutes).toBe(15);
      expect(data.sources.ankiconnectUrl).toBe("default");
      expect(data.sources.defaultAiProvider).toBe("default");
    });

    it("GET /api/settings/general respects environment variables with source='environment'", async () => {
      mockEnv.ANKI_CONNECT_URL = "http://remote-anki:8765";
      mockEnv.DEFAULT_AI_PROVIDER = "anthropic";
      mockEnv.DEFAULT_AI_MODEL = "claude-haiku-4-5-20251001";
      mockEnv.MAX_GENERATION_WORKERS = "4";

      const res = await fetch(`${serverUrl}/api/settings/general`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.settings.ankiconnectUrl).toBe("http://remote-anki:8765");
      expect(data.sources.ankiconnectUrl).toBe("environment");
      expect(data.settings.defaultAiProvider).toBe("anthropic");
      expect(data.sources.defaultAiProvider).toBe("environment");
      expect(data.settings.defaultAiModel).toBe("claude-haiku-4-5-20251001");
      expect(data.settings.maxGenerationWorkers).toBe(4);
      expect(data.sources.maxGenerationWorkers).toBe("environment");
    });

    it("PUT /api/settings/general updates settings in SQLite and syncs concurrency limits", async () => {
      const updatePayload = {
        ankiconnectUrl: "http://custom-desktop:8765",
        ankiconnectApiKey: "secret-desktop-key-12345",
        ankiconnectTimeoutMs: 5000,
        defaultAiProvider: "gemini",
        defaultAiModel: "gemini-3.6-flash",
        defaultPersona: "analogy-builder",
        defaultDifficulty: "expert",
        defaultCardLimit: 10,
        defaultGroundingEnforced: false,
        maxGenerationWorkers: 5,
        maxSyncWorkers: 4,
        maxExportWorkers: 3,
        workerTimeoutMinutes: 30,
        defaultSlicingMode: "budget",
        defaultPageBudget: 20,
        epubDefaultAuthor: "Custom Author",
        epubDefaultPublisher: "Custom Publisher",
      };

      const res = await fetch(`${serverUrl}/api/settings/general`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatePayload),
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.settings.ankiconnectUrl).toBe("http://custom-desktop:8765");
      expect(data.sources.ankiconnectUrl).toBe("database");

      // API key is masked in response
      expect(data.settings.ankiconnectApiKey).toBe("sec...2345");
      expect(data.maskedApiKey).toBe("sec...2345");
      expect(data.sources.ankiconnectApiKey).toBe("database");

      expect(data.settings.defaultAiProvider).toBe("gemini");
      expect(data.settings.defaultAiModel).toBe("gemini-3.6-flash");
      expect(data.settings.defaultPersona).toBe("analogy-builder");
      expect(data.settings.defaultDifficulty).toBe("expert");
      expect(data.settings.defaultCardLimit).toBe(10);
      expect(data.settings.defaultGroundingEnforced).toBe(false);
      expect(data.settings.maxGenerationWorkers).toBe(5);
      expect(data.settings.workerTimeoutMinutes).toBe(30);

      // Verify server's settingsService has unmasked token
      expect(settingsService.getRawAnkiApiKey()).toBe("secret-desktop-key-12345");

      // Verify GET returns updated settings
      const getRes = await fetch(`${serverUrl}/api/settings/general`);
      const getData = await getRes.json();
      expect(getData.settings.ankiconnectUrl).toBe("http://custom-desktop:8765");
      expect(getData.settings.maxGenerationWorkers).toBe(5);
      expect(getData.settings.ankiconnectApiKey).toBe("sec...2345");
    });

    it("PUT /api/settings/general accepts workerTimeoutMinutes: 0 for infinite execution", async () => {
      const res = await fetch(`${serverUrl}/api/settings/general`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerTimeoutMinutes: 0 }),
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.settings.workerTimeoutMinutes).toBe(0);
      expect(data.sources.workerTimeoutMinutes).toBe("database");

      const getRes = await fetch(`${serverUrl}/api/settings/general`);
      const getData = await getRes.json();
      expect(getData.settings.workerTimeoutMinutes).toBe(0);
    });

    it("PUT /api/settings/general retains existing secret when receiving masked token", async () => {
      // First save secret
      await fetch(`${serverUrl}/api/settings/general`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ankiconnectApiKey: "original-secret-token-value" }),
      });
      expect(settingsService.getRawAnkiApiKey()).toBe("original-secret-token-value");

      // Verify GET returns masked token
      const getRes = await fetch(`${serverUrl}/api/settings/general`);
      const getData = await getRes.json();
      expect(getData.settings.ankiconnectApiKey).toBe("ori...alue");

      // Next send update echoing back the masked token from GET response
      const res = await fetch(`${serverUrl}/api/settings/general`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...getData.settings,
          defaultCardLimit: 8,
        }),
      });
      expect(res.status).toBe(200);
      expect(settingsService.getRawAnkiApiKey()).toBe("original-secret-token-value");

      // Also verify explicit '***' token
      const resAsterisks = await fetch(`${serverUrl}/api/settings/general`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ankiconnectApiKey: "***",
          defaultCardLimit: 9,
        }),
      });
      expect(resAsterisks.status).toBe(200);
      expect(settingsService.getRawAnkiApiKey()).toBe("original-secret-token-value");
    });

    it("POST /api/settings/anki/test pings endpoint and returns health result", async () => {
      const origFetch = global.fetch;
      try {
        global.fetch = vi.fn().mockImplementation(async (input: any) => {
          if (String(input).includes("/api/settings/anki/test")) {
            return origFetch(input);
          }
          return new Response(JSON.stringify({ result: 6, error: null }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        });

        const res = await origFetch(`${serverUrl}/api/settings/anki/test`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpointUrl: "http://127.0.0.1:8765" }),
        });
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.online).toBe(true);
        expect(data.version).toBe(6);
        expect(data.latencyMs).toBeDefined();
      } finally {
        global.fetch = origFetch;
      }
    });

    it("POST /api/settings/anki/test handles network errors gracefully", async () => {
      const origFetch = global.fetch;
      try {
        global.fetch = vi.fn().mockImplementation(async (input: any) => {
          if (String(input).includes("/api/settings/anki/test")) {
            return origFetch(input);
          }
          throw new Error("ECONNREFUSED 127.0.0.1:8765");
        });

        const res = await origFetch(`${serverUrl}/api/settings/anki/test`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpointUrl: "http://127.0.0.1:8765" }),
        });
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.online).toBe(false);
        expect(data.error).toContain("ECONNREFUSED");
      } finally {
        global.fetch = origFetch;
      }
    });
  });
});

