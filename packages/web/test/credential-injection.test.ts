import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  createDatabaseClient,
  DataSourceRepository,
  SyncStateRepository,
  FlashcardRepository,
  DocumentRepository,
  SqliteSettingsRepository,
  SettingsService,
  JobRepository,
} from "@flashcard-master/core";
import { createWebServer, WebServer } from "../src/server.js";
import { WorkerExecutor } from "../src/workers/worker-executor.js";
import type Database from "better-sqlite3";

describe("Automatic Credential Injection (Story 15.4)", () => {
  let db: Database.Database;
  let sourceRepo: DataSourceRepository;
  let syncRepo: SyncStateRepository;
  let cardRepo: FlashcardRepository;
  let docRepo: DocumentRepository;
  let settingsRepo: SqliteSettingsRepository;
  let settingsService: SettingsService;
  let mockEnv: NodeJS.ProcessEnv;
  let server: WebServer;
  let serverUrl: string;
  let capturedLLMConfigs: any[];
  let mockWorkerExecutor: any;
  let createdSourceId: string;

  beforeEach(async () => {
    mockEnv = {};
    capturedLLMConfigs = [];

    db = createDatabaseClient({ inMemory: true });
    sourceRepo = new DataSourceRepository(db);
    syncRepo = new SyncStateRepository(db);
    cardRepo = new FlashcardRepository(db);
    docRepo = new DocumentRepository(db);
    settingsRepo = new SqliteSettingsRepository(db);
    settingsService = new SettingsService(settingsRepo, mockEnv);

    // Create a mock source and document to generate from
    const src = sourceRepo.create({
      name: "Test Source",
      type: "rss",
      uri: "https://example.com/feed.xml",
      targetDeck: "Engineering",
      tags: ["tech"],
    });
    createdSourceId = src.id;

    docRepo.upsert({
      sourceId: createdSourceId,
      title: "Test Ingested Article",
      url: "https://example.com/article-1",
      textContent: "SQLite write-ahead logging improves concurrency significantly.",
      wordCount: 7,
    });

    const mockLLM = {
      generateQAPairs: vi.fn().mockResolvedValue([
        {
          question: "How does WAL improve concurrency in SQLite?",
          answer: "By allowing concurrent readers while a writer commits.",
          sourceQuote: "SQLite write-ahead logging improves concurrency significantly.",
        },
      ]),
    };

    mockWorkerExecutor = {
      executeTask: vi.fn().mockImplementation(async (task) => {
        return { success: true, cardsCreated: 1, duplicatesSkipped: 0, newCards: [] };
      }),
    };

    server = createWebServer({
      sourceRepo,
      syncRepo,
      cardRepo,
      documentRepo: docRepo,
      settingsRepo,
      settingsService,
      createLLMAdapterFn: (config) => {
        capturedLLMConfigs.push(config);
        return mockLLM;
      },
    });

    const info = await server.listen(0);
    serverUrl = info.url;
  });

  afterEach(async () => {
    if (server) await server.close();
    if (db) db.close();
  });

  it("automatically injects database-persisted API key when omitted from request", async () => {
    // Save OpenAI key in SQLite settings repository
    settingsService.setProviderSecret("openai", "sk-db-saved-openai-key-9999");

    const res = await fetch(`${serverUrl}/api/generate?sync=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "openai",
        model: "gpt-4o-mini",
        sourceIds: [createdSourceId],
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    expect(capturedLLMConfigs).toHaveLength(1);
    expect(capturedLLMConfigs[0].provider).toBe("openai");
    expect(capturedLLMConfigs[0].apiKey).toBe("sk-db-saved-openai-key-9999");
  });

  it("falls back to environment variable when omitted from request and not in DB", async () => {
    mockEnv.ANTHROPIC_API_KEY = "sk-ant-env-fallback-key-7777";

    const res = await fetch(`${serverUrl}/api/generate?sync=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        sourceIds: [createdSourceId],
      }),
    });

    expect(res.status).toBe(200);
    expect(capturedLLMConfigs).toHaveLength(1);
    expect(capturedLLMConfigs[0].provider).toBe("anthropic");
    expect(capturedLLMConfigs[0].apiKey).toBe("sk-ant-env-fallback-key-7777");
  });

  it("prioritizes manual request body key over database and environment keys", async () => {
    mockEnv.OPENAI_API_KEY = "sk-env-key-lowest-priority";
    settingsService.setProviderSecret("openai", "sk-db-key-medium-priority");

    const res = await fetch(`${serverUrl}/api/generate?sync=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "openai",
        apiKey: "sk-manual-override-highest-priority",
        sourceIds: [createdSourceId],
      }),
    });

    expect(res.status).toBe(200);
    expect(capturedLLMConfigs).toHaveLength(1);
    expect(capturedLLMConfigs[0].apiKey).toBe("sk-manual-override-highest-priority");
  });

  it("automatically injects stored endpoint override when omitted from body", async () => {
    settingsService.setProviderSecret("ollama", null, "http://my-gpu-rig:11434");

    const res = await fetch(`${serverUrl}/api/generate?sync=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "ollama",
        model: "llama3.2",
        sourceIds: [createdSourceId],
      }),
    });

    expect(res.status).toBe(200);
    expect(capturedLLMConfigs).toHaveLength(1);
    expect(capturedLLMConfigs[0].baseUrl).toBe("http://my-gpu-rig:11434");
  });

  it("prioritizes manual endpoint override in body over stored endpoint", async () => {
    settingsService.setProviderSecret("ollama", null, "http://my-gpu-rig:11434");

    const res = await fetch(`${serverUrl}/api/generate?sync=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "ollama",
        endpoint: "http://localhost:11434",
        sourceIds: [createdSourceId],
      }),
    });

    expect(res.status).toBe(200);
    expect(capturedLLMConfigs).toHaveLength(1);
    expect(capturedLLMConfigs[0].baseUrl).toBe("http://localhost:11434");
  });

  it("rejects cloud provider with 400 when no API key is configured or provided", async () => {
    const res = await fetch(`${serverUrl}/api/generate?sync=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "gemini",
        model: "gemini-1.5-flash",
        sourceIds: [createdSourceId],
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("No API key configured for gemini");
    expect(data.error).toContain("Settings");
    expect(capturedLLMConfigs).toHaveLength(0);
  });

  it("rejects remote OpenAI with 400 when no API key is configured or provided", async () => {
    const res = await fetch(`${serverUrl}/api/generate?sync=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "openai",
        model: "gpt-4o-mini",
        sourceIds: [createdSourceId],
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("No API key configured for openai");
    expect(data.error).toContain("Settings");
    expect(capturedLLMConfigs).toHaveLength(0);
  });

  it("rejects Anthropic with 400 when no API key is configured or provided", async () => {
    const res = await fetch(`${serverUrl}/api/generate?sync=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        sourceIds: [createdSourceId],
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("No API key configured for anthropic");
    expect(data.error).toContain("Settings");
    expect(capturedLLMConfigs).toHaveLength(0);
  });

  it("permits keyless generation for local OpenAI proxy endpoints", async () => {
    const res = await fetch(`${serverUrl}/api/generate?sync=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "openai",
        model: "local-model",
        endpoint: "http://localhost:8080/v1",
        sourceIds: [createdSourceId],
      }),
    });

    expect(res.status).toBe(200);
    expect(capturedLLMConfigs).toHaveLength(1);
    expect(capturedLLMConfigs[0].provider).toBe("openai");
    expect(capturedLLMConfigs[0].apiKey).toBeUndefined();
    expect(capturedLLMConfigs[0].baseUrl).toBe("http://localhost:8080/v1");
  });

  it("resolves and injects stored secret into background worker task payload", async () => {
    settingsService.setProviderSecret("gemini", "AIzaSy-stored-gemini-secret");

    // Initialize WebServer with JobManager and mockWorkerExecutor
    const jobManagerServer = createWebServer({
      sourceRepo,
      syncRepo,
      cardRepo,
      documentRepo: docRepo,
      jobRepo: new JobRepository(db),
      settingsRepo,
      settingsService,
      workerExecutor: mockWorkerExecutor,
    });

    const jmInfo = await jobManagerServer.listen(0);

    try {
      const res = await fetch(`${jmInfo.url}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "gemini",
          model: "gemini-1.5-flash",
          sourceIds: [createdSourceId],
        }),
      });

      expect(res.status).toBe(202);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.jobId).toBeDefined();

      // Wait a tick for the workerExecutor task to be invoked
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockWorkerExecutor.executeTask).toHaveBeenCalledTimes(1);
      const taskArg = mockWorkerExecutor.executeTask.mock.calls[0][0];
      expect(taskArg.type).toBe("generation");
      expect(taskArg.payload.provider).toBe("gemini");
      expect(taskArg.payload.apiKey).toBe("AIzaSy-stored-gemini-secret");
    } finally {
      await jobManagerServer.close();
    }
  });

  it("enforces missing credential rejection inside real task-worker implementation", async () => {
    const compiledWorker = path.resolve(__dirname, "../dist/workers/task-worker.js");
    if (!fs.existsSync(compiledWorker)) {
      return;
    }

    const executor = new WorkerExecutor({
      workerScriptPath: compiledWorker,
    });

    const mockCtx: any = {
      jobId: "gen-job-val-1",
      signal: new AbortController().signal,
      updateProgress: () => {},
      log: () => {},
      setResultSummary: () => {},
    };

    await expect(
      executor.executeTask(
        {
          type: "generation",
          payload: {
            documents: [],
            provider: "gemini",
            model: "gemini-1.5-flash",
          },
        },
        mockCtx
      )
    ).rejects.toThrow("No API key provided for gemini");
  });
});
