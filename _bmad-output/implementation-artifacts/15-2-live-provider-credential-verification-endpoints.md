---
title: 'Live Provider Credential Verification Endpoints'
type: 'feature'
created: '2026-09-10'
status: 'done'
baseline_commit: '7b8c3227bed5d2f0a45c9f8510e2b855d1ac8445'
review_loop_iteration: 0
context:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/prd/prd.md
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Users cannot verify whether entered or stored credentials for Notion and AI providers (OpenAI, Anthropic, Gemini, Ollama) work properly until they trigger a real document sync or card generation run, resulting in silent failures or wasted generation cycles.

**Approach:** Implement `POST /api/settings/keys/test` in `WebServer` supported by a dedicated `ProviderVerifier` in `@flashcard-master/adapters` and `ProviderVerifierPort` in `@flashcard-master/core`. Provide isolated diagnostic probes for Notion (`notion.users.me()`), OpenAI, Anthropic, Gemini, and Ollama with a strict 3-second timeout and actionable status reporting.

## Boundaries & Constraints

**Always:**
- Enforce a strict 3000ms timeout per verification probe via `AbortSignal.timeout(3000)` or controller timer.
- Return `{ success: boolean, message: string, details?: Record<string, any> }` with HTTP 200 for completed diagnostic probes (including auth failures, rate limits, and network errors) so the UI can display inline error banners without treating them as 500 server crashes. Return 400 Bad Request only for malformed requests (e.g. unknown provider).
- If candidate `key` or `endpoint` is omitted in the request body, automatically fallback to stored values in `SettingsService` (`getSecret(provider)` and `getEndpoint(provider)`).
- Provide meaningful diagnostic details: connected bot name and workspace for Notion, model count for OpenAI/Gemini/Anthropic, and installed model tags for Ollama.
- Maintain Ports & Adapters: domain models and `ProviderVerifierPort` in `@flashcard-master/core`, `ProviderVerifier` implementation in `@flashcard-master/adapters`, and REST endpoint wiring in `@flashcard-master/web`.

**Ask First:**
- Adding background automated health checks or polling schedules before Story 15.3.

