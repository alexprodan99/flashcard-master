export class CardDeduplicationService {
    defaultThreshold;
    constructor(options = {}) {
        this.defaultThreshold = options.similarityThreshold ?? 0.80;
    }
    normalizeQuestion(text) {
        if (!text || typeof text !== "string") {
            return "";
        }
        return text
            .toLowerCase()
            // Remove punctuation and special symbols
            .replace(/[^\w\s]/g, "")
            // Collapse whitespace
            .replace(/\s+/g, " ")
            .trim();
    }
    getTokens(text) {
        const norm = this.normalizeQuestion(text);
        if (!norm)
            return new Set();
        return new Set(norm.split(" ").filter((w) => w.length > 0));
    }
    getBigrams(text) {
        const norm = this.normalizeQuestion(text);
        const bigrams = new Set();
        for (let i = 0; i < norm.length - 1; i++) {
            bigrams.add(norm.slice(i, i + 2));
        }
        return bigrams;
    }
    jaccardSimilarity(text1, text2) {
        const tokens1 = this.getTokens(text1);
        const tokens2 = this.getTokens(text2);
        if (tokens1.size === 0 && tokens2.size === 0)
            return 1.0;
        if (tokens1.size === 0 || tokens2.size === 0)
            return 0.0;
        let intersectionSize = 0;
        for (const t of tokens1) {
            if (tokens2.has(t)) {
                intersectionSize++;
            }
        }
        const unionSize = new Set([...tokens1, ...tokens2]).size;
        return unionSize === 0 ? 1.0 : intersectionSize / unionSize;
    }
    diceSimilarity(text1, text2) {
        const norm1 = this.normalizeQuestion(text1);
        const norm2 = this.normalizeQuestion(text2);
        if (norm1 === norm2)
            return 1.0;
        if (norm1.length < 2 || norm2.length < 2)
            return 0.0;
        const bigrams1 = this.getBigrams(text1);
        const bigrams2 = this.getBigrams(text2);
        let intersection = 0;
        for (const bg of bigrams1) {
            if (bigrams2.has(bg)) {
                intersection++;
            }
        }
        return (2 * intersection) / (bigrams1.size + bigrams2.size);
    }
    calculateSimilarity(question1, question2) {
        const norm1 = this.normalizeQuestion(question1);
        const norm2 = this.normalizeQuestion(question2);
        if (norm1 === norm2) {
            return 1.0;
        }
        const jaccard = this.jaccardSimilarity(question1, question2);
        const dice = this.diceSimilarity(question1, question2);
        return Math.max(jaccard, dice);
    }
    filterUnique(newCandidates, existingCards = [], options = {}) {
        const threshold = options.similarityThreshold ?? this.defaultThreshold;
        const unique = [];
        const duplicates = [];
        for (const candidate of newCandidates) {
            let isDup = false;
            // 1. Check against existing cards in deck
            for (const existing of existingCards) {
                const sim = this.calculateSimilarity(candidate.question, existing.question);
                if (sim >= threshold) {
                    duplicates.push({
                        candidate,
                        matchedWith: existing,
                        similarity: sim,
                        reason: `Matches existing card in deck with ${(sim * 100).toFixed(1)}% similarity.`,
                    });
                    isDup = true;
                    break;
                }
            }
            if (isDup)
                continue;
            // 2. Check against already accepted candidates in this batch (intra-batch deduplication)
            for (const accepted of unique) {
                const sim = this.calculateSimilarity(candidate.question, accepted.question);
                if (sim >= threshold) {
                    duplicates.push({
                        candidate,
                        matchedWith: accepted,
                        similarity: sim,
                        reason: `Duplicate of another card in the same generation batch (${(sim * 100).toFixed(1)}% similarity).`,
                    });
                    isDup = true;
                    break;
                }
            }
            if (!isDup) {
                unique.push(candidate);
            }
        }
        return { unique, duplicates };
    }
}
//# sourceMappingURL=card-deduplication-service.js.map