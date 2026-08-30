# Product Brief Addendum: Technical Depth & Roadmap

**Project:** flashcard-master  
**Document:** Technical Addendum & Future Roadmap  
**Date:** 2026-08-30  

---

## 1. Technical Design Invariants

### Ingestion Strategy Pattern
Each data source implements a common interface:
```typescript
interface IngestionStrategy {
  canHandle(source: DataSource): boolean;
  fetch(source: DataSource, lastSyncState?: SyncState): Promise<RawDocument[]>;
  extractCleanText(raw: RawDocument): CleanTextDocument;
}
```
- `RssIngestionStrategy`: Parses RSS/Atom XML feeds, extracts article URLs and metadata, and filters out already-processed GUIDs.
- `WebArticleIngestionStrategy`: Fetches HTML, applies reader-mode extraction (stripping navbars, ads, boilerplate), and normalizes text.
- `LocalFileIngestionStrategy`: Recursively globs local file trees, extracts text/markdown, and computes file SHA-256 checksums to detect modifications.

### Card Data Model (SQLite Schema)
```sql
CREATE TABLE data_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'rss', 'web', 'local'
  uri TEXT NOT NULL,
  target_deck TEXT NOT NULL DEFAULT 'Default',
  tags TEXT, -- JSON array
  last_synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE flashcards (
  id TEXT PRIMARY KEY,
  source_id TEXT REFERENCES data_sources(id),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  source_quote TEXT NOT NULL,
  source_origin_url TEXT,
  difficulty TEXT NOT NULL, -- 'beginner', 'intermediate', 'expert'
  persona_used TEXT,
  target_deck TEXT,
  tags TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sync_state (
  source_id TEXT PRIMARY KEY REFERENCES data_sources(id),
  cursor_guid TEXT,
  content_hash TEXT,
  last_item_timestamp TIMESTAMP
);
```

---

## 2. Prompt Persona Architecture

The generation engine provides selectable personas to calibrate cognitive depth:
1. **Socratic Mentor (`socratic-mentor`):** Prioritizes foundational principles, mental models, structural invariants, and "why" questions.
2. **Strict Technical Examiner (`strict-examiner`):** Prioritizes syntax precision, edge cases, failure domains, complexity trade-offs, and protocol specifications.
3. **Executive Synthesizer (`executive-synthesizer`):** Prioritizes high-level implications, strategic choices, and system design summaries.

---

## 3. Future Roadmap (Parked Items for v2+)

1. **Rich Card Formats:**
   - **Cloze Deletion:** Automatic contextual `{{c1::key term}}` generation for fast recognition.
   - **Multiple Choice:** Distractor generation for testing nuanced differences between similar concepts.
2. **Multimodal Ingestion:**
   - **YouTube & Podcast Audio Ingestion:** Automatic transcription (via Whisper) and timestamp-cited card extraction.
   - **Diagram & PDF OCR Ingestion:** Processing technical charts, architecture diagrams, and mathematical notation.
3. **Semantic De-duplication:**
   - Vector embedding similarity checks (using local embeddings) to detect redundant questions across multiple articles before inserting into DB.
4. **Cloud / P2P Deck Sync:**
   - Encrypted cloud backup or sync across multiple workstations.
