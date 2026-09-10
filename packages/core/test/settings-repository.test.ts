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
});