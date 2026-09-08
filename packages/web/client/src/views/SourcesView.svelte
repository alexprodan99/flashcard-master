<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchSources, fetchSourceDocuments, toggleSourceActive, deleteSource, syncSource, syncAllSources } from '../lib/api';
  import type { DataSource, DiscoveredDocument } from '../lib/types';
  import AddSourceModal from '../components/AddSourceModal.svelte';
  import EditSourceModal from '../components/EditSourceModal.svelte';
  import SourceDocumentInspector from '../components/SourceDocumentInspector.svelte';
  import DocumentExportModal from '../components/DocumentExportModal.svelte';
  import { sourcesStore, toastStore } from '../stores/index.js';

  interface Props {
    onNavigate?: (tab: string, queryParams?: Record<string, string>) => void;
  }

  let { onNavigate }: Props = $props();

  let sources = $derived(sourcesStore.sources);
  let loading = $derived(sourcesStore.loading);
  let error = $derived(sourcesStore.error);
  let isSyncingAll = $derived(sourcesStore.isSyncingAll);

  let isAddModalOpen = $state(false);
  let editingSource = $state<DataSource | null>(null);
  let isEditModalOpen = $state(false);
  let inspectingSource = $state<DataSource | null>(null);
  let isInspectorOpen = $state(false);
  let exportingSource = $state<DataSource | null>(null);
  let isExportModalOpen = $state(false);
  let sourceDocsForExport = $state<DiscoveredDocument[]>([]);
  let syncingId = $state<string | null>(null);

  async function handleOpenExport(source: DataSource) {
    try {
      const data = await fetchSourceDocuments(source.id);
      if (!data.documents || data.documents.length === 0) {
        toastStore.warning(`No discovered documents found for "${source.name}". Click "Sync" first.`);
        return;
      }
      exportingSource = source;
      sourceDocsForExport = data.documents;
      isExportModalOpen = true;
    } catch (err: any) {
      toastStore.error('Failed to load documents for export: ' + err.message);
    }
  }

  async function loadSources() {
    if (sourcesStore.sources.length === 0) {
      sourcesStore.loading = true;
    }
    sourcesStore.error = null;
    try {
      const fetched = await fetchSources();
      sourcesStore.setSources(fetched);
    } catch (err: any) {
      sourcesStore.error = err.message || 'Failed to load data sources';
    } finally {
      sourcesStore.loading = false;
    }
  }

  async function handleToggleActive(source: DataSource) {
    if (isSyncingAll || syncingId === source.id) return;
    try {
      const updated = await toggleSourceActive(source.id, !source.isActive);
      sourcesStore.updateSource(updated);
      toastStore.info(`Source "${source.name}" is now ${updated.isActive ? 'active' : 'inactive'}.`);
    } catch (err: any) {
      toastStore.error('Failed to toggle source: ' + err.message);
    }
  }

  async function handleDelete(source: DataSource) {
    if (isSyncingAll || syncingId === source.id) return;
    if (!confirm(`Are you sure you want to delete source "${source.name}"?`)) return;
    try {
      await deleteSource(source.id);
      sourcesStore.removeSource(source.id);
      toastStore.info(`Source "${source.name}" deleted.`);
    } catch (err: any) {
      toastStore.error('Failed to delete source: ' + err.message);
    }
  }

  async function handleSync(source: DataSource) {
    if (isSyncingAll || syncingId !== null) return;
    syncingId = source.id;
    sourcesStore.setSyncing(source.id, true);
    try {
      const result = await syncSource(source.id);
      if (result.newCount > 0) {
        toastStore.success(`Synced "${source.name}": ${result.newCount} new documents ingested (${result.totalFetched} total found).`);
      } else {
        toastStore.info(`Synced "${source.name}": Up to date (0 new documents, ${result.totalFetched} total checked).`);
      }
      await loadSources();
    } catch (err: any) {
      toastStore.error('Sync failed: ' + err.message);
    } finally {
      syncingId = null;
      sourcesStore.setSyncing(source.id, false);
    }
  }

  async function handleSyncAll() {
    if (isSyncingAll || syncingId !== null) return;
    sourcesStore.setSyncingAll(true);
    try {
      const results = await syncAllSources();
      const totalNew = results.reduce((acc, r) => acc + (r.newCount || 0), 0);
      toastStore.success(`Bulk sync completed: ${totalNew} new documents ingested across ${results.length} sources.`);
      await loadSources();
    } catch (err: any) {
      toastStore.error('Bulk sync failed: ' + err.message);
    } finally {
      sourcesStore.setSyncingAll(false);
    }
  }

  function handleSourceCreated(newSource: DataSource) {
    sourcesStore.setSources([newSource, ...sourcesStore.sources]);
    toastStore.success(`Data source "${newSource.name}" added successfully.`);
  }

  function handleSourceUpdated(updated: DataSource) {
    sourcesStore.updateSource(updated);
    toastStore.success(`Data source "${updated.name}" updated successfully.`);
  }

  function getUriSummary(source: DataSource): { displayUri: string; countBadge?: string } {
    if (source.type === 'web') {
      const raw = source.uri || '';
      if (raw.trim().startsWith('[') && raw.trim().endsWith(']')) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return {
              displayUri: `${parsed[0]}${parsed.length > 1 ? ` (+${parsed.length - 1} more)` : ''}`,
              countBadge: `${parsed.length} URLs`,
            };
          }
        } catch {}
      }
    }
    return { displayUri: source.uri };
  }

  onMount(() => {
    loadSources();
  });
