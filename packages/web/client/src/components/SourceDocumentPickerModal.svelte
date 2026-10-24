<script lang="ts">
  import type { DataSource, DiscoveredDocument } from '../lib/types.js';
  import { formatPageBadge } from '../lib/formatters.js';

  interface Props {
    isOpen: boolean;
    source: DataSource | null;
    documents: DiscoveredDocument[];
    selectedDocIds: Record<string, boolean>;
    initialSearchQuery?: string;
    onApply: (selectedDocIds: string[]) => void;
    onClose: () => void;
    onPreviewDoc?: (doc: DiscoveredDocument) => void;
  }

  let {
    isOpen,
    source,
    documents = [],
    selectedDocIds = {},
    initialSearchQuery = '',
    onApply,
    onClose,
    onPreviewDoc,
  }: Props = $props();

  let searchQuery = $state('');
  let filterMode = $state<'all' | 'selected' | 'unselected'>('all');
  let localSelectedIds = $state<Record<string, boolean>>({});
  let lastCheckedDocId = $state<string | null>(null);

  // Synchronize local selections when modal is opened or source changes
  $effect(() => {
    if (isOpen) {
      const map: Record<string, boolean> = {};
      documents.forEach((doc) => {
        map[doc.id] = !!selectedDocIds[doc.id];
      });
      localSelectedIds = map;
      searchQuery = initialSearchQuery || '';
      filterMode = 'all';
      lastCheckedDocId = null;
    }
  });

  function normalizeSearchText(str: string | null | undefined): string {
    if (!str) return '';
    return str
      .normalize('NFKD')
      .replace(/[\u00a0\s]+/g, ' ')
      .trim()
      .toLowerCase();
  }

  const SEARCH_STOP_WORDS = new Set(['article', 'articles', 'the', 'a', 'an', 'post', 'posts', 'doc', 'docs']);

  function matchesDocQuery(doc: DiscoveredDocument, rawQuery: string): boolean {
    const q = normalizeSearchText(rawQuery);
    if (!q) return true;
    const allTokens = q.split(' ').filter(Boolean);
    const nonStop = allTokens.filter((t) => !SEARCH_STOP_WORDS.has(t));
    const tokens = nonStop.length > 0 ? nonStop : allTokens;

    const titleNorm = normalizeSearchText(doc.title);
    const urlNorm = normalizeSearchText(doc.url);
    const textNorm = doc.textContent ? normalizeSearchText(doc.textContent.slice(0, 4000)) : '';

    return tokens.every((token) => {
      if (titleNorm.includes(token) || urlNorm.includes(token) || textNorm.includes(token)) {
        return true;
      }
      if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) {
        const singular = token.slice(0, -1);
        if (titleNorm.includes(singular) || urlNorm.includes(singular) || textNorm.includes(singular)) {
          return true;
        }
      } else if (token.length > 3 && !token.endsWith('s')) {
        const plural = token + 's';
        if (titleNorm.includes(plural) || urlNorm.includes(plural) || textNorm.includes(plural)) {
          return true;
        }
      }
      return false;
    });
  }

  // Derived filtered document list
  let filteredDocs = $derived.by(() => {
    let list = documents;
    const q = searchQuery.trim();
    if (q) {
      list = list.filter((doc) => matchesDocQuery(doc, q));
    }

    if (filterMode === 'selected') {
      list = list.filter((doc) => !!localSelectedIds[doc.id]);
    } else if (filterMode === 'unselected') {
      list = list.filter((doc) => !localSelectedIds[doc.id]);
    }

    return list;
  });

  let totalCount = $derived(documents.length);

  let selectedCount = $derived(
    documents.filter((doc) => !!localSelectedIds[doc.id]).length
  );

  let selectedWords = $derived(
    documents
      .filter((doc) => !!localSelectedIds[doc.id])
      .reduce((sum, doc) => sum + (doc.wordCount || 0), 0)
  );

  let allFilteredSelected = $derived(
    filteredDocs.length > 0 && filteredDocs.every((doc) => !!localSelectedIds[doc.id])
  );

  function toggleDocSelection(doc: DiscoveredDocument, e?: MouseEvent) {
    const targetState = !localSelectedIds[doc.id];

    if (e?.shiftKey && lastCheckedDocId && lastCheckedDocId !== doc.id) {
      const lastIdx = filteredDocs.findIndex((d) => d.id === lastCheckedDocId);
      const currIdx = filteredDocs.findIndex((d) => d.id === doc.id);
      if (lastIdx !== -1 && currIdx !== -1) {
        const start = Math.min(lastIdx, currIdx);
        const end = Math.max(lastIdx, currIdx);
        for (let i = start; i <= end; i++) {
          localSelectedIds[filteredDocs[i].id] = targetState;
        }
      } else {
        localSelectedIds[doc.id] = targetState;
      }
    } else {
      localSelectedIds[doc.id] = targetState;
    }

    lastCheckedDocId = doc.id;
  }

  function selectAllVisible() {
    filteredDocs.forEach((doc) => {
      localSelectedIds[doc.id] = true;
    });
  }

  function deselectAllVisible() {
    filteredDocs.forEach((doc) => {
      localSelectedIds[doc.id] = false;
    });
  }

  function selectAllInSource() {
    documents.forEach((doc) => {
      localSelectedIds[doc.id] = true;
    });
  }

  function clearAllInSource() {
    documents.forEach((doc) => {
      localSelectedIds[doc.id] = false;
    });
  }

  function handleApply() {
    const activeIds = Object.keys(localSelectedIds).filter((id) => localSelectedIds[id]);
    onApply(activeIds);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (typeof document !== 'undefined' && document.querySelector('.preview-backdrop')) {
        return;
      }
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if isOpen && source}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="doc-picker-backdrop"
    onclick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}
    role="presentation"
  >
    <div
      class="doc-picker-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="picker-modal-title"
    >
      <!-- Modal Header -->
      <div class="picker-header">
        <div class="header-left">
          <span class="type-badge {source.type}">{source.type}</span>
          <div class="header-text">
            <h2 id="picker-modal-title" class="picker-title">
              Select Documents: <span class="source-name">{source.name}</span>
            </h2>
            <p class="picker-subtitle">
              Choose which chapters, pages, or sections to include for flashcard synthesis.
            </p>
          </div>
        </div>
        <div class="header-actions">
          <span class="header-doc-counter">
            {totalCount} total document{totalCount === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            class="btn-close-modal"
            onclick={onClose}
            aria-label="Close document picker"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Toolbar: Search, Filter Tabs & Bulk Actions -->
      <div class="picker-toolbar">
        <div class="search-and-tabs">
          <div class="search-box">
            <span class="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search documents by title, page, topic, or URL..."
              bind:value={searchQuery}
              class="search-input"
            />
            {#if searchQuery}
              <button
                type="button"
                class="search-clear-btn"
                onclick={() => (searchQuery = '')}
                title="Clear search"
              >
                ✕
              </button>
            {/if}
          </div>

          <div class="filter-tabs">
            <button
              type="button"
              class="tab-btn"
              class:active={filterMode === 'all'}
              onclick={() => (filterMode = 'all')}
            >
              All ({totalCount})
            </button>
            <button
              type="button"
              class="tab-btn"
              class:active={filterMode === 'selected'}
              onclick={() => (filterMode = 'selected')}
            >
              Selected ({selectedCount})
            </button>
            <button
              type="button"
              class="tab-btn"
              class:active={filterMode === 'unselected'}
              onclick={() => (filterMode = 'unselected')}
            >
              Unselected ({totalCount - selectedCount})
            </button>
          </div>
        </div>

        <div class="bulk-actions-row">
          <div class="bulk-left">
            <button
              type="button"
              class="btn-picker-action"
              onclick={selectAllVisible}
              disabled={filteredDocs.length === 0}
            >
              Select All Visible ({filteredDocs.length})
            </button>
            <button
              type="button"
              class="btn-picker-action"
              onclick={deselectAllVisible}
              disabled={filteredDocs.length === 0}
            >
              Clear Visible
            </button>
          </div>
          <div class="bulk-right">
            <button
              type="button"
              class="btn-picker-action secondary"
              onclick={selectAllInSource}
            >
              Select All in Source
            </button>
            <button
              type="button"
              class="btn-picker-action secondary"
              onclick={clearAllInSource}
            >
              Clear All
            </button>
          </div>
        </div>
      </div>

      <!-- Document Scrollable List -->
      <div class="picker-list-container">
        {#if documents.length === 0}
          <div class="empty-state">
            <span class="empty-icon">📁</span>
            <p>No documents discovered for this source yet.</p>
          </div>
        {:else if filteredDocs.length === 0}
          <div class="empty-state">
            <span class="empty-icon">🔍</span>
            <p>
              No documents match your filter
              {#if searchQuery}
                for "<em>{searchQuery}</em>"
              {/if}
              in <strong>{filterMode}</strong> mode.
            </p>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              onclick={() => {
                searchQuery = '';
                filterMode = 'all';
              }}
            >
              Reset Filters
            </button>
          </div>
        {:else}
          <div class="doc-rows-list">
            {#each filteredDocs as doc (doc.id)}
              <!-- svelte-ignore a11y_interactive_supports_focus -->
              <div
                class="picker-doc-row tray-doc-row"
                class:selected={!!localSelectedIds[doc.id]}
                onclick={(e) => toggleDocSelection(doc, e)}
                role="checkbox"
                aria-checked={!!localSelectedIds[doc.id]}
                tabindex="0"
                onkeydown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    toggleDocSelection(doc);
                  }
                }}
              >
                <div class="row-left">
                  <input
                    type="checkbox"
                    class="doc-checkbox"
                    checked={!!localSelectedIds[doc.id]}
                    onclick={(e) => e.stopPropagation()}
                    onchange={(e) => toggleDocSelection(doc, e as any)}
                    tabindex="-1"
                    aria-label={`Select ${doc.title}`}
                  />
                  <div class="doc-info">
                    <div class="doc-title" title={doc.title}>
                      {doc.title}
                    </div>
                    <div class="doc-meta-row">
                      {#if formatPageBadge(doc)}
                        <span class="meta-item page-badge">
                          📄 {formatPageBadge(doc)}
                        </span>
                      {/if}
                      <span class="meta-item word-count">
                        📝 {(doc.wordCount || 0).toLocaleString()} words
                      </span>
                      {#if doc.cardCount && doc.cardCount > 0}
                        <span class="meta-item card-count">
                          🎴 {doc.cardCount} cards
                        </span>
                      {/if}
                      {#if doc.url}
                        <span class="meta-item doc-url" title={doc.url}>
                          🔗 {doc.url.replace(/^https?:\/\/(www\.)?/, '')}
                        </span>
                      {/if}
                    </div>
                  </div>
                </div>

                {#if onPreviewDoc}
                  <div class="row-right">
                    <button
                      type="button"
                      class="btn-preview-mini"
                      onclick={(e) => {
                        e.stopPropagation();
                        onPreviewDoc(doc);
                      }}
                      title="Preview Document Content"
                    >
                      👁️ Preview
                    </button>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Sticky Footer -->
      <div class="picker-footer">
        <div class="footer-metrics">
          <span class="status-summary">
            {#if selectedCount > 0}
              🎯 <strong>{selectedCount}</strong> of <strong>{totalCount}</strong> documents selected
              <span class="word-estimate">(~{selectedWords.toLocaleString()} words)</span>
            {:else}
              ⚪ <strong>0</strong> of <strong>{totalCount}</strong> documents selected
            {/if}
          </span>
        </div>

        <div class="footer-buttons">
          <button type="button" class="btn btn-secondary" onclick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-primary btn-apply"
            onclick={handleApply}
          >
            Apply Selection ({selectedCount})
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .doc-picker-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(4px);
    z-index: 1200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    box-sizing: border-box;
  }

  .doc-picker-modal {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 12px;
    width: 920px;
    max-width: min(920px, 95vw);
    height: 85vh;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.8);
    overflow: hidden;
    box-sizing: border-box;
  }

  /* Header */
  .picker-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    background: #1e293b;
    border-bottom: 1px solid #334155;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .type-badge {
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: #334155;
    color: #94a3b8;
    flex-shrink: 0;
  }

  .type-badge.epub {
    background: #7c2d12;
    color: #fdba74;
  }

  .type-badge.pdf {
    background: #7f1d1d;
    color: #fca5a5;
  }

  .type-badge.web,
  .type-badge.article {
    background: #1e3a8a;
    color: #93c5fd;
  }

  .type-badge.text {
    background: #14532d;
    color: #86efac;
  }

  .header-text {
    min-width: 0;
  }

  .picker-title {
    font-size: 16px;
    font-weight: 700;
    color: #f8fafc;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .source-name {
    color: #38bdf8;
  }

  .picker-subtitle {
    font-size: 12px;
    color: #94a3b8;
    margin: 2px 0 0 0;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }

  .header-doc-counter {
    font-size: 11.5px;
    color: #94a3b8;
    background: #0f172a;
    padding: 3px 8px;
    border-radius: 6px;
    border: 1px solid #334155;
    font-weight: 600;
  }

  .btn-close-modal {
    background: transparent;
    border: 1px solid transparent;
    color: #94a3b8;
    font-size: 16px;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-close-modal:hover {
    background: #334155;
    color: #f8fafc;
  }

  /* Toolbar */
  .picker-toolbar {
    padding: 12px 20px;
    background: #0b0f19;
    border-bottom: 1px solid #1e293b;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .search-and-tabs {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .search-box {
    position: relative;
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 260px;
  }

  .search-icon {
    position: absolute;
    left: 10px;
    font-size: 13px;
    color: #64748b;
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    background: #1e293b;
    border: 1px solid #334155;
    color: #f8fafc;
    padding: 7px 32px 7px 32px;
    border-radius: 6px;
    font-size: 12.5px;
    box-sizing: border-box;
    transition: border-color 0.15s ease;
  }

  .search-input:focus {
    outline: none;
    border-color: #6366f1;
  }

  .search-clear-btn {
    position: absolute;
    right: 8px;
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    font-size: 12px;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .search-clear-btn:hover {
    color: #f8fafc;
    background: #334155;
  }

  .filter-tabs {
    display: flex;
    align-items: center;
    gap: 4px;
    background: #1e293b;
    padding: 3px;
    border-radius: 6px;
    border: 1px solid #334155;
  }

  .tab-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 11.5px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .tab-btn:hover {
    color: #f8fafc;
  }

  .tab-btn.active {
    background: #38bdf8;
    color: #0f172a;
    font-weight: 700;
  }

  .bulk-actions-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .bulk-left,
  .bulk-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn-picker-action {
    background: #1e293b;
    border: 1px solid #334155;
    color: #cbd5e1;
    font-size: 11.5px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-picker-action:hover:not(:disabled) {
    background: #334155;
    color: #f8fafc;
    border-color: #475569;
  }

  .btn-picker-action:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-picker-action.secondary {
    color: #94a3b8;
    background: transparent;
  }

  .btn-picker-action.secondary:hover {
    background: #1e293b;
    color: #cbd5e1;
  }

  /* List Container */
  .picker-list-container {
    flex: 1;
    overflow-y: auto;
    padding: 12px 20px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 20px;
    text-align: center;
    color: #94a3b8;
    gap: 10px;
  }

  .empty-icon {
    font-size: 32px;
  }

  .doc-rows-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .picker-doc-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 9px 12px;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 6px;
    cursor: pointer;
    user-select: none;
    transition: all 0.12s ease;
  }

  .picker-doc-row:hover {
    background: #253349;
    border-color: #475569;
  }

  .picker-doc-row.selected {
    background: rgba(56, 189, 248, 0.08);
    border-color: rgba(56, 189, 248, 0.4);
  }

  .row-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    flex: 1;
  }

  .doc-checkbox {
    width: 16px;
    height: 16px;
    cursor: pointer;
    accent-color: #38bdf8;
    flex-shrink: 0;
  }

  .doc-info {
    min-width: 0;
    flex: 1;
  }

  .doc-title {
    font-size: 13px;
    font-weight: 600;
    color: #f8fafc;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .picker-doc-row.selected .doc-title {
    color: #38bdf8;
  }

  .doc-meta-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 3px;
    flex-wrap: wrap;
  }

  .meta-item {
    font-size: 11px;
    color: #94a3b8;
    white-space: nowrap;
  }

  .meta-item.page-badge {
    background: #0f172a;
    color: #cbd5e1;
    padding: 1px 6px;
    border-radius: 4px;
    border: 1px solid #334155;
    font-weight: 500;
  }

  .meta-item.card-count {
    color: #38bdf8;
    font-weight: 600;
  }

  .meta-item.doc-url {
    max-width: min(220px, 35vw);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #64748b;
  }

  .row-right {
    margin-left: 12px;
    flex-shrink: 0;
  }

  .btn-preview-mini {
    background: transparent;
    border: 1px solid #334155;
    color: #94a3b8;
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-preview-mini:hover {
    background: #334155;
    color: #f8fafc;
    border-color: #475569;
  }

  /* Footer */
  .picker-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 20px;
    background: #1e293b;
    border-top: 1px solid #334155;
    gap: 16px;
    flex-wrap: wrap;
  }

  .footer-metrics {
    min-width: 0;
  }

  .status-summary {
    font-size: 13px;
    color: #cbd5e1;
  }

  .word-estimate {
    color: #94a3b8;
    font-size: 12px;
    margin-left: 4px;
  }

  .footer-buttons {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .btn {
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    border: 1px solid transparent;
  }

  .btn-secondary {
    background: #334155;
    color: #f8fafc;
    border-color: #475569;
  }

  .btn-secondary:hover {
    background: #475569;
  }

  .btn-primary {
    background: #6366f1;
    color: white;
  }

  .btn-primary:hover {
    background: #4f46e5;
  }

  .btn-apply {
    background: #0284c7;
  }

  .btn-apply:hover {
    background: #0369a1;
  }

  .btn-sm {
    padding: 5px 12px;
    font-size: 12px;
  }

  @media (max-width: 640px) {
    .doc-picker-backdrop {
      padding: 0;
    }

    .doc-picker-modal {
      width: 100vw;
      max-width: 100vw;
      height: 100vh;
      max-height: 100vh;
      border-radius: 0;
      border: none;
    }

    .picker-header {
      padding: 12px 14px;
    }

    .picker-toolbar {
      padding: 10px 14px;
    }

    .picker-list-container {
      padding: 10px 14px;
    }

    .picker-footer {
      padding: 12px 14px;
      flex-direction: column;
      align-items: stretch;
    }

    .footer-buttons {
      width: 100%;
      justify-content: space-between;
    }

    .footer-buttons .btn {
      flex: 1;
    }
  }
</style>
