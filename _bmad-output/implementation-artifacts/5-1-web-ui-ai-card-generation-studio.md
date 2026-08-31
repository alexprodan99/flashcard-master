# Story 5.1: Web UI AI Card Generation Studio

**Epic:** Epic 5 - Interactive Web Generation Studio & In-Browser AI Workflows  
**Status:** done  
**Date:** 2026-08-31  

---

## 1. Story Overview

### User Story
> **As a learner using the Web UI Dashboard,**  
> I want an interactive **"⚡ Generate Studio"** tab in the browser where I can select my AI Provider (`Ollama`, `Gemini`, `OpenAI`, `Anthropic`), pick or customize the Model, choose a Learning Persona, and set Difficulty,  
> **So that I can generate new grounded flashcards from single, multiple, or all active sources directly in the browser with live visual feedback.**

---

## 2. Technical Scope & Architecture

### Backend Endpoints
- `POST /api/generate`:
  - **Body:**
    ```json
    {
      "sourceIds": ["optional-uuid-1", "optional-uuid-2"],
      "sourceId": "optional-single-uuid",
      "provider": "ollama | gemini | openai | anthropic",
      "model": "optional-custom-model-name",
      "apiKey": "optional-transient-api-key",
      "endpoint": "optional-custom-base-url",
      "persona": "socratic-mentor | strict-examiner | analogy-builder",
      "difficulty": "beginner | intermediate | expert",
      "targetDeck": "optional-deck-override",
      "limit": 5
    }
    ```
  - **Handler Logic:**
    1. Instantiates `createLLMAdapter({ provider, model, apiKey, baseUrl: endpoint })`.
    2. Gathers targeted active data sources based on `sourceIds`, `sourceId`, or all active sources.
    3. Fetches documents using registered `IngestionStrategy` and cleans text.
    4. Runs `CardGenerationService.generateFromDocument` on ingested text.
    5. Runs `GroundingGuard` to verify verbatim citations against source text.
    6. Runs `CardDeduplicationService` against existing deck cards.
    7. Persists non-duplicate grounded cards to SQLite via `FlashcardRepository`.
    8. Returns execution summary `{ success: true, cardsCreated, totalDraftsGenerated, duplicatesSkipped, newCards }`.

### Frontend Web UI Component
- Add **`⚡ Generate Studio`** navigation item and view container (`#view-generate` & `#nav-generate`).
- Dynamic provider dropdown with automatic model presets:
  - `Ollama (Local & Free)` -> `phi4-mini` (Local endpoint `http://127.0.0.1:11434`)
  - `Google Gemini` -> `gemini-2.0-flash`
  - `OpenAI` -> `gpt-4o-mini`
  - `Anthropic` -> `claude-3-5-haiku-latest`
- Custom model input allowing arbitrary model text overrides.
- Optional API key input (shown for cloud providers, auto-fallback to server environment variables if blank).
- Learning persona selector with description callouts (`Socratic Mentor`, `Strict Examiner`, `Analogy Builder`).
- Difficulty selector (`Beginner`, `Intermediate`, `Expert`).
- Source selection (All Active Sources, Single Source, or Multi-select).
- Live generation progress indicator with spinning state and summary card preview.

---

## 3. Acceptance Criteria

- [x] **AC1 — REST Generation Endpoint:**
  - **Given** valid generation parameters sent to `POST /api/generate`
  - **When** the endpoint processes documents with `CardGenerationService`, `GroundingGuard`, and `CardDeduplicationService`
  - **Then** grounded unique flashcards are saved to SQLite and returned in the JSON response with metric counts.
- [x] **AC2 — Web UI Generation Studio:**
  - **Given** the user navigates to the "⚡ Generate Studio" tab
  - **When** selecting a provider (Ollama, Gemini, OpenAI, Anthropic)
  - **Then** default model fields update automatically, API key inputs toggle dynamically, and custom model overrides are supported.
- [x] **AC3 — Multi-Source Selection & Deck Routing:**
  - **Given** the user configures source scope (All, Single, or Selected) and target deck
  - **When** generation executes
  - **Then** flashcards are correctly generated from the targeted sources and routed to the specified deck.
- [x] **AC4 — Live Generation Feedback & Optimistic UI Update:**
  - **Given** generation is triggered
  - **When** waiting for LLM completion
  - **Then** an animated spinner is displayed, followed by real-time metric reporting and preview cards, with dashboard KPIs updating dynamically.
- [x] **AC5 — Automated Integration Tests:**
  - **Given** test suites in `packages/web/test/server.test.ts`
  - **When** `npm test` executes
  - **Then** all `/api/generate` integration tests pass with 100% assertions.

