---
title: 'Story 19.4: Interactive Tag Selector for Data Sources'
type: 'feature'
created: '2026-10-24'
status: 'done'
baseline_commit: 'd221f2e0a227f5141b083f93799e6d49e615b9de'
review_loop_iteration: 0
context:
  - '_bmad-output/implementation-artifacts/epic-19-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** In `AddSourceModal.svelte` and `EditSourceModal.svelte`, users must manually type tags into a comma-separated text box without any auto-suggestions of previously used tags. This leads to inconsistent tag naming (e.g. casing and whitespace differences), tag typos, and a clunky user experience.

**Approach:**
1. **Core / Backend Support (`sourceRepo.listAllTags()` & `GET /api/sources/tags`)**:
   - Add `listAllTags(): string[]` to `DataSourceRepository` querying distinct tags stored in SQLite `data_sources.tags`.
   - Expose `GET /api/sources/tags` in `WebServer` returning a sorted array of distinct, lowercased tags.
2. **Client API (`fetchSourceTags`)**:
   - Add `fetchSourceTags(): Promise<string[]>` to `packages/web/client/src/lib/api.ts`.
3. **Reusable Tag Input Component (`TagInput.svelte`)**:
   - Create `packages/web/client/src/components/TagInput.svelte` rendering interactive tag pills.
   - Support adding tags on Enter/comma, removing tags on pill `✕` click or Backspace on empty input.
   - Provide an autocomplete dropdown filtering existing tags from `GET /api/sources/tags` with keyboard navigation.
   - Enforce tag normalization: trimmed, lowercased, and deduplicated.
4. **Modal Integration (`AddSourceModal.svelte` & `EditSourceModal.svelte`)**:
   - Replace the comma-separated text `<input>` with `<TagInput bind:tags />`.
   - Persist normalized tags array cleanly into SQLite.

## Boundaries & Constraints

**Always:**
- Trim and lowercase all tags before adding to prevent duplicates like `Docker` vs `docker`.
- Deduplicate tags within a single data source.
- Preserve keyboard navigation accessibility: `Enter` or `,` creates tags, `Backspace` on empty input removes the previous tag, `Up` / `Down` arrows navigate suggestions, `Escape` closes the suggestion dropdown.
- Keep tag persistence backward-compatible: `data_sources.tags` remains a JSON string array column in SQLite.

**Never:**
- Never allow empty or whitespace-only tags.
- Never crash when no tags exist in the database; return an empty list `[]` gracefully.
- Never disrupt existing source creation or update workflows.

## I/O & Edge-Case Matrix

| Scenario | Input | Expected Output | Fallback |
|---|---|---|---|
| Auto-suggest on focus | Focus empty tag input | Shows dropdown with distinct existing tags from other sources | Closes if no existing tags |
| Create tag with Enter | Type "kubernetes" + Enter | Adds "kubernetes" pill tag, clears input | Ignores if tag is empty string |
| Duplicate tag | Add "docker" when "docker" exists | Rejects duplicate, gives subtle visual hint or silently deduplicates | No duplicate pills |
| Casing normalization | Type "TypeScript" + Enter | Normalized and stored as "typescript" pill | Always lowercase and trimmed |
| Comma delimited | Type "ai, ml, nlp" | Automatically parses into 3 separate pills ["ai", "ml", "nlp"] | Cleanly strips trailing commas |
| Remove pill | Click `✕` on pill or Backspace | Removes selected tag pill from array | Array updates reactively |

</frozen-after-approval>

## Code Map

- `packages/core/src/storage/source-repository.ts` -- Add `listAllTags(): string[]` to `DataSourceRepository`.
- `packages/core/test/source-repository.test.ts` -- Unit tests for `listAllTags`.
- `packages/web/src/server.ts` -- Add `GET /api/sources/tags` endpoint.
- `packages/web/test/server.test.ts` -- Add integration test for `/api/sources/tags`.
- `packages/web/client/src/lib/api.ts` -- Add `fetchSourceTags`.
- `packages/web/client/src/components/TagInput.svelte` -- Create reusable interactive tag selector.
- `packages/web/client/src/components/AddSourceModal.svelte` -- Replace comma-separated input with `<TagInput>`.
- `packages/web/client/src/components/EditSourceModal.svelte` -- Replace comma-separated input with `<TagInput>`.
- `docs/ARCHITECTURE.md` -- Document source tag autocomplete.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/storage/source-repository.ts` -- Implement `listAllTags(): string[]` in `DataSourceRepository`.
- [x] `packages/core/test/source-repository.test.ts` -- Unit tests asserting distinct tag extraction from `data_sources`.
- [x] `packages/web/src/server.ts` -- Add `GET /api/sources/tags` endpoint returning distinct tags.
- [x] `packages/web/test/server.test.ts` -- Add integration test verifying `GET /api/sources/tags`.
- [x] `packages/web/client/src/lib/api.ts` -- Add `fetchSourceTags(): Promise<string[]>`.
- [x] `packages/web/client/src/components/TagInput.svelte` -- Create interactive tag pill component with keyboard navigation, dropdown suggestions, and removal.
- [x] `packages/web/client/src/components/AddSourceModal.svelte` -- Replace comma-separated input with `<TagInput>`.
- [x] `packages/web/client/src/components/EditSourceModal.svelte` -- Replace comma-separated input with `<TagInput>`.
- [x] `docs/ARCHITECTURE.md` -- Document source tag management and autocomplete endpoint.

**Acceptance Criteria:**
- Adding or editing a data source displays interactive tag pills instead of a plain comma-separated text box.
- Focusing the tag input displays an auto-suggest list of existing tags across sources in SQLite.
- Typing a new tag and pressing Enter or comma adds a new pill tag.
- Clicking the `✕` on any pill immediately removes the tag.
- Tags persist cleanly to SQLite as JSON arrays without whitespace issues or duplicates.
- 100% of monorepo tests, typechecks, and builds pass.
