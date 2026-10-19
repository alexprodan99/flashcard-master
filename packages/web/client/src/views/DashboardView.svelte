<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchStats } from '../lib/api';
  import type { DashboardStats } from '../lib/types';

  interface Props {
    onNavigate: (tab: string) => void;
  }

  let { onNavigate }: Props = $props();

  import { loadCachedStats, saveCachedStats } from '../lib/dashboard-cache.js';

  const cached = loadCachedStats();
  let stats = $state<DashboardStats | null>(cached);
  let loading = $state(!cached);
  let isRefreshing = $state(false);
  let error = $state<string | null>(null);

  async function loadData() {
    if (!stats) {
      loading = true;
    } else {
      isRefreshing = true;
    }
    error = null;
    try {
      const freshStats = await fetchStats();
      stats = freshStats;
      saveCachedStats(freshStats);
    } catch (err: any) {
      if (!stats) {
        error = err.message || 'Failed to load dashboard metrics';
      } else {
        console.warn('Background dashboard refresh failed:', err);
      }
    } finally {
      loading = false;
      isRefreshing = false;
    }
  }

  onMount(() => {
    loadData();
  });
</script>

<div class="view-container">
  <div class="view-header">
    <div>
      <h1 class="view-title">Dashboard Overview</h1>
      <p class="view-subtitle">Monitor knowledge ingestion, generation metrics, and active decks.</p>
    </div>
    <button class="btn btn-secondary" onclick={loadData} disabled={isRefreshing || loading}>
      🔄 {isRefreshing ? 'Refreshing...' : 'Refresh'}
    </button>
  </div>

  {#if loading && !stats}
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Loading telemetry and stats...</p>
    </div>
  {:else if error}
    <div class="error-banner">
      <span>⚠️ {error}</span>
      <button onclick={loadData} class="btn btn-sm">Retry</button>
    </div>
  {:else if stats}
    <div class="kpi-grid">
      <div class="kpi-card accent-primary">
        <div class="kpi-icon">🗂️</div>
        <div class="kpi-content">
          <div class="kpi-value">{stats.totalCards}</div>
          <div class="kpi-label">Total Flashcards</div>
        </div>
      </div>

      <div class="kpi-card accent-success">
        <div class="kpi-icon">🌐</div>
        <div class="kpi-content">
          <div class="kpi-value">{stats.activeSources} / {stats.totalSources}</div>
          <div class="kpi-label">Active Sources</div>
        </div>
      </div>

      <div class="kpi-card accent-warning">
        <div class="kpi-icon">📦</div>
        <div class="kpi-content">
          <div class="kpi-value">{stats.totalDecks}</div>
          <div class="kpi-label">Target Decks</div>
        </div>
      </div>

      <div class="kpi-card accent-info">
        <div class="kpi-icon">🛡️</div>
        <div class="kpi-content">
          <div class="kpi-value">100%</div>
          <div class="kpi-label">Quote Grounded</div>
        </div>
      </div>
    </div>

    <div class="quick-actions-section">
      <h2 class="section-title">4-Step Learning Pipeline</h2>
      <div class="action-grid">
        <button type="button" class="action-card" onclick={() => onNavigate('sources')}>
          <div class="action-icon">🌐</div>
          <div class="action-info">
            <h3>1. Ingest Sources</h3>
            <p>Connect RSS feeds, sitemaps, web articles, and local Markdown repositories.</p>
          </div>
          <span class="action-arrow">→</span>
        </button>

        <button type="button" class="action-card highlight" onclick={() => onNavigate('generate')}>
          <div class="action-icon">⚡</div>
          <div class="action-info">
            <h3>2. Generate Studio</h3>
            <p>Synthesize grounded flashcards with local Ollama or Cloud LLMs.</p>
          </div>
          <span class="action-arrow">→</span>
        </button>

        <button type="button" class="action-card" onclick={() => onNavigate('cards')}>
          <div class="action-icon">🗂️</div>
          <div class="action-info">
            <h3>3. Question Explorer</h3>
            <p>Search, curate, and review cards with verbatim grounding quotes.</p>
          </div>
          <span class="action-arrow">→</span>
        </button>

        <button type="button" class="action-card" onclick={() => onNavigate('export')}>
          <div class="action-icon">🚀</div>
          <div class="action-info">
            <h3>4. Export & Anki</h3>
            <p>1-click export to native Anki .apkg, live AnkiConnect, and Markdown.</p>
          </div>
          <span class="action-arrow">→</span>
        </button>
      </div>
    </div>

    {#if stats.recentSources && stats.recentSources.length > 0}
      <div class="recent-sources-section">
        <h2 class="section-title">Connected Data Sources</h2>
        <div class="sources-list">
          {#each stats.recentSources as s}
            <div class="source-row">
              <div class="source-main">
                <span class="type-badge {s.type}">{s.type}</span>
                <span class="source-name">{s.name}</span>
              </div>
              <div class="source-meta">
                <span class="status-pill" class:active={s.isActive}>
                  {s.isActive ? 'Active' : 'Paused'}
                </span>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .view-container {
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

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;
  }

  .kpi-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 20px;
    display: flex;
    align-items: center;
    gap: 16px;
    transition: transform 0.15s ease, border-color 0.15s ease;
  }

  .kpi-card:hover {
    transform: translateY(-2px);
    border-color: #475569;
  }

  .kpi-icon {
    font-size: 28px;
    background: rgba(255, 255, 255, 0.05);
    padding: 10px;
    border-radius: 10px;
  }

  .kpi-value {
    font-size: 24px;
    font-weight: 700;
    color: #f8fafc;
    line-height: 1.2;
  }

  .kpi-label {
    font-size: 12px;
    color: #94a3b8;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-top: 4px;
  }

  .section-title {
    font-size: 18px;
    font-weight: 600;
    color: #f1f5f9;
    margin: 0 0 16px 0;
  }

  .action-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 16px;
  }

  .action-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 20px;
    display: flex;
    align-items: center;
    gap: 16px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .action-card:hover {
    background: #243248;
    border-color: #6366f1;
    transform: translateY(-2px);
  }

  .action-card.highlight {
    background: rgba(99, 102, 241, 0.08);
    border-color: rgba(99, 102, 241, 0.3);
  }

  .action-card.highlight:hover {
    background: rgba(99, 102, 241, 0.15);
    border-color: #6366f1;
  }

  .action-icon {
    font-size: 24px;
  }

  .action-info {
    flex: 1;
  }

  .action-info h3 {
    font-size: 15px;
    font-weight: 600;
    color: #f8fafc;
    margin: 0 0 4px 0;
  }

  .action-info p {
    font-size: 12px;
    color: #94a3b8;
    margin: 0;
    line-height: 1.4;
  }

  .action-arrow {
    font-size: 18px;
    color: #64748b;
    transition: transform 0.15s ease;
  }

  .action-card:hover .action-arrow {
    transform: translateX(4px);
    color: #818cf8;
  }

  .recent-sources-section {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 24px;
  }

  .sources-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .source-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: rgba(15, 23, 42, 0.6);
    border-radius: 8px;
    border: 1px solid #334155;
  }

  .source-main {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .source-name {
    font-size: 14px;
    font-weight: 500;
    color: #f8fafc;
  }

  .type-badge {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 3px 8px;
    border-radius: 4px;
  }

  .type-badge.rss {
    background: rgba(249, 115, 22, 0.15);
    color: #fb923c;
    border: 1px solid rgba(249, 115, 22, 0.3);
  }

  .type-badge.web {
    background: rgba(59, 130, 246, 0.15);
    color: #60a5fa;
    border: 1px solid rgba(59, 130, 246, 0.3);
  }

  .type-badge.local {
    background: rgba(168, 85, 247, 0.15);
    color: #c084fc;
    border: 1px solid rgba(168, 85, 247, 0.3);
  }

  .type-badge.sitemap {
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.3);
  }

  .type-badge.llms-txt {
    background: rgba(236, 72, 153, 0.15);
    color: #f472b6;
    border: 1px solid rgba(236, 72, 153, 0.3);
  }

  .type-badge.notion {
    background: rgba(14, 165, 233, 0.15);
    color: #38bdf8;
    border: 1px solid rgba(14, 165, 233, 0.3);
  }

  .source-meta {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .deck-tag {
    font-size: 12px;
    color: #94a3b8;
    background: rgba(255, 255, 255, 0.05);
    padding: 2px 8px;
    border-radius: 4px;
  }

  .status-pill {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 9999px;
    background: #334155;
    color: #94a3b8;
  }

  .status-pill.active {
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.3);
  }

  .btn {
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.15s ease;
  }

  .btn-secondary {
    background: #334155;
    color: #f1f5f9;
  }

  .btn-secondary:hover {
    background: #475569;
  }

  .btn-sm {
    padding: 4px 10px;
    font-size: 12px;
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 0;
    color: #94a3b8;
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #334155;
    border-top-color: #6366f1;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-bottom: 12px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error-banner {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;
    padding: 12px 16px;
    border-radius: 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
</style>