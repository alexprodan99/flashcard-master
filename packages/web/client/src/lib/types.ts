export type DataSourceType = 'rss' | 'web' | 'local' | 'sitemap' | 'llms-txt';
export type DifficultyLevel = 'beginner' | 'intermediate' | 'expert';
export type PersonaType = 'socratic-mentor' | 'strict-examiner' | 'analogy-builder';
export type CardDepthMode = 'atomic' | 'deep-dive' | 'scenario';

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