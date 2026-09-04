<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchSourceDocuments, fetchDocumentDetails, generateCards } from '../lib/api';
  import type { DataSource, DiscoveredDocument, PersonaType, DifficultyLevel, CardDepthMode } from '../lib/types';
  import GenerationConfigFields from './GenerationConfigFields.svelte';
  import DocumentPreviewModal from './DocumentPreviewModal.svelte';

  interface Props {
    isOpen: boolean;
    source: DataSource | null;
    onClose: () => void;
    onOpenInStudio?: (doc: DiscoveredDocument) => void;
  }

  let { isOpen, source, onClose, onOpenInStudio }: Props = $props();

  let documents = $state<DiscoveredDocument[]>([]);
  let isLoading = $state(false);
  let searchQuery = $state('');
  let errorMessage = $state<string | null>(null);

  // Preview Modal State
  let previewDoc = $state<DiscoveredDocument | null>(null);
  let isPreviewOpen = $state(false);

  // Configuration & Synthesis Modal State (Story 11.2)
  let configDoc = $state<DiscoveredDocument | null>(null);
  let isConfigModalOpen = $state(false);
  let isGenerating = $state(false);
  let successNotice = $state<string | null>(null);

  // Generation parameters
  let provider = $state('ollama');
  let model = $state('phi4-mini');
  let apiKey = $state('');
  let persona = $state<PersonaType>('socratic-mentor');
  let difficulty = $state<DifficultyLevel>('intermediate');
  let depthMode = $state<CardDepthMode>('atomic');
  let chunkMultiplier = $state<number>(1);
  let limit = $state(4);
  let targetDeck = $state('');
  let enforceGrounding = $state(true);

  async function loadDocuments() {
    if (!source) return;
    isLoading = true;
    errorMessage = null;
    try {
      const data = await fetchSourceDocuments(source.id, searchQuery.trim() || undefined);
      documents = data.documents;
    } catch (err: any) {
      errorMessage = err.message || 'Failed to load source documents';
    } finally {
      isLoading = false;
    }
  }

  $effect(() => {
    if (isOpen && source) {
      loadDocuments();
    } else {
      documents = [];
      searchQuery = '';
      errorMessage = null;
      successNotice = null;
    }
  });

  function handleSearchInput(e: Event) {
    searchQuery = (e.target as HTMLInputElement).value;
    loadDocuments();
  }

  async function handleOpenPreview(doc: DiscoveredDocument) {
    try {
      const details = await fetchDocumentDetails(doc.id);
      previewDoc = details.document;
      isPreviewOpen = true;
    } catch (err: any) {
      alert('Failed to load document preview: ' + err.message);
    }
  }

  function handleOpenConfigModal(doc: DiscoveredDocument) {
    configDoc = doc;
    if (source?.targetDeck && !targetDeck) {
      targetDeck = source.targetDeck;
    }
    isConfigModalOpen = true;
  }

  function handleCloseConfigModal() {
    isConfigModalOpen = false;
    configDoc = null;
  }

  async function handleSynthesizeSingle() {
    if (!configDoc || !source) return;
    isGenerating = true;
    successNotice = null;

    try {
      const result = await generateCards({
        documentIds: [configDoc.id],
        provider,
        model: model.trim() || undefined,
        apiKey: apiKey.trim() || undefined,
        persona,
        difficulty,
        depthMode,
        chunkMultiplier,
        limit,
        targetDeck: targetDeck.trim() || source.targetDeck || undefined,
        enforceGrounding,
      });

      successNotice = `🎉 Generated ${result.cardsCreated} grounded flashcards from "${configDoc.title}"!`;
      isConfigModalOpen = false;
      configDoc = null;
      await loadDocuments(); // Refresh card counts
    } catch (err: any) {
      alert('Generation failed: ' + err.message);
    } finally {
      isGenerating = false;
    }
  }
</script>

