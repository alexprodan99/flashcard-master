<script lang="ts">
  import { onMount } from 'svelte';
  import {
    settingsStore,
    toastStore,
    ALL_SECRET_PROVIDERS,
  } from '../stores/index.js';
  import type { SecretProvider, ProviderKeyStatus, DifficultyLevel, PersonaType } from '../lib/types.js';

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

  async function handleToggleVerboseLogging() {
    const nextVal = !settingsStore.verbose;
    try {
      await settingsStore.updateLogging({ verbose: nextVal });
    } catch {}
  }

  async function handleLogLevelChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    const nextLevel = select.value as 'debug' | 'info' | 'warn' | 'error';
    try {
      await settingsStore.updateLogging({ logLevel: nextLevel });
    } catch {}
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

  // --- General Settings & Integrations Studio ---
  let formGeneral = $state({ ...settingsStore.general });
  let candidateAnkiKey = $state('');
  let showAnkiKey = $state(false);

  $effect(() => {
    formGeneral = { ...settingsStore.general };
  });

  function getGeneralSourceBadge(key: string, envVarName: string) {
    const source = settingsStore.generalSources[key] || 'default';
    if (source === 'database') {
      return { label: 'Database', cssClass: 'badge-db', icon: '🟢' };
    }
    if (source === 'environment') {
      return { label: `Env: ${envVarName}`, cssClass: 'badge-env', icon: '🟡' };
    }
    return { label: 'Default', cssClass: 'badge-default', icon: '⚪' };
  }

  async function handleSaveGeneral(sectionName?: string) {
    const { ankiconnectApiKey: _masked, ...cleanGeneral } = formGeneral;
    const payload: any = { ...cleanGeneral };
    if (candidateAnkiKey.trim().length > 0) {
      payload.ankiconnectApiKey = candidateAnkiKey.trim();
    }
    try {
      await settingsStore.saveGeneral(payload);
      candidateAnkiKey = '';
      if (sectionName) {
        toastStore.success(`Saved ${sectionName} settings.`);
      }
    } catch {}
  }

  async function handleTestAnki() {
    await settingsStore.testAnki({
      endpointUrl: formGeneral.ankiconnectUrl,
      apiKey: candidateAnkiKey.trim() || undefined,
      timeoutMs: formGeneral.ankiconnectTimeoutMs,
    });
  }

  async function handleClearAnkiKey() {
    if (!confirm('Remove stored AnkiConnect API key from database?')) return;
    try {
      await settingsStore.saveGeneral({ ankiconnectApiKey: '' });
      candidateAnkiKey = '';
      toastStore.info('Cleared stored AnkiConnect API key.');
    } catch {}
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

    <!-- Section 3: Anki Desktop Integration -->
    <section class="settings-section" id="section-anki">
      <div class="section-header">
        <div class="section-title-wrap">
          <span class="section-icon">🎴</span>
          <h2 class="section-title">Anki Desktop Integration</h2>
          {#if settingsStore.ankiTestResult}
            {#if settingsStore.ankiTestResult.online}
              <span class="badge badge-db">
                <span class="badge-dot">🟢</span>
                Online (v{settingsStore.ankiTestResult.version ?? 6})
              </span>
            {:else}
              <span class="badge badge-none">
                <span class="badge-dot">🔴</span>
                Offline
              </span>
            {/if}
          {:else}
            <span class="badge badge-ready">
              <span class="badge-dot">🔵</span>
              AnkiConnect
            </span>
          {/if}
        </div>
        <p class="section-desc">
          Configure connection endpoint and security credentials for direct two-way flashcard synchronization with Anki Desktop.
        </p>
      </div>

      <div class="card provider-card" id="card-ankiconnect">
        <div class="card-header">
          <div class="provider-info">
            <span class="provider-avatar">🎴</span>
            <div class="provider-name-wrap">
              <h3 class="provider-name">AnkiConnect Bridge</h3>
              <span class="badge {getGeneralSourceBadge('ankiconnectUrl', 'ANKI_CONNECT_URL').cssClass}">
                <span class="badge-dot">{getGeneralSourceBadge('ankiconnectUrl', 'ANKI_CONNECT_URL').icon}</span>
                {getGeneralSourceBadge('ankiconnectUrl', 'ANKI_CONNECT_URL').label}
              </span>
            </div>
          </div>
          <a
            href="https://ankiweb.net/shared/info/2055492159"
            target="_blank"
            rel="noreferrer noopener"
            class="guide-link"
          >
            <span>AnkiConnect Plugin #2055492159</span>
            <span class="arrow">↗</span>
          </a>
        </div>

        <p class="provider-desc">
          Direct synchronization to your local or remote Anki collection via the AnkiConnect add-on HTTP bridge.
        </p>

        <!-- Active Token Masked Preview -->
        {#if settingsStore.maskedAnkiKey}
          <div class="masked-preview-row">
            <span class="preview-label">Active API Key Token:</span>
            <code class="preview-code">{settingsStore.maskedAnkiKey}</code>
            <span class="source-tag">Source: {settingsStore.generalSources['ankiconnectApiKey'] || 'database'}</span>
            <button
              type="button"
              class="btn-text-danger"
              onclick={handleClearAnkiKey}
              title="Remove stored token from database"
            >
              Clear
            </button>
          </div>
        {/if}

        <div class="inputs-container">
          <div class="input-row-grid">
            <!-- Anki Endpoint URL -->
            <div class="input-group">
              <label for="anki-url" class="input-label">
                Endpoint URL
                <span class="badge-mini {getGeneralSourceBadge('ankiconnectUrl', 'ANKI_CONNECT_URL').cssClass}">
                  {getGeneralSourceBadge('ankiconnectUrl', 'ANKI_CONNECT_URL').label}
                </span>
              </label>
              <input
                id="anki-url"
                type="text"
                class="text-input"
                bind:value={formGeneral.ankiconnectUrl}
                placeholder="http://127.0.0.1:8765"
              />
            </div>

            <!-- Connection Timeout (ms) -->
            <div class="input-group">
              <label for="anki-timeout" class="input-label">
                Timeout (ms)
                <span class="badge-mini {getGeneralSourceBadge('ankiconnectTimeoutMs', 'ANKI_CONNECT_TIMEOUT_MS').cssClass}">
                  {getGeneralSourceBadge('ankiconnectTimeoutMs', 'ANKI_CONNECT_TIMEOUT_MS').label}
                </span>
              </label>
              <input
                id="anki-timeout"
                type="number"
                min="500"
                max="30000"
                step="500"
                class="text-input"
                bind:value={formGeneral.ankiconnectTimeoutMs}
                placeholder="3000"
              />
            </div>
          </div>

          <!-- Optional API Key / Secret Token -->
          <div class="input-group">
            <label for="anki-token" class="input-label">
              AnkiConnect API Token (Optional)
              {#if settingsStore.maskedAnkiKey}
                <span class="label-subtext">(Enter new value to update)</span>
              {/if}
              <span class="badge-mini {getGeneralSourceBadge('ankiconnectApiKey', 'ANKI_CONNECT_API_KEY').cssClass}">
                {getGeneralSourceBadge('ankiconnectApiKey', 'ANKI_CONNECT_API_KEY').label}
              </span>
            </label>
            <div class="input-with-action">
              <input
                id="anki-token"
                type={showAnkiKey ? 'text' : 'password'}
                class="text-input"
                bind:value={candidateAnkiKey}
                placeholder={settingsStore.maskedAnkiKey ? '••••••••••••••••' : 'Optional apiKey configured in AnkiConnect'}
                autocomplete="off"
              />
              <button
                type="button"
                class="reveal-btn"
                onclick={() => showAnkiKey = !showAnkiKey}
                aria-label={showAnkiKey ? 'Hide Token' : 'Show Token'}
              >
                {showAnkiKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
        </div>

        <!-- Anki Diagnostic Test Results Banner -->
        {#if settingsStore.ankiTestResult}
          <div
            class="banner banner-diagnostic"
            class:banner-success={settingsStore.ankiTestResult.online}
            class:banner-error={!settingsStore.ankiTestResult.online}
          >
            <span class="icon">{settingsStore.ankiTestResult.online ? '✓' : '✗'}</span>
            <div class="banner-content">
              <strong>{settingsStore.ankiTestResult.online ? 'AnkiConnect Reachable' : 'Connection Failed'}:</strong>
              {#if settingsStore.ankiTestResult.online}
                Detected AnkiConnect version {settingsStore.ankiTestResult.version ?? 6} (Latency: {settingsStore.ankiTestResult.latencyMs ?? 0}ms).
              {:else}
                {settingsStore.ankiTestResult.error || 'Connection refused'}. Ensure Anki is running with AnkiConnect enabled.
              {/if}
            </div>
          </div>
        {/if}

        <div class="form-actions">
          <button
            type="button"
            class="btn btn-secondary"
            onclick={handleTestAnki}
            disabled={settingsStore.testingAnki}
          >
            <span class="icon" class:spinning={settingsStore.testingAnki}>🔌</span>
            <span>{settingsStore.testingAnki ? 'Pinging Anki...' : 'Test Connection'}</span>
          </button>
          <button
            type="button"
            class="btn btn-primary"
            onclick={() => handleSaveGeneral('Anki Desktop')}
            disabled={settingsStore.savingGeneral}
          >
            <span class="icon">💾</span>
            <span>{settingsStore.savingGeneral ? 'Saving...' : 'Save Anki Settings'}</span>
          </button>
        </div>
      </div>
    </section>

    <!-- Section 4: AI Generation Defaults -->
    <section class="settings-section" id="section-ai-defaults">
      <div class="section-header">
        <div class="section-title-wrap">
          <span class="section-icon">⚡</span>
          <h2 class="section-title">AI Generation Studio Defaults</h2>
        </div>
        <p class="section-desc">
          Configure default AI parameters automatically applied when opening Generate Studio or executing automated card syntheses.
        </p>
      </div>

      <div class="card provider-card">
        <div class="inputs-container">
          <div class="input-row-grid">
            <!-- Default AI Provider -->
            <div class="input-group">
              <label for="default-provider" class="input-label">
                Default LLM Provider
                <span class="badge-mini {getGeneralSourceBadge('defaultAiProvider', 'DEFAULT_AI_PROVIDER').cssClass}">
                  {getGeneralSourceBadge('defaultAiProvider', 'DEFAULT_AI_PROVIDER').label}
                </span>
              </label>
              <select
                id="default-provider"
                class="select-input"
                bind:value={formGeneral.defaultAiProvider}
              >
                <option value="ollama">🦙 Ollama (Local / Remote)</option>
                <option value="openai">🤖 OpenAI</option>
                <option value="anthropic">🧠 Anthropic Claude</option>
                <option value="gemini">✨ Google Gemini</option>
              </select>
            </div>

            <!-- Default Model -->
            <div class="input-group">
              <label for="default-model" class="input-label">
                Default Model Name
                <span class="badge-mini {getGeneralSourceBadge('defaultAiModel', 'DEFAULT_AI_MODEL').cssClass}">
                  {getGeneralSourceBadge('defaultAiModel', 'DEFAULT_AI_MODEL').label}
                </span>
              </label>
              <input
                id="default-model"
                type="text"
                class="text-input"
                bind:value={formGeneral.defaultAiModel}
                placeholder="phi4-mini, gpt-4o-mini, etc."
              />
            </div>
          </div>

          <div class="input-row-grid">
            <!-- Default Persona -->
            <div class="input-group">
              <label for="default-persona" class="input-label">
                Default Persona
                <span class="badge-mini {getGeneralSourceBadge('defaultPersona', 'DEFAULT_PERSONA').cssClass}">
                  {getGeneralSourceBadge('defaultPersona', 'DEFAULT_PERSONA').label}
                </span>
              </label>
              <select
                id="default-persona"
                class="select-input"
                bind:value={formGeneral.defaultPersona}
              >
                <option value="socratic-mentor">🏛️ Socratic Mentor (Concept-first, probing questions)</option>
                <option value="strict-examiner">🎓 Strict Examiner (Rigorous, test-style precision)</option>
                <option value="analogy-builder">💡 Analogy Builder (Metaphors & intuitive models)</option>
              </select>
            </div>

            <!-- Default Difficulty -->
            <div class="input-group">
              <label for="default-difficulty" class="input-label">
                Default Difficulty
                <span class="badge-mini {getGeneralSourceBadge('defaultDifficulty', 'DEFAULT_DIFFICULTY').cssClass}">
                  {getGeneralSourceBadge('defaultDifficulty', 'DEFAULT_DIFFICULTY').label}
                </span>
              </label>
              <select
                id="default-difficulty"
                class="select-input"
                bind:value={formGeneral.defaultDifficulty}
              >
                <option value="beginner">🌱 Beginner (Foundational terms)</option>
                <option value="intermediate">⚖️ Intermediate (Mechanisms & concepts)</option>
                <option value="expert">🔥 Expert (Edge cases & deep analysis)</option>
                <option value="mixed">🎯 Mixed (Multi-tiered coverage)</option>
              </select>
            </div>
          </div>

          <div class="input-row-grid">
            <!-- Default Card Limit -->
            <div class="input-group">
              <label for="default-card-limit" class="input-label">
                Default Card Batch Limit
                <span class="badge-mini {getGeneralSourceBadge('defaultCardLimit', 'DEFAULT_CARD_LIMIT').cssClass}">
                  {getGeneralSourceBadge('defaultCardLimit', 'DEFAULT_CARD_LIMIT').label}
                </span>
              </label>
              <input
                id="default-card-limit"
                type="number"
                min="1"
                max="50"
                class="text-input"
                bind:value={formGeneral.defaultCardLimit}
                placeholder="5"
              />
            </div>

            <!-- Grounding Enforced -->
            <div class="input-group">
              <label for="default-grounding" class="input-label">
                Verbatim Grounding Guard
                <span class="badge-mini {getGeneralSourceBadge('defaultGroundingEnforced', 'DEFAULT_GROUNDING_ENFORCED').cssClass}">
                  {getGeneralSourceBadge('defaultGroundingEnforced', 'DEFAULT_GROUNDING_ENFORCED').label}
                </span>
              </label>
              <div class="grounding-toggle-wrap">
                <button
                  type="button"
                  id="default-grounding"
                  class="btn-toggle-switch"
                  class:checked={formGeneral.defaultGroundingEnforced}
                  onclick={() => formGeneral.defaultGroundingEnforced = !formGeneral.defaultGroundingEnforced}
                  role="switch"
                  aria-checked={formGeneral.defaultGroundingEnforced}
                  aria-label="Toggle verbatim grounding guard"
                >
                  <span class="switch-handle"></span>
                </button>
                <span class="toggle-status-text" class:status-active={formGeneral.defaultGroundingEnforced}>
                  {formGeneral.defaultGroundingEnforced ? 'Strict Verification Active' : 'Permissive (Ungrounded Allowed)'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="form-actions right-align">
          <button
            type="button"
            class="btn btn-primary"
            onclick={() => handleSaveGeneral('AI Generation')}
            disabled={settingsStore.savingGeneral}
          >
            <span class="icon">💾</span>
            <span>{settingsStore.savingGeneral ? 'Saving...' : 'Save AI Defaults'}</span>
          </button>
        </div>
      </div>
    </section>

    <!-- Section 5: Worker Pool & Concurrency Limits -->
    <section class="settings-section" id="section-worker-pool">
      <div class="section-header">
        <div class="section-title-wrap">
          <span class="section-icon">⚙️</span>
          <h2 class="section-title">Worker Pool & Concurrency Limits</h2>
        </div>
        <p class="section-desc">
          Dynamically tune parallel task slots for background workers without restarting the server.
        </p>
      </div>

      <div class="card provider-card">
        <div class="inputs-container">
          <div class="input-row-grid">
            <!-- Generation Workers -->
            <div class="input-group">
              <label for="max-gen-workers" class="input-label">
                Generation Workers (1–16)
                <span class="badge-mini {getGeneralSourceBadge('maxGenerationWorkers', 'MAX_GENERATION_WORKERS').cssClass}">
                  {getGeneralSourceBadge('maxGenerationWorkers', 'MAX_GENERATION_WORKERS').label}
                </span>
              </label>
              <input
                id="max-gen-workers"
                type="number"
                min="1"
                max="16"
                class="text-input"
                bind:value={formGeneral.maxGenerationWorkers}
              />
              <span class="input-hint">Parallel LLM synthesis job slots</span>
            </div>

            <!-- Sync Workers -->
            <div class="input-group">
              <label for="max-sync-workers" class="input-label">
                Sync Ingestion Workers (1–16)
                <span class="badge-mini {getGeneralSourceBadge('maxSyncWorkers', 'MAX_SYNC_WORKERS').cssClass}">
                  {getGeneralSourceBadge('maxSyncWorkers', 'MAX_SYNC_WORKERS').label}
                </span>
              </label>
              <input
                id="max-sync-workers"
                type="number"
                min="1"
                max="16"
                class="text-input"
                bind:value={formGeneral.maxSyncWorkers}
              />
              <span class="input-hint">Parallel data source crawls & parsing</span>
            </div>
          </div>

          <div class="input-row-grid">
            <!-- Export Workers -->
            <div class="input-group">
              <label for="max-export-workers" class="input-label">
                Export Workers (1–16)
                <span class="badge-mini {getGeneralSourceBadge('maxExportWorkers', 'MAX_EXPORT_WORKERS').cssClass}">
                  {getGeneralSourceBadge('maxExportWorkers', 'MAX_EXPORT_WORKERS').label}
                </span>
              </label>
              <input
                id="max-export-workers"
                type="number"
                min="1"
                max="16"
                class="text-input"
                bind:value={formGeneral.maxExportWorkers}
              />
              <span class="input-hint">Parallel APKG, PDF & EPUB packaging</span>
            </div>

            <!-- Task Timeout -->
            <div class="input-group">
              <label for="worker-timeout" class="input-label">
                Task Execution Timeout (Minutes)
                <span class="badge-mini {getGeneralSourceBadge('workerTimeoutMinutes', 'WORKER_TIMEOUT_MINUTES').cssClass}">
                  {getGeneralSourceBadge('workerTimeoutMinutes', 'WORKER_TIMEOUT_MINUTES').label}
                </span>
              </label>
              <input
                id="worker-timeout"
                type="number"
                min="0"
                max="120"
                class="text-input"
                bind:value={formGeneral.workerTimeoutMinutes}
              />
              <span class="input-hint">Max execution duration before auto-cancel (set 0 for infinite / no auto-timeout)</span>
              {#if formGeneral.workerTimeoutMinutes === 0}
                <div class="banner banner-warning timeout-warning" role="alert">
                  <span class="banner-icon">⚠️</span>
                  <div class="banner-content">
                    <strong>No Timeout Limit:</strong> Background worker tasks will run indefinitely until completion. If an LLM endpoint or network socket hangs, use the Task Center to manually cancel the job.
                  </div>
                </div>
              {/if}
            </div>
          </div>
        </div>

        <div class="form-actions right-align">
          <button
            type="button"
            class="btn btn-primary"
            onclick={() => handleSaveGeneral('Worker Pool')}
            disabled={settingsStore.savingGeneral}
          >
            <span class="icon">💾</span>
            <span>{settingsStore.savingGeneral ? 'Saving...' : 'Apply Worker Limits'}</span>
          </button>
        </div>
      </div>
    </section>

    <!-- Section 6: Document Slicing & EPUB Defaults -->
    <section class="settings-section" id="section-slicing-epub">
      <div class="section-header">
        <div class="section-title-wrap">
          <span class="section-icon">📄</span>
          <h2 class="section-title">Document Slicing & EPUB Publishing Defaults</h2>
        </div>
        <p class="section-desc">
          Configure default document chapter chunking rules and e-book publishing metadata.
        </p>
      </div>

      <div class="card provider-card">
        <div class="inputs-container">
          <div class="input-row-grid">
            <!-- Slicing Strategy -->
            <div class="input-group">
              <label for="slicing-mode" class="input-label">
                Default Chapter Slicing Mode
                <span class="badge-mini {getGeneralSourceBadge('defaultSlicingMode', 'DEFAULT_SLICING_MODE').cssClass}">
                  {getGeneralSourceBadge('defaultSlicingMode', 'DEFAULT_SLICING_MODE').label}
                </span>
              </label>
              <select
                id="slicing-mode"
                class="select-input"
                bind:value={formGeneral.defaultSlicingMode}
              >
                <option value="outline">📑 Semantic Outline (Headings & Table of Contents)</option>
                <option value="budget">📄 Fixed Page Budget (Pages per chunk)</option>
                <option value="none">📦 Entire Document (Single chunk)</option>
              </select>
            </div>

            <!-- Page Budget -->
            <div class="input-group">
              <label for="page-budget" class="input-label">
                Default Page Budget (Pages per Chunk)
                <span class="badge-mini {getGeneralSourceBadge('defaultPageBudget', 'DEFAULT_PAGE_BUDGET').cssClass}">
                  {getGeneralSourceBadge('defaultPageBudget', 'DEFAULT_PAGE_BUDGET').label}
                </span>
              </label>
              <input
                id="page-budget"
                type="number"
                min="1"
                max="100"
                class="text-input"
                bind:value={formGeneral.defaultPageBudget}
              />
            </div>
          </div>

          <div class="input-row-grid">
            <!-- EPUB Default Author -->
            <div class="input-group">
              <label for="epub-author" class="input-label">
                EPUB Default Author
                <span class="badge-mini {getGeneralSourceBadge('epubDefaultAuthor', 'EPUB_DEFAULT_AUTHOR').cssClass}">
                  {getGeneralSourceBadge('epubDefaultAuthor', 'EPUB_DEFAULT_AUTHOR').label}
                </span>
              </label>
              <input
                id="epub-author"
                type="text"
                class="text-input"
                bind:value={formGeneral.epubDefaultAuthor}
                placeholder="Flashcard Master"
              />
            </div>

            <!-- EPUB Default Publisher -->
            <div class="input-group">
              <label for="epub-publisher" class="input-label">
                EPUB Default Publisher
                <span class="badge-mini {getGeneralSourceBadge('epubDefaultPublisher', 'EPUB_DEFAULT_PUBLISHER').cssClass}">
                  {getGeneralSourceBadge('epubDefaultPublisher', 'EPUB_DEFAULT_PUBLISHER').label}
                </span>
              </label>
              <input
                id="epub-publisher"
                type="text"
                class="text-input"
                bind:value={formGeneral.epubDefaultPublisher}
                placeholder="Flashcard Master Studio"
              />
            </div>
          </div>
        </div>

        <div class="form-actions right-align">
          <button
            type="button"
            class="btn btn-primary"
            onclick={() => handleSaveGeneral('Slicing & EPUB')}
            disabled={settingsStore.savingGeneral}
          >
            <span class="icon">💾</span>
            <span>{settingsStore.savingGeneral ? 'Saving...' : 'Save Slicing & EPUB Settings'}</span>
          </button>
        </div>
      </div>
    </section>

    <!-- Logging & Diagnostics Section -->
    <section class="settings-section" id="section-logging">
      <div class="section-header">
        <div class="section-title-wrap">
          <h2 class="section-title">Terminal & Task Center Logging</h2>
          <span class="badge badge-configured">Live Diagnostics</span>
        </div>
        <p class="section-desc">
          Configure real-time log streaming for background jobs (Notion page crawling, database row inspection, card generation chunking, deduplication).
        </p>
      </div>

      <div class="card logging-card">
        <div class="logging-row">
          <div class="logging-info">
            <div class="logging-title-wrap">
              <span class="logging-icon">🐞</span>
              <strong class="logging-item-title">Verbose Diagnostic Mode</strong>
            </div>
            <p class="logging-description">
              Emits low-level execution traces (Notion subpage recursion depth, raw block counts, local image caching, LLM generation chunks) to both the terminal console and the Task Center.
            </p>
          </div>
          <div class="logging-control">
            <button
              type="button"
              class="btn-toggle-switch"
              class:checked={settingsStore.verbose}
              onclick={handleToggleVerboseLogging}
              disabled={settingsStore.savingLogging}
              role="switch"
              aria-checked={settingsStore.verbose}
              aria-label="Toggle verbose diagnostic logging"
            >
              <span class="switch-handle"></span>
            </button>
            <span class="toggle-status-text" class:status-active={settingsStore.verbose}>
              {settingsStore.verbose ? 'Active' : 'Off'}
            </span>
          </div>
        </div>

        <div class="logging-divider"></div>

        <div class="logging-row">
          <div class="logging-info">
            <div class="logging-title-wrap">
              <span class="logging-icon">📊</span>
              <strong class="logging-item-title">Server Log Level</strong>
            </div>
            <p class="logging-description">
              Sets the minimum severity threshold printed to the server terminal console.
            </p>
          </div>
          <div class="logging-control">
            <select
              class="log-level-select"
              value={settingsStore.logLevel}
              onchange={handleLogLevelChange}
              disabled={settingsStore.savingLogging}
              aria-label="Select server log level"
            >
              <option value="debug">DEBUG (Everything / Full Traces)</option>
              <option value="info">INFO (Standard Steps & Progress)</option>
              <option value="warn">WARN (Warnings & Errors Only)</option>
              <option value="error">ERROR (Errors Only)</option>
            </select>
          </div>
        </div>
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

  .banner-warning {
    background: rgba(245, 158, 11, 0.12);
    border: 1px solid rgba(245, 158, 11, 0.35);
    color: #fcd34d;
  }

  .timeout-warning {
    margin-top: 8px;
    padding: 10px 14px;
    font-size: 13px;
    line-height: 1.4;
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

  .logging-card {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px 24px;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
  }

  .logging-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
  }

  .logging-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }

  .logging-title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .logging-icon {
    font-size: 16px;
  }

  .logging-item-title {
    font-size: 14px;
    font-weight: 600;
    color: #f8fafc;
  }

  .logging-description {
    margin: 0;
    font-size: 13px;
    color: #94a3b8;
    line-height: 1.4;
  }

  .logging-divider {
    height: 1px;
    background: #334155;
  }

  .logging-control {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }

  .btn-toggle-switch {
    width: 44px;
    height: 24px;
    border-radius: 12px;
    background: #334155;
    border: none;
    cursor: pointer;
    position: relative;
    padding: 2px;
    transition: background 0.2s;
  }

  .btn-toggle-switch.checked {
    background: #6366f1;
  }

  .btn-toggle-switch:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .switch-handle {
    display: block;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #ffffff;
    transition: transform 0.2s;
  }

  .btn-toggle-switch.checked .switch-handle {
    transform: translateX(20px);
  }

  .toggle-status-text {
    font-size: 12px;
    font-weight: 600;
    color: #64748b;
    min-width: 40px;
  }

  .toggle-status-text.status-active {
    color: #a5b4fc;
  }

  .log-level-select {
    background: #0f172a;
    border: 1px solid #334155;
    color: #f8fafc;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    outline: none;
    transition: border-color 0.15s;
  }

  .log-level-select:focus {
    border-color: #6366f1;
  }

  .log-level-select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .input-row-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 16px;
  }

  .badge-mini {
    display: inline-flex;
    align-items: center;
    font-size: 10px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 9999px;
    margin-left: 6px;
  }

  .badge-default {
    background: rgba(148, 163, 184, 0.12);
    color: #94a3b8;
    border: 1px solid rgba(148, 163, 184, 0.25);
  }

  .select-input {
    width: 100%;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    padding: 9px 12px;
    font-size: 13px;
    color: #f1f5f9;
    outline: none;
    transition: border-color 0.15s ease;
    cursor: pointer;
  }

  .select-input:focus {
    border-color: #6366f1;
    box-shadow: 0 0 0 1px #6366f1;
  }

  .grounding-toggle-wrap {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 7px 0;
  }

  .form-actions.right-align {
    justify-content: flex-end;
  }

  .input-hint {
    font-size: 11px;
    color: #64748b;
  }

  .btn-text-danger {
    background: transparent;
    border: none;
    color: #f87171;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
    transition: background 0.15s;
    margin-left: auto;
  }

  .btn-text-danger:hover {
    background: rgba(239, 68, 68, 0.15);
  }
</style>
