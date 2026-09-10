<script lang="ts">
  import { onMount } from 'svelte';
  import {
    settingsStore,
    toastStore,
    ALL_SECRET_PROVIDERS,
  } from '../stores/index.js';
  import type { SecretProvider, ProviderKeyStatus } from '../lib/types.js';

  interface ProviderMeta {
    id: SecretProvider;
    name: string;
    icon: string;
    category: 'source' | 'llm';
    keyLabel: string;
    keyPlaceholder: string;
    envVar: string;
    defaultEndpoint?: string;
    hasEndpoint: boolean;
    endpointLabel?: string;
    endpointPlaceholder?: string;
    description: string;
    guideUrl?: string;
  }

  const PROVIDER_METAS: ProviderMeta[] = [
    {
      id: 'notion',
      name: 'Notion Integration',
      icon: '📔',
      category: 'source',
      keyLabel: 'Internal Integration Token',
      keyPlaceholder: 'secret_...',
      envVar: 'NOTION_API_KEY',
      hasEndpoint: false,
      description: 'Connect your Notion workspace to ingest databases and pages as flashcard sources.',
      guideUrl: 'https://www.notion.so/my-integrations',
    },
    {
      id: 'openai',
      name: 'OpenAI',
      icon: '🤖',
      category: 'llm',
      keyLabel: 'API Key',
      keyPlaceholder: 'sk-...',
      envVar: 'OPENAI_API_KEY',
      hasEndpoint: true,
      endpointLabel: 'Base URL (Optional Override)',
      endpointPlaceholder: 'https://api.openai.com/v1',
      description: 'GPT-4o, GPT-4o-mini, and OpenAI-compatible endpoints (LocalAI, vLLM, etc.).',
    },
    {
      id: 'anthropic',
      name: 'Anthropic Claude',
      icon: '🧠',
      category: 'llm',
      keyLabel: 'API Key',
      keyPlaceholder: 'sk-ant-...',
      envVar: 'ANTHROPIC_API_KEY',
      hasEndpoint: true,
      endpointLabel: 'Base URL (Optional Override)',
      endpointPlaceholder: 'https://api.anthropic.com',
      description: 'Claude 3.5 Sonnet, Claude 3 Haiku, and Anthropic-compatible proxies.',
    },
    {
      id: 'gemini',
      name: 'Google Gemini',
      icon: '✨',
      category: 'llm',
      keyLabel: 'API Key',
      keyPlaceholder: 'AIzaSy...',
      envVar: 'GEMINI_API_KEY',
      hasEndpoint: true,
      endpointLabel: 'Base URL (Optional Override)',
      endpointPlaceholder: 'https://generativelanguage.googleapis.com',
      description: 'Gemini 1.5 Pro and Flash with x-goog-api-key header security.',
    },
    {
      id: 'ollama',
      name: 'Ollama (Local / Remote)',
      icon: '🦙',
      category: 'llm',
      keyLabel: 'Bearer Token / API Key (Optional)',
      keyPlaceholder: 'Optional bearer token',
      envVar: 'OLLAMA_API_KEY',
      hasEndpoint: true,
      endpointLabel: 'Host URL / Base Endpoint',
      endpointPlaceholder: 'http://localhost:11434',
      defaultEndpoint: 'http://localhost:11434',
      description: 'Local and self-hosted open models (e.g. Llama 3, Phi-4, Mistral, Qwen).',
    },
  ];

  let candidateKeys = $state<Record<SecretProvider, string>>({
    openai: '',
    anthropic: '',
    gemini: '',
    ollama: '',
    notion: '',
  });

  let candidateEndpoints = $state<Record<SecretProvider, string>>({
    openai: '',
    anthropic: '',
    gemini: '',
    ollama: '',
    notion: '',
  });

  let showSecret = $state<Record<SecretProvider, boolean>>({
    openai: false,
    anthropic: false,
    gemini: false,
    ollama: false,
    notion: false,
  });

  let hasLoaded = $state(false);

  let keys = $derived(settingsStore.keys);
  let loading = $derived(settingsStore.loading);
  let error = $derived(settingsStore.error);
  let testingProvider = $derived(settingsStore.testingProvider);
  let savingProvider = $derived(settingsStore.savingProvider);
  let deletingProvider = $derived(settingsStore.deletingProvider);
  let testResults = $derived(settingsStore.testResults);

  const sourceProviders = $derived(PROVIDER_METAS.filter((p) => p.category === 'source'));
  const llmProviders = $derived(PROVIDER_METAS.filter((p) => p.category === 'llm'));

  onMount(async () => {
    // Clear any previous session diagnostic banners to avoid stale outputs
    ALL_SECRET_PROVIDERS.forEach((p) => settingsStore.clearTestResult(p));
    await loadData();
    hasLoaded = true;
    syncEndpointsFromStore();
  });

  function syncEndpointsFromStore() {
    for (const p of ALL_SECRET_PROVIDERS) {
      if (!candidateEndpoints[p] && keys[p]?.endpoint) {
        candidateEndpoints[p] = keys[p].endpoint || '';
      }
    }
  }

  async function loadData() {
    await settingsStore.loadKeys();
    syncEndpointsFromStore();
  }

  function getStatusBadge(provider: SecretProvider) {
    const status = keys[provider];
    if (!status) return { label: 'Not Configured', cssClass: 'badge-none', icon: '⚪' };

    if (provider === 'ollama') {
      if (status.isConfigured && status.source === 'database') {
        return { label: 'Connected (Database)', cssClass: 'badge-db', icon: '🟢' };
      }
      if (status.isConfigured && status.source === 'environment') {
        return { label: 'Connected (Environment)', cssClass: 'badge-env', icon: '🟢' };
      }
      return { label: 'Default (localhost:11434)', cssClass: 'badge-ready', icon: '🟢' };
    }

    if (status.isConfigured) {
      if (status.source === 'database') {
        return { label: 'Connected (Database)', cssClass: 'badge-db', icon: '🟢' };
      }
      if (status.source === 'environment') {
        const meta = PROVIDER_METAS.find((m) => m.id === provider);
        return { label: `Connected (Env: ${meta?.envVar || 'ENV'})`, cssClass: 'badge-env', icon: '🟢' };
      }
    }

    return { label: 'Not Configured', cssClass: 'badge-none', icon: '⚪' };
  }

  function canTest(meta: ProviderMeta): boolean {
    if (testingProvider[meta.id] || savingProvider[meta.id] || deletingProvider[meta.id]) {
      return false;
    }
    const status = keys[meta.id];
    const hasKey = status?.isConfigured || Boolean(candidateKeys[meta.id]?.trim());

    if (meta.id === 'ollama') return true;
    if (hasKey) return true;

    // Check for local OpenAI keyless verification
    if (meta.id === 'openai') {
      const endpoint = candidateEndpoints.openai?.trim() || status?.endpoint || '';
      if (endpoint.includes('localhost') || endpoint.includes('127.0.0.1')) {
        return true;
      }
    }

    return false;
  }

  async function handleSave(provider: SecretProvider) {
    const keyVal = candidateKeys[provider].trim();
    let endpointVal = candidateEndpoints[provider].trim();

    // For Ollama, default to localhost:11434 if both are empty
    if (provider === 'ollama' && !keyVal && !endpointVal) {
      endpointVal = 'http://localhost:11434';
      candidateEndpoints.ollama = endpointVal;
    }

    // Determine endpoint payload: null clears custom endpoint in DB
    const existingEndpoint = keys[provider]?.endpoint;
    const finalEndpoint = endpointVal.length > 0
      ? endpointVal
      : existingEndpoint
        ? null
        : undefined;

    if (!keyVal && finalEndpoint === undefined && provider !== 'ollama') {
      toastStore.warn(`Please enter a key or endpoint before saving.`);
      return;
    }

    try {
      await settingsStore.saveKey({
        provider,
        key: keyVal || undefined,
        endpoint: finalEndpoint,
      });
      candidateKeys[provider] = '';
    } catch {
      // Error toast handled inside store
    }
  }

  async function handleClear(provider: SecretProvider) {
    const meta = PROVIDER_METAS.find((m) => m.id === provider);
    const name = meta?.name || provider;
    if (!confirm(`Are you sure you want to remove the database-stored configuration for ${name}?`)) {
      return;
    }

    try {
      await settingsStore.deleteKey(provider);
      candidateKeys[provider] = '';
      candidateEndpoints[provider] = provider === 'ollama' ? 'http://localhost:11434' : '';
    } catch {
      // Error toast handled inside store
    }
  }

  async function handleTest(provider: SecretProvider) {
    const candidateKey = candidateKeys[provider].trim() || undefined;
    const candidateEndpoint = candidateEndpoints[provider].trim() || undefined;

    await settingsStore.testKey({
      provider,
      key: candidateKey,
      endpoint: candidateEndpoint,
    });
  }
