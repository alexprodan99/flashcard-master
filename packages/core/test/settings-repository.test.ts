import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabaseClient } from "../src/storage/db.js";
import { SqliteSettingsRepository } from "../src/storage/settings-repository.js";
import { SettingsService } from "../src/services/settings-service.js";
import type Database from "better-sqlite3";

describe("SqliteSettingsRepository & SettingsService", () => {
  let db: Database.Database;
  let repo: SqliteSettingsRepository;

  beforeEach(() => {
    db = createDatabaseClient({ inMemory: true });
    repo = new SqliteSettingsRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("SqliteSettingsRepository", () => {
    it("returns null for non-existent key", () => {
      expect(repo.get("non_existent")).toBeNull();
    });

    it("persists, updates, and retrieves a key", () => {
      repo.set("test_key", "value1");
      expect(repo.get("test_key")).toBe("value1");

      repo.set("test_key", "value2");
      expect(repo.get("test_key")).toBe("value2");
    });

    it("deletes a key correctly and reports status", () => {
      repo.set("delete_me", "temp");
      expect(repo.delete("delete_me")).toBe(true);
      expect(repo.get("delete_me")).toBeNull();
      expect(repo.delete("delete_me")).toBe(false);
    });

    it("lists all settings as a dictionary and Setting objects", () => {
      repo.set("k1", "v1");
      repo.set("k2", "v2");

      const dict = repo.list();
      expect(dict).toEqual({ k1: "v1", k2: "v2" });

      const all = repo.getAll();
      expect(all).toHaveLength(2);
      expect(all[0].key).toBe("k1");
      expect(all[0].value).toBe("v1");
      expect(all[0].updatedAt).toBeDefined();
    });
  });

  describe("SettingsService - Fallback, Precedence & Masking", () => {
    it("reports empty / unconfigured state when neither DB nor env is configured", () => {
      const service = new SettingsService(repo, {});
      const statuses = service.getAllKeyStatuses();

      expect(statuses.openai).toEqual({
        provider: "openai",
        isConfigured: false,
        maskedValue: "",
        source: "none",
        endpoint: null,
      });
      expect(statuses.notion.isConfigured).toBe(false);
      expect(statuses.ollama.isConfigured).toBe(false);
      expect(statuses.ollama.endpoint).toBe("http://localhost:11434");
    });

    it("falls back to environment variables when DB has no secret", () => {
      const mockEnv: NodeJS.ProcessEnv = {
        OPENAI_API_KEY: "sk-1234567890abcdef",
        NOTION_API_KEY: "secret_notiontoken1234",
      };
      const service = new SettingsService(repo, mockEnv);

      expect(service.getSecret("openai")).toBe("sk-1234567890abcdef");
      expect(service.getSecret("notion")).toBe("secret_notiontoken1234");

      const statuses = service.getAllKeyStatuses();
      expect(statuses.openai.isConfigured).toBe(true);
      expect(statuses.openai.source).toBe("environment");
      expect(statuses.openai.maskedValue).toBe("sk-...cdef");

      expect(statuses.notion.isConfigured).toBe(true);
      expect(statuses.notion.source).toBe("environment");
      expect(statuses.notion.maskedValue).toBe("sec...1234");
    });

    it("prioritizes DB secret over environment variable", () => {
      const mockEnv: NodeJS.ProcessEnv = {
        OPENAI_API_KEY: "sk-envfallback1111",
      };
      const service = new SettingsService(repo, mockEnv);

      // Save secret in DB
      service.setProviderSecret("openai", "sk-dbsecret9999");

      expect(service.getSecret("openai")).toBe("sk-dbsecret9999");

      const status = service.getKeyStatus("openai");
      expect(status.isConfigured).toBe(true);
      expect(status.source).toBe("database");
      expect(status.maskedValue).toBe("sk-...9999");
    });

    it("retrieves single setting with metadata via getWithMetadata", () => {
      repo.set("single_key", "meta_val");
      const meta = repo.getWithMetadata("single_key");
      expect(meta).not.toBeNull();
      expect(meta?.key).toBe("single_key");
      expect(meta?.value).toBe("meta_val");
      expect(meta?.updatedAt).toBeDefined();

      expect(repo.getWithMetadata("non_existent")).toBeNull();
    });

    it("masks secrets safely according to length boundaries", () => {
      const service = new SettingsService(repo, {});

      // Short key <= 10
      expect(service.maskSecret("short")).toBe("****");
      expect(service.maskSecret("12345678")).toBe("****");
      expect(service.maskSecret("1234567890")).toBe("****");

      // Long key > 10
      expect(service.maskSecret("12345678901")).toBe("123...8901");
      expect(service.maskSecret("sk-proj-abc1234xyz")).toBe("sk-...4xyz");
      expect(service.maskSecret("")).toBe("");
    });

    it("clears setting when secret or endpoint is null", () => {
      const service = new SettingsService(repo, {});
      service.setProviderSecret("openai", "sk-test-key", "https://api.openai.com");
      expect(service.getSecret("openai")).toBe("sk-test-key");
      expect(service.getEndpoint("openai")).toBe("https://api.openai.com");

      // Pass null to clear key
      service.setProviderSecret("openai", null, undefined);
      expect(service.getSecret("openai")).toBeNull();
      expect(service.getEndpoint("openai")).toBe("https://api.openai.com");

      // Pass null to clear endpoint
      service.setProviderSecret("openai", undefined, null);
      expect(service.getEndpoint("openai")).toBeNull();
    });

    it("lists all provider statuses as an array and includes updatedAt for DB keys", () => {
      const service = new SettingsService(repo, {});
      service.setProviderSecret("openai", "sk-test-openai-key-long");
      const list = service.listProviderStatuses();
      expect(Array.isArray(list)).toBe(true);
      expect(list).toHaveLength(5);
      const providers = list.map((p) => p.provider);
      expect(providers).toEqual(["openai", "anthropic", "gemini", "ollama", "notion"]);

      const openaiStatus = list.find((p) => p.provider === "openai");
      expect(openaiStatus?.updatedAt).toBeDefined();
    });

    it("supports setting, updating, and deleting provider secret and endpoint", () => {
      const mockEnv: NodeJS.ProcessEnv = {
        ANTHROPIC_API_KEY: "sk-ant-envkey",
      };
      const service = new SettingsService(repo, mockEnv);

      // Set DB secret & endpoint
      service.setProviderSecret("anthropic", "  sk-ant-dbcustomkey  ", "  https://custom.anthropic.api  ");
      expect(service.getSecret("anthropic")).toBe("sk-ant-dbcustomkey");
      expect(service.getEndpoint("anthropic")).toBe("https://custom.anthropic.api");

      let status = service.getKeyStatus("anthropic");
      expect(status.isConfigured).toBe(true);
      expect(status.source).toBe("database");
      expect(status.endpoint).toBe("https://custom.anthropic.api");

      // Delete from DB -> falls back to env
      service.deleteProviderSecret("anthropic");
      expect(service.getSecret("anthropic")).toBe("sk-ant-envkey");

      status = service.getKeyStatus("anthropic");
      expect(status.isConfigured).toBe(true);
      expect(status.source).toBe("environment");
    });

    it("handles Ollama custom endpoint and fallback", () => {
      const mockEnv: NodeJS.ProcessEnv = {
        OLLAMA_HOST: "http://ollama-remote:11434",
      };
      const service = new SettingsService(repo, mockEnv);

      expect(service.getEndpoint("ollama")).toBe("http://ollama-remote:11434");
      expect(service.getKeyStatus("ollama").source).toBe("environment");

      service.setProviderSecret("ollama", undefined, "http://localhost:11435");
      expect(service.getEndpoint("ollama")).toBe("http://localhost:11435");
      expect(service.getKeyStatus("ollama").source).toBe("database");

      service.deleteProviderSecret("ollama");
      expect(service.getEndpoint("ollama")).toBe("http://ollama-remote:11434");
    });
  });

  describe("SettingsService - General Settings (3-Tier Fallback & Studio Defaults)", () => {
    it("returns pristine defaults and source='default' when DB and env are empty", () => {
      const service = new SettingsService(repo, {});
      const res = service.getGeneralSettings();

      expect(res.settings.ankiconnectUrl).toBe("http://127.0.0.1:8765");
      expect(res.settings.ankiconnectApiKey).toBe("");
      expect(res.settings.ankiconnectTimeoutMs).toBe(3000);
      expect(res.settings.defaultAiProvider).toBe("ollama");
      expect(res.settings.defaultAiModel).toBe("phi4-mini");
      expect(res.settings.defaultPersona).toBe("socratic-mentor");
      expect(res.settings.defaultDifficulty).toBe("intermediate");
      expect(res.settings.defaultCardLimit).toBe(5);
      expect(res.settings.defaultGroundingEnforced).toBe(true);
      expect(res.settings.maxGenerationWorkers).toBe(2);
      expect(res.settings.maxSyncWorkers).toBe(2);
      expect(res.settings.maxExportWorkers).toBe(2);
      expect(res.settings.workerTimeoutMinutes).toBe(15);
      expect(res.settings.defaultSlicingMode).toBe("outline");
      expect(res.settings.defaultPageBudget).toBe(10);
      expect(res.settings.epubDefaultAuthor).toBe("Flashcard Master");
      expect(res.settings.epubDefaultPublisher).toBe("Flashcard Master Studio");

      // Verify all sources are 'default'
      for (const [key, source] of Object.entries(res.sources)) {
        expect(source).toBe("default");
      }
    });

    it("respects environment variables when not set in DB", () => {
      const mockEnv: NodeJS.ProcessEnv = {
        ANKI_CONNECT_URL: "http://192.168.1.100:8765",
        ANKI_CONNECT_API_KEY: "secret_anki_password",
        ANKI_CONNECT_TIMEOUT_MS: "5000",
        DEFAULT_AI_PROVIDER: "openai",
        DEFAULT_AI_MODEL: "gpt-4o-mini",
        MAX_GENERATION_WORKERS: "4",
        WORKER_TIMEOUT_MINUTES: "30",
        DEFAULT_SLICING_MODE: "budget",
        DEFAULT_PAGE_BUDGET: "25",
        EPUB_DEFAULT_AUTHOR: "Custom Author",
      };
      const service = new SettingsService(repo, mockEnv);
      const res = service.getGeneralSettings();

      expect(res.settings.ankiconnectUrl).toBe("http://192.168.1.100:8765");
      expect(res.sources.ankiconnectUrl).toBe("environment");

      expect(res.settings.ankiconnectApiKey).toBe("sec...word");
      expect(res.maskedApiKey).toBe("sec...word");
      expect(res.sources.ankiconnectApiKey).toBe("environment");

      expect(res.settings.ankiconnectTimeoutMs).toBe(5000);
      expect(res.sources.ankiconnectTimeoutMs).toBe("environment");

      expect(res.settings.defaultAiProvider).toBe("openai");
      expect(res.sources.defaultAiProvider).toBe("environment");

      expect(res.settings.defaultAiModel).toBe("gpt-4o-mini");
      expect(res.sources.defaultAiModel).toBe("environment");

      expect(res.settings.maxGenerationWorkers).toBe(4);
      expect(res.sources.maxGenerationWorkers).toBe("environment");

      expect(res.settings.workerTimeoutMinutes).toBe(30);
      expect(res.sources.workerTimeoutMinutes).toBe("environment");

      expect(res.settings.defaultSlicingMode).toBe("budget");
      expect(res.sources.defaultSlicingMode).toBe("environment");

      expect(res.settings.defaultPageBudget).toBe(25);
      expect(res.sources.defaultPageBudget).toBe("environment");

      expect(res.settings.epubDefaultAuthor).toBe("Custom Author");
      expect(res.sources.epubDefaultAuthor).toBe("environment");

      // Unset env vars remain 'default'
      expect(res.sources.maxSyncWorkers).toBe("default");
    });

    it("prioritizes SQLite settings over environment variables and defaults", () => {
      const mockEnv: NodeJS.ProcessEnv = {
        ANKI_CONNECT_URL: "http://env-host:8765",
        DEFAULT_AI_PROVIDER: "gemini",
      };
      const service = new SettingsService(repo, mockEnv);

      // Save to SQLite
      service.updateGeneralSettings({
        ankiconnectUrl: "http://sqlite-host:8765",
        defaultAiProvider: "anthropic",
        defaultAiModel: "claude-3-5-sonnet",
        maxGenerationWorkers: 6,
      });

      const res = service.getGeneralSettings();
      expect(res.settings.ankiconnectUrl).toBe("http://sqlite-host:8765");
      expect(res.sources.ankiconnectUrl).toBe("database");

      expect(res.settings.defaultAiProvider).toBe("anthropic");
      expect(res.sources.defaultAiProvider).toBe("database");

      expect(res.settings.defaultAiModel).toBe("claude-3-5-sonnet");
      expect(res.sources.defaultAiModel).toBe("database");

      expect(res.settings.maxGenerationWorkers).toBe(6);
      expect(res.sources.maxGenerationWorkers).toBe("database");
    });

    it("protects and masks sensitive AnkiConnect API keys", () => {
      const service = new SettingsService(repo, {});

      // Set key
      service.updateGeneralSettings({
        ankiconnectApiKey: "my-super-secret-anki-token-12345",
      });

      const res = service.getGeneralSettings();
      expect(res.settings.ankiconnectApiKey).toBe("my-...2345");
      expect(res.maskedApiKey).toBe("my-...2345");

      // Unmasked key can be retrieved via helper
      expect(service.getRawAnkiApiKey()).toBe("my-super-secret-anki-token-12345");

      // If client sends back masked key or starts with ***, existing key is retained
      service.updateGeneralSettings({
        ankiconnectApiKey: "***",
        ankiconnectUrl: "http://localhost:8765",
      });
      expect(service.getRawAnkiApiKey()).toBe("my-super-secret-anki-token-12345");

      // Clearing key with empty string
      service.updateGeneralSettings({
        ankiconnectApiKey: "",
      });
      expect(service.getRawAnkiApiKey()).toBeUndefined();
      expect(service.getGeneralSettings().settings.ankiconnectApiKey).toBe("");
    });

    it("provides convenience options and domain helpers", () => {
      const service = new SettingsService(repo, {});
      service.updateGeneralSettings({
        ankiconnectUrl: "http://custom-anki:8765",
        ankiconnectApiKey: "secret-key",
        ankiconnectTimeoutMs: 4000,
        maxGenerationWorkers: 4,
        maxSyncWorkers: 3,
        maxExportWorkers: 5,
        workerTimeoutMinutes: 20,
        defaultAiProvider: "anthropic",
        defaultAiModel: "claude-haiku",
        defaultPersona: "analogy-builder",
        defaultDifficulty: "expert",
        defaultCardLimit: 12,
        defaultGroundingEnforced: false,
        defaultSlicingMode: "budget",
        defaultPageBudget: 15,
        epubDefaultAuthor: "Author X",
        epubDefaultPublisher: "Publisher Y",
      });

      expect(service.getAnkiConnectOptions()).toEqual({
        endpointUrl: "http://custom-anki:8765",
        apiKey: "secret-key",
        timeoutMs: 4000,
      });

      expect(service.getWorkerConcurrencyLimits()).toEqual({
        maxGenerationWorkers: 4,
        maxSyncWorkers: 3,
        maxExportWorkers: 5,
        workerTimeoutMinutes: 20,
      });

      expect(service.getAiDefaults()).toEqual({
        provider: "anthropic",
        model: "claude-haiku",
        persona: "analogy-builder",
        difficulty: "expert",
        cardLimit: 12,
        groundingEnforced: false,
      });

      expect(service.getSlicingDefaults()).toEqual({
        mode: "budget",
        pageBudget: 15,
      });

      expect(service.getEpubDefaults()).toEqual({
        author: "Author X",
        publisher: "Publisher Y",
      });
    });

    it("retrieves individual settings values using get(key) with registry and environment resolution", () => {
      const service = new SettingsService(repo, {
        CUSTOM_ENV_KEY: "from-env",
      });

      // Default value
      expect(service.get("epub_default_author")).toBe("Flashcard Master");

      // After updating DB
      service.updateGeneralSettings({ epubDefaultAuthor: "Turing" });
      expect(service.get("epub_default_author")).toBe("Turing");

      // From environment
      expect(service.get("custom_env_key")).toBe("from-env");

      // Non-existent key
      expect(service.get("totally_unknown_key")).toBeNull();
    });
  });
});

