export interface DuplicateMatch<T> {
    candidate: T;
    matchedWith: any;
    similarity: number;
    reason: string;
}
export interface DeduplicationResult<T> {
    unique: T[];
    duplicates: DuplicateMatch<T>[];
}
export interface CardDeduplicationOptions {
    similarityThreshold?: number;
}
export declare class CardDeduplicationService {
    private readonly defaultThreshold;
    constructor(options?: CardDeduplicationOptions);
    normalizeQuestion(text: string): string;
    private getTokens;
    private getBigrams;
    jaccardSimilarity(text1: string, text2: string): number;
    diceSimilarity(text1: string, text2: string): number;
    calculateSimilarity(question1: string, question2: string): number;
    filterUnique<T extends {
        question: string;
    }>(newCandidates: T[], existingCards?: Array<{
        question: string;
    }>, options?: CardDeduplicationOptions): DeduplicationResult<T>;
}
//# sourceMappingURL=card-deduplication-service.d.ts.map