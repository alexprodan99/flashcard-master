<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchSources, fetchSourceDocuments, toggleSourceActive, deleteSource, syncSource, syncAllSources } from '../lib/api';
  import type { DataSource, DiscoveredDocument } from '../lib/types';
  import AddSourceModal from '../components/AddSourceModal.svelte';
  import EditSourceModal from '../components/EditSourceModal.svelte';
  import SourceDocumentInspector from '../components/SourceDocumentInspector.svelte';
  import DocumentExportModal from '../components/DocumentExportModal.svelte';

  interface Props {
    onNavigate?: (tab: string, queryParams?: Record<string, string>) => void;
  }

  let { onNavigate }: Props = $props();

  let sources = $state<DataSource[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let isAddModalOpen = $state(false);
  let editingSource = $state<DataSource | null>(null);
  let isEditModalOpen = $state(false);
  let inspectingSource = $state<DataSource | null>(null);
  let isInspectorOpen = $state(false);
  let exportingSource = $state<DataSource | null>(null);
  let isExportModalOpen = $state(false);
  let sourceDocsForExport = $state<DiscoveredDocument[]>([]);
  let syncingId = $state<string | null>(null);
  let toastMessage = $state<string | null>(null);

  let isSyncingAll = $state(false);

  async function handleOpenExport(source: DataSource) {
    try {
      const data = await fetchSourceDocuments(source.id);
      if (!data.documents || data.documents.length === 0) {
        alert(`No discovered documents found for "${source.name}". Click "Sync" first to fetch and extract articles from this source.`);
        return;
      }
      exportingSource = source;
      sourceDocsForExport = data.documents;
      isExportModalOpen = true;
    } catch (err: any) {
      alert('Failed to load documents for export: ' + err.message);
    }
  }


  async function loadSources() {
    loading = true;
    error = null;
    try {
      sources = await fetchSources();
    } catch (err: any) {
      error = err.message || 'Failed to load data sources';
    } finally {
      loading = false;
    }
  }

  async function handleToggleActive(source: DataSource) {
    try {
      const updated = await toggleSourceActive(source.id, !source.isActive);
      sources = sources.map((s) => (s.id === updated.id ? updated : s));
    } catch (err: any) {
      alert('Failed to toggle source: ' + err.message);
    }
  }

  async function handleDelete(source: DataSource) {
    if (!confirm(`Are you sure you want to delete source "${source.name}"?`)) return;
    try {
      await deleteSource(source.id);
      sources = sources.filter((s) => s.id !== source.id);
    } catch (err: any) {
      alert('Failed to delete source: ' + err.message);
    }
  }

  async function handleSync(source: DataSource) {
    syncingId = source.id;
    toastMessage = null;
    try {
      const result = await syncSource(source.id);
      if (result.newCount > 0) {
        toastMessage = `✅ Synced "${source.name}": ${result.newCount} new documents ingested (${result.totalFetched} total found).`;
      } else {
        toastMessage = `✅ Synced "${source.name}": Up to date (0 new documents, ${result.totalFetched} total checked).`;
      }
      setTimeout(() => (toastMessage = null), 5000);
      await loadSources();
    } catch (err: any) {
      alert('Sync failed: ' + err.message);
    } finally {
      syncingId = null;
    }
  }

  async function handleSyncAll() {
    isSyncingAll = true;
    toastMessage = null;
    try {
      const results = await syncAllSources();
      const totalNew = results.reduce((acc, r) => acc + (r.newCount || 0), 0);
      toastMessage = `✅ Bulk sync completed: ${totalNew} new documents ingested across ${results.length} sources.`;
      setTimeout(() => (toastMessage = null), 5000);
      await loadSources();
    } catch (err: any) {
      alert('Bulk sync failed: ' + err.message);
    } finally {
      isSyncingAll = false;
    }
  }

  function handleSourceCreated(newSource: DataSource) {
    sources = [newSource, ...sources];
    toastMessage = `✅ Data source "${newSource.name}" added successfully.`;
    setTimeout(() => (toastMessage = null), 4000);
  }

  function handleSourceUpdated(updated: DataSource) {
    sources = sources.map((s) => (s.id === updated.id ? updated : s));
    toastMessage = `✅ Data source "${updated.name}" updated successfully.`;
    setTimeout(() => (toastMessage = null), 4000);
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
      <button class="btn btn-secondary" onclick={handleSyncAll} disabled={isSyncingAll || sources.length === 0}>
        {#if isSyncingAll}
          <span class="mini-spinner"></span> Syncing All...
        {:else}
          🔄 Sync All Sources
        {/if}
      </button>
      <button class="btn btn-primary" onclick={() => (isAddModalOpen = true)}>
        ➕ Add Ingestion Source
      </button>
    </div>
  </div>

  {#if toastMessage}
    <div class="toast-banner">{toastMessage}</div>
  {/if}

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
                    onchange={() => handleToggleActive(s)}
                  />
                  <span class="slider"></span>
                </label>
              </td>
              <td>
                <div class="actions-cell">
                  <button
                    class="action-btn edit-btn"
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
                    onclick={() => handleOpenExport(s)}
                    title="Export Clean Document Knowledge Base"
                  >
                    📤 Export
                  </button>
                  <button
                    class="action-btn sync-btn"
                    disabled={syncingId === s.id}
                    onclick={() => handleSync(s)}
                    title="Trigger Ingestion & Extraction"
                  >
                    {#if syncingId === s.id}
                      <span class="mini-spinner"></span>
                    {:else}
                      ⚡ Sync
                    {/if}
                  </button>
                  <button
                    class="action-btn delete-btn"
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

  .delete-btn:hover {
    background: #ef4444;
    color: white;
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

  .btn-primary {
    background: #6366f1;
    color: #ffffff;
  }

  .btn-primary:hover {
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