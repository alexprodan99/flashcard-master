---
title: 'Automatic Credential Injection in Generation Studio & Workers'
type: 'feature'
created: '2026-09-10'
status: 'done'
baseline_commit: '9d70804'
review_loop_iteration: 1
context:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/prd/prd.md
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Users generating flashcards via Generate Studio, Document Inspector, or background task workers are forced to repeatedly enter API keys or rely on ad-hoc environment variables, even after saving their credentials in the centralized Settings store.

**Approach:**
1. Connect `GenerationConfigFields.svelte` to `settingsStore`:
   - Detect when the active provider has a configured secret (database or environment).
   - Display a clean status badge: `Using saved API key [sk-...4a12] ✓ (Settings)` with a quick action to manage in Settings.
   - Mark API key input as an optional override field (`Leave blank to use saved key...`).
   - Allow user to provide a one-time key override in the form.
2. In `packages/web/src/server.ts` (`POST /api/generate`):
   - Resolve `apiKey` and `endpoint` via `this.settingsService.getSecret(provider)` and `this.settingsService.getEndpoint(provider)` if omitted from request body.
   - If manual override is supplied in request body, give it precedence.
   - If key is missing for key-required providers (OpenAI, Anthropic, Gemini) and endpoint is not a keyless local proxy, reject with descriptive 400 Bad Request.
   - Forward resolved credentials to the worker task payload.
3. In `packages/web/src/workers/task-worker.ts`:
   - Accept the injected `apiKey` and `endpoint` from the task payload.
   - Validate credentials before starting document synthesis, emitting descriptive step errors if missing.
4. Pass `onNavigate` through `GenerateStudio.svelte` and `SourceDocumentInspector.svelte` so clicking "Manage in Settings" switches tabs cleanly.

## Boundaries & Constraints

**Always:**
- Prioritize explicit user input overrides over saved Settings keys, and prioritize database keys over environment variables (`manual > database > environment`).
- Keep raw credentials masked in the UI; never display the plaintext secret in badges or inputs.
- Maintain keyless local OpenAI and Ollama functionality (`localhost` / `127.0.0.1`).
- Provide clear error messaging if a required key is missing, directing users to the Settings view.

**Ask First:**
- Modifying default prompt templates or LLM generation algorithms outside credential resolution.

**Never:**
- Never log raw secrets or API keys in server console logs, task progress events, or worker messages.
- Never block generation for local models (Ollama, local OpenAI) when API key is empty.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Generate with Saved Key | Provider has key in SQLite DB; input is empty | Badge displays `Using saved API key [sk-...xxxx] (Settings)`; generation succeeds without manual entry | Clear error if key revoked |
| Generate with One-Time Override | Key saved in DB; user types `sk-override` in input | Request sends `sk-override`; generation uses override key instead of saved key | Fallback validation on override |
| Keyless Local OpenAI Proxy | Provider is OpenAI; endpoint is `http://localhost:11434/v1`; key is empty | Request succeeds without API key; no missing key validation error | Error if proxy offline |
| Missing Key for Remote Provider | Provider is Gemini; no key in DB or env; input empty | Generation submission returns 400 error: "No API key configured for gemini. Please configure in Settings." | 400 Bad Request with guidance |
| Background Worker Generation | Generation queued as async job | Server resolves secret on main thread, injects into worker task payload, worker executes cleanly | Worker emits error log if key invalid |
| Click "Manage in Settings" in Studio | User clicks link next to saved key badge | Active tab switches to `settings` (`?tab=settings`), allowing immediate credential editing | Preserves form draft in store |

</frozen-after-approval>

## Code Map

- `packages/web/client/src/components/GenerationConfigFields.svelte` -- Add saved key detection, active credential badge, Settings quick-link, and optional override input.
- `packages/web/client/src/views/GenerateStudio.svelte` -- Pass `onNavigate` prop to `GenerationConfigFields`.
- `packages/web/client/src/components/SourceDocumentInspector.svelte` -- Pass `onNavigate` prop to `GenerationConfigFields`.
- `packages/web/src/server.ts` -- In `POST /api/generate`, query `settingsService.getSecret(provider)` and `getEndpoint(provider)` when omitted, validate missing credentials, and inject into worker task payload.
- `packages/web/src/workers/task-worker.ts` -- Ensure `executeGeneration` enforces key validation and uses injected credentials.
- `packages/web/test/credential-injection.test.ts` -- Integration tests for credential injection, overrides, missing credential errors, and worker execution.

## Tasks & Acceptance

**Execution:**
- [x] `packages/web/client/src/components/GenerationConfigFields.svelte` -- Integrate `settingsStore` status badge and override input.
- [x] `packages/web/client/src/views/GenerateStudio.svelte` -- Connect navigation prop to config fields.
- [x] `packages/web/client/src/components/SourceDocumentInspector.svelte` -- Connect navigation prop to config fields.
- [x] `packages/web/src/server.ts` -- Inject credentials from `SettingsService` into generation jobs and sync calls.
- [x] `packages/web/src/workers/task-worker.ts` -- Use injected credentials in worker generation execution.
- [x] `packages/web/test/credential-injection.test.ts` -- Add integration tests for automatic credential injection and manual overrides.

**Acceptance Criteria:**
- Given a provider key saved in Settings, when Generate Studio opens, then the active key badge is visible and input is optional.
- Given a user submitting generation without typing an API key, then the server resolves the saved key from `SettingsService`.
- Given a user typing a one-time API key, then the manual key overrides the saved key for that job.
- Given an unconfigured remote provider with no key, submitting generation returns HTTP 400 directing the user to Settings.
- Given a local OpenAI-compatible endpoint, generation succeeds without an API key.
- All workspace tests (`npm test`) and monorepo build (`npm run build`) pass cleanly.

## Verification

**Commands:**
- `npm test --workspace=@flashcard-master/web` -- expected: All web tests pass including new credential injection tests (126/126 passed).
- `npm run build` at root -- expected: Clean compilation across all workspaces.

## Suggested Review Order

1. [`packages/web/client/src/stores/settingsStore.svelte.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/web/client/src/stores/settingsStore.svelte.ts#L53-L75) -- Added `hasLoaded` flag to prevent duplicate fetches across views.
2. [`packages/web/client/src/components/GenerationConfigFields.svelte`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/web/client/src/components/GenerationConfigFields.svelte#L35-L105) -- Normalized provider derivation, saved key badge with override indicator, and `onNavigate` connection.
3. [`packages/web/client/src/views/GenerateStudio.svelte`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/web/client/src/views/GenerateStudio.svelte#L465-L480) & [`SourceDocumentInspector.svelte`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/web/client/src/components/SourceDocumentInspector.svelte#L500-L515) -- Propagated `onNavigate` handler to `GenerationConfigFields`.
4. [`packages/web/src/server.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/web/src/server.ts#L2150-L2265) -- Resolution of `apiKey` and `endpoint` with priority chain: manual > database > environment; strict 400 validation; forwarding to `JobManager` payload.
5. [`packages/web/src/workers/task-worker.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/web/src/workers/task-worker.ts#L90-L115) -- Fast-fail credential validation with environment variable fallback and local endpoint exemption.
6. [`packages/web/test/credential-injection.test.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/web/test/credential-injection.test.ts#L1-L345) -- 11 comprehensive unit/integration tests covering resolution priority, 400 rejections (Gemini, OpenAI, Anthropic), local OpenAI proxies, async job injection, and real `task-worker` validation.
