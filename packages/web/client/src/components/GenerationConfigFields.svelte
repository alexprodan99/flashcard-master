<script lang="ts">
  import { onMount } from 'svelte';
  import type { DifficultyLevel, PersonaType, CardDepthMode, SecretProvider } from '../lib/types';
  import { settingsStore } from '../stores/index.js';

  interface Props {
    provider?: string;
    model?: string;
    apiKey?: string;
    persona?: PersonaType;
    difficulty?: DifficultyLevel;
    depthMode?: CardDepthMode;
    chunkMultiplier?: number;
    limit?: number;
    targetDeck?: string;
    enforceGrounding?: boolean;
    compact?: boolean;
    onNavigate?: (tab: string) => void;
  }

  let {
    provider = $bindable('ollama'),
    model = $bindable('phi4-mini'),
    apiKey = $bindable(''),
    persona = $bindable('socratic-mentor'),
    difficulty = $bindable('intermediate'),
    depthMode = $bindable('atomic'),
    chunkMultiplier = $bindable(1),
    limit = $bindable(4),
    targetDeck = $bindable(''),
    enforceGrounding = $bindable(true),
    compact = false,
    onNavigate,
  }: Props = $props();

  let showApiKey = $state(false);

  let normalizedProvider = $derived((provider || 'ollama').trim().toLowerCase());

  let providerStatus = $derived(
    ['openai', 'anthropic', 'gemini', 'ollama'].includes(normalizedProvider)
      ? settingsStore.keys[normalizedProvider as SecretProvider]
      : undefined
  );

  const providerDefaults: Record<string, { model: string; showApiKey: boolean }> = {
    ollama: { model: 'phi4-mini', showApiKey: false },
    gemini: { model: 'gemini-3.6-flash', showApiKey: true },
    openai: { model: 'gpt-4o-mini', showApiKey: true },
    anthropic: { model: 'claude-haiku-4-5-20251001', showApiKey: true },
  };

  const STORAGE_KEY = 'fc_generation_settings';

  function savePreferences() {
    try {
      const settings = {
        provider,
        model,
        persona,
        difficulty,
        depthMode,
        chunkMultiplier,
        limit,
        targetDeck,
        enforceGrounding,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Ignore localStorage errors
    }
  }

  function loadPreferences() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.provider) provider = parsed.provider;
        if (parsed.model) model = parsed.model;
        if (parsed.persona) persona = parsed.persona;
        if (parsed.difficulty) difficulty = parsed.difficulty;
        if (parsed.depthMode) depthMode = parsed.depthMode;
        if (parsed.chunkMultiplier !== undefined) chunkMultiplier = parsed.chunkMultiplier;
        if (parsed.limit) limit = parsed.limit;
        if (parsed.targetDeck) targetDeck = parsed.targetDeck;
        if (parsed.enforceGrounding !== undefined) enforceGrounding = parsed.enforceGrounding;
      }
    } catch {
      // Ignore localStorage errors
    }
  }

  function handleProviderChange(newProvider: string) {
    provider = newProvider;
    apiKey = ''; // Reset one-time key override on provider switch
    const normalized = newProvider.trim().toLowerCase();
    if (providerDefaults[normalized]) {
      model = providerDefaults[normalized].model;
    }
    savePreferences();
  }

  onMount(() => {
    loadPreferences();
    if (!settingsStore.hasLoaded && !settingsStore.loading) {
      settingsStore.loadKeys().catch(() => {});
    }
  });
</script>

