<script lang="ts">
  import { updateSource, uploadSourceFile } from '../lib/api';
  import type { DataSource } from '../lib/types';
  import { settingsStore } from '../stores/index.js';
  import { buildNotionUri, parseNotionUri, isValidNotionInput } from '../lib/notion-uri.js';
  import UrlListManager from './UrlListManager.svelte';

  interface Props {
    isOpen: boolean;
    source: DataSource | null;
    onClose: () => void;
    onSourceUpdated: (source: DataSource) => void;
    onNavigate?: (tab: string, queryParams?: Record<string, string>) => void;
  }

  let { isOpen, source, onClose, onSourceUpdated, onNavigate }: Props = $props();

  let name = $state('');
  let uri = $state('');
  let webUrls = $state<string[]>([]);
  let notionRecursive = $state(false);
  let targetDeck = $state('Default');
  let tagsInput = $state('');
  let isSubmitting = $state(false);
  let errorMessage = $state<string | null>(null);
  let isUploadingFile = $state(false);
  let fileInputRef = $state<HTMLInputElement | null>(null);

  async function handleFileReplace(file: File) {
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!['.md', '.markdown', '.txt'].includes(ext)) {
      errorMessage = 'Only .md, .markdown, and .txt files are supported.';
      return;
    }

    isUploadingFile = true;
    errorMessage = null;

    try {
      const result = await uploadSourceFile(file);
      uri = result.path;
      if (!name.trim()) {
        name = result.filename.replace(/\.(md|markdown|txt)$/i, '');
      }
    } catch (err: any) {
      errorMessage = err.message || 'Failed to upload file';
    } finally {
      isUploadingFile = false;
    }
  }

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      handleFileReplace(input.files[0]);
    }
  }

  $effect(() => {
    if (isOpen && !settingsStore.hasLoaded && !settingsStore.loading) {
      settingsStore.loadKeys();
    }
  });

  $effect(() => {
    if (isOpen && source) {
      name = source.name || '';
      targetDeck = source.targetDeck || 'Default';
      tagsInput = (source.tags || []).join(', ');
      errorMessage = null;

      if (source.type === 'web') {
        const raw = source.uri || '';
        if (raw.trim().startsWith('[') && raw.trim().endsWith(']')) {
          try {
            const parsed = JSON.parse(raw);
            webUrls = Array.isArray(parsed) ? parsed.map((u) => String(u).trim()).filter(Boolean) : [raw.trim()];
          } catch {
            webUrls = raw.split(/[\r\n,]+/).map((u) => u.trim()).filter(Boolean);
          }
        } else if (raw.trim()) {
          webUrls = [raw.trim()];
        } else {
          webUrls = [];
        }
      } else if (source.type === 'notion') {
        const parsed = parseNotionUri(source.uri || '', source.tags || []);
        notionRecursive = parsed.isRecursive;
        uri = parsed.cleanUri;
      } else {
        uri = source.uri || '';
      }
    }
  });

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!source || isSubmitting) return;

    let finalUri = '';
    if (source.type === 'web') {
      const cleanUrls = webUrls.map((u) => u.trim()).filter(Boolean);
      if (cleanUrls.length === 0) {
        errorMessage = 'Please provide at least one valid web URL.';
        return;
      }
      finalUri = cleanUrls.length === 1 ? cleanUrls[0] : JSON.stringify(cleanUrls);
    } else if (source.type === 'notion') {
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
      let tags = Array.from(
        new Set(
          tagsInput
            .split(',')
            .map((t) => t.trim())
            .filter((t) => t.length > 0)
        )
      );

      if (source.type === 'notion' && !notionRecursive) {
        tags = tags.filter((t) => t.toLowerCase() !== 'recursive');
      }

      const updated = await updateSource(source.id, {
        name: name.trim(),
        uri: finalUri,
        targetDeck: targetDeck.trim() || 'Default',
        tags,
      });

      onSourceUpdated(updated);
      onClose();
    } catch (err: any) {
      errorMessage = err.message || 'Failed to update data source';
    } finally {
      isSubmitting = false;
    }
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && isOpen) onClose(); }} />

