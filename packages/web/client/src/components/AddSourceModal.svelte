<script lang="ts">
  import { createSource, uploadSourceFile, syncSource } from '../lib/api';
  import type { DataSource, DataSourceType, SlicingMode, DocumentSlicingOptions } from '../lib/types';
  import { settingsStore, toastStore } from '../stores/index.js';
  import { buildNotionUri, isValidNotionInput } from '../lib/notion-uri.js';
  import UrlListManager from './UrlListManager.svelte';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSourceCreated: (source: DataSource) => void;
    onNavigate?: (tab: string, queryParams?: Record<string, string>) => void;
  }

  let { isOpen, onClose, onSourceCreated, onNavigate }: Props = $props();

  let name = $state('');
  let type = $state<DataSourceType>('rss');
  let uri = $state('');
  let webUrls = $state<string[]>([]);
  let notionRecursive = $state(false);
  let targetDeck = $state('Default');
  let tagsInput = $state('');
  let isSubmitting = $state(false);
  let errorMessage = $state<string | null>(null);

  $effect(() => {
    if (isOpen && !settingsStore.hasLoaded && !settingsStore.loading) {
      settingsStore.loadKeys();
    }
  });

  let selectedLocalFile = $state<{ name: string; size: number; path: string } | null>(null);
  let isUploadingFile = $state(false);
  let isDragging = $state(false);
  let showAdvancedPath = $state(false);
  let fileInputRef = $state<HTMLInputElement | null>(null);

  // Slicing configuration state (Story 17.6)
  let slicingMode = $state<SlicingMode>('outline');
  let pagesPerChunk = $state<number | string>(5);
  let wordsPerChunk = $state<number | string>(1500);
  let minChunkWords = $state<number | string>(200);
  let syncImmediately = $state(true);

  function getSlicingOptions(): DocumentSlicingOptions | undefined {
    if (type !== 'local') return undefined;
    if (slicingMode === 'budget') {
      return {
        mode: 'budget',
        pagesPerChunk: Math.max(1, parseInt(String(pagesPerChunk), 10) || 5),
        wordsPerChunk: Math.max(50, parseInt(String(wordsPerChunk), 10) || 1500),
      };
    }
    if (slicingMode === 'outline') {
      return {
        mode: 'outline',
        minChunkWords: Math.max(10, parseInt(String(minChunkWords), 10) || 200),
        pagesPerChunk: Math.max(1, parseInt(String(pagesPerChunk), 10) || 5),
      };
    }
    if (slicingMode === 'none') {
      return { mode: 'none' };
    }
    return undefined;
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function handleFile(file: File) {
    const lastDot = file.name.lastIndexOf('.');
    const ext = lastDot >= 0 ? file.name.slice(lastDot).toLowerCase() : '';
    if (ext === '.doc') {
      errorMessage = 'Legacy pre-2007 Word (.doc) files are not supported. Please convert to .docx or .pdf before uploading.';
      return;
    }

    const ALLOWED_EXTS = ['.md', '.markdown', '.txt', '.pdf', '.docx'];
    if (!ALLOWED_EXTS.includes(ext)) {
      errorMessage = 'Only .md, .markdown, .txt, .pdf, and .docx files are supported.';
      return;
    }

    isUploadingFile = true;
    errorMessage = null;

    try {
      const result = await uploadSourceFile(file);
      selectedLocalFile = {
        name: result.filename,
        size: result.size,
        path: result.path,
      };
      uri = result.path;

      if (!name.trim()) {
        name = result.filename.replace(/\.(md|markdown|txt|pdf|docx)$/i, '');
      }
    } catch (err: any) {
      errorMessage = err.message || 'Failed to upload local file';
    } finally {
      isUploadingFile = false;
    }
  }

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      handleFile(input.files[0]);
    }
  }

  function handleFileDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    isDragging = true;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
  }

  function clearFile() {
    selectedLocalFile = null;
    if (!showAdvancedPath) {
      uri = '';
    }
    if (fileInputRef) {
      fileInputRef.value = '';
    }
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (isSubmitting) return;

    let finalUri = '';
    if (type === 'web') {
      const cleanUrls = webUrls.map((u) => u.trim()).filter(Boolean);
      if (cleanUrls.length === 0) {
        errorMessage = 'Please add at least one valid web URL.';
        return;
      }
      finalUri = cleanUrls.length === 1 ? cleanUrls[0] : JSON.stringify(cleanUrls);
    } else if (type === 'local') {
      finalUri = uri.trim();
      if (!finalUri) {
        errorMessage = 'Please select a Markdown or text file to upload, or specify a directory path.';
        return;
      }
    } else if (type === 'notion') {
      const rawUri = uri.trim();
      if (!rawUri) {
        errorMessage = 'Please provide a Notion page or database URL.';
        return;
      }
      if (!isValidNotionInput(rawUri)) {
        errorMessage = 'Please provide a valid Notion URL (e.g. notion.so/... or notion.site/...) or a 32-character Notion ID.';
        return;
      }
      finalUri = buildNotionUri(rawUri, { recursive: notionRecursive });
    } else {
      finalUri = uri.trim();
    }

    if (!name.trim() || !finalUri) {
      errorMessage = 'Please provide a source name and target URI / path.';
      return;
    }

    isSubmitting = true;
    errorMessage = null;

    try {
      const tags = Array.from(
        new Set(
          tagsInput
            .split(',')
            .map((t) => t.trim())
            .filter((t) => t.length > 0)
        )
      );

      const source = await createSource({
        name: name.trim(),
        type,
        uri: finalUri,
        targetDeck: targetDeck.trim() || 'Default',
        tags,
      });

      if (syncImmediately) {
        try {
          const slicing = getSlicingOptions();
          const syncResult: any = await syncSource(source.id, slicing ? { slicing } : undefined);
          if (syncResult?.jobId) {
            toastStore.info(`Source added. Sync task #${syncResult.jobId.slice(0, 8)} queued in background.`);
          } else if (syncResult?.newCount !== undefined) {
            toastStore.success(`Source added and synced: ${syncResult.newCount} document(s) ingested.`);
          }
        } catch (syncErr: any) {
          console.warn('Sync failed:', syncErr);
          toastStore.warn(`Source created, but initial sync encountered an issue: ${syncErr.message || 'Sync failed'}`);
        }
      }

      // Reset form
      name = '';
      uri = '';
      webUrls = [];
      targetDeck = 'Default';
      tagsInput = '';
      selectedLocalFile = null;
      isUploadingFile = false;
      isDragging = false;
      showAdvancedPath = false;
      notionRecursive = false;
      slicingMode = 'outline';
      pagesPerChunk = 5;
      wordsPerChunk = 1500;
      minChunkWords = 200;
      syncImmediately = true;
      onSourceCreated(source);
      onClose();
    } catch (err: any) {
      errorMessage = err.message || 'Failed to create data source';
    } finally {
      isSubmitting = false;
    }
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && isOpen) onClose(); }} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={onClose}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-card" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h2>Add Ingestion Source</h2>
        <button class="close-btn" onclick={onClose} aria-label="Close modal">✕</button>
      </div>

      {#if errorMessage}
        <div class="error-banner">⚠️ {errorMessage}</div>
      {/if}

      <form onsubmit={handleSubmit} class="modal-form">
        <div class="form-group">
          <label for="src-type-group">Source Type</label>
          <div id="src-type-group" class="type-selector">
            <label class="type-option" class:selected={type === 'rss'}>
              <input type="radio" name="sourceType" value="rss" bind:group={type} />
              <span>📡 RSS</span>
            </label>
            <label class="type-option" class:selected={type === 'web'}>
              <input type="radio" name="sourceType" value="web" bind:group={type} />
              <span>🌐 Web</span>
            </label>
            <label class="type-option" class:selected={type === 'local'}>
              <input type="radio" name="sourceType" value="local" bind:group={type} />
              <span>📁 Local</span>
            </label>
            <label class="type-option" class:selected={type === 'sitemap'}>
              <input type="radio" name="sourceType" value="sitemap" bind:group={type} />
              <span>🗺️ Sitemap</span>
            </label>
            <label class="type-option" class:selected={type === 'llms-txt'}>
              <input type="radio" name="sourceType" value="llms-txt" bind:group={type} />
              <span>📜 LLMs.txt</span>
            </label>
            <label class="type-option" class:selected={type === 'notion'}>
              <input type="radio" name="sourceType" value="notion" bind:group={type} />
              <span>📓 Notion</span>
            </label>
          </div>
        </div>

        <div class="form-group">
          <label for="src-name">Source Name</label>
          <input
            id="src-name"
            type="text"
            placeholder="e.g. Engineering Architecture Blog"
            bind:value={name}
            required
          />
        </div>

        {#if type === 'web'}
          <div class="form-group">
            <UrlListManager
              urls={webUrls}
              onUrlsChange={(next) => (webUrls = next)}
              disabled={isSubmitting}
            />
          </div>
        {:else if type === 'local'}
          <div class="form-group">
            <label for="src-uri">Local Document File</label>
            {#if selectedLocalFile}
              <div class="file-chip">
                <span class="file-icon">📄</span>
                <div class="file-details">
                  <span class="file-name">{selectedLocalFile.name}</span>
                  <span class="file-size">({formatFileSize(selectedLocalFile.size)})</span>
                </div>
                <button
                  type="button"
                  class="btn-remove-file"
                  onclick={clearFile}
                  aria-label="Remove selected file"
                  disabled={isSubmitting || isUploadingFile}
                >✕</button>
              </div>
            {:else}
              <div
                class="dropzone"
                class:dragging={isDragging}
                class:uploading={isUploadingFile}
                ondrop={handleFileDrop}
                ondragover={handleDragOver}
                ondragleave={handleDragLeave}
                role="region"
                aria-label="File upload dropzone"
              >
                {#if isUploadingFile}
                  <span class="drop-icon spinning">⏳</span>
                  <p class="drop-text">Uploading file...</p>
                {:else}
                  <span class="drop-icon">📁</span>
                  <p class="drop-text">Drag &amp; drop Markdown, Text, PDF, or Word (.docx) file here, or</p>
                  <label class="btn-browse">
                    Browse File...
                    <input
                      bind:this={fileInputRef}
                      type="file"
                      accept=".md,.markdown,.txt,.pdf,.docx"
                      onchange={handleFileSelect}
                      hidden
                    />
                  </label>
                {/if}
              </div>
            {/if}

            <div class="advanced-toggle">
              <button
                type="button"
                class="btn-toggle-advanced"
                onclick={() => (showAdvancedPath = !showAdvancedPath)}
              >
                {showAdvancedPath ? '▼ Hide Advanced Path' : '▶ Advanced: Specify Directory or Absolute Path'}
              </button>
            </div>

            {#if showAdvancedPath}
              <div class="advanced-path-box">
                <input
                  id="src-uri-advanced"
                  type="text"
                  placeholder="C:\path\to\notes or /home/user/docs"
                  bind:value={uri}
                />
                <span class="field-hint">Specify an absolute directory path for recursive scanning or a custom file path.</span>
              </div>
            {/if}

            <!-- Slicing Configuration Controls (Story 17.6) -->
            <div class="slicing-config-card">
              <div class="slicing-card-header">
                <span class="slicing-header-title">📄 Document Slicing Configuration</span>
                <span class="slicing-header-sub">Configure how rich documents (.pdf, .docx, .md) are sliced into subdocuments</span>
              </div>

              <div class="slicing-mode-selector">
                <label class="slicing-mode-option" class:selected={slicingMode === 'outline'}>
                  <input type="radio" name="slicingMode" value="outline" bind:group={slicingMode} />
                  <span class="slicing-mode-label">
                    <strong>Semantic Outline</strong>
                    <small>Slices by headings/chapters &amp; sections</small>
                  </span>
                </label>
                <label class="slicing-mode-option" class:selected={slicingMode === 'budget'}>
                  <input type="radio" name="slicingMode" value="budget" bind:group={slicingMode} />
                  <span class="slicing-mode-label">
                    <strong>Page Budget</strong>
                    <small>Fixed page &amp; word threshold chunks</small>
                  </span>
                </label>
                <label class="slicing-mode-option" class:selected={slicingMode === 'none'}>
                  <input type="radio" name="slicingMode" value="none" bind:group={slicingMode} />
                  <span class="slicing-mode-label">
                    <strong>None</strong>
                    <small>Ingest as a single whole document</small>
                  </span>
                </label>
              </div>

              {#if slicingMode === 'outline'}
                <div class="slicing-thresholds-grid">
                  <div class="threshold-field">
                    <label for="slicing-min-chunk-words">Min Section Words</label>
                    <input
                      id="slicing-min-chunk-words"
                      type="number"
                      min="50"
                      step="50"
                      placeholder="200"
                      bind:value={minChunkWords}
                    />
                    <span class="threshold-hint">Min words to qualify as a standalone section (default: 200).</span>
                  </div>
                  <div class="threshold-field">
                    <label for="slicing-pages-per-chunk">Pages per Chunk (Fallback)</label>
                    <input
                      id="slicing-pages-per-chunk"
                      type="number"
                      min="1"
                      step="1"
                      placeholder="5"
                      bind:value={pagesPerChunk}
                    />
                    <span class="threshold-hint">Page chunk size if headings are absent (default: 5).</span>
                  </div>
                </div>
              {:else if slicingMode === 'budget'}
                <div class="slicing-thresholds-grid">
                  <div class="threshold-field">
                    <label for="slicing-pages-per-chunk-budget">Pages per Chunk</label>
                    <input
                      id="slicing-pages-per-chunk-budget"
                      type="number"
                      min="1"
                      step="1"
                      placeholder="5"
                      bind:value={pagesPerChunk}
                    />
                    <span class="threshold-hint">Fixed page chunk size for PDF documents (default: 5).</span>
                  </div>
                  <div class="threshold-field">
                    <label for="slicing-words-per-chunk">Words per Chunk</label>
                    <input
                      id="slicing-words-per-chunk"
                      type="number"
                      min="100"
                      step="100"
                      placeholder="1500"
                      bind:value={wordsPerChunk}
                    />
                    <span class="threshold-hint">Fixed word chunk size for non-paged documents (default: 1500).</span>
                  </div>
                </div>
              {/if}
            </div>
          </div>
        {:else if type === 'notion'}
          <div class="form-group">
            <div class="notion-header-row">
              <label for="src-uri">Notion Page or Database URL</label>
              <div class="token-status-wrapper">
                {#if settingsStore.loading && !settingsStore.hasLoaded}
                  <span class="token-badge loading" title="Checking Notion token...">
                    ⏳ Checking...
                  </span>
                {:else if settingsStore.keys.notion?.isConfigured}
                  <span class="token-badge active" title="Notion API token configured">
                    ✓ Notion Token Active
                  </span>
                {:else}
                  <span class="token-badge missing" title="Notion token not configured in Settings">
                    ⚠️ Notion Token Missing
                    {#if onNavigate}
                      <button
                        type="button"
                        class="btn-inline-settings"
                        onclick={() => {
                          onClose();
                          onNavigate('settings');
                        }}
                      >
                        (Configure ⚙️)
                      </button>
                    {/if}
                  </span>
                {/if}
              </div>
            </div>
            <input
              id="src-uri"
              type="text"
              placeholder="https://www.notion.so/workspace/Page-Title-32hex or Database URL"
              bind:value={uri}
              required
            />
            <span class="field-hint">
              Paste the URL of any Notion Page or Database. Ensure your Notion integration has been invited to the page/database.
            </span>

            <div class="notion-options-group">
              <label class="checkbox-label">
                <input type="checkbox" bind:checked={notionRecursive} />
                <span class="checkbox-text">
                  <strong>Include subpages as separate documents</strong>
                  <small>Recursively crawls child pages (up to 6 levels deep) and ingests each as a discrete document.</small>
                </span>
              </label>
            </div>
          </div>
        {:else}
          <div class="form-group">
            <label for="src-uri">
              {type === 'rss'
                ? 'RSS / Atom Feed URL'
                : type === 'sitemap'
                ? 'XML Sitemap URL'
                : 'LLMs.txt Catalog URL'}
            </label>
            <input
              id="src-uri"
              type="text"
              placeholder={type === 'rss'
                ? 'https://example.com/feed.xml'
                : type === 'sitemap'
                ? 'https://example.com/sitemap.xml'
                : 'https://example.com/llms-full.txt'}
              bind:value={uri}
              required
            />
          </div>
        {/if}

        <div class="form-row">
          <div class="form-group">
            <label for="src-deck">Target Deck</label>
            <input
              id="src-deck"
              type="text"
              placeholder="Default"
              bind:value={targetDeck}
            />
          </div>

          <div class="form-group">
            <label for="src-tags">Tags (comma-separated)</label>
            <input
              id="src-tags"
              type="text"
              placeholder="tech, distributed-systems"
              bind:value={tagsInput}
            />
          </div>
        </div>

        <div class="form-group sync-immediately-group">
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={syncImmediately} />
            <span class="checkbox-text">
              <strong>Sync immediately upon creation</strong>
              <small>Begins file processing and subdocument slicing right away</small>
            </span>
          </label>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button type="submit" class="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Adding Source...' : 'Add Data Source'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 16px;
    width: 100%;
    max-width: 540px;
    padding: 28px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .modal-header h2 {
    font-size: 20px;
    font-weight: 700;
    color: #f8fafc;
    margin: 0;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 18px;
    cursor: pointer;
  }

  .close-btn:hover {
    color: #f1f5f9;
  }

  .modal-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
  }

  .form-row {
    display: flex;
    gap: 12px;
  }

  label {
    font-size: 13px;
    font-weight: 500;
    color: #cbd5e1;
  }

  input[type="text"] {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 10px 14px;
    color: #f8fafc;
    font-size: 14px;
    outline: none;
    transition: border-color 0.15s;
  }

  input[type="text"]:focus {
    border-color: #6366f1;
  }

  .type-selector {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
    gap: 8px;
  }

  .type-option {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    cursor: pointer;
    font-size: 12px;
    color: #94a3b8;
    transition: all 0.15s ease;
  }

  .type-option input {
    display: none;
  }

  .type-option.selected {
    background: rgba(99, 102, 241, 0.15);
    border-color: #6366f1;
    color: #818cf8;
    font-weight: 600;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 12px;
  }

  .btn {
    padding: 10px 18px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.15s;
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

  .error-banner {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 13px;
    margin-bottom: 12px;
  }

  .dropzone {
    border: 2px dashed #475569;
    border-radius: 12px;
    background: rgba(15, 23, 42, 0.6);
    padding: 24px 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    transition: all 0.2s ease;
  }

  .dropzone.dragging {
    border-color: #6366f1;
    background: rgba(99, 102, 241, 0.1);
  }

  .drop-icon {
    font-size: 28px;
    margin-bottom: 6px;
  }

  .drop-icon.spinning {
    display: inline-block;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .drop-text {
    font-size: 13px;
    color: #94a3b8;
    margin-bottom: 8px;
  }

  .btn-browse {
    background: #334155;
    color: #f1f5f9;
    font-size: 13px;
    font-weight: 600;
    padding: 6px 14px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .btn-browse:hover {
    background: #475569;
  }

  .file-chip {
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(99, 102, 241, 0.12);
    border: 1px solid rgba(99, 102, 241, 0.35);
    border-radius: 8px;
    padding: 10px 14px;
  }

  .file-icon {
    font-size: 18px;
  }

  .file-details {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    overflow: hidden;
  }

  .file-name {
    font-weight: 600;
    font-size: 13px;
    color: #f8fafc;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-size {
    font-size: 12px;
    color: #94a3b8;
  }

  .btn-remove-file {
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    font-size: 16px;
    padding: 2px 6px;
    border-radius: 4px;
    transition: color 0.15s;
  }

  .btn-remove-file:hover {
    color: #ef4444;
  }

  .advanced-toggle {
    margin-top: 6px;
  }

  .btn-toggle-advanced {
    background: transparent;
    border: none;
    color: #818cf8;
    font-size: 12px;
    cursor: pointer;
    padding: 2px 0;
    transition: color 0.15s;
  }

  .btn-toggle-advanced:hover {
    color: #a5b4fc;
    text-decoration: underline;
  }

  .advanced-path-box {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 6px;
  }

  .field-hint {
    font-size: 11px;
    color: #64748b;
  }

  .notion-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  .token-status-wrapper {
    display: flex;
    align-items: center;
  }

  .token-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 9999px;
  }

  .token-badge.active {
    background: rgba(34, 197, 94, 0.15);
    color: #4ade80;
    border: 1px solid rgba(34, 197, 94, 0.3);
  }

  .token-badge.loading {
    background: rgba(148, 163, 184, 0.15);
    color: #94a3b8;
    border: 1px solid rgba(148, 163, 184, 0.3);
  }

  .token-badge.missing {
    background: rgba(234, 179, 8, 0.15);
    color: #fde047;
    border: 1px solid rgba(234, 179, 8, 0.3);
  }

  .btn-inline-settings {
    background: transparent;
    border: none;
    color: #38bdf8;
    cursor: pointer;
    font-size: 11px;
    padding: 0;
    text-decoration: underline;
  }

  .btn-inline-settings:hover {
    color: #7dd3fc;
  }

  .notion-options-group {
    background: rgba(15, 23, 42, 0.5);
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 10px 12px;
    margin-top: 10px;
  }

  .checkbox-label {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    cursor: pointer;
  }

  .checkbox-label input[type="checkbox"] {
    margin-top: 3px;
    cursor: pointer;
  }

  .checkbox-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .checkbox-text strong {
    font-size: 13px;
    color: #f1f5f9;
  }

  .checkbox-text small {
    font-size: 11px;
    color: #94a3b8;
    line-height: 1.4;
  }

  .slicing-config-card {
    margin-top: 14px;
    padding: 14px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .slicing-card-header {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .slicing-header-title {
    font-size: 13px;
    font-weight: 600;
    color: #e2e8f0;
  }

  .slicing-header-sub {
    font-size: 11px;
    color: #94a3b8;
  }

  .slicing-mode-selector {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .slicing-mode-option {
    display: flex;
    align-items: flex-start;
    padding: 10px;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .slicing-mode-option input[type="radio"] {
    margin-top: 2px;
    margin-right: 8px;
  }

  .slicing-mode-option.selected {
    background: rgba(99, 102, 241, 0.15);
    border-color: #6366f1;
  }

  .slicing-mode-label {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .slicing-mode-label strong {
    font-size: 12px;
    color: #f1f5f9;
  }

  .slicing-mode-label small {
    font-size: 10px;
    color: #94a3b8;
    line-height: 1.3;
  }

  .slicing-thresholds-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    padding-top: 4px;
    border-top: 1px dashed #334155;
  }

  .threshold-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .threshold-field label {
    font-size: 11px;
    font-weight: 500;
    color: #cbd5e1;
  }

  .threshold-field input[type="number"] {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 6px;
    padding: 6px 10px;
    color: #f8fafc;
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s;
  }

  .threshold-field input[type="number"]:focus {
    border-color: #6366f1;
  }

  .threshold-hint {
    font-size: 10px;
    color: #64748b;
    line-height: 1.3;
  }

  .sync-immediately-group {
    background: rgba(15, 23, 42, 0.5);
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 10px 12px;
    margin-top: 10px;
  }
</style>