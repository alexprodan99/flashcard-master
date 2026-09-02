<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchSources, generateCards } from '../lib/api';
  import type { DataSource, Flashcard, GenerationResult, DifficultyLevel, PersonaType } from '../lib/types';

  interface Props {
    onNavigate?: (tab: string) => void;
  }

  let { onNavigate }: Props = $props();

  let sources = $state<DataSource[]>([]);
  let selectedSourceIds = $state<string[]>([]);
  let provider = $state('ollama');
  let model = $state('phi4-mini');
  let apiKey = $state('');
  let persona = $state<PersonaType>('socratic-mentor');
  let difficulty = $state<DifficultyLevel>('intermediate');
  let limit = $state(4);
  let targetDeck = $state('');
  let enforceGrounding = $state(true);

  let isGenerating = $state(false);
  let errorMessage = $state<string | null>(null);
  let generationResult = $state<GenerationResult | null>(null);

  const providerDefaults: Record<string, { model: string; showApiKey: boolean }> = {
    ollama: { model: 'phi4-mini', showApiKey: false },
    gemini: { model: 'gemini-2.0-flash', showApiKey: true },
    openai: { model: 'gpt-4o-mini', showApiKey: true },
    anthropic: { model: 'claude-haiku-4-5-20251001', showApiKey: true },
  };

  function handleProviderChange(newProvider: string) {
    provider = newProvider;
    if (providerDefaults[newProvider]) {
      model = providerDefaults[newProvider].model;
    }
  }

  function toggleAllSources() {
    if (selectedSourceIds.length === sources.length) {
      selectedSourceIds = [];
    } else {
      selectedSourceIds = sources.map((s) => s.id);
    }
  }

  function toggleSource(id: string) {
    if (selectedSourceIds.includes(id)) {
      selectedSourceIds = selectedSourceIds.filter((sId) => sId !== id);
    } else {
      selectedSourceIds = [...selectedSourceIds, id];
    }
  }

  async function loadSources() {
    try {
      const all = await fetchSources();
      sources = all.filter((s) => s.isActive);
      selectedSourceIds = sources.map((s) => s.id);
    } catch (err: any) {
      errorMessage = 'Failed to load active data sources: ' + err.message;
    }
  }

  async function handleGenerate(e: Event) {
    e.preventDefault();
    if (selectedSourceIds.length === 0) {
      errorMessage = 'Please select at least one data source to synthesize cards from.';
      return;
    }

    isGenerating = true;
    errorMessage = null;
    generationResult = null;

    try {
      const result = await generateCards({
        sourceIds: selectedSourceIds,
        provider,
        model: model.trim() || undefined,
        apiKey: apiKey.trim() || undefined,
        persona,
        difficulty,
        limit,
        targetDeck: targetDeck.trim() || undefined,
        enforceGrounding,
      });

      generationResult = result;
    } catch (err: any) {
      errorMessage = err.message || 'Generation failed';
    } finally {
      isGenerating = false;
    }
  }

  onMount(() => {
    loadSources();
  });
</script>

