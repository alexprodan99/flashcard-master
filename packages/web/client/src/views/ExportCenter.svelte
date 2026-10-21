<script lang="ts">
  import { onMount } from 'svelte';
  import { checkAnkiStatus, pushToAnki, fetchCards, fetchSources, fetchDocuments, exportDocuments } from '../lib/api';
  import type { DataSource, DiscoveredDocument } from '../lib/types';
  import DocumentExportModal from '../components/DocumentExportModal.svelte';
  import { exportStore, toastStore } from '../stores/index.js';

  let isAnkiConnected = $state(false);
  let isCheckingAnki = $state(true);

  // Flashcards state
  let availableDecks = $state<string[]>([]);
  let totalCardsCount = $state(0);

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
    exportStore.isPushing = true;
    exportStore.pushMessage = null;
    try {
      const res = await pushToAnki(exportStore.selectedDeck !== 'all' ? exportStore.selectedDeck : undefined);
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
    activeDownloadFormat = format;
    toastStore.info(`Preparing ${format.toUpperCase()} export download...`);
    const query = new URLSearchParams();
    if (exportStore.selectedDeck !== 'all') {
      query.set('deck', exportStore.selectedDeck);
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
        disabled={!isAnkiConnected || isPushing || isKnowledgeExporting || activeDownloadFormat !== null}
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
          disabled={activeDownloadFormat !== null || isPushing || isKnowledgeExporting}
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
          disabled={activeDownloadFormat !== null || isPushing || isKnowledgeExporting}
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
          disabled={activeDownloadFormat !== null || isPushing || isKnowledgeExporting}
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
          disabled={activeDownloadFormat !== null || isPushing || isKnowledgeExporting}
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
          disabled={activeDownloadFormat !== null || isPushing || isKnowledgeExporting}
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
          disabled={activeDownloadFormat !== null || isPushing || isKnowledgeExporting}
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
</style>