import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GenerateStore, generateStore, SELECTION_STORAGE_KEY, STORAGE_KEY } from '../client/src/stores/generateStore.svelte.js';
import { SourcesStore, sourcesStore } from '../client/src/stores/sourcesStore.svelte.js';
import { ExplorerStore } from '../client/src/stores/explorerStore.svelte.js';
import { ExportStore } from '../client/src/stores/exportStore.svelte.js';
import { TaskStore } from '../client/src/stores/taskStore.svelte.js';
import { SettingsStore, settingsStore } from '../client/src/stores/settingsStore.svelte.js';
import { loadCachedStats, saveCachedStats, DASHBOARD_STATS_STORAGE_KEY } from '../client/src/lib/dashboard-cache.js';
import type { DataSource, Flashcard, GenerationResult, Job, DashboardStats, DiscoveredDocument, DocumentSlicingOptions, SlicingMode } from '../client/src/lib/types.js';
import { syncSource, syncAllSources } from '../client/src/lib/api.js';
import { formatPageBadge } from '../client/src/lib/formatters.js';

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

    it('persists active document selections, source accordions, and filter queries across reloads', () => {
      const store1 = new GenerateStore();

      store1.selectAllDocsForSource('src-10', ['doc-1', 'doc-2']);
      store1.toggleExpandSource('src-10');
      store1.setSourceFilterQuery('src-10', 'concurrency');

      // Verify localStorage storage
      const raw = localStorageMock[SELECTION_STORAGE_KEY];
      expect(raw).toBeDefined();
      const parsed = JSON.parse(raw);
      expect(parsed.selectedSourceIds).toContain('src-10');
      expect(parsed.selectedDocIds['doc-1']).toBe(true);
      expect(parsed.selectedDocIds['doc-2']).toBe(true);
      expect(parsed.expandedSources['src-10']).toBe(true);
      expect(parsed.sourceFilterQuery['src-10']).toBe('concurrency');

      // Simulate page reload (F5) by creating a new store instance with existing localStorage
      const store2 = new GenerateStore();
      expect(store2.selectedSourceIds).toContain('src-10');
      expect(store2.selectedDocIds['doc-1']).toBe(true);
      expect(store2.selectedDocIds['doc-2']).toBe(true);
      expect(store2.expandedSources['src-10']).toBe(true);
      expect(store2.sourceFilterQuery['src-10']).toBe('concurrency');
    });

    it('prunes dead source and document IDs safely', () => {
      const store = new GenerateStore();
      store.selectAllDocsForSource('src-valid', ['doc-valid', 'doc-dead']);
      store.selectAllDocsForSource('src-dead', ['doc-other']);
      store.toggleExpandSource('src-valid');
      store.toggleExpandSource('src-dead');
      store.setSourceFilterQuery('src-dead', 'query');

      expect(store.selectedSourceIds).toContain('src-dead');
      expect(store.expandedSources['src-dead']).toBe(true);

      // Prune dead sources and documents
      store.pruneDeadIds(['src-valid'], ['doc-valid']);

      expect(store.selectedSourceIds).toEqual(['src-valid']);
      expect(store.expandedSources['src-dead']).toBeUndefined();
      expect(store.sourceFilterQuery['src-dead']).toBeUndefined();
      expect(store.selectedDocIds['doc-dead']).toBeUndefined();
      expect(store.selectedDocIds['doc-valid']).toBe(true);

      // Verify pruned state was persisted
      const parsed = JSON.parse(localStorageMock[SELECTION_STORAGE_KEY]);
      expect(parsed.selectedSourceIds).toEqual(['src-valid']);
      expect(parsed.expandedSources['src-dead']).toBeUndefined();
    });

    it('handles localStorage errors gracefully without crashing (SecurityError / QuotaExceededError)', () => {
      // Stub setItem to throw QuotaExceededError
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => localStorageMock[key] || null,
        setItem: () => {
          throw new Error('QuotaExceededError: DOM Exception 22');
        },
        removeItem: vi.fn(),
        clear: vi.fn(),
      });

      const store = new GenerateStore();
      // Should not throw
      expect(() => {
        store.selectAllDocsForSource('src-1', ['doc-1']);
        store.toggleDoc('doc-1');
        store.toggleExpandSource('src-1');
        store.setSourceFilterQuery('src-1', 'test');
        store.save();
      }).not.toThrow();

      // Stub getItem to throw SecurityError (private browsing)
      vi.stubGlobal('localStorage', {
        getItem: () => {
          throw new Error('SecurityError: The operation is insecure.');
        },
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      });

      // Instantiating with blocked localStorage should not crash
      expect(() => new GenerateStore()).not.toThrow();
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

    it('supports keywords and sourceLocator in card updates and search filtering', () => {
      const store = new ExplorerStore();
      const mockCard: Flashcard = {
        id: 'card-kw-1',
        sourceId: 's1',
        question: 'What is Raft algorithm?',
        answer: 'A consensus algorithm.',
        sourceQuote: 'Raft manages replicated logs.',
        keywords: ['consensus', 'replicated log', 'leader election'],
        sourceLocator: 'Section 5.1',
        difficulty: 'intermediate',
        personaUsed: 'socratic-mentor',
        targetDeck: 'Distributed Systems',
        tags: ['systems'],
        createdAt: '',
        updatedAt: '',
      };

      store.setCards([mockCard]);
      expect(store.cards[0].keywords).toEqual(['consensus', 'replicated log', 'leader election']);
      expect(store.cards[0].sourceLocator).toBe('Section 5.1');

      // Update card with new keywords and locator
      store.updateCard({
        ...mockCard,
        keywords: ['consensus', 'heartbeat'],
        sourceLocator: 'Section 5.2',
      });
      expect(store.cards[0].keywords).toEqual(['consensus', 'heartbeat']);
      expect(store.cards[0].sourceLocator).toBe('Section 5.2');

      // Filter simulation logic (matching QuestionExplorer.svelte)
      const q1 = 'heartbeat';
      const matchKeywords = (store.cards[0].keywords || []).some((k) => k.toLowerCase().includes(q1));
      expect(matchKeywords).toBe(true);

      const q2 = 'section 5.2';
      const matchLocator = (store.cards[0].sourceLocator || '').toLowerCase().includes(q2);
      expect(matchLocator).toBe(true);
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

    it('handles card_created SSE events and manages progressive card streams', () => {
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

      generateStore.startGenerating('job-stream-test');

      // Emit first progressive card
      listeners['card_created']?.({
        data: JSON.stringify({
          jobId: 'job-stream-test',
          card: {
            id: 'c-1',
            question: 'What is SSE?',
            answer: 'Server-Sent Events',
            difficulty: 'beginner',
            keywords: ['sse', 'streaming'],
            sourceLocator: 'Doc 1, para 1',
          },
        }),
      });

      // Emit second progressive card
      listeners['card_created']?.({
        data: JSON.stringify({
          jobId: 'job-stream-test',
          card: {
            id: 'c-2',
            question: 'What is token cutoff?',
            answer: 'Premature stop at max tokens',
            difficulty: 'intermediate',
            keywords: ['tokens'],
            sourceLocator: 'Doc 1, para 2',
          },
        }),
      });

      const cards = store.getStreamedCardsForJob('job-stream-test');
      expect(cards.length).toBe(2);
      expect(cards[0].question).toBe('What is SSE?');
      expect(cards[0].keywords).toEqual(['sse', 'streaming']);
      expect(cards[1].question).toBe('What is token cutoff?');

      // Emit job_completed with warnings (partial retention)
      listeners['job_completed']?.({
        data: JSON.stringify({
          id: 'job-stream-test',
          type: 'generation',
          status: 'completed_with_warnings',
          resultSummary: {
            cardsCreated: 2,
            duplicatesSkipped: 0,
            partial: true,
          },
        }),
      });

      expect(generateStore.isGenerating).toBe(false);
      expect(generateStore.generationResult?.cardsCreated).toBe(2);
      expect(generateStore.createdCards.length).toBe(2);
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

    it('testAnki updates ankiTestResult with online status and details', async () => {
      const store = new SettingsStore();
      const mockAnkiResponse = {
        online: true,
        version: 6,
        latencyMs: 12,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockAnkiResponse,
      });

      const res = await store.testAnki({ endpointUrl: 'http://127.0.0.1:8765' });

      expect(res.online).toBe(true);
      expect(store.ankiTestResult?.online).toBe(true);
      expect(store.ankiTestResult?.version).toBe(6);
      expect(store.testingAnki).toBe(false);
    });

    it('testAnki with silent: true captures offline state without raising errors', async () => {
      const store = new SettingsStore();
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const res = await store.testAnki({
        endpointUrl: 'http://127.0.0.1:8765',
        silent: true,
      });

      expect(res.online).toBe(false);
      expect(store.ankiTestResult?.online).toBe(false);
      expect(store.ankiTestResult?.error).toContain('Connection refused');
      expect(store.testingAnki).toBe(false);
    });
  });

  describe('Dashboard Telemetry SWR Cache (Story 17.1)', () => {
    it('persists and restores dashboard stats via loadCachedStats and saveCachedStats', () => {
      const mockStats: DashboardStats = {
        totalCards: 42,
        totalSources: 3,
        activeSources: 2,
        totalDecks: 2,
        decks: { Systems: 42 },
        difficulties: { beginner: 10, intermediate: 20, expert: 12, mixed: 0 },
        recentSources: [
          {
            id: 's1',
            name: 'Distributed Systems',
            type: 'local',
            uri: '/books/dist.md',
            tags: [],
            isActive: true,
            createdAt: '',
            updatedAt: '',
          },
        ],
      };

      // Save via exported helper
      saveCachedStats(mockStats);

      // Verify raw storage
      const raw = localStorageMock[DASHBOARD_STATS_STORAGE_KEY];
      expect(raw).toBeDefined();

      // Read back via exported helper (simulating initial SWR render on reload)
      const loaded = loadCachedStats();
      expect(loaded).toBeDefined();
      expect(loaded?.totalCards).toBe(42);
      expect(loaded?.activeSources).toBe(2);
      expect(loaded?.recentSources[0].name).toBe('Distributed Systems');
    });

    it('tolerates corrupt JSON in dashboard cache gracefully', () => {
      localStorageMock[DASHBOARD_STATS_STORAGE_KEY] = '{invalid-json';
      expect(loadCachedStats()).toBeNull();
    });

    it('tolerates localStorage throwing SecurityError or QuotaExceededError', () => {
      vi.stubGlobal('localStorage', {
        getItem: () => {
          throw new Error('SecurityError: The operation is insecure.');
        },
        setItem: () => {
          throw new Error('QuotaExceededError: DOM Exception 22');
        },
        removeItem: vi.fn(),
        clear: vi.fn(),
      });

      expect(() => loadCachedStats()).not.toThrow();
      expect(loadCachedStats()).toBeNull();

      const mockStats: DashboardStats = {
        totalCards: 1,
        totalSources: 1,
        activeSources: 1,
        totalDecks: 1,
        decks: { Default: 1 },
        difficulties: { beginner: 1, intermediate: 0, expert: 0, mixed: 0 },
        recentSources: [],
      };
      expect(() => saveCachedStats(mockStats)).not.toThrow();
    });
  });

  describe('Story 17.6: UI & CLI Slicing Controls & Page Bound Badges', () => {
    it('preserves startPage and endPage metadata on DiscoveredDocument', () => {
      const docWithPages: DiscoveredDocument = {
        id: 'doc-1',
        sourceId: 'src-1',
        title: 'Rich PDF Section',
        textContent: 'Content...',
        wordCount: 1200,
        startPage: 14,
        endPage: 18,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(docWithPages.startPage).toBe(14);
      expect(docWithPages.endPage).toBe(18);

      const docWithoutPages: DiscoveredDocument = {
        id: 'doc-2',
        sourceId: 'src-1',
        title: 'Legacy Markdown',
        textContent: 'Content...',
        wordCount: 500,
        startPage: null,
        endPage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(docWithoutPages.startPage).toBeNull();
      expect(docWithoutPages.endPage).toBeNull();
    });

    it('formats page coordinate badges correctly according to spec rules', () => {
      const baseDoc: DiscoveredDocument = {
        id: 'doc-test',
        sourceId: 'src-1',
        title: 'Test',
        textContent: '',
        wordCount: 100,
        createdAt: '',
        updatedAt: '',
      };

      // Multi-page range: startPage !== endPage -> "Pages 14-18"
      expect(formatPageBadge({ ...baseDoc, startPage: 14, endPage: 18 })).toBe('Pages 14-18');

      // Single-page range: startPage === endPage -> "Page 14"
      expect(formatPageBadge({ ...baseDoc, startPage: 14, endPage: 14 })).toBe('Page 14');

      // Single-page when endPage is null or less than startPage -> "Page 7"
      expect(formatPageBadge({ ...baseDoc, startPage: 7, endPage: null })).toBe('Page 7');
      expect(formatPageBadge({ ...baseDoc, startPage: 10, endPage: 8 })).toBe('Page 10');

      // startPage null or undefined -> null (graceful omit)
      expect(formatPageBadge({ ...baseDoc, startPage: null, endPage: null })).toBeNull();
      expect(formatPageBadge({ ...baseDoc, startPage: undefined, endPage: undefined })).toBeNull();
    });

    it('transmits slicing options in POST body via syncSource API helper', async () => {
      const originalFetch = globalThis.fetch;
      const fetchCalls: { url: string; options: RequestInit }[] = [];

      globalThis.fetch = vi.fn(async (url: any, options: any) => {
        fetchCalls.push({ url: String(url), options });
        return {
          ok: true,
          json: async () => ({ success: true, sourceId: 'src-pdf', newCount: 3, totalFetched: 3 }),
        } as Response;
      });

      try {
        // Budget mode slicing
        const budgetOpts: DocumentSlicingOptions = {
          mode: 'budget',
          pagesPerChunk: 5,
          wordsPerChunk: 1500,
        };
        await syncSource('src-pdf', { slicing: budgetOpts });

        expect(fetchCalls.length).toBe(1);
        expect(fetchCalls[0].url).toBe('/api/sync/src-pdf');
        expect(fetchCalls[0].options.method).toBe('POST');
        expect(JSON.parse(fetchCalls[0].options.body as string)).toEqual({
          slicing: { mode: 'budget', pagesPerChunk: 5, wordsPerChunk: 1500 },
        });

        // Outline mode slicing
        const outlineOpts: DocumentSlicingOptions = {
          mode: 'outline',
          minChunkWords: 250,
          pagesPerChunk: 5,
        };
        await syncSource('src-pdf-2', { slicing: outlineOpts });

        expect(fetchCalls.length).toBe(2);
        expect(fetchCalls[1].url).toBe('/api/sync/src-pdf-2');
        expect(JSON.parse(fetchCalls[1].options.body as string)).toEqual({
          slicing: { mode: 'outline', minChunkWords: 250, pagesPerChunk: 5 },
        });

        // Omitted slicing maintains backward-compatible undefined body
        await syncSource('src-legacy');
        expect(fetchCalls.length).toBe(3);
        expect(fetchCalls[2].url).toBe('/api/sync/src-legacy');
        expect(fetchCalls[2].options.body).toBeUndefined();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('transmits slicing options in POST body via syncAllSources API helper', async () => {
      const originalFetch = globalThis.fetch;
      const fetchCalls: { url: string; options: RequestInit }[] = [];

      globalThis.fetch = vi.fn(async (url: any, options: any) => {
        fetchCalls.push({ url: String(url), options });
        return {
          ok: true,
          json: async () => [{ success: true, sourceId: 'src-1', newCount: 1, totalFetched: 1 }],
        } as Response;
      });

      try {
        const slicingOpts: DocumentSlicingOptions = { mode: 'none' };
        await syncAllSources({ slicing: slicingOpts });

        expect(fetchCalls.length).toBe(1);
        expect(fetchCalls[0].url).toBe('/api/sync');
        expect(fetchCalls[0].options.method).toBe('POST');
        expect(JSON.parse(fetchCalls[0].options.body as string)).toEqual({
          slicing: { mode: 'none' },
        });

        // Without slicing
        await syncAllSources();
        expect(fetchCalls.length).toBe(2);
        expect(fetchCalls[1].options.body).toBeUndefined();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('TaskStore', () => {
    it('notifies completion listeners when onJobCompleted is registered and handles unsubscription', () => {
      const store = new TaskStore();
      const mockJob: Job = {
        id: 'job-123',
        type: 'generation',
        title: 'Synthesize flashcards: "Chapter 1"',
        status: 'completed',
        metadata: {
          documentIds: ['doc-abc'],
          sourceIds: ['src-xyz'],
          documentTitle: 'Chapter 1',
        },
        resultSummary: {
          cardsCreated: 5,
          duplicatesSkipped: 1,
        },
        createdAt: '2026-10-24T12:00:00Z',
      };

      const receivedJobs: Job[] = [];
      const unsubscribe = store.onJobCompleted((job) => {
        receivedJobs.push(job);
      });

      // Simulate notifying listeners
      (store as any).notifyJobCompleted(mockJob);
      expect(receivedJobs.length).toBe(1);
      expect(receivedJobs[0].id).toBe('job-123');
      expect(receivedJobs[0].metadata?.documentTitle).toBe('Chapter 1');

      // Unsubscribe and verify no more events received
      unsubscribe();
      (store as any).notifyJobCompleted({ ...mockJob, id: 'job-456' });
      expect(receivedJobs.length).toBe(1);
    });
  });

  describe('Responsive Layout & Overflow Hardening (Story 19.6)', () => {
    it('verifies QuestionExplorer contains responsive grid, text wrapping, and quote clamping controls', () => {
      const qePath = path.resolve(__dirname, '../client/src/views/QuestionExplorer.svelte');
      const content = fs.readFileSync(qePath, 'utf-8');

      // Card grid responsive template
      expect(content).toContain('repeat(auto-fill, minmax(min(100%, 360px), 1fr))');

      // Overflow wrapping on card text elements
      expect(content).toContain('overflow-wrap: break-word');
      expect(content).toContain('word-break: break-word');

      // Quote expansion toggle state & button
      expect(content).toContain('expandedQuoteCardIds');
      expect(content).toContain('toggleQuoteExpand');
      expect(content).toContain('card.sourceQuote.length > 180');
      expect(content).toContain('btn-toggle-quote');
      expect(content).toContain('Show more');
      expect(content).toContain('Show less');

      // Mobile media query
      expect(content).toContain('@media (max-width: 640px)');
    });

    it('verifies DocumentPreviewModal contains responsive bounds, table scroll, and pre overflow handling', () => {
      const modalPath = path.resolve(__dirname, '../client/src/components/DocumentPreviewModal.svelte');
      const content = fs.readFileSync(modalPath, 'utf-8');

      // Constrained modal width with viewport bounds
      expect(content).toContain('max-width: min(860px, 95vw)');
      expect(content).toContain('box-sizing: border-box');

      // Pre and table horizontal scrolling
      expect(content).toContain('.reader-view :global(table)');
      expect(content).toContain('overflow-x: auto');
      expect(content).toContain('.reader-view :global(pre)');

      // Mobile media query
      expect(content).toContain('@media (max-width: 640px)');
    });

    it('verifies slide-over drawers enforce max-width min bounds, box-sizing, and mobile padding', () => {
      const drawers = [
        { path: '../client/src/components/CardEditorDrawer.svelte', maxWidth: 'min(520px, 100vw)' },
        { path: '../client/src/components/TaskCenterDrawer.svelte', maxWidth: 'min(580px, 100vw)' },
        { path: '../client/src/components/SourceDocumentInspector.svelte', maxWidth: 'min(680px, 100vw)' },
      ];

      for (const drawer of drawers) {
        const fullPath = path.resolve(__dirname, drawer.path);
        const content = fs.readFileSync(fullPath, 'utf-8');

        expect(content).toContain(drawer.maxWidth);
        expect(content).toContain('box-sizing: border-box');
        expect(content).toContain('@media (max-width: 640px)');
      }
    });

    it('verifies GenerateStudio tray items and document URLs are constrained against horizontal spill', () => {
      const gsPath = path.resolve(__dirname, '../client/src/views/GenerateStudio.svelte');
      const content = fs.readFileSync(gsPath, 'utf-8');

      // Document tray row and titles have min-width: 0 to allow flex shrinking
      expect(content).toContain('.tray-doc-row');
      expect(content).toContain('.meta-item.doc-url');
      expect(content).toContain('max-width: min(220px, 35vw)');
      expect(content).toContain('text-overflow: ellipsis');
    });

    it('evaluates quote expansion threshold invariant (180 characters)', () => {
      const shortQuote = 'A concise quote within limits.';
      const longQuote = 'A'.repeat(181);

      const isShortClamped = (quote: string, expanded: boolean) => quote.length > 180 && !expanded;

      expect(isShortClamped(shortQuote, false)).toBe(false);
      expect(isShortClamped(shortQuote, true)).toBe(false);
      expect(isShortClamped(longQuote, false)).toBe(true);
      expect(isShortClamped(longQuote, true)).toBe(false);
    });
  });

  describe('Generate Studio Target Scope & Modal Document Picker (Story 19.7)', () => {
    const mockSource: DataSource = {
      id: 'src-epub-1',
      name: 'Design Patterns in TypeScript',
      type: 'local',
      uri: 'file:///books/dp.epub',
      tags: ['patterns'],
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const mockDocs: DiscoveredDocument[] = [
      {
        id: 'doc-1',
        sourceId: 'src-epub-1',
        title: 'Chapter 1: Factory Method Pattern',
        url: 'file:///books/dp.epub#ch1',
        wordCount: 1500,
        cardCount: 4,
        textContent: 'Factory Method is a creational design pattern that provides an interface for creating objects in a superclass.',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'doc-2',
        sourceId: 'src-epub-1',
        title: 'Chapter 2: Structural Adapters',
        url: 'file:///books/dp.epub#ch2',
        wordCount: 2200,
        cardCount: 6,
        textContent: 'Adapter is a structural design pattern that allows objects with incompatible interfaces to collaborate.',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'doc-3',
        sourceId: 'src-epub-1',
        title: 'Chapter 3: Observer and Reactive Streams',
        url: 'file:///books/dp.epub#ch3',
        wordCount: 3100,
        cardCount: 0,
        textContent: 'Observer lets you define a subscription mechanism to notify multiple objects about events.',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    it('correctly calculates source full-check, indeterminate, and document metrics', () => {
      const store = new GenerateStore();
      store.sourceDocuments['src-epub-1'] = mockDocs;

      // Initially no docs selected
      const isFullyChecked = (srcId: string) => {
        const docs = store.sourceDocuments[srcId] || [];
        return docs.length > 0 && docs.every((d) => store.selectedDocIds[d.id]);
      };
      const isIndeterminate = (srcId: string) => {
        const docs = store.sourceDocuments[srcId] || [];
        const some = docs.some((d) => store.selectedDocIds[d.id]);
        const all = docs.every((d) => store.selectedDocIds[d.id]);
        return some && !all;
      };
      const getSelectedWords = (srcId: string) => {
        const docs = store.sourceDocuments[srcId] || [];
        return docs.filter((d) => store.selectedDocIds[d.id]).reduce((sum, d) => sum + (d.wordCount || 0), 0);
      };

      expect(isFullyChecked('src-epub-1')).toBe(false);
      expect(isIndeterminate('src-epub-1')).toBe(false);
      expect(getSelectedWords('src-epub-1')).toBe(0);

      // Select 1 doc (partial)
      store.selectedDocIds['doc-1'] = true;
      expect(isFullyChecked('src-epub-1')).toBe(false);
      expect(isIndeterminate('src-epub-1')).toBe(true);
      expect(getSelectedWords('src-epub-1')).toBe(1500);

      // Select all docs
      store.selectAllDocsForSource('src-epub-1', mockDocs.map((d) => d.id));
      expect(isFullyChecked('src-epub-1')).toBe(true);
      expect(isIndeterminate('src-epub-1')).toBe(false);
      expect(getSelectedWords('src-epub-1')).toBe(6800);
      expect(store.selectedSourceIds).toContain('src-epub-1');

      // Deselect all
      store.deselectAllDocsForSource('src-epub-1', mockDocs.map((d) => d.id));
      expect(isFullyChecked('src-epub-1')).toBe(false);
      expect(isIndeterminate('src-epub-1')).toBe(false);
      expect(getSelectedWords('src-epub-1')).toBe(0);
      expect(store.selectedSourceIds).not.toContain('src-epub-1');
    });

    it('filters documents accurately by search query with token and plural tolerance', () => {
      const normalize = (s: string) => s.toLowerCase().trim();
      const filterDocs = (docs: DiscoveredDocument[], query: string) => {
        const q = normalize(query);
        if (!q) return docs;
        const tokens = q.split(' ').filter(Boolean);
        return docs.filter((doc) =>
          tokens.every((t) => {
            const title = normalize(doc.title);
            const text = normalize(doc.textContent || '');
            if (title.includes(t) || text.includes(t)) return true;
            if (t.length > 3 && t.endsWith('s')) {
              const singular = t.slice(0, -1);
              if (title.includes(singular) || text.includes(singular)) return true;
            }
            return false;
          })
        );
      };

      // Exact token match in title
      expect(filterDocs(mockDocs, 'factory').length).toBe(1);
      expect(filterDocs(mockDocs, 'factory')[0].id).toBe('doc-1');

      // Plural token matching singular in content or title
      expect(filterDocs(mockDocs, 'patterns').length).toBe(2); // 'pattern' in doc-1 and doc-2

      // Match in content
      expect(filterDocs(mockDocs, 'subscription').length).toBe(1);
      expect(filterDocs(mockDocs, 'subscription')[0].id).toBe('doc-3');

      // Non-matching
      expect(filterDocs(mockDocs, 'nonexistent').length).toBe(0);
    });

    it('simulates modal selection apply updating store atomically', () => {
      const store = new GenerateStore();
      store.sourceDocuments['src-epub-1'] = mockDocs;

      // Modal applies selection of doc-2 and doc-3
      const selectedFromModal = ['doc-2', 'doc-3'];
      const docs = store.sourceDocuments['src-epub-1'];
      const selectedSet = new Set(selectedFromModal);

      docs.forEach((doc) => {
        store.selectedDocIds[doc.id] = selectedSet.has(doc.id);
      });
      if (selectedFromModal.length > 0) {
        if (!store.selectedSourceIds.includes('src-epub-1')) {
          store.selectedSourceIds = [...store.selectedSourceIds, 'src-epub-1'];
        }
      }

      expect(store.selectedDocIds['doc-1']).toBe(false);
      expect(store.selectedDocIds['doc-2']).toBe(true);
      expect(store.selectedDocIds['doc-3']).toBe(true);
      expect(store.selectedSourceIds).toContain('src-epub-1');

      // Total words selected
      const totalWords = docs
        .filter((d) => store.selectedDocIds[d.id])
        .reduce((sum, d) => sum + (d.wordCount || 0), 0);
      expect(totalWords).toBe(5300); // 2200 + 3100
    });

    it('verifies SourceDocumentPickerModal and GenerateStudio markup & accessibility invariants', () => {
      const modalPath = path.resolve(__dirname, '../client/src/components/SourceDocumentPickerModal.svelte');
      const studioPath = path.resolve(__dirname, '../client/src/views/GenerateStudio.svelte');

      const modalContent = fs.readFileSync(modalPath, 'utf-8');
      const studioContent = fs.readFileSync(studioPath, 'utf-8');

      // SourceDocumentPickerModal invariants
      expect(modalContent).toContain('role="dialog"');
      expect(modalContent).toContain('aria-modal="true"');
      expect(modalContent).toContain('aria-labelledby="picker-modal-title"');
      expect(modalContent).toContain('.filter-tabs');
      expect(modalContent).toContain('tab-btn');
      expect(modalContent).toContain('.search-input');
      expect(modalContent).toContain('.btn-picker-action');
      expect(modalContent).toContain('max-width: min(920px, 95vw)');
      expect(modalContent).toContain('@media (max-width: 640px)');

      // GenerateStudio invariants
      expect(studioContent).toContain('.source-scope-cards-list');
      expect(studioContent).toContain('.source-scope-card');
      expect(studioContent).toContain('.btn-select-docs');
      expect(studioContent).toContain('SourceDocumentPickerModal');
      expect(studioContent).toContain('isPickerModalOpen');
      expect(studioContent).toContain('.card-status-container');
      expect(studioContent).toContain('.status-pill');
      // Modal stacking layer invariants: Preview modal (1300) sits in front of Document picker modal (1200)
      const previewPath = path.resolve(__dirname, '../client/src/components/DocumentPreviewModal.svelte');
      const previewContent = fs.readFileSync(previewPath, 'utf-8');
      expect(modalContent).toContain('z-index: 1200');
      expect(previewContent).toContain('z-index: 1300');
    });
  });
});


