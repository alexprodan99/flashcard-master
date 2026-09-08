import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GenerateStore } from '../client/src/stores/generateStore.svelte.js';
import { SourcesStore } from '../client/src/stores/sourcesStore.svelte.js';
import { ExplorerStore } from '../client/src/stores/explorerStore.svelte.js';
import { ExportStore } from '../client/src/stores/exportStore.svelte.js';
import { TaskStore } from '../client/src/stores/taskStore.svelte.js';
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
        errorsCount: 0,
        newCards: [
          {
            id: 'card-1',
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
          question: 'Q1',
          answer: 'A1',
          difficulty: 'beginner',
          tags: ['t1'],
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'c2',
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
        type: 'generate',
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
        id: 1,
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
  });
});
