---
title: 'Story 20.1: Model Documentation Audit & In-Repo LLM Model Advisor Skill'
type: 'feature'
created: '2026-10-26'
status: 'done'
baseline_commit: '7c3108f'
review_loop_iteration: 0
context:
  - '_bmad-output/implementation-artifacts/epic-20-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:**
1. Documentation and UI descriptions currently contain occasional references to superseded, older generation models (e.g. `gemini-1.5-pro` in `README.md`, `Gemini 1.5 Pro` and `Claude 3.5 Sonnet / Haiku` in `SettingsView.svelte`), while the actual codebase defaults and supported modern tiers have moved forward to cutting-edge models (`gemini-3.6-flash`, `claude-haiku-4-5-20251001`, `gpt-4o-mini`, `phi4-mini`).
2. Users and AI coding assistants lack a structured, repository-scoped advisor skill to systematically evaluate and select the best provider and model configuration based on specific learning constraints (cost-efficiency budget, offline/local privacy, or deep reasoning).

**Approach:**
1. **Model Documentation Audit**:
   - Audit `README.md` and purge `gemini-1.5-pro` from the provider comparison table, updating it with cutting-edge alternatives (`gemini-3.6-pro`, `gemini-2.5-flash`).
   - Audit `SettingsView.svelte` provider descriptions: update Anthropic to highlight `Claude Haiku 4.5` and `Claude Sonnet 5`; update Gemini to highlight `Gemini 3.6 Flash` and `Gemini 3.6 Pro`.
   - Ensure the 4 supported providers strictly remain Google Gemini, Anthropic Claude, OpenAI, and Ollama.
2. **In-Repo Model Advisor Skill (`.agent/skills/model-advisor/SKILL.md` and `.agents/skills/model-advisor/SKILL.md`)**:
   - Create a dedicated agent skill that evaluates flashcard generation workloads.
   - Include pricing formulas (cost per 15 cards ~1,500 input tokens + 800 output tokens).
   - Provide decision matrix for common use cases:
     - *Use Case 1: Best Value & Speed (Default)*: Google Gemini (`gemini-3.6-flash`) or OpenAI (`gpt-4o-mini`).
     - *Use Case 2: 100% Offline & Zero Telemetry*: Ollama (`phi4-mini` for laptops <4GB VRAM, `qwen2.5:7b` for high schema adherence).
     - *Use Case 3: Maximum Grounding & Verbatim Fidelity*: Anthropic (`claude-haiku-4-5-20251001` or `claude-sonnet-5`).
     - *Use Case 4: Deep Reasoning & Complex Textbooks*: Gemini (`gemini-3.6-pro`) or OpenAI (`o3-mini`).

## Boundaries & Constraints

**Always:**
- Keep the 4 supported providers strictly limited to `gemini`, `anthropic`, `openai`, and `ollama`. Do not introduce new providers.
- Maintain existing in-code defaults: `gemini-3.6-flash`, `claude-haiku-4-5-20251001`, `gpt-4o-mini`, `phi4-mini`.
- Ensure all tests pass (`npm test`, `npm run lint`, `npm run typecheck`).

**Never:**
- Never list deprecated or older legacy models as recommended or supported alternatives.
- Never modify backend provider adapter interfaces or break existing database configurations.

## Acceptance Criteria

1. **Documentation Audit:**
   - `README.md` lines 305–316 updated: replace `gemini-1.5-pro` with `gemini-3.6-pro` and `gemini-2.5-flash`; ensure all alternative model lists reflect modern generations.
   - `SettingsView.svelte` descriptions updated: Anthropic references `Claude Haiku 4.5` and `Claude Sonnet 5`; Gemini references `Gemini 3.6 Flash` and `Gemini 3.6 Pro`.
2. **Model Advisor Skill:**
   - `.agent/skills/model-advisor/SKILL.md` (and `.agents/skills/model-advisor/SKILL.md`) created with comprehensive YAML frontmatter, criteria evaluation flow, token pricing guide, and decision matrix.
3. **Verification:**
   - Automated monorepo test suite passes (`npm test`, `npm run typecheck`, `npm run lint`).
</frozen-after-approval>
