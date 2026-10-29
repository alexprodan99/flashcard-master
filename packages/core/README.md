# @flashcard-master/core

[![npm version](https://img.shields.io/npm/v/@flashcard-master/core.svg?style=flat-square&color=blue)](https://www.npmjs.com/package/@flashcard-master/core)
[![license](https://img.shields.io/badge/license-AGPL--3.0-blue.svg?style=flat-square)](https://github.com/alexprodan99/flashcard-master/blob/main/LICENSE)
[![docs](https://img.shields.io/badge/docs-GitHub%20Pages-green.svg?style=flat-square)](https://alexprodan99.github.io/flashcard-master/)

Domain kernel, SQLite storage engine, grounding verification guard, and card generation services for **Flashcard Master**.

---

## 🏛️ Architecture Overview

`@flashcard-master/core` implements the domain logic and ports of Flashcard Master's Hexagonal (Ports & Adapters) architecture:

- **Strict Factual Grounding (`GroundingGuard`)**: Cryptographically verifies that every synthesized flashcard includes an exact, verbatim substring citation from the source material. Rejects hallucinated, paraphrased, or altered quotes.
- **Adaptive Synthesis (`CardGenerationService`)**: Handles quota-guaranteed oversampling and bounded backfill loops so your requested card density is delivered reliably.
- **Local-First SQLite Engine**: High-performance transactional repositories (`better-sqlite3`) utilizing SQLite Write-Ahead Logging (WAL) mode for atomic multi-reader concurrency.
- **Semantic Text Chunker (`TextChunker`)**: Partitions large documents, EPUB chapters, and Notion blocks into optimal token windows without splitting key paragraphs or sentences.
- **Centralized Settings Hierarchy (`SettingsService`)**: Unified 3-tier configuration resolution (`SQLite database -> process.env fallback -> Hardcoded defaults`).

---

## 📦 Installation

```bash
npm install @flashcard-master/core
```

---

## 💻 Programmatic Usage

### 1. Initialize SQLite Database & Repositories
```typescript
import { createDatabaseClient, FlashcardRepository, DataSourceRepository } from "@flashcard-master/core";

// Initialize SQLite with WAL mode enabled
const db = createDatabaseClient("~/.flashcard-master/flashcards.db");

const cardRepo = new FlashcardRepository(db);
const sourceRepo = new DataSourceRepository(db);

// Retrieve all cards in a deck
const cards = cardRepo.findByDeck("Neuroscience");
console.log(`Loaded ${cards.length} cards from deck.`);
```

### 2. Verify Verbatim Quote Grounding
```typescript
import { GroundingGuard } from "@flashcard-master/core";

const sourceText = "Spaced repetition is an evidence-based learning technique that incorporates increasing intervals of time between subsequent review.";

const isValid = GroundingGuard.verifyQuote(
  sourceText,
  "Spaced repetition is an evidence-based learning technique"
);

console.log("Is quote grounded?", isValid); // true
```

### 3. Chunk Text for LLM Synthesis
```typescript
import { TextChunker } from "@flashcard-master/core";

const chunker = new TextChunker({ maxChunkTokens: 500, overlapTokens: 50 });
const chunks = chunker.chunkText(documentText);

for (const chunk of chunks) {
  console.log(`Chunk #${chunk.index} tokens: ${chunk.tokenCount}`);
}
```

---

## 📚 Documentation

For complete API references and architectural invariants, visit the official **[Flashcard Master Architecture Guide](https://alexprodan99.github.io/flashcard-master/architecture)**.

---

## 📄 License

GNU Affero General Public License v3.0 ([AGPL-3.0](https://github.com/alexprodan99/flashcard-master/blob/main/LICENSE)).
