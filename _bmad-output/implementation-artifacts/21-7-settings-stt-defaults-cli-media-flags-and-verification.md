---
title: 'Story 21.7: Settings Default STT Configuration, CLI Media Flags & End-to-End Verification Suite'
type: 'feature'
created: '2026-11-14'
status: 'done'
baseline_commit: '3b74d42'
review_loop_iteration: 0
context:
  - '_bmad-output/implementation-artifacts/epic-21-context.md'
  - '_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:**
Users need persistent default Speech-to-Text preferences (default STT provider, local offline Whisper binary/endpoint and model selection, default YouTube subtitle language, and dependency diagnostics for `ffmpeg` / `whisper` / `yt-dlp`), matching CLI flags to script `audio`, `video`, and `youtube` ingestion, updated User Guide documentation, and a full monorepo end-to-end verification pass before closing Epic 21.

**Approach:**
1. **Settings Schema & UI (`GeneralSettingsSchema`, `SettingsService`, `SettingsView.svelte`)**:
   - Extend `GeneralSettingsSchema` (`packages/core/src/domain/models.ts`) with:
     - `defaultSttProvider`: `'openai' | 'gemini' | 'whisper-local'` (default `'openai'`)
     - `localWhisperModel`: `'tiny' | 'base' | 'small' | 'medium' | 'large-v3'` (default `'base'`)
     - `localWhisperEndpoint`: optional local Whisper server URL or CLI binary path
     - `defaultSubtitleLanguage`: string (default `'en'`)
   - Add a **Speech-to-Text & Media Diagnostics** section in `SettingsView.svelte` allowing users to save STT defaults and inspect readiness status (`ffmpeg`, `yt-dlp`, `whisper-local`, and OpenAI/Gemini API keys).
2. **CLI Parity (`packages/cli`)**:
   - Support `--type audio | video | youtube` in source creation/sync commands.
   - Add flags `--stt-provider <openai|gemini|whisper-local>`, `--subtitles <path>`, `--timestamps <start-end,...>`, and `--interval-minutes <N>`.
   - Render `startSeconds` / `endSeconds` timestamp bounds in CLI document inspection output.
3. **Documentation & End-to-End Verification**:
   - Update `docs/user-guide/ingestion-playbook.md` (and `docs/ARCHITECTURE.md` if applicable) with Audio, Video, and YouTube ingestion workflows, `.srt`/`.vtt` pairing, STT provider selection, and timestamp slicing tips.
   - Add an E2E integration test verifying end-to-end flow: subtitle/STT ingestion -> timestamp slicing -> card generation with `sourceLocator` + YouTube `?t=...s` deep-link -> `GroundingGuard` verification -> SQLite persistence.

## Boundaries & Constraints

**Always:**
- Preserve all existing Settings keys and CLI flags without breaking backward compatibility.
- Run and verify all monorepo checks (`npm test`, `npm run typecheck`, `npm run lint`, `npm run build`) after final changes.

**Never:**
- Never store binary paths or CLI errors with raw unformatted stack traces in Settings UI diagnostics.

</frozen-after-approval>

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/domain/models.ts` & `services/settings-service.ts` -- Add `defaultSttProvider`, `localWhisperModel`, `localWhisperEndpoint`, and `defaultSubtitleLanguage` to `GeneralSettingsSchema` and env/db defaults.
- [x] `packages/web/src/routes/settings.ts` & `packages/web/client/src/views/SettingsView.svelte` -- Expose Speech-to-Text settings persistence and media tool readiness diagnostics (`ffmpeg`, `yt-dlp`, `whisper-local`) and wire defaults into `AddSourceModal.svelte`.
- [x] `packages/cli/src/` -- Support `--type audio|video|youtube`, `--stt-provider`, `--subtitles`, `--timestamps`, and `--interval-minutes` flags plus timestamp coordinate display in document inspection.
- [x] `docs/user-guide/ingestion-playbook.md` -- Document Audio, Video, and YouTube sources, subtitle formats, Speech-to-Text options, and timestamp slicing/citations.
- [x] Integration tests & monorepo gates -- Add E2E media pipeline test and verify `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.

**Acceptance Criteria:**
- `SettingsView.svelte` and `SettingsService` persist and expose default STT provider, local Whisper configuration, and preferred caption language, pre-filling defaults in `AddSourceModal.svelte`.
- `@flashcard-master/cli` creates, syncs, and inspects `audio`, `video`, and `youtube` sources with subtitle, STT provider, and timestamp slicing flags.
- User Guide documentation covers Audio, Video, and YouTube ingestion workflows, subtitle pairing, and local/cloud STT configuration.
- Full monorepo test suite, TypeScript typecheck, lint, and production build pass with zero regressions.

## Verification

**Commands:**
- `npm test` -- expected: all unit, component, CLI, and E2E tests pass across the monorepo.
- `npm run typecheck` -- expected: 0 TypeScript errors across all packages.
- `npm run lint` -- expected: 0 lint errors.
- `npm run build` -- expected: clean monorepo production build.

