# Schema Extensions Specification

This companion defines the exact Zod schema additions and database migration requirements for the enriched flashcard model.

---

## 1. Zod Domain Schema Updates (`@flashcard-master/core`)

### `CardGenerationDraftSchema`
```typescript
import { z } from "zod";
import { DifficultyLevelSchema } from "./difficulty.js";

export const CardGenerationDraftSchema = z.object({
  question: z
    .string()
    .trim()
    .min(5)
    .describe("Clear, self-contained, atomic prompt or question focusing on a single core concept."),
  answer: z
    .string()
    .trim()
    .min(1)
    .describe("Comprehensive, factually accurate answer directly addressing the question."),
  citation: z
    .string()
    .trim()
    .min(1)
    .describe("Exact verbatim excerpt quoted from the source text grounding this flashcard."),
  keywords: z
    .array(z.string().trim().min(1))
    .min(1)
    .describe("List of 2 to 5 atomic semantic keywords or key terms for rapid revision drills."),
  sourceLocator: z
    .string()
    .trim()
    .min(1)
    .describe("Document locator coordinate (e.g., section heading, page number, URI, or block ID) where the citation originates."),
  difficulty: DifficultyLevelSchema.optional().describe("Cognitive difficulty level (recall, comprehension, application, analysis).")
});

export type CardGenerationDraft = z.infer<typeof CardGenerationDraftSchema>;
```

---

## 2. SQLite Database Migration

### Schema Modification
Table `cards` receives two new columns:
```sql
ALTER TABLE cards ADD COLUMN keywords TEXT DEFAULT '[]';
ALTER TABLE cards ADD COLUMN source_locator TEXT DEFAULT '';
```

### Serialization & Repository Layer
- `keywords` is stored as a JSON string array (`JSON.stringify(card.keywords)`) and parsed on read (`JSON.parse(row.keywords || '[]')`).
- `source_locator` maps directly to `row.source_locator || ''`.
- Existing historical cards without these fields default gracefully to `keywords: []` and `sourceLocator: ""` when instantiated by `CardRepository`.

---

## 3. UI Surface Integration
- **Question Explorer:** Displays keyword pill tags beneath card question.
- **Card Drawer Editor:** Allows viewing and editing keywords and source locator.
- **Task Center Stream:** Shows live keyword counts as cards are progressively generated.
