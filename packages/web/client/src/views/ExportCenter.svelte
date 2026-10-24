<script lang="ts">
  import { onMount } from 'svelte';
  import { checkAnkiStatus, pushToAnki, fetchCards, fetchCardsPaginated, fetchSources, fetchDocuments, exportDocuments } from '../lib/api';
  import type { DataSource, DiscoveredDocument } from '../lib/types';
  import DocumentExportModal from '../components/DocumentExportModal.svelte';
  import { exportStore, toastStore } from '../stores/index.js';

  let isAnkiConnected = $state(false);
  let isCheckingAnki = $state(true);

  // Flashcards state
  let availableDecks = $state<string[]>([]);
  let totalCardsCount = $state(0);

  // Time & Scope Filtering State
  let isScopeFilterExpanded = $state(true);
  let datePreset = $state<'all' | '24h' | '7d' | '30d' | 'custom'>('all');
  let customAfter = $state('');
  let customBefore = $state('');
  let exportLimit = $state<number | null>(null);
  let exportShuffle = $state(false);
  let matchingCardsCount = $state(0);
  let isLoadingCount = $state(false);

  // Knowledge Base Documents state
  let sources = $state<DataSource[]>([]);
  let totalDocsCount = $state(0);

  // Advanced Export Modal state
  let isExportModalOpen = $state(false);
  let modalDocuments = $state<DiscoveredDocument[]>([]);
  let modalSourceName = $state('Knowledge Base');
  let modalSourceId = $state<string | undefined>(undefined);

  let activeDownloadFormat = $state<string | null>(null);
  let activeKbFormat = $state<string | null>(null);

  let isKnowledgeExporting = $derived(exportStore.isKnowledgeExporting);
  let isPushing = $derived(exportStore.isPushing);
  let pushMessage = $derived(exportStore.pushMessage);
  let knowledgeNotice = $derived(exportStore.knowledgeNotice);

  let effectiveAfter = $derived.by(() => {
    if (datePreset === 'all') return undefined;
    if (datePreset === '24h') return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    if (datePreset === '7d') return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    if (datePreset === '30d') return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    if (datePreset === 'custom') {
      return customAfter ? (customAfter.length === 10 ? `${customAfter}T00:00:00Z` : customAfter) : undefined;
    }
    return undefined;
  });

  let effectiveBefore = $derived.by(() => {
    if (datePreset === 'custom') {
      return customBefore ? (customBefore.length === 10 ? `${customBefore}T23:59:59Z` : customBefore) : undefined;
    }
    return undefined;
  });

  let effectiveExportCount = $derived.by(() => {
    if (exportLimit && exportLimit > 0) {
      return Math.min(matchingCardsCount, exportLimit);
    }
    return matchingCardsCount;
  });

  $effect(() => {
    const deck = exportStore.selectedDeck;
    const after = effectiveAfter;
    const before = effectiveBefore;

    let cancelled = false;
    isLoadingCount = true;

    fetchCardsPaginated({
      deck: deck !== 'all' ? deck : undefined,
      createdAfter: after,
      createdBefore: before,
      limit: 1,
    })
      .then((res) => {
        if (!cancelled) {
          matchingCardsCount = res.total;
        }
      })
      .catch(() => {
        if (!cancelled) {
          matchingCardsCount = 0;
        }
      })
      .finally(() => {
        if (!cancelled) {
          isLoadingCount = false;
        }
      });

    return () => {
      cancelled = true;
    };
  });

  async function checkAnki() {
    isCheckingAnki = true;
    try {
      const res = await checkAnkiStatus();
      isAnkiConnected = res.connected;
    } catch {
      isAnkiConnected = false;
    } finally {
      isCheckingAnki = false;
    }
  }

  async function handlePush() {
    if (!isAnkiConnected || isPushing || isKnowledgeExporting || activeDownloadFormat !== null) return;
    if (matchingCardsCount === 0) {
      toastStore.warning('No cards match the active filter criteria to push to Anki.');
      return;
    }
    exportStore.isPushing = true;
    exportStore.pushMessage = null;
    try {
      const res = await pushToAnki({
        targetDeck: exportStore.selectedDeck !== 'all' ? exportStore.selectedDeck : undefined,
        createdAfter: effectiveAfter,
        createdBefore: effectiveBefore,
        limit: exportLimit && exportLimit > 0 ? exportLimit : undefined,
        shuffle: exportShuffle,
      });
      const msg = res.message || `Successfully pushed ${res.cardsPushed} cards to Anki Desktop!`;
      exportStore.pushMessage = `✅ ${msg}`;
      toastStore.success(msg);
    } catch (err: any) {
      exportStore.pushMessage = '⚠️ Push failed: ' + err.message;
      toastStore.error('Push failed: ' + err.message);
    } finally {
      exportStore.isPushing = false;
    }
  }

  function downloadFormat(format: 'apkg' | 'markdown' | 'pdf' | 'csv' | 'tsv' | 'epub') {
    if (activeDownloadFormat !== null || isPushing || isKnowledgeExporting) return;
    if (matchingCardsCount === 0) {
      toastStore.warning('No cards match the active filter criteria to export.');
      return;
    }
    activeDownloadFormat = format;
    toastStore.info(`Preparing ${format.toUpperCase()} export download (${effectiveExportCount} cards)...`);
    const query = new URLSearchParams();
    if (exportStore.selectedDeck !== 'all') {
      query.set('deck', exportStore.selectedDeck);
    }
    if (effectiveAfter) {
      query.set('after', effectiveAfter);
    }
    if (effectiveBefore) {
      query.set('before', effectiveBefore);
    }
    if (exportLimit && exportLimit > 0) {
      query.set('limit', String(exportLimit));
    }
    if (exportShuffle) {
      query.set('shuffle', 'true');
    }
    const url = `/api/export/${format}?${query.toString()}`;
    window.location.href = url;
    setTimeout(() => {
      activeDownloadFormat = null;
    }, 2000);
  }

  async function downloadKnowledgeBase(format: 'markdown' | 'html' | 'txt' | 'json', mode: 'merged' | 'split' = 'merged') {
    if (isKnowledgeExporting || isPushing || activeDownloadFormat !== null) return;
    activeKbFormat = `${format}-${mode}`;
    exportStore.isKnowledgeExporting = true;
    exportStore.knowledgeNotice = null;

    try {
      // Pre-flight check
      const docRes = await fetchDocuments(exportStore.selectedSourceId !== 'all' ? exportStore.selectedSourceId : undefined);
      if (!docRes.documents || docRes.documents.length === 0) {
        const selectedSrc = sources.find((s) => s.id === exportStore.selectedSourceId);
        const name = selectedSrc ? selectedSrc.name : 'knowledge base';
        const notice = `⚠️ No documents found in "${name}". Please sync the data source first before exporting.`;
        exportStore.knowledgeNotice = notice;
        toastStore.warning(notice);
        return;
      }

      toastStore.info(`Synthesizing ${format.toUpperCase()} ${mode} knowledge export...`);
      const result = await exportDocuments({
        sourceId: exportStore.selectedSourceId !== 'all' ? exportStore.selectedSourceId : undefined,
        format,
        mode,
        includeTableOfContents: true,
        includeCitations: true,
      });

      exportStore.knowledgeNotice = `✅ Downloaded ${result.filename}!`;
      toastStore.success(`Downloaded ${result.filename}!`);
      setTimeout(() => (exportStore.knowledgeNotice = null), 5000);
    } catch (err: any) {
      exportStore.knowledgeNotice = `⚠️ Export failed: ${err.message}`;
      toastStore.error(`Export failed: ${err.message}`);
    } finally {
      exportStore.isKnowledgeExporting = false;
      activeKbFormat = null;
    }
  }

  async function openAdvancedExportModal() {
    if (isKnowledgeExporting || isPushing || activeDownloadFormat !== null) return;
    exportStore.isKnowledgeExporting = true;
    exportStore.knowledgeNotice = null;
    try {
      const docRes = await fetchDocuments(exportStore.selectedSourceId !== 'all' ? exportStore.selectedSourceId : undefined);
      if (!docRes.documents || docRes.documents.length === 0) {
        const selectedSrc = sources.find((s) => s.id === exportStore.selectedSourceId);
        const name = selectedSrc ? selectedSrc.name : 'knowledge base';
        const notice = `⚠️ No documents found in "${name}". Please sync the data source first before exporting.`;
        exportStore.knowledgeNotice = notice;
        toastStore.warning(notice);
        return;
      }

      const selectedSrc = sources.find((s) => s.id === exportStore.selectedSourceId);
      modalSourceName = selectedSrc ? selectedSrc.name : 'All Knowledge Base';
      modalSourceId = exportStore.selectedSourceId !== 'all' ? exportStore.selectedSourceId : undefined;
      modalDocuments = docRes.documents;
      isExportModalOpen = true;
    } catch (err: any) {
      exportStore.knowledgeNotice = `⚠️ Could not prepare export: ${err.message}`;
      toastStore.error(`Could not prepare export: ${err.message}`);
    } finally {
      exportStore.isKnowledgeExporting = false;
    }
  }

  async function loadInitialData() {
    try {
      const [cards, srcList, allDocs] = await Promise.all([
        fetchCards().catch(() => []),
        fetchSources().catch(() => []),
        fetchDocuments().catch(() => ({ documents: [], total: 0 })),
      ]);

      totalCardsCount = cards.length;
      availableDecks = Array.from(new Set(cards.map((c) => c.targetDeck || 'Default'))).sort();
      sources = srcList;
      totalDocsCount = allDocs.total || allDocs.documents.length;
    } catch {
      // Ignore
    }
  }

  onMount(() => {
    checkAnki();
    loadInitialData();
  });