<div class="config-container" class:compact>
  <!-- 1. AI Engine & Model -->
  <div class="form-section">
    <span class="section-label">1. AI Engine & Model</span>
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
          onchange={savePreferences}
          placeholder="e.g. phi4-mini, gpt-4o-mini, gemini-3.6-flash"
          required
        />
      </div>
    </div>

    {#if providerDefaults[normalizedProvider]?.showApiKey}
      <div class="form-group">
        {#if providerStatus?.isConfigured}
          <div class="saved-credential-badge" class:has-override={Boolean(apiKey && apiKey.trim().length > 0)}>
            <span class="badge-icon">{apiKey && apiKey.trim().length > 0 ? '⚡' : '✓'}</span>
            <span class="badge-text">
              {#if apiKey && apiKey.trim().length > 0}
                <strong>One-time key override active</strong> (ignoring saved key)
              {:else}
                Using saved API key {#if providerStatus.maskedValue}<code class="masked-key">{providerStatus.maskedValue}</code>{/if} ({providerStatus.source === 'database' ? 'Settings' : 'Environment'})
              {/if}
            </span>
            {#if onNavigate}
              <button
                type="button"
                class="btn-inline-link"
                onclick={() => onNavigate('settings')}
                title="Manage API credentials in Settings"
              >
                ⚙️ Manage
              </button>
            {/if}
          </div>
          <label for="api-key-input">{apiKey && apiKey.trim().length > 0 ? 'One-Time Key Override' : 'API Key Override (Optional)'}</label>
        {:else}
          <div class="missing-credential-notice">
            <span class="notice-icon">⚠️</span>
            <span class="notice-text">
              No saved key for {normalizedProvider}. Enter below or
            </span>
            {#if onNavigate}
              <button
                type="button"
                class="btn-inline-link"
                onclick={() => onNavigate('settings')}
              >
                configure in Settings ↗
              </button>
            {/if}
          </div>
          <label for="api-key-input">API Key (Required for {normalizedProvider})</label>
        {/if}
        <div class="input-with-action">
          <input
            id="api-key-input"
            type={showApiKey ? 'text' : 'password'}
            bind:value={apiKey}
            placeholder={providerStatus?.isConfigured
              ? 'Leave blank to use saved key, or enter one-time override...'
              : (normalizedProvider === 'gemini' ? 'AIzaSy...' : normalizedProvider === 'anthropic' ? 'sk-ant-...' : 'sk-...')}
            class="text-input font-mono"
            autocomplete="off"
            spellcheck="false"
          />
          {#if apiKey}
            <button
              type="button"
              class="reveal-btn"
              onclick={() => (showApiKey = !showApiKey)}
              aria-label={showApiKey ? 'Hide key' : 'Reveal key'}
              title={showApiKey ? 'Hide key' : 'Reveal key'}
            >
              {showApiKey ? '🔒' : '👁️'}
            </button>
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <!-- 2. Pedagogy & Cognitive Calibration -->
  <div class="form-section">
    <span class="section-label">2. Pedagogy & Cognitive Calibration</span>
    <div class="form-row">
      <div class="form-group">
        <label for="persona-select">Learning Persona</label>
        <select id="persona-select" bind:value={persona} onchange={savePreferences}>
          <option value="socratic-mentor">Socratic Mentor (Deep First-Principles)</option>
          <option value="strict-examiner">Strict Examiner (Precise Definitions & Edge Cases)</option>
          <option value="analogy-builder">Analogy Builder (Intuitive Real-World Metaphors)</option>
        </select>
      </div>

      <div class="form-group">
        <label for="difficulty-select">Target Difficulty</label>
        <select id="difficulty-select" bind:value={difficulty} onchange={savePreferences}>
          <option value="beginner">Beginner (Foundational Concepts)</option>
          <option value="intermediate">Intermediate (Standard Engineering & Architecture)</option>
          <option value="expert">Expert (Advanced Invariants, Protocols, Trade-offs)</option>
          <option value="mixed">🌈 Mixed (Adaptive Progression)</option>
        </select>
      </div>
    </div>
  </div>

  <!-- 3. Question Depth & Context Scope -->
  <div class="form-section">
    <span class="section-label">3. Question Depth & Context Scope</span>
    
    <div class="depth-mode-grid">
      <button
        type="button"
        class="depth-card"
        class:active={depthMode === 'atomic'}
        onclick={() => { depthMode = 'atomic'; savePreferences(); }}
      >
        <div class="depth-card-header">
          <span class="depth-icon">⚡</span>
          <span class="depth-title">Atomic Recall</span>
        </div>
        {#if !compact}
          <p class="depth-desc">Rapid single-fact questions with punchy, direct answers for fast memory retrieval.</p>
        {/if}
      </button>

      <button
        type="button"
        class="depth-card"
        class:active={depthMode === 'deep-dive'}
        onclick={() => { depthMode = 'deep-dive'; savePreferences(); }}
      >
        <div class="depth-card-header">
          <span class="depth-icon">🔬</span>
          <span class="depth-title">Deep Dive</span>
        </div>
        {#if !compact}
          <p class="depth-desc">In-depth mechanisms, architectural tradeoffs, and comprehensive structural explanations.</p>
        {/if}
      </button>

      <button
        type="button"
        class="depth-card"
        class:active={depthMode === 'scenario'}
        onclick={() => { depthMode = 'scenario'; savePreferences(); }}
      >
        <div class="depth-card-header">
          <span class="depth-icon">🏗️</span>
          <span class="depth-title">Applied Scenario</span>
        </div>
        {#if !compact}
          <p class="depth-desc">Situational troubleshooting challenges and applied engineering case studies.</p>
        {/if}
      </button>
    </div>

    <div class="scope-row">
      <span class="scope-label">Context Multiplier:</span>
      <div class="scope-chips">
        <button
          type="button"
          class="scope-chip"
          class:active={chunkMultiplier === 1}
          onclick={() => { chunkMultiplier = 1; savePreferences(); }}
        >
          1x (2k)
        </button>
        <button
          type="button"
          class="scope-chip"
          class:active={chunkMultiplier === 2}
          onclick={() => { chunkMultiplier = 2; savePreferences(); }}
        >
          2x (4k)
        </button>
        <button
          type="button"
          class="scope-chip"
          class:active={chunkMultiplier === 3}
          onclick={() => { chunkMultiplier = 3; savePreferences(); }}
        >
          3x (6k)
        </button>
        <button
          type="button"
          class="scope-chip"
          class:active={chunkMultiplier === 0}
          onclick={() => { chunkMultiplier = 0; savePreferences(); }}
        >
          📄 Full Article
        </button>
      </div>
    </div>
  </div>

  <!-- 4. Deck & Quotas -->
  <div class="form-section">
    <span class="section-label">4. Target Deck & Controls</span>
    <div class="form-row">
      <div class="form-group">
        <label for="limit-input">Cards per Document Chunk</label>
        <input
          id="limit-input"
          type="number"
          min="1"
          max="10"
          bind:value={limit}
          onchange={savePreferences}
        />
      </div>

      <div class="form-group">
        <label for="target-deck-input">Target Deck Override (Optional)</label>
        <input
          id="target-deck-input"
          type="text"
          placeholder="e.g. Systems Design"
          bind:value={targetDeck}
          onchange={savePreferences}
        />
      </div>
    </div>

    <div class="form-checkbox-row">
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={enforceGrounding} onchange={savePreferences} />
        <span>🛡️ Enforce Verbatim Grounding Guard (Discard hallucinated cards)</span>
      </label>
    </div>
  </div>
</div>

<style>
  .config-container {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .config-container.compact {
    gap: 14px;
  }

  .form-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-bottom: 16px;
    border-bottom: 1px solid #1e293b;
  }

  .form-section:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .section-label {
    font-size: 13px;
    font-weight: 700;
    color: #f8fafc;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }

  @media (max-width: 600px) {
    .form-row {
      grid-template-columns: 1fr;
    }
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .form-group label {
    font-size: 12px;
    font-weight: 600;
    color: #cbd5e1;
  }

  .form-group select,
  .form-group input {
    background: #0b0f19;
    border: 1px solid #334155;
    color: #f8fafc;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 13px;
    transition: border-color 0.15s;
  }

  .form-group select:focus,
  .form-group input:focus {
    outline: none;
    border-color: #6366f1;
  }

  .depth-mode-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }

  @media (max-width: 600px) {
    .depth-mode-grid {
      grid-template-columns: 1fr;
    }
  }

  .depth-card {
    background: #0b0f19;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 10px 12px;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s ease;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .depth-card:hover {
    border-color: #6366f1;
    background: rgba(99, 102, 241, 0.05);
  }

  .depth-card.active {
    border-color: #6366f1;
    background: rgba(99, 102, 241, 0.12);
    box-shadow: 0 0 0 1px #6366f1;
  }

  .depth-card-header {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .depth-icon {
    font-size: 14px;
  }

  .depth-title {
    font-size: 12px;
    font-weight: 700;
    color: #f8fafc;
  }

  .depth-desc {
    margin: 0;
    font-size: 11px;
    color: #94a3b8;
    line-height: 1.3;
  }

  .scope-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 4px;
  }

  .scope-label {
    font-size: 12px;
    font-weight: 600;
    color: #cbd5e1;
  }

  .scope-chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .scope-chip {
    background: #0b0f19;
    border: 1px solid #334155;
    color: #94a3b8;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  .scope-chip:hover {
    border-color: #6366f1;
    color: #f8fafc;
  }

  .scope-chip.active {
    background: #6366f1;
    border-color: #6366f1;
    color: white;
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

  .saved-credential-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    background: rgba(16, 185, 129, 0.12);
    border: 1px solid rgba(16, 185, 129, 0.25);
    color: #34d399;
    padding: 6px 10px;
    border-radius: 6px;
    margin-bottom: 6px;
  }

  .missing-credential-notice {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    background: rgba(245, 158, 11, 0.12);
    border: 1px solid rgba(245, 158, 11, 0.25);
    color: #fbbf24;
    padding: 6px 10px;
    border-radius: 6px;
    margin-bottom: 6px;
  }

  .badge-icon,
  .notice-icon {
    font-size: 12px;
    flex-shrink: 0;
  }

  .badge-text,
  .notice-text {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }

  .masked-key {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    background: rgba(0, 0, 0, 0.25);
    padding: 1px 5px;
    border-radius: 4px;
    color: #f1f5f9;
    font-size: 11px;
  }

  .btn-inline-link {
    background: transparent;
    border: none;
    color: #818cf8;
    text-decoration: underline;
    font-size: 11px;
    cursor: pointer;
    padding: 0;
    margin-left: auto;
    font-weight: 600;
    white-space: nowrap;
  }

  .btn-inline-link:hover {
    color: #a5b4fc;
  }

  .input-with-action {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
  }

  .font-mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }

  .reveal-btn {
    position: absolute;
    right: 8px;
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 13px;
    padding: 2px 4px;
    color: #94a3b8;
  }

  .reveal-btn:hover {
    color: #f8fafc;
  }
</style>
