export class TextChunker {
    defaultMaxChunkSize;
    defaultOverlapSize;
    constructor(options = {}) {
        this.defaultMaxChunkSize = options.maxChunkSize ?? 2000;
        this.defaultOverlapSize = options.overlapSize ?? 200;
    }
    chunkText(text, options = {}) {
        if (!text || typeof text !== "string" || text.trim().length === 0) {
            return [];
        }
        const maxSize = options.maxChunkSize ?? this.defaultMaxChunkSize;
        const overlap = options.overlapSize ?? this.defaultOverlapSize;
        const cleanText = text.trim();
        if (cleanText.length <= maxSize) {
            return [cleanText];
        }
        // Split text along paragraph boundaries
        const paragraphs = cleanText.split(/\n+/).map((p) => p.trim()).filter((p) => p.length > 0);
        const chunks = [];
        let currentChunk = "";
        for (const paragraph of paragraphs) {
            if ((currentChunk + "\n\n" + paragraph).length <= maxSize) {
                currentChunk = currentChunk ? currentChunk + "\n\n" + paragraph : paragraph;
            }
            else {
                if (currentChunk) {
                    chunks.push(currentChunk);
                    // Keep trailing text for overlap context
                    const overlapSlice = currentChunk.slice(-overlap);
                    currentChunk = overlapSlice ? overlapSlice + " " + paragraph : paragraph;
                }
                else {
                    // If a single paragraph exceeds maxSize, split by sentences
                    const sentenceChunks = this.splitBySentences(paragraph, maxSize, overlap);
                    chunks.push(...sentenceChunks);
                    currentChunk = "";
                }
            }
        }
        if (currentChunk && currentChunk.trim().length > 0) {
            chunks.push(currentChunk.trim());
        }
        return chunks;
    }
    splitBySentences(text, maxSize, overlap) {
        const sentences = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [text];
        const chunks = [];
        let current = "";
        for (const sentence of sentences) {
            if ((current + " " + sentence).trim().length <= maxSize) {
                current = (current + " " + sentence).trim();
            }
            else {
                if (current) {
                    chunks.push(current);
                    const overlapText = current.slice(-overlap);
                    current = (overlapText + " " + sentence).trim();
                }
                else {
                    // Hard split for unbreakable strings
                    chunks.push(sentence.slice(0, maxSize));
                    current = sentence.slice(maxSize - overlap).trim();
                }
            }
        }
        if (current) {
            chunks.push(current);
        }
        return chunks;
    }
}
//# sourceMappingURL=text-chunker.js.map