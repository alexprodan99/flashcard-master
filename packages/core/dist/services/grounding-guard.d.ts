import type { CardGenerationDraft } from "../ports/index.js";
export interface GroundingVerificationResult {
    isValid: boolean;
    matchedQuote?: string;
    failureReason?: string;
    matchConfidence: number;
}
export interface GroundingGuardOptions {
    minQuoteLength?: number;
}
export declare class GroundingGuard {
    private readonly minQuoteLength;
    constructor(options?: GroundingGuardOptions);
    normalizeText(text: string): string;
    verifyDraft(draft: CardGenerationDraft, sourceText: string): GroundingVerificationResult;
    filterValidDrafts<T extends CardGenerationDraft>(drafts: T[], sourceText: string): T[];
}
//# sourceMappingURL=grounding-guard.d.ts.map