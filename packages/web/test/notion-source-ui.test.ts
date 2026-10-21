import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SourcesStore } from '../client/src/stores/sourcesStore.svelte.js';
import { SettingsStore } from '../client/src/stores/settingsStore.svelte.js';
import {
  buildNotionUri,
  parseNotionUri,
  isValidNotionInput,
} from '../client/src/lib/notion-uri.js';
import type { DataSource } from '../client/src/lib/types.js';
import { createWebServer, type WebServer } from '../src/server.js';
import {
  DataSourceRepository,
  SyncStateRepository,
  FlashcardRepository,
  DocumentRepository,
  JobRepository,
  SqliteSettingsRepository,
  SettingsService,
  StrategyRegistry,
  IngestionService,
  createDatabaseClient,
} from '@flashcard-master/core';
import { NotionStrategy } from '@flashcard-master/adapters';

describe('Interactive Notion Source UI & End-to-End Workflows (Story 15.6)', () => {
  describe('Notion URI Helper & Validation Engine (notion-uri.ts)', () => {
    it('validates Notion URLs and IDs with isValidNotionInput', () => {
      // Valid URLs
      expect(isValidNotionInput('https://www.notion.so/workspace/Page-Title-2b13c749e7b243468be1f60572dc1404')).toBe(true);
      expect(isValidNotionInput('https://notion.so/2b13c749e7b243468be1f60572dc1404')).toBe(true);
      expect(isValidNotionInput('https://workspace.notion.site/Page-Title-2b13c749e7b243468be1f60572dc1404')).toBe(true);
      expect(isValidNotionInput('https://app.notion.com/p/AI-Notes-23ee54f4007c80de87b1fd9e0be45824')).toBe(true);
      expect(isValidNotionInput('https://notion.so/workspace/database-id?v=9a8b7c6d5e4f')).toBe(true);
      expect(isValidNotionInput('https://notion.so/workspace/view?p=2b13c749e7b243468be1f60572dc1404')).toBe(true);

      // Valid raw hex and UUID
      expect(isValidNotionInput('2b13c749e7b243468be1f60572dc1404')).toBe(true);
      expect(isValidNotionInput('2b13c749-e7b2-4346-8be1-f60572dc1404')).toBe(true);

      // Invalid inputs
      expect(isValidNotionInput('')).toBe(false);
      expect(isValidNotionInput('   ')).toBe(false);
      expect(isValidNotionInput('https://google.com')).toBe(false);
      expect(isValidNotionInput('https://github.com/my-repo')).toBe(false);
      expect(isValidNotionInput('random-text-string')).toBe(false);
    });

    it('formulates URI with ?recursive=true on clean URL', () => {
      const url = 'https://www.notion.so/workspace/My-Study-Notes-2b13c749e7b243468be1f60572dc1404';
      const result = buildNotionUri(url, { recursive: true });
      expect(result).toBe('https://www.notion.so/workspace/My-Study-Notes-2b13c749e7b243468be1f60572dc1404?recursive=true');
    });

    it('formulates URI with &recursive=true when URL already contains query parameters', () => {
      const url = 'https://www.notion.so/workspace/view?v=9a8b7c6d5e4f';
      const result = buildNotionUri(url, { recursive: true });
      expect(result).toBe('https://www.notion.so/workspace/view?v=9a8b7c6d5e4f&recursive=true');
    });

    it('handles hash fragments properly by inserting query parameters before hash', () => {
      const url = 'https://www.notion.so/workspace/Page-Title-2b13c749e7b243468be1f60572dc1404#section-2';
      const result = buildNotionUri(url, { recursive: true });
      expect(result).toBe('https://www.notion.so/workspace/Page-Title-2b13c749e7b243468be1f60572dc1404?recursive=true#section-2');
    });

    it('normalizes bare 32-hex string to canonical Notion URL with recursion parameter', () => {
      const rawHex = '2b13c749e7b243468be1f60572dc1404';
      const result = buildNotionUri(rawHex, { recursive: true });
      expect(result).toBe('https://www.notion.so/2b13c749e7b243468be1f60572dc1404?recursive=true');
    });

    it('normalizes bare hyphenated UUID to canonical Notion URL without recursion parameter', () => {
      const uuid = '2b13c749-e7b2-4346-8be1-f60572dc1404';
      const result = buildNotionUri(uuid, { recursive: false });
      expect(result).toBe('https://www.notion.so/2b13c749e7b243468be1f60572dc1404');
    });

    it('removes recursive parameter cleanly when recursive is false', () => {
      const urlWithRecursive = 'https://www.notion.so/workspace/Page?recursive=true';
      const result = buildNotionUri(urlWithRecursive, { recursive: false });
      expect(result).toBe('https://www.notion.so/workspace/Page');
    });

    it('cleans recursive parameter without corrupting query string when it is first of multiple parameters', () => {
      const complexUrl = 'https://www.notion.so/workspace/view?recursive=true&v=123&sort=asc';
      const parsed = parseNotionUri(complexUrl);
      expect(parsed.isRecursive).toBe(true);
      expect(parsed.cleanUri).toBe('https://www.notion.so/workspace/view?v=123&sort=asc');

      // Now build without recursion from parsed cleanUri
      const reconstructed = buildNotionUri(parsed.cleanUri, { recursive: false });
      expect(reconstructed).toBe('https://www.notion.so/workspace/view?v=123&sort=asc');
    });

    it('extracts recursion status when preserved in tags array', () => {
      const storedUri = 'https://www.notion.so/workspace/Page-32hex';
      const tags = ['architecture', 'recursive', 'notion'];
      const parsed = parseNotionUri(storedUri, tags);

      expect(parsed.isRecursive).toBe(true);
      expect(parsed.cleanUri).toBe('https://www.notion.so/workspace/Page-32hex');
    });
  });

  describe('SourcesStore with Notion Data Sources', () => {
    it('adds and updates Notion sources in the reactive store', () => {
      const store = new SourcesStore();
      const notionSource: DataSource = {
        id: 'notion-src-1',
        name: 'Distributed Systems Wiki',
        type: 'notion',
        uri: 'https://notion.so/wiki/distributed-systems-112233445566778899aabbccddeeff00?recursive=true',
        tags: ['distributed', 'systems'],
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.setSources([notionSource]);
      expect(store.sources.length).toBe(1);
      expect(store.sources[0].type).toBe('notion');
      expect(store.sources[0].name).toBe('Distributed Systems Wiki');

      // Update source
      const updated: DataSource = {
        ...notionSource,
        name: 'Distributed Systems Architecture',
      };
      store.updateSource(updated);
      expect(store.sources[0].name).toBe('Distributed Systems Architecture');

      // Set syncing state
      store.setSyncing(notionSource.id, true, 'job-notion-sync-1');
      expect(store.syncingSourceIds[notionSource.id]).toBe(true);
      expect(store.activeSyncJobIds[notionSource.id]).toBe('job-notion-sync-1');

      store.setSyncing(notionSource.id, false);
      expect(store.syncingSourceIds[notionSource.id]).toBe(false);
    });
  });

  describe('SettingsStore Notion Readiness Indicator', () => {
    let localStorageMock: Record<string, string> = {};

    beforeEach(() => {
      localStorageMock = {};
      vi.stubGlobal('localStorage', {
        getItem: (k: string) => localStorageMock[k] || null,
        setItem: (k: string, v: string) => {
          localStorageMock[k] = v;
        },
        removeItem: (k: string) => {
          delete localStorageMock[k];
        },
        clear: () => {
          localStorageMock = {};
        },
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('initializes with Notion provider unconfigured by default', () => {
      const store = new SettingsStore();
      expect(store.keys.notion).toBeDefined();
      expect(store.keys.notion.provider).toBe('notion');
      expect(store.keys.notion.isConfigured).toBe(false);
      expect(store.keys.notion.maskedValue).toBe('');
    });

    it('reflects active token status when Notion secret is loaded from server', async () => {
      const store = new SettingsStore();

      // Mock fetchSettingsKeys API
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          keys: {
            notion: {
              provider: 'notion',
              isConfigured: true,
              maskedValue: 'secret_...a1b2',
              source: 'database',
              endpoint: null,
            },
          },
        }),
      }));

      await store.loadKeys();

      expect(store.keys.notion.isConfigured).toBe(true);
      expect(store.keys.notion.maskedValue).toBe('secret_...a1b2');
      expect(store.keys.notion.source).toBe('database');
    });
  });

  describe('WebServer REST API Integration for Notion Sources', () => {
    let server: WebServer;
    let baseUrl: string;
    let db: any;
    let sourceRepo: DataSourceRepository;
    let settingsRepo: SqliteSettingsRepository;
    let settingsService: SettingsService;
    let strategyRegistry: StrategyRegistry;

    beforeEach(async () => {
      db = createDatabaseClient({ inMemory: true });
      sourceRepo = new DataSourceRepository(db);
      const syncRepo = new SyncStateRepository(db);
      const cardRepo = new FlashcardRepository(db);
      const docRepo = new DocumentRepository(db);
      const jobRepo = new JobRepository(db);
      settingsRepo = new SqliteSettingsRepository(db);
      settingsService = new SettingsService(settingsRepo);

      strategyRegistry = new StrategyRegistry();
      strategyRegistry.register(new NotionStrategy({ settingsService }));

      const ingestionService = new IngestionService(sourceRepo, syncRepo, strategyRegistry, docRepo);

      server = createWebServer({
        port: 0,
        sourceRepo,
        syncRepo,
        cardRepo,
        documentRepo: docRepo,
        jobRepo,
        ingestionService,
        strategyRegistry,
        settingsService,
        settingsRepo,
      });

      const info = await server.listen();
      baseUrl = info.url;
    });

    afterEach(async () => {
      if (server) {
        await server.close();
      }
    });

    it('creates a Notion data source with recursive option and lists it via API', async () => {
      const createRes = await fetch(`${baseUrl}/api/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Notion Course Notes',
          type: 'notion',
          uri: 'https://www.notion.so/workspace/Course-Notes-112233445566778899aabbccddeeff00?recursive=true',
          targetDeck: 'Computer Science',
          tags: ['cs', 'notion'],
        }),
      });

      expect(createRes.status).toBe(201);
      const created = await createRes.json();
      expect(created.id).toBeDefined();
      expect(created.type).toBe('notion');
      expect(created.name).toBe('Notion Course Notes');
      expect(created.uri).toContain('recursive=true');
      expect((created as any).targetDeck).toBeUndefined();

      // Verify list endpoint includes the new Notion source
      const listRes = await fetch(`${baseUrl}/api/sources`);
      expect(listRes.status).toBe(200);
      const sources = await listRes.json();
      expect(sources).toHaveLength(1);
      expect(sources[0].type).toBe('notion');
      expect(sources[0].id).toBe(created.id);
    });

    it('updates an existing Notion source tags via PUT /api/sources/:id', async () => {
      const created = sourceRepo.create({
        name: 'Initial Notion Wiki',
        type: 'notion',
        uri: 'https://www.notion.so/workspace/Wiki-112233445566778899aabbccddeeff00',
        tags: ['wiki'],
      });

      const updateRes = await fetch(`${baseUrl}/api/sources/${created.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Updated Notion Knowledge Base',
          uri: 'https://www.notion.so/workspace/Wiki-112233445566778899aabbccddeeff00?recursive=true',
          tags: ['wiki', 'recursive'],
        }),
      });

      expect(updateRes.status).toBe(200);
      const updated = await updateRes.json();
      expect(updated.name).toBe('Updated Notion Knowledge Base');
      expect(updated.uri).toContain('recursive=true');
      expect((updated as any).targetDeck).toBeUndefined();
      expect(updated.tags).toContain('recursive');
    });

    it('deletes a Notion source cleanly via DELETE /api/sources/:id', async () => {
      const created = sourceRepo.create({
        name: 'To Delete Notion',
        type: 'notion',
        uri: 'https://www.notion.so/workspace/Temp-112233445566778899aabbccddeeff00',
      });

      const deleteRes = await fetch(`${baseUrl}/api/sources/${created.id}`, {
        method: 'DELETE',
      });
      expect(deleteRes.status).toBe(200);

      const remaining = sourceRepo.list();
      expect(remaining).toHaveLength(0);
    });
  });
});
