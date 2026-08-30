export class GroundingGuard {
    minQuoteLength;
    constructor(options = {}) {
        this.minQuoteLength = options.minQuoteLength ?? 15;
    }
    normalizeText(text) {
        if (!text || typeof text !== "string") {
            return "";
        }
        return text
            // 1. Normalize unicode quotes and apostrophes
            .replace(/[\u201C\u201D\u201E\u00AB\u00BB]/g, '"')
            .replace(/[\u2018\u2019]/g, "'")
            // 2. Normalize unicode dashes and hyphens
            .replace(/[\u2013\u2014\u2015]/g, "-")
            // 3. Normalize multiple whitespace and newlines
            .replace(/\s+/g, " ")
            .trim();
    }
    verifyDraft(draft, sourceText) {
        if (!draft.sourceQuote || typeof draft.sourceQuote !== "string") {
            return {
                isValid: false,
                failureReason: "Card draft is missing a sourceQuote citation.",
                matchConfidence: 0.0,
            };
        }
        const rawQuote = draft.sourceQuote.trim();
        if (rawQuote.length < this.minQuoteLength) {
            return {
                isValid: false,
                failureReason: `Source quote is too short (${rawQuote.length} chars, minimum is ${this.minQuoteLength}).`,
                matchConfidence: 0.0,
            };
        }
        if (!sourceText || typeof sourceText !== "string") {
            return {
                isValid: false,
                failureReason: "Source text is empty or invalid.",
                matchConfidence: 0.0,
            };
        }
        // Tier 1: Exact verbatim substring match
        if (sourceText.includes(rawQuote)) {
            return {
                isValid: true,
                matchedQuote: rawQuote,
                matchConfidence: 1.0,
            };
        }
        // Tier 2: Match after stripping outer quotation marks
        const unquoted = rawQuote.replace(/^["'“”]/, "").replace(/["'“”]$/, "").trim();
        if (unquoted.length >= this.minQuoteLength && sourceText.includes(unquoted)) {
            return {
                isValid: true,
                matchedQuote: unquoted,
                matchConfidence: 0.98,
            };
        }
        // Tier 3: Normalized whitespace and punctuation match
        const normSource = this.normalizeText(sourceText);
        const normQuote = this.normalizeText(rawQuote);
        if (normSource.includes(normQuote)) {
            return {
                isValid: true,
                matchedQuote: normQuote,
                matchConfidence: 0.95,
            };
        }
        return {
            isValid: false,
            failureReason: "Source quote was not found verbatim in the provided text.",
            matchConfidence: 0.0,
        };
    }
    filterValidDrafts(drafts, sourceText) {
        return drafts.filter((draft) => {
            const result = this.verifyDraft(draft, sourceText);
            if (!result.isValid) {
                console.warn(`[GroundingGuard] Discarded ungrounded card: "${draft.question}". Reason: ${result.failureReason}`);
                return false;
            }
            return true;
        });
    }
}
//# sourceMappingURL=grounding-guard.js.map