{#if isOpen && source}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={onClose}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-card" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <div class="header-title">
          <h2>Edit Data Source</h2>
          <span class="type-pill {source.type}">{source.type}</span>
        </div>
        <button class="close-btn" onclick={onClose} aria-label="Close modal">✕</button>
      </div>

      {#if errorMessage}
        <div class="error-banner">⚠️ {errorMessage}</div>
      {/if}

      <form onsubmit={handleSubmit} class="modal-form">
        <div class="form-group">
          <label for="edit-src-name">Source Name</label>
          <input
            id="edit-src-name"
            type="text"
            placeholder="e.g. Engineering Architecture Blog"
            bind:value={name}
            required
          />
        </div>

        {#if source.type === 'web'}
          <div class="form-group">
            <UrlListManager
              urls={webUrls}
              onUrlsChange={(next) => (webUrls = next)}
              disabled={isSubmitting}
            />
          </div>
        {:else if source.type === 'local'}
          <div class="form-group">
            <label for="edit-src-uri">Local File / Directory Path</label>
            <div class="local-path-input-group">
              <input
                id="edit-src-uri"
                type="text"
                bind:value={uri}
                required
              />
              <label class="btn-browse-replace">
                {isUploadingFile ? 'Uploading...' : '📁 Replace File...'}
                <input
                  bind:this={fileInputRef}
                  type="file"
                  accept=".md,.markdown,.txt"
                  onchange={handleFileSelect}
                  disabled={isSubmitting || isUploadingFile}
                  hidden
                />
              </label>
            </div>
            <span class="field-hint">Specify an absolute directory path, custom file path, or click Replace File to upload a new document.</span>
          </div>
        {:else if source.type === 'notion'}
          <div class="form-group">
            <div class="notion-header-row">
              <label for="edit-src-uri">Notion Page or Database URL</label>
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
              id="edit-src-uri"
              type="text"
              placeholder="https://www.notion.so/workspace/Page-Title-32hex or Database URL"
              bind:value={uri}
              required
            />
            <span class="field-hint">Specify a Notion Page URL, Database URL, or 32-character Notion UUID.</span>

            <div class="notion-options-group">
              <label class="checkbox-label">
                <input type="checkbox" bind:checked={notionRecursive} />
                <span class="checkbox-text">
                  <strong>Include subpages as separate documents</strong>
                  <small>Recursively crawls child pages (up to 3 levels deep) and ingests each as a discrete document.</small>
                </span>
              </label>
            </div>
          </div>
        {:else}
          <div class="form-group">
            <label for="edit-src-uri">
              {source.type === 'rss'
                ? 'RSS / Atom Feed URL'
                : source.type === 'sitemap'
                ? 'XML Sitemap URL'
                : 'LLMs.txt Catalog URL'}
            </label>
            <input
              id="edit-src-uri"
              type="text"
              bind:value={uri}
              required
            />
          </div>
        {/if}

        <div class="form-row">
          <div class="form-group">
            <label for="edit-src-deck">Target Deck</label>
            <input
              id="edit-src-deck"
              type="text"
              placeholder="Default"
              bind:value={targetDeck}
            />
          </div>

          <div class="form-group">
            <label for="edit-src-tags">Tags (comma-separated)</label>
            <input
              id="edit-src-tags"
              type="text"
              placeholder="tech, distributed-systems"
              bind:value={tagsInput}
            />
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button type="submit" class="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving Changes...' : 'Save Changes'}
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

  .header-title {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .modal-header h2 {
    font-size: 20px;
    font-weight: 700;
    color: #f8fafc;
    margin: 0;
  }

  .type-pill {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 2px 7px;
    border-radius: 4px;
  }

  .type-pill.web {
    background: rgba(59, 130, 246, 0.15);
    color: #60a5fa;
    border: 1px solid rgba(59, 130, 246, 0.3);
  }

  .type-pill.rss {
    background: rgba(249, 115, 22, 0.15);
    color: #fb923c;
    border: 1px solid rgba(249, 115, 22, 0.3);
  }

  .type-pill.local {
    background: rgba(168, 85, 247, 0.15);
    color: #c084fc;
    border: 1px solid rgba(168, 85, 247, 0.3);
  }

  .type-pill.sitemap {
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.3);
  }

  .type-pill.llms-txt {
    background: rgba(236, 72, 153, 0.15);
    color: #f472b6;
    border: 1px solid rgba(236, 72, 153, 0.3);
  }

  .type-pill.notion {
    background: rgba(14, 165, 233, 0.15);
    color: #38bdf8;
    border: 1px solid rgba(14, 165, 233, 0.3);
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

  .local-path-input-group {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .local-path-input-group input {
    flex: 1;
  }

  .btn-browse-replace {
    background: #334155;
    color: #f1f5f9;
    font-size: 13px;
    font-weight: 600;
    padding: 10px 14px;
    border-radius: 8px;
    cursor: pointer;
    white-space: nowrap;
    border: 1px solid #475569;
    transition: all 0.15s ease;
  }

  .btn-browse-replace:hover {
    background: #475569;
    border-color: #6366f1;
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
</style>