**Never:**
- Never crash the server or throw unhandled promise rejections on provider network errors, DNS resolution failures, or 401/403 responses.
- Never leak raw unmasked keys or authorization headers in response payloads, log files, or error messages.
- Never consume billable generation tokens; all probes must use zero-token or minimal metadata discovery calls (`users.me`, `models`, `tags`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Test Notion (Valid) | `{ provider: "notion", key: "secret_valid123" }` | `200 OK` `{ success: true, message: "Connected to Notion: Bot \"Flashcard Master\" in \"Workspace\"", details: { botName: "Flashcard Master", workspaceName: "Workspace" } }` | Success |
| Test Notion (Invalid) | `{ provider: "notion", key: "secret_invalid" }` | `200 OK` `{ success: false, message: "Notion authentication failed: invalid API token." }` | 401 mapped to descriptive failure |
| Test OpenAI (Valid) | `{ provider: "openai", key: "sk-valid" }` | `200 OK` `{ success: true, message: "Connected to OpenAI successfully.", details: { modelCount: 45 } }` | Success |
| Test OpenAI (Invalid Key) | `{ provider: "openai", key: "sk-badkey" }` | `200 OK` `{ success: false, message: "OpenAI authentication failed: invalid API key." }` | 401 mapped to descriptive failure |
| Test Anthropic (Valid) | `{ provider: "anthropic", key: "sk-ant-valid" }` | `200 OK` `{ success: true, message: "Connected to Anthropic successfully.", details: { modelCount: 12 } }` | Success |
| Test Anthropic (Invalid) | `{ provider: "anthropic", key: "sk-ant-bad" }` | `200 OK` `{ success: false, message: "Anthropic authentication failed: invalid API key." }` | 401 mapped to descriptive failure |
| Test Gemini (Valid) | `{ provider: "gemini", key: "AIzaSyValid" }` | `200 OK` `{ success: true, message: "Connected to Google Gemini successfully.", details: { modelCount: 28 } }` | Success |
| Test Gemini (Invalid) | `{ provider: "gemini", key: "AIzaSyInvalid" }` | `200 OK` `{ success: false, message: "Google Gemini authentication failed: invalid API key." }` | 400/403 mapped to descriptive failure |
| Test Ollama (Reachable) | `{ provider: "ollama", endpoint: "http://localhost:11434" }` | `200 OK` `{ success: true, message: "Connected to Ollama (2 models installed).", details: { models: ["phi4-mini", "llama3.2"] } }` | Success |
| Test Ollama (Offline) | `{ provider: "ollama", endpoint: "http://localhost:11434" }` (daemon down) | `200 OK` `{ success: false, message: "Cannot connect to Ollama at http://localhost:11434: instance unreachable or offline." }` | ECONNREFUSED handled safely |
| Test Timeout (>3s) | Provider endpoint hangs > 3000ms | `200 OK` `{ success: false, message: "Connection to <provider> timed out after 3 seconds." }` | AbortSignal aborts probe |
| Fallback to Saved Key | `{ provider: "openai" }` (key omitted, DB has key) | Uses stored DB key to test connection | Resolves from `SettingsService` |
| No Key Available | `{ provider: "openai" }` (no candidate, no stored key) | `200 OK` `{ success: false, message: "No API key configured for openai. Please enter a key to test." }` | Friendly guidance |
| Unsupported Provider | `{ provider: "unknown" }` | `400 Bad Request` `{ error: "Unsupported provider \"unknown\"." }` | 400 Validation error |

</frozen-after-approval>

## Code Map

- `packages/core/src/domain/models.ts` -- Add `ProviderVerificationResultSchema` and `ProviderVerificationResult` types.
- `packages/core/src/ports/index.ts` -- Add `ProviderVerifierPort` interface with `verify` signature.
- `packages/core/src/index.ts` -- Export `ProviderVerificationResult`, `ProviderVerificationResultSchema`, `ProviderVerifierPort`.
- `packages/adapters/src/verification/provider-verifier.ts` -- Implement `ProviderVerifier` implementing `ProviderVerifierPort` with isolated verification probes for `notion`, `openai`, `anthropic`, `gemini`, and `ollama` supporting `customFetch` and 3s timeout.
- `packages/adapters/src/index.ts` -- Export `ProviderVerifier`.
- `packages/adapters/test/provider-verifier.test.ts` -- Comprehensive unit tests covering valid credentials, invalid keys, timeouts, network errors, and edge cases.
- `packages/web/src/server.ts` -- Implement `POST /api/settings/keys/test` with input validation, `SettingsService` fallback resolution, and `ProviderVerifier` execution.
- `packages/web/test/settings-api.test.ts` -- Integration tests for `POST /api/settings/keys/test` validating HTTP statuses, probe routing, saved key fallback, and error handling.
- `packages/cli/src/app.ts` -- Add `providerVerifier` to `AppContext`.
- `packages/cli/src/cli.ts` -- Pass `providerVerifier` to `WebServerOptions`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/domain/models.ts` -- Define `ProviderVerificationResult` schema and types.
- [x] `packages/core/src/ports/index.ts` -- Define `ProviderVerifierPort` interface.
- [x] `packages/core/src/index.ts` -- Export verification models and port.
- [x] `packages/adapters/src/verification/provider-verifier.ts` -- Implement `ProviderVerifier` with isolated probes for `notion`, `openai`, `anthropic`, `gemini`, `ollama` and strict 3-second timeout.
- [x] `packages/adapters/src/index.ts` -- Export `ProviderVerifier`.
- [x] `packages/adapters/test/provider-verifier.test.ts` -- Create unit test suite for all provider probes and error modes.
- [x] `packages/web/src/server.ts` -- Implement `POST /api/settings/keys/test` route in `WebServer` with candidate fallback resolution.
- [x] `packages/web/test/settings-api.test.ts` -- Add integration test suite for `POST /api/settings/keys/test`.
- [x] `packages/cli/src/app.ts` & `packages/cli/src/cli.ts` -- Wire `providerVerifier` into `AppContext` and `WebServerOptions`.

**Acceptance Criteria:**
- Given a request to `POST /api/settings/keys/test` with valid credentials, when probed, then it returns `{ success: true, message: string, details: any }` in < 3 seconds.
- Given a request to test `notion`, when token is valid, then it retrieves and returns the bot name and workspace name.
- Given a request to test `ollama`, when daemon is running, then it returns the list of installed local models.
- Given a request with invalid credentials or unreachable network, then it returns 200 with `{ success: false, message: string }` without crashing the server.
- Given a request omitting key or endpoint, then it tests the currently stored key/endpoint from `SettingsService`.
- Given a request for a provider with neither candidate nor stored key, then it returns 200 with `{ success: false, message: "No API key configured for <provider>..." }`.
- Given a request with an invalid provider name, then it returns 400 with a list of supported providers.
- Given all existing tests in `core`, `adapters`, and `web`, all tests continue to pass with zero regressions.

## Design Notes

Probe Implementations:
1. **Notion**:
   - Uses `@notionhq/client` `new Client({ auth: key })`.
   - Calls `client.users.me({})`.
   - Extracts `botName` (`me.name`) and `workspaceName` (`(me as any).bot?.workspace_name`).
2. **OpenAI**:
   - Calls `${baseUrl}/models` with `Authorization: Bearer ${key}`.
   - 200 -> models count in details.
   - 401 -> "OpenAI authentication failed: invalid API key."
   - 429 -> "OpenAI rate limit or quota exceeded."
3. **Anthropic**:
   - Calls `${baseUrl}/models` with `x-api-key: ${key}` and `anthropic-version: 2023-06-01`.
   - If 404 (custom proxies), falls back to 1-token prompt via `/v1/messages`.
   - 200 -> model count in details.
   - 401 -> "Anthropic authentication failed: invalid API key."
4. **Google Gemini**:
   - Calls `${baseUrl}/models?key=${key}`.
   - 200 -> model count in details.
   - 400/403 -> "Google Gemini authentication failed: invalid API key."
5. **Ollama**:
   - Calls `${baseUrl}/api/tags`.
   - 200 -> model names list in details.
   - Network error (e.g. ECONNREFUSED) -> "Cannot connect to Ollama at <baseUrl>: instance unreachable or offline."

Timeout Isolation:
- Every probe creates an `AbortController` aborted after `timeoutMs ?? 3000`.
- Caught abort errors produce `{ success: false, message: `Connection to ${provider} timed out after 3 seconds.` }`.

## Verification

**Commands:**
- `npm test --workspace=@flashcard-master/adapters` -- expected: All adapter tests pass including `provider-verifier.test.ts`.
- `npm test --workspace=@flashcard-master/web` -- expected: All web tests pass including `settings-api.test.ts`.
- `npm run build` at root -- expected: TypeScript compiles across all workspace packages with zero errors.

## Suggested Review Order

**Verification Probes & Adapter Engine**

- Entry point: isolated probe dispatcher coordinating provider verification with timeout enforcement.
  [`provider-verifier.ts:46`](../../packages/adapters/src/verification/provider-verifier.ts#L46)

- Notion SDK integration: authenticates bot, retrieves workspace context, and links abort signal.
  [`provider-verifier.ts:83`](../../packages/adapters/src/verification/provider-verifier.ts#L83)

- OpenAI model discovery probe: validates API key and allows keyless local endpoint verification.
  [`provider-verifier.ts:162`](../../packages/adapters/src/verification/provider-verifier.ts#L162)

- Anthropic probe: checks /v1/models with fallback to minimal message ping for proxies.
  [`provider-verifier.ts:238`](../../packages/adapters/src/verification/provider-verifier.ts#L238)

- Google Gemini probe: authenticates via x-goog-api-key header and prevents credential leakage in URLs.
  [`provider-verifier.ts:352`](../../packages/adapters/src/verification/provider-verifier.ts#L352)

- Ollama probe: queries /api/tags, supports optional bearer token, and formats model catalog.
  [`provider-verifier.ts:433`](../../packages/adapters/src/verification/provider-verifier.ts#L433)

**Diagnostic REST Endpoints**

- POST /api/settings/keys/test route handling candidate testing and stored settings fallback.
  [`server.ts:2919`](../../packages/web/src/server.ts#L2919)

- WebServer dependency injection wiring for ProviderVerifierPort option.
  [`server.ts:57`](../../packages/web/src/server.ts#L57)

**Domain Contracts & Peripherals**

- Domain schema and TypeScript type for verification results.
  [`models.ts:195`](../../packages/core/src/domain/models.ts#L195)

- ProviderVerifierPort contract defining the verification interface.
  [`index.ts:82`](../../packages/core/src/ports/index.ts#L82)

- AppContext wiring ensuring providerVerifier singleton availability.
  [`app.ts:53`](../../packages/cli/src/app.ts#L53)

- CLI server factory forwarding providerVerifier to WebServer.
  [`cli.ts:60`](../../packages/cli/src/cli.ts#L60)

- Comprehensive unit tests covering all 5 provider probes, timeouts, and error mappings.
  [`provider-verifier.test.ts:1`](../../packages/adapters/test/provider-verifier.test.ts#L1)

- Integration tests verifying HTTP routing, fallback resolution, and diagnostic reporting.
  [`settings-api.test.ts:291`](../../packages/web/test/settings-api.test.ts#L291)