</script>

<div class="view-container">
  <div class="view-header">
    <div>
      <h1 class="view-title">🚀 Export & Anki Center</h1>
      <p class="view-subtitle">Export curated flashcards and knowledge base documents to Anki Desktop, printable PDFs, HTML, and Markdown notes.</p>
    </div>
    <div class="deck-filter-wrapper">
      <label for="export-deck-select">Filter Deck Scope:</label>
      <select id="export-deck-select" bind:value={exportStore.selectedDeck}>
        <option value="all">All Decks ({totalCardsCount} cards)</option>
        {#each availableDecks as deck}
          <option value={deck}>{deck}</option>
        {/each}
      </select>
    </div>
  </div>

  {#if pushMessage}
    <div class="toast-banner" class:error={pushMessage.startsWith('⚠️')}>
      {pushMessage}
    </div>
  {/if}

  <!-- Time & Scope Filter Accordion -->
  <div class="scope-accordion-card">
    <button
      type="button"
      class="scope-accordion-header"
      onclick={() => (isScopeFilterExpanded = !isScopeFilterExpanded)}
      aria-expanded={isScopeFilterExpanded}
    >
      <div class="scope-header-left">
        <span class="scope-icon">⏱️</span>
        <div>
          <div class="scope-title-row">
            <h3 class="scope-title">Time & Scope Filter</h3>
            <span class="scope-live-badge" class:zero-match={matchingCardsCount === 0}>
              {#if isLoadingCount}
                <span class="spinner-inline"></span> Counting...
              {:else if matchingCardsCount === 0}
                ⚠️ 0 matching cards
              {:else if exportLimit && exportLimit > 0 && exportLimit < matchingCardsCount}
                🎯 {exportLimit} of {matchingCardsCount} cards ready
              {:else}
                🎯 {matchingCardsCount} cards ready
              {/if}
            </span>
            {#if exportShuffle}
              <span class="scope-pill-badge shuffle">🔀 Shuffled</span>
            {/if}
          </div>
          <p class="scope-subtitle">
            Filter by creation date, cap card batch budget, or randomize study deck selection.
          </p>
        </div>
      </div>
      <div class="scope-header-right">
        <span class="scope-preset-indicator">
          {#if datePreset === 'all'}All Time
          {:else if datePreset === '24h'}Last 24 Hours
          {:else if datePreset === '7d'}Last 7 Days
          {:else if datePreset === '30d'}Last 30 Days
          {:else}Custom Range
          {/if}
        </span>
        <span class="scope-chevron" class:expanded={isScopeFilterExpanded}>▼</span>
      </div>
    </button>

    {#if isScopeFilterExpanded}
      <div class="scope-accordion-body">
        <!-- Preset Buttons Row -->
        <div class="scope-row">
          <span class="scope-field-label">Date Range Preset:</span>
          <div class="preset-pill-group">
            <button
              type="button"
              class="preset-pill"
              class:active={datePreset === 'all'}
              onclick={() => (datePreset = 'all')}
            >
              All Time
            </button>
            <button
              type="button"
              class="preset-pill"
              class:active={datePreset === '24h'}
              onclick={() => (datePreset = '24h')}
            >
              Last 24 Hours
            </button>
            <button
              type="button"
              class="preset-pill"
              class:active={datePreset === '7d'}
              onclick={() => (datePreset = '7d')}
            >
              Last 7 Days
            </button>
            <button
              type="button"
              class="preset-pill"
              class:active={datePreset === '30d'}
              onclick={() => (datePreset = '30d')}
            >
              Last 30 Days
            </button>
            <button
              type="button"
              class="preset-pill"
              class:active={datePreset === 'custom'}
              onclick={() => (datePreset = 'custom')}
            >
              Custom Range
            </button>
          </div>
        </div>

        <!-- Custom Date Range Inputs (when 'custom' preset selected) -->
        {#if datePreset === 'custom'}
          <div class="scope-custom-dates-row">
            <div class="date-input-group">
              <label for="scope-date-after">From (Created After):</label>
              <input
                id="scope-date-after"
                type="date"
                bind:value={customAfter}
                class="scope-input"
              />
            </div>
            <div class="date-input-group">
              <label for="scope-date-before">To (Created Before):</label>
              <input
                id="scope-date-before"
                type="date"
                bind:value={customBefore}
                class="scope-input"
              />
            </div>
          </div>
        {/if}

        <div class="scope-options-grid">
          <!-- Limit budget -->
          <div class="scope-option-block">
            <label for="scope-card-limit" class="scope-field-label">
              Maximum Card Budget (Limit):
            </label>
            <div class="input-with-hint">
              <input
                id="scope-card-limit"
                type="number"
                min="1"
                placeholder="e.g. 50 (blank for all cards)"
                bind:value={exportLimit}
                class="scope-input"
              />
              <span class="field-hint">
                {#if exportLimit && exportLimit > 0}
                  Will export up to {exportLimit} cards.
                {:else}
                  Exports all matching cards without limit.
                {/if}
              </span>
            </div>
          </div>

          <!-- Shuffle switch -->
          <div class="scope-option-block">
            <span class="scope-field-label">Randomize / Shuffle:</span>
            <label class="toggle-container" for="scope-shuffle-toggle">
              <input
                id="scope-shuffle-toggle"
                type="checkbox"
                bind:checked={exportShuffle}
              />
              <span class="toggle-switch"></span>
              <span class="toggle-label-text">
                <strong>Shuffle Cards</strong>
                <small>Uses SQLite <code>ORDER BY RANDOM()</code> for stochastic sample</small>
              </span>
            </label>
          </div>
        </div>

        <!-- Scope summary strip -->
        <div class="scope-summary-strip" class:warning={matchingCardsCount === 0}>
          <div class="scope-summary-text">
            {#if matchingCardsCount === 0}
              <span>⚠️ <strong>No cards match this scope.</strong> Try expanding your date range or selecting a different deck.</span>
            {:else}
              <span>
                🎯 <strong>Ready to export:</strong> {effectiveExportCount} {effectiveExportCount === 1 ? 'card' : 'cards'}
                {#if exportLimit && exportLimit > 0 && exportLimit < matchingCardsCount}
                  <span class="summary-dim">(budget capped from {matchingCardsCount} matches)</span>
                {/if}
                {#if exportShuffle}
                  <span class="summary-badge">🎲 Shuffled Order</span>
                {/if}
                {#if datePreset !== 'all'}
                  <span class="summary-badge">📅 {datePreset === 'custom' ? `${customAfter || 'start'} to ${customBefore || 'end'}` : datePreset}</span>
                {/if}
              </span>
            {/if}
          </div>
          {#if (datePreset !== 'all' || customAfter || customBefore || exportLimit || exportShuffle)}
            <button
              type="button"
              class="btn-reset-scope"
              onclick={() => {
                datePreset = 'all';
                customAfter = '';
                customBefore = '';
                exportLimit = null;
                exportShuffle = false;
              }}
            >
              Reset Filters
            </button>
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <!-- 1. Live AnkiConnect Card -->
  <div class="ankiconnect-card">
    <div class="anki-info">
      <div class="anki-badge-row">
        <span class="service-logo">⚡</span>
        <h3>AnkiConnect Live Sync</h3>
        <span class="status-pill" class:connected={isAnkiConnected}>
          {#if isCheckingAnki}
            Checking...
          {:else if isAnkiConnected}
            🟢 Connected (Port 8765)
          {:else}
            🔴 Offline / Not Running
          {/if}
        </span>
      </div>
      <p>Direct zero-click synchronization to your local running Anki Desktop client.</p>
    </div>

    <div class="anki-actions">
      <button
        type="button"
        class="btn btn-secondary"
        onclick={checkAnki}
        disabled={isCheckingAnki || isPushing}
      >
        🔄 Check Status
      </button>
      <button
        type="button"
        class="btn btn-primary"
        onclick={handlePush}
        disabled={!isAnkiConnected || isPushing || isKnowledgeExporting || activeDownloadFormat !== null || matchingCardsCount === 0}
      >
        {#if isPushing}
          <span class="spinner-inline"></span> Pushing to Anki...
        {:else}
          ⚡ Push to Anki Desktop
        {/if}
      </button>
    </div>
  </div>

  <!-- 2. Formats Grid -->
  <div class="formats-section">
    <h2 class="section-title">Standalone Package Downloads</h2>
    <div class="formats-grid">
      <!-- .apkg -->
      <div class="format-card">
        <div class="format-header">
          <span class="format-icon">📦</span>
          <span class="format-ext">.APKG</span>
        </div>
        <h3>Anki Native Package</h3>
        <p>Complete deck archive with tags, styling, and metadata ready for direct import into Anki / AnkiMobile.</p>
        <button
          type="button"
          class="btn btn-primary btn-full"
          disabled={activeDownloadFormat !== null || isPushing || isKnowledgeExporting || matchingCardsCount === 0}
          onclick={() => downloadFormat('apkg')}
        >
          {#if activeDownloadFormat === 'apkg'}
            <span class="spinner-inline"></span> Exporting...
          {:else}
            ⬇️ Download .apkg
          {/if}
        </button>
      </div>

      <!-- EPUB Study Guide eBook -->
      <div class="format-card">
        <div class="format-header">
          <span class="format-icon">📖</span>
          <span class="format-ext">.EPUB</span>
        </div>
        <h3>EPUB Study Guide eBook</h3>
        <p>Interactive EPUB 3.0 eBook with collapsible &lt;details&gt; questions and verified citations for e-readers (Kindle, Kobo, Apple Books).</p>
        <button
          type="button"
          class="btn btn-secondary btn-full"
          disabled={activeDownloadFormat !== null || isPushing || isKnowledgeExporting || matchingCardsCount === 0}
          onclick={() => downloadFormat('epub')}
        >
          {#if activeDownloadFormat === 'epub'}
            <span class="spinner-inline"></span> Exporting...
          {:else}
            ⬇️ Download EPUB
          {/if}
        </button>
      </div>

      <!-- Markdown -->
      <div class="format-card">
        <div class="format-header">
          <span class="format-icon">📝</span>
          <span class="format-ext">.MD</span>
        </div>
        <h3>Active Recall Markdown</h3>
        <p>Collapsible HTML &lt;details&gt; questions and answers optimized for Obsidian, Notion, and Logseq.</p>
        <button
          type="button"
          class="btn btn-secondary btn-full"
          disabled={activeDownloadFormat !== null || isPushing || isKnowledgeExporting || matchingCardsCount === 0}
          onclick={() => downloadFormat('markdown')}
        >
          {#if activeDownloadFormat === 'markdown'}
            <span class="spinner-inline"></span> Exporting...
          {:else}
            ⬇️ Download Markdown
          {/if}
        </button>
      </div>

      <!-- PDF -->
      <div class="format-card">
        <div class="format-header">
          <span class="format-icon">📑</span>
          <span class="format-ext">.PDF</span>
        </div>
        <h3>Printable PDF Study Guide</h3>
        <p>Two-column foldable study sheet with folding guide lines and verified source quotes for offline study.</p>
        <button
          type="button"
          class="btn btn-secondary btn-full"
          disabled={activeDownloadFormat !== null || isPushing || isKnowledgeExporting || matchingCardsCount === 0}
          onclick={() => downloadFormat('pdf')}
        >
          {#if activeDownloadFormat === 'pdf'}
            <span class="spinner-inline"></span> Exporting...
          {:else}
            ⬇️ Download PDF
          {/if}
        </button>
      </div>

      <!-- CSV -->
      <div class="format-card">
        <div class="format-header">
          <span class="format-icon">📊</span>
          <span class="format-ext">.CSV</span>
        </div>
        <h3>CSV Spreadsheet</h3>
        <p>Standard comma-separated value spreadsheet format for Excel, Google Sheets, or custom scripts.</p>
        <button
          type="button"
          class="btn btn-secondary btn-full"
          disabled={activeDownloadFormat !== null || isPushing || isKnowledgeExporting || matchingCardsCount === 0}
          onclick={() => downloadFormat('csv')}
        >
          {#if activeDownloadFormat === 'csv'}
            <span class="spinner-inline"></span> Exporting...
          {:else}
            ⬇️ Download CSV
          {/if}
        </button>
      </div>

      <!-- TSV -->
      <div class="format-card">
        <div class="format-header">
          <span class="format-icon">📄</span>
          <span class="format-ext">.TSV</span>
        </div>
        <h3>Tab-Separated Values</h3>
        <p>Tab-delimited text format for manual import into Quizlet, Brainscape, and Anki desktop wizard.</p>
        <button
          type="button"
          class="btn btn-secondary btn-full"
          disabled={activeDownloadFormat !== null || isPushing || isKnowledgeExporting || matchingCardsCount === 0}
          onclick={() => downloadFormat('tsv')}
        >
          {#if activeDownloadFormat === 'tsv'}
            <span class="spinner-inline"></span> Exporting...
          {:else}
            ⬇️ Download TSV
          {/if}
        </button>
      </div>
    </div>
  </div>

  <!-- 3. Knowledge Base Documents Exporter -->
  <div class="formats-section">
    <div class="section-header-row">
      <div>
        <h2 class="section-title">📚 Source Knowledge Base Exporter</h2>
        <p class="section-desc">Export ingested articles, documentation, and raw knowledge base documents into consolidated or split files.</p>
      </div>
      <div class="source-filter-wrapper">
        <label for="kb-source-select">Filter Source Scope:</label>
        <select id="kb-source-select" bind:value={exportStore.selectedSourceId}>
          <option value="all">All Sources ({totalDocsCount} docs)</option>
          {#each sources as src}
            <option value={src.id}>{src.name} ({src.type.toUpperCase()})</option>
          {/each}
        </select>
      </div>
    </div>

    {#if knowledgeNotice}
      <div class="toast-banner" class:error={knowledgeNotice.startsWith('⚠️')}>
        {knowledgeNotice}
      </div>
    {/if}

    <div class="formats-grid">
      <!-- Merged Markdown -->
      <div class="format-card">
        <div class="format-header">
          <span class="format-icon">📝</span>
          <span class="format-ext">.MD</span>
        </div>
        <h3>Consolidated Markdown</h3>
        <p>Merged Markdown document containing all ingested articles, table of contents, and origin citation footnotes.</p>
        <button
          type="button"
          class="btn btn-primary btn-full"
          disabled={isKnowledgeExporting || isPushing || activeDownloadFormat !== null}
          onclick={() => downloadKnowledgeBase('markdown', 'merged')}
        >
          {#if activeKbFormat === 'markdown-merged'}
            <span class="spinner-inline"></span> Exporting...
          {:else}
            ⬇️ Download Merged .md
          {/if}
        </button>
      </div>

      <!-- Standalone HTML -->
      <div class="format-card">
        <div class="format-header">
          <span class="format-icon">🌐</span>
          <span class="format-ext">.HTML</span>
        </div>
        <h3>Standalone HTML Guide</h3>
        <p>Clean, beautifully formatted HTML study document with interactive anchor navigation and dark-mode styling.</p>
        <button
          type="button"
          class="btn btn-secondary btn-full"
          disabled={isKnowledgeExporting || isPushing || activeDownloadFormat !== null}
          onclick={() => downloadKnowledgeBase('html', 'merged')}
        >
          {#if activeKbFormat === 'html-merged'}
            <span class="spinner-inline"></span> Exporting...
          {:else}
            ⬇️ Download .html
          {/if}
        </button>
      </div>

      <!-- Plain Text -->
      <div class="format-card">
        <div class="format-header">
          <span class="format-icon">📄</span>
          <span class="format-ext">.TXT</span>
        </div>
        <h3>Plain Text Corpus</h3>
        <p>Clean raw text format stripped of markup for offline local indexing, scripts, or LLM fine-tuning datasets.</p>
        <button
          type="button"
          class="btn btn-secondary btn-full"
          disabled={isKnowledgeExporting || isPushing || activeDownloadFormat !== null}
          onclick={() => downloadKnowledgeBase('txt', 'merged')}
        >
          {#if activeKbFormat === 'txt-merged'}
            <span class="spinner-inline"></span> Exporting...
          {:else}
            ⬇️ Download .txt
          {/if}
        </button>
      </div>

      <!-- JSON Corpus -->
      <div class="format-card">
        <div class="format-header">
          <span class="format-icon">🗄️</span>
          <span class="format-ext">.JSON</span>
        </div>
        <h3>Structured JSON Corpus</h3>
        <p>Complete JSON document objects with titles, URLs, word counts, content hashes, and extracted text.</p>
        <button
          type="button"
          class="btn btn-secondary btn-full"
          disabled={isKnowledgeExporting || isPushing || activeDownloadFormat !== null}
          onclick={() => downloadKnowledgeBase('json', 'merged')}
        >
          {#if activeKbFormat === 'json-merged'}
            <span class="spinner-inline"></span> Exporting...
          {:else}
            ⬇️ Download .json
          {/if}
        </button>
      </div>

      <!-- Split ZIP Archive -->
      <div class="format-card">
        <div class="format-header">
          <span class="format-icon">📦</span>
          <span class="format-ext">.ZIP</span>
        </div>
        <h3>Split Multi-file ZIP</h3>
        <p>Archive containing each article or web page as a distinct file, named by title or URL slug.</p>
        <button
          type="button"
          class="btn btn-secondary btn-full"
          disabled={isKnowledgeExporting || isPushing || activeDownloadFormat !== null}
          onclick={() => downloadKnowledgeBase('markdown', 'split')}
        >
          {#if activeKbFormat === 'markdown-split'}
            <span class="spinner-inline"></span> Exporting...
          {:else}
            ⬇️ Download Split .zip
          {/if}
        </button>
      </div>

      <!-- Advanced / Custom Modal -->
      <div class="format-card advanced-card">
        <div class="format-header">
          <span class="format-icon">⚙️</span>
          <span class="format-ext">CUSTOM</span>
        </div>
        <h3>Advanced Export Options</h3>
        <p>Configure fine-grained options: table of contents, citation links, merged vs. split zip archive, and custom formats.</p>
        <button
          type="button"
          class="btn btn-primary btn-full"
          disabled={isKnowledgeExporting || isPushing || activeDownloadFormat !== null}
          onclick={openAdvancedExportModal}
        >
          ⚙️ Open Advanced Exporter
        </button>
      </div>
    </div>
  </div>
</div>

<!-- Document Export Modal -->
<DocumentExportModal
  isOpen={isExportModalOpen}
  documents={modalDocuments}
  sourceName={modalSourceName}
  sourceId={modalSourceId}
  onClose={() => (isExportModalOpen = false)}
  onExportSuccess={(filename) => {
    knowledgeNotice = `✅ Downloaded ${filename}!`;
    setTimeout(() => (knowledgeNotice = null), 5000);
  }}
/>

<style>
  .view-container {
    padding: 32px;
    display: flex;
    flex-direction: column;
    gap: 24px;
    max-width: 1200px;
    margin: 0 auto;
    width: 100%;
  }

  .view-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
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

  .deck-filter-wrapper {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .deck-filter-wrapper label {
    font-size: 13px;
    color: #cbd5e1;
    font-weight: 500;
  }

  select {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 8px 14px;
    color: #f8fafc;
    font-size: 13px;
    outline: none;
    cursor: pointer;
  }

  select:focus {
    border-color: #6366f1;
  }

  .ankiconnect-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 14px;
    padding: 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 20px;
  }

  .anki-badge-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 6px;
  }

  .service-logo {
    font-size: 22px;
  }

  .anki-badge-row h3 {
    margin: 0;
    font-size: 18px;
    color: #f8fafc;
  }

  .status-pill {
    font-size: 11px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 9999px;
    background: rgba(239, 68, 68, 0.15);
    color: #fca5a5;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  .status-pill.connected {
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
    border-color: rgba(16, 185, 129, 0.3);
  }

  .anki-info p {
    margin: 0;
    font-size: 13px;
    color: #94a3b8;
  }

  .anki-actions {
    display: flex;
    gap: 10px;
  }

  .section-title {
    font-size: 18px;
    font-weight: 600;
    color: #f1f5f9;
    margin: 0;
  }

  .section-header-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 16px;
    margin-bottom: 16px;
  }

  .section-desc {
    font-size: 13px;
    color: #94a3b8;
    margin: 4px 0 0 0;
  }

  .source-filter-wrapper {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .source-filter-wrapper label {
    font-size: 13px;
    color: #cbd5e1;
    font-weight: 500;
  }

  .advanced-card {
    border: 1px dashed #6366f1;
    background: linear-gradient(135deg, #1e293b 0%, #1e1b4b 100%);
  }

  .advanced-card:hover {
    border-color: #818cf8;
  }

  .formats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 18px;
  }

  .format-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 22px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    transition: transform 0.15s, border-color 0.15s;
  }

  .format-card:hover {
    transform: translateY(-2px);
    border-color: #475569;
  }

  .format-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .format-icon {
    font-size: 28px;
  }

  .format-ext {
    font-size: 11px;
    font-weight: 700;
    color: #818cf8;
    background: rgba(99, 102, 241, 0.15);
    padding: 2px 8px;
    border-radius: 4px;
  }

  .format-card h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #f8fafc;
  }

  .format-card p {
    margin: 0;
    font-size: 12px;
    color: #94a3b8;
    line-height: 1.4;
    flex: 1;
  }

  .btn {
    padding: 10px 18px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.15s;
  }

  .btn-full {
    width: 100%;
    margin-top: 8px;
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

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .toast-banner {
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid rgba(16, 185, 129, 0.3);
    color: #34d399;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 13px;
  }

  .toast-banner.error {
    background: rgba(239, 68, 68, 0.15);
    border-color: rgba(239, 68, 68, 0.3);
    color: #fca5a5;
  }

  .spinner-inline {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: #ffffff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Time & Scope Filter Accordion Styles */
  .scope-accordion-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 14px;
    overflow: hidden;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .scope-accordion-card:focus-within {
    border-color: #6366f1;
  }

  .scope-accordion-header {
    width: 100%;
    padding: 18px 24px;
    background: transparent;
    border: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    text-align: left;
    color: inherit;
    transition: background 0.15s ease;
  }

  .scope-accordion-header:hover {
    background: rgba(255, 255, 255, 0.02);
  }

  .scope-header-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .scope-icon {
    font-size: 24px;
  }

  .scope-title-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
  }

  .scope-title {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
    color: #f8fafc;
    letter-spacing: -0.01em;
  }

  .scope-subtitle {
    margin: 4px 0 0 0;
    font-size: 13px;
    color: #94a3b8;
  }

  .scope-live-badge {
    font-size: 12px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 9999px;
    background: rgba(99, 102, 241, 0.15);
    color: #818cf8;
    border: 1px solid rgba(99, 102, 241, 0.3);
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .scope-live-badge.zero-match {
    background: rgba(239, 68, 68, 0.15);
    color: #fca5a5;
    border-color: rgba(239, 68, 68, 0.3);
  }

  .scope-pill-badge {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 9999px;
  }

  .scope-pill-badge.shuffle {
    background: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
    border: 1px solid rgba(245, 158, 11, 0.3);
  }

  .scope-header-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .scope-preset-indicator {
    font-size: 12px;
    font-weight: 600;
    color: #94a3b8;
    background: #0f172a;
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid #334155;
  }

  .scope-chevron {
    font-size: 11px;
    color: #64748b;
    transition: transform 0.2s ease;
  }

  .scope-chevron.expanded {
    transform: rotate(180deg);
  }

  .scope-accordion-body {
    padding: 0 24px 22px 24px;
    display: flex;
    flex-direction: column;
    gap: 18px;
    border-top: 1px solid #293548;
    padding-top: 20px;
  }

  .scope-row {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .scope-field-label {
    font-size: 13px;
    font-weight: 600;
    color: #cbd5e1;
  }

  .preset-pill-group {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .preset-pill {
    padding: 7px 14px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    background: #0f172a;
    color: #94a3b8;
    border: 1px solid #334155;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .preset-pill:hover {
    color: #f8fafc;
    border-color: #475569;
  }

  .preset-pill.active {
    background: #6366f1;
    color: #ffffff;
    border-color: #6366f1;
    box-shadow: 0 0 12px rgba(99, 102, 241, 0.35);
  }

  .scope-custom-dates-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid #334155;
    border-radius: 10px;
    padding: 14px;
  }

  .date-input-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .date-input-group label {
    font-size: 12px;
    color: #94a3b8;
    font-weight: 500;
  }

  .scope-options-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 18px;
    align-items: start;
  }

  .scope-option-block {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .input-with-hint {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .scope-input {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 9px 12px;
    color: #f8fafc;
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s ease;
  }

  .scope-input:focus {
    border-color: #6366f1;
  }

  .field-hint {
    font-size: 11px;
    color: #64748b;
  }

  /* Custom Toggle Container */
  .toggle-container {
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
    user-select: none;
    padding: 8px 12px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    transition: border-color 0.15s ease;
  }

  .toggle-container:hover {
    border-color: #475569;
  }

  .toggle-container input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .toggle-switch {
    width: 38px;
    height: 22px;
    background: #334155;
    border-radius: 9999px;
    position: relative;
    transition: background 0.2s ease;
    flex-shrink: 0;
  }

  .toggle-switch::after {
    content: '';
    position: absolute;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #ffffff;
    top: 3px;
    left: 3px;
    transition: transform 0.2s ease;
  }

  .toggle-container input:checked + .toggle-switch {
    background: #6366f1;
  }

  .toggle-container input:checked + .toggle-switch::after {
    transform: translateX(16px);
  }

  .toggle-label-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .toggle-label-text strong {
    font-size: 13px;
    color: #f8fafc;
  }

  .toggle-label-text small {
    font-size: 11px;
    color: #94a3b8;
  }

  /* Scope Summary Strip */
  .scope-summary-strip {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    padding: 12px 16px;
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid #334155;
    border-radius: 8px;
  }

  .scope-summary-strip.warning {
    border-color: rgba(239, 68, 68, 0.4);
    background: rgba(239, 68, 68, 0.08);
  }

  .scope-summary-text {
    font-size: 13px;
    color: #cbd5e1;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .summary-dim {
    color: #94a3b8;
    font-size: 12px;
  }

  .summary-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 6px;
    background: #1e293b;
    border: 1px solid #334155;
    font-size: 11px;
    color: #e2e8f0;
  }

  .btn-reset-scope {
    background: transparent;
    border: 1px solid #475569;
    color: #94a3b8;
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-reset-scope:hover {
    background: #334155;
    color: #f8fafc;
  }
</style>