---
title: 'Interactive Dynamic URL List Manager in UI'
type: 'feature'
created: '2026-09-05'
status: 'done'
baseline_commit: 'b4d07573b6a78205fe5077a643d136d7e0aa63d7'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Users currently have to enter web URLs into a single plain text input with no bulk paste, list preview, or per-URL removal, making managing collections of web articles tedious and error-prone.

**Approach:** Build a reusable `<UrlListManager.svelte>` component with single-entry, smart bulk paste, duplicate detection, and per-item removal, and integrate it into `AddSourceModal.svelte`, `EditSourceModal.svelte`, and `SourcesView.svelte`.

## Boundaries & Constraints

**Always:**
- Automatically parse and validate URLs with `http://` or `https://` protocol prefix.
- Deduplicate newly added or pasted URLs against existing items in the list.
- Support both single URL string and JSON array format for `source.uri`.
- Provide clear visual indicators for URL count and duplicate warnings.

**Ask First:**
- Adding external UI library dependencies (keep native Svelte 5 and CSS).

**Never:**
- Never crash or lock up the UI on pasting large lists of URLs (e.g. 50+ lines).
- Never allow adding empty, whitespace-only, or invalid non-HTTP strings.
- Never silently drop valid URLs without user feedback.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Single URL Add | User enters `https://example.com/p1` and presses Enter | Adds URL chip, clears input, increments count badge to 1 | Input refocuses |
| Multiline Bulk Paste | User pastes 5 lines with URLs and whitespace | Parses 5 URLs, adds all 5 as chips, clears input | Strips trailing slashes/spaces |
| Comma-Separated Paste | User pastes `https://a.com, https://b.com` | Parses and adds 2 distinct URL chips | Correctly tokenized |
| Duplicate URL Attempt | User adds URL already present in list | Warning message displayed: "URL already in list" | Does not add duplicate |
| Invalid / Non-HTTP String | User enters `ftp://server` or `not-a-url` | Error message displayed: "Please enter a valid HTTP(S) URL" | Does not add item |
| Remove Single URL | User clicks `✕` on a URL chip | Removes targeted URL from list, updates badge count | List refreshes instantly |
| Clear All URLs | User clicks "Clear All" with 3 URLs | Confirms or empties list back to 0 items | Reset to empty state |
| Edit Existing Source | Web source opened in edit modal | Pre-populates URL list from existing `uri` (JSON or string) | Allows add/remove before saving |

</frozen-after-approval>

## Code Map

- `packages/web/client/src/components/UrlListManager.svelte` -- Reusable interactive URL manager component (chips, add input, bulk paste, duplicate warning, count badge).
- `packages/web/client/src/components/AddSourceModal.svelte` -- Integrates `UrlListManager` when source type is `web`.
- `packages/web/client/src/components/EditSourceModal.svelte` -- New modal for editing source details and modifying multi-URL lists.
- `packages/web/client/src/views/SourcesView.svelte` -- Displays multi-URL indicator in table and provides "✏️ Edit" action button.
- `packages/web/client/src/lib/api.ts` -- API client method `updateSource(id, payload)`.
- `packages/web/src/server.ts` -- Backend endpoint `PATCH` / `PUT` `/api/sources/:id`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/web/client/src/components/UrlListManager.svelte` -- Create component with URL input, Enter key trigger, smart multiline/comma bulk paste listener, duplicate detection, URL count badge, and per-item remove `✕`.
- [x] `packages/web/client/src/lib/api.ts` -- Add `updateSource(id, payload)` helper for updating data source metadata and `uri`.
- [x] `packages/web/src/server.ts` -- Ensure `PUT` and `PATCH` methods for `/api/sources/:id` properly parse and persist updated `uri`, `name`, `targetDeck`, and `tags`.
- [x] `packages/web/client/src/components/AddSourceModal.svelte` -- Integrate `UrlListManager` for `type === 'web'`, serializing URL list to JSON array or single string on submit.
- [x] `packages/web/client/src/components/EditSourceModal.svelte` -- Create edit source modal allowing editing source name, target deck, tags, and multi-URL list.
- [x] `packages/web/client/src/views/SourcesView.svelte` -- Add "✏️ Edit" action button opening `EditSourceModal`, and format multi-URL source URIs with count badges.
- [x] `packages/web/test/server.test.ts` -- Add integration tests for updating source with multi-URL JSON array payload.

**Acceptance Criteria:**
- Given the Add Source Modal with source type "web"
- When user pastes 3 lines of valid URLs into the URL input
- Then 3 interactive URL chips are rendered with a "3 URLs" counter badge.
- Given an existing web data source
- When user clicks "✏️ Edit" in the Sources View, adds a new URL, and clicks "Save Changes"
- Then the source `uri` is updated on the server and reflected in the UI without page reload.

## Spec Change Log

_None._

## Design Notes

### URL List Representation
When saving a `web` data source, if `urls.length === 1`, it can be stored as either a JSON array or single URL string; when `urls.length > 1`, it is stored as `JSON.stringify(urls)`. When loading a source with single URL string `https://example.com`, `UrlListManager` initializes `urls = [source.uri]`; if `source.uri` is a JSON array string `["https://a.com","https://b.com"]`, it parses it into `["https://a.com", "https://b.com"]`.

## Verification

**Commands:**
- `npm test -w @flashcard-master/web` -- expected: all web server and client tests pass.
- `npm test` -- expected: 100% of monorepo tests pass.
- `npm run build` -- expected: Vite client and server build succeeds with 0 errors.

## Suggested Review Order

**Interactive URL Management Component**

- Encapsulates single entry, multiline/comma bulk pasting, normalization, and chip removal
  [`UrlListManager.svelte:1`](../../packages/web/client/src/components/UrlListManager.svelte#L1)

**Modal Form Integration**

- Replaces static URI input with interactive URL list when source type is web
  [`AddSourceModal.svelte:105`](../../packages/web/client/src/components/AddSourceModal.svelte#L105)

- Enables in-place editing of source metadata and web URL collections with automatic state re-sync
  [`EditSourceModal.svelte:1`](../../packages/web/client/src/components/EditSourceModal.svelte#L1)

**Sources View & API Client**

- Surfacing multi-URL badges, preview summaries, and "✏️ Edit" action buttons
  [`SourcesView.svelte:185`](../../packages/web/client/src/views/SourcesView.svelte#L185)

- Adds `updateSource` API client function and enables `PATCH`/`PUT` endpoint in server
  [`api.ts:44`](../../packages/web/client/src/lib/api.ts#L44)

**Integration Testing**

- Validates multi-URL source creation and updating via server REST endpoints
  [`server.test.ts:620`](../../packages/web/test/server.test.ts#L620)

