<script lang="ts">
  import { onMount } from 'svelte';
  import { checkAnkiStatus, pushToAnki, fetchCards } from '../lib/api';

  let isAnkiConnected = $state(false);
  let isCheckingAnki = $state(true);
  let isPushing = $state(false);
  let pushMessage = $state<string | null>(null);

  let selectedDeck = $state('all');
  let availableDecks = $state<string[]>([]);
  let totalCardsCount = $state(0);

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
    isPushing = true;
    pushMessage = null;
    try {
      const res = await pushToAnki(selectedDeck !== 'all' ? selectedDeck : undefined);
      pushMessage = `✅ ${res.message || `Successfully pushed ${res.cardsPushed} cards to Anki Desktop!`}`;
    } catch (err: any) {
      pushMessage = '⚠️ Push failed: ' + err.message;
    } finally {
      isPushing = false;
    }
  }

  function downloadFormat(format: 'apkg' | 'markdown' | 'pdf' | 'csv' | 'tsv') {
    const query = new URLSearchParams();
    if (selectedDeck !== 'all') {
      query.set('deck', selectedDeck);
    }
    const url = `/api/export/${format}?${query.toString()}`;
    window.location.href = url;
  }

  async function loadInitialData() {
    try {
      const cards = await fetchCards();
      totalCardsCount = cards.length;
      availableDecks = Array.from(new Set(cards.map((c) => c.targetDeck || 'Default'))).sort();
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
      <h1 class="view-title">🚀 Export Center</h1>
      <p class="view-subtitle">Export curated flashcards to Anki Desktop, printable PDFs, and Markdown notes.</p>
    </div>
    <div class="deck-filter-wrapper">
      <label for="export-deck-select">Filter Deck Scope:</label>
      <select id="export-deck-select" bind:value={selectedDeck}>
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
        disabled={isCheckingAnki}
      >
        🔄 Check Status
      </button>
      <button
        type="button"
        class="btn btn-primary"
        onclick={handlePush}
        disabled={!isAnkiConnected || isPushing}
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
        <button type="button" class="btn btn-primary btn-full" onclick={() => downloadFormat('apkg')}>
          ⬇️ Download .apkg
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
        <button type="button" class="btn btn-secondary btn-full" onclick={() => downloadFormat('markdown')}>
          ⬇️ Download Markdown
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
        <button type="button" class="btn btn-secondary btn-full" onclick={() => downloadFormat('pdf')}>
          ⬇️ Download PDF
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
        <button type="button" class="btn btn-secondary btn-full" onclick={() => downloadFormat('csv')}>
          ⬇️ Download CSV
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
        <button type="button" class="btn btn-secondary btn-full" onclick={() => downloadFormat('tsv')}>
          ⬇️ Download TSV
        </button>
      </div>
    </div>
  </div>
</div>

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
    margin: 0 0 16px 0;
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