{#if isOpen && source}
  <div class="drawer-backdrop" role="presentation" onclick={onClose}>
    <div
      class="drawer-panel"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.key === 'Escape' && onClose()}
    >
      <div class="drawer-header">
        <div class="header-titles">
          <div class="source-badge-row">
            <span class="type-badge {source.type}">{source.type}</span>
            <span class="deck-badge">📁 {source.targetDeck}</span>
          </div>
          <h2>{source.name}</h2>
          <p class="source-uri" title={source.uri}>{source.uri}</p>
        </div>
        <button class="btn-close" onclick={onClose} aria-label="Close Inspector">✕</button>
      </div>

      <!-- Quick Metrics Bar -->
      <div class="metrics-bar">
        <div class="metric-item">
          <span class="metric-value">{documents.length}</span>
          <span class="metric-label">Discovered Documents</span>
        </div>
        <div class="metric-item">
          <span class="metric-value">
            {documents.reduce((acc, d) => acc + (d.cardCount || 0), 0)}
          </span>
          <span class="metric-label">Flashcards Produced</span>
        </div>
        <div class="metric-item">
          <span class="metric-value">
            {documents.reduce((acc, d) => acc + (d.wordCount || 0), 0).toLocaleString()}
          </span>
          <span class="metric-label">Total Words</span>
        </div>
      </div>

      {#if successNotice}
        <div class="success-banner">{successNotice}</div>
      {/if}

      <!-- Search & Filter Row -->
      <div class="search-bar">
        <input
          type="text"
          placeholder="🔍 Search documents by title or topic..."
          value={searchQuery}
          oninput={handleSearchInput}
        />
        <button class="btn btn-secondary btn-sm" onclick={loadDocuments}>🔄 Refresh</button>
      </div>

      <!-- Documents Catalog List -->
      <div class="drawer-body">
        {#if isLoading}
          <div class="loading-state">
            <div class="spinner"></div>
            <p>Loading discovered document catalog...</p>
          </div>
        {:else if errorMessage}
          <div class="error-banner">⚠️ {errorMessage}</div>
        {:else if documents.length === 0}
          <div class="empty-state">
            <span class="empty-icon">📂</span>
            <h3>No Documents Discovered Yet</h3>
            <p>Trigger a source sync to crawl and extract articles from this data source.</p>
          </div>
        {:else}
          <div class="document-list">
            {#each documents as doc (doc.id)}
              <div class="document-card">
                <div class="doc-main">
                  <div class="doc-header">
                    <h4 class="doc-title">{doc.title}</h4>
                    <div class="doc-badges">
                      <span class="badge word-count">📝 {doc.wordCount.toLocaleString()} words</span>
                      <span class="badge card-count" class:has-cards={(doc.cardCount || 0) > 0}>
                        🎴 {doc.cardCount || 0} cards
                      </span>
                    </div>
                  </div>

                  {#if doc.url}
                    <a href={doc.url} target="_blank" rel="noopener noreferrer" class="doc-url-link">
                      🔗 {doc.url}
                    </a>
                  {:else}
                    <span class="doc-local-path">📖 Local File Extract</span>
                  {/if}
                </div>

                <div class="doc-actions">
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    onclick={() => handleOpenPreview(doc)}
                  >
                    👁️ Preview
                  </button>

                  <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    onclick={() => handleOpenConfigModal(doc)}
                  >
                    ⚡ Generate Cards
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- Reusable Article Clean Text Reader Modal -->
<DocumentPreviewModal
  isOpen={isPreviewOpen}
  document={previewDoc}
  onClose={() => (isPreviewOpen = false)}
  onSynthesize={(doc) => {
    isPreviewOpen = false;
    handleOpenConfigModal(doc);
  }}
  onOpenInStudio={(doc) => {
    isPreviewOpen = false;
    if (onOpenInStudio) onOpenInStudio(doc);
  }}
/>

<!-- In-Context "Synthesize Flashcards" Configuration Modal (Story 11.2) -->
{#if isConfigModalOpen && configDoc}
  <div class="config-modal-backdrop" role="presentation" onclick={handleCloseConfigModal}>
    <div
      class="config-modal"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.key === 'Escape' && handleCloseConfigModal()}
    >
      <div class="config-modal-header">
        <div>
          <h3>⚡ Synthesize Flashcards: {configDoc.title}</h3>
          <span class="doc-meta-subtitle">
            📝 {configDoc.wordCount.toLocaleString()} words &nbsp;|&nbsp; 📁 {source?.name}
          </span>
        </div>
        <button class="btn-close" onclick={handleCloseConfigModal} aria-label="Close Modal">✕</button>
      </div>

      <div class="config-modal-body">
        <GenerationConfigFields
          compact={true}
          bind:provider
          bind:model
          bind:apiKey
          bind:persona
          bind:difficulty
          bind:depthMode
          bind:chunkMultiplier
          bind:limit
          bind:targetDeck
          bind:enforceGrounding
        />
      </div>

      <div class="config-modal-footer">
        <button type="button" class="btn btn-secondary" onclick={handleCloseConfigModal}>Cancel</button>
        <button
          type="button"
          class="btn btn-primary"
          disabled={isGenerating}
          onclick={handleSynthesizeSingle}
        >
          {#if isGenerating}
            <span class="spinner-inline"></span> Synthesizing Flashcards...
          {:else}
            ⚡ Start Generation
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .drawer-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    z-index: 999;
    display: flex;
    justify-content: flex-end;
  }

  .drawer-panel {
    width: 680px;
    max-width: 90vw;
    height: 100vh;
    background: #0f172a;
    border-left: 1px solid #334155;
    display: flex;
    flex-direction: column;
    box-shadow: -8px 0 24px rgba(0, 0, 0, 0.5);
    animation: slideLeft 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes slideLeft {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }

  .drawer-header {
    padding: 20px 24px;
    border-bottom: 1px solid #1e293b;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .source-badge-row {
    display: flex;
    gap: 8px;
    margin-bottom: 6px;
  }

  .header-titles h2 {
    margin: 0;
    font-size: 20px;
    color: #f8fafc;
  }

  .source-uri {
    margin: 4px 0 0 0;
    font-size: 12px;
    color: #94a3b8;
    max-width: 480px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .btn-close {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 20px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .btn-close:hover {
    color: white;
    background: rgba(255, 255, 255, 0.1);
  }

  /* Metrics Bar */
  .metrics-bar {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    padding: 14px 24px;
    background: #1e293b;
    border-bottom: 1px solid #334155;
  }

  .metric-item {
    display: flex;
    flex-direction: column;
  }

  .metric-value {
    font-size: 18px;
    font-weight: 700;
    color: #f8fafc;
  }

  .metric-label {
    font-size: 11px;
    color: #94a3b8;
    text-transform: uppercase;
    font-weight: 600;
  }

  /* Search bar */
  .search-bar {
    padding: 14px 24px;
    display: flex;
    gap: 10px;
    border-bottom: 1px solid #1e293b;
  }

  .search-bar input {
    flex: 1;
    background: #0b0f19;
    border: 1px solid #334155;
    color: white;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 13px;
  }

  .search-bar input:focus {
    outline: none;
    border-color: #6366f1;
  }

  .drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: 20px 24px;
  }

  .document-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .document-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 14px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    transition: border-color 0.15s;
  }

  .document-card:hover {
    border-color: #475569;
  }

  .doc-main {
    flex: 1;
    min-width: 0;
  }

  .doc-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
    margin-bottom: 6px;
  }

  .doc-title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #f8fafc;
    line-height: 1.4;
  }

  .doc-badges {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }

  .badge {
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 600;
  }

  .badge.word-count {
    background: rgba(255, 255, 255, 0.05);
    color: #94a3b8;
  }

  .badge.card-count {
    background: rgba(255, 255, 255, 0.05);
    color: #94a3b8;
  }

  .badge.card-count.has-cards {
    background: rgba(99, 102, 241, 0.15);
    color: #818cf8;
    border: 1px solid rgba(99, 102, 241, 0.3);
  }

  .doc-url-link {
    font-size: 12px;
    color: #60a5fa;
    text-decoration: none;
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .doc-url-link:hover {
    text-decoration: underline;
  }

  .doc-local-path {
    font-size: 12px;
    color: #94a3b8;
  }

  .doc-actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
  }

  .btn {
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.15s;
    text-align: center;
  }

  .btn-sm {
    padding: 5px 10px;
    font-size: 11px;
  }

  .btn-primary {
    background: #6366f1;
    color: white;
  }

  .btn-primary:hover {
    background: #4f46e5;
  }

  .btn-secondary {
    background: rgba(255, 255, 255, 0.08);
    color: #e2e8f0;
    border-color: #334155;
  }

  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.15);
  }

  .type-badge {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .type-badge.rss { background: rgba(249, 115, 22, 0.15); color: #fb923c; }
  .type-badge.web { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
  .type-badge.local { background: rgba(168, 85, 247, 0.15); color: #c084fc; }
  .type-badge.sitemap { background: rgba(16, 185, 129, 0.15); color: #34d399; }
  .type-badge.llms-txt { background: rgba(236, 72, 153, 0.15); color: #f472b6; }

  .deck-badge {
    font-size: 11px;
    color: #cbd5e1;
    background: rgba(255, 255, 255, 0.05);
    padding: 2px 6px;
    border-radius: 4px;
  }

  .spinner-inline {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .success-banner {
    margin: 12px 24px 0 24px;
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid rgba(16, 185, 129, 0.3);
    color: #34d399;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12px;
  }

  .error-banner {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;
    padding: 10px;
    border-radius: 6px;
    font-size: 12px;
  }

  .loading-state, .empty-state {
    text-align: center;
    padding: 40px 20px;
    color: #94a3b8;
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 3px solid rgba(255, 255, 255, 0.1);
    border-top-color: #6366f1;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 12px auto;
  }

  .empty-icon {
    font-size: 36px;
    display: block;
    margin-bottom: 8px;
  }

  /* Configuration Modal (Story 11.2) */
  .config-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(4px);
    z-index: 1100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .config-modal {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 12px;
    width: 720px;
    max-width: 95vw;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.8);
    animation: fadeIn 0.15s ease-out;
  }

  .config-modal-header {
    padding: 16px 20px;
    border-bottom: 1px solid #1e293b;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .config-modal-header h3 {
    margin: 0 0 4px 0;
    font-size: 16px;
    color: #f8fafc;
  }

  .doc-meta-subtitle {
    font-size: 12px;
    color: #94a3b8;
  }

  .config-modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
  }

  .config-modal-footer {
    padding: 14px 20px;
    border-top: 1px solid #1e293b;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }
</style>
