import { z } from "zod";

export const DataSourceTypeSchema = z.enum(["rss", "web", "local"]);
export type DataSourceType = z.infer<typeof DataSourceTypeSchema>;

export const DataSourceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  type: DataSourceTypeSchema,
  uri: z.string().min(1),
  targetDeck: z.string().default("Default"),
  tags: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});
export type DataSource = z.infer<typeof DataSourceSchema>;

export const SyncStateSchema = z.object({
  sourceId: z.string().uuid(),
  lastSyncedAt: z.string().datetime(),
  lastGuid: z.string().nullable().optional(),
  contentHash: z.string().nullable().optional(),
  itemCount: z.number().int().nonnegative().default(0),
});
export type SyncState = z.infer<typeof SyncStateSchema>;

export const DifficultyLevelSchema = z.enum(["beginner", "intermediate", "expert"]);
export type DifficultyLevel = z.infer<typeof DifficultyLevelSchema>;

export const PersonaTypeSchema = z.enum(["socratic-mentor", "strict-examiner", "executive-synthesizer"]);
export type PersonaType = z.infer<typeof PersonaTypeSchema>;

export const PersonaDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  systemPrompt: z.string().min(10),
  isBuiltIn: z.boolean().default(false),
});
export type PersonaDefinition = z.infer<typeof PersonaDefinitionSchema>;

export const FlashcardSchema = z.object({
  id: z.string().uuid(),
  sourceId: z.string().uuid().nullable().optional(),
  question: z.string().min(1),
  answer: z.string().min(1),
  sourceQuote: z.string().min(1),
  sourceOriginUrl: z.string().nullable().optional(),
  difficulty: DifficultyLevelSchema.default("intermediate"),
  personaUsed: z.string().default("socratic-mentor"),
  targetDeck: z.string().default("Default"),
  tags: z.array(z.string()).default([]),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});
export type Flashcard = z.infer<typeof FlashcardSchema>;

export interface RawDocument {
  id: string;
  sourceId: string;
  title: string;
  rawContent: string;
  originUrl?: string;
  publishedAt?: string;
  guid?: string;
}

export interface CleanTextDocument {
  id: string;
  sourceId: string;
  title: string;
  textContent: string;
  originUrl?: string;
  contentHash: string;
}
