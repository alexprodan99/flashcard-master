import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GenerateStore, generateStore } from '../client/src/stores/generateStore.svelte.js';
import { SourcesStore, sourcesStore } from '../client/src/stores/sourcesStore.svelte.js';
import { ExplorerStore } from '../client/src/stores/explorerStore.svelte.js';
import { ExportStore } from '../client/src/stores/exportStore.svelte.js';
import { TaskStore } from '../client/src/stores/taskStore.svelte.js';
import { SettingsStore, settingsStore } from '../client/src/stores/settingsStore.svelte.js';
import type { DataSource, Flashcard, GenerationResult, Job } from '../client/src/lib/types.js';

describe('Svelte 5 Universal Client Stores (Epic 14.4)', () => {
  let localStorageMock: Record<string, string> = {};

  beforeEach(() => {
    localStorageMock = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => localStorageMock[key] || null,
      setItem: (key: string, value: string) => {
        localStorageMock[key] = value;
      },
      removeItem: (key: string) => {
        delete localStorageMock[key];
      },
      clear: () => {
        localStorageMock = {};
      },
    });
    vi.stubGlobal('window', {
      location: { search: '' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  describe('GenerateStore', () => {
    it('initializes with sensible defaults and persists changes to localStorage', () => {
      const store = new GenerateStore();
      expect(store.provider).toBe('ollama');
      expect(store.model).toBe('phi4-mini');
      expect(store.persona).toBe('socratic-mentor');
      expect(store.difficulty).toBe('intermediate');

      store.setProvider('openai');
      expect(store.provider).toBe('openai');
      expect(store.model).toBe('gpt-4o-mini');

      // Check localStorage retention
      const savedRaw = localStorageMock['fc_generation_settings'];
      expect(savedRaw).toBeDefined();
      const parsed = JSON.parse(savedRaw);
      expect(parsed.provider).toBe('openai');
      expect(parsed.model).toBe('gpt-4o-mini');
    });

    it('manages document and source scope selections correctly', () => {
      const store = new GenerateStore();

      store.selectAllDocsForSource('src-1', ['doc-a', 'doc-b']);
      expect(store.selectedSourceIds).toContain('src-1');
      expect(store.selectedDocIds['doc-a']).toBe(true);
      expect(store.selectedDocIds['doc-b']).toBe(true);

      store.toggleDoc('doc-a');
      expect(store.selectedDocIds['doc-a']).toBe(false);

      store.deselectAllDocsForSource('src-1', ['doc-a', 'doc-b']);
      expect(store.selectedSourceIds).not.toContain('src-1');
      expect(store.selectedDocIds['doc-b']).toBe(false);

      store.toggleSource('src-2', ['doc-c']);
      expect(store.selectedSourceIds).toContain('src-2');
      expect(store.selectedDocIds['doc-c']).toBe(true);
      store.toggleSource('src-2', ['doc-c']);
      expect(store.selectedSourceIds).not.toContain('src-2');
      expect(store.selectedDocIds['doc-c']).toBe(false);
    });

    it('tracks generation lifecycle and retains draft cards', () => {
      const store = new GenerateStore();
      expect(store.isGenerating).toBe(false);

      store.startGenerating('job-123');
      expect(store.isGenerating).toBe(true);
      expect(store.activeJobId).toBe('job-123');

      const mockResult: GenerationResult = {
        cardsCreated: 2,
        duplicatesSkipped: 0,
        newCards: [
          {
            id: 'card-1',
            sourceId: 's1',
            sourceQuote: 'Write-Ahead Logging mode for concurrency.',
            personaUsed: 'socratic-mentor',
            targetDeck: 'Default',
            question: 'What is SQLite WAL?',
            answer: 'Write-Ahead Logging mode for concurrency.',
            difficulty: 'intermediate',
            tags: ['sqlite'],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      };

      store.finishGenerating(mockResult);
      expect(store.isGenerating).toBe(false);
      expect(store.generationResult?.cardsCreated).toBe(2);
      expect(store.createdCards.length).toBe(1);
      expect(store.createdCards[0].question).toBe('What is SQLite WAL?');
    });
  });

  describe('SourcesStore', () => {
    it('manages sources catalog, expansions, and sync status', () => {
      const store = new SourcesStore();
      const mockSources: DataSource[] = [
        {
          id: 's1',
          name: 'Tech Blog',
          type: 'web',
          uri: 'https://example.com',
          targetDeck: 'Default',
          tags: [],
          isActive: true,
          createdAt: '',
          updatedAt: '',
        },
      ];

      store.setSources(mockSources);
      expect(store.sources.length).toBe(1);

      store.toggleExpand('s1');
      expect(store.expandedSourceIds['s1']).toBe(true);

      store.setFilter('kubernetes');
      expect(store.filterQuery).toBe('kubernetes');

      store.setSyncing('s1', true);
      expect(store.syncingSourceIds['s1']).toBe(true);
      store.setSyncing('s1', false);
      expect(store.syncingSourceIds['s1']).toBe(false);

      store.setSyncingAll(true);
      expect(store.isSyncingAll).toBe(true);

      store.updateSource({ ...mockSources[0], name: 'Updated Blog' });
      expect(store.sources[0].name).toBe('Updated Blog');

      store.removeSource('s1');
      expect(store.sources.length).toBe(0);
    });
  });

  describe('ExplorerStore', () => {
    it('manages flashcards list, filters, selection, and reveal toggles', () => {
      const store = new ExplorerStore();
      const mockCards: Flashcard[] = [
        {
          id: 'c1',
          sourceId: 's1',
          sourceQuote: 'Quote 1',
          personaUsed: 'socratic-mentor',
          targetDeck: 'Default',
          question: 'Q1',
          answer: 'A1',
          difficulty: 'beginner',
          tags: ['t1'],
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'c2',
          sourceId: 's1',
          sourceQuote: 'Quote 2',
          personaUsed: 'socratic-mentor',
          targetDeck: 'Default',
          question: 'Q2',
          answer: 'A2',
          difficulty: 'expert',
          tags: ['t2'],
          createdAt: '',
          updatedAt: '',
        },
      ];

      store.setCards(mockCards);
      expect(store.cards.length).toBe(2);

      store.setSearch('Q1');
      expect(store.searchQuery).toBe('Q1');

      store.setDeck('Rust');
      expect(store.selectedDeck).toBe('Rust');

      store.setDifficulty('beginner');
      expect(store.selectedDifficulty).toBe('beginner');

      store.toggleSelect('c1');
      expect(store.selectedIds).toEqual(['c1']);

      store.selectAll(['c1', 'c2']);
      expect(store.selectedIds).toContain('c1');
      expect(store.selectedIds).toContain('c2');

      store.toggleReveal('c1');
      expect(store.revealedAnswers['c1']).toBe(true);

      store.removeCard('c1');
      expect(store.cards.length).toBe(1);
      expect(store.selectedIds).not.toContain('c1');
    });
  });

  describe('ExportStore', () => {
    it('manages export settings and retention across view switches', () => {
      const store = new ExportStore();
      expect(store.selectedDeck).toBe('all');
      expect(store.selectedSourceId).toBe('all');

      store.setDeck('Distributed Systems');
      expect(store.selectedDeck).toBe('Distributed Systems');

      store.setSource('src-99');
      expect(store.selectedSourceId).toBe('src-99');
    });
  });

  describe('TaskStore', () => {
    it('manages jobs, logs, drawer state, and real-time job events', () => {
      const store = new TaskStore();
      expect(store.jobs.length).toBe(0);
      expect(store.isDrawerOpen).toBe(false);

      store.openDrawer('active');
      expect(store.isDrawerOpen).toBe(true);
      expect(store.activeDrawerTab).toBe('active');

      store.closeDrawer();
      expect(store.isDrawerOpen).toBe(false);

      const mockJob: Job = {
        id: 'job-task-1',
        type: 'generation',
        title: 'Generate Cards',
        status: 'running',
        priority: 0,
        progress: 25,
        totalSteps: 4,
        currentStep: 1,
        stepName: 'Extracting source text',
        payload: {},
        result: null,
        error: null,
        workerPid: 12345,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.upsertJob(mockJob);

      expect(store.jobs.length).toBe(1);
      expect(store.activeCount).toBe(1);

      // Add log
      store.addJobLog({
        id: '1',
        jobId: 'job-task-1',
        level: 'info',
        step: 'Extraction',
        message: 'Parsed 1500 words',
        timestamp: new Date().toISOString(),
      });

      const logs = store.getLogsForJob('job-task-1');
      expect(logs.length).toBe(1);
      expect(logs[0].message).toBe('Parsed 1500 words');

      // Complete job
      store.upsertJob({ ...mockJob, status: 'completed', progress: 100 });

      expect(store.activeCount).toBe(0);
      expect(store.jobs[0].status).toBe('completed');
      expect(store.historyJobs.length).toBe(1);
    });

    it('toggles job accordion expansion and tracks active vs history tab state', () => {
      const store = new TaskStore();
      const jobId = 'job-xyz';

      expect(store.expandedJobIds[jobId]).toBeUndefined();

      store.toggleJobAccordion(jobId);
      expect(store.expandedJobIds[jobId]).toBe(true);

      store.toggleJobAccordion(jobId);
      expect(store.expandedJobIds[jobId]).toBe(false);

      expect(store.activeDrawerTab).toBe('active');
      store.setDrawerTab('history');
      expect(store.activeDrawerTab).toBe('history');
      store.setDrawerTab('active');
      expect(store.activeDrawerTab).toBe('active');
    });

    it('correctly partitions jobs into activeJobs and historyJobs', () => {
      const store = new TaskStore();

      store.upsertJob({
        id: 'j1',
        type: 'generate',
        status: 'queued',
        priority: 0,
        createdAt: '',
        updatedAt: '',
      });
      store.upsertJob({
        id: 'j2',
        type: 'sync',
        status: 'running',
        priority: 0,
        createdAt: '',
        updatedAt: '',
      });
      store.upsertJob({
        id: 'j3',
        type: 'export',
        status: 'completed',
        priority: 0,
        createdAt: '',
        updatedAt: '',
      });
      store.upsertJob({
        id: 'j4',
        type: 'generate',
        status: 'failed',
        priority: 0,
        createdAt: '',
        updatedAt: '',
      });
      store.upsertJob({
        id: 'j5',
        type: 'sync',
        status: 'cancelled',
        priority: 0,
        createdAt: '',
        updatedAt: '',
      });

      expect(store.activeJobs.map((j) => j.id)).toEqual(['j2', 'j1']);
      expect(store.activeCount).toBe(2);
      expect(store.historyJobs.map((j) => j.id)).toEqual(['j5', 'j4', 'j3']);
    });

    it('bridges SSE job completion and failure events to generateStore', () => {
      const listeners: Record<string, (e: any) => void> = {};
      class MockEventSource {
        addEventListener(event: string, cb: (e: any) => void) {
          listeners[event] = cb;
        }
        close() {}
      }
      vi.stubGlobal('EventSource', MockEventSource);

      const store = new TaskStore();
      store.init();

      // Test active generation job completion
      generateStore.startGenerating();
      generateStore.setActiveJob('gen-job-42');
      expect(generateStore.isGenerating).toBe(true);
      expect(generateStore.activeJobId).toBe('gen-job-42');

      // Trigger SSE job_completed
      listeners['job_completed']?.({
        data: JSON.stringify({
          id: 'gen-job-42',
          type: 'generation',
          title: 'Synthesize flashcards',
          status: 'completed',
          resultSummary: {
            cardsCreated: 5,
            duplicatesSkipped: 1,
            newCards: [{ id: 'c1', question: 'Q1', answer: 'A1' }],
          },
        }),
      });

      expect(generateStore.isGenerating).toBe(false);
      expect(generateStore.activeJobId).toBe(null);
      expect(generateStore.generationResult?.cardsCreated).toBe(5);
      expect(generateStore.generationResult?.duplicatesSkipped).toBe(1);
      expect(generateStore.createdCards.length).toBe(1);

      // Test active generation job failure
      generateStore.startGenerating('gen-job-failed');
      listeners['job_failed']?.({
        data: JSON.stringify({
          id: 'gen-job-failed',
          type: 'generation',
          title: 'Synthesize flashcards',
          status: 'failed',
          errorMessage: 'LLM context length exceeded',
        }),
      });

      expect(generateStore.isGenerating).toBe(false);
      expect(generateStore.activeJobId).toBe(null);
      expect(generateStore.errorMessage).toBe('LLM context length exceeded');

      // Test single source sync job completion
      sourcesStore.setSyncing('src-101', true, 'sync-job-101');
      expect(sourcesStore.syncingSourceIds['src-101']).toBe(true);
      expect(sourcesStore.activeSyncJobIds['src-101']).toBe('sync-job-101');

      listeners['job_completed']?.({
        data: JSON.stringify({
          id: 'sync-job-101',
          type: 'sync_source',
          title: 'Sync source: Rust Docs',
          status: 'completed',
          metadata: { sourceId: 'src-101', sourceName: 'Rust Docs' },
          resultSummary: { newCount: 3, totalFetched: 10 },
        }),
      });

      expect(sourcesStore.syncingSourceIds['src-101']).toBe(false);
      expect(sourcesStore.activeSyncJobIds['src-101']).toBeUndefined();

      // Test bulk sync_all job completion
      sourcesStore.setSyncingAll(true, 'sync-all-job');
      expect(sourcesStore.isSyncingAll).toBe(true);
      expect(sourcesStore.activeSyncAllJobId).toBe('sync-all-job');

      listeners['job_completed']?.({
        data: JSON.stringify({
          id: 'sync-all-job',
          type: 'sync_all',
          title: 'Sync all sources',
          status: 'completed',
          resultSummary: { totalSources: 4, totalNewDocuments: 12 },
        }),
      });

      expect(sourcesStore.isSyncingAll).toBe(false);
      expect(sourcesStore.activeSyncAllJobId).toBe(null);
    });
  });

  describe('SettingsStore (Story 15.3)', () => {
    let originalFetch: typeof global.fetch;

    beforeEach(() => {
      originalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('initializes with all 5 supported providers and default unconfigured state', () => {
      const store = new SettingsStore();
      expect(Object.keys(store.keys)).toEqual(['openai', 'anthropic', 'gemini', 'ollama', 'notion']);
      expect(store.loading).toBe(false);
      expect(store.error).toBe(null);

      expect(store.keys.openai).toEqual({
        provider: 'openai',
        isConfigured: false,
        maskedValue: '',
        source: 'none',
        endpoint: null,
      });
      expect(store.keys.notion.isConfigured).toBe(false);
      expect(store.testResults.openai).toBe(null);
      expect(store.testingProvider.openai).toBe(false);
      expect(store.savingProvider.openai).toBe(false);
    });

    it('loadKeys populates provider key statuses from API', async () => {
      const store = new SettingsStore();
      const mockApiResponse = {
        providers: [
          { provider: 'openai', isConfigured: true, maskedValue: 'sk-...1234', source: 'database', endpoint: null },
          { provider: 'notion', isConfigured: true, maskedValue: 'sec...5678', source: 'environment', endpoint: null },
        ],
        keys: {
          openai: { provider: 'openai', isConfigured: true, maskedValue: 'sk-...1234', source: 'database', endpoint: null },
          anthropic: { provider: 'anthropic', isConfigured: false, maskedValue: '', source: 'none', endpoint: null },
          gemini: { provider: 'gemini', isConfigured: false, maskedValue: '', source: 'none', endpoint: null },
          ollama: { provider: 'ollama', isConfigured: false, maskedValue: '', source: 'none', endpoint: 'http://localhost:11434' },
          notion: { provider: 'notion', isConfigured: true, maskedValue: 'sec...5678', source: 'environment', endpoint: null },
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockApiResponse,
      });

      await store.loadKeys();

      expect(global.fetch).toHaveBeenCalledWith('/api/settings/keys');
      expect(store.loading).toBe(false);
      expect(store.error).toBe(null);
      expect(store.keys.openai.isConfigured).toBe(true);
      expect(store.keys.openai.maskedValue).toBe('sk-...1234');
      expect(store.keys.openai.source).toBe('database');
      expect(store.keys.notion.isConfigured).toBe(true);
      expect(store.keys.notion.source).toBe('environment');
      expect(store.keys.ollama.endpoint).toBe('http://localhost:11434');
    });

    it('loadKeys handles API failure gracefully', async () => {
      const store = new SettingsStore();
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Database locked' }),
      });

      await store.loadKeys();

      expect(store.loading).toBe(false);
      expect(store.error).toBe('Database locked');
    });

    it('saveKey persists credential and updates local store state', async () => {
      const store = new SettingsStore();
      // Pre-populate diagnostic result to verify it gets cleared upon save
      store.testResults.openai = { success: false, message: 'Prior connection error' };

      const mockSavedResponse = {
        success: true,
        provider: 'openai',
        isConfigured: true,
        maskedValue: 'sk-...9999',
        source: 'database',
        endpoint: 'https://api.openai.com/v1',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockSavedResponse,
      });

      const res = await store.saveKey({
        provider: 'openai',
        key: 'sk-new-secret-key-1234567890',
        endpoint: 'https://api.openai.com/v1',
      });

      expect(global.fetch).toHaveBeenCalledWith('/api/settings/keys', expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'openai',
          key: 'sk-new-secret-key-1234567890',
          endpoint: 'https://api.openai.com/v1',
        }),
      }));

      expect(res.success).toBe(true);
      expect(store.keys.openai.isConfigured).toBe(true);
      expect(store.keys.openai.maskedValue).toBe('sk-...9999');
      expect(store.keys.openai.source).toBe('database');
      expect(store.keys.openai.endpoint).toBe('https://api.openai.com/v1');
      expect(store.savingProvider.openai).toBe(false);
      // Verify clearing of prior diagnostic result
      expect(store.testResults.openai).toBe(null);
    });

    it('saveKey resets savingProvider flag and throws on failure', async () => {
      const store = new SettingsStore();
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Database write conflict' }),
      });

      await expect(
        store.saveKey({ provider: 'openai', key: 'sk-fail' })
      ).rejects.toThrow('Database write conflict');

      expect(store.savingProvider.openai).toBe(false);
      expect(store.keys.openai.isConfigured).toBe(false);
    });

    it('deleteKey clears stored secret and updates state', async () => {
      const store = new SettingsStore();
      store.keys.notion = {
        provider: 'notion',
        isConfigured: true,
        maskedValue: 'sec...1234',
        source: 'database',
      };
      // Pre-populate diagnostic result to verify it gets cleared upon delete
      store.testResults.notion = { success: true, message: 'Prior success' };

      const mockDeleteResponse = {
        success: true,
        provider: 'notion',
        isConfigured: false,
        maskedValue: '',
        source: 'none',
        endpoint: null,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDeleteResponse,
      });

      const res = await store.deleteKey('notion');

      expect(global.fetch).toHaveBeenCalledWith('/api/settings/keys/notion', { method: 'DELETE' });
      expect(res.isConfigured).toBe(false);
      expect(store.keys.notion.isConfigured).toBe(false);
      expect(store.keys.notion.source).toBe('none');
      expect(store.deletingProvider.notion).toBe(false);
      // Verify clearing of prior diagnostic result
      expect(store.testResults.notion).toBe(null);
    });

    it('deleteKey resets deletingProvider flag and throws on failure', async () => {
      const store = new SettingsStore();
      global.fetch = vi.fn().mockRejectedValue(new Error('Network disconnected'));

      await expect(store.deleteKey('notion')).rejects.toThrow('Network disconnected');
      expect(store.deletingProvider.notion).toBe(false);
    });

    it('testKey verifies credentials and stores live diagnostic result', async () => {
      const store = new SettingsStore();
      const mockVerifyResponse = {
        success: true,
        message: 'Successfully connected to Notion workspace "Research Hub".',
        details: { botName: 'StudyBot', workspaceName: 'Research Hub', latencyMs: 0 },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockVerifyResponse,
      });

      const result = await store.testKey({ provider: 'notion', key: 'secret_candidate' });

      expect(global.fetch).toHaveBeenCalledWith('/api/settings/keys/test', expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'notion', key: 'secret_candidate' }),
      }));

      expect(result.success).toBe(true);
      expect(store.testingProvider.notion).toBe(false);
      expect(store.testResults.notion).toEqual(mockVerifyResponse);
    });

    it('testKey handles 200 OK verification failures and updates diagnostic state', async () => {
      const store = new SettingsStore();
      const mockFailureResponse = {
        success: false,
        message: 'API key is invalid or unauthorized.',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockFailureResponse,
      });

      const result = await store.testKey({ provider: 'openai', key: 'sk-invalid' });

      expect(result.success).toBe(false);
      expect(store.testingProvider.openai).toBe(false);
      expect(store.testResults.openai?.success).toBe(false);
      expect(store.testResults.openai?.message).toBe('API key is invalid or unauthorized.');
    });

    it('testKey catches network failures safely without crashing', async () => {
      const store = new SettingsStore();
      global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch (network error)'));

      const result = await store.testKey({ provider: 'gemini' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('network error');
      expect(store.testingProvider.gemini).toBe(false);
      expect(store.testResults.gemini?.success).toBe(false);
    });

    it('clearTestResult resets test outcome for provider', () => {
      const store = new SettingsStore();
      store.testResults.anthropic = { success: true, message: 'All good' };
      expect(store.testResults.anthropic).not.toBeNull();

      store.clearTestResult('anthropic');
      expect(store.testResults.anthropic).toBeNull();
    });
  });
});
