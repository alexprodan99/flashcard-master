export interface TextChunkerOptions {
  maxChunkSize?: number;
  overlapSize?: number;
  chunkMultiplier?: number;
  fullDocument?: boolean;
}

export class TextChunker {
  private readonly defaultMaxChunkSize: number;
  private readonly defaultOverlapSize: number;

  constructor(options: TextChunkerOptions = {}) {
    this.defaultMaxChunkSize = options.maxChunkSize ?? 2000;
    this.defaultOverlapSize = options.overlapSize ?? 200;
  }

  chunkText(text: string, options: TextChunkerOptions = {}): string[] {
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return [];
    }

    const cleanText = text.trim();

    if (options.fullDocument || options.chunkMultiplier === 0) {
      return [cleanText];
    }

    const multiplier = options.chunkMultiplier && options.chunkMultiplier > 0 ? options.chunkMultiplier : 1;
    const baseSize = options.maxChunkSize ?? this.defaultMaxChunkSize;
    const maxSize = Math.round(baseSize * multiplier);
    const overlap = options.overlapSize ?? this.defaultOverlapSize;

    if (cleanText.length <= maxSize) {
      return [cleanText];
    }

    // Split text along paragraph boundaries
    const paragraphs = cleanText.split(/\n+/).map((p) => p.trim()).filter((p) => p.length > 0);
    const chunks: string[] = [];
    let currentChunk = "";

    for (const paragraph of paragraphs) {
      if ((currentChunk + "\n\n" + paragraph).length <= maxSize) {
        currentChunk = currentChunk ? currentChunk + "\n\n" + paragraph : paragraph;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk);
          // Keep trailing text for overlap context
          const overlapSlice = currentChunk.slice(-overlap);
          currentChunk = overlapSlice ? overlapSlice + " " + paragraph : paragraph;
        } else {
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

  private splitBySentences(text: string, maxSize: number, overlap: number): string[] {
    const sentences = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [text];
    const chunks: string[] = [];
    let current = "";

    for (const sentence of sentences) {
      if ((current + " " + sentence).trim().length <= maxSize) {
        current = (current + " " + sentence).trim();
      } else {
        if (current) {
          chunks.push(current);
          const overlapText = current.slice(-overlap);
          current = (overlapText + " " + sentence).trim();
        } else {
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
