# Story 5.1: Web UI AI Card Generation Studio

**Epic:** Epic 5 - Interactive Web Generation Studio & In-Browser AI Workflows  
**Status:** in-progress  
**Date:** 2026-08-31  

---

## 1. Story Overview

### User Story
> **As a learner using the Web UI Dashboard,**  
> I want an interactive **"⚡ Generate Studio"** tab / modal in the browser where I can select my AI Provider (`Ollama`, `Gemini`, `OpenAI`, `Anthropic`), customize the Model, pick a Learning Persona, and set Difficulty,  
> **So that I can generate new grounded flashcards directly in the browser with live visual feedback.**

---

## 2. Technical Scope & Architecture

### Backend Endpoints
- `POST /api/generate`:
  - **Body:**
    ```json
    {
      "sourceId": "optional-uuid",
      "provider": "ollama | gemini | openai | anthropic",
      "model": "optional-model-name",
      "apiKey": "optional-api-key",
      "endpoint": "optional-custom-base-url",
      "persona": "socratic-mentor | strict-examiner | analogy-builder",
      "difficulty": "beginner | intermediate | expert",
      "targetDeck": "optional-deck-override",
      "limit": 5
    }
    ```
  - **Handler Logic:**
    1. Instantiates `createLLMAdapter({ provider, model, apiKey, baseUrl: endpoint })`.
    2. Runs `CardGenerationService.generateFromDocument` on ingested documents from target source(s).
    3. Runs `GroundingGuard` to verify verbatim citations.
    4. Runs `CardDeduplicationService` against existing deck cards.
    5. Persists non-duplicate grounded cards to SQLite via `FlashcardRepository`.
    6. Returns execution summary `{ success: true, cardsCreated, discardedUngrounded, duplicatesSkipped, newCards }`.

### Frontend Web UI Component
- Add **`⚡ Generate Cards`** studio tab (`#view-generate` and `#nav-generate`).
- Dynamic provider selector with automatic model defaults:
  - `Ollama (Local & Free)` -> `phi4-mini` (Local endpoint `http://localhost:11434`)
  - `Google Gemini` -> `gemini-2.0-flash`
  - `OpenAI` -> `gpt-4o-mini`
  - `Anthropic` -> `claude-3-5-haiku-latest`
- Custom model input override.
- Password input for cloud API keys (auto-populates from environment if left blank).
- Persona selector with visual badges (`Socratic Mentor`, `Strict Examiner`, `Analogy Builder`).
- Difficulty selector (`Beginner`, `Intermediate`, `Expert`).
- Source picker (all active sources or a specific source).
- Live generation progress indicator with spinning state and summary card preview.

---

## 3. Acceptance Criteria

- [ ] **AC1 — REST Generation Endpoint:** `POST /api/generate` runs full card generation pipeline and persists grounded cards.
- [ ] **AC2 — Web UI Generation Studio:** Interactive form with provider, model, persona, difficulty, and source selection.
- [ ] **AC3 — Live Generation Feedback:** Loading states, animated spinner, and success summary toast with newly generated card previews.
- [ ] **AC4 — Automated Integration Tests:** Integration tests in `packages/web/test/server.test.ts` verifying `/api/generate` with mocked LLM adapter.
