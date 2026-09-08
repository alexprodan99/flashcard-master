export type DataSourceType = 'rss' | 'web' | 'local' | 'sitemap' | 'llms-txt';
export type DifficultyLevel = 'beginner' | 'intermediate' | 'expert' | 'mixed';
export type PersonaType = 'socratic-mentor' | 'strict-examiner' | 'analogy-builder';
export type CardDepthMode = 'atomic' | 'deep-dive' | 'scenario';
export type DocumentExportFormat = 'markdown' | 'html' | 'txt' | 'json' | 'epub';

export interface DataSource {
  id: string;
  name: string;
  type: DataSourceType;
  uri: string;
  targetDeck: string;
  tags: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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
  success: boolean;
  cardsCreated: number;
  totalDraftsGenerated: number;
  duplicatesSkipped: number;
  newCards: Flashcard[];
}

export type JobType = 'generation' | 'sync_all' | 'sync_source' | 'export';
export type JobStatus = 'queued' | 'running' | 'completed' | 'completed_with_warnings' | 'failed' | 'cancelled';
export type JobLogLevel = 'info' | 'warn' | 'error' | 'success';

export interface Job {
  id: string;
  type: JobType;
  title: string;
  status: JobStatus;
  progressCurrent: number;
  progressTotal: number;
  currentStep?: string | null;
  errorMessage?: string | null;
  resultSummary?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface JobLog {
  id: string;
  jobId: string;
  stepNumber: number;
  stepTitle: string;
  level: JobLogLevel;
  message: string;
  details?: Record<string, any> | null;
  timestamp: string;
}