</script>

<div class="settings-view">
  <!-- View Header -->
  <header class="view-header">
    <div class="header-left">
      <h1 class="view-title">Settings & Integrations</h1>
      <p class="view-subtitle">
        Manage API credentials and endpoints with local-first SQLite persistence and automatic environment fallback.
      </p>
    </div>
    <div class="header-actions">
      <button class="btn btn-secondary" onclick={loadData} disabled={loading}>
        <span class="icon" class:spinning={loading}>🔄</span>
        <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
      </button>
    </div>
  </header>

  <!-- Global Error Banner -->
  {#if error}
    <div class="banner banner-error">
      <span class="icon">⚠️</span>
      <div class="banner-content">
        <strong>Error loading settings:</strong> {error}
      </div>
      <button class="btn btn-sm btn-secondary" onclick={loadData}>Retry</button>
    </div>
  {/if}

  {#if loading && !hasLoaded}
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Loading credentials and integration statuses...</p>
    </div>
  {:else}
    <!-- Section 1: Data Source Connections -->
    <section class="settings-section">
      <div class="section-header">
        <div class="section-title-wrap">
          <span class="section-icon">🌐</span>
          <h2 class="section-title">Data Source Connections</h2>
        </div>
        <p class="section-desc">
          Integrate external documentation hubs and databases into your study library.
        </p>
      </div>

      <div class="cards-grid single-column">
        {#each sourceProviders as meta (meta.id)}
          {@const status = keys[meta.id]}
          {@const badge = getStatusBadge(meta.id)}
          {@const isTesting = testingProvider[meta.id]}
          {@const isSaving = savingProvider[meta.id]}
          {@const isDeleting = deletingProvider[meta.id]}
          {@const testResult = testResults[meta.id]}
          {@const testAllowed = canTest(meta)}

          <div class="card provider-card" id="card-{meta.id}">
            <div class="card-header">
              <div class="provider-info">
                <span class="provider-avatar">{meta.icon}</span>
                <div class="provider-name-wrap">
                  <h3 class="provider-name">{meta.name}</h3>
                  <span class="badge {badge.cssClass}">
                    <span class="badge-dot">{badge.icon}</span>
                    {badge.label}
                  </span>
                </div>
              </div>
              {#if meta.guideUrl}
                <a
                  href={meta.guideUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  class="guide-link"
                  title="Open integration guide in browser"
                >
                  Integration Guide ↗
                </a>
              {/if}
            </div>

            <p class="provider-desc">{meta.description}</p>

            <!-- Notion Page Sharing Hint -->
            <div class="notion-hint-box">
              <span class="hint-icon">💡</span>
              <div class="hint-text">
                <strong>Important:</strong> After creating your integration token, open your Notion database or page, click <strong>•••</strong> &rarr; <strong>Connect to</strong> / <strong>Add connections</strong>, and select your integration name.
              </div>
            </div>

            <!-- Active Key Status Masked Preview -->
            {#if status?.isConfigured}
              <div class="masked-preview-row">
                <span class="preview-label">Active Secret:</span>
                <code class="preview-code">{status.maskedValue}</code>
                <span class="source-tag">Source: {status.source}</span>
              </div>
            {/if}

            <!-- Form Container for Keyboard Accessibility (Enter key submits) -->
            <form onsubmit={(e) => { e.preventDefault(); handleSave(meta.id); }} class="provider-form">
              <!-- Inputs -->
              <div class="inputs-container">
                <div class="input-group">
                  <label for="key-{meta.id}" class="input-label">
                    {meta.keyLabel}
                    {#if status?.isConfigured}
                      <span class="label-subtext">(Enter a new value to replace existing)</span>
                    {/if}
                  </label>
                  <div class="input-with-action">
                    <input
                      id="key-{meta.id}"
                      type={showSecret[meta.id] ? 'text' : 'password'}
                      class="text-input font-mono"
                      placeholder={status?.isConfigured ? '••••••••••••••••••••' : meta.keyPlaceholder}
                      bind:value={candidateKeys[meta.id]}
                      autocomplete="off"
                      spellcheck="false"
                    />
                    <button
                      type="button"
                      class="btn btn-ghost reveal-btn"
                      onclick={() => (showSecret[meta.id] = !showSecret[meta.id])}
                      aria-label={showSecret[meta.id] ? 'Hide secret' : 'Reveal secret'}
                      aria-pressed={showSecret[meta.id]}
                      title={showSecret[meta.id] ? 'Hide secret' : 'Reveal secret'}
                    >
                      {showSecret[meta.id] ? '🔒 Hide' : '👁️ Show'}
                    </button>
                  </div>
                </div>
              </div>

              <!-- Card Actions -->
              <div class="card-actions">
                <div class="actions-left">
                  <button
                    type="submit"
                    class="btn btn-primary"
                    disabled={isSaving || isTesting || isDeleting || !candidateKeys[meta.id]?.trim()}
                  >
                    {#if isSaving}
                      <span class="mini-spinner"></span> Saving...
                    {:else}
                      💾 Save Token
                    {/if}
                  </button>

                  <button
                    type="button"
                    class="btn btn-secondary"
                    onclick={() => handleTest(meta.id)}
                    disabled={!testAllowed}
                  >
                    {#if isTesting}
                      <span class="mini-spinner"></span> Verifying...
                    {:else}
                      ⚡ Test Connection
                    {/if}
                  </button>
                </div>

                {#if status?.source === 'database'}
                  <div class="actions-right">
                    <button
                      type="button"
                      class="btn btn-danger-outline"
                      onclick={() => handleClear(meta.id)}
                      disabled={isSaving || isTesting || isDeleting}
                      title="Remove custom key from SQLite database"
                    >
                      {#if isDeleting}
                        <span class="mini-spinner"></span> Clearing...
                      {:else}
                        🗑️ Clear Stored Key
                      {/if}
                    </button>
                  </div>
                {/if}
              </div>
            </form>

            <!-- Verification Diagnostic Result Banner -->
            {#if testResult}
              <div
                class="test-result-banner"
                class:result-success={testResult.success}
                class:result-failure={!testResult.success}
              >
                <div class="result-header">
                  <span class="result-icon">{testResult.success ? '✅' : '❌'}</span>
                  <strong class="result-title">
                    {testResult.success ? 'Connection Verified' : 'Connection Failed'}
                  </strong>
                  <button
                    type="button"
                    class="btn-close"
                    onclick={() => settingsStore.clearTestResult(meta.id)}
                    title="Dismiss"
                  >
                    ✕
                  </button>
                </div>
                <p class="result-message">{testResult.message}</p>
                {#if testResult.details && Object.keys(testResult.details).length > 0}
                  <div class="result-details">
                    {#if testResult.details.workspaceName}
                      <span class="detail-pill">Workspace: {testResult.details.workspaceName}</span>
                    {/if}
                    {#if testResult.details.botName}
                      <span class="detail-pill">Bot: {testResult.details.botName}</span>
                    {/if}
                    {#if testResult.details.latencyMs !== undefined && testResult.details.latencyMs !== null}
                      <span class="detail-pill">{testResult.details.latencyMs}ms</span>
                    {/if}
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </section>

    <!-- Section 2: AI / LLM Providers -->
    <section class="settings-section">
      <div class="section-header">
        <div class="section-title-wrap">
          <span class="section-icon">⚡</span>
          <h2 class="section-title">AI & LLM Providers</h2>
        </div>
        <p class="section-desc">
          Configure API credentials and endpoints for card generation models.
        </p>
      </div>

      <div class="cards-grid two-column">
        {#each llmProviders as meta (meta.id)}
          {@const status = keys[meta.id]}
          {@const badge = getStatusBadge(meta.id)}
          {@const isTesting = testingProvider[meta.id]}
          {@const isSaving = savingProvider[meta.id]}
          {@const isDeleting = deletingProvider[meta.id]}
          {@const testResult = testResults[meta.id]}
          {@const testAllowed = canTest(meta)}

          <div class="card provider-card" id="card-{meta.id}">
            <div class="card-header">
              <div class="provider-info">
                <span class="provider-avatar">{meta.icon}</span>
                <div class="provider-name-wrap">
                  <h3 class="provider-name">{meta.name}</h3>
                  <span class="badge {badge.cssClass}">
                    <span class="badge-dot">{badge.icon}</span>
                    {badge.label}
                  </span>
                </div>
              </div>
            </div>

            <p class="provider-desc">{meta.description}</p>

            <!-- Active Key Status Masked Preview -->
            {#if status?.isConfigured && status.maskedValue}
              <div class="masked-preview-row">
                <span class="preview-label">Active Key:</span>
                <code class="preview-code">{status.maskedValue}</code>
                <span class="source-tag">Source: {status.source}</span>
              </div>
            {/if}

            {#if status?.endpoint}
              <div class="endpoint-preview-row">
                <span class="preview-label">Configured Endpoint:</span>
                <code class="preview-code">{status.endpoint}</code>
              </div>
            {/if}

            <!-- Form Container for Keyboard Accessibility (Enter key submits) -->
            <form onsubmit={(e) => { e.preventDefault(); handleSave(meta.id); }} class="provider-form">
              <!-- Inputs -->
              <div class="inputs-container">
                <!-- API Key Input -->
                <div class="input-group">
                  <label for="key-{meta.id}" class="input-label">
                    {meta.keyLabel}
                    {#if status?.isConfigured}
                      <span class="label-subtext">(Enter new key to replace)</span>
                    {/if}
                  </label>
                  <div class="input-with-action">
                    <input
                      id="key-{meta.id}"
                      type={showSecret[meta.id] ? 'text' : 'password'}
                      class="text-input font-mono"
                      placeholder={status?.isConfigured ? '••••••••••••••••••••' : meta.keyPlaceholder}
                      bind:value={candidateKeys[meta.id]}
                      autocomplete="off"
                      spellcheck="false"
                    />
                    <button
                      type="button"
                      class="btn btn-ghost reveal-btn"
                      onclick={() => (showSecret[meta.id] = !showSecret[meta.id])}
                      aria-label={showSecret[meta.id] ? 'Hide secret' : 'Reveal secret'}
                      aria-pressed={showSecret[meta.id]}
                      title={showSecret[meta.id] ? 'Hide secret' : 'Reveal secret'}
                    >
                      {showSecret[meta.id] ? '🔒 Hide' : '👁️ Show'}
                    </button>
                  </div>
                </div>

                <!-- Endpoint / Base URL Input -->
                {#if meta.hasEndpoint}
                  <div class="input-group">
                    <label for="endpoint-{meta.id}" class="input-label">
                      {meta.endpointLabel}
                    </label>
                    <input
                      id="endpoint-{meta.id}"
                      type="text"
                      class="text-input font-mono"
                      placeholder={meta.endpointPlaceholder}
                      bind:value={candidateEndpoints[meta.id]}
                      autocomplete="off"
                      spellcheck="false"
                    />
                  </div>
                {/if}
              </div>

              <!-- Card Actions -->
              <div class="card-actions">
                <div class="actions-left">
                  <button
                    type="submit"
                    class="btn btn-primary"
                    disabled={isSaving || isTesting || isDeleting || (!candidateKeys[meta.id]?.trim() && !candidateEndpoints[meta.id]?.trim() && meta.id !== 'ollama')}
                  >
                    {#if isSaving}
                      <span class="mini-spinner"></span> Saving...
                    {:else}
                      💾 Save
                    {/if}
                  </button>

                  <button
                    type="button"
                    class="btn btn-secondary"
                    onclick={() => handleTest(meta.id)}
                    disabled={!testAllowed}
                  >
                    {#if isTesting}
                      <span class="mini-spinner"></span> Testing...
                    {:else}
                      ⚡ Test Connection
                    {/if}
                  </button>
                </div>

                {#if status?.source === 'database' || (status?.endpoint && status.endpoint !== meta.defaultEndpoint)}
                  <div class="actions-right">
                    <button
                      type="button"
                      class="btn btn-danger-outline"
                      onclick={() => handleClear(meta.id)}
                      disabled={isSaving || isTesting || isDeleting}
                      title="Remove custom key or endpoint override from SQLite database"
                    >
                      {#if isDeleting}
                        <span class="mini-spinner"></span> Clearing...
                      {:else}
                        🗑️ Clear
                      {/if}
                    </button>
                  </div>
                {/if}
              </div>
            </form>

            <!-- Verification Diagnostic Result Banner -->
            {#if testResult}
              <div
                class="test-result-banner"
                class:result-success={testResult.success}
                class:result-failure={!testResult.success}
              >
                <div class="result-header">
                  <span class="result-icon">{testResult.success ? '✅' : '❌'}</span>
                  <strong class="result-title">
                    {testResult.success ? 'Connection Verified' : 'Connection Failed'}
                  </strong>
                  <button
                    type="button"
                    class="btn-close"
                    onclick={() => settingsStore.clearTestResult(meta.id)}
                    title="Dismiss"
                  >
                    ✕
                  </button>
                </div>
                <p class="result-message">{testResult.message}</p>
                {#if testResult.details && Object.keys(testResult.details).length > 0}
                  <div class="result-details">
                    {#if testResult.details.latencyMs !== undefined && testResult.details.latencyMs !== null}
                      <span class="detail-pill">Latency: {testResult.details.latencyMs}ms</span>
                    {/if}
                    {#if testResult.details.models && Array.isArray(testResult.details.models)}
                      <div class="models-catalog">
                        <span class="models-title">Available Models ({testResult.details.models.length}):</span>
                        <div class="models-list">
                          {#each testResult.details.models.slice(0, 5) as model}
                            <span class="model-tag">{model}</span>
                          {/each}
                          {#if testResult.details.models.length > 5}
                            <span class="model-tag-more">+{testResult.details.models.length - 5} more</span>
                          {/if}
                        </div>
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .settings-view {
    padding: 32px;
    display: flex;
    flex-direction: column;
    gap: 32px;
    max-width: 1200px;
    margin: 0 auto;
    width: 100%;
  }

  .view-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 20px;
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
    line-height: 1.5;
  }

  /* Banners */
  .banner {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 18px;
    border-radius: 8px;
    font-size: 14px;
  }

  .banner-error {
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;
  }

  .banner-content {
    flex: 1;
  }

  /* Section Styling */
  .settings-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .section-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .section-title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .section-icon {
    font-size: 18px;
  }

  .section-title {
    font-size: 18px;
    font-weight: 600;
    color: #f1f5f9;
    margin: 0;
  }

  .section-desc {
    font-size: 13px;
    color: #94a3b8;
    margin: 0;
  }

  /* Cards Grids */
  .cards-grid {
    display: grid;
    gap: 20px;
  }

  .cards-grid.single-column {
    grid-template-columns: 1fr;
  }

  .cards-grid.two-column {
    grid-template-columns: repeat(auto-fit, minmax(480px, 1fr));
  }

  @media (max-width: 640px) {
    .cards-grid.two-column {
      grid-template-columns: 1fr;
    }
  }

  /* Card */
  .card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
    transition: border-color 0.15s ease;
  }

  .card:hover {
    border-color: #475569;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .provider-info {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .provider-avatar {
    font-size: 24px;
    background: #0f172a;
    border: 1px solid #334155;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    flex-shrink: 0;
  }

  .provider-name-wrap {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .provider-name {
    font-size: 16px;
    font-weight: 600;
    color: #f8fafc;
    margin: 0;
  }

  .provider-desc {
    font-size: 13px;
    color: #94a3b8;
    margin: 0;
    line-height: 1.4;
  }

  /* Notion Hint Callout */
  .notion-hint-box {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 8px;
    background: rgba(99, 102, 241, 0.08);
    border: 1px solid rgba(99, 102, 241, 0.25);
    font-size: 12px;
    line-height: 1.45;
    color: #cbd5e1;
  }

  .hint-icon {
    font-size: 16px;
    line-height: 1;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .hint-text strong {
    color: #f8fafc;
  }

  .guide-link {
    font-size: 12px;
    color: #818cf8;
    text-decoration: none;
    font-weight: 500;
    padding: 4px 10px;
    background: rgba(99, 102, 241, 0.1);
    border: 1px solid rgba(99, 102, 241, 0.25);
    border-radius: 6px;
    transition: all 0.15s ease;
  }

  .guide-link:hover {
    background: rgba(99, 102, 241, 0.2);
    color: #a5b4fc;
    border-color: rgba(99, 102, 241, 0.4);
  }

  /* Badges */
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 9999px;
    width: fit-content;
  }

  .badge-db {
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.3);
  }

  .badge-env {
    background: rgba(59, 130, 246, 0.15);
    color: #60a5fa;
    border: 1px solid rgba(59, 130, 246, 0.3);
  }

  .badge-ready {
    background: rgba(16, 185, 129, 0.12);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.25);
  }

  .badge-none {
    background: rgba(148, 163, 184, 0.12);
    color: #94a3b8;
    border: 1px solid rgba(148, 163, 184, 0.25);
  }

  .badge-dot {
    font-size: 8px;
  }

  /* Masked Preview */
  .masked-preview-row,
  .endpoint-preview-row {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #0f172a;
    padding: 8px 12px;
    border-radius: 6px;
    border: 1px solid #1e293b;
    font-size: 12px;
  }

  .preview-label {
    color: #64748b;
    font-weight: 500;
  }

  .preview-code {
    color: #e2e8f0;
    background: rgba(255, 255, 255, 0.05);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
  }

  .source-tag {
    margin-left: auto;
    color: #64748b;
    font-size: 11px;
    text-transform: capitalize;
  }

  /* Form & Inputs */
  .provider-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .inputs-container {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .input-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .input-label {
    font-size: 12px;
    font-weight: 600;
    color: #cbd5e1;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .label-subtext {
    font-size: 11px;
    font-weight: 400;
    color: #64748b;
  }

  .input-with-action {
    display: flex;
    position: relative;
    align-items: center;
  }

  .text-input {
    width: 100%;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    padding: 9px 12px;
    font-size: 13px;
    color: #f1f5f9;
    outline: none;
    transition: border-color 0.15s ease;
  }

  .text-input:focus {
    border-color: #6366f1;
    box-shadow: 0 0 0 1px #6366f1;
  }

  .input-with-action .text-input {
    padding-right: 88px;
  }

  .reveal-btn {
    position: absolute;
    right: 6px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 11px;
    padding: 4px 8px;
    color: #94a3b8;
    background: transparent;
    border: 1px solid #334155;
    border-radius: 4px;
    cursor: pointer;
  }

  .reveal-btn:hover {
    color: #f1f5f9;
    border-color: #475569;
    background: rgba(255, 255, 255, 0.05);
  }

  .font-mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }

  /* Card Actions */
  .card-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding-top: 8px;
    border-top: 1px solid rgba(51, 65, 85, 0.5);
  }

  .actions-left,
  .actions-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* Buttons */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    border: 1px solid transparent;
    user-select: none;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: #4f46e5;
    color: #ffffff;
    border-color: #6366f1;
  }

  .btn-primary:hover:not(:disabled) {
    background: #4338ca;
  }

  .btn-secondary {
    background: #1e293b;
    color: #cbd5e1;
    border-color: #334155;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #334155;
    color: #f8fafc;
  }

  .btn-danger-outline {
    background: transparent;
    color: #f87171;
    border-color: rgba(239, 68, 68, 0.3);
  }

  .btn-danger-outline:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.15);
    border-color: #ef4444;
  }

  .btn-sm {
    padding: 4px 10px;
    font-size: 12px;
  }

  /* Diagnostics Result Banner */
  .test-result-banner {
    border-radius: 8px;
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    animation: fadeIn 0.2s ease-in-out;
  }

  .result-success {
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.3);
    color: #d1fae5;
  }

  .result-failure {
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fee2e2;
  }

  .result-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .result-title {
    font-weight: 600;
  }

  .result-message {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    word-break: break-word;
  }

  .btn-close {
    margin-left: auto;
    background: transparent;
    border: none;
    color: inherit;
    opacity: 0.6;
    cursor: pointer;
    font-size: 12px;
    padding: 2px 6px;
  }

  .btn-close:hover {
    opacity: 1;
  }

  .result-details {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 4px;
  }

  .detail-pill {
    font-size: 11px;
    background: rgba(0, 0, 0, 0.2);
    padding: 2px 8px;
    border-radius: 4px;
    color: #e2e8f0;
  }

  .models-catalog {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 4px;
    width: 100%;
  }

  .models-title {
    font-size: 11px;
    font-weight: 600;
    color: #94a3b8;
  }

  .models-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .model-tag {
    font-size: 11px;
    background: #0f172a;
    border: 1px solid #334155;
    padding: 2px 6px;
    border-radius: 4px;
    color: #38bdf8;
    font-family: ui-monospace, monospace;
  }

  .model-tag-more {
    font-size: 11px;
    color: #94a3b8;
    padding: 2px 4px;
  }

  /* Spinners & Animations */
  .mini-spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: #ffffff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .spinning {
    animation: spin 1s linear infinite;
    display: inline-block;
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    color: #94a3b8;
    gap: 12px;
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #1e293b;
    border-top-color: #6366f1;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
