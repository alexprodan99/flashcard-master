import type Database from "better-sqlite3";
import { type Flashcard, type DifficultyLevel } from "../domain/models.js";
export interface CardFilter {
    targetDeck?: string;
    sourceId?: string;
    difficulty?: DifficultyLevel;
    tag?: string;
}
export declare class FlashcardRepository {
    private readonly db;
    constructor(db: Database.Database);
    private mapRowToFlashcard;
    create(card: Omit<Flashcard, "id" | "createdAt" | "updatedAt">): Flashcard;
    createBatch(cards: Array<Omit<Flashcard, "id" | "createdAt" | "updatedAt">>): Flashcard[];
    getById(id: string): Flashcard | null;
    list(filter?: CardFilter): Flashcard[];
    update(id: string, updates: Partial<Omit<Flashcard, "id" | "createdAt">>): Flashcard | null;
    delete(id: string): boolean;
    deleteBySourceId(sourceId: string): number;
    listDecks(): string[];
    count(filter?: CardFilter): number;
}
//# sourceMappingURL=card-repository.d.ts.map