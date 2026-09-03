# Story 8.1: Prompt Tuning & Emphatic Copy-Paste Verbatim Directives

**Epic:** Epic 8 - LLM Prompt Tuning, Adaptive Backfilling, PDF Export & Explorer Bulk Operations  
**Status:** done  
**Date:** 2026-09-02  

---

## 1. Story Overview

### User Story
> **As a learner using Flashcard Master with local (e.g. Ollama) or Cloud LLMs,**  
> I want the generation prompt to include emphatic, unambiguous copy-paste directives and clear schema few-shot examples,  
> **So that the LLM always copies verbatim sentences directly into `sourceQuote` without paraphrasing or summarizing, maximizing Grounding Guard verification rates.**

---

## 2. Technical Scope & Architecture

### Core Domain Updates
1. **`PromptBuilder` (`packages/core/src/services/prompt-builder.ts`):**
   - Injected emphatic directive:
     > `"CRITICAL: Copy and paste an EXACT, word-for-word sentence directly from the provided text into 'sourceQuote'. Do NOT paraphrase, edit, or summarize any words in 'sourceQuote'."`
2. **LLM Adapters (`packages/adapters/src/llm/*.ts`):**
   - Synchronized verbatim copy-paste rules in adapter system prompts across OpenAI, Gemini, Claude, and Ollama.
3. **Automated Unit Tests:**
   - Added assertions in `packages/core/test/persona-studio-service.test.ts`.

---

## 3. Acceptance Criteria

- [x] **AC1 — Emphatic Directives in `PromptBuilder`:**
  - Given `PromptBuilder.buildGenerationInstructions()`
  - When prompt string is assembled
  - Then it contains strict copy-paste instructions prohibiting quote alteration and summarizing.
- [x] **AC2 — Adapter System Prompts Synchronized:**
  - Given Ollama, Gemini, OpenAI, and Anthropic adapters
  - When system prompts are built
  - Then they consistently enforce verbatim copy-paste quotes.
- [x] **AC3 — Unit Tests Pass:**
  - All prompt and LLM adapter tests pass with 100% success.