</script>

<div class="view-container">
  <div class="view-header">
    <div>
      <h1 class="view-title">Data Sources Manager</h1>
      <p class="view-subtitle">Connect and synchronize RSS feeds, XML sitemaps, technical blogs, and local notes.</p>
    </div>
    <div class="header-actions">
      <button class="btn btn-secondary" onclick={handleSyncAll} disabled={isSyncingAll || syncingId !== null || sources.length === 0}>
        {#if isSyncingAll}
          <span class="mini-spinner"></span> Syncing All...
        {:else}
          🔄 Sync All Sources
        {/if}
      </button>
      <button class="btn btn-primary" onclick={() => (isAddModalOpen = true)} disabled={isSyncingAll}>
        ➕ Add Ingestion Source
      </button>
    </div>
  </div>

  {#if loading && sources.length === 0}
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Loading registered data sources...</p>
    </div>
  {:else if error}
    <div class="error-banner">
      <span>⚠️ {error}</span>
      <button onclick={loadSources} class="btn btn-sm">Retry</button>
    </div>
  {:else if sources.length === 0}
    <div class="empty-state">
      <div class="empty-icon">🌐</div>
      <h3>No Data Sources Found</h3>
      <p>Add your first RSS feed, web article URL, or Markdown directory to start generating cards.</p>
      <button class="btn btn-primary" onclick={() => (isAddModalOpen = true)}>
        Add Data Source
      </button>
    </div>
  {:else}
    <div class="table-card">
      <table class="sources-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Name & URI</th>
            <th>Target Deck</th>
            <th>Tags</th>
            <th>Active</th>
            <th class="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each sources as s}
            {@const uriInfo = getUriSummary(s)}
            <tr>
              <td>
                <span class="type-badge {s.type}">{s.type}</span>
              </td>
              <td>
                <div class="source-info">
                  <span class="source-name">{s.name}</span>
                  <div class="uri-row">
                    <span class="source-uri" title={s.uri}>{uriInfo.displayUri}</span>
                    {#if uriInfo.countBadge}
                      <span class="url-count-pill">{uriInfo.countBadge}</span>
                    {/if}
                  </div>
                </div>
              </td>
              <td>
                <span class="deck-badge">{s.targetDeck || 'Default'}</span>
              </td>
              <td>
                <div class="tags-container">
                  {#if s.tags && s.tags.length > 0}
                    {#each s.tags as tag}
                      <span class="tag-pill">#{tag}</span>
                    {/each}
                  {:else}
                    <span class="text-muted">—</span>
                  {/if}
                </div>
              </td>
              <td>
                <label class="switch">
                  <input
                    type="checkbox"
                    checked={s.isActive}
                    disabled={isSyncingAll || syncingId !== null}
                    onchange={() => handleToggleActive(s)}
                  />
                  <span class="slider"></span>
                </label>
              </td>
              <td>
                <div class="actions-cell">
                  <button
                    class="action-btn edit-btn"
                    disabled={isSyncingAll || syncingId !== null}
                    onclick={() => {
                      editingSource = s;
                      isEditModalOpen = true;
                    }}
                    title="Edit Data Source"
                  >
                    ✏️ Edit
                  </button>
                  <button
                    class="action-btn inspect-btn"
                    onclick={() => {
                      inspectingSource = s;
                      isInspectorOpen = true;
                    }}
                    title="Inspect Discovered Documents & Articles"
                  >
                    📖 Documents
                  </button>
                  <button
                    class="action-btn export-btn"
                    disabled={isSyncingAll || syncingId === s.id}
                    onclick={() => handleOpenExport(s)}
                    title="Export Clean Document Knowledge Base"
                  >
                    📤 Export
                  </button>
                  <button
                    class="action-btn sync-btn"
                    disabled={isSyncingAll || syncingId !== null}
                    onclick={() => handleSync(s)}
                    title="Trigger Ingestion & Extraction"
                  >
                    {#if syncingId === s.id}
                      <span class="mini-spinner"></span> Syncing...
                    {:else}
                      ⚡ Sync
                    {/if}
                  </button>
                  <button
                    class="action-btn delete-btn"
                    disabled={isSyncingAll || syncingId !== null}
                    onclick={() => handleDelete(s)}
                    title="Delete Source"
                  >
                    🗑️
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<AddSourceModal
  isOpen={isAddModalOpen}
  onClose={() => (isAddModalOpen = false)}
  onSourceCreated={handleSourceCreated}
/>

<EditSourceModal
  isOpen={isEditModalOpen}
  source={editingSource}
  onClose={() => (isEditModalOpen = false)}
  onSourceUpdated={handleSourceUpdated}
/>

<SourceDocumentInspector
  isOpen={isInspectorOpen}
  source={inspectingSource}
  onClose={() => (isInspectorOpen = false)}
  onOpenInStudio={(doc) => {
    isInspectorOpen = false;
    onNavigate?.('generate', { docId: doc.id });
  }}
/>

<DocumentExportModal
  isOpen={isExportModalOpen}
  documents={sourceDocsForExport}
  sourceName={exportingSource?.name || 'Knowledge Base'}
  sourceId={exportingSource?.id}
  onClose={() => (isExportModalOpen = false)}
  onExportSuccess={(fn) => {
    toastMessage = `✅ Exported ${fn}`;
    setTimeout(() => (toastMessage = null), 4000);
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

  .table-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    overflow: hidden;
  }

  .sources-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
    font-size: 13px;
  }

  th {
    background: #0f172a;
    color: #94a3b8;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 11px;
    padding: 14px 18px;
    border-bottom: 1px solid #334155;
  }

  td {
    padding: 14px 18px;
    border-bottom: 1px solid rgba(51, 65, 85, 0.5);
    color: #cbd5e1;
    vertical-align: middle;
  }

  tr:last-child td {
    border-bottom: none;
  }

  tr:hover td {
    background: rgba(255, 255, 255, 0.02);
  }

  .source-info {
    display: flex;
    flex-direction: column;
    gap: 3px;
    max-width: 340px;
  }

  .uri-row {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
  }

  .source-name {
    font-weight: 600;
    color: #f8fafc;
    font-size: 14px;
  }

  .source-uri {
    font-size: 12px;
    color: #64748b;
    font-family: monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .url-count-pill {
    font-size: 10px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 10px;
    background: rgba(99, 102, 241, 0.2);
    color: #818cf8;
    border: 1px solid rgba(99, 102, 241, 0.35);
    white-space: nowrap;
    flex-shrink: 0;
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

  .deck-badge {
    background: rgba(255, 255, 255, 0.05);
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 12px;
    color: #94a3b8;
  }

  .tags-container {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .tag-pill {
    background: rgba(99, 102, 241, 0.1);
    color: #a5b4fc;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 11px;
  }

  .text-muted {
    color: #64748b;
  }

  .text-right {
    text-align: right;
  }

  .actions-cell {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .action-btn {
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.15s;
  }

  .edit-btn {
    background: rgba(148, 163, 184, 0.15);
    color: #cbd5e1;
    border-color: rgba(148, 163, 184, 0.3);
  }

  .edit-btn:hover {
    background: #475569;
    color: white;
  }

  .inspect-btn {
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
    border-color: rgba(16, 185, 129, 0.3);
  }

  .inspect-btn:hover {
    background: #10b981;
    color: white;
  }

  .sync-btn {
    background: rgba(99, 102, 241, 0.15);
    color: #818cf8;
    border-color: rgba(99, 102, 241, 0.3);
  }

  .sync-btn:hover {
    background: #6366f1;
    color: white;
  }

  .delete-btn {
    background: rgba(239, 68, 68, 0.15);
    color: #fca5a5;
    border-color: rgba(239, 68, 68, 0.3);
  }

  .action-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    pointer-events: none;
  }

  /* Toggle Switch */
  .switch {
    position: relative;
    display: inline-block;
    width: 36px;
    height: 20px;
  }

  .switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .switch input:disabled + .slider {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .slider {
    position: absolute;
    cursor: pointer;
    inset: 0;
    background-color: #334155;
    transition: 0.2s;
    border-radius: 20px;
  }

  .slider:before {
    position: absolute;
    content: "";
    height: 14px;
    width: 14px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: 0.2s;
    border-radius: 50%;
  }

  input:checked + .slider {
    background-color: #10b981;
  }

  input:checked + .slider:before {
    transform: translateX(16px);
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

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: #6366f1;
    color: #ffffff;
  }

  .btn-primary:hover:not(:disabled) {
    background: #4f46e5;
  }

  .toast-banner {
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid rgba(16, 185, 129, 0.3);
    color: #34d399;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
  }

  .loading-state, .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 0;
    color: #94a3b8;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
  }

  .empty-icon {
    font-size: 40px;
    margin-bottom: 12px;
  }

  .empty-state h3 {
    font-size: 18px;
    font-weight: 600;
    color: #f8fafc;
    margin: 0 0 6px 0;
  }

  .empty-state p {
    font-size: 13px;
    color: #94a3b8;
    margin: 0 0 16px 0;
    max-width: 400px;
    text-align: center;
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

  .mini-spinner {
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