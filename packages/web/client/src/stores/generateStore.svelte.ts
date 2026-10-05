import type {
  DifficultyLevel,
  PersonaType,
  CardDepthMode,
  GenerationResult,
  Flashcard,
} from '../lib/types.js';

export const STORAGE_KEY = 'fc_generation_settings';
export const LEGACY_STORAGE_KEY = 'fcm_generator_settings';
export const SELECTION_STORAGE_KEY = 'fc_generation_selections';

export interface PersistedSelections {
  selectedDocIds: Record<string, boolean>;
  selectedSourceIds: string[];
  expandedSources: Record<string, boolean>;
  sourceFilterQuery: Record<string, string>;
}

export interface PersistedSettings {
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
  selectedDocIds?: Record<string, boolean>;
  selectedSourceIds?: string[];
  expandedSources?: Record<string, boolean>;
  sourceFilterQuery?: Record<string, string>;
}

function getLocalStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

function loadPersistedSettings(): Partial<PersistedSettings> {
  const storage = getLocalStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY) || storage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function savePersistedSettings(settings: PersistedSettings) {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Graceful error handling (e.g. QuotaExceededError or SecurityError)
  }
}

function loadPersistedSelections(): Partial<PersistedSelections> {
  const storage = getLocalStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(SELECTION_STORAGE_KEY);
    if (raw) return JSON.parse(raw);

    // Fallback: check if stored inside settings storage
    const settingsRaw = storage.getItem(STORAGE_KEY) || storage.getItem(LEGACY_STORAGE_KEY);
    if (settingsRaw) {
      const parsed = JSON.parse(settingsRaw);
      return {
        selectedDocIds: parsed.selectedDocIds,
        selectedSourceIds: parsed.selectedSourceIds,
        expandedSources: parsed.expandedSources,
        sourceFilterQuery: parsed.sourceFilterQuery,
      };
    }
  } catch {
    return {};
  }
  return {};
}

function savePersistedSelections(selections: PersistedSelections) {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(SELECTION_STORAGE_KEY, JSON.stringify(selections));
  } catch {
    // Graceful error handling (e.g. QuotaExceededError or SecurityError)
  }
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

    const savedSelections = loadPersistedSelections();

    const rawDocIds = savedSelections.selectedDocIds || saved.selectedDocIds;
    if (rawDocIds && typeof rawDocIds === 'object' && !Array.isArray(rawDocIds)) {
      this.selectedDocIds = { ...rawDocIds };
    }

    const rawSourceIds = savedSelections.selectedSourceIds || saved.selectedSourceIds;
    if (Array.isArray(rawSourceIds)) {
      this.selectedSourceIds = [...rawSourceIds];
    }

    const rawExpanded = savedSelections.expandedSources || saved.expandedSources;
    if (rawExpanded && typeof rawExpanded === 'object' && !Array.isArray(rawExpanded)) {
      this.expandedSources = { ...rawExpanded };
    }

    const rawFilter = savedSelections.sourceFilterQuery || saved.sourceFilterQuery;
    if (rawFilter && typeof rawFilter === 'object' && !Array.isArray(rawFilter)) {
      this.sourceFilterQuery = { ...rawFilter };
    }
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
      selectedDocIds: this.selectedDocIds,
      selectedSourceIds: this.selectedSourceIds,
      expandedSources: this.expandedSources,
      sourceFilterQuery: this.sourceFilterQuery,
    });
    this.saveSelections();
  }

  saveSelections() {
    savePersistedSelections({
      selectedDocIds: this.selectedDocIds,
      selectedSourceIds: this.selectedSourceIds,
      expandedSources: this.expandedSources,
      sourceFilterQuery: this.sourceFilterQuery,
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
    this.saveSelections();
  }

  setDocSelected(id: string, selected: boolean) {
    this.selectedDocIds[id] = selected;
    this.saveSelections();
  }

  selectAllDocsForSource(sourceId: string, docIds: string[]) {
    docIds.forEach((id) => {
      this.selectedDocIds[id] = true;
    });
    if (!this.selectedSourceIds.includes(sourceId)) {
      this.selectedSourceIds = [...this.selectedSourceIds, sourceId];
    }
    this.saveSelections();
  }

  deselectAllDocsForSource(sourceId: string, docIds: string[]) {
    docIds.forEach((id) => {
      this.selectedDocIds[id] = false;
    });
    this.selectedSourceIds = this.selectedSourceIds.filter((id) => id !== sourceId);
    this.saveSelections();
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
    this.saveSelections();
  }

  toggleExpandSource(sourceId: string) {
    this.expandedSources[sourceId] = !this.expandedSources[sourceId];
    this.saveSelections();
  }

  setSourceExpanded(sourceId: string, expanded: boolean) {
    this.expandedSources[sourceId] = expanded;
    this.saveSelections();
  }

  setSourceFilterQuery(sourceId: string, query: string) {
    this.sourceFilterQuery[sourceId] = query;
    this.saveSelections();
  }

  resetSelections() {
    this.selectedDocIds = {};
    this.selectedSourceIds = [];
    this.saveSelections();
  }

  pruneDeadIds(validSourceIds: string[], validDocIds?: string[]) {
    const validSrcSet = new Set(validSourceIds);
    this.selectedSourceIds = this.selectedSourceIds.filter((id) => validSrcSet.has(id));
    for (const id of Object.keys(this.expandedSources)) {
      if (!validSrcSet.has(id)) {
        delete this.expandedSources[id];
      }
    }
    for (const id of Object.keys(this.sourceFilterQuery)) {
      if (!validSrcSet.has(id)) {
        delete this.sourceFilterQuery[id];
      }
    }
    if (validDocIds) {
      const validDocSet = new Set(validDocIds);
      for (const id of Object.keys(this.selectedDocIds)) {
        if (!validDocSet.has(id)) {
          delete this.selectedDocIds[id];
        }
      }
    }
    this.saveSelections();
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
}

export const generateStore = new GenerateStore();
