export type DataSourceType = 'rss' | 'web' | 'local' | 'sitemap' | 'llms-txt' | 'notion';
export type DifficultyLevel = 'beginner' | 'intermediate' | 'expert' | 'mixed';
export type PersonaType = 'socratic-mentor' | 'strict-examiner' | 'analogy-builder';
export type CardDepthMode = 'atomic' | 'deep-dive' | 'scenario';
export type DocumentExportFormat = 'markdown' | 'html' | 'txt' | 'json' | 'epub';

export interface DataSource {
  id: string;
  name: string;
  type: DataSourceType;
  uri: string;
  tags: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type SlicingMode = 'outline' | 'budget' | 'none';

export interface DocumentSlicingOptions {
  mode?: SlicingMode;
  pagesPerChunk?: number;
  wordsPerChunk?: number;
  minChunkWords?: number;
}

export interface DiscoveredDocument {
  id: string;
  sourceId: string;
  title: string;
  url?: string | null;
  textContent: string;
  contentHash?: string | null;
  wordCount: number;
  cardCount?: number;
  startPage?: number | null;
  endPage?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Flashcard {
  id: string;
  sourceId: string;
  question: string;
  answer: string;
  sourceQuote: string;
  sourceOriginUrl?: string;
  documentTitle?: string;
  difficulty: DifficultyLevel;
  personaUsed: string;
  targetDeck: string;
  tags: string[];
  keywords?: string[];
  sourceLocator?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  totalCards: number;
  totalSources: number;
  activeSources: number;
  totalDecks: number;
  decks: Record<string, number>;
  difficulties: Record<DifficultyLevel, number>;
  recentSources: DataSource[];
}

export interface GenerationResult {
  success?: boolean;
  cardsCreated: number;
  totalDraftsGenerated?: number;
  duplicatesSkipped: number;
  newCards: Flashcard[];
  errorsCount?: number;
}

export type JobType = 'generation' | 'sync_all' | 'sync_source' | 'export' | 'generate' | 'sync';
export type JobStatus = 'queued' | 'running' | 'completed' | 'completed_with_warnings' | 'failed' | 'cancelled';
export type JobLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success';

export interface Job {
  id: string;
  type: JobType;
  title?: string;
  status: JobStatus;
  totalSteps?: number;
  currentStep?: number | string | null;
  progressPercent?: number;
  currentStepName?: string | null;
  metadata?: Record<string, any> | null;
  resultSummary?: Record<string, any> | null;
  errorMessage?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  updatedAt?: string | null;
  // UI computed and legacy fallback fields
  progressCurrent?: number;
  progressTotal?: number;
  progress?: number;
  stepName?: string;
  payload?: any;
  result?: any;
  error?: any;
  workerPid?: number;
  priority?: number;
}

export interface JobLog {
  id: string | number;
  jobId: string;
  stepNumber?: number;
  stepTitle?: string;
  step?: string;
  level: JobLogLevel;
  message: string;
  details?: Record<string, any> | null;
  timestamp: string;
}

export type SecretProvider = 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'notion';
export type KeySource = 'database' | 'environment' | 'none';

export interface ProviderKeyStatus {
  provider: SecretProvider;
  isConfigured: boolean;
  maskedValue: string;
  source: KeySource;
  endpoint?: string | null;
  updatedAt?: string;
}

export interface ProviderVerificationResult {
  success: boolean;
  message: string;
  details?: Record<string, any>;
}

export interface LoggingSettings {
  verbose: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}