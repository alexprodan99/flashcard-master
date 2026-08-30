import { z } from "zod";
export const DataSourceTypeSchema = z.enum(["rss", "web", "local"]);
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
export const SyncStateSchema = z.object({
    sourceId: z.string().uuid(),
    lastSyncedAt: z.string().datetime(),
    lastGuid: z.string().nullable().optional(),
    contentHash: z.string().nullable().optional(),
    itemCount: z.number().int().nonnegative().default(0),
});
export const DifficultyLevelSchema = z.enum(["beginner", "intermediate", "expert"]);
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
//# sourceMappingURL=models.js.map