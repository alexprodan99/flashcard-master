import type {
  DifficultyLevel,
  PersonaType,
  CardDepthMode,
  GenerationResult,
  Flashcard,
} from '../lib/types.js';

const STORAGE_KEY = 'fc_generation_settings';
const LEGACY_STORAGE_KEY = 'fcm_generator_settings';

interface PersistedSettings {
  provider: string;
  model: string;
  apiKey: string;
  persona: PersonaType;
  difficulty: DifficultyLevel;
  depthMode: CardDepthMode;
  chunkMultiplier: number;
  limit: number;
  targetDeck: string;
  enforceGrounding: boolean;
}

function loadPersistedSettings(): Partial<PersistedSettings> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function savePersistedSettings(settings: PersistedSettings) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

export class GenerateStore {
  // Sources & Documents Selection State
  selectedDocIds = $state<Record<string, boolean>>({});
  selectedSourceIds = $state<string[]>([]);
  expandedSources = $state<Record<string, boolean>>({});
  sourceFilterQuery = $state<Record<string, string>>({});
  sourceDocuments = $state<Record<string, any[]>>({});
  loadingDocs = $state<Record<string, boolean>>({});
  syncingSources = $state<Record<string, boolean>>({});

  // Configuration Settings (with LocalStorage persistence)
  provider = $state('ollama');
  model = $state('phi4-mini');
  apiKey = $state('');
  persona = $state<PersonaType>('socratic-mentor');
  difficulty = $state<DifficultyLevel>('intermediate');
  depthMode = $state<CardDepthMode>('atomic');
  chunkMultiplier = $state<number>(1);
  limit = $state<number>(4);
  targetDeck = $state('');
  enforceGrounding = $state(true);

  // Execution & Output State
  isGenerating = $state(false);
  activeJobId = $state<string | null>(null);
  errorMessage = $state<string | null>(null);
  generationResult = $state<GenerationResult | null>(null);
  createdCards = $state<Flashcard[]>([]);

  constructor() {
    const saved = loadPersistedSettings();
    if (saved.provider) this.provider = saved.provider;
    if (saved.model) this.model = saved.model;
    if (saved.apiKey !== undefined) this.apiKey = saved.apiKey;
    if (saved.persona) this.persona = saved.persona;
    if (saved.difficulty) this.difficulty = saved.difficulty;
    if (saved.depthMode) this.depthMode = saved.depthMode;
    if (typeof saved.chunkMultiplier === 'number') this.chunkMultiplier = saved.chunkMultiplier;
    if (typeof saved.limit === 'number') this.limit = saved.limit;
    if (saved.targetDeck !== undefined) this.targetDeck = saved.targetDeck;
    if (saved.enforceGrounding !== undefined) this.enforceGrounding = saved.enforceGrounding;
  }

  save() {
    savePersistedSettings({
      provider: this.provider,
      model: this.model,
      apiKey: this.apiKey,
      persona: this.persona,
      difficulty: this.difficulty,
      depthMode: this.depthMode,
      chunkMultiplier: this.chunkMultiplier,
      limit: this.limit,
      targetDeck: this.targetDeck,
      enforceGrounding: this.enforceGrounding,
    });
  }

  setProvider(newProvider: string) {
    this.provider = newProvider;
    if (newProvider === 'ollama') {
      this.model = 'phi4-mini';
    } else if (newProvider === 'gemini') {
      this.model = 'gemini-3.6-flash';
    } else if (newProvider === 'openai') {
      this.model = 'gpt-4o-mini';
    } else if (newProvider === 'anthropic') {
      this.model = 'claude-haiku-4-5-20251001';
    }
    this.save();
  }

  toggleDoc(id: string) {
    this.selectedDocIds[id] = !this.selectedDocIds[id];
  }

  setDocSelected(id: string, selected: boolean) {
    this.selectedDocIds[id] = selected;
  }

  selectAllDocsForSource(sourceId: string, docIds: string[]) {
    docIds.forEach((id) => {
      this.selectedDocIds[id] = true;
    });
    if (!this.selectedSourceIds.includes(sourceId)) {
      this.selectedSourceIds = [...this.selectedSourceIds, sourceId];
    }
  }

  deselectAllDocsForSource(sourceId: string, docIds: string[]) {
    docIds.forEach((id) => {
      this.selectedDocIds[id] = false;
    });
    this.selectedSourceIds = this.selectedSourceIds.filter((id) => id !== sourceId);
  }

  toggleSource(sourceId: string, docIds?: string[]) {
    const isSelected = this.selectedSourceIds.includes(sourceId);
    if (isSelected) {
      this.selectedSourceIds = this.selectedSourceIds.filter((id) => id !== sourceId);
      if (docIds) {
        docIds.forEach((id) => {
          this.selectedDocIds[id] = false;
        });
      }
    } else {
      this.selectedSourceIds = [...this.selectedSourceIds, sourceId];
      if (docIds) {
        docIds.forEach((id) => {
          this.selectedDocIds[id] = true;
        });
      }
    }
  }

  toggleExpandSource(sourceId: string) {
    this.expandedSources[sourceId] = !this.expandedSources[sourceId];
  }

  startGenerating(jobId?: string | null) {
    this.isGenerating = true;
    this.activeJobId = jobId || null;
    this.errorMessage = null;
    this.generationResult = null;
  }

  setActiveJob(jobId: string) {
    this.activeJobId = jobId;
  }

  finishGenerating(result: GenerationResult | null, error?: string | null) {
    this.isGenerating = false;
    this.activeJobId = null;
    this.generationResult = result;
    if (result && result.newCards) {
      this.createdCards = result.newCards;
    }
    if (error) {
      this.errorMessage = error;
    }
  }

  resetSelections() {
    this.selectedDocIds = {};
    this.selectedSourceIds = [];
  }
}

export const generateStore = new GenerateStore();