<div class="view-container">
  <div class="view-header">
    <div>
      <h1 class="view-title">⚡ AI Card Generation Studio</h1>
      <p class="view-subtitle">Synthesize atomic, factually grounded Q&A flashcards from ingested sources.</p>
    </div>
  </div>

  <div class="studio-layout">
    <div class="card form-panel">
      <form onsubmit={handleGenerate} class="studio-form">
        <!-- 1. Source Scope Selection -->
        <div class="form-section">
          <div class="section-header">
            <label class="section-label">1. Target Data Sources Scope</label>
            <div class="header-actions">
              <span class="selection-badge">
                {selectedSourceIds.length} / {sources.length} Selected
              </span>
              <button type="button" class="btn btn-xs btn-secondary" onclick={toggleAllSources}>
                {selectedSourceIds.length === sources.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          </div>

          {#if sources.length === 0}
            <div class="no-sources-warning">
              <span>⚠️ No active data sources found. Please add or enable a data source first.</span>
            </div>
          {:else}
            <div class="sources-checkbox-grid">
              {#each sources as s}
                <label class="source-checkbox-item" class:checked={selectedSourceIds.includes(s.id)}>
                  <input
                    type="checkbox"
                    checked={selectedSourceIds.includes(s.id)}
                    onchange={() => toggleSource(s.id)}
                  />
                  <span class="type-badge {s.type}">{s.type}</span>
                  <span class="source-item-name">{s.name}</span>
                </label>
              {/each}
            </div>
          {/if}
        </div>

        <!-- 2. AI Provider & Model -->
        <div class="form-section">
          <label class="section-label">2. AI Engine & Model</label>
          <div class="form-row">
            <div class="form-group">
              <label for="provider-select">Provider</label>
              <select
                id="provider-select"
                value={provider}
                onchange={(e) => handleProviderChange((e.target as HTMLSelectElement).value)}
              >
                <option value="ollama">🦙 Ollama (100% Local & Free)</option>
                <option value="gemini">🔵 Google Gemini</option>
                <option value="openai">🟢 OpenAI</option>
                <option value="anthropic">🟣 Anthropic Claude</option>
              </select>
            </div>

            <div class="form-group">
              <label for="model-input">Model Preset / Override</label>
              <input
                id="model-input"
                type="text"
                bind:value={model}
                placeholder="e.g. phi4-mini, gpt-4o-mini, claude-haiku-4-5-20251001"
                required
              />
            </div>
          </div>

          {#if providerDefaults[provider]?.showApiKey}
            <div class="form-group">
              <label for="api-key-input">API Key (Optional if configured in environment)</label>
              <input
                id="api-key-input"
                type="password"
                bind:value={apiKey}
                placeholder="sk-..."
              />
            </div>
          {/if}
        </div>

        <!-- 3. Learning Persona & Cognitive Difficulty -->
        <div class="form-section">
          <label class="section-label">3. Pedagogy & Cognitive Calibration</label>
          <div class="form-row">
            <div class="form-group">
              <label for="persona-select">Learning Persona</label>
              <select id="persona-select" bind:value={persona}>
                <option value="socratic-mentor">Socratic Mentor (Deep First-Principles)</option>
                <option value="strict-examiner">Strict Examiner (Precise Definitions & Edge Cases)</option>
                <option value="analogy-builder">Analogy Builder (Intuitive Real-World Metaphors)</option>
              </select>
            </div>

            <div class="form-group">
              <label for="difficulty-select">Target Difficulty</label>
              <select id="difficulty-select" bind:value={difficulty}>
                <option value="beginner">Beginner (Foundational Concepts)</option>
                <option value="intermediate">Intermediate (Standard Engineering & Architecture)</option>
                <option value="expert">Expert (Advanced Invariants, Protocols, Trade-offs)</option>
              </select>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="limit-input">Cards per Document Chunk</label>
              <input
                id="limit-input"
                type="number"
                min="1"
                max="10"
                bind:value={limit}
              />
            </div>

            <div class="form-group">
              <label for="target-deck-input">Target Deck Override (Optional)</label>
              <input
                id="target-deck-input"
                type="text"
                placeholder="e.g. Systems Design"
                bind:value={targetDeck}
              />
            </div>
          </div>

          <div class="form-checkbox-row">
            <label class="checkbox-label">
              <input type="checkbox" bind:checked={enforceGrounding} />
              <span>🛡️ Enforce Verbatim Grounding Guard (Discard ungrounded hallucinated cards)</span>
            </label>
          </div>
        </div>

        {#if errorMessage}
          <div class="error-banner">⚠️ {errorMessage}</div>
        {/if}

        <button
          type="submit"
          class="btn btn-primary btn-generate"
          disabled={isGenerating || sources.length === 0}
        >
          {#if isGenerating}
            <span class="spinner-inline"></span>
            Synthesizing Grounded Flashcards...
          {:else}
            ⚡ Start AI Generation
          {/if}
        </button>
      </form>
    </div>

    <!-- Execution Results & Card Previews -->
    <div class="results-panel">
      {#if isGenerating}
        <div class="generating-state">
          <div class="pulse-spinner"></div>
          <h3>AI Engine Ingesting & Generating...</h3>
          <p>Chunking documents, running LLM inference, and verifying verbatim quote grounding.</p>
        </div>
      {:else if generationResult}
        <div class="result-card">
          <div class="result-header">
            <h3>🎉 Generation Completed</h3>
            <div class="result-metrics">
              <span class="metric-pill success">+{generationResult.cardsCreated} Created</span>
              <span class="metric-pill warning">-{generationResult.duplicatesSkipped} Duplicates Skipped</span>
            </div>
          </div>

          {#if generationResult.newCards && generationResult.newCards.length > 0}
            <div class="cards-preview-list">
              <h4>Newly Generated Flashcards:</h4>
              {#each generationResult.newCards as card}
                <div class="preview-card-item">
                  <div class="preview-card-top">
                    <span class="badge difficulty {card.difficulty}">{card.difficulty}</span>
                    <span class="badge deck">{card.targetDeck}</span>
                  </div>
                  <div class="preview-question"><strong>Q:</strong> {card.question}</div>
                  <div class="preview-answer"><strong>A:</strong> {card.answer}</div>
                  {#if card.sourceQuote}
                    <div class="preview-quote">
                      <span class="quote-icon">“</span>
                      <span>{card.sourceQuote}</span>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {:else}
            <div class="no-cards-notice">
              <p>No new unique cards were created. Any generated drafts were either duplicates of existing cards or ungrounded.</p>
            </div>
          {/if}
        </div>
      {:else}
        <div class="idle-results-placeholder">
          <div class="placeholder-icon">⚡</div>
          <h3>AI Generation Studio Ready</h3>
          <p>Configure your sources, model, and persona on the left, then click <strong>Start AI Generation</strong> to synthesize flashcards.</p>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .view-container {
    padding: 32px;
    display: flex;
    flex-direction: column;
    gap: 24px;
    max-width: 1300px;
    margin: 0 auto;
    width: 100%;
  }

  .view-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .view-title {
    font-size: 26px;
    font-weight: 700;
    color: #f8fafc;
    margin: 0 0 6px 0;
    letter-spacing: -0.02em;
  }

  .view-subtitle {
    font-size: 14px;
    color: #94a3b8;
    margin: 0;
  }

  .studio-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    align-items: flex-start;
  }

  @media (max-width: 1024px) {
    .studio-layout {
      grid-template-columns: 1fr;
    }
  }

  .card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 14px;
    padding: 24px;
  }

  .studio-form {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .form-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
    border-bottom: 1px solid #334155;
    padding-bottom: 16px;
  }

  .form-section:last-of-type {
    border-bottom: none;
    padding-bottom: 0;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .section-label {
    font-size: 13px;
    font-weight: 700;
    color: #818cf8;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .selection-badge {
    font-size: 11px;
    font-weight: 600;
    color: #cbd5e1;
    background: #0f172a;
    padding: 2px 8px;
    border-radius: 4px;
    border: 1px solid #334155;
  }

  .sources-checkbox-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
    max-height: 180px;
    overflow-y: auto;
    background: #0f172a;
    padding: 10px;
    border-radius: 8px;
    border: 1px solid #334155;
  }

  .source-checkbox-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 10px;
    border-radius: 6px;
    cursor: pointer;
    background: rgba(255, 255, 255, 0.02);
    transition: background 0.15s;
  }

  .source-checkbox-item:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .source-checkbox-item.checked {
    background: rgba(99, 102, 241, 0.1);
  }

  .source-item-name {
    font-size: 13px;
    color: #f1f5f9;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .form-row {
    display: flex;
    gap: 12px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
  }

  label {
    font-size: 12px;
    font-weight: 500;
    color: #cbd5e1;
  }

  input[type="text"],
  input[type="password"],
  input[type="number"],
  select {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 10px 12px;
    color: #f8fafc;
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s;
    width: 100%;
  }

  input:focus, select:focus {
    border-color: #6366f1;
  }

  .form-checkbox-row {
    margin-top: 4px;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #cbd5e1;
    cursor: pointer;
  }

  .btn {
    padding: 10px 18px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.15s;
  }

  .btn-xs {
    padding: 2px 8px;
    font-size: 11px;
  }

  .btn-secondary {
    background: #334155;
    color: #cbd5e1;
  }

  .btn-secondary:hover {
    background: #475569;
  }

  .btn-primary {
    background: #6366f1;
    color: #ffffff;
  }

  .btn-primary:hover {
    background: #4f46e5;
  }

  .btn-generate {
    width: 100%;
    padding: 14px;
    font-size: 15px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-top: 8px;
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .type-badge {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .type-badge.rss {
    background: rgba(249, 115, 22, 0.15);
    color: #fb923c;
  }

  .type-badge.web {
    background: rgba(59, 130, 246, 0.15);
    color: #60a5fa;
  }

  .type-badge.local {
    background: rgba(168, 85, 247, 0.15);
    color: #c084fc;
  }

  .results-panel {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 14px;
    padding: 24px;
    min-height: 480px;
    display: flex;
    flex-direction: column;
  }

  .idle-results-placeholder, .generating-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    text-align: center;
    color: #94a3b8;
    padding: 40px;
  }

  .placeholder-icon {
    font-size: 44px;
    margin-bottom: 12px;
  }

  .pulse-spinner {
    width: 48px;
    height: 48px;
    border: 4px solid rgba(99, 102, 241, 0.2);
    border-top-color: #6366f1;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-bottom: 16px;
  }

  .spinner-inline {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .result-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .result-header h3 {
    margin: 0;
    color: #f8fafc;
    font-size: 18px;
  }

  .result-metrics {
    display: flex;
    gap: 8px;
  }

  .metric-pill {
    font-size: 12px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 6px;
  }

  .metric-pill.success {
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
  }

  .metric-pill.warning {
    background: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
  }

  .cards-preview-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: 520px;
    overflow-y: auto;
    padding-right: 4px;
  }

  .preview-card-item {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .preview-card-top {
    display: flex;
    justify-content: space-between;
  }

  .badge {
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 600;
  }

  .type-badge {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .type-badge.rss { background: rgba(249, 115, 22, 0.15); color: #fb923c; border: 1px solid rgba(249, 115, 22, 0.3); }
  .type-badge.web { background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }
  .type-badge.local { background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); }
  .type-badge.sitemap { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
  .type-badge.llms-txt { background: rgba(236, 72, 153, 0.15); color: #f472b6; border: 1px solid rgba(236, 72, 153, 0.3); }

  .badge.difficulty.beginner { background: rgba(16, 185, 129, 0.15); color: #34d399; }
  .badge.difficulty.intermediate { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
  .badge.difficulty.expert { background: rgba(168, 85, 247, 0.15); color: #c084fc; }
  .badge.deck { background: rgba(255, 255, 255, 0.05); color: #94a3b8; }

  .preview-question {
    color: #f8fafc;
    font-size: 13px;
  }

  .preview-answer {
    color: #cbd5e1;
    font-size: 13px;
  }

  .preview-quote {
    font-size: 12px;
    color: #94a3b8;
    background: rgba(99, 102, 241, 0.05);
    border-left: 2px solid #6366f1;
    padding: 6px 10px;
    border-radius: 0 4px 4px 0;
  }

  .error-banner {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 13px;
  }
